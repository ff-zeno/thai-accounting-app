"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getVerifiedOrgId } from "@/lib/utils/org-context";
import { getCurrentUserId } from "@/lib/utils/auth";
import { db } from "@/lib/db";
import { documents, transactions } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import {
  getUnmatchedTransactions,
  getUnmatchedDocuments,
  createMatch,
  updateTransactionReconStatus,
  getMatchById,
  softDeleteMatch,
  recomputeTransactionStatus,
  updateMatchConfirmation,
} from "@/lib/db/queries/reconciliation";
import {
  approveSuggestion,
  rejectSuggestion,
  findSuggestionByPair,
} from "@/lib/db/queries/ai-suggestions";
import { getPaymentsByDocument } from "@/lib/db/queries/payments";
import { upsertAlias } from "@/lib/db/queries/vendor-aliases";
import { auditMutation } from "@/lib/db/helpers/audit-log";
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

export async function createManualMatchAction(data: {
  transactionIds: string[];
  documentId: string;
  amounts: Record<string, string>;
}): Promise<{ success: true } | { error: string }> {
  const orgId = await getVerifiedOrgId();
  if (!orgId) return { error: "No organization selected" };
  const actorId = (await getCurrentUserId()) ?? undefined;

  if (data.transactionIds.length === 0) {
    return { error: "Select at least one transaction" };
  }
  if (!data.documentId) {
    return { error: "Select a document" };
  }

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

      await updateTransactionReconStatus(orgId, txnId, "matched", tx);
    }
  });

  // Non-blocking alias learning: extract counterparty from transactions → document vendor
  try {
    const [doc] = await db
      .select({ vendorId: documents.vendorId })
      .from(documents)
      .where(and(eq(documents.id, data.documentId), eq(documents.orgId, orgId)))
      .limit(1);

    if (doc?.vendorId) {
      for (const txnId of data.transactionIds) {
        const [txn] = await db
          .select({ counterparty: transactions.counterparty })
          .from(transactions)
          .where(and(eq(transactions.id, txnId), eq(transactions.orgId, orgId)))
          .limit(1);

        if (txn?.counterparty) {
          await upsertAlias({
            orgId,
            vendorId: doc.vendorId,
            aliasText: txn.counterparty,
            source: "manual_match",
          });
        }
      }
    }
  } catch (err) {
    console.error("[manual-match] Alias learning failed (non-blocking):", err);
  }

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

  const payments = await getPaymentsByDocument(orgId, oldMatch.documentId);
  const paymentId = payments.length > 0 ? payments[0].id : null;

  // Steps 1-3 inside transaction: soft-delete old, reject AI suggestion, create new match
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

    // 5. Update new transaction status
    await updateTransactionReconStatus(orgId, newTransactionId, "matched", tx);
  });

  // Step 4: Auto-learn from correction (non-blocking)
  try {
    const [doc] = await db
      .select({ vendorId: documents.vendorId })
      .from(documents)
      .where(and(eq(documents.id, oldMatch.documentId), eq(documents.orgId, orgId)))
      .limit(1);

    const [newTxn] = await db
      .select({ counterparty: transactions.counterparty })
      .from(transactions)
      .where(and(eq(transactions.id, newTransactionId), eq(transactions.orgId, orgId)))
      .limit(1);

    if (doc?.vendorId && newTxn?.counterparty) {
      await upsertAlias({
        orgId,
        vendorId: doc.vendorId,
        aliasText: newTxn.counterparty,
        source: "rejection_correction",
      });
    }
  } catch (err) {
    console.error("[reject-rematch] Alias learning failed (non-blocking):", err);
  }

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

  // Non-blocking alias learning
  try {
    const [doc] = await db
      .select({ vendorId: documents.vendorId })
      .from(documents)
      .where(and(eq(documents.id, match.documentId), eq(documents.orgId, orgId)))
      .limit(1);

    const [txn] = await db
      .select({ counterparty: transactions.counterparty })
      .from(transactions)
      .where(and(eq(transactions.id, match.transactionId), eq(transactions.orgId, orgId)))
      .limit(1);

    if (doc?.vendorId && txn?.counterparty) {
      await upsertAlias({
        orgId,
        vendorId: doc.vendorId,
        aliasText: txn.counterparty,
        source: "approval",
      });
    }
  } catch (err) {
    console.error("[approve-match] Alias learning failed (non-blocking):", err);
  }

  revalidatePath("/reconciliation");
  revalidatePath("/reconciliation/review");
  return { success: true };
}
