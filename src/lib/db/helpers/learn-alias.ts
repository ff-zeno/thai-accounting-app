import { and, eq, inArray } from "drizzle-orm";
import { db } from "../index";
import { documents, transactions } from "../schema";
import { upsertAlias } from "../queries/vendor-aliases";

/**
 * Non-blocking alias learning from a match.
 * Looks up the document's vendor and the transactions' counterparties,
 * then upserts an alias for each pair. Batches the transaction lookup
 * to avoid N+1.
 *
 * Failures are logged but never thrown — this is fire-and-forget.
 */
export async function learnAliasFromMatch(
  orgId: string,
  transactionIds: string[],
  documentId: string,
  source: string,
): Promise<void> {
  try {
    const [doc] = await db
      .select({ vendorId: documents.vendorId })
      .from(documents)
      .where(and(eq(documents.id, documentId), eq(documents.orgId, orgId)))
      .limit(1);

    if (!doc?.vendorId) return;

    // Batch lookup — one query for all transactions
    const txns = await db
      .select({
        id: transactions.id,
        counterparty: transactions.counterparty,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.orgId, orgId),
          inArray(transactions.id, transactionIds),
        ),
      );

    for (const txn of txns) {
      if (txn.counterparty) {
        await upsertAlias({
          orgId,
          vendorId: doc.vendorId,
          aliasText: txn.counterparty,
          source,
        });
      }
    }
  } catch (err) {
    console.error(`[learn-alias] Alias learning failed (${source}):`, err);
  }
}
