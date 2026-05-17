import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "../index";
import {
  auditLog,
  bookTaxAdjustments,
  citBrackets,
  citFilings,
  depreciationSchedule,
  fixedAssets,
  glAccounts,
  journalEntries,
  journalLines,
  lossCarryForwardLayers,
  organizations,
  transferPricingDisclosures,
} from "../schema";
import {
  computeLossCarryForwardConsumption,
  computeProgressiveCit,
  computeProjectedPnd51,
} from "@/lib/cit/cit-calculator";
import { orgScope, orgScopeAlive } from "../helpers/org-scope";
import { getWhtCreditsReceivedTotal } from "./wht-credits-received";

const FIXED_ASSET_DEPRECIATION_ADJUSTMENT_NOTE =
  "system:fixed_asset_depreciation_schedule";
const ENTERTAINMENT_CAP_ADJUSTMENT_NOTE =
  "system:entertainment_expense_cap_revenue_only_v1";

const BOOK_TAX_ADJUSTMENT_CATEGORIES = new Set([
  "non_deductible_expense",
  "depreciation_method_difference",
  "boi_exempt_revenue",
  "entertainment_50pct_disallowance",
  "entertainment_cap_excess",
  "director_meeting_fee_disallowance",
  "donation_2pct_limit",
  "provision_disallowance",
  "goodwill_amortization_disallowance",
  "foreign_tax_credit_limit",
  "other",
]);

async function assertNoActiveCitAccrual(orgId: string, filingId: string) {
  const [activeAccrual] = await db
    .select({ id: journalEntries.id })
    .from(journalEntries)
    .where(
      and(
        eq(journalEntries.orgId, orgId),
        eq(journalEntries.sourceEntityType, "cit_filings"),
        eq(journalEntries.sourceEntityId, filingId),
        eq(journalEntries.postingKind, "cit_accrual"),
        isNull(journalEntries.reversedByEntryId)
      )
    )
    .limit(1);
  if (activeAccrual) {
    throw new Error("CIT accrual already posted; reverse it before rebuilding the draft");
  }
}

const TP_DISCLOSURE_FIELDS = [
  "relatedPartyName",
  "taxpayerId",
  "countryCode",
  "relationship",
  "transactionCategory",
  "revenueAmount",
  "purchaseAmount",
  "serviceFeeAmount",
  "royaltyAmount",
  "interestAmount",
  "loanBalance",
  "notes",
] as const;

function moneyOrZero(value: string | undefined) {
  const amount = Number(value ?? "0");
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error("Transfer pricing amounts must be non-negative numbers");
  }
  return amount.toFixed(2);
}

function parseTransferPricingTransactionLines(text: string) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, lineIndex) => {
      const parts = line.split("|").map((part) => part.trim());
      if (parts.length === 1) {
        return { description: parts[0] };
      }
      if (parts.length !== TP_DISCLOSURE_FIELDS.length) {
        throw new Error(
          `Transfer pricing transaction line ${lineIndex + 1} must have ${TP_DISCLOSURE_FIELDS.length} pipe-delimited fields`
        );
      }

      const row: Record<string, string> = {};
      TP_DISCLOSURE_FIELDS.forEach((field, index) => {
        row[field] = parts[index] ?? "";
      });
      row.countryCode = row.countryCode.toUpperCase();
      row.revenueAmount = moneyOrZero(row.revenueAmount);
      row.purchaseAmount = moneyOrZero(row.purchaseAmount);
      row.serviceFeeAmount = moneyOrZero(row.serviceFeeAmount);
      row.royaltyAmount = moneyOrZero(row.royaltyAmount);
      row.interestAmount = moneyOrZero(row.interestAmount);
      row.loanBalance = moneyOrZero(row.loanBalance);
      return row;
    });
}

export async function getCitDashboard(orgId: string) {
  const [organization] = await db
    .select({ transferPricingRequired: organizations.transferPricingRequired })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);
  const recentFilings = await db
    .select()
    .from(citFilings)
    .where(eq(citFilings.orgId, orgId))
    .orderBy(asc(citFilings.taxYear), asc(citFilings.filingType))
    .limit(20);

  const [summary] = await db
    .select({
      draftCount: sql<number>`COUNT(*) FILTER (WHERE ${citFilings.filingStatus} = 'draft')::int`,
      submittedCount: sql<number>`COUNT(*) FILTER (WHERE ${citFilings.filingStatus} = 'submitted')::int`,
      acceptedCount: sql<number>`COUNT(*) FILTER (WHERE ${citFilings.filingStatus} = 'accepted')::int`,
      citPayable: sql<string>`COALESCE(SUM(${citFilings.citPayable}), 0)::numeric(14,2)`,
    })
    .from(citFilings)
    .where(eq(citFilings.orgId, orgId));

  const brackets = await db
    .select()
    .from(citBrackets)
    .orderBy(asc(citBrackets.entityType), asc(citBrackets.lowerBound));

  const lossLayers = await listLossCarryForwardLayers(orgId);
  const bookTaxAdjustmentRows = await db
    .select()
    .from(bookTaxAdjustments)
    .where(eq(bookTaxAdjustments.orgId, orgId))
    .orderBy(asc(bookTaxAdjustments.taxYear), asc(bookTaxAdjustments.category));
  const transferPricingRows = await db
    .select()
    .from(transferPricingDisclosures)
    .where(eq(transferPricingDisclosures.orgId, orgId))
    .orderBy(asc(transferPricingDisclosures.taxYear));

  return {
    summary,
    transferPricingRequired: organization?.transferPricingRequired ?? false,
    recentFilings,
    brackets,
    lossLayers,
    bookTaxAdjustments: bookTaxAdjustmentRows,
    transferPricingDisclosures: transferPricingRows,
  };
}

