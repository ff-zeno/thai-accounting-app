"use server";

import { revalidatePath } from "next/cache";
import { requireOrgAdmin } from "@/lib/utils/admin-guard";
import {
  approvePayRun,
  buildPnd1Draft,
  buildPnd1KorDraft,
  buildSsoFilingDraft,
  createEmployeeAllowance,
  createDraftPayRun,
  createEmployee,
  markPayrollPndFilingAccepted,
  markPayrollPndFilingSubmitted,
  markPayrollSsoFilingAccepted,
  markPayrollSsoFilingSubmitted,
  recordPayRunPayment,
  recordPnd1Remittance,
  recordSsoRemittance,
} from "@/lib/db/queries/payroll";

function stringField(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function normalizeDate(value: FormDataEntryValue | null, label: string) {
  const raw = String(value ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) throw new Error(`${label} is required`);
  return raw;
}

function normalizeNonnegativeMoney(value: FormDataEntryValue | null, label: string) {
  const raw = String(value ?? "").trim();
  if (!/^\d+(\.\d{1,2})?$/.test(raw) || Number(raw) < 0) {
    throw new Error(`${label} must be a non-negative amount with up to 2 decimals`);
  }
  return Number(raw).toFixed(2);
}

export async function createEmployeeAction(formData: FormData) {
  const { orgId } = await requireOrgAdmin();
  const fullNameEn = stringField(formData, "fullNameEn");
  const fullNameTh = stringField(formData, "fullNameTh");
  const startDate = stringField(formData, "startDate");
  if (!startDate || (!fullNameEn && !fullNameTh)) {
    return { error: "Employee name and start date are required" };
  }

  try {
    const employee = await createEmployee({
      orgId,
      fullNameEn,
      fullNameTh,
      taxId: stringField(formData, "taxId"),
      passportNumber: stringField(formData, "passportNumber"),
      position: stringField(formData, "position"),
      startDate,
      baseMonthlySalary: normalizeNonnegativeMoney(
        formData.get("baseMonthlySalary") || "0.00",
        "Base monthly salary"
      ),
      salaryEffectiveFrom: stringField(formData, "salaryEffectiveFrom") || startDate,
      payFrequency: stringField(formData, "payFrequency") || "monthly",
      payPeriodsPerYear: Number(stringField(formData, "payPeriodsPerYear") || 12),
      isDirector: formData.get("isDirector") === "on",
      socialSecurityEligible: formData.get("socialSecurityEligible") === "on",
    });
    revalidatePath("/payroll");
    return { success: true, employeeId: employee.id };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Employee could not be saved",
    };
  }
}

function normalizeOptionalMoney(formData: FormData, key: string, fallback = "0.00") {
  const raw = stringField(formData, key);
  if (!raw) return fallback;
  if (!/^\d+(\.\d{1,2})?$/.test(raw)) {
    throw new Error(`${key} must be a non-negative amount with up to 2 decimals`);
  }
  return Number(raw).toFixed(2);
}

function normalizeOptionalPct(formData: FormData, key: string) {
  const raw = stringField(formData, key);
  if (!raw) return "0.0000";
  if (!/^\d+(\.\d{1,4})?$/.test(raw) || Number(raw) > 1) {
    throw new Error(`${key} must be between 0 and 1`);
  }
  return Number(raw).toFixed(4);
}

