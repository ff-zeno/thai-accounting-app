"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getVerifiedOrgId } from "@/lib/utils/org-context";
import { getCurrentUserId } from "@/lib/utils/auth";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { aiMatchSuggestions } from "@/lib/db/schema";
import {
  getUnmatchedTransactions,
  getUnmatchedDocuments,
  createMatch,
  getMatchById,
  softDeleteMatch,
  recomputeTransactionStatus,
  updateMatchConfirmation,
  verifyTransactionOwnership,
  verifyDocumentOwnership,
} from "@/lib/db/queries/reconciliation";
import {
  approveSuggestion,
  rejectSuggestion,
  findSuggestionByPair,
  getSuggestionById,
  getPendingSuggestions,
} from "@/lib/db/queries/ai-suggestions";
import { getPaymentsByDocument } from "@/lib/db/queries/payments";
import { learnAliasFromMatch } from "@/lib/db/helpers/learn-alias";
import { inngest } from "@/lib/inngest/client";

// ---------------------------------------------------------------------------
// Get unmatched items (existing)
// ---------------------------------------------------------------------------

export async function getUnmatchedItemsAction() {
  const orgId = await getVerifiedOrgId();
  if (!orgId) return { transactions: [], documents: [] };

  const [txns, docs] = await Promise.all([
    getUnmatchedTransactions(orgId, 100),
    getUnmatchedDocuments(orgId, 100),
  ]);

  return { transactions: txns, documents: docs };
}

// ---------------------------------------------------------------------------
// Create manual match (rewired with transaction + alias learning)
// ---------------------------------------------------------------------------

const manualMatchSchema = z
  .object({
    transactionIds: z.array(z.string().uuid()).min(1, "Select at least one transaction"),
    documentId: z.string().uuid("Invalid document ID"),
    amounts: z.record(
      z.string().uuid(),
      z.string().regex(/^\d+(\.\d{1,2})?$/, "Invalid amount format"),
    ),
  })
  .refine(
    (d) => d.transactionIds.every((id) => id in d.amounts),
    { message: "Missing amount for one or more transactions" },
  );

export async function createManualMatchAction(data: {
  transactionIds: string[];
  documentId: string;
  amounts: Record<string, string>;
}): Promise<{ success: true } | { error: string }> {
  const orgId = await getVerifiedOrgId();
  if (!orgId) return { error: "No organization selected" };
  const actorId = (await getCurrentUserId()) ?? undefined;

  const parsed = manualMatchSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  // Verify all IDs belong to this org
  const [txnOwned, docOwned] = await Promise.all([
    verifyTransactionOwnership(orgId, data.transactionIds),
    verifyDocumentOwnership(orgId, data.documentId),
  ]);
  if (!txnOwned) return { error: "Transaction not found" };
  if (!docOwned) return { error: "Document not found" };

  const payments = await getPaymentsByDocument(orgId, data.documentId);
  const paymentId = payments.length > 0 ? payments[0].id : null;

  // Wrap all match creation in a transaction
  await db.transaction(async (tx) => {
    for (const txnId of data.transactionIds) {
      const matchedAmount = data.amounts[txnId];
      if (!matchedAmount) continue;

      await createMatch(
        {
          orgId,
          transactionId: txnId,
          documentId: data.documentId,
          paymentId,
          matchedAmount,
          matchType: "manual",
          confidence: "1.00",
          matchedBy: "manual",
        },
        tx,
      );

      await recomputeTransactionStatus(orgId, txnId, tx);
    }
  });

  // Non-blocking alias learning (batched)
  await learnAliasFromMatch(orgId, data.transactionIds, data.documentId, "manual_match");

  // Fire Inngest event for auto-rule suggestion (non-blocking)
  try {
    await inngest.send({
      name: "reconciliation/manual-match-session",
      data: { orgId, userId: actorId ?? "unknown" },
    });
  } catch (err) {
    console.error("[manual-match] Inngest event failed (non-blocking):", err);
  }

  revalidatePath("/reconciliation");
  revalidatePath("/reconciliation/review");
  return { success: true };
}

// ---------------------------------------------------------------------------
// Reject and rematch (7a)
// ---------------------------------------------------------------------------

const numericAmount = z.string().regex(/^\d+(\.\d{1,2})?$/, "Must be a valid amount");

const rejectSchema = z.object({
  matchId: z.string().uuid(),
  newTransactionId: z.string().uuid(),
  newMatchedAmount: numericAmount,
  rejectionReason: z.string().max(500).optional(),
});