export async function buildProjectedPnd51Draft(data: {
  orgId: string;
  taxYear: number;
  entityType: "standard" | "sme_qualifying";
  projectedFullYearProfit: string;
  rationale?: string;
}) {
  const brackets = await db
    .select()
    .from(citBrackets)
    .where(eq(citBrackets.entityType, data.entityType))
    .orderBy(asc(citBrackets.lowerBound));

  if (brackets.length === 0) throw new Error("CIT brackets are not configured");

  const annualCit = computeProgressiveCit(data.projectedFullYearProfit, brackets);
  const projection = computeProjectedPnd51({
    projectedFullYearProfit: data.projectedFullYearProfit,
    annualCit,
  });

  const [existing] = await db
    .select({ id: citFilings.id, filingStatus: citFilings.filingStatus })
    .from(citFilings)
    .where(
      and(
        ...orgScopeAlive(citFilings, data.orgId),
        eq(citFilings.taxYear, data.taxYear),
        eq(citFilings.filingType, "pnd51"),
        eq(citFilings.isAmendment, false)
      )
    )
    .limit(1);

  const values = {
    orgId: data.orgId,
    taxYear: data.taxYear,
    filingType: "pnd51",
    periodStart: `${data.taxYear}-01-01`,
    periodEnd: `${data.taxYear}-06-30`,
    filingStatus: "draft",
    accountingProfit: projection.projectedFullYearProfit,
    taxableIncome: projection.projectedFullYearProfit,
    citRate: data.entityType === "standard" ? "0.2000" : null,
    citCalculated: projection.annualCit,
    pnd51Method: "projected_full_year",
    pnd51ProjectedFullYearProfit: projection.projectedFullYearProfit,
    pnd51H1ActualProfit: null,
    pnd51EstimateRationale: data.rationale || null,
    citPayable: projection.prepaymentDue,
  };

  if (existing) {
    if (existing.filingStatus !== "draft") {
      throw new Error("Submitted CIT filings cannot be rebuilt; use an amendment workflow");
    }
    await assertNoActiveCitAccrual(data.orgId, existing.id);

    const [updated] = await db
      .update(citFilings)
      .set({
        accountingProfit: projection.projectedFullYearProfit,
        taxableIncome: projection.projectedFullYearProfit,
        citCalculated: projection.annualCit,
        pnd51Method: "projected_full_year",
        pnd51ProjectedFullYearProfit: projection.projectedFullYearProfit,
        pnd51H1ActualProfit: null,
        pnd51EstimateRationale: data.rationale || null,
        citPayable: projection.prepaymentDue,
        updatedAt: new Date(),
      })
      .where(
        and(
          ...orgScopeAlive(citFilings, data.orgId),
          eq(citFilings.id, existing.id)
        )
      )
      .returning();
    return updated;
  }

  const [filing] = await db.insert(citFilings).values(values).returning();

  return filing;
}

async function getPeriodProfit(data: {
  orgId: string;
  periodStart: string;
  periodEnd: string;
}) {
  const rows = await db
    .select({
      accountType: glAccounts.accountType,
      debitTotal: sql<string>`COALESCE(SUM(${journalLines.debitAmount}), 0)::numeric(14,2)::text`,
      creditTotal: sql<string>`COALESCE(SUM(${journalLines.creditAmount}), 0)::numeric(14,2)::text`,
    })
    .from(journalLines)
    .innerJoin(
      journalEntries,
      and(
        eq(journalEntries.id, journalLines.journalEntryId),
        eq(journalEntries.orgId, data.orgId),
        sql`${journalEntries.entryDate} >= ${data.periodStart}::date`,
        sql`${journalEntries.entryDate} <= ${data.periodEnd}::date`,
        eq(journalEntries.isReversal, false),
        isNull(journalEntries.reversedByEntryId),
        sql`COALESCE(${journalEntries.postingKind}::text, '') NOT IN ('year_end_close_revenue_summary', 'year_end_close_to_retained_earnings')`
      )
    )
    .innerJoin(
      glAccounts,
      and(
        eq(glAccounts.id, journalLines.accountId),
        eq(glAccounts.orgId, data.orgId)
      )
    )
    .where(
      and(
        eq(journalLines.orgId, data.orgId),
        sql`${glAccounts.accountType} IN ('revenue', 'cogs', 'expense')`,
        sql`${glAccounts.deletedAt} IS NULL`
      )
    )
    .groupBy(glAccounts.accountType);

  let revenue = 0;
  let cogs = 0;
  let expenses = 0;
  for (const row of rows) {
    const debit = Number(row.debitTotal);
    const credit = Number(row.creditTotal);
    if (row.accountType === "revenue") revenue += credit - debit;
    if (row.accountType === "cogs") cogs += debit - credit;
    if (row.accountType === "expense") expenses += debit - credit;
  }

  return {
    revenueTotal: revenue.toFixed(2),
    cogsTotal: cogs.toFixed(2),
    expenseTotal: expenses.toFixed(2),
    accountingProfit: (revenue - cogs - expenses).toFixed(2),
  };
}

