"use server";

import { getVerifiedOrgId } from "@/lib/utils/org-context";
import {
  confirmDocument,
  getDocumentWithDetails,
  rejectDocument,
  updateDocumentFromExtraction,
  deleteLineItemsByDocument,
  createLineItems,
  DocumentConfirmationError,
} from "@/lib/db/queries/documents";
import { translateText } from "@/lib/ai/translate";
import { getVendorById, updateVendor } from "@/lib/db/queries/vendors";
import { inngest } from "@/lib/inngest/client";
import { revalidatePath } from "next/cache";
import {
  writeReviewExemplars,
  type UserReviewValues,
} from "@/lib/db/queries/review-exemplars";
import { confirmLatestCorrectionSessionForDocument } from "@/lib/db/queries/extraction-correction-sessions";
import { getReviewOutcomeByLog } from "@/lib/db/queries/extraction-review-outcome";
import { getCurrentUser } from "@/lib/utils/auth";

export async function confirmDocumentAction(docId: string) {
  const orgId = await getVerifiedOrgId();
  if (!orgId) throw new Error("No organization selected");

  let doc: Awaited<ReturnType<typeof confirmDocument>>;
  try {
    doc = await confirmDocument(orgId, docId);
  } catch (error) {
    if (error instanceof DocumentConfirmationError) {
      return { success: false, error: error.message };
    }
    throw error;
  }

  void inngest
    .send({
      name: "document/confirmed",
      data: {
        documentId: docId,
        orgId,
        vendorId: doc?.vendorId ?? null,
        documentNumber: doc?.documentNumber ?? null,
        direction: doc?.direction ?? "expense",
      },
    })
    .catch((err) => {
      console.error("[confirm-doc] Failed to emit document/confirmed:", err);
    });

  try {
    const user = await getCurrentUser();
    const correctionSession = await confirmLatestCorrectionSessionForDocument({
      orgId,
      documentId: docId,
      confirmedByUserId: user?.id ?? "unknown",
    });

    if (correctionSession) {
      const [reviewOutcome, vendor] = await Promise.all([
        getReviewOutcomeByLog(orgId, correctionSession.extractionLogId),
        doc?.vendorId ? getVendorById(orgId, doc.vendorId) : Promise.resolve(null),
      ]);

      void inngest
        .send({
          name: "learning/review-saved",
          data: {
            orgId,
            documentId: docId,
            vendorId: doc?.vendorId ?? null,
            vendorTaxId: vendor?.taxId ?? null,
            extractionLogId: correctionSession.extractionLogId,
            correctionCount: reviewOutcome?.correctionCount ?? 0,
            userCorrected: reviewOutcome?.userCorrected ?? false,
          },
        })
        .catch((err) => {
          console.error("[confirm-doc] Failed to emit learning/review-saved:", err);
        });

      void inngest
        .send({
          name: "learning/review-confirmed",
          data: {
            orgId,
            documentId: docId,
            vendorId: doc?.vendorId ?? null,
            extractionLogId: correctionSession.extractionLogId,
            correctionSessionId: correctionSession.id,
            confirmed: true,
          },
        })
        .catch((err) => {
          console.error("[confirm-doc] Failed to emit learning/review-confirmed:", err);
        });
    }
  } catch (error) {
    console.error("[confirm-doc] Failed to confirm correction session:", error);
  }

  revalidatePath(`/documents/${docId}/review`);
  return { success: true };
}

export async function rejectDocumentAction(docId: string, reason: string) {
  const orgId = await getVerifiedOrgId();
  if (!orgId) throw new Error("No organization selected");

  await rejectDocument(orgId, docId, reason);
  revalidatePath(`/documents/${docId}/review`);
  return { success: true };
}

