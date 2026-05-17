"use server";

import { revalidatePath } from "next/cache";
import { requireOrgAdmin } from "@/lib/utils/admin-guard";
import {
  createManualPosSale,
  importPosSalesCsv,
  recordCashDeposit,
  recordProcessorSettlement,
} from "@/lib/db/queries/pos-sales-ledger";

function normalizeMoneyInput(value: FormDataEntryValue | null) {
  const raw = String(value ?? "").trim();
  if (!/^\d+(\.\d{1,2})?$/.test(raw)) {
    throw new Error("Amount must be a positive number with up to 2 decimals");
  }
  const [whole, fraction = ""] = raw.split(".");
  return `${whole}.${fraction.padEnd(2, "0")}`;
}

function normalizeSignedMoneyInput(value: FormDataEntryValue | null) {
  const raw = String(value ?? "").trim();
  if (!/^-?\d+(\.\d{1,2})?$/.test(raw)) {
    throw new Error("Amount must be a number with up to 2 decimals");
  }
  const sign = raw.startsWith("-") ? "-" : "";
  const unsigned = sign ? raw.slice(1) : raw;
  const [whole, fraction = ""] = unsigned.split(".");
  return `${sign}${whole}.${fraction.padEnd(2, "0")}`;
}

function stringField(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function isUniqueViolation(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    ("code" in error || "cause" in error) &&
    ((error as { code?: unknown }).code === "23505" ||
      (error as { cause?: { code?: unknown } }).cause?.code === "23505")
  );
}

export async function createManualPosSaleAction(formData: FormData) {
  const { orgId } = await requireOrgAdmin();
  const soldAtRaw = stringField(formData, "soldAt");
  const channel = stringField(formData, "channel");
  const taxInvoiceType = stringField(formData, "taxInvoiceType");
  const taxInvoiceNumber = stringField(formData, "taxInvoiceNumber");
  const terminalId = stringField(formData, "terminalId") || "manual";

  if (!soldAtRaw || !channel || !taxInvoiceType || !taxInvoiceNumber) {
    return { error: "Sale date, channel, tax invoice type, and invoice number are required" };
  }

  try {
    const sale = await createManualPosSale({
      orgId,
      soldAt: new Date(`${soldAtRaw}T12:00:00+07:00`),
      channel,
      amountIncludingVat: normalizeMoneyInput(formData.get("amountIncludingVat")),
      taxBaseExVat: normalizeMoneyInput(formData.get("taxBaseExVat")),
      vatAmount: normalizeMoneyInput(formData.get("vatAmount")),
      taxInvoiceType,
      taxInvoiceNumber,
      terminalId,
    });
    revalidatePath("/sales");
    return { success: true, saleId: sale.id };
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { error: "Sale already recorded for this invoice number" };
    }
    return {
      error: error instanceof Error ? error.message : "POS sale could not be saved",
    };
  }
}

export async function importPosSalesCsvAction(formData: FormData) {
  const { orgId } = await requireOrgAdmin();
  const csvText = stringField(formData, "csvText");
  if (!csvText) {
    return { error: "Paste POS CSV rows before importing" };
  }

  try {
    const result = await importPosSalesCsv({ orgId, csvText });
    revalidatePath("/sales");
    revalidatePath("/tax/reports");
    return { success: true, ...result };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "POS CSV could not be imported",
    };
  }
}

export async function recordCashDepositAction(formData: FormData) {
  const { orgId } = await requireOrgAdmin();
  const depositedAt = stringField(formData, "depositedAt");
  if (!depositedAt) {
    return { error: "Deposit date is required" };
  }

  try {
    const deposit = await recordCashDeposit({
      orgId,
      depositedAt,
      amount: normalizeMoneyInput(formData.get("amount")),
      depositedBy: stringField(formData, "depositedBy") || undefined,
      slipReference: stringField(formData, "slipReference") || undefined,
      posCashPeriodStart: stringField(formData, "posCashPeriodStart") || undefined,
      posCashPeriodEnd: stringField(formData, "posCashPeriodEnd") || undefined,
      cashVariance: formData.get("cashVariance")
        ? normalizeSignedMoneyInput(formData.get("cashVariance"))
        : undefined,
    });
    revalidatePath("/sales");
    return { success: true, depositId: deposit.id };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Cash deposit could not be saved",
    };
  }
}

function optionalDateTime(value: string) {
  return value ? new Date(`${value}T12:00:00+07:00`) : undefined;
}

export async function recordProcessorSettlementAction(formData: FormData) {
  const { orgId } = await requireOrgAdmin();
  const processor = stringField(formData, "processor");
  const externalId = stringField(formData, "externalId");
  if (!processor || !externalId) {
    return { error: "Processor and settlement reference are required" };
  }
  const periodEnd = optionalDateTime(stringField(formData, "periodEnd"));
  if (!periodEnd) {
    return { error: "Settlement period end is required" };
  }

  try {
    const feeVatRaw = stringField(formData, "feeVatAmount");
    const processorTaxInvoiceDocumentId = stringField(
      formData,
      "processorTaxInvoiceDocumentId"
    );
    if (feeVatRaw && !processorTaxInvoiceDocumentId) {
      return { error: "Fee VAT requires a linked processor tax invoice document" };
    }
    const settlement = await recordProcessorSettlement({
      orgId,
      processor,
      externalId,
      periodStart: optionalDateTime(stringField(formData, "periodStart")),
      periodEnd,
      grossAmount: normalizeMoneyInput(formData.get("grossAmount")),
      feeAmount: normalizeMoneyInput(formData.get("feeAmount")),
      netPayout: normalizeMoneyInput(formData.get("netPayout")),
      feeVatAmount: feeVatRaw ? normalizeMoneyInput(feeVatRaw) : undefined,
      processorTaxInvoiceDocumentId: processorTaxInvoiceDocumentId || undefined,
      processorTiNumber: stringField(formData, "processorTiNumber") || undefined,
      reconciliationDiscrepancy: stringField(formData, "reconciliationDiscrepancy")
        ? normalizeSignedMoneyInput(formData.get("reconciliationDiscrepancy"))
        : undefined,
    });
    revalidatePath("/sales");
    return { success: true, settlementId: settlement.id };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Processor settlement could not be saved",
    };
  }
}