export async function buildActualH1Pnd51Draft(data: {
  orgId: string;
  taxYear: number;
  entityType: "standard" | "sme_qualifying";
  rationale?: string;
}) {
  const periodStart = `${data.taxYear}-01-01`;
  const periodEnd = `${data.taxYear}-06-30`;
  const brackets = await db
    .select()
    .from(citBrackets)
    .where(eq(citBrackets.entityType, data.entityType))
    .orderBy(asc(citBrackets.lowerBound));

  if (brackets.length === 0) throw new Error("CIT brackets are not configured");

  const h1 = await getPeriodProfit({
    orgId: data.orgId,
    periodStart,
    periodEnd,
  });
  const annualizedProfit = (Number(h1.accountingProfit) * 2).toFixed(2);
  const annualCit = computeProgressiveCit(annualizedProfit, brackets);
  const projection = computeProjectedPnd51({
    projectedFullYearProfit: annualizedProfit,
    annualCit,
  });

  const [existing] = await db
    .select({ id: citFilings.id, filingStatus: citFilings.filingStatus })
    .from(citFilings)
    .where(
      and(
        ...orgScopeAlive(citFilings, data.orgId),
        eq(citFilings.taxYear, data.taxYear),
        eq(citFilings.filingType, "pnd51"),
        eq(citFilings.isAmendment, false)
      )
    )
    .limit(1);

  const values = {
    orgId: data.orgId,
    taxYear: data.taxYear,
    filingType: "pnd51",
    periodStart,
    periodEnd,
    filingStatus: "draft",
    revenueTotal: h1.revenueTotal,
    cogsTotal: h1.cogsTotal,
    expenseTotal: h1.expenseTotal,
    accountingProfit: h1.accountingProfit,
    taxableIncome: projection.projectedFullYearProfit,
    citRate: data.entityType === "standard" ? "0.2000" : null,
    citCalculated: projection.annualCit,
    pnd51Method: "actual_h1_books",
    pnd51ProjectedFullYearProfit: projection.projectedFullYearProfit,
    pnd51H1ActualProfit: h1.accountingProfit,
    pnd51EstimateRationale: data.rationale || null,
    citPayable: projection.prepaymentDue,
  };

  if (existing) {
    if (existing.filingStatus !== "draft") {
      throw new Error("Submitted CIT filings cannot be rebuilt; use an amendment workflow");
    }
    await assertNoActiveCitAccrual(data.orgId, existing.id);

    const [updated] = await db
      .update(citFilings)
      .set({ ...values, updatedAt: new Date() })
      .where(
        and(
          ...orgScopeAlive(citFilings, data.orgId),
          eq(citFilings.id, existing.id)
        )
      )
      .returning();
    return updated;
  }

  const [filing] = await db.insert(citFilings).values(values).returning();
  return filing;
}

async function previewPnd50LossApplication(data: {
  orgId: string;
  taxYear: number;
  taxableIncomeBeforeLosses: number;
}) {
  if (data.taxableIncomeBeforeLosses <= 0) {
    return {
      taxableIncome: data.taxableIncomeBeforeLosses.toFixed(2),
      taxableLoss: Math.abs(data.taxableIncomeBeforeLosses).toFixed(2),
      lossesConsumedThisYear: "0.00",
    };
  }

  const layers = await db
    .select()
    .from(lossCarryForwardLayers)
    .where(
      and(
        ...orgScopeAlive(lossCarryForwardLayers, data.orgId),
        isNull(lossCarryForwardLayers.expiredAt),
        sql`${lossCarryForwardLayers.remainingAmount} > 0`,
        sql`${lossCarryForwardLayers.originatedTaxYear} < ${data.taxYear}`,
        sql`${lossCarryForwardLayers.expiryTaxYear} >= ${data.taxYear}`
      )
    )
    .orderBy(asc(lossCarryForwardLayers.originatedTaxYear));
  const preview = computeLossCarryForwardConsumption({
    taxableIncome: data.taxableIncomeBeforeLosses.toFixed(2),
    layers,
  });

  return {
    taxableIncome: preview.taxableIncomeAfterLosses,
    taxableLoss: null,
    lossesConsumedThisYear: preview.totalLossesConsumed,
  };
}

