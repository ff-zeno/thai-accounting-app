"use server";

import { revalidatePath } from "next/cache";
import { requireOrgAdmin } from "@/lib/utils/admin-guard";
import {
  addImportGoodsLine,
  addManualImportChargeLine,
  addManualImportVatChargeLine,
  createManualImportPacket,
  deleteEmptyOpenImportPacket,
  deleteOpenImportChargeLine,
  deleteOpenImportDocumentLink,
  deleteOpenImportGoodsLine,
  deleteOpenImportPaymentLink,
  finalizeImportPacketToInventory,
  linkImportDocument,
  linkImportPayment,
  updateOpenImportPacketHeader,
} from "@/lib/db/queries/imports";

function stringField(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function normalizeMoneyInput(value: FormDataEntryValue | null) {
  const raw = String(value ?? "0").trim() || "0";
  if (!/^\d+(\.\d{1,2})?$/.test(raw)) {
    throw new Error("Amount must be zero or a positive number with up to 2 decimals");
  }
  const [whole, fraction = ""] = raw.split(".");
  return `${whole}.${fraction.padEnd(2, "0")}`;
}

function normalizeFxInput(value: FormDataEntryValue | null) {
  const raw = String(value ?? "").trim();
  if (!/^\d+(\.\d{1,8})?$/.test(raw) || Number(raw) <= 0) {
    throw new Error("FX rate must be a positive number with up to 8 decimals");
  }
  return raw;
}

export async function createManualImportPacketAction(formData: FormData) {
  const { orgId } = await requireOrgAdmin();
  const importReference = stringField(formData, "importReference");
  const arrivalDate = stringField(formData, "arrivalDate");
  const customsClearanceDate = stringField(formData, "customsClearanceDate");
  const originalCurrency = stringField(formData, "originalCurrency").toUpperCase();

  if (!importReference || !arrivalDate || !customsClearanceDate || !originalCurrency) {
    return {
      error: "Import reference, dates, and currency are required",
    };
  }

  try {
    const packet = await createManualImportPacket({
      orgId,
      importReference,
      customsDeclarationNumber: stringField(formData, "customsDeclarationNumber"),
      arrivalPort: stringField(formData, "arrivalPort"),
      arrivalDate,
      customsClearanceDate,
      originalCurrency,
      fxRateAtClearance: normalizeFxInput(formData.get("fxRateAtClearance")),
      customsAssessedDutyThb: normalizeMoneyInput(formData.get("customsAssessedDutyThb")),
      customsAssessedExciseThb: normalizeMoneyInput(formData.get("customsAssessedExciseThb")),
      customsAssessedImportVatThb: normalizeMoneyInput(formData.get("customsAssessedImportVatThb")),
      notes: stringField(formData, "notes"),
    });

    revalidatePath("/imports");
    return { success: true, importId: packet.id };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Import packet could not be saved",
    };
  }
}

export async function updateOpenImportPacketHeaderAction(formData: FormData) {
  const { orgId } = await requireOrgAdmin();
  const importId = stringField(formData, "importId");
  if (!importId) return { error: "Import packet is required" };

  try {
    await updateOpenImportPacketHeader({
      orgId,
      importId,
      importReference: stringField(formData, "importReference"),
      customsDeclarationNumber: stringField(formData, "customsDeclarationNumber"),
      arrivalPort: stringField(formData, "arrivalPort"),
      notes: stringField(formData, "notes"),
    });
    revalidatePath(`/imports/${importId}`);
    revalidatePath("/imports");
    return { success: true };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Import packet header could not be updated",
    };
  }
}

export async function deleteEmptyOpenImportPacketAction(formData: FormData) {
  const { orgId } = await requireOrgAdmin();
  const importId = stringField(formData, "importId");
  if (!importId) return { error: "Import packet is required" };

  try {
    await deleteEmptyOpenImportPacket({ orgId, importId });
    revalidatePath("/imports");
    return { success: true };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Import packet could not be deleted",
    };
  }
}

export async function deleteOpenImportGoodsLineAction(formData: FormData) {
  const { orgId, userId } = await requireOrgAdmin();
  const importId = stringField(formData, "importId");
  const goodsLineId = stringField(formData, "goodsLineId");
  if (!importId || !goodsLineId) {
    return { error: "Import packet and goods line are required" };
  }

  try {
    await deleteOpenImportGoodsLine({ orgId, importId, goodsLineId, actorId: userId });
    revalidatePath(`/imports/${importId}`);
    revalidatePath("/imports");
    return { success: true };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Import goods line could not be deleted",
    };
  }
}

export async function deleteOpenImportChargeLineAction(formData: FormData) {
  const { orgId, userId } = await requireOrgAdmin();
  const importId = stringField(formData, "importId");
  const chargeLineId = stringField(formData, "chargeLineId");
  if (!importId || !chargeLineId) {
    return { error: "Import packet and charge line are required" };
  }

  try {
    await deleteOpenImportChargeLine({ orgId, importId, chargeLineId, actorId: userId });
    revalidatePath(`/imports/${importId}`);
    revalidatePath("/imports");
    return { success: true };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Import charge line could not be deleted",
    };
  }
}

export async function deleteOpenImportDocumentLinkAction(formData: FormData) {
  const { orgId, userId } = await requireOrgAdmin();
  const importId = stringField(formData, "importId");
  const importDocumentId = stringField(formData, "importDocumentId");
  if (!importId || !importDocumentId) {
    return { error: "Import packet and document link are required" };
  }

  try {
    await deleteOpenImportDocumentLink({
      orgId,
      importId,
      importDocumentId,
      actorId: userId,
    });
    revalidatePath(`/imports/${importId}`);
    revalidatePath("/imports");
    return { success: true };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Import document link could not be deleted",
    };
  }
}

