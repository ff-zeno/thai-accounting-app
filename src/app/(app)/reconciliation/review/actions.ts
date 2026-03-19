"use server";

import { revalidatePath } from "next/cache";
import { getVerifiedOrgId } from "@/lib/utils/org-context";
import { getCurrentUserId } from "@/lib/utils/auth";
import {
  getUnmatchedTransactions,
  getUnmatchedDocuments,
  createMatch,
  updateTransactionReconStatus,
} from "@/lib/db/queries/reconciliation";
import { getPaymentsByDocument } from "@/lib/db/queries/payments";
import { auditMutation } from "@/lib/db/helpers/audit-log";

export async function getUnmatchedItemsAction() {
  const orgId = await getVerifiedOrgId();
  if (!orgId) return { transactions: [], documents: [] };

  const [txns, docs] = await Promise.all([
    getUnmatchedTransactions(orgId, 100),
    getUnmatchedDocuments(orgId, 100),
  ]);

  return { transactions: txns, documents: docs };
}

export async function createManualMatchAction(data: {
  transactionIds: string[];
  documentId: string;
  amounts: Record<string, string>; // transactionId -> matched amount
}): Promise<{ success: true } | { error: string }> {
  const orgId = await getVerifiedOrgId();
  if (!orgId) return { error: "No organization selected" };
  const actorId = await getCurrentUserId() ?? undefined;

  if (data.transactionIds.length === 0) {
    return { error: "Select at least one transaction" };
  }
  if (!data.documentId) {
    return { error: "Select a document" };
  }

  // Find the payment for this document (needed for the reconciliation_matches row)
  const payments = await getPaymentsByDocument(orgId, data.documentId);
  const paymentId = payments.length > 0 ? payments[0].id : null;

  // Create a match for each selected transaction
  for (const txnId of data.transactionIds) {
    const matchedAmount = data.amounts[txnId];
    if (!matchedAmount) continue;

    await createMatch({
      orgId,
      transactionId: txnId,
      documentId: data.documentId,
      paymentId: paymentId ?? "",
      matchedAmount,
      matchType: "manual",
      confidence: "1.00",
      matchedBy: "manual",
    });

    await updateTransactionReconStatus(orgId, txnId, "matched");

    await auditMutation({
      orgId,
      entityType: "reconciliation_match",
      entityId: txnId,
      action: "create",
      newValue: {
        transactionId: txnId,
        documentId: data.documentId,
        matchedAmount,
        matchType: "manual",
      },
      actorId,
    });
  }

  revalidatePath("/reconciliation");
  revalidatePath("/reconciliation/review");
  return { success: true };
}