function normalizeOptionalCount(formData: FormData, key: string) {
  const raw = stringField(formData, key);
  if (!raw) return 0;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${key} must be a non-negative integer`);
  }
  return parsed;
}

export async function createEmployeeAllowanceAction(formData: FormData) {
  const { orgId, userId } = await requireOrgAdmin();
  const employeeId = stringField(formData, "employeeId");
  const taxYear = Number.parseInt(stringField(formData, "taxYear"), 10);
  const effectiveFromMonth = normalizeDate(
    formData.get("effectiveFromMonth"),
    "Effective month"
  );
  if (!employeeId || !Number.isInteger(taxYear) || taxYear < 2000 || taxYear > 2200) {
    return { error: "Employee and tax year are required" };
  }

  try {
    const allowance = await createEmployeeAllowance({
      orgId,
      employeeId,
      taxYear,
      effectiveFromMonth,
      personalAllowance: normalizeOptionalMoney(formData, "personalAllowance", "60000.00"),
      spouseAllowance: normalizeOptionalMoney(formData, "spouseAllowance"),
      childCountPre2018: normalizeOptionalCount(formData, "childCountPre2018"),
      childCountPost2018SecondPlus: normalizeOptionalCount(
        formData,
        "childCountPost2018SecondPlus"
      ),
      parentAllowance: normalizeOptionalMoney(formData, "parentAllowance"),
      disabledDependentAllowance: normalizeOptionalMoney(
        formData,
        "disabledDependentAllowance"
      ),
      healthInsurancePremium: normalizeOptionalMoney(formData, "healthInsurancePremium"),
      lifeInsurancePremium: normalizeOptionalMoney(formData, "lifeInsurancePremium"),
      parentsHealthInsurance: normalizeOptionalMoney(formData, "parentsHealthInsurance"),
      pensionInsurance: normalizeOptionalMoney(formData, "pensionInsurance"),
      providentFundContributionPct: normalizeOptionalPct(
        formData,
        "providentFundContributionPct"
      ),
      ltfRmfSsfAmount: normalizeOptionalMoney(formData, "ltfRmfSsfAmount"),
      mortgageInterest: normalizeOptionalMoney(formData, "mortgageInterest"),
      recordedByUserId: userId,
    });
    revalidatePath("/payroll");
    revalidatePath("/payroll/employees");
    revalidatePath(`/payroll/employees/${employeeId}/allowances`);
    return { success: true, allowanceId: allowance.id };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Allowance could not be saved",
    };
  }
}

export async function approvePayRunAction(formData: FormData) {
  const { orgId, userId } = await requireOrgAdmin();
  const payRunId = stringField(formData, "payRunId");
  if (!payRunId) return { error: "Pay run is required" };

  try {
    const payRun = await approvePayRun({ orgId, payRunId, approvedBy: userId });
    revalidatePath("/payroll");
    revalidatePath(`/payroll/runs/${payRunId}`);
    return { success: true, payRunId: payRun.id };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Pay run could not be approved",
    };
  }
}

export async function recordPayRunPaymentAction(formData: FormData) {
  const { orgId, userId } = await requireOrgAdmin();
  const payRunId = stringField(formData, "payRunId");
  if (!payRunId) return { error: "Pay run is required" };

  try {
    const payRun = await recordPayRunPayment({
      orgId,
      payRunId,
      paymentDate: normalizeDate(formData.get("paymentDate"), "Payment date"),
      paidBy: userId,
    });
    revalidatePath("/payroll");
    revalidatePath(`/payroll/runs/${payRunId}`);
    return { success: true, payRunId: payRun.id };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Pay run payment could not be recorded",
    };
  }
}

export async function createDraftPayRunAction(formData: FormData) {
  const { orgId } = await requireOrgAdmin();

  try {
    const result = await createDraftPayRun({
      orgId,
      periodStart: normalizeDate(formData.get("periodStart"), "Period start"),
      periodEnd: normalizeDate(formData.get("periodEnd"), "Period end"),
      payDate: normalizeDate(formData.get("payDate"), "Pay date"),
      defaultGrossSalary: normalizeNonnegativeMoney(
        formData.get("defaultGrossSalary"),
        "Gross salary"
      ),
      notes: stringField(formData, "notes"),
    });
    revalidatePath("/payroll");
    revalidatePath(`/payroll/runs/${result.payRun.id}`);
    return { success: true, payRunId: result.payRun.id, slipCount: result.slips.length };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Pay run could not be created",
    };
  }
}

function normalizeTaxMonth(value: FormDataEntryValue | null) {
  const raw = String(value ?? "").trim();
  if (!/^\d{4}-\d{2}$/.test(raw)) throw new Error("Tax month is required");
  return raw;
}

export async function buildPnd1DraftAction(formData: FormData) {
  const { orgId } = await requireOrgAdmin();

  try {
    const result = await buildPnd1Draft({
      orgId,
      taxMonth: normalizeTaxMonth(formData.get("taxMonth")),
    });
    revalidatePath("/payroll");
    return { success: true, filingId: result.filing.id, lineCount: result.lineCount };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "PND.1 draft could not be built",
    };
  }
}

export async function buildPnd1KorDraftAction(formData: FormData) {
  const { orgId } = await requireOrgAdmin();
  const taxYear = Number.parseInt(stringField(formData, "taxYear"), 10);
  if (!Number.isInteger(taxYear) || taxYear < 2000 || taxYear > 2200) {
    return { error: "Tax year is required" };
  }

  try {
    const result = await buildPnd1KorDraft({ orgId, taxYear });
    revalidatePath("/payroll");
    return { success: true, filingId: result.filing.id, lineCount: result.lineCount };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "PND.1 Kor draft could not be built",
    };
  }
}

export async function buildSsoFilingDraftAction(formData: FormData) {
  const { orgId } = await requireOrgAdmin();

  try {
    const result = await buildSsoFilingDraft({
      orgId,
      taxMonth: normalizeTaxMonth(formData.get("taxMonth")),
    });
    revalidatePath("/payroll");
    return { success: true, filingId: result.filing.id, lineCount: result.lineCount };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "SSO draft could not be built",
    };
  }
}

export async function recordPnd1RemittanceAction(formData: FormData) {
  const { orgId, userId } = await requireOrgAdmin();
  const filingId = stringField(formData, "filingId");
  if (!filingId) return { error: "PND.1 filing is required" };

  try {
    const filing = await recordPnd1Remittance({
      orgId,
      filingId,
      paymentDate: normalizeDate(formData.get("paymentDate"), "Payment date"),
      paidBy: userId,
    });
    revalidatePath("/payroll");
    return { success: true, filingId: filing.id };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "PND.1 remittance could not be recorded",
    };
  }
}

export async function recordSsoRemittanceAction(formData: FormData) {
  const { orgId, userId } = await requireOrgAdmin();
  const filingId = stringField(formData, "filingId");
  if (!filingId) return { error: "SSO filing is required" };

  try {
    const filing = await recordSsoRemittance({
      orgId,
      filingId,
      paymentDate: normalizeDate(formData.get("paymentDate"), "Payment date"),
      paidBy: userId,
    });
    revalidatePath("/payroll");
    return { success: true, filingId: filing.id };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "SSO remittance could not be recorded",
    };
  }
}

function revalidatePayrollFilingPaths() {
  revalidatePath("/payroll");
  revalidatePath("/payroll/filings/pnd1");
  revalidatePath("/payroll/filings/pnd1-kor");
  revalidatePath("/payroll/filings/sso");
}

export async function markPndFilingSubmittedAction(formData: FormData) {
  const { orgId, userId } = await requireOrgAdmin();
  const filingId = stringField(formData, "filingId");
  const rdReferenceNumber = stringField(formData, "rdReferenceNumber");
  if (!filingId || !rdReferenceNumber) {
    return { error: "PND filing and RD reference are required" };
  }

  try {
    const filing = await markPayrollPndFilingSubmitted({
      orgId,
      filingId,
      rdReferenceNumber,
      actorId: userId,
    });
    revalidatePayrollFilingPaths();
    return { success: true, filingId: filing.id };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "PND filing could not be submitted",
    };
  }
}

export async function markPndFilingAcceptedAction(formData: FormData) {
  const { orgId, userId } = await requireOrgAdmin();
  const filingId = stringField(formData, "filingId");
  if (!filingId) return { error: "PND filing is required" };

  try {
    const filing = await markPayrollPndFilingAccepted({
      orgId,
      filingId,
      rdReferenceNumber: stringField(formData, "rdReferenceNumber"),
      actorId: userId,
    });
    revalidatePayrollFilingPaths();
    return { success: true, filingId: filing.id };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "PND filing could not be accepted",
    };
  }
}

export async function markSsoFilingSubmittedAction(formData: FormData) {
  const { orgId, userId } = await requireOrgAdmin();
  const filingId = stringField(formData, "filingId");
  const ssoReferenceNumber = stringField(formData, "ssoReferenceNumber");
  if (!filingId || !ssoReferenceNumber) {
    return { error: "SSO filing and SSO reference are required" };
  }

  try {
    const filing = await markPayrollSsoFilingSubmitted({
      orgId,
      filingId,
      ssoReferenceNumber,
      actorId: userId,
    });
    revalidatePayrollFilingPaths();
    return { success: true, filingId: filing.id };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "SSO filing could not be submitted",
    };
  }
}

export async function markSsoFilingAcceptedAction(formData: FormData) {
  const { orgId, userId } = await requireOrgAdmin();
  const filingId = stringField(formData, "filingId");
  if (!filingId) return { error: "SSO filing is required" };

  try {
    const filing = await markPayrollSsoFilingAccepted({
      orgId,
      filingId,
      ssoReferenceNumber: stringField(formData, "ssoReferenceNumber"),
      actorId: userId,
    });
    revalidatePayrollFilingPaths();
    return { success: true, filingId: filing.id };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "SSO filing could not be accepted",
    };
  }
}
