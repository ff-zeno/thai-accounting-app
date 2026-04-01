import { and, eq, isNull, desc, count, gte, max, sql } from "drizzle-orm";
import { db, type DbConnection } from "../index";
import { aiMatchSuggestions, transactions, documents, vendors } from "../schema";
import { orgScope } from "../helpers/org-scope";

// ---------------------------------------------------------------------------
// Create AI suggestion
// ---------------------------------------------------------------------------

export async function createAiSuggestion(data: {
  orgId: string;
  transactionId: string;
  documentId: string;
  paymentId?: string;
  suggestedAmount?: string;
  confidence: string;
  explanation?: string;
  aiModelUsed?: string;
  aiCostUsd?: string;
  batchId?: string;
}): Promise<string> {
  const [row] = await db
    .insert(aiMatchSuggestions)
    .values({
      orgId: data.orgId,
      transactionId: data.transactionId,
      documentId: data.documentId,
      paymentId: data.paymentId,
      suggestedAmount: data.suggestedAmount,
      confidence: data.confidence,
      explanation: data.explanation,
      aiModelUsed: data.aiModelUsed,
      aiCostUsd: data.aiCostUsd,
      batchId: data.batchId,
    })
    .onConflictDoNothing()
    .returning({ id: aiMatchSuggestions.id });

  return row?.id ?? "";
}

// ---------------------------------------------------------------------------
// Get pending suggestions for org
// ---------------------------------------------------------------------------

export async function getPendingSuggestions(orgId: string, limit = 50) {
  return db
    .select()
    .from(aiMatchSuggestions)
    .where(
      and(
        ...orgScope(aiMatchSuggestions, orgId),
        eq(aiMatchSuggestions.status, "pending")
      )
    )
    .orderBy(desc(aiMatchSuggestions.createdAt))
    .limit(limit);
}

// ---------------------------------------------------------------------------
// Approve suggestion
// ---------------------------------------------------------------------------

export async function approveSuggestion(
  orgId: string,
  suggestionId: string,
  reviewedBy: string,
  tx?: DbConnection,
) {
  const conn = tx ?? db;
  await conn
    .update(aiMatchSuggestions)
    .set({
      status: "approved",
      reviewedAt: new Date(),
      reviewedBy,
    })
    .where(
      and(
        eq(aiMatchSuggestions.id, suggestionId),
        eq(aiMatchSuggestions.orgId, orgId),
        isNull(aiMatchSuggestions.deletedAt)
      )
    );
}

// ---------------------------------------------------------------------------
// Reject suggestion
// ---------------------------------------------------------------------------

export async function rejectSuggestion(
  orgId: string,
  suggestionId: string,
  reviewedBy: string,
  rejectionReason?: string,
  tx?: DbConnection,
) {
  const conn = tx ?? db;
  await conn
    .update(aiMatchSuggestions)
    .set({
      status: "rejected",
      reviewedAt: new Date(),
      reviewedBy,
      rejectionReason,
    })
    .where(
      and(
        eq(aiMatchSuggestions.id, suggestionId),
        eq(aiMatchSuggestions.orgId, orgId),
        isNull(aiMatchSuggestions.deletedAt)
      )
    );
}

// ---------------------------------------------------------------------------
// Find suggestion by transaction + document (for linking to match)
// ---------------------------------------------------------------------------

export async function findSuggestionByPair(
  orgId: string,
  transactionId: string,
  documentId: string,
  tx?: DbConnection,
) {
  const conn = tx ?? db;
  const [row] = await conn
    .select()
    .from(aiMatchSuggestions)
    .where(
      and(
        eq(aiMatchSuggestions.orgId, orgId),
        eq(aiMatchSuggestions.transactionId, transactionId),
        eq(aiMatchSuggestions.documentId, documentId),
        eq(aiMatchSuggestions.status, "pending"),
        isNull(aiMatchSuggestions.deletedAt),
      ),
    )
    .limit(1);
  return row ?? null;
}

// ---------------------------------------------------------------------------
// Get suggestion counts by status
// ---------------------------------------------------------------------------

