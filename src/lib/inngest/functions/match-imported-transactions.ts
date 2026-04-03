import { inngest } from "../client";
import { db } from "@/lib/db";
import { transactions, documents, vendors, payments } from "@/lib/db/schema";
import { and, eq, isNull, inArray, desc } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { findMatches, type MatchResult } from "@/lib/reconciliation/matcher";
import {
  createMatch,
  recomputeTransactionStatus,
} from "@/lib/db/queries/reconciliation";
import { reconciliationMatches } from "@/lib/db/schema";

/**
 * Transaction-first matching on bank statement import.
 * Step 1: Try deterministic matching (7-layer cascade) against confirmed documents.
 * Step 2: If any remain unmatched, trigger AI batch.
 */
export const matchImportedTransactions = inngest.createFunction(
  {
    id: "match-imported-transactions",
    concurrency: [{ scope: "fn", key: "event.data.orgId", limit: 1 }],
    retries: 2,
  },
  { event: "transactions/imported" },
  async ({ event, step }) => {
    const { orgId, transactionIds } = event.data;

    if (!transactionIds?.length) {
      return { status: "no-transactions" };
    }

    // Step 1: Check which transactions are still unmatched
    const unmatchedCount = await step.run("check-unmatched", async () => {
      const unmatched = await db
        .select({ id: transactions.id })
        .from(transactions)
        .where(
          and(
            eq(transactions.orgId, orgId),
            eq(transactions.reconciliationStatus, "unmatched"),
            isNull(transactions.deletedAt),
            inArray(transactions.id, transactionIds),
          ),
        );

      return unmatched.length;
    });

    if (unmatchedCount === 0) {
      return { status: "all-matched" };
    }

    // Step 2: Try deterministic matching — get confirmed docs without matches
    const deterministicResults = await step.run("deterministic-matching", async () => {
      // Get confirmed documents without active matches
      const matchedDocIds = db
        .selectDistinct({ documentId: reconciliationMatches.documentId })
        .from(reconciliationMatches)
        .where(
          and(
            eq(reconciliationMatches.orgId, orgId),
            isNull(reconciliationMatches.deletedAt),
          ),
        );

      const unmatchedDocs = await db
        .select({
          id: documents.id,
          documentNumber: documents.documentNumber,
          issueDate: documents.issueDate,
          totalAmount: documents.totalAmount,
          direction: documents.direction,
          vendorId: documents.vendorId,
          vendorName: vendors.name,
          vendorNameTh: vendors.nameTh,
          vendorTaxId: vendors.taxId,
          netAmountPaid: payments.netAmountPaid,
          paymentDate: payments.paymentDate,
          paymentId: payments.id,
        })
        .from(documents)
        .leftJoin(vendors, eq(documents.vendorId, vendors.id))
        .leftJoin(
          payments,
          and(
            eq(payments.documentId, documents.id),
            eq(payments.orgId, orgId),
            isNull(payments.deletedAt),
          ),
        )
        .where(
          and(
            eq(documents.orgId, orgId),
            eq(documents.status, "confirmed"),
            isNull(documents.deletedAt),
            sql`${documents.id} NOT IN (${matchedDocIds})`,
          ),
        )
        .orderBy(desc(documents.issueDate))
        .limit(50);

      let matchesCreated = 0;

      for (const doc of unmatchedDocs) {
        const netAmount = doc.netAmountPaid ?? doc.totalAmount;
        const paymentDate = doc.paymentDate ?? doc.issueDate;
        if (!netAmount || !paymentDate) continue;

        const result: MatchResult = await findMatches({
          orgId,
          netAmountPaid: netAmount,
          paymentDate,
          documentId: doc.id,
          vendorId: doc.vendorId,
          vendorName: doc.vendorName,
          vendorNameTh: doc.vendorNameTh ?? null,
          vendorTaxId: doc.vendorTaxId ?? null,
          documentNumber: doc.documentNumber,
          direction: doc.direction as "expense" | "income",
          bankAccountId: null,
        });

        if (
          result.type === "exact" ||
          result.type === "reference" ||
          result.type === "rule" ||
          result.type === "multi_signal" ||
          result.type === "pattern"
        ) {
          const matchedBy =
            result.type === "pattern" ? ("pattern" as const) :
            result.type === "rule" ? ("rule" as const) :
            ("auto" as const);

          await createMatch({
            orgId,
            transactionId: result.transactionId,
            documentId: doc.id,
            paymentId: doc.paymentId ?? undefined,
            matchedAmount: netAmount,
            matchType: result.type as "exact" | "reference" | "rule" | "multi_signal" | "pattern",
            confidence: result.confidence,
            matchedBy,
            matchMetadata: result.metadata,
          });

          await recomputeTransactionStatus(orgId, result.transactionId);
          matchesCreated++;
        }

        if (result.type === "split") {
          for (const txn of result.transactions) {
            await createMatch({
              orgId,
              transactionId: txn.id,
              documentId: doc.id,
              paymentId: doc.paymentId ?? undefined,
              matchedAmount: txn.amount,
              matchType: "exact",
              confidence: result.confidence,
              matchedBy: "auto",
              matchMetadata: result.metadata,
            });
            await recomputeTransactionStatus(orgId, txn.id);
          }
          matchesCreated += result.transactions.length;
        }
      }

      return matchesCreated;
    });

    // Step 3: Check if any imported transactions are still unmatched
    const remainingUnmatched = await step.run("check-remaining", async () => {
      const unmatched = await db
        .select({ id: transactions.id })
        .from(transactions)
        .where(
          and(
            eq(transactions.orgId, orgId),
            eq(transactions.reconciliationStatus, "unmatched"),
            isNull(transactions.deletedAt),
            inArray(transactions.id, transactionIds),
          ),
        );
      return unmatched.length;
    });

    if (remainingUnmatched === 0) {
      return {
        status: "all-matched-deterministic",
        deterministicMatches: deterministicResults,
      };
    }

    // Step 4: Trigger AI batch for remaining unmatched
    await step.sendEvent("trigger-ai-batch", {
      name: "reconciliation/ai-batch-requested",
      data: { orgId, trigger: "import" },
    });

    return {
      status: "ai-batch-triggered",
      deterministicMatches: deterministicResults,
      remainingUnmatched,
    };
  },
);