export async function updateDocumentAction(
  docId: string,
  data: {
    type?: "invoice" | "receipt" | "debit_note" | "credit_note";
    documentNumber?: string | null;
    issueDate?: string | null;
    dueDate?: string | null;
    subtotal?: string | null;
    vatAmount?: string | null;
    totalAmount?: string | null;
    currency?: string | null;
    vatPeriodYear?: number | null;
    vatPeriodMonth?: number | null;
    taxInvoiceSubtype?: "full_ti" | "abb" | "e_tax_invoice" | "not_a_ti" | null;
    isPp36Subject?: boolean | null;
    correctionExplanation?: string | null;
  },
  expectedUpdatedAt?: string
) {
  const orgId = await getVerifiedOrgId();
  if (!orgId) throw new Error("No organization selected");

  // Optimistic concurrency check (Phase 8)
  if (expectedUpdatedAt) {
    const doc = await getDocumentWithDetails(orgId, docId);
    if (!doc) throw new Error("Document not found");
    const currentUpdatedAt = doc.updatedAt?.toISOString();
    if (currentUpdatedAt && currentUpdatedAt !== expectedUpdatedAt) {
      return {
        success: false,
        error: "Document modified elsewhere — please reload and try again",
      };
    }
  }

  await updateDocumentFromExtraction(orgId, docId, data);

  // Fire-and-forget: errors here don't block the document save.
  try {
    await writeReviewExemplars({
      orgId,
      docId,
      userValues: docDataToSchemaValues(data),
      correctionExplanation: data.correctionExplanation,
    });
  } catch (error) {
    console.error("[updateDocumentAction] exemplar write failed:", error);
  }

  revalidatePath(`/documents/${docId}/review`);
  return { success: true };
}

/**
 * Map document-table column edits to extraction schema field names so the
 * learning loop can diff them against the AI's raw response.
 */
function docDataToSchemaValues(data: {
  type?: string | null;
  documentNumber?: string | null;
  issueDate?: string | null;
  dueDate?: string | null;
  subtotal?: string | null;
  vatAmount?: string | null;
  totalAmount?: string | null;
  currency?: string | null;
}): UserReviewValues {
  const out: UserReviewValues = {};
  if ("type" in data) out.documentType = data.type ?? null;
  if ("documentNumber" in data) out.documentNumber = data.documentNumber ?? null;
  if ("issueDate" in data) out.issueDate = data.issueDate ?? null;
  if ("dueDate" in data) out.dueDate = data.dueDate ?? null;
  if ("subtotal" in data) out.subtotal = data.subtotal ?? null;
  if ("vatAmount" in data) out.vatAmount = data.vatAmount ?? null;
  if ("totalAmount" in data) out.totalAmount = data.totalAmount ?? null;
  if ("currency" in data) out.currency = data.currency ?? null;
  return out;
}

export async function updateLineItemsAction(
  docId: string,
  items: Array<{
    description?: string | null;
    quantity?: string | null;
    unitPrice?: string | null;
    amount?: string | null;
    vatAmount?: string | null;
    whtType?: string | null;
  }>
) {
  const orgId = await getVerifiedOrgId();
  if (!orgId) throw new Error("No organization selected");

  await deleteLineItemsByDocument(orgId, docId);
  if (items.length > 0) {
    await createLineItems(
      items.map((item) => ({ ...item, orgId, documentId: docId }))
    );
  }
  revalidatePath(`/documents/${docId}/review`);
  return { success: true };
}

export async function translateDocumentAction(text: string, targetLang: "en" | "th") {
  const result = await translateText(text, targetLang);
  return { translated: result.translated };
}

export async function updateVendorAction(
  vendorId: string,
  data: {
    name?: string;
    nameTh?: string | null;
    displayAlias?: string | null;
  }
) {
  const orgId = await getVerifiedOrgId();
  if (!orgId) throw new Error("No organization selected");

  await updateVendor(orgId, vendorId, data);
  return { success: true };
}

export async function retryExtractionAction(docId: string) {
  const orgId = await getVerifiedOrgId();
  if (!orgId) throw new Error("No organization selected");

  void inngest
    .send({
      name: "document/uploaded",
      data: { documentId: docId, orgId, fileIds: [] },
    })
    .catch((err) => {
      console.error("[retry-extraction] Failed to emit document/uploaded:", err);
    });

  revalidatePath(`/documents/${docId}/review`);
  return { success: true };
}