export async function buildPnd50DraftFromManualProfit(data: {
  orgId: string;
  taxYear: number;
  entityType: "standard" | "sme_qualifying";
  accountingProfit: string;
}) {
  if (!Number.isFinite(Number(data.accountingProfit))) {
    throw new Error("Accounting profit must be a valid number");
  }
  const brackets = await db
    .select()
    .from(citBrackets)
    .where(eq(citBrackets.entityType, data.entityType))
    .orderBy(asc(citBrackets.lowerBound));
  if (brackets.length === 0) throw new Error("CIT brackets are not configured");

  const adjustments = await db
    .select()
    .from(bookTaxAdjustments)
    .where(
      and(
        eq(bookTaxAdjustments.orgId, data.orgId),
        eq(bookTaxAdjustments.taxYear, data.taxYear)
      )
    );
  const adjustmentTotal = adjustments.reduce((sum, adjustment) => {
    const amount = Number(adjustment.amount ?? "0");
    return adjustment.direction === "add_back" ? sum + amount : sum - amount;
  }, 0);
  const taxableIncomeBeforeLosses = Number(data.accountingProfit) + adjustmentTotal;
  const lossPreview = await previewPnd50LossApplication({
    orgId: data.orgId,
    taxYear: data.taxYear,
    taxableIncomeBeforeLosses,
  });
  const citCalculated = computeProgressiveCit(lossPreview.taxableIncome, brackets);
  const whtCreditsUsed = await getWhtCreditsReceivedTotal(data.orgId, data.taxYear);
  const [pnd51Credits] = await db
    .select({
      total: sql<string>`COALESCE(SUM(${citFilings.citPayable}), 0)::numeric(14,2)::text`,
    })
    .from(citFilings)
    .where(
      and(
        ...orgScopeAlive(citFilings, data.orgId),
        eq(citFilings.taxYear, data.taxYear),
        eq(citFilings.filingType, "pnd51"),
        eq(citFilings.isAmendment, false),
        sql`${citFilings.paidAt} IS NOT NULL`
      )
    );
  const prepaymentCreditsUsed = pnd51Credits?.total ?? "0.00";
  const citPayable = (
    Number(citCalculated) -
    Number(whtCreditsUsed) -
    Number(prepaymentCreditsUsed)
  ).toFixed(2);

  const values = {
    orgId: data.orgId,
    taxYear: data.taxYear,
    filingType: "pnd50",
    periodStart: `${data.taxYear}-01-01`,
    periodEnd: `${data.taxYear}-12-31`,
    filingStatus: "draft",
    revenueTotal: null,
    cogsTotal: null,
    expenseTotal: null,
    accountingProfit: Number(data.accountingProfit).toFixed(2),
    bookTaxAdjustmentsPayload: adjustments.map((adjustment) => ({
      id: adjustment.id,
      description: adjustment.description,
      category: adjustment.category,
      direction: adjustment.direction,
      amount: adjustment.amount,
    })),
    taxableIncome: lossPreview.taxableIncome,
    taxableLoss: lossPreview.taxableLoss,
    lossesConsumedThisYear: lossPreview.lossesConsumedThisYear,
    citRate: data.entityType === "standard" ? "0.2000" : null,
    citCalculated,
    whtCreditsUsed,
    prepaymentCreditsUsed,
    citPayable,
  };

  const [existing] = await db
    .select({ id: citFilings.id, filingStatus: citFilings.filingStatus })
    .from(citFilings)
    .where(
      and(
        ...orgScopeAlive(citFilings, data.orgId),
        eq(citFilings.taxYear, data.taxYear),
        eq(citFilings.filingType, "pnd50"),
        eq(citFilings.isAmendment, false)
      )
    )
    .limit(1);

  if (existing) {
    if (existing.filingStatus !== "draft") {
      throw new Error("Submitted CIT filings cannot be rebuilt; use an amendment workflow");
    }
    await assertNoActiveCitAccrual(data.orgId, existing.id);

    const [updated] = await db
      .update(citFilings)
      .set({ ...values, updatedAt: new Date() })
      .where(
        and(
          ...orgScopeAlive(citFilings, data.orgId),
          eq(citFilings.id, existing.id)
        )
      )
      .returning();
    return updated;
  }

  const [filing] = await db.insert(citFilings).values(values).returning();
  return filing;
}

export async function buildPnd50DraftFromGlProfit(data: {
  orgId: string;
  taxYear: number;
  entityType: "standard" | "sme_qualifying";
}) {
  const brackets = await db
    .select()
    .from(citBrackets)
    .where(eq(citBrackets.entityType, data.entityType))
    .orderBy(asc(citBrackets.lowerBound));
  if (brackets.length === 0) throw new Error("CIT brackets are not configured");

  const yearProfit = await getPeriodProfit({
    orgId: data.orgId,
    periodStart: `${data.taxYear}-01-01`,
    periodEnd: `${data.taxYear}-12-31`,
  });
  const adjustments = await db
    .select()
    .from(bookTaxAdjustments)
    .where(
      and(
        eq(bookTaxAdjustments.orgId, data.orgId),
        eq(bookTaxAdjustments.taxYear, data.taxYear)
      )
    );
  const adjustmentTotal = adjustments.reduce((sum, adjustment) => {
    const amount = Number(adjustment.amount ?? "0");
    return adjustment.direction === "add_back" ? sum + amount : sum - amount;
  }, 0);
  const taxableIncomeBeforeLosses = Number(yearProfit.accountingProfit) + adjustmentTotal;
  const lossPreview = await previewPnd50LossApplication({
    orgId: data.orgId,
    taxYear: data.taxYear,
    taxableIncomeBeforeLosses,
  });
  const citCalculated = computeProgressiveCit(lossPreview.taxableIncome, brackets);
  const whtCreditsUsed = await getWhtCreditsReceivedTotal(data.orgId, data.taxYear);
  const [pnd51Credits] = await db
    .select({
      total: sql<string>`COALESCE(SUM(${citFilings.citPayable}), 0)::numeric(14,2)::text`,
    })
    .from(citFilings)
    .where(
      and(
        ...orgScopeAlive(citFilings, data.orgId),
        eq(citFilings.taxYear, data.taxYear),
        eq(citFilings.filingType, "pnd51"),
        eq(citFilings.isAmendment, false),
        sql`${citFilings.paidAt} IS NOT NULL`
      )
    );
  const prepaymentCreditsUsed = pnd51Credits?.total ?? "0.00";
  const citPayable = (
    Number(citCalculated) -
    Number(whtCreditsUsed) -
    Number(prepaymentCreditsUsed)
  ).toFixed(2);

  const values = {
    orgId: data.orgId,
    taxYear: data.taxYear,
    filingType: "pnd50",
    periodStart: `${data.taxYear}-01-01`,
    periodEnd: `${data.taxYear}-12-31`,
    filingStatus: "draft",
    revenueTotal: yearProfit.revenueTotal,
    cogsTotal: yearProfit.cogsTotal,
    expenseTotal: yearProfit.expenseTotal,
    accountingProfit: yearProfit.accountingProfit,
    bookTaxAdjustmentsPayload: adjustments.map((adjustment) => ({
      id: adjustment.id,
      description: adjustment.description,
      category: adjustment.category,
      direction: adjustment.direction,
      amount: adjustment.amount,
    })),
    taxableIncome: lossPreview.taxableIncome,
    taxableLoss: lossPreview.taxableLoss,
    lossesConsumedThisYear: lossPreview.lossesConsumedThisYear,
    citRate: data.entityType === "standard" ? "0.2000" : null,
    citCalculated,
    whtCreditsUsed,
    prepaymentCreditsUsed,
    citPayable,
  };

  const [existing] = await db
    .select({ id: citFilings.id, filingStatus: citFilings.filingStatus })
    .from(citFilings)
    .where(
      and(
        ...orgScopeAlive(citFilings, data.orgId),
        eq(citFilings.taxYear, data.taxYear),
        eq(citFilings.filingType, "pnd50"),
        eq(citFilings.isAmendment, false)
      )
    )
    .limit(1);

  if (existing) {
    if (existing.filingStatus !== "draft") {
      throw new Error("Submitted CIT filings cannot be rebuilt; use an amendment workflow");
    }
    await assertNoActiveCitAccrual(data.orgId, existing.id);

    const [updated] = await db
      .update(citFilings)
      .set({ ...values, updatedAt: new Date() })
      .where(
        and(
          ...orgScopeAlive(citFilings, data.orgId),
          eq(citFilings.id, existing.id)
        )
      )
      .returning();
    return updated;
  }

  const [filing] = await db.insert(citFilings).values(values).returning();
  return filing;
}