export async function deleteOpenImportPaymentLinkAction(formData: FormData) {
  const { orgId, userId } = await requireOrgAdmin();
  const importId = stringField(formData, "importId");
  const importPaymentId = stringField(formData, "importPaymentId");
  if (!importId || !importPaymentId) {
    return { error: "Import packet and payment link are required" };
  }

  try {
    await deleteOpenImportPaymentLink({
      orgId,
      importId,
      importPaymentId,
      actorId: userId,
    });
    revalidatePath(`/imports/${importId}`);
    revalidatePath("/imports");
    return { success: true };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Import payment link could not be deleted",
    };
  }
}

function normalizeQuantityInput(value: FormDataEntryValue | null) {
  const raw = String(value ?? "").trim();
  if (!/^\d+(\.\d{1,4})?$/.test(raw) || Number(raw) <= 0) {
    throw new Error("Quantity must be a positive number with up to 4 decimals");
  }
  const [whole, fraction = ""] = raw.split(".");
  return `${whole}.${fraction.padEnd(4, "0")}`;
}

export async function addImportGoodsLineAction(formData: FormData) {
  const { orgId } = await requireOrgAdmin();
  const importId = stringField(formData, "importId");
  const skuCode = stringField(formData, "skuCode");
  if (!importId || !skuCode) return { error: "Import packet and SKU code are required" };

  try {
    await addImportGoodsLine({
      orgId,
      importId,
      skuCode,
      description: stringField(formData, "description"),
      quantity: normalizeQuantityInput(formData.get("quantity")),
      unitPriceOriginal: normalizeQuantityInput(formData.get("unitPriceOriginal")),
      goodsValueOriginal: normalizeMoneyInput(formData.get("goodsValueOriginal")),
      goodsValueThb: normalizeMoneyInput(formData.get("goodsValueThb")),
    });
    revalidatePath(`/imports/${importId}`);
    revalidatePath("/imports");
    return { success: true };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Import goods line could not be saved",
    };
  }
}

export async function addManualImportVatChargeLineAction(formData: FormData) {
  const { orgId } = await requireOrgAdmin();
  const importId = stringField(formData, "importId");
  if (!importId) return { error: "Import packet is required" };

  try {
    await addManualImportVatChargeLine({
      orgId,
      importId,
      lineDescription: stringField(formData, "lineDescription") || "Customs import VAT",
      amountThb: normalizeMoneyInput(formData.get("amountThb")),
      documentNumber: stringField(formData, "documentNumber"),
    });
    revalidatePath(`/imports/${importId}`);
    revalidatePath("/imports");
    return { success: true };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Import VAT line could not be saved",
    };
  }
}

export async function addManualImportChargeLineAction(formData: FormData) {
  const { orgId } = await requireOrgAdmin();
  const importId = stringField(formData, "importId");
  const vatTreatment = stringField(formData, "vatTreatment");
  if (!importId || !vatTreatment) {
    return { error: "Import packet and VAT treatment are required" };
  }

  try {
    await addManualImportChargeLine({
      orgId,
      importId,
      documentRole: stringField(formData, "documentRole") || "broker_invoice",
      documentNumber: stringField(formData, "documentNumber"),
      lineDescription: stringField(formData, "lineDescription") || "Broker charge",
      amountThb: normalizeMoneyInput(formData.get("amountThb")),
      vatTreatment,
      vatAmountThb: normalizeMoneyInput(formData.get("vatAmountThb")),
    });
    revalidatePath(`/imports/${importId}`);
    revalidatePath("/imports");
    return { success: true };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Import charge line could not be saved",
    };
  }
}

export async function finalizeImportPacketAction(formData: FormData) {
  const { orgId } = await requireOrgAdmin();
  const importId = stringField(formData, "importId");
  if (!importId) return { error: "Import packet is required" };

  try {
    await finalizeImportPacketToInventory({ orgId, importId });
    revalidatePath(`/imports/${importId}`);
    revalidatePath("/imports");
    revalidatePath("/inventory");
    return { success: true };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Import packet could not be finalized",
    };
  }
}

export async function linkImportDocumentAction(formData: FormData) {
  const { orgId } = await requireOrgAdmin();
  const importId = stringField(formData, "importId");
  const documentRole = stringField(formData, "documentRole");
  if (!importId || !documentRole) {
    return { error: "Import packet and document role are required" };
  }

  try {
    await linkImportDocument({
      orgId,
      importId,
      documentRole,
      documentNumber: stringField(formData, "documentNumber"),
      notes: stringField(formData, "notes"),
    });
    revalidatePath(`/imports/${importId}`);
    revalidatePath("/imports");
    return { success: true };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Import document could not be linked",
    };
  }
}

export async function linkImportPaymentAction(formData: FormData) {
  const { orgId } = await requireOrgAdmin();
  const importId = stringField(formData, "importId");
  const bankTransactionId = stringField(formData, "bankTransactionId");
  const paymentRole = stringField(formData, "paymentRole");
  if (!importId || !bankTransactionId || !paymentRole) {
    return { error: "Import packet, bank transaction, and payment role are required" };
  }

  try {
    await linkImportPayment({
      orgId,
      importId,
      bankTransactionId,
      paymentRole,
      amountThb: normalizeMoneyInput(formData.get("amountThb")),
    });
    revalidatePath(`/imports/${importId}`);
    revalidatePath("/imports");
    return { success: true };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Import payment could not be linked",
    };
  }
}
