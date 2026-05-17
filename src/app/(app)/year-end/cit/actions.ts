"use server";

import { revalidatePath } from "next/cache";
import { requireOrgAdmin } from "@/lib/utils/admin-guard";
import {
  acceptCitFiling,
  buildActualH1Pnd51Draft,
  buildPnd50DraftFromGlProfit,
  buildPnd50DraftFromManualProfit,
  buildProjectedPnd51Draft,
  buildTransferPricingDisclosureDraft,
  expireLossCarryForwardLayers,
  refreshTransferPricingRequirementFromGl,
  recordBookTaxAdjustment,
  recordLossCarryForwardLayer,
  submitCitFiling,
  submitTransferPricingDisclosure,
  syncEntertainmentExpenseBookTaxAdjustment,
  syncFixedAssetDepreciationBookTaxAdjustment,
} from "@/lib/db/queries/cit-filings";
import {
  postCitAccrualJournalEntry,
  postCitPaymentJournalEntry,
} from "@/lib/db/queries/general-ledger";

function stringField(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function normalizeMoney(raw: string) {
  if (!/^\d+(\.\d{1,2})?$/.test(raw) || Number(raw) <= 0) {
    throw new Error("Amount must be a positive value with up to 2 decimals");
  }
  return Number(raw).toFixed(2);
}

function normalizeSignedMoney(raw: string) {
  if (!/^-?\d+(\.\d{1,2})?$/.test(raw)) {
    throw new Error("Amount must be a value with up to 2 decimals");
  }
  return Number(raw).toFixed(2);
}

export async function buildProjectedPnd51DraftAction(formData: FormData) {
  const { orgId } = await requireOrgAdmin();
  const taxYear = Number(stringField(formData, "taxYear"));
  const projectedFullYearProfit = stringField(formData, "projectedFullYearProfit");
  const entityType = stringField(formData, "entityType") as
    | "standard"
    | "sme_qualifying";

  if (!taxYear || !projectedFullYearProfit || !entityType) {
    return { error: "Tax year, entity type, and projected profit are required" };
  }

  try {
    const filing = await buildProjectedPnd51Draft({
      orgId,
      taxYear,
      entityType,
      projectedFullYearProfit,
      rationale: stringField(formData, "rationale"),
    });
    revalidatePath("/year-end/cit");
    return { success: true, filingId: filing.id };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "PND.51 draft could not be built",
    };
  }
}

export async function buildActualH1Pnd51DraftAction(formData: FormData) {
  const { orgId } = await requireOrgAdmin();
  const taxYear = Number(stringField(formData, "taxYear"));
  const entityType = stringField(formData, "entityType") as
    | "standard"
    | "sme_qualifying";

  if (!taxYear || !entityType) {
    return { error: "Tax year and entity type are required" };
  }

  try {
    const filing = await buildActualH1Pnd51Draft({
      orgId,
      taxYear,
      entityType,
      rationale: stringField(formData, "rationale"),
    });
    revalidatePath("/year-end/cit");
    return { success: true, filingId: filing.id };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Actual H1 PND.51 draft could not be built",
    };
  }
}

export async function buildPnd50DraftAction(formData: FormData) {
  const { orgId } = await requireOrgAdmin();
  const taxYear = Number(stringField(formData, "taxYear"));
  const accountingProfit = stringField(formData, "accountingProfit");
  const entityType = stringField(formData, "entityType") as
    | "standard"
    | "sme_qualifying";

  if (!taxYear || !accountingProfit || !entityType) {
    return { error: "Tax year, entity type, and accounting profit are required" };
  }

  try {
    const filing = await buildPnd50DraftFromManualProfit({
      orgId,
      taxYear,
      entityType,
      accountingProfit: normalizeSignedMoney(accountingProfit),
    });
    revalidatePath("/year-end/cit");
    return { success: true, filingId: filing.id };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "PND.50 draft could not be built",
    };
  }
}

