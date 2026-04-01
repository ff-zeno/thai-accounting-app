"use server";

import { getVerifiedOrgId } from "@/lib/utils/org-context";
import {
  confirmDocument,
  getDocumentWithDetails,
  rejectDocument,
  updateDocumentFromExtraction,
  deleteLineItemsByDocument,
  createLineItems,
} from "@/lib/db/queries/documents";
import { translateText } from "@/lib/ai/translate";
import { updateVendor } from "@/lib/db/queries/vendors";
import {
  createPayment,
  getPaymentsByDocument,
} from "@/lib/db/queries/payments";
import {
  createWhtCertificateDraft,
  getCertificatesByDocument,
  getFormTypeForEntity,
} from "@/lib/db/queries/wht-certificates";
import { isPeriodLocked } from "@/lib/db/queries/wht-filings";
import { inngest } from "@/lib/inngest/client";
import { revalidatePath } from "next/cache";

export async function confirmDocumentAction(docId: string) {
  const orgId = await getVerifiedOrgId();
  if (!orgId) throw new Error("No organization selected");

  // 0. Check period lock before confirming
  const preDoc = await getDocumentWithDetails(orgId, docId);
  if (preDoc?.issueDate) {
    const issueDate = new Date(preDoc.issueDate);
    const docYear = issueDate.getFullYear();
    const docMonth = issueDate.getMonth() + 1;
    const locked = await isPeriodLocked(orgId, docYear, docMonth);
    if (locked) {
      return {
        success: false,
        error: `Cannot confirm document — period ${docMonth}/${docYear} is locked (already filed)`,
      };
    }
  }

  // 1. Set status to confirmed
  await confirmDocument(orgId, docId);

  // 2. Load document with line items and vendor for post-confirm triggers
  const doc = await getDocumentWithDetails(orgId, docId);
  if (!doc) throw new Error("Document not found after confirmation");

  const grossAmount = doc.totalAmount ?? "0.00";
  const paymentDate = doc.issueDate ?? new Date().toISOString().slice(0, 10);

  // Sum WHT from line items using integer arithmetic to avoid float precision issues
  const whtTotalCents = doc.lineItems.reduce((sum, li) => {
    return sum + Math.round(parseFloat(li.whtAmount ?? "0") * 100);
  }, 0);
  const whtAmountWithheld = (whtTotalCents / 100).toFixed(2);
  const grossAmountCents = Math.round(parseFloat(grossAmount) * 100);
  const netAmountPaid = ((grossAmountCents - whtTotalCents) / 100).toFixed(2);

  // 3. Create payment record (idempotent — skip if payment already exists)
  const existingPayments = await getPaymentsByDocument(orgId, docId);
  let paymentId: string;
  if (existingPayments.length > 0) {
    paymentId = existingPayments[0].id;
  } else {
    const result = await createPayment({
      orgId,
      documentId: docId,
      paymentDate,
      grossAmount,
      whtAmountWithheld,
      netAmountPaid,
      paymentMethod: "bank_transfer",
    });
    paymentId = result.paymentId;
  }

  // 4. Create WHT certificate draft if any line items have WHT > 0
  //    (idempotent — skip if certificate already exists for this document)
  const whtLineItems = doc.lineItems.filter(
    (li) => parseFloat(li.whtAmount ?? "0") > 0
  );

  if (whtLineItems.length > 0 && doc.vendor) {
    const existingCerts = await getCertificatesByDocument(orgId, docId);
    if (existingCerts.length === 0) {
      const formType = getFormTypeForEntity(doc.vendor.entityType);

      await createWhtCertificateDraft({
        orgId,
        vendorId: doc.vendor.id,
        formType,
        paymentDate,
        lineItems: whtLineItems.map((li) => ({
          documentId: docId,
          lineItemId: li.id,
          baseAmount: li.amount ?? "0.00",
          whtRate: li.whtRate ?? "0.00",
          whtAmount: li.whtAmount ?? "0.00",
          rdPaymentTypeCode: li.rdPaymentTypeCode ?? undefined,
          whtType: li.whtType ?? undefined,
        })),
      });
    }
  }

  // 5. Emit Inngest event for reconciliation engine (full context for smart matching)
  await inngest.send({
    name: "document/confirmed",
    data: {
      documentId: docId,
      orgId,
      paymentId,
      netAmountPaid,
      paymentDate,
      vendorId: doc?.vendorId ?? null,
      vendorName: doc?.vendor?.name ?? null,
      vendorNameTh: doc?.vendor?.nameTh ?? null,
      vendorTaxId: doc?.vendor?.taxId ?? null,
      documentNumber: doc?.documentNumber ?? null,
      direction: doc?.direction ?? "expense",
    },
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
    type?: "invoice" | "receipt" | "debit_note" | "credit_note";
    documentNumber?: string | null;
    issueDate?: string | null;
    dueDate?: string | null;
    subtotal?: string | null;
    vatAmount?: string | null;
    totalAmount?: string | null;
    currency?: string | null;
  }
) {
  const orgId = await getVerifiedOrgId();
  if (!orgId) throw new Error("No organization selected");

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

  await inngest.send({
    name: "document/uploaded",
    data: { documentId: docId, orgId, fileIds: [] },
  });

  revalidatePath(`/documents/${docId}/review`);
  return { success: true };
}
