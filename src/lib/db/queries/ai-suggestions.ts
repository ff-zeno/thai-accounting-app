import { and, eq, isNull, desc, count, sql } from "drizzle-orm";
import { db } from "../index";
import { aiMatchSuggestions } from "../schema";
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
  reviewedBy: string
) {
  await db
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
  rejectionReason?: string
) {
  await db
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