export async function buildGlPnd50DraftAction(formData: FormData) {
  const { orgId } = await requireOrgAdmin();
  const taxYear = Number(stringField(formData, "taxYear"));
  const entityType = stringField(formData, "entityType") as
    | "standard"
    | "sme_qualifying";

  if (!taxYear || !entityType) {
    return { error: "Tax year and entity type are required" };
  }

  try {
    const filing = await buildPnd50DraftFromGlProfit({
      orgId,
      taxYear,
      entityType,
    });
    revalidatePath("/year-end/cit");
    return { success: true, filingId: filing.id };
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : "GL PND.50 draft could not be built",
    };
  }
}

export async function postCitAccrualAction(formData: FormData) {
  const { orgId, userId } = await requireOrgAdmin();
  const citFilingId = stringField(formData, "citFilingId");

  if (!citFilingId) {
    return { error: "CIT filing is required" };
  }

  try {
    const entry = await postCitAccrualJournalEntry({
      orgId,
      citFilingId,
      createdByUserId: userId,
    });
    revalidatePath("/year-end/cit");
    return { success: true, journalEntryId: entry.id };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "CIT accrual could not be posted",
    };
  }
}

export async function refreshTransferPricingRequirementAction(formData: FormData) {
  const { orgId } = await requireOrgAdmin();
  const taxYear = Number(stringField(formData, "taxYear"));

  if (!taxYear) {
    return { error: "Tax year is required" };
  }

  try {
    const result = await refreshTransferPricingRequirementFromGl({ orgId, taxYear });
    revalidatePath("/year-end/cit");
    return { success: true, transferPricingRequired: result.transferPricingRequired };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Transfer pricing requirement could not be refreshed",
    };
  }
}

export async function buildTransferPricingDisclosureDraftAction(formData: FormData) {
  const { orgId, userId } = await requireOrgAdmin();
  const taxYear = Number(stringField(formData, "taxYear"));
  const relatedPartyTransactionsText = stringField(
    formData,
    "relatedPartyTransactionsText"
  );

  if (!taxYear) {
    return { error: "Tax year is required" };
  }

  try {
    const disclosure = await buildTransferPricingDisclosureDraft({
      orgId,
      taxYear,
      relatedPartyTransactionsText,
      notes: stringField(formData, "notes"),
      preparedByUserId: userId,
    });
    revalidatePath("/year-end/cit");
    return { success: true, disclosureId: disclosure.id };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Transfer pricing disclosure could not be built",
    };
  }
}

export async function submitTransferPricingDisclosureAction(formData: FormData) {
  const { orgId, userId } = await requireOrgAdmin();
  const disclosureId = stringField(formData, "disclosureId");
  if (!disclosureId) {
    return { error: "Transfer pricing disclosure is required" };
  }

  try {
    const disclosure = await submitTransferPricingDisclosure({
      orgId,
      disclosureId,
      submittedByUserId: userId,
    });
    revalidatePath("/year-end/cit");
    return { success: true, disclosureId: disclosure.id };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Transfer pricing disclosure could not be submitted",
    };
  }
}

export async function syncEntertainmentExpenseBookTaxAdjustmentAction(
  formData: FormData
) {
  const { orgId } = await requireOrgAdmin();
  const taxYear = Number(stringField(formData, "taxYear"));
  if (!taxYear) {
    return { error: "Tax year is required" };
  }

  try {
    const adjustment = await syncEntertainmentExpenseBookTaxAdjustment({
      orgId,
      taxYear,
    });
    revalidatePath("/year-end/cit");
    return { success: true, adjustmentId: adjustment?.id ?? null };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Entertainment addback could not be synced",
    };
  }
}

export async function recordBookTaxAdjustmentAction(formData: FormData) {
  const { orgId } = await requireOrgAdmin();
  const taxYear = Number(stringField(formData, "taxYear"));
  const description = stringField(formData, "description");
  const amount = stringField(formData, "amount");
  const direction = stringField(formData, "direction") as "add_back" | "deduct";
  const category = stringField(formData, "category");
  const glAccountId = stringField(formData, "glAccountId");

  if (!taxYear || !description || !amount || !direction || !category) {
    return {
      error: "Tax year, description, amount, direction, and category are required",
    };
  }

  try {
    const adjustment = await recordBookTaxAdjustment({
      orgId,
      taxYear,
      description,
      amount: normalizeMoney(amount),
      direction,
      category,
      glAccountId: glAccountId || undefined,
      notes: stringField(formData, "notes"),
    });
    revalidatePath("/year-end/cit");
    return { success: true, adjustmentId: adjustment.id };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Book-tax adjustment could not be recorded",
    };
  }
}

