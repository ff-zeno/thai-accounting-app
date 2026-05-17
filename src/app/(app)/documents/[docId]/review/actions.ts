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
import {
  ForeignVendorTaxMaterializationError,
  materializePp36ObligationFromDocument,
} from "@/lib/db/queries/foreign-vendor-tax";
import { db, type DbConnection } from "@/lib/db";
import {
  createFixedAsset,
  getFixedAssetByAcquisitionDocument,
} from "@/lib/db/queries/fixed-assets";
import { recordInventoryMovement } from "@/lib/db/queries/inventory";
import { ensureHeadOfficeEstablishment } from "@/lib/db/queries/pos-sales-ledger";
import { inventoryMovements, skus } from "@/lib/db/schema";
import { and, eq, isNull } from "drizzle-orm";

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

  try {
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

function stringField(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function normalizeQty(value: FormDataEntryValue | null) {
  const raw = String(value ?? "").trim();
  if (!/^\d+(\.\d{1,4})?$/.test(raw) || Number(raw) <= 0) {
    throw new Error("Quantity must be positive with up to 4 decimals");
  }
  const [whole, fraction = ""] = raw.split(".");
  return `${whole}.${fraction.padEnd(4, "0")}`;
}

function normalizeCost(value: FormDataEntryValue | null) {
  const raw = String(value ?? "").trim();
  if (!/^\d+(\.\d{1,4})?$/.test(raw) || Number(raw) <= 0) {
    throw new Error("Unit cost must be positive with up to 4 decimals");
  }
  const [whole, fraction = ""] = raw.split(".");
  return `${whole}.${fraction.padEnd(4, "0")}`;
}

function parseMoneyCents(value: string | null | undefined, label: string) {
  const raw = String(value ?? "0").trim();
  if (!/^\d+(\.\d{1,4})?$/.test(raw)) {
    throw new Error(`${label} is invalid`);
  }
  return Math.round(Number(raw) * 100);
}

function formatCents(cents: number) {
  return (cents / 100).toFixed(2);
}

export async function capitalizeDocumentAsFixedAssetAction(
  docId: string,
  formData: FormData
) {
  const orgId = await getVerifiedOrgId();
  if (!orgId) throw new Error("No organization selected");

  const doc = await getDocumentWithDetails(orgId, docId);
  if (!doc) return { success: false, error: "Document not found" };
  if (doc.direction !== "expense") {
    return { success: false, error: "Only expense documents can create assets" };
  }
  if (doc.status !== "confirmed") {
    return { success: false, error: "Confirm the document before capitalization" };
  }
  if (!doc.issueDate) {
    return { success: false, error: "Document issue date is required" };
  }

  const existing = await getFixedAssetByAcquisitionDocument(orgId, docId);
  if (existing) {
    return { success: true, assetId: existing.id, alreadyExists: true };
  }

  const nameEn = stringField(formData, "assetName");
  const category = stringField(formData, "assetCategory");
  const originalCost = stringField(formData, "assetCost");
  const usefulLifeMonths = Number(stringField(formData, "usefulLifeMonths"));

  if (!nameEn || !category || !originalCost) {
    return { success: false, error: "Asset name, category, and cost are required" };
  }

  try {
    const asset = await createFixedAsset({
      orgId,
      nameEn,
      category,
      acquisitionDate: stringField(formData, "acquisitionDate") || doc.issueDate,
      originalCost,
      usefulLifeMonths:
        Number.isFinite(usefulLifeMonths) && usefulLifeMonths >= 0
          ? usefulLifeMonths
          : undefined,
      acquisitionDocumentId: docId,
      notes: `Capitalized from document ${doc.documentNumber ?? doc.id}`,
    });

    revalidatePath(`/documents/${docId}/review`);
    revalidatePath("/fixed-assets");
    return { success: true, assetId: asset.id };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Fixed asset could not be created",
    };
  }
}

export async function receiveDocumentInventoryAction(
  docId: string,
  formData: FormData
) {
  const orgId = await getVerifiedOrgId();
  if (!orgId) throw new Error("No organization selected");

  const doc = await getDocumentWithDetails(orgId, docId);
  if (!doc) return { success: false, error: "Document not found" };
  if (doc.direction !== "expense") {
    return { success: false, error: "Only expense documents can receive inventory" };
  }
  if (doc.type !== "invoice" && doc.type !== "receipt") {
    return { success: false, error: "Only supplier invoices or receipts can receive inventory" };
  }
  if (doc.status !== "confirmed") {
    return { success: false, error: "Confirm the document before receiving inventory" };
  }
  if (!doc.vendorId) {
    return { success: false, error: "Inventory receipts require a supplier vendor" };
  }
  if (doc.lineItems.length === 0) {
    return { success: false, error: "Inventory receipts require at least one document line item" };
  }
  if (!doc.issueDate) {
    return { success: false, error: "Document issue date is required" };
  }

  const skuId = stringField(formData, "inventorySkuId");
  if (!skuId) return { success: false, error: "SKU is required" };
  const receiptDate = stringField(formData, "inventoryReceiptDate") || doc.issueDate;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(receiptDate)) {
    return { success: false, error: "Inventory receipt date is invalid" };
  }

  try {
    const quantity = normalizeQty(formData.get("inventoryQuantity"));
    const unitCost = normalizeCost(formData.get("inventoryUnitCost"));
    const netCents = Math.round(Number(quantity) * Number(unitCost) * 100);
    const expectedNetCents = parseMoneyCents(
      doc.subtotal ?? String(Number(doc.totalAmount ?? "0") - Number(doc.vatAmount ?? "0")),
      "Document net inventory amount"
    );
    if (netCents !== expectedNetCents) {
      return {
        success: false,
        error: "Inventory quantity times unit cost must equal the document net subtotal",
      };
    }
    const vatCents = parseMoneyCents(doc.vatAmount, "Document VAT amount");
    const grossCents = parseMoneyCents(
      doc.totalAmount ?? formatCents(expectedNetCents + vatCents),
      "Document total amount"
    );
    const [sku] = await db
      .select({ establishmentId: skus.establishmentId })
      .from(skus)
      .where(
        and(
          eq(skus.orgId, orgId),
          eq(skus.id, skuId),
          eq(skus.isInventoriable, true),
          isNull(skus.deletedAt)
        )
      )
      .limit(1);
    if (!sku) return { success: false, error: "SKU not found" };

    const existing = await db
      .select({ id: inventoryMovements.id })
      .from(inventoryMovements)
      .where(
        and(
          eq(inventoryMovements.orgId, orgId),
          eq(inventoryMovements.sourceEntityType, "documents"),
          eq(inventoryMovements.sourceEntityId, docId),
          eq(inventoryMovements.skuId, skuId),
          eq(inventoryMovements.movementType, "purchase_in"),
          isNull(inventoryMovements.deletedAt)
        )
      )
      .limit(1);
    if (existing[0]) {
      return { success: true, movementId: existing[0].id, alreadyExists: true };
    }

    const establishment = sku.establishmentId
      ? { id: sku.establishmentId }
      : await ensureHeadOfficeEstablishment(orgId);
    const movement = await recordInventoryMovement({
      orgId,
      establishmentId: establishment.id,
      skuId,
      movementAt: new Date(`${receiptDate}T12:00:00+07:00`),
      movementType: "purchase_in",
      quantity,
      unitCost,
      purchaseVatAmount: formatCents(vatCents),
      purchaseApAmount: formatCents(grossCents),
      sourceEntityType: "documents",
      sourceEntityId: docId,
      notes: `Received from document ${doc.documentNumber ?? doc.id}`,
    });

    revalidatePath(`/documents/${docId}/review`);
    revalidatePath("/inventory");
    revalidatePath("/accounting");
    return { success: true, movementId: movement.id };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Inventory receipt could not be created",
    };
  }
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