export async function refreshTransferPricingRequirementFromGl(data: {
  orgId: string;
  taxYear: number;
}) {
  const yearProfit = await getPeriodProfit({
    orgId: data.orgId,
    periodStart: `${data.taxYear}-01-01`,
    periodEnd: `${data.taxYear}-12-31`,
  });
  const required = Number(yearProfit.revenueTotal) > 200_000_000;

  const [organization] = await db
    .update(organizations)
    .set({ transferPricingRequired: required, updatedAt: new Date() })
    .where(eq(organizations.id, data.orgId))
    .returning({
      id: organizations.id,
      transferPricingRequired: organizations.transferPricingRequired,
    });

  return {
    organizationId: organization.id,
    taxYear: data.taxYear,
    revenueTotal: yearProfit.revenueTotal,
    transferPricingRequired: organization.transferPricingRequired,
  };
}

export async function buildTransferPricingDisclosureDraft(data: {
  orgId: string;
  taxYear: number;
  relatedPartyTransactionsText: string;
  notes?: string;
  preparedByUserId?: string;
}) {
  const threshold = await refreshTransferPricingRequirementFromGl({
    orgId: data.orgId,
    taxYear: data.taxYear,
  });
  const payload = parseTransferPricingTransactionLines(
    data.relatedPartyTransactionsText
  );

  const values = {
    orgId: data.orgId,
    taxYear: data.taxYear,
    status: "draft",
    revenueTotal: threshold.revenueTotal,
    disclosureRequired: threshold.transferPricingRequired,
    relatedPartyTransactionsPayload: payload,
    notes: data.notes || null,
    preparedByUserId: data.preparedByUserId,
    updatedAt: new Date(),
  };

  const [existing] = await db
    .select({ id: transferPricingDisclosures.id, status: transferPricingDisclosures.status })
    .from(transferPricingDisclosures)
    .where(
      and(
        eq(transferPricingDisclosures.orgId, data.orgId),
        eq(transferPricingDisclosures.taxYear, data.taxYear)
      )
    )
    .limit(1);

  if (existing && existing.status !== "draft") {
    throw new Error("Submitted transfer pricing disclosures cannot be rebuilt");
  }

  const [disclosure] = existing
    ? await db
        .update(transferPricingDisclosures)
        .set(values)
        .where(
          and(
            eq(transferPricingDisclosures.orgId, data.orgId),
            eq(transferPricingDisclosures.id, existing.id)
          )
        )
        .returning()
    : await db.insert(transferPricingDisclosures).values(values).returning();

  await db.insert(auditLog).values({
    orgId: data.orgId,
    entityType: "transfer_pricing_disclosure",
    entityId: disclosure.id,
    action: existing ? "update" : "create",
    newValue: {
      taxYear: disclosure.taxYear,
      revenueTotal: disclosure.revenueTotal,
      disclosureRequired: disclosure.disclosureRequired,
      preparedByUserId: data.preparedByUserId,
    },
  });

  return disclosure;
}

export async function submitTransferPricingDisclosure(data: {
  orgId: string;
  disclosureId: string;
  submittedByUserId?: string;
}) {
  return db.transaction(async (tx) => {
    const [disclosure] = await tx
      .select()
      .from(transferPricingDisclosures)
      .where(
        and(
          eq(transferPricingDisclosures.orgId, data.orgId),
          eq(transferPricingDisclosures.id, data.disclosureId)
        )
      )
      .limit(1);

    if (!disclosure) {
      throw new Error("Transfer pricing disclosure not found");
    }
    if (disclosure.status !== "draft") {
      throw new Error("Only draft transfer pricing disclosures can be submitted");
    }
    if (
      disclosure.disclosureRequired &&
      (!Array.isArray(disclosure.relatedPartyTransactionsPayload) ||
        disclosure.relatedPartyTransactionsPayload.length === 0)
    ) {
      throw new Error("Related-party transaction detail is required before submission");
    }

    const [submitted] = await tx
      .update(transferPricingDisclosures)
      .set({
        status: "submitted",
        submittedAt: new Date(),
        preparedByUserId:
          disclosure.preparedByUserId ?? data.submittedByUserId ?? null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(transferPricingDisclosures.orgId, data.orgId),
          eq(transferPricingDisclosures.id, disclosure.id)
        )
      )
      .returning();

    await tx.insert(auditLog).values({
      orgId: data.orgId,
      entityType: "transfer_pricing_disclosure",
      entityId: submitted.id,
      action: "update",
      oldValue: { status: disclosure.status },
      newValue: {
        status: submitted.status,
        submittedByUserId: data.submittedByUserId,
        submittedAt: submitted.submittedAt,
      },
    });

    return submitted;
  });
}