export async function submitCitFilingAction(formData: FormData) {
  const { orgId, userId } = await requireOrgAdmin();
  const filingId = stringField(formData, "filingId");

  if (!filingId) {
    return { error: "CIT filing is required" };
  }

  try {
    const filing = await submitCitFiling({
      orgId,
      filingId,
      submittedByUserId: userId,
      rdReferenceNumber: stringField(formData, "rdReferenceNumber"),
    });
    revalidatePath("/year-end/cit");
    return { success: true, filingId: filing.id };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "CIT filing could not be submitted",
    };
  }
}

export async function acceptCitFilingAction(formData: FormData) {
  const { orgId, userId } = await requireOrgAdmin();
  const filingId = stringField(formData, "filingId");

  if (!filingId) {
    return { error: "CIT filing is required" };
  }

  try {
    const filing = await acceptCitFiling({
      orgId,
      filingId,
      acceptedByUserId: userId,
    });
    revalidatePath("/year-end/cit");
    return { success: true, filingId: filing.id };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "CIT filing could not be accepted",
    };
  }
}

export async function postCitPaymentAction(formData: FormData) {
  const { orgId, userId } = await requireOrgAdmin();
  const citFilingId = stringField(formData, "citFilingId");

  if (!citFilingId) {
    return { error: "CIT filing is required" };
  }

  try {
    const entry = await postCitPaymentJournalEntry({
      orgId,
      citFilingId,
      paidAt: new Date(),
      createdByUserId: userId,
    });
    revalidatePath("/year-end/cit");
    return { success: true, journalEntryId: entry.id };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "CIT payment could not be posted",
    };
  }
}

export async function recordLossCarryForwardLayerAction(formData: FormData) {
  const { orgId } = await requireOrgAdmin();
  const originatedTaxYear = Number(stringField(formData, "originatedTaxYear"));
  const originalAmount = stringField(formData, "originalAmount");

  if (!originatedTaxYear || !originalAmount) {
    return { error: "Origin year and loss amount are required" };
  }

  try {
    const layer = await recordLossCarryForwardLayer({
      orgId,
      originatedTaxYear,
      originalAmount: normalizeMoney(originalAmount),
    });
    revalidatePath("/year-end/cit");
    return { success: true, layerId: layer.id };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Loss layer could not be recorded",
    };
  }
}

export async function expireLossCarryForwardLayersAction(formData: FormData) {
  const { orgId, userId } = await requireOrgAdmin();
  const taxYear = Number(stringField(formData, "taxYear"));
  const currentYear = new Date().getUTCFullYear();

  if (!Number.isInteger(taxYear) || taxYear < 2000 || taxYear > currentYear + 1) {
    return { error: "Tax year must be between 2000 and next year" };
  }

  try {
    const result = await expireLossCarryForwardLayers({
      orgId,
      taxYear,
      expiredByUserId: userId,
    });
    revalidatePath("/year-end/cit");
    return { success: true, ...result };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Loss layers could not be expired",
    };
  }
}

export async function syncFixedAssetDepreciationBookTaxAdjustmentAction(
  formData: FormData
) {
  const { orgId } = await requireOrgAdmin();
  const taxYear = Number(stringField(formData, "taxYear"));

  if (!Number.isInteger(taxYear)) {
    return { error: "Tax year is required" };
  }

  try {
    const adjustment = await syncFixedAssetDepreciationBookTaxAdjustment({
      orgId,
      taxYear,
    });
    revalidatePath("/year-end/cit");
    return { success: true, adjustmentId: adjustment?.id ?? null };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Fixed asset depreciation adjustment could not be synced",
    };
  }
}
