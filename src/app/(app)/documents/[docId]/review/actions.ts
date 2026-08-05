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
import { updateVendor } from "@/lib/db/queries/vendors";
import { inngest } from "@/lib/inngest/client";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/utils/auth";
import {
  ForeignVendorTaxMaterializationError,
  materializePp36ObligationFromDocument,
} from "@/lib/db/queries/foreign-vendor-tax";
import { db, type DbConnection } from "@/lib/db";

export async function confirmDocumentAction(docId: string) {
  const orgId = await getVerifiedOrgId();
  if (!orgId) throw new Error("No organization selected");

  const user = await getCurrentUser();
  if (!user?.id) {
    return { success: false, error: "Session expired. Please sign in again." };
  }
  let doc: Awaited<ReturnType<typeof confirmDocument>>;
  try {
    doc = await db.transaction(async (tx) => {
      const confirmed = await confirmDocument(orgId, docId, tx as DbConnection);
      await materializePp36ObligationFromDocument({
        orgId,
        documentId: docId,
        actorId: user.id,
        tx: tx as DbConnection,
      });
      return confirmed;
    });
  } catch (error) {
    if (
      error instanceof DocumentConfirmationError ||
      error instanceof ForeignVendorTaxMaterializationError
    ) {
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
    type?:
      | "invoice"
      | "receipt"
      | "debit_note"
      | "credit_note"
      | "wht_certificate_received";
    documentNumber?: string | null;
    issueDate?: string | null;
    dueDate?: string | null;
    subtotal?: string | null;
    vatAmount?: string | null;
    totalAmount?: string | null;
    currency?: string | null;
    exchangeRate?: string | null;
    totalAmountThb?: string | null;
    category?: string | null;
    vatPeriodYear?: number | null;
    vatPeriodMonth?: number | null;
    taxInvoiceSubtype?: "full_ti" | "abb" | "e_tax_invoice" | "not_a_ti" | null;
    supplierTaxIdSnapshot?: string | null;
    supplierBranchNumberSnapshot?: string | null;
    buyerTaxIdSnapshot?: string | null;
    buyerBranchNumberSnapshot?: string | null;
    taxInvoiceSerialNumber?: string | null;
    taxInvoiceWords?: string | null;
    isPp36Subject?: boolean | null;
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

  revalidatePath(`/documents/${docId}/review`);
  return { success: true };
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