export async function recordBookTaxAdjustment(data: {
  orgId: string;
  taxYear: number;
  description: string;
  amount: string;
  direction: "add_back" | "deduct";
  category: string;
  notes?: string;
  glAccountId?: string;
}) {
  if (!BOOK_TAX_ADJUSTMENT_CATEGORIES.has(data.category)) {
    throw new Error("Unsupported book-tax adjustment category");
  }
  if (!Number.isFinite(Number(data.amount)) || Number(data.amount) <= 0) {
    throw new Error("Book-tax adjustment amount must be positive");
  }

  return db.transaction(async (tx) => {
    if (data.glAccountId) {
      const [account] = await tx
        .select({ id: glAccounts.id })
        .from(glAccounts)
        .where(
          and(
            ...orgScopeAlive(glAccounts, data.orgId),
            eq(glAccounts.id, data.glAccountId)
          )
        )
        .limit(1);
      if (!account) {
        throw new Error("GL account does not belong to this organization");
      }
    }

    const [adjustment] = await tx
      .insert(bookTaxAdjustments)
      .values({
        orgId: data.orgId,
        taxYear: data.taxYear,
        description: data.description,
        amount: Number(data.amount).toFixed(2),
        direction: data.direction,
        category: data.category,
        notes: data.notes || null,
        glAccountId: data.glAccountId || null,
      })
      .returning();

    const [log] = await tx
      .insert(auditLog)
      .values({
        orgId: data.orgId,
        entityType: "book_tax_adjustment",
        entityId: adjustment.id,
        action: "create",
        newValue: {
          taxYear: adjustment.taxYear,
          description: adjustment.description,
          amount: adjustment.amount,
          direction: adjustment.direction,
          category: adjustment.category,
          glAccountId: adjustment.glAccountId,
        },
      })
      .returning({ id: auditLog.id });

    const [withAuditRef] = await tx
      .update(bookTaxAdjustments)
      .set({ auditLogRef: log.id, updatedAt: new Date() })
      .where(
        and(
          eq(bookTaxAdjustments.orgId, data.orgId),
          eq(bookTaxAdjustments.id, adjustment.id)
        )
      )
      .returning();

    return withAuditRef;
  });
}

export async function submitCitFiling(data: {
  orgId: string;
  filingId: string;
  submittedByUserId?: string;
  rdReferenceNumber?: string;
}) {
  return db.transaction(async (tx) => {
    const [filing] = await tx
      .select()
      .from(citFilings)
      .where(
        and(
          ...orgScopeAlive(citFilings, data.orgId),
          eq(citFilings.id, data.filingId)
        )
      )
      .limit(1);

    if (!filing) {
      throw new Error("CIT filing not found");
    }
    if (filing.filingStatus !== "draft") {
      throw new Error("Only draft CIT filings can be submitted");
    }

    let lossConsumptionPayload: unknown[] | null = null;
    if (
      filing.filingType === "pnd50" &&
      Number(filing.lossesConsumedThisYear ?? "0") > 0
    ) {
      const taxableBeforeLosses =
        Number(filing.taxableIncome ?? "0") +
        Number(filing.lossesConsumedThisYear ?? "0");
      const layers = await tx
        .select()
        .from(lossCarryForwardLayers)
        .where(
          and(
            ...orgScopeAlive(lossCarryForwardLayers, data.orgId),
            isNull(lossCarryForwardLayers.expiredAt),
            sql`${lossCarryForwardLayers.remainingAmount} > 0`,
            sql`${lossCarryForwardLayers.originatedTaxYear} < ${filing.taxYear}`,
            sql`${lossCarryForwardLayers.expiryTaxYear} >= ${filing.taxYear}`
          )
        )
        .orderBy(asc(lossCarryForwardLayers.originatedTaxYear))
        .for("update");
      const consumption = computeLossCarryForwardConsumption({
        taxableIncome: taxableBeforeLosses.toFixed(2),
        layers,
      });

      if (consumption.totalLossesConsumed !== filing.lossesConsumedThisYear) {
        throw new Error("Loss carry-forward layers changed; rebuild PND.50 draft");
      }

      for (const item of consumption.consumption) {
        await tx
          .update(lossCarryForwardLayers)
          .set({
            remainingAmount: item.remainingAmountAfter,
            updatedAt: new Date(),
          })
          .where(
            and(
              ...orgScopeAlive(lossCarryForwardLayers, data.orgId),
              eq(lossCarryForwardLayers.id, item.layerId)
            )
          );
      }
      lossConsumptionPayload = consumption.consumption;
    }

    const [submitted] = await tx
      .update(citFilings)
      .set({
        filingStatus: "submitted",
        submittedAt: new Date(),
        rdReferenceNumber: data.rdReferenceNumber || filing.rdReferenceNumber,
        lossCarryForwardConsumptionPayload: lossConsumptionPayload,
        updatedAt: new Date(),
      })
      .where(
        and(
          ...orgScopeAlive(citFilings, data.orgId),
          eq(citFilings.id, data.filingId)
        )
      )
      .returning();

    await tx.insert(auditLog).values({
      orgId: data.orgId,
      entityType: "cit_filing",
      entityId: submitted.id,
      action: "update",
      newValue: {
        filingType: submitted.filingType,
        taxYear: submitted.taxYear,
        submittedByUserId: data.submittedByUserId,
        rdReferenceNumber: submitted.rdReferenceNumber,
      },
    });

    return submitted;
  });
}

