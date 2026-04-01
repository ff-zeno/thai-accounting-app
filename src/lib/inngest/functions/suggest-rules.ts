import { inngest } from "../client";
import { db } from "@/lib/db";
import {
  reconciliationMatches,
  transactions,
  documents,
} from "@/lib/db/schema";
import { and, eq, isNull, gte } from "drizzle-orm";
import {
  createRule,
  findSimilarRule,
  type RuleCondition,
  type RuleAction,
} from "@/lib/db/queries/reconciliation-rules";

export const suggestReconciliationRules = inngest.createFunction(
  {
    id: "suggest-reconciliation-rules",
    debounce: {
      key: "event.data.orgId + '-' + event.data.userId",
      period: "10m",
    },
    retries: 2,
  },
  { event: "reconciliation/manual-match-session" },
  async ({ event, step }) => {
    const { orgId } = event.data;

    // Step 1: Collect recent manual matches (last 30 min, widened for debounce delay)
    const recentMatches = await step.run("collect-recent-matches", async () => {
      const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000);

      const rows = await db
        .select({
          matchId: reconciliationMatches.id,
          transactionId: reconciliationMatches.transactionId,
          documentId: reconciliationMatches.documentId,
          matchedAt: reconciliationMatches.matchedAt,
          counterparty: transactions.counterparty,
          vendorId: documents.vendorId,
          bankAccountId: transactions.bankAccountId,
          transactionType: transactions.type,
        })
        .from(reconciliationMatches)
        .innerJoin(
          transactions,
          eq(reconciliationMatches.transactionId, transactions.id),
        )
        .innerJoin(
          documents,
          eq(reconciliationMatches.documentId, documents.id),
        )
        .where(
          and(
            eq(reconciliationMatches.orgId, orgId),
            eq(reconciliationMatches.matchedBy, "manual"),
            isNull(reconciliationMatches.deletedAt),
            gte(reconciliationMatches.createdAt, thirtyMinAgo),
          ),
        );

      return rows;
    });

    if (recentMatches.length < 3) {
      return { status: "skipped", reason: "fewer than 3 recent manual matches" };
    }

    // Step 2: Group by counterparty → vendor pattern
    const patterns = await step.run("analyze-patterns", () => {
      const groups = new Map<
        string,
        {
          counterparty: string;
          vendorId: string;
          count: number;
          bankAccounts: Set<string>;
          txnTypes: Set<string>;
        }
      >();

      for (const m of recentMatches) {
        if (!m.counterparty || !m.vendorId) continue;

        const key = m.counterparty.toLowerCase().trim();
        const existing = groups.get(key);

        if (existing) {
          // Only count if same vendor (consistent pattern)
          if (existing.vendorId === m.vendorId) {
            existing.count++;
            if (m.bankAccountId) existing.bankAccounts.add(m.bankAccountId);
            if (m.transactionType) existing.txnTypes.add(m.transactionType);
          }
        } else {
          groups.set(key, {
            counterparty: m.counterparty,
            vendorId: m.vendorId,
            count: 1,
            bankAccounts: new Set(m.bankAccountId ? [m.bankAccountId] : []),
            txnTypes: new Set(m.transactionType ? [m.transactionType] : []),
          });
        }
      }

      // Only return patterns with 3+ occurrences
      return Array.from(groups.values())
        .filter((g) => g.count >= 3)
        .map((g) => ({
          counterparty: g.counterparty,
          vendorId: g.vendorId,
          count: g.count,
          bankAccounts: Array.from(g.bankAccounts),
          txnTypes: Array.from(g.txnTypes),
        }));
    });

    if (patterns.length === 0) {
      return { status: "skipped", reason: "no patterns with 3+ occurrences" };
    }

    // Step 3: Create draft rules (dedup against existing)
    const created = await step.run("create-draft-rules", async () => {
      const results: string[] = [];

      for (const pattern of patterns) {
        // Build conditions
        const conditions: RuleCondition[] = [
          {
            field: "counterparty",
            operator: "contains",
            value: pattern.counterparty,
          },
        ];

        // Add bank account condition if all matches share the same one
        if (pattern.bankAccounts.length === 1) {
          conditions.push({
            field: "bank_account",
            operator: "equals",
            value: pattern.bankAccounts[0],
          });
        }

        // Add transaction type condition if all matches share the same one
        if (pattern.txnTypes.length === 1) {
          conditions.push({
            field: "type",
            operator: "equals",
            value: pattern.txnTypes[0],
          });
        }

        // Dedup check against existing rules (active + inactive)
        const existing = await findSimilarRule(orgId, conditions);
        if (existing) continue;

        const actions: RuleAction[] = [
          { type: "auto_match", value: pattern.vendorId },
        ];

        const ruleId = await createRule({
          orgId,
          name: `Auto-suggested: ${pattern.counterparty}`,
          description: `Auto-suggested from ${pattern.count} manual matches`,
          conditions,
          actions,
          isAutoSuggested: true,
        });

        results.push(ruleId);
      }

      return results;
    });

    return {
      status: "completed",
      patternsFound: patterns.length,
      rulesCreated: created.length,
      ruleIds: created,
    };
  },
);
