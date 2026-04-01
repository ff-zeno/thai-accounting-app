import { inngest } from "../client";
import { db } from "@/lib/db";
import { transactions, orgAiSettings, aiMatchSuggestions } from "@/lib/db/schema";
import { and, eq, isNull, sql } from "drizzle-orm";

/**
 * Hourly cron dispatcher: collects orgs with unmatched transactions and
 * remaining AI reconciliation budget, then fans out one event per org
 * to the per-org batch processor.
 */
export const aiReconciliationDispatcher = inngest.createFunction(
  {
    id: "ai-reconciliation-dispatcher",
    retries: 2,
  },
  { cron: "0 * * * *" }, // every hour
  async ({ step }) => {
    // Step 1: Find orgs with unmatched transactions and budget
    const eligibleOrgs = await step.run("collect-eligible-orgs", async () => {
      // Get orgs that have unmatched, non-petty-cash transactions
      const orgsWithUnmatched = await db
        .selectDistinct({ orgId: transactions.orgId })
        .from(transactions)
        .where(
          and(
            eq(transactions.reconciliationStatus, "unmatched"),
            eq(transactions.isPettyCash, false),
            isNull(transactions.deletedAt),
          ),
        );

      const orgIds: string[] = [];

      for (const { orgId } of orgsWithUnmatched) {
        // Check budget: get reconciliation budget from settings (default $1.00)
        const [settings] = await db
          .select({
            budget: orgAiSettings.reconciliationBudgetUsd,
          })
          .from(orgAiSettings)
          .where(eq(orgAiSettings.orgId, orgId))
          .limit(1);

        const budgetUsd = settings?.budget
          ? parseFloat(settings.budget)
          : 1.0;

        if (budgetUsd <= 0) continue;

        // Check current month spend
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const [costRow] = await db
          .select({
            spent: sql<string>`coalesce(sum(${aiMatchSuggestions.aiCostUsd}), 0)`,
          })
          .from(aiMatchSuggestions)
          .where(
            and(
              eq(aiMatchSuggestions.orgId, orgId),
              sql`${aiMatchSuggestions.createdAt} >= ${monthStart}`,
            ),
          );

        const spentUsd = parseFloat(costRow?.spent ?? "0");
        if (spentUsd < budgetUsd) {
          orgIds.push(orgId);
        }
      }

      return orgIds;
    });

    if (eligibleOrgs.length === 0) {
      return { status: "no-eligible-orgs", dispatched: 0 };
    }

    // Step 2: Fan out one event per eligible org
    await step.sendEvent(
      "dispatch-per-org",
      eligibleOrgs.map((orgId) => ({
        name: "reconciliation/ai-batch-requested" as const,
        data: { orgId, trigger: "cron" as const },
      })),
    );

    return { status: "dispatched", dispatched: eligibleOrgs.length };
  },
);