export async function acceptCitFiling(data: {
  orgId: string;
  filingId: string;
  acceptedByUserId?: string;
}) {
  return db.transaction(async (tx) => {
    const [filing] = await tx
      .select()
      .from(citFilings)
      .where(
        and(
          ...orgScopeAlive(citFilings, data.orgId),
          eq(citFilings.id, data.filingId)
        )
      )
      .limit(1);

    if (!filing) {
      throw new Error("CIT filing not found");
    }
    if (filing.filingStatus !== "submitted") {
      throw new Error("Only submitted CIT filings can be accepted");
    }

    const [accepted] = await tx
      .update(citFilings)
      .set({
        filingStatus: "accepted",
        acceptedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          ...orgScopeAlive(citFilings, data.orgId),
          eq(citFilings.id, data.filingId)
        )
      )
      .returning();

    await tx.insert(auditLog).values({
      orgId: data.orgId,
      entityType: "cit_filing",
      entityId: accepted.id,
      action: "update",
      newValue: {
        filingType: accepted.filingType,
        taxYear: accepted.taxYear,
        acceptedByUserId: data.acceptedByUserId,
      },
    });

    return accepted;
  });
}

export async function listCitFilingsForYear(orgId: string, taxYear: number) {
  return db
    .select()
    .from(citFilings)
    .where(
      and(
        ...orgScopeAlive(citFilings, orgId),
        eq(citFilings.taxYear, taxYear)
      )
    )
    .orderBy(asc(citFilings.filingType));
}

export async function syncFixedAssetDepreciationBookTaxAdjustment(data: {
  orgId: string;
  taxYear: number;
}) {
  return db.transaction(async (tx) => {
    const [summary] = await tx
      .select({
        amount: sql<string>`COALESCE(SUM(${depreciationSchedule.bookTaxDifference}), 0)::numeric(14,2)`,
      })
      .from(depreciationSchedule)
      .innerJoin(
        fixedAssets,
        and(
          eq(fixedAssets.id, depreciationSchedule.fixedAssetId),
          eq(fixedAssets.orgId, depreciationSchedule.orgId)
        )
      )
      .where(
        and(
          ...orgScopeAlive(depreciationSchedule, data.orgId),
          ...orgScope(fixedAssets, data.orgId),
          eq(depreciationSchedule.periodYear, data.taxYear),
          sql`${depreciationSchedule.bookTaxDifference} > 0`
        )
      );

    await tx
      .delete(bookTaxAdjustments)
      .where(
        and(
          eq(bookTaxAdjustments.orgId, data.orgId),
          eq(bookTaxAdjustments.taxYear, data.taxYear),
          eq(bookTaxAdjustments.category, "depreciation_method_difference"),
          eq(bookTaxAdjustments.notes, FIXED_ASSET_DEPRECIATION_ADJUSTMENT_NOTE)
        )
      );

    const amount = Number(summary?.amount ?? "0");
    if (amount <= 0) {
      return null;
    }

    const [adjustment] = await tx
      .insert(bookTaxAdjustments)
      .values({
        orgId: data.orgId,
        taxYear: data.taxYear,
        description: "Fixed asset depreciation tax ceiling difference",
        amount: amount.toFixed(2),
        direction: "add_back",
        category: "depreciation_method_difference",
        notes: FIXED_ASSET_DEPRECIATION_ADJUSTMENT_NOTE,
      })
      .returning();

    return adjustment;
  });
}

export async function syncEntertainmentExpenseBookTaxAdjustment(data: {
  orgId: string;
  taxYear: number;
}) {
  return db.transaction(async (tx) => {
    const periodStart = `${data.taxYear}-01-01`;
    const periodEnd = `${data.taxYear}-12-31`;
    const [summary] = await tx
      .select({
        revenueTotal: sql<string>`COALESCE(SUM(CASE WHEN ${glAccounts.accountType} = 'revenue' THEN ${journalLines.creditAmount} - ${journalLines.debitAmount} ELSE 0 END), 0)::numeric(14,2)::text`,
        entertainmentExpense: sql<string>`COALESCE(SUM(CASE WHEN ${glAccounts.accountSubtype} = 'entertainment' THEN ${journalLines.debitAmount} - ${journalLines.creditAmount} ELSE 0 END), 0)::numeric(14,2)::text`,
      })
      .from(journalLines)
      .innerJoin(
        journalEntries,
        and(
          eq(journalEntries.id, journalLines.journalEntryId),
          eq(journalEntries.orgId, data.orgId),
          sql`${journalEntries.entryDate} >= ${periodStart}::date`,
          sql`${journalEntries.entryDate} <= ${periodEnd}::date`
        )
      )
      .innerJoin(
        glAccounts,
        and(
          eq(glAccounts.id, journalLines.accountId),
          eq(glAccounts.orgId, data.orgId)
        )
      )
      .where(
        and(
          eq(journalLines.orgId, data.orgId),
          sql`${glAccounts.deletedAt} IS NULL`
        )
      );

    await tx
      .delete(bookTaxAdjustments)
      .where(
        and(
          eq(bookTaxAdjustments.orgId, data.orgId),
          eq(bookTaxAdjustments.taxYear, data.taxYear),
          eq(bookTaxAdjustments.category, "entertainment_cap_excess"),
          eq(bookTaxAdjustments.notes, ENTERTAINMENT_CAP_ADJUSTMENT_NOTE)
        )
      );

    const entertainmentExpense = Math.max(
      0,
      Number(summary?.entertainmentExpense ?? "0")
    );
    const revenueTotal = Math.max(0, Number(summary?.revenueTotal ?? "0"));
    const revenueCap = Math.min(revenueTotal * 0.003, 10_000_000);
    const addBack = Math.max(0, entertainmentExpense - revenueCap);
    if (addBack <= 0) {
      return null;
    }

    const [adjustment] = await tx
      .insert(bookTaxAdjustments)
      .values({
        orgId: data.orgId,
        taxYear: data.taxYear,
        description: "Entertainment expense cap excess",
        amount: addBack.toFixed(2),
        direction: "add_back",
        category: "entertainment_cap_excess",
        notes: ENTERTAINMENT_CAP_ADJUSTMENT_NOTE,
      })
      .returning();

    return adjustment;
  });
}

