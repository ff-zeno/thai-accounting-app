"use server";

import { revalidatePath } from "next/cache";
import { getVerifiedOrgId } from "@/lib/utils/org-context";
import { requireOrgAdmin } from "@/lib/utils/admin-guard";
import {
  aggregateMonthlyFiling,
  upsertMonthlyFiling,
  markFilingAsFiled,
  voidFiling,
  computeFilingDeadline,
  getFilingsByPeriod,
  getCertificatesForFiling,
} from "@/lib/db/queries/wht-filings";

type FormType = "pnd3" | "pnd53" | "pnd54";

// ---------------------------------------------------------------------------
// Refresh/aggregate filing data for a period
// ---------------------------------------------------------------------------

export async function refreshFilingAction(
  year: number,
  month: number,
  formType: FormType
) {
  const orgId = await getVerifiedOrgId();
  if (!orgId) return { error: "No organization selected" };

  const totals = await aggregateMonthlyFiling(orgId, year, month, formType);
  const deadline = computeFilingDeadline(year, month);

  const filingId = await upsertMonthlyFiling({
    orgId,
    periodYear: year,
    periodMonth: month,
    formType,
    totalBaseAmount: totals.totalBaseAmount,
    totalWhtAmount: totals.totalWhtAmount,
    deadline,
  });

  revalidatePath("/tax/monthly-filings");
  return { success: true, filingId };
}

// ---------------------------------------------------------------------------
// Mark as Filed (locks the period)
// ---------------------------------------------------------------------------

export async function markAsFiledAction(filingId: string) {
  const { orgId, userId } = await requireOrgAdmin();

  await markFilingAsFiled(orgId, filingId, userId);

  revalidatePath("/tax/monthly-filings");
  return { success: true };
}

// ---------------------------------------------------------------------------
// Void Filing (unlocks the period)
// ---------------------------------------------------------------------------

export async function voidFilingAction(filingId: string) {
  const { orgId } = await requireOrgAdmin();

  await voidFiling(orgId, filingId);

  revalidatePath("/tax/monthly-filings");
  return { success: true };
}

// ---------------------------------------------------------------------------
// Load filing data for a period (all form types)
// ---------------------------------------------------------------------------

export async function loadFilingDataAction(year: number, month: number) {
  const orgId = await getVerifiedOrgId();
  if (!orgId) return { error: "No organization selected" };

  const formTypes: FormType[] = ["pnd3", "pnd53", "pnd54"];

  // Ensure filing records exist for all form types
  for (const formType of formTypes) {
    const totals = await aggregateMonthlyFiling(orgId, year, month, formType);
    const deadline = computeFilingDeadline(year, month);
    await upsertMonthlyFiling({
      orgId,
      periodYear: year,
      periodMonth: month,
      formType,
      totalBaseAmount: totals.totalBaseAmount,
      totalWhtAmount: totals.totalWhtAmount,
      deadline,
    });
  }

  const filings = await getFilingsByPeriod(orgId, year, month);

  // Load certificates for each form type
  const certificatesByFormType: Record<FormType, Awaited<ReturnType<typeof getCertificatesForFiling>>> = {
    pnd3: [],
    pnd53: [],
    pnd54: [],
  };

  for (const formType of formTypes) {
    certificatesByFormType[formType] = await getCertificatesForFiling(
      orgId,
      year,
      month,
      formType
    );
  }

  return {
    success: true,
    filings,
    certificatesByFormType,
  };
}

// ---------------------------------------------------------------------------
// Download RD e-Filing CSV
// ---------------------------------------------------------------------------

export async function downloadRdCsvAction(
  year: number,
  month: number,
  formType: string
): Promise<{ csv: string; filename: string } | { error: string }> {
  const orgId = await getVerifiedOrgId();
  if (!orgId) return { error: "No organization selected" };

  const validFormTypes = ["pnd3", "pnd53", "pnd54"] as const;
  if (!validFormTypes.includes(formType as FormType)) {
    return { error: `Invalid form type: ${formType}` };
  }

  if (month < 1 || month > 12) {
    return { error: "Month must be between 1 and 12" };
  }
  if (year < 2000 || year > 2100) {
    return { error: "Year is out of range" };
  }

  const { generateRdCsv } = await import("@/lib/tax/rd-csv-export");
  return generateRdCsv(orgId, year, month, formType as FormType);
}