export async function getSuggestionCounts(orgId: string) {
  const rows = await db
    .select({
      status: aiMatchSuggestions.status,
      cnt: count(),
    })
    .from(aiMatchSuggestions)
    .where(and(...orgScope(aiMatchSuggestions, orgId)))
    .groupBy(aiMatchSuggestions.status);

  const counts = { pending: 0, approved: 0, rejected: 0, total: 0 };
  for (const row of rows) {
    const n = Number(row.cnt);
    if (row.status === "pending") counts.pending = n;
    else if (row.status === "approved") counts.approved = n;
    else if (row.status === "rejected") counts.rejected = n;
    counts.total += n;
  }
  return counts;
}

// ---------------------------------------------------------------------------
// Get pending suggestions with full detail (for AI review page)
// ---------------------------------------------------------------------------

export async function getPendingSuggestionsWithDetails(
  orgId: string,
  limit = 50,
) {
  return db
    .select({
      id: aiMatchSuggestions.id,
      transactionId: aiMatchSuggestions.transactionId,
      documentId: aiMatchSuggestions.documentId,
      suggestedAmount: aiMatchSuggestions.suggestedAmount,
      confidence: aiMatchSuggestions.confidence,
      explanation: aiMatchSuggestions.explanation,
      aiModelUsed: aiMatchSuggestions.aiModelUsed,
      createdAt: aiMatchSuggestions.createdAt,
      // Transaction detail
      txnDate: transactions.date,
      txnAmount: transactions.amount,
      txnCounterparty: transactions.counterparty,
      txnDescription: transactions.description,
      // Document detail
      docNumber: documents.documentNumber,
      docAmount: documents.totalAmount,
      vendorName: vendors.name,
    })
    .from(aiMatchSuggestions)
    .innerJoin(transactions, eq(aiMatchSuggestions.transactionId, transactions.id))
    .innerJoin(documents, eq(aiMatchSuggestions.documentId, documents.id))
    .leftJoin(vendors, eq(documents.vendorId, vendors.id))
    .where(
      and(
        ...orgScope(aiMatchSuggestions, orgId),
        eq(aiMatchSuggestions.status, "pending"),
      ),
    )
    .orderBy(desc(aiMatchSuggestions.confidence))
    .limit(limit);
}

// ---------------------------------------------------------------------------
// Bulk approve high-confidence suggestions
// ---------------------------------------------------------------------------

export async function bulkApproveHighConfidence(
  orgId: string,
  minConfidence: string,
  reviewedBy: string,
) {
  const result = await db
    .update(aiMatchSuggestions)
    .set({
      status: "approved",
      reviewedAt: new Date(),
      reviewedBy,
    })
    .where(
      and(
        eq(aiMatchSuggestions.orgId, orgId),
        eq(aiMatchSuggestions.status, "pending"),
        isNull(aiMatchSuggestions.deletedAt),
        gte(aiMatchSuggestions.confidence, minConfidence),
      ),
    )
    .returning({ id: aiMatchSuggestions.id });

  return result.length;
}

// ---------------------------------------------------------------------------
// Get last batch timestamp (for rate limiting)
// ---------------------------------------------------------------------------

export async function getLastBatchTimestamp(orgId: string): Promise<Date | null> {
  const [row] = await db
    .select({
      lastCreated: max(aiMatchSuggestions.createdAt),
    })
    .from(aiMatchSuggestions)
    .where(and(...orgScope(aiMatchSuggestions, orgId)));

  return row?.lastCreated ?? null;
}

// ---------------------------------------------------------------------------
// Get reconciliation AI cost aggregated by month
// ---------------------------------------------------------------------------

export async function getReconciliationAiCostByMonth(orgId: string) {
  return db
    .select({
      month: sql<string>`to_char(${aiMatchSuggestions.createdAt}, 'YYYY-MM')`,
      totalCost: sql<string>`coalesce(sum(${aiMatchSuggestions.aiCostUsd}), 0)`,
      suggestionCount: count(),
    })
    .from(aiMatchSuggestions)
    .where(and(...orgScope(aiMatchSuggestions, orgId)))
    .groupBy(sql`to_char(${aiMatchSuggestions.createdAt}, 'YYYY-MM')`)
    .orderBy(sql`to_char(${aiMatchSuggestions.createdAt}, 'YYYY-MM') desc`);
}