export async function rejectAndRematchAction(
  input: z.infer<typeof rejectSchema>,
): Promise<{ success: true } | { error: string }> {
  const orgId = await getVerifiedOrgId();
  if (!orgId) return { error: "No organization selected" };
  const actorId = (await getCurrentUserId()) ?? undefined;

  const parsed = rejectSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { matchId, newTransactionId, newMatchedAmount, rejectionReason } = parsed.data;

  // Verify match exists
  const oldMatch = await getMatchById(orgId, matchId);
  if (!oldMatch) return { error: "Match not found" };

  // Verify new transaction belongs to this org
  const txnOwned = await verifyTransactionOwnership(orgId, [newTransactionId]);
  if (!txnOwned) return { error: "Transaction not found" };

  const payments = await getPaymentsByDocument(orgId, oldMatch.documentId);
  const paymentId = payments.length > 0 ? payments[0].id : null;

  // Steps 1-5 inside transaction: soft-delete old, reject AI suggestion, create new match
  await db.transaction(async (tx) => {
    // 1. Soft-delete old match
    await softDeleteMatch(orgId, matchId, tx, actorId);

    // 2. If AI suggestion exists for old match, reject it
    const suggestion = await findSuggestionByPair(
      orgId,
      oldMatch.transactionId,
      oldMatch.documentId,
      tx,
    );
    if (suggestion) {
      await rejectSuggestion(
        orgId,
        suggestion.id,
        actorId ?? "system",
        rejectionReason,
        tx,
      );
    }

    // 3. Recompute old transaction status from remaining active matches
    await recomputeTransactionStatus(orgId, oldMatch.transactionId, tx);

    // 4. Create new manual match
    await createMatch(
      {
        orgId,
        transactionId: newTransactionId,
        documentId: oldMatch.documentId,
        paymentId,
        matchedAmount: newMatchedAmount,
        matchType: "manual",
        confidence: "1.00",
        matchedBy: "manual",
      },
      tx,
    );

    // 5. Recompute new transaction status (split-match safe)
    await recomputeTransactionStatus(orgId, newTransactionId, tx);
  });

  // Non-blocking alias learning (batched)
  await learnAliasFromMatch(orgId, [newTransactionId], oldMatch.documentId, "rejection_correction");

  // Fire Inngest event for auto-rule suggestion (non-blocking)
  try {
    await inngest.send({
      name: "reconciliation/manual-match-session",
      data: { orgId, userId: actorId ?? "unknown" },
    });
  } catch (err) {
    console.error("[reject-rematch] Inngest event failed (non-blocking):", err);
  }

  revalidatePath("/reconciliation");
  revalidatePath("/reconciliation/review");
  return { success: true };
}

// ---------------------------------------------------------------------------
// Approve match (7b)
// ---------------------------------------------------------------------------

export async function approveMatchAction(
  matchId: string,
): Promise<{ success: true } | { error: string }> {
  const orgId = await getVerifiedOrgId();
  if (!orgId) return { error: "No organization selected" };

  const uuidCheck = z.string().uuid().safeParse(matchId);
  if (!uuidCheck.success) return { error: "Invalid match ID" };

  const actorId = (await getCurrentUserId()) ?? undefined;

  const match = await getMatchById(orgId, matchId);
  if (!match) return { error: "Match not found" };

  // Already manually confirmed — idempotent no-op
  if (match.matchedBy === "manual") return { success: true };

  await db.transaction(async (tx) => {
    // Confirm the match as human-reviewed
    await updateMatchConfirmation(orgId, matchId, "manual", tx);

    // If AI suggestion exists, mark approved
    const suggestion = await findSuggestionByPair(
      orgId,
      match.transactionId,
      match.documentId,
      tx,
    );
    if (suggestion) {
      await approveSuggestion(orgId, suggestion.id, actorId ?? "system", tx);
    }

    // Recompute transaction status (handles split matches correctly)
    await recomputeTransactionStatus(orgId, match.transactionId, tx);
  });

  // Non-blocking alias learning (batched)
  await learnAliasFromMatch(orgId, [match.transactionId], match.documentId, "approval");

  revalidatePath("/reconciliation");
  revalidatePath("/reconciliation/review");
  return { success: true };
}

// ---------------------------------------------------------------------------
// Bulk approve high-confidence suggestions (creates matches + updates status)
// ---------------------------------------------------------------------------

const MIN_BULK_CONFIDENCE = 0.70;

export async function bulkApproveHighConfidenceAction(
  minConfidence: string = "0.90",
): Promise<{ success: true; approvedCount: number } | { error: string }> {
  const orgId = await getVerifiedOrgId();
  if (!orgId) return { error: "No organization selected" };
  const actorId = (await getCurrentUserId()) ?? "system";

  // Server-side confidence floor to prevent approving low-quality matches
  const threshold = Math.max(parseFloat(minConfidence), MIN_BULK_CONFIDENCE);
  if (isNaN(threshold)) return { error: "Invalid confidence value" };

  // Fetch pending suggestions above threshold
  const pending = await getPendingSuggestions(orgId, 500);
  const eligible = pending.filter(
    (s) => parseFloat(s.confidence) >= threshold,
  );

  // All-or-nothing: wrap entire bulk operation in one transaction
  const approvedIds: Array<{ transactionId: string; documentId: string }> = [];
  await db.transaction(async (tx) => {
    for (const suggestion of eligible) {
      // Approve the suggestion
      await approveSuggestion(orgId, suggestion.id, actorId, tx);

      // Create the actual reconciliation match
      await createMatch(
        {
          orgId,
          transactionId: suggestion.transactionId,
          documentId: suggestion.documentId,
          paymentId: suggestion.paymentId ?? undefined,
          matchedAmount: suggestion.suggestedAmount ?? "0.00",
          matchType: "ai_suggested",
          confidence: suggestion.confidence,
          matchedBy: "auto",
        },
        tx,
      );

      // Recompute transaction status
      await recomputeTransactionStatus(orgId, suggestion.transactionId, tx);

      approvedIds.push({
        transactionId: suggestion.transactionId,
        documentId: suggestion.documentId,
      });
    }
  });

  // Non-blocking alias learning (outside transaction)
  for (const { transactionId, documentId } of approvedIds) {
    await learnAliasFromMatch(orgId, [transactionId], documentId, "ai_approval");
  }

  revalidatePath("/reconciliation");
  revalidatePath("/reconciliation/ai-review");
  return { success: true, approvedCount: approvedIds.length };
}

