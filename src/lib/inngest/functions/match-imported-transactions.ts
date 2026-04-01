import { inngest } from "../client";
import { db } from "@/lib/db";
import { transactions } from "@/lib/db/schema";
import { and, eq, isNull, inArray } from "drizzle-orm";

/**
 * Transaction-first matching on bank statement import.
 * V1: lightweight check — if any imported transactions remain unmatched,
 * trigger the AI batch processor immediately (don't wait for hourly cron).
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

    // Step 2: Trigger AI batch for this org
    await step.sendEvent("trigger-ai-batch", {
      name: "reconciliation/ai-batch-requested",
      data: { orgId, trigger: "import" },
    });

    return { status: "ai-batch-triggered", unmatchedCount };
  },
);