export async function listLossCarryForwardLayers(orgId: string) {
  return db
    .select()
    .from(lossCarryForwardLayers)
    .where(eq(lossCarryForwardLayers.orgId, orgId))
    .orderBy(asc(lossCarryForwardLayers.originatedTaxYear));
}

export async function recordLossCarryForwardLayer(data: {
  orgId: string;
  originatedTaxYear: number;
  originalAmount: string;
}) {
  const [layer] = await db
    .insert(lossCarryForwardLayers)
    .values({
      orgId: data.orgId,
      originatedTaxYear: data.originatedTaxYear,
      expiryTaxYear: data.originatedTaxYear + 5,
      originalAmount: data.originalAmount,
      remainingAmount: data.originalAmount,
    })
    .returning();

  return layer;
}

export async function expireLossCarryForwardLayers(data: {
  orgId: string;
  taxYear: number;
  expiredByUserId?: string;
}) {
  if (!Number.isInteger(data.taxYear) || data.taxYear < 2000) {
    throw new Error("Tax year is required");
  }

  return db.transaction(async (tx) => {
    const layers = await tx
      .select()
      .from(lossCarryForwardLayers)
      .where(
        and(
          eq(lossCarryForwardLayers.orgId, data.orgId),
          isNull(lossCarryForwardLayers.expiredAt),
          sql`${lossCarryForwardLayers.expiryTaxYear} < ${data.taxYear}`,
          sql`${lossCarryForwardLayers.remainingAmount} > 0`
        )
      )
      .orderBy(asc(lossCarryForwardLayers.originatedTaxYear))
      .for("update");

    if (layers.length === 0) {
      return { expiredCount: 0, forfeitedAmount: "0.00", expiredLayerIds: [] };
    }

    const expiryYears = Array.from(
      new Set(layers.map((layer) => layer.expiryTaxYear))
    );
    const filedRows = await tx
      .select({
        taxYear: citFilings.taxYear,
        filingStatus: citFilings.filingStatus,
      })
      .from(citFilings)
      .where(
        and(
          ...orgScopeAlive(citFilings, data.orgId),
          eq(citFilings.filingType, "pnd50"),
          eq(citFilings.isAmendment, false),
          inArray(citFilings.taxYear, expiryYears)
        )
      );
    const filedByYear = new Map(
      filedRows.map((row) => [row.taxYear, row.filingStatus])
    );
    const unfiledExpiryYears = expiryYears.filter((year) => {
      const status = filedByYear.get(year);
      return status !== "submitted" && status !== "accepted";
    });
    if (unfiledExpiryYears.length > 0) {
      throw new Error(
        `Submit PND.50 for tax year ${unfiledExpiryYears.sort().join(", ")} before expiring related loss layers`
      );
    }

    const expiredAt = new Date();
    let forfeitedCents = 0;
    for (const layer of layers) {
      forfeitedCents += Math.round(Number(layer.remainingAmount) * 100);
      await tx
        .update(lossCarryForwardLayers)
        .set({
          remainingAmount: "0.00",
          expiredAt,
          updatedAt: expiredAt,
        })
        .where(
          and(
            eq(lossCarryForwardLayers.orgId, data.orgId),
            eq(lossCarryForwardLayers.id, layer.id),
            isNull(lossCarryForwardLayers.expiredAt)
          )
        );
    }

    await tx.insert(auditLog).values(
      layers.map((layer) => ({
        orgId: data.orgId,
        entityType: "loss_carry_forward_layers",
        entityId: layer.id,
        action: "update" as const,
        oldValue: {
          remainingAmount: layer.remainingAmount,
          expiredAt: layer.expiredAt,
        },
        newValue: {
          event: "loss_carry_forward_layer_expired",
          taxYear: data.taxYear,
          expiredByUserId: data.expiredByUserId ?? null,
          forfeitedAmount: layer.remainingAmount,
          source: {
            authority: "Thai Revenue Code Section 65 Ter (12)",
            url: "https://www.rd.go.th/english/37764.html",
            citationVerifiedAt: "2026-05-16",
          },
        },
      }))
    );

    return {
      expiredCount: layers.length,
      forfeitedAmount: (forfeitedCents / 100).toFixed(2),
      expiredLayerIds: layers.map((layer) => layer.id),
    };
  });
}

export async function consumeLossCarryForwardLayers(data: {
  orgId: string;
  taxYear: number;
  taxableIncome: string;
}) {
  return db.transaction(async (tx) => {
    const layers = await tx
      .select()
      .from(lossCarryForwardLayers)
      .where(
        and(
          eq(lossCarryForwardLayers.orgId, data.orgId),
          isNull(lossCarryForwardLayers.expiredAt),
          sql`${lossCarryForwardLayers.originatedTaxYear} < ${data.taxYear}`,
          sql`${lossCarryForwardLayers.expiryTaxYear} >= ${data.taxYear}`,
          sql`${lossCarryForwardLayers.remainingAmount} > 0`
        )
      )
      .orderBy(asc(lossCarryForwardLayers.originatedTaxYear))
      .for("update");

    const result = computeLossCarryForwardConsumption({
      taxableIncome: data.taxableIncome,
      layers,
    });

    for (const item of result.consumption) {
      await tx
        .update(lossCarryForwardLayers)
        .set({
          remainingAmount: item.remainingAmountAfter,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(lossCarryForwardLayers.orgId, data.orgId),
            eq(lossCarryForwardLayers.id, item.layerId)
          )
        );
    }

    return result;
  });
}
