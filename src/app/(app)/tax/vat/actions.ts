"use server";

import { revalidatePath } from "next/cache";
import { getVerifiedOrgId } from "@/lib/utils/org-context";
import { requireOrgAdmin } from "@/lib/utils/admin-guard";
import {
  buildPp30VatFilingDraft,
  buildPp36VatFilingDraft,
  getVatFilingDrilldown,
  getVatForecastByPeriodRange,
  getVatLedgerPeriodDashboard,
  getVatLedgerRegister,
  markVatFilingDraftFiled,
  recordPp36FilingPayment,
} from "@/lib/db/queries/vat-operations-ledger";

function validateVatPeriod(year: number, month: number) {
  if (!Number.isInteger(year) || year < 2020 || year > 2100) {
    return { error: "Year must be between 2020 and 2100" };
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    return { error: "Month must be between 1 and 12" };
  }
  return { periodYear: year, periodMonth: month };
}

function normalizeMoneyInput(amount: string) {
  const [wholePart, fractionalPart = ""] = amount.trim().split(".");
  const whole = wholePart.replace(/^0+(?=\d)/, "") || "0";
  return `${whole}.${fractionalPart.padEnd(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Load VAT data for a period
// ---------------------------------------------------------------------------

export async function loadVatDataAction(year: number, month: number) {
  const orgId = await getVerifiedOrgId();
  if (!orgId) return { error: "No organization selected" };

  const period = validateVatPeriod(year, month);
  if ("error" in period) return period;

  const dashboard = await getVatLedgerPeriodDashboard({
    orgId,
    periodYear: period.periodYear,
    periodMonth: period.periodMonth,
  });

  return {
    success: true,
    dashboard,
  };
}

// ---------------------------------------------------------------------------
// Load VAT register for a period
// ---------------------------------------------------------------------------

export async function loadVatRegisterAction(year: number, month: number) {
  const orgId = await getVerifiedOrgId();
  if (!orgId) return { error: "No organization selected" };

  const period = validateVatPeriod(year, month);
  if ("error" in period) return period;

  const register = await getVatLedgerRegister({
    orgId,
    periodYear: period.periodYear,
    periodMonth: period.periodMonth,
  });
  return { success: true, register };
}

export async function loadVatFilingDrilldownAction(filingId: string) {
  const orgId = await getVerifiedOrgId();
  if (!orgId) return { error: "No organization selected" };
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(filingId)) {
    return { error: "Invalid filing id" };
  }

  const drilldown = await getVatFilingDrilldown({ orgId, filingId });
  return { success: true, drilldown };
}

export async function loadVatForecastAction(year: number, month: number) {
  const orgId = await getVerifiedOrgId();
  if (!orgId) return { error: "No organization selected" };

  const period = validateVatPeriod(year, month);
  if ("error" in period) return period;

  const forecast = await getVatForecastByPeriodRange({
    orgId,
    startYear: period.periodYear,
    startMonth: period.periodMonth,
    months: 6,
  });
  return { success: true, forecast };
}

// ---------------------------------------------------------------------------
// Build VAT operations ledger PP30 draft for a period
// ---------------------------------------------------------------------------

export async function buildPp30VatLedgerDraftAction(year: number, month: number) {
  const { orgId, userId } = await requireOrgAdmin();

  const period = validateVatPeriod(year, month);
  if ("error" in period) return period;

  const draft = await buildPp30VatFilingDraft({
    orgId,
    periodYear: period.periodYear,
    periodMonth: period.periodMonth,
    actorId: userId,
  });

  revalidatePath("/tax/vat");
  return {
    success: true,
    filing: {
      id: draft.filing.id,
      filingType: draft.filing.filingType,
      periodYear: draft.filing.periodYear,
      periodMonth: draft.filing.periodMonth,
      status: draft.filing.status,
      outputVatTotal: draft.filing.outputVatTotal,
      inputVatTotal: draft.filing.inputVatTotal,
      pp36ReclaimTotal: draft.filing.pp36ReclaimTotal,
      carryforwardIn: draft.filing.carryforwardIn,
    },
    allocatedCounts: {
      output: draft.output.allocatedCount,
      input: draft.input.allocatedCount,
      pp36Reclaim: draft.pp36Reclaim.allocatedCount,
      carryforward: draft.carryforward.allocatedCount,
    },
  };
}

// ---------------------------------------------------------------------------
// Build VAT operations ledger PP36 draft for a period
// ---------------------------------------------------------------------------

export async function buildPp36VatLedgerDraftAction(year: number, month: number) {
  const { orgId, userId } = await requireOrgAdmin();

  const period = validateVatPeriod(year, month);
  if ("error" in period) return period;

  const draft = await buildPp36VatFilingDraft({
    orgId,
    periodYear: period.periodYear,
    periodMonth: period.periodMonth,
    actorId: userId,
  });

  revalidatePath("/tax/vat");
  return {
    success: true,
    filing: {
      id: draft.filing.id,
      filingType: draft.filing.filingType,
      periodYear: draft.filing.periodYear,
      periodMonth: draft.filing.periodMonth,
      status: draft.filing.status,
      pp36VatTotal: draft.filing.pp36VatTotal,
    },
    allocatedCounts: {
      pp36Obligations: draft.obligations.allocatedCount,
    },
  };
}

// ---------------------------------------------------------------------------
// File a VAT operations ledger draft
// ---------------------------------------------------------------------------

export async function fileVatLedgerDraftAction(filingId: string) {
  const { orgId, userId } = await requireOrgAdmin();

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(filingId)) {
    return { error: "Invalid filing id" };
  }

  const filing = await markVatFilingDraftFiled({
    orgId,
    filingId,
    actorId: userId,
  });

  revalidatePath("/tax/vat");
  return {
    success: true,
    filing: {
      id: filing.id,
      filingType: filing.filingType,
      periodYear: filing.periodYear,
      periodMonth: filing.periodMonth,
      status: filing.status,
      outputVatTotal: filing.outputVatTotal,
      inputVatTotal: filing.inputVatTotal,
      pp36VatTotal: filing.pp36VatTotal,
      pp36ReclaimTotal: filing.pp36ReclaimTotal,
      carryforwardIn: filing.carryforwardIn,
      carryforwardOut: filing.carryforwardOut,
      netPayable: filing.netPayable,
      paymentStatus: filing.paymentStatus,
    },
  };
}

// ---------------------------------------------------------------------------
// Record PP36 filing payment in the VAT operations ledger
// ---------------------------------------------------------------------------

export async function recordPp36VatLedgerPaymentAction(
  filingId: string,
  amount: string,
  paidAtIso: string,
  receiptNo?: string
) {
  const { orgId, userId } = await requireOrgAdmin();

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(filingId)) {
    return { error: "Invalid filing id" };
  }
  if (!/^\d+(\.\d{1,2})?$/.test(amount.trim())) {
    return { error: "Amount must be a positive money value" };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(paidAtIso)) {
    return { error: "Paid date must be a Bangkok calendar date" };
  }
  const paidAt = new Date(`${paidAtIso}T00:00:00+07:00`);
  if (Number.isNaN(paidAt.getTime())) {
    return { error: "Paid date is invalid" };
  }
  const normalizedReceiptNo = receiptNo?.trim() || undefined;
  if (normalizedReceiptNo && normalizedReceiptNo.length > 64) {
    return { error: "Receipt number must be 64 characters or fewer" };
  }

  const normalizedAmount = normalizeMoneyInput(amount);

  const payment = await recordPp36FilingPayment({
    orgId,
    filingId,
    actorId: userId,
    paidAt,
    amount: normalizedAmount,
    receiptNo: normalizedReceiptNo,
    idempotencyKey: `pp36-payment:${orgId}:${filingId}:${paidAtIso}:${normalizedAmount}`,
  });

  revalidatePath("/tax/vat");
  return {
    success: true,
    payment: {
      eventId: payment.event.id,
      paidObligationCount: payment.paidObligations.length,
      amount: payment.event.amount,
      receiptNo: payment.event.receiptNo,
    },
  };
}
