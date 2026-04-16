"use server";

import { getVerifiedOrgId } from "@/lib/utils/org-context";
import { getCurrentUser } from "@/lib/utils/auth";
import {
  confirmDocument,
  getDocumentWithDetails,
  rejectDocument,
  updateDocumentFromExtraction,
  deleteLineItemsByDocument,
  createLineItems,
} from "@/lib/db/queries/documents";
import { translateText } from "@/lib/ai/translate";
import { updateVendor, getVendorById } from "@/lib/db/queries/vendors";
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
import { getLatestExtractionLog } from "@/lib/db/queries/extraction-log";
import { upsertExemplar } from "@/lib/db/queries/extraction-exemplars";
import { insertReviewOutcome } from "@/lib/db/queries/extraction-review-outcome";
import { normalizeFieldValue, fieldValuesEqual } from "@/lib/ai/field-normalization";
import {
  getFieldCriticality,
  LEARNABLE_INVOICE_FIELDS,
} from "@/lib/ai/field-criticality";
import type { FieldCriticality } from "@/lib/ai/field-criticality";

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

  // 5. Emit Inngest event for reconciliation engine (fire-and-forget).
  void inngest
    .send({
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
    type?: "invoice" | "receipt" | "debit_note" | "credit_note";
    documentNumber?: string | null;
    issueDate?: string | null;
    dueDate?: string | null;
    subtotal?: string | null;
    vatAmount?: string | null;
    totalAmount?: string | null;
    currency?: string | null;
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

  // --- Phase 8: Extraction learning loop ---
  // Write exemplars from the diff between AI extraction and user-saved values.
  // Fire-and-forget: errors here don't block the document save.
  try {
    await writeExtractionExemplars(orgId, docId, data);
  } catch (error) {
    console.error("[updateDocumentAction] exemplar write failed:", error);
  }

  revalidatePath(`/documents/${docId}/review`);
  return { success: true };
}

/**
 * Phase 8: Compare AI extraction output with user-saved values and write
 * exemplars for fields where the user corrected the AI.
 */
async function writeExtractionExemplars(
  orgId: string,
  docId: string,
  savedData: Record<string, unknown>
) {
  // Load the extraction log to get the AI's raw output and vendor ID
  const extractionLog = await getLatestExtractionLog(orgId, docId);
  if (!extractionLog) return; // No extraction log = doc wasn't AI-extracted

  // Load the AI raw response from the document files
  const doc = await getDocumentWithDetails(orgId, docId);
  if (!doc) return;

  // Get the AI raw response from the first file that has one
  const aiRaw = doc.files?.find(
    (f: { aiRawResponse: unknown }) => f.aiRawResponse
  )?.aiRawResponse as Record<string, unknown> | null;
  if (!aiRaw) return;

  const vendorId = extractionLog.vendorId ?? doc.vendorId;
  if (!vendorId) return; // Can't write exemplars without a vendor

  // Look up vendor's tax ID for cross-org consensus (Phase 8 Phase 2)
  const vendor = await getVendorById(orgId, vendorId);
  const vendorTaxId = vendor?.taxId ?? null;

  const user = await getCurrentUser();
  const userId = user?.id ?? "unknown";

  // Map of document table column names to extraction schema field names
  const DOC_TO_SCHEMA_MAP: Record<string, string> = {
    type: "documentType",
    documentNumber: "documentNumber",
    issueDate: "issueDate",
    dueDate: "dueDate",
    subtotal: "subtotal",
    vatAmount: "vatAmount",
    totalAmount: "totalAmount",
    currency: "currency",
  };

  let correctionCount = 0;

  for (const field of LEARNABLE_INVOICE_FIELDS) {
    // Find the user-saved value for this field
    const docColumnName = Object.entries(DOC_TO_SCHEMA_MAP).find(
      ([, schema]) => schema === field
    )?.[0];

    // Get the user's value from what they saved
    const userValue = docColumnName
      ? (savedData[docColumnName] as string | null | undefined)
      : undefined;
    // Get the AI's value from the raw response
    const aiValue = aiRaw[field] as string | null | undefined;

    // Skip fields not in the saved data (user didn't edit them)
    if (userValue === undefined && !docColumnName) continue;

    const userStr = userValue ?? null;
    const aiStr = aiValue != null ? String(aiValue) : null;
    const wasCorrected = !fieldValuesEqual(field, aiStr, userStr);

    if (wasCorrected) correctionCount++;

    await upsertExemplar({
      orgId,
      vendorId,
      fieldName: field,
      fieldCriticality: getFieldCriticality(field) as FieldCriticality,
      aiValue: aiStr ? normalizeFieldValue(field, aiStr) : null,
      userValue: userStr ? normalizeFieldValue(field, userStr) : null,
      wasCorrected,
      documentId: docId,
      modelUsed: extractionLog.modelUsed ?? undefined,
      confidenceAtTime: undefined,
      vendorTaxId,
    });
  }

  // Write review outcome
  await insertReviewOutcome({
    extractionLogId: extractionLog.id,
    documentId: docId,
    orgId,
    userCorrected: correctionCount > 0,
    correctionCount,
    reviewedByUserId: userId,
  });

  // Emit learning event for tier promotion/demotion + reputation tracking
  void inngest.send({
    name: "learning/review-saved",
    data: {
      orgId,
      documentId: docId,
      vendorId,
      vendorTaxId,
      extractionLogId: extractionLog.id,
      correctionCount,
      userCorrected: correctionCount > 0,
    },
  });
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