// ---------------------------------------------------------------------------
// Reject AI suggestion (standalone, for AI review page)
// ---------------------------------------------------------------------------

export async function rejectSuggestionAction(
  suggestionId: string,
  reason?: string,
): Promise<{ success: true } | { error: string }> {
  const orgId = await getVerifiedOrgId();
  if (!orgId) return { error: "No organization selected" };

  const uuidCheck = z.string().uuid().safeParse(suggestionId);
  if (!uuidCheck.success) return { error: "Invalid suggestion ID" };

  if (reason && reason.length > 500) return { error: "Reason too long (max 500)" };

  const actorId = (await getCurrentUserId()) ?? "system";
  await rejectSuggestion(orgId, suggestionId, actorId, reason);

  revalidatePath("/reconciliation");
  revalidatePath("/reconciliation/ai-review");
  return { success: true };
}

// ---------------------------------------------------------------------------
// Approve single AI suggestion (creates match + updates status)
// ---------------------------------------------------------------------------

export async function approveSuggestionAction(
  suggestionId: string,
): Promise<{ success: true } | { error: string }> {
  const orgId = await getVerifiedOrgId();
  if (!orgId) return { error: "No organization selected" };

  const uuidCheck = z.string().uuid().safeParse(suggestionId);
  if (!uuidCheck.success) return { error: "Invalid suggestion ID" };

  const actorId = (await getCurrentUserId()) ?? "system";

  // Fetch the full suggestion to get txn/doc IDs
  const suggestion = await getSuggestionById(orgId, suggestionId);
  if (!suggestion) return { error: "Suggestion not found" };
  if (suggestion.status !== "pending") return { error: "Suggestion already processed" };

  await db.transaction(async (tx) => {
    // Approve the suggestion
    await approveSuggestion(orgId, suggestionId, actorId, tx);

    // Create the actual reconciliation match
    await createMatch(
      {
        orgId,
        transactionId: suggestion.transactionId,
        documentId: suggestion.documentId,
        paymentId: suggestion.paymentId ?? undefined,
        matchedAmount: suggestion.suggestedAmount ?? "0.00",
        matchType: "ai_suggested",
        confidence: suggestion.confidence,
        matchedBy: "auto",
      },
      tx,
    );

    // Recompute transaction status
    await recomputeTransactionStatus(orgId, suggestion.transactionId, tx);
  });

  // Non-blocking alias learning
  await learnAliasFromMatch(
    orgId,
    [suggestion.transactionId],
    suggestion.documentId,
    "ai_approval",
  );

  revalidatePath("/reconciliation");
  revalidatePath("/reconciliation/ai-review");
  return { success: true };
}

// ---------------------------------------------------------------------------
// Undo match (soft-delete + recompute + rollback AI suggestion)
// ---------------------------------------------------------------------------

export async function undoMatchAction(
  matchId: string,
): Promise<{ success: true } | { error: string }> {
  const orgId = await getVerifiedOrgId();
  if (!orgId) return { error: "No organization selected" };

  const uuidCheck = z.string().uuid().safeParse(matchId);
  if (!uuidCheck.success) return { error: "Invalid match ID" };

  const actorId = (await getCurrentUserId()) ?? undefined;

  const match = await getMatchById(orgId, matchId);
  if (!match) return { error: "Match not found" };

  // Already deleted (idempotent)
  if (match.deletedAt) return { success: true };

  await db.transaction(async (tx) => {
    // Soft-delete the match
    await softDeleteMatch(orgId, matchId, tx, actorId);

    // If AI-created, roll suggestion back to pending
    if (match.matchType === "ai_suggested") {
      const suggestion = await findSuggestionByPair(
        orgId,
        match.transactionId,
        match.documentId,
        tx,
      );
      if (suggestion && suggestion.status === "approved") {
        // Reset to pending so it can be re-reviewed
        await tx
          .update(aiMatchSuggestions)
          .set({
            status: "pending",
            reviewedAt: null,
            reviewedBy: null,
          })
          .where(
            and(
              eq(aiMatchSuggestions.id, suggestion.id),
              eq(aiMatchSuggestions.orgId, orgId),
            ),
          );
      }
    }

    // Recompute transaction status (handles split-match correctly)
    await recomputeTransactionStatus(orgId, match.transactionId, tx);
  });

  revalidatePath("/reconciliation");
  revalidatePath("/reconciliation/review");
  return { success: true };
}
