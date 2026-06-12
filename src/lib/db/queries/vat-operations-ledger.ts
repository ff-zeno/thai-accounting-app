import { createHash } from "crypto";
import { and, eq, sql } from "drizzle-orm";
import type { DbConnection } from "../index";
import {
  auditLog,
  exceptionQueue,
  periodLocks,
  postingOutbox,
  pp36Obligations,
  taxPaymentEvents,
  taxPaymentEventTypeEnum,
  taxInvoiceSubtypeEnum,
  taxTreatmentDecisions,
  vatCreditCarryforwards,
  vatFilingLines,
  vatFilings,
  vatInputItems,
  vatOutputItems,
  establishments,
  vendors,
  type pp36PeriodBasisEnum,
  type taxTreatmentReviewStatusEnum,
  type taxTreatmentTypeEnum,
  type vatFilingKindEnum,
  type vatFilingLineTypeEnum,
  type vatFilingTypeEnum,
  type vatInputStatusEnum,
  type vatOutputStatusEnum,
  type vatOutputTaxPointBasisEnum,
} from "../schema";
import {
  DEFAULT_TAX_CONFIG,
  formatBangkokDate,
  pp30EfilingDeadline,
  pp36Deadline,
} from "@/lib/tax/filing-deadlines";

type EnumValue<T extends { enumValues: readonly string[] }> = T["enumValues"][number];

export type TaxTreatmentType = EnumValue<typeof taxTreatmentTypeEnum>;
export type TaxTreatmentReviewStatus = EnumValue<typeof taxTreatmentReviewStatusEnum>;
export type VatInputStatus = EnumValue<typeof vatInputStatusEnum>;
export type VatOutputStatus = EnumValue<typeof vatOutputStatusEnum>;
export type VatFilingType = EnumValue<typeof vatFilingTypeEnum>;
export type VatFilingKind = EnumValue<typeof vatFilingKindEnum>;
export type VatFilingLineType = EnumValue<typeof vatFilingLineTypeEnum>;
export type Pp36PeriodBasis = EnumValue<typeof pp36PeriodBasisEnum>;
export type VatOutputTaxPointBasis = EnumValue<typeof vatOutputTaxPointBasisEnum>;
export type TaxInvoiceSubtype = EnumValue<typeof taxInvoiceSubtypeEnum>;
export type TaxPaymentEventType = EnumValue<typeof taxPaymentEventTypeEnum>;
type VatFilingLockDomain = "vat_pp30" | "vat_pp36";
type VatPeriod = { year: number; month: number };
const CLAIMED_INPUT_VAT_STATUSES = new Set<VatInputStatus>([
  "claimable",
  "allocated_to_draft",
  "filed",
]);
const ORDINARY_PP30_ITEM_STATUSES = new Set<string>([
  "claimable",
  "allocated_to_draft",
  "filed",
  "reportable",
]);

export type VatSourceSnapshot = Record<string, unknown>;

interface WithConnection {
  tx?: DbConnection;
}

interface WithSnapshot {
  sourceSnapshot: VatSourceSnapshot;
}

export class VatLedgerStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VatLedgerStateError";
  }
}

async function getConnection(tx?: DbConnection) {
  if (tx) return tx;
  const { db } = await import("../index");
  return db;
}

export function stableVatJson(value: unknown): string {
  return JSON.stringify(sortStable(value));
}

export function hashVatSnapshot(snapshot: VatSourceSnapshot): string {
  return createHash("sha256").update(stableVatJson(snapshot)).digest("hex");
}

export function periodFromBangkokDate(date: string): { year: number; month: number } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(`Expected Bangkok calendar date in YYYY-MM-DD format, got ${date}`);
  }
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error(`Invalid Bangkok calendar date: ${date}`);
  }
  return { year, month };
}

function comparePeriod(
  left: { year: number; month: number },
  right: { year: number; month: number }
): number {
  return left.year * 12 + left.month - (right.year * 12 + right.month);
}

function addMonthsToPeriod(period: VatPeriod, monthOffset: number): VatPeriod {
  const zeroBased = period.year * 12 + (period.month - 1) + monthOffset;
  return {
    year: Math.floor(zeroBased / 12),
    month: (zeroBased % 12) + 1,
  };
}

function pp36ReclaimWindowFromPaidAt(paidAt: Date): {
  eligible: VatPeriod;
  expiry: VatPeriod;
} {
  const eligible = periodFromBangkokDate(formatBangkokDate(paidAt));
  return {
    eligible,
    expiry: addMonthsToPeriod(eligible, 5),
  };
}

function sortStable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortStable);
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, item]) => [key, sortStable(item)])
  );
}

function snapshotPayload(data: WithSnapshot) {
  return {
    sourceSnapshot: data.sourceSnapshot,
    sourceSnapshotHash: hashVatSnapshot(data.sourceSnapshot),
  };
}

function isRecoverableTaxInvoiceSubtype(subtype: TaxInvoiceSubtype) {
  return subtype === "full_ti" || subtype === "e_tax_invoice";
}

async function assertActiveVatEstablishment(
  conn: DbConnection,
  orgId: string,
  establishmentId: string
) {
  const [establishment] = await conn
    .select({ id: establishments.id })
    .from(establishments)
    .where(
      and(
        eq(establishments.id, establishmentId),
        eq(establishments.orgId, orgId),
        eq(establishments.vatRegistered, true),
        sql`${establishments.deletedAt} IS NULL`
      )
    )
    .limit(1);
  if (!establishment) {
    throw new VatLedgerStateError("VAT establishment is required and must belong to the organization");
  }
}

async function resolveVatEstablishmentForItem(
  conn: DbConnection,
  orgId: string,
  requestedEstablishmentId: string | undefined,
  status: string
) {
  if (requestedEstablishmentId) {
    await assertActiveVatEstablishment(conn, orgId, requestedEstablishmentId);
    return requestedEstablishmentId;
  }
  if (!ORDINARY_PP30_ITEM_STATUSES.has(status)) return undefined;

  const rows = await conn
    .select({ id: establishments.id })
    .from(establishments)
    .where(
      and(
        eq(establishments.orgId, orgId),
        eq(establishments.vatRegistered, true),
        sql`${establishments.deletedAt} IS NULL`
      )
    )
    .orderBy(sql`${establishments.isHeadOffice} DESC`, establishments.branchNumber)
    .limit(2);

  if (rows.length === 1) return rows[0].id;
  throw new VatLedgerStateError(
    rows.length === 0
      ? "VAT establishment is required before VAT can be reportable"
      : "VAT branch is required when the organization has multiple VAT establishments"
  );
}

export async function createTaxTreatmentDecision(
  data: WithConnection & {
    orgId: string;
    sourceDocumentId?: string;
    sourceDocumentLineId?: string;
    sourceTransactionId?: string;
    sourcePaymentId?: string;
    sourceReconciliationMatchId?: string;
    treatmentType: TaxTreatmentType;
    reviewStatus?: TaxTreatmentReviewStatus;
    confidence?: string;
    evidence?: Record<string, unknown>;
    ruleVersionId?: string;
    suggestedBy?: string;
    confirmedByUserId?: string;
    confirmedAt?: Date;
    reviewReason?: string;
  }
) {
  const conn = await getConnection(data.tx);
  const [decision] = await conn
    .insert(taxTreatmentDecisions)
    .values({
      orgId: data.orgId,
      sourceDocumentId: data.sourceDocumentId,
      sourceDocumentLineId: data.sourceDocumentLineId,
      sourceTransactionId: data.sourceTransactionId,
      sourcePaymentId: data.sourcePaymentId,
      sourceReconciliationMatchId: data.sourceReconciliationMatchId,
      treatmentType: data.treatmentType,
      reviewStatus: data.reviewStatus ?? "needs_review",
      confidence: data.confidence,
      evidence: data.evidence ?? {},
      ruleVersionId: data.ruleVersionId,
      suggestedBy: data.suggestedBy,
      confirmedByUserId: data.confirmedByUserId,
      confirmedAt: data.confirmedAt,
      reviewReason: data.reviewReason,
    })
    .returning();
  return decision;
}

export async function createVatInputItem(
  data: WithConnection &
    WithSnapshot & {
      orgId: string;
      establishmentId?: string;
      taxTreatmentDecisionId?: string;
      sourceDocumentId: string;
      sourceDocumentLineId?: string;
      sourceTransactionId?: string;
      sourceReconciliationMatchId?: string;
      vendorId: string;
      taxInvoiceNo?: string;
      taxInvoiceDate?: string;
      taxInvoiceReceivedDate?: string;
      taxInvoiceSubtype: TaxInvoiceSubtype;
      documentDate?: string;
      paymentDate?: string;
      baseAmount: string;
      vatAmount: string;
      vatRate: string;
      eligiblePeriodYear?: number;
      eligiblePeriodMonth?: number;
      expiryPeriodYear?: number;
      expiryPeriodMonth?: number;
      claimPeriodYear?: number;
      claimPeriodMonth?: number;
      claimBasisDate?: string;
      claimWindowRuleVersionId?: string;
      status?: VatInputStatus;
      statusReason?: string;
    }
) {
  const status = data.status ?? "needs_review";
  if (CLAIMED_INPUT_VAT_STATUSES.has(status)) {
    if (!isRecoverableTaxInvoiceSubtype(data.taxInvoiceSubtype)) {
      throw new VatLedgerStateError(
        "Claimable input VAT requires full or electronic tax invoice subtype"
      );
    }
    if (!data.taxInvoiceNo || !data.taxInvoiceDate) {
      throw new VatLedgerStateError(
        "Claimable input VAT requires tax invoice number and date"
      );
    }
  }

  const conn = await getConnection(data.tx);
  const establishmentId = await resolveVatEstablishmentForItem(
    conn,
    data.orgId,
    data.establishmentId,
    status
  );
  const [item] = await conn
    .insert(vatInputItems)
    .values({
      orgId: data.orgId,
      establishmentId,
      taxTreatmentDecisionId: data.taxTreatmentDecisionId,
      sourceDocumentId: data.sourceDocumentId,
      sourceDocumentLineId: data.sourceDocumentLineId,
      sourceTransactionId: data.sourceTransactionId,
      sourceReconciliationMatchId: data.sourceReconciliationMatchId,
      vendorId: data.vendorId,
      taxInvoiceNo: data.taxInvoiceNo,
      taxInvoiceDate: data.taxInvoiceDate,
      taxInvoiceReceivedDate: data.taxInvoiceReceivedDate,
      taxInvoiceSubtype: data.taxInvoiceSubtype,
      documentDate: data.documentDate,
      paymentDate: data.paymentDate,
      baseAmount: data.baseAmount,
      vatAmount: data.vatAmount,
      vatRate: data.vatRate,
      eligiblePeriodYear: data.eligiblePeriodYear,
      eligiblePeriodMonth: data.eligiblePeriodMonth,
      expiryPeriodYear: data.expiryPeriodYear,
      expiryPeriodMonth: data.expiryPeriodMonth,
      claimPeriodYear: data.claimPeriodYear,
      claimPeriodMonth: data.claimPeriodMonth,
      claimBasisDate: data.claimBasisDate,
      claimWindowRuleVersionId: data.claimWindowRuleVersionId,
      status,
      statusReason: data.statusReason,
      ...snapshotPayload(data),
    })
    .returning();
  return item;
}

export async function createVatOutputItem(
  data: WithConnection &
    WithSnapshot & {
      orgId: string;
      establishmentId?: string;
      taxTreatmentDecisionId?: string;
      sourceDocumentId?: string;
      sourceDocumentLineId?: string;
      sourcePosSaleId?: string;
      sourceTransactionId?: string;
      customerId?: string;
      taxInvoiceNo?: string;
      taxInvoiceDate: string;
      documentDate: string;
      taxPointDate: string;
      taxPointBasis: VatOutputTaxPointBasis;
      taxPointRuleVersionId?: string;
      outputPeriodYear?: number;
      outputPeriodMonth?: number;
      baseAmount: string;
      vatAmount: string;
      vatRate: string;
      status?: VatOutputStatus;
    }
) {
  const conn = await getConnection(data.tx);
  const period = periodFromBangkokDate(data.taxPointDate);
  const status = data.status ?? "needs_review";
  const establishmentId = await resolveVatEstablishmentForItem(
    conn,
    data.orgId,
    data.establishmentId,
    status
  );
  const [item] = await conn
    .insert(vatOutputItems)
    .values({
      orgId: data.orgId,
      establishmentId,
      taxTreatmentDecisionId: data.taxTreatmentDecisionId,
      sourceDocumentId: data.sourceDocumentId,
      sourceDocumentLineId: data.sourceDocumentLineId,
      sourcePosSaleId: data.sourcePosSaleId,
      sourceTransactionId: data.sourceTransactionId,
      customerId: data.customerId,
      taxInvoiceNo: data.taxInvoiceNo,
      taxInvoiceDate: data.taxInvoiceDate,
      documentDate: data.documentDate,
      taxPointDate: data.taxPointDate,
      taxPointBasis: data.taxPointBasis,
      taxPointRuleVersionId: data.taxPointRuleVersionId,
      baseAmount: data.baseAmount,
      vatAmount: data.vatAmount,
      vatRate: data.vatRate,
      outputPeriodYear: data.outputPeriodYear ?? period.year,
      outputPeriodMonth: data.outputPeriodMonth ?? period.month,
      status,
      ...snapshotPayload(data),
    })
    .returning();
  return item;
}

export async function createPp36Obligation(
  data: WithConnection &
    WithSnapshot & {
      orgId: string;
      taxTreatmentDecisionId?: string;
      sourceDocumentId?: string;
      sourceDocumentLineId?: string;
      sourcePaymentTransactionId?: string;
      sourceReconciliationMatchId?: string;
      vendorId: string;
      vendorCountryCode: string;
      serviceDescription?: string;
      baseAmountThb: string;
      sourceCurrency?: string;
      sourceAmount?: string;
      fxRate?: string;
      fxRateSource?: string;
      fxRateDate?: string;
      vatAmount: string;
      vatRate: string;
      occurredOn: string;
      paymentDate: string;
      taxPointDate: string;
      periodBasis: Pp36PeriodBasis;
      periodRuleVersionId?: string;
    }
) {
  const conn = await getConnection(data.tx);
  const period = periodFromBangkokDate(data.taxPointDate);
  const [obligation] = await conn
    .insert(pp36Obligations)
    .values({
      orgId: data.orgId,
      taxTreatmentDecisionId: data.taxTreatmentDecisionId,
      sourceDocumentId: data.sourceDocumentId,
      sourceDocumentLineId: data.sourceDocumentLineId,
      sourcePaymentTransactionId: data.sourcePaymentTransactionId,
      sourceReconciliationMatchId: data.sourceReconciliationMatchId,
      vendorId: data.vendorId,
      vendorCountryCode: data.vendorCountryCode.toUpperCase(),
      serviceDescription: data.serviceDescription,
      baseAmountThb: data.baseAmountThb,
      sourceCurrency: data.sourceCurrency,
      sourceAmount: data.sourceAmount,
      fxRate: data.fxRate,
      fxRateSource: data.fxRateSource,
      fxRateDate: data.fxRateDate,
      vatAmount: data.vatAmount,
      vatRate: data.vatRate,
      occurredOn: data.occurredOn,
      paymentDate: data.paymentDate,
      taxPointDate: data.taxPointDate,
      periodBasis: data.periodBasis,
      periodRuleVersionId: data.periodRuleVersionId,
      pp36PeriodYear: period.year,
      pp36PeriodMonth: period.month,
      ...snapshotPayload(data),
    })
    .returning();
  return obligation;
}

export async function createVatFilingDraft(
  data: WithConnection & {
    orgId: string;
    establishmentId?: string;
    filingType: VatFilingType;
    periodYear: number;
    periodMonth: number;
    filingKind?: VatFilingKind;
    version?: number;
    amendsFilingId?: string;
  }
) {
  const conn = await getConnection(data.tx);
  if (data.filingType === "pp30" && data.filingKind !== "amendment") {
    if (!data.establishmentId) {
      throw new VatLedgerStateError("PP30 filing draft requires a VAT branch");
    }
    await assertActiveVatEstablishment(conn, data.orgId, data.establishmentId);
  } else if (data.establishmentId) {
    await assertActiveVatEstablishment(conn, data.orgId, data.establishmentId);
  }
  const [filing] = await conn
    .insert(vatFilings)
    .values({
      orgId: data.orgId,
      establishmentId: data.establishmentId,
      filingType: data.filingType,
      periodYear: data.periodYear,
      periodMonth: data.periodMonth,
      filingKind: data.filingKind ?? "ordinary",
      version: data.version,
      amendsFilingId: data.amendsFilingId,
      status: "draft",
    })
    .returning();
  return filing;
}

export async function addVatFilingLine(
  data: WithConnection & {
    orgId: string;
    filingId: string;
    lineType: VatFilingLineType;
    vatInputItemId?: string;
    vatOutputItemId?: string;
    pp36ObligationId?: string;
    amount: string;
    vatAmount: string;
    frozenSnapshot: VatSourceSnapshot;
  }
): Promise<typeof vatFilingLines.$inferSelect> {
  if (!data.tx) {
    const { db } = await import("../index");
    return db.transaction((tx) => addVatFilingLine({ ...data, tx: tx as DbConnection }));
  }

  const conn = await getConnection(data.tx);
  const sourceRefs = [
    data.vatInputItemId,
    data.vatOutputItemId,
    data.pp36ObligationId,
  ].filter(Boolean);
  if (sourceRefs.length > 1) {
    throw new VatLedgerStateError("VAT filing line can reference only one source item");
  }
  if (
    sourceRefs.length > 0 &&
    !["input", "output", "pp36_obligation", "pp36_reclaim"].includes(data.lineType)
  ) {
    throw new VatLedgerStateError("Carryforward and adjustment lines cannot reference VAT source items");
  }
  if (data.lineType === "input" && !data.vatInputItemId) {
    throw new VatLedgerStateError("Input VAT filing lines require a VAT input item");
  }
  if (data.lineType === "output" && !data.vatOutputItemId) {
    throw new VatLedgerStateError("Output VAT filing lines require a VAT output item");
  }
  if (
    ["pp36_obligation", "pp36_reclaim"].includes(data.lineType) &&
    !data.pp36ObligationId
  ) {
    throw new VatLedgerStateError("PP36 filing lines require a PP36 obligation");
  }
  await conn.execute(sql`
    SELECT id
    FROM vat_filings
    WHERE id = ${data.filingId}
      AND org_id = ${data.orgId}
      AND deleted_at IS NULL
    FOR UPDATE
  `);
  const [parentFiling] = await conn
    .select({
      filingType: vatFilings.filingType,
      establishmentId: vatFilings.establishmentId,
      status: vatFilings.status,
    })
    .from(vatFilings)
    .where(
      and(
        eq(vatFilings.id, data.filingId),
        eq(vatFilings.orgId, data.orgId),
        sql`${vatFilings.deletedAt} IS NULL`
      )
    )
    .limit(1);

  if (!parentFiling) {
    throw new VatLedgerStateError("VAT filing draft not found");
  }
  if (!["draft", "ready_for_review"].includes(parentFiling.status)) {
    throw new VatLedgerStateError("VAT filing lines can only be added to draft filings");
  }
  if (parentFiling.filingType === "pp36" && data.lineType !== "pp36_obligation") {
    throw new VatLedgerStateError("PP36 filings can only contain PP36 obligation lines");
  }
  if (parentFiling.filingType === "pp30" && data.lineType === "pp36_obligation") {
    throw new VatLedgerStateError("PP36 obligation lines cannot be added to PP30 filings");
  }
  if (parentFiling.filingType === "pp30" && !parentFiling.establishmentId) {
    throw new VatLedgerStateError("PP30 filing draft requires a VAT branch");
  }

  if (data.pp36ObligationId && data.lineType === "pp36_reclaim") {
    const [filing] = await conn
      .select({
        filingType: vatFilings.filingType,
        establishmentId: vatFilings.establishmentId,
        periodYear: vatFilings.periodYear,
        periodMonth: vatFilings.periodMonth,
      })
      .from(vatFilings)
      .where(and(eq(vatFilings.id, data.filingId), eq(vatFilings.orgId, data.orgId)))
      .limit(1);
    const [obligation] = await conn
      .select({
        status: pp36Obligations.status,
        eligiblePeriodYear: pp36Obligations.pp30ReclaimEligiblePeriodYear,
        eligiblePeriodMonth: pp36Obligations.pp30ReclaimEligiblePeriodMonth,
        expiryPeriodYear: pp36Obligations.pp30ReclaimExpiryPeriodYear,
        expiryPeriodMonth: pp36Obligations.pp30ReclaimExpiryPeriodMonth,
      })
      .from(pp36Obligations)
      .where(and(eq(pp36Obligations.id, data.pp36ObligationId), eq(pp36Obligations.orgId, data.orgId)))
      .limit(1);

    if (filing?.filingType !== "pp30") {
      throw new VatLedgerStateError("PP36 reclaim lines can only be allocated to PP30 filings");
    }
    if (obligation?.status !== "eligible_for_pp30_reclaim") {
      throw new VatLedgerStateError("PP36 obligation must be paid before PP30 reclaim allocation");
    }
    if (
      !obligation.eligiblePeriodYear ||
      !obligation.eligiblePeriodMonth ||
      !obligation.expiryPeriodYear ||
      !obligation.expiryPeriodMonth
    ) {
      throw new VatLedgerStateError(
        "PP36 reclaim eligibility window must be set before PP30 reclaim allocation"
      );
    }

    const filingPeriod = { year: filing.periodYear, month: filing.periodMonth };
    const eligiblePeriod = {
      year: obligation.eligiblePeriodYear,
      month: obligation.eligiblePeriodMonth,
    };
    const expiryPeriod = {
      year: obligation.expiryPeriodYear,
      month: obligation.expiryPeriodMonth,
    };
    if (
      comparePeriod(filingPeriod, eligiblePeriod) < 0 ||
      comparePeriod(filingPeriod, expiryPeriod) > 0
    ) {
      throw new VatLedgerStateError("PP36 reclaim filing period is outside the eligibility window");
    }
  }

  const [line] = await conn
    .insert(vatFilingLines)
    .values({
      orgId: data.orgId,
      filingId: data.filingId,
      lineType: data.lineType,
      vatInputItemId: data.vatInputItemId,
      vatOutputItemId: data.vatOutputItemId,
      pp36ObligationId: data.pp36ObligationId,
      amount: data.amount,
      vatAmount: data.vatAmount,
      frozenSnapshot: data.frozenSnapshot,
      frozenSnapshotHash: hashVatSnapshot(data.frozenSnapshot),
    })
    .returning();

  if (data.vatInputItemId && data.lineType === "input") {
    const [updated] = await conn
      .update(vatInputItems)
      .set({ draftFilingId: data.filingId, status: "allocated_to_draft" })
      .where(
        and(
          eq(vatInputItems.id, data.vatInputItemId),
          eq(vatInputItems.orgId, data.orgId),
          sql`${vatInputItems.deletedAt} IS NULL`
        )
      )
      .returning({ id: vatInputItems.id });
    if (!updated) {
      throw new VatLedgerStateError("VAT input item not found for filing line");
    }
  }

  if (data.vatOutputItemId && data.lineType === "output") {
    const [updated] = await conn
      .update(vatOutputItems)
      .set({ draftFilingId: data.filingId, status: "allocated_to_draft" })
      .where(
        and(
          eq(vatOutputItems.id, data.vatOutputItemId),
          eq(vatOutputItems.orgId, data.orgId),
          sql`${vatOutputItems.deletedAt} IS NULL`
        )
      )
      .returning({ id: vatOutputItems.id });
    if (!updated) {
      throw new VatLedgerStateError("VAT output item not found for filing line");
    }
  }

  if (data.pp36ObligationId && data.lineType === "pp36_obligation") {
    const [updated] = await conn
      .update(pp36Obligations)
      .set({
        pp36FilingId: data.filingId,
        pp36FilingLineId: line.id,
        status: "allocated_to_draft_pp36",
      })
      .where(
        and(
          eq(pp36Obligations.id, data.pp36ObligationId),
          eq(pp36Obligations.orgId, data.orgId),
          sql`${pp36Obligations.deletedAt} IS NULL`
        )
      )
      .returning({ id: pp36Obligations.id });
    if (!updated) {
      throw new VatLedgerStateError("PP36 obligation not found for filing line");
    }
  }

  if (data.pp36ObligationId && data.lineType === "pp36_reclaim") {
    // Keep the obligation eligible while the PP30 is still draft. The reclaim
    // is consumed only when markVatFilingDraftFiled freezes the PP30 filing.
  }

  return line;
}

export async function markVatFilingDraftFiled(
  data: WithConnection & {
    orgId: string;
    filingId: string;
    actorId: string;
    filedAt?: Date;
  }
): Promise<typeof vatFilings.$inferSelect> {
  if (!data.tx) {
    const { db } = await import("../index");
    return db.transaction((tx) =>
      markVatFilingDraftFiled({ ...data, tx: tx as DbConnection })
    );
  }

  const conn = data.tx;
  await conn.execute(sql`
    SELECT id
    FROM vat_filings
    WHERE id = ${data.filingId}
      AND org_id = ${data.orgId}
      AND deleted_at IS NULL
    FOR UPDATE
  `);

  const [filing] = await conn
    .select({
      filingType: vatFilings.filingType,
      establishmentId: vatFilings.establishmentId,
      periodYear: vatFilings.periodYear,
      periodMonth: vatFilings.periodMonth,
      status: vatFilings.status,
      refundRequested: vatFilings.refundRequested,
    })
    .from(vatFilings)
    .where(
      and(
        eq(vatFilings.id, data.filingId),
        eq(vatFilings.orgId, data.orgId),
        sql`${vatFilings.deletedAt} IS NULL`
      )
    )
    .limit(1);

  if (!filing) {
    throw new VatLedgerStateError("VAT filing draft not found");
  }
  if (filing.filingType === "pp30" && !filing.establishmentId) {
    throw new VatLedgerStateError("PP30 filing draft requires a VAT branch");
  }
  if (!["draft", "ready_for_review"].includes(filing.status)) {
    throw new VatLedgerStateError("Only draft VAT filings can be filed");
  }

  const [lineTotals] = await conn
    .select({
      outputVatTotal: sql<string>`
        COALESCE(SUM(CASE WHEN ${vatFilingLines.lineType} = 'output' THEN ${vatFilingLines.vatAmount} ELSE 0 END), 0)::numeric(14,2)::text
      `,
      inputVatTotal: sql<string>`
        COALESCE(SUM(CASE WHEN ${vatFilingLines.lineType} = 'input' THEN ${vatFilingLines.vatAmount} ELSE 0 END), 0)::numeric(14,2)::text
      `,
      pp36VatTotal: sql<string>`
        COALESCE(SUM(CASE WHEN ${vatFilingLines.lineType} = 'pp36_obligation' THEN ${vatFilingLines.vatAmount} ELSE 0 END), 0)::numeric(14,2)::text
      `,
      pp36ReclaimTotal: sql<string>`
        COALESCE(SUM(CASE WHEN ${vatFilingLines.lineType} = 'pp36_reclaim' THEN ${vatFilingLines.vatAmount} ELSE 0 END), 0)::numeric(14,2)::text
      `,
      carryforwardIn: sql<string>`
        COALESCE(SUM(CASE WHEN ${vatFilingLines.lineType} = 'carryforward' THEN ${vatFilingLines.vatAmount} ELSE 0 END), 0)::numeric(14,2)::text
      `,
    })
    .from(vatFilingLines)
    .where(and(eq(vatFilingLines.orgId, data.orgId), eq(vatFilingLines.filingId, data.filingId)));

  const outputVatTotal = normalizeMoney(lineTotals?.outputVatTotal);
  const inputVatTotal = normalizeMoney(lineTotals?.inputVatTotal);
  const pp36VatTotal = normalizeMoney(lineTotals?.pp36VatTotal);
  const pp36ReclaimTotal = normalizeMoney(lineTotals?.pp36ReclaimTotal);
  const carryforwardIn = normalizeMoney(lineTotals?.carryforwardIn);
  const netPayable =
    filing.filingType === "pp36"
      ? pp36VatTotal
      : centsToMoney(
          moneyToCents(outputVatTotal) -
            moneyToCents(inputVatTotal) -
            moneyToCents(pp36ReclaimTotal) -
            moneyToCents(carryforwardIn)
        );
  const creditPosition =
    filing.filingType === "pp30" && moneyToCents(netPayable) < BigInt(0)
      ? centsToMoney(-moneyToCents(netPayable))
      : "0.00";
  const carryforwardOut =
    filing.filingType === "pp30" && !filing.refundRequested ? creditPosition : "0.00";
  const refundAmount =
    filing.filingType === "pp30" && filing.refundRequested ? creditPosition : null;
  if (filing.refundRequested && moneyToCents(creditPosition) <= BigInt(0)) {
    throw new VatLedgerStateError("PP30 refund can only be requested for a credit position");
  }
  const paymentStatus =
    moneyToCents(netPayable) > BigInt(0)
      ? "waiting_to_pay_tax"
      : moneyToCents(netPayable) < BigInt(0)
        ? "refund_or_credit"
        : "not_required";
  const filedAt = data.filedAt ?? new Date();

  const filingLines = await conn
    .select({
      id: vatFilingLines.id,
      lineType: vatFilingLines.lineType,
      vatInputItemId: vatFilingLines.vatInputItemId,
      vatOutputItemId: vatFilingLines.vatOutputItemId,
      pp36ObligationId: vatFilingLines.pp36ObligationId,
    })
    .from(vatFilingLines)
    .where(and(eq(vatFilingLines.orgId, data.orgId), eq(vatFilingLines.filingId, data.filingId)));

  for (const line of filingLines) {
    if (line.lineType === "input" && line.vatInputItemId) {
      await conn
        .update(vatInputItems)
        .set({ status: "filed", filedFilingLineId: line.id })
        .where(and(eq(vatInputItems.id, line.vatInputItemId), eq(vatInputItems.orgId, data.orgId)));
    }
    if (line.lineType === "output" && line.vatOutputItemId) {
      await conn
        .update(vatOutputItems)
        .set({ status: "filed", filedFilingLineId: line.id })
        .where(and(eq(vatOutputItems.id, line.vatOutputItemId), eq(vatOutputItems.orgId, data.orgId)));
    }
    if (line.lineType === "pp36_obligation" && line.pp36ObligationId) {
      await conn
        .update(pp36Obligations)
        .set({
          status: "pp36_filed",
          pp36FilingId: data.filingId,
          pp36FilingLineId: line.id,
        })
        .where(and(eq(pp36Obligations.id, line.pp36ObligationId), eq(pp36Obligations.orgId, data.orgId)));
    }
    if (line.lineType === "pp36_reclaim" && line.pp36ObligationId) {
      await conn
        .update(pp36Obligations)
        .set({
          status: "reclaimed_in_pp30",
          pp30ReclaimFilingId: data.filingId,
          pp30ReclaimFilingLineId: line.id,
        })
        .where(and(eq(pp36Obligations.id, line.pp36ObligationId), eq(pp36Obligations.orgId, data.orgId)));
    }
  }

  const [updated] = await conn
    .update(vatFilings)
    .set({
      status: "filed",
      outputVatTotal,
      inputVatTotal,
      pp36VatTotal,
      pp36ReclaimTotal,
      carryforwardIn,
      carryforwardOut,
      netPayable: moneyToCents(netPayable) > BigInt(0) ? netPayable : "0.00",
      refundAmount,
      filedAt,
      filedByUserId: data.actorId,
      paymentStatus,
      updatedAt: new Date(),
    })
    .where(and(eq(vatFilings.id, data.filingId), eq(vatFilings.orgId, data.orgId)))
    .returning();

  if (!updated) {
    throw new VatLedgerStateError("VAT filing draft could not be filed");
  }

  if (filing.filingType === "pp30" && moneyToCents(carryforwardOut) > BigInt(0) && !filing.refundRequested) {
    await conn
      .insert(vatCreditCarryforwards)
      .values({
        orgId: data.orgId,
        establishmentId: filing.establishmentId,
        sourcePp30FilingId: data.filingId,
        creditOriginPeriodYear: filing.periodYear,
        creditOriginPeriodMonth: filing.periodMonth,
        amount: carryforwardOut,
        remainingAmount: carryforwardOut,
        status: "available",
      })
      .onConflictDoNothing({
        target: [
          vatCreditCarryforwards.orgId,
          vatCreditCarryforwards.sourcePp30FilingId,
        ],
      });
  }

  await conn.insert(auditLog).values({
    orgId: data.orgId,
    entityType: "vat_filing",
    entityId: data.filingId,
    action: "update",
    actorId: data.actorId,
    newValue: {
      operation: "mark_vat_filing_filed",
      filingType: filing.filingType,
      periodYear: filing.periodYear,
      periodMonth: filing.periodMonth,
      lineCount: filingLines.length,
      outputVatTotal,
      inputVatTotal,
      pp36VatTotal,
      pp36ReclaimTotal,
      carryforwardIn,
      carryforwardOut,
      creditPosition,
      netPayable: moneyToCents(netPayable) > BigInt(0) ? netPayable : "0.00",
      signedNetPosition: netPayable,
      refundAmount,
      paymentStatus,
    },
  });

  const lockDomain: VatFilingLockDomain =
    filing.filingType === "pp36" ? "vat_pp36" : "vat_pp30";
  const lockReason = `${filing.filingType}_filed`;
  const [lock] = await conn
    .insert(periodLocks)
    .values({
      orgId: data.orgId,
      domain: lockDomain,
      periodYear: filing.periodYear,
      periodMonth: filing.periodMonth,
      lockedByUserId: data.actorId,
      lockReason,
    })
    .onConflictDoNothing()
    .returning({ id: periodLocks.id });

  if (lock) {
    await conn.insert(auditLog).values({
      orgId: data.orgId,
      entityType: "period_lock",
      entityId: lock.id,
      action: "create",
      actorId: data.actorId,
      newValue: {
        operation: "period_lock_created",
        lockId: lock.id,
        filingId: data.filingId,
        filingType: filing.filingType,
        domain: lockDomain,
        periodYear: filing.periodYear,
        periodMonth: filing.periodMonth,
        lockReason,
      },
    });
  }

  return updated;
}

export async function recordTaxPaymentEvent(
  data: WithConnection & {
    orgId: string;
    filingId: string;
    eventType: TaxPaymentEventType;
    paymentTransactionId?: string;
    paidAt: Date;
    amount: string;
    receiptNo?: string;
    evidenceDocumentId?: string;
    idempotencyKey: string;
    createdByUserId: string;
  }
): Promise<typeof taxPaymentEvents.$inferSelect> {
  if (!data.tx) {
    const { db } = await import("../index");
    return db.transaction((tx) =>
      recordTaxPaymentEvent({ ...data, tx: tx as DbConnection })
    );
  }

  const conn = data.tx;
  const [event] = await conn
    .insert(taxPaymentEvents)
    .values({
      orgId: data.orgId,
      filingId: data.filingId,
      eventType: data.eventType,
      paymentTransactionId: data.paymentTransactionId,
      paidAt: data.paidAt,
      amount: data.amount,
      receiptNo: data.receiptNo,
      evidenceDocumentId: data.evidenceDocumentId,
      idempotencyKey: data.idempotencyKey,
      createdByUserId: data.createdByUserId,
    })
    .returning();

  if (data.eventType === "payment") {
    await conn
      .insert(postingOutbox)
      .values({
        orgId: data.orgId,
        sourceEntityType: "tax_payment_events",
        sourceEntityId: event.id,
        eventType: "payment",
        postingDate: formatBangkokDate(data.paidAt),
        postingStatus: "pending",
        payload: {
          filingId: data.filingId,
          paymentDate: formatBangkokDate(data.paidAt),
        },
      })
      .onConflictDoNothing();
  }

  return event;
}

export async function markPp36ObligationFiled(
  data: WithConnection & {
    orgId: string;
    obligationId: string;
    pp36FilingId: string;
    pp36FilingLineId: string;
  }
) {
  const conn = await getConnection(data.tx);
  const [filing] = await conn
    .select({ status: vatFilings.status })
    .from(vatFilings)
    .where(and(eq(vatFilings.id, data.pp36FilingId), eq(vatFilings.orgId, data.orgId)))
    .limit(1);
  if (filing?.status !== "filed") {
    throw new VatLedgerStateError("PP36 obligation can only be marked filed after the PP36 filing is filed");
  }

  const [obligation] = await conn
    .update(pp36Obligations)
    .set({
      pp36FilingId: data.pp36FilingId,
      pp36FilingLineId: data.pp36FilingLineId,
      status: "pp36_filed",
    })
    .where(and(eq(pp36Obligations.id, data.obligationId), eq(pp36Obligations.orgId, data.orgId)))
    .returning();
  return obligation;
}

export async function markPp36ObligationPaid(
  data: WithConnection & {
    orgId: string;
    obligationId: string;
    pp36FilingId: string;
    pp36FilingLineId: string;
    taxPaymentEventId: string;
    paidAt: Date;
    pp36PaymentTransactionId?: string;
  }
) {
  const conn = await getConnection(data.tx);
  const [filing] = await conn
    .select({ status: vatFilings.status })
    .from(vatFilings)
    .where(and(eq(vatFilings.id, data.pp36FilingId), eq(vatFilings.orgId, data.orgId)))
    .limit(1);
  if (filing?.status !== "filed") {
    throw new VatLedgerStateError("PP36 payment can only be recorded against a filed PP36 filing");
  }

  const [current] = await conn
    .select({ status: pp36Obligations.status })
    .from(pp36Obligations)
    .where(and(eq(pp36Obligations.id, data.obligationId), eq(pp36Obligations.orgId, data.orgId)))
    .limit(1);
  if (!current || !["pp36_filed", "pp36_paid"].includes(current.status)) {
    throw new VatLedgerStateError("PP36 obligation must be filed before it can become reclaim-eligible");
  }

  const [event] = await conn
    .select({ id: taxPaymentEvents.id, eventStatus: taxPaymentEvents.eventStatus })
    .from(taxPaymentEvents)
    .where(
      and(
        eq(taxPaymentEvents.id, data.taxPaymentEventId),
        eq(taxPaymentEvents.orgId, data.orgId),
        eq(taxPaymentEvents.filingId, data.pp36FilingId)
      )
    )
    .limit(1);
  if (!event || event.eventStatus === "voided") {
    throw new VatLedgerStateError("PP36 payment requires a non-voided tax payment event");
  }

  const reclaimWindow = pp36ReclaimWindowFromPaidAt(data.paidAt);
  const [obligation] = await conn
    .update(pp36Obligations)
    .set({
      pp36FilingId: data.pp36FilingId,
      pp36FilingLineId: data.pp36FilingLineId,
      pp36PaidAt: data.paidAt,
      pp36PaymentTransactionId: data.pp36PaymentTransactionId,
      pp30ReclaimEligiblePeriodYear: reclaimWindow.eligible.year,
      pp30ReclaimEligiblePeriodMonth: reclaimWindow.eligible.month,
      pp30ReclaimExpiryPeriodYear: reclaimWindow.expiry.year,
      pp30ReclaimExpiryPeriodMonth: reclaimWindow.expiry.month,
      status: "eligible_for_pp30_reclaim",
    })
    .where(and(eq(pp36Obligations.id, data.obligationId), eq(pp36Obligations.orgId, data.orgId)))
    .returning();
  return obligation;
}

export async function recordPp36FilingPayment(
  data: WithConnection & {
    orgId: string;
    filingId: string;
    actorId: string;
    paidAt: Date;
    amount: string;
    receiptNo?: string;
    paymentTransactionId?: string;
    evidenceDocumentId?: string;
    idempotencyKey?: string;
  }
): Promise<{
  event: typeof taxPaymentEvents.$inferSelect;
  paidObligations: Array<typeof pp36Obligations.$inferSelect>;
}> {
  if (!data.tx) {
    const { db } = await import("../index");
    return db.transaction((tx) =>
      recordPp36FilingPayment({ ...data, tx: tx as DbConnection })
    );
  }

  const conn = data.tx;
  await conn.execute(sql`
    SELECT id
    FROM vat_filings
    WHERE id = ${data.filingId}
      AND org_id = ${data.orgId}
      AND deleted_at IS NULL
    FOR UPDATE
  `);

  const [filing] = await conn
    .select({
      filingType: vatFilings.filingType,
      status: vatFilings.status,
      periodYear: vatFilings.periodYear,
      periodMonth: vatFilings.periodMonth,
      pp36VatTotal: vatFilings.pp36VatTotal,
    })
    .from(vatFilings)
    .where(
      and(
        eq(vatFilings.id, data.filingId),
        eq(vatFilings.orgId, data.orgId),
        sql`${vatFilings.deletedAt} IS NULL`
      )
    )
    .limit(1);

  if (!filing) {
    throw new VatLedgerStateError("PP36 filing not found");
  }
  if (filing.filingType !== "pp36" || filing.status !== "filed") {
    throw new VatLedgerStateError("PP36 payment can only be recorded for filed PP36 filings");
  }

  const lines = await conn
    .select({
      id: vatFilingLines.id,
      pp36ObligationId: vatFilingLines.pp36ObligationId,
      vatAmount: vatFilingLines.vatAmount,
    })
    .from(vatFilingLines)
    .where(
      and(
        eq(vatFilingLines.orgId, data.orgId),
        eq(vatFilingLines.filingId, data.filingId),
        eq(vatFilingLines.lineType, "pp36_obligation")
      )
    );
  if (lines.length === 0) {
    throw new VatLedgerStateError("PP36 filing has no obligation lines to pay");
  }

  const lineTotal = lines.reduce(
    (sum, line) => sum + moneyToCents(line.vatAmount),
    BigInt(0)
  );
  if (lineTotal !== moneyToCents(data.amount)) {
    throw new VatLedgerStateError("PP36 payment amount must match filed PP36 VAT total");
  }

  const event = await recordTaxPaymentEvent({
    tx: conn,
    orgId: data.orgId,
    filingId: data.filingId,
    eventType: "payment",
    paymentTransactionId: data.paymentTransactionId,
    paidAt: data.paidAt,
    amount: normalizeMoney(data.amount),
    receiptNo: data.receiptNo,
    evidenceDocumentId: data.evidenceDocumentId,
    idempotencyKey:
      data.idempotencyKey ??
      `pp36-payment:${data.orgId}:${data.filingId}:${data.paidAt.toISOString()}:${normalizeMoney(data.amount)}`,
    createdByUserId: data.actorId,
  });

  const paidObligations: Array<typeof pp36Obligations.$inferSelect> = [];
  for (const line of lines) {
    if (!line.pp36ObligationId) continue;
    const paid = await markPp36ObligationPaid({
      tx: conn,
      orgId: data.orgId,
      obligationId: line.pp36ObligationId,
      pp36FilingId: data.filingId,
      pp36FilingLineId: line.id,
      taxPaymentEventId: event.id,
      paidAt: data.paidAt,
      pp36PaymentTransactionId: data.paymentTransactionId,
    });
    paidObligations.push(paid);
  }

  await conn
    .update(vatFilings)
    .set({
      paymentStatus: "tax_paid",
      paidAt: data.paidAt,
      paymentTransactionId: data.paymentTransactionId,
      rdReceiptNo: data.receiptNo,
      updatedAt: new Date(),
    })
    .where(and(eq(vatFilings.id, data.filingId), eq(vatFilings.orgId, data.orgId)));

  await conn.insert(auditLog).values({
    orgId: data.orgId,
    entityType: "vat_filing",
    entityId: data.filingId,
    action: "update",
    actorId: data.actorId,
    newValue: {
      operation: "record_pp36_filing_payment",
      periodYear: filing.periodYear,
      periodMonth: filing.periodMonth,
      taxPaymentEventId: event.id,
      paidObligationCount: paidObligations.length,
      amount: normalizeMoney(data.amount),
    },
  });

  return { event, paidObligations };
}

export async function getVatOperationsLedgerOverview(
  data: WithConnection & {
    orgId: string;
    establishmentId?: string;
    periodYear: number;
    periodMonth: number;
  }
) {
  const conn = await getConnection(data.tx);
  const inputItems = await conn
    .select({
      status: vatInputItems.status,
      count: sql<number>`COUNT(*)::int`,
      vatAmount: sql<string>`COALESCE(SUM(${vatInputItems.vatAmount}), 0)::numeric(14,2)::text`,
    })
    .from(vatInputItems)
    .where(
      and(
        eq(vatInputItems.orgId, data.orgId),
        data.establishmentId ? eq(vatInputItems.establishmentId, data.establishmentId) : undefined,
        eq(vatInputItems.eligiblePeriodYear, data.periodYear),
        eq(vatInputItems.eligiblePeriodMonth, data.periodMonth),
        sql`${vatInputItems.deletedAt} IS NULL`
      )
    )
    .groupBy(vatInputItems.status);
  const outputItems = await conn
    .select({
      status: vatOutputItems.status,
      count: sql<number>`COUNT(*)::int`,
      vatAmount: sql<string>`COALESCE(SUM(${vatOutputItems.vatAmount}), 0)::numeric(14,2)::text`,
    })
    .from(vatOutputItems)
    .where(
      and(
        eq(vatOutputItems.orgId, data.orgId),
        data.establishmentId ? eq(vatOutputItems.establishmentId, data.establishmentId) : undefined,
        eq(vatOutputItems.outputPeriodYear, data.periodYear),
        eq(vatOutputItems.outputPeriodMonth, data.periodMonth),
        sql`${vatOutputItems.deletedAt} IS NULL`
      )
    )
    .groupBy(vatOutputItems.status);
  const pp36Items = await conn
    .select({
      status: pp36Obligations.status,
      count: sql<number>`COUNT(*)::int`,
      vatAmount: sql<string>`COALESCE(SUM(${pp36Obligations.vatAmount}), 0)::numeric(14,2)::text`,
    })
    .from(pp36Obligations)
    .where(
      and(
        eq(pp36Obligations.orgId, data.orgId),
        data.establishmentId ? eq(pp36Obligations.establishmentId, data.establishmentId) : undefined,
        eq(pp36Obligations.pp36PeriodYear, data.periodYear),
        eq(pp36Obligations.pp36PeriodMonth, data.periodMonth),
        sql`${pp36Obligations.deletedAt} IS NULL`
      )
    )
    .groupBy(pp36Obligations.status);
  const exceptions = await conn
    .select({
      severity: exceptionQueue.severity,
      exceptionType: exceptionQueue.exceptionType,
      count: sql<number>`COUNT(*)::int`,
    })
    .from(exceptionQueue)
    .where(
      and(
        eq(exceptionQueue.orgId, data.orgId),
        sql`${exceptionQueue.resolvedAt} IS NULL`,
        sql`${exceptionQueue.exceptionType} LIKE 'vat_%'`,
        sql`${exceptionQueue.payload}->>'periodYear' = ${String(data.periodYear)}`,
        sql`${exceptionQueue.payload}->>'periodMonth' = ${String(data.periodMonth)}`
      )
    )
    .groupBy(exceptionQueue.severity, exceptionQueue.exceptionType);

  return {
    inputItems,
    outputItems,
    pp36Items,
    exceptions,
  };
}

export async function getVatLedgerPeriodDashboard(
  data: WithConnection & {
    orgId: string;
    periodYear: number;
    periodMonth: number;
    establishmentId?: string;
  }
) {
  const conn = await getConnection(data.tx);
  const overview = await getVatOperationsLedgerOverview(data);
  const pp30DeadlineDate = pp30EfilingDeadline(
    data.periodYear,
    data.periodMonth,
    DEFAULT_TAX_CONFIG
  ).deadline;
  const pp36DeadlineDate = pp36Deadline(
    data.periodYear,
    data.periodMonth,
    DEFAULT_TAX_CONFIG
  ).deadline;

  const pp30Filings = await conn
    .select()
    .from(vatFilings)
    .where(
      and(
        eq(vatFilings.orgId, data.orgId),
        data.establishmentId ? eq(vatFilings.establishmentId, data.establishmentId) : undefined,
        eq(vatFilings.filingType, "pp30"),
        eq(vatFilings.periodYear, data.periodYear),
        eq(vatFilings.periodMonth, data.periodMonth),
        sql`${vatFilings.deletedAt} IS NULL`
      )
    )
    .orderBy(sql`
      CASE ${vatFilings.status}
        WHEN 'filed' THEN 0
        WHEN 'ready_for_review' THEN 1
        WHEN 'draft' THEN 2
        ELSE 3
      END
    `, sql`${vatFilings.createdAt} DESC`)
    .limit(1);
  const pp30Filing = pp30Filings[0] as (typeof pp30Filings)[number] | undefined;

  const pp36Filings = await conn
    .select()
    .from(vatFilings)
    .where(
      and(
        eq(vatFilings.orgId, data.orgId),
        eq(vatFilings.filingType, "pp36"),
        eq(vatFilings.periodYear, data.periodYear),
        eq(vatFilings.periodMonth, data.periodMonth),
        sql`${vatFilings.deletedAt} IS NULL`
      )
    )
    .orderBy(sql`
      CASE ${vatFilings.status}
        WHEN 'filed' THEN 0
        WHEN 'ready_for_review' THEN 1
        WHEN 'draft' THEN 2
        ELSE 3
      END
    `, sql`${vatFilings.createdAt} DESC`)
    .limit(1);
  const pp36Filing = pp36Filings[0] as (typeof pp36Filings)[number] | undefined;

  const filingPeriod = data.periodYear * 12 + data.periodMonth;
  const [pendingOutput] = await conn
    .select({
      total: sql<string>`COALESCE(SUM(${vatOutputItems.vatAmount}), 0)::numeric(14,2)::text`,
    })
    .from(vatOutputItems)
    .where(
      and(
        eq(vatOutputItems.orgId, data.orgId),
        data.establishmentId ? eq(vatOutputItems.establishmentId, data.establishmentId) : undefined,
        eq(vatOutputItems.outputPeriodYear, data.periodYear),
        eq(vatOutputItems.outputPeriodMonth, data.periodMonth),
        eq(vatOutputItems.status, "reportable"),
        sql`${vatOutputItems.deletedAt} IS NULL`
      )
    );
  const [candidateInput] = await conn
    .select({
      total: sql<string>`COALESCE(SUM(${vatInputItems.vatAmount}), 0)::numeric(14,2)::text`,
    })
    .from(vatInputItems)
    .where(
      and(
        eq(vatInputItems.orgId, data.orgId),
        data.establishmentId ? eq(vatInputItems.establishmentId, data.establishmentId) : undefined,
        eq(vatInputItems.status, "claimable"),
        sql`${vatInputItems.deletedAt} IS NULL`,
        sql`${vatInputItems.taxInvoiceSubtype} IN ('full_ti', 'e_tax_invoice')`,
        sql`${vatInputItems.taxInvoiceNo} IS NOT NULL`,
        sql`${vatInputItems.taxInvoiceDate} IS NOT NULL`,
        sql`${vatInputItems.eligiblePeriodYear} IS NOT NULL`,
        sql`${vatInputItems.eligiblePeriodMonth} IS NOT NULL`,
        sql`${vatInputItems.expiryPeriodYear} IS NOT NULL`,
        sql`${vatInputItems.expiryPeriodMonth} IS NOT NULL`,
        sql`(${vatInputItems.eligiblePeriodYear} * 12 + ${vatInputItems.eligiblePeriodMonth}) <= ${filingPeriod}`,
        sql`(${vatInputItems.expiryPeriodYear} * 12 + ${vatInputItems.expiryPeriodMonth}) >= ${filingPeriod}`
      )
    );
  const [candidatePp36Reclaim] = await conn
    .select({
      total: sql<string>`COALESCE(SUM(${pp36Obligations.vatAmount}), 0)::numeric(14,2)::text`,
    })
    .from(pp36Obligations)
    .where(
      and(
        eq(pp36Obligations.orgId, data.orgId),
        data.establishmentId ? eq(pp36Obligations.establishmentId, data.establishmentId) : undefined,
        eq(pp36Obligations.status, "eligible_for_pp30_reclaim"),
        sql`${pp36Obligations.deletedAt} IS NULL`,
        sql`${pp36Obligations.pp30ReclaimEligiblePeriodYear} IS NOT NULL`,
        sql`${pp36Obligations.pp30ReclaimEligiblePeriodMonth} IS NOT NULL`,
        sql`${pp36Obligations.pp30ReclaimExpiryPeriodYear} IS NOT NULL`,
        sql`${pp36Obligations.pp30ReclaimExpiryPeriodMonth} IS NOT NULL`,
        sql`(${pp36Obligations.pp30ReclaimEligiblePeriodYear} * 12 + ${pp36Obligations.pp30ReclaimEligiblePeriodMonth}) <= ${filingPeriod}`,
        sql`(${pp36Obligations.pp30ReclaimExpiryPeriodYear} * 12 + ${pp36Obligations.pp30ReclaimExpiryPeriodMonth}) >= ${filingPeriod}`
      )
    );
  const [candidateCarryforward] = await conn
    .select({
      count: sql<number>`COUNT(*)::int`,
      total: sql<string>`COALESCE(SUM(${vatCreditCarryforwards.remainingAmount}), 0)::numeric(14,2)::text`,
    })
    .from(vatCreditCarryforwards)
    .where(
      and(
        eq(vatCreditCarryforwards.orgId, data.orgId),
        data.establishmentId ? eq(vatCreditCarryforwards.establishmentId, data.establishmentId) : undefined,
        eq(vatCreditCarryforwards.status, "available"),
        sql`${vatCreditCarryforwards.remainingAmount} > 0`,
        sql`(${vatCreditCarryforwards.creditOriginPeriodYear} * 12 + ${vatCreditCarryforwards.creditOriginPeriodMonth}) < ${filingPeriod}`
      )
    );
  const [candidatePp36] = await conn
    .select({
      total: sql<string>`COALESCE(SUM(${pp36Obligations.vatAmount}), 0)::numeric(14,2)::text`,
    })
    .from(pp36Obligations)
    .where(
      and(
        eq(pp36Obligations.orgId, data.orgId),
        eq(pp36Obligations.pp36PeriodYear, data.periodYear),
        eq(pp36Obligations.pp36PeriodMonth, data.periodMonth),
        eq(pp36Obligations.status, "pp36_required"),
        sql`${pp36Obligations.deletedAt} IS NULL`
      )
    );

  const outputVatTotal = normalizeMoney(pp30Filing?.outputVatTotal ?? pendingOutput?.total);
  const inputVatTotal = normalizeMoney(pp30Filing?.inputVatTotal ?? candidateInput?.total);
  const pp36ReclaimTotal = normalizeMoney(
    pp30Filing?.pp36ReclaimTotal ?? candidatePp36Reclaim?.total
  );
  const carryforwardIn = normalizeMoney(pp30Filing?.carryforwardIn ?? candidateCarryforward?.total);
  const signedNetPosition = centsToMoney(
    moneyToCents(outputVatTotal) -
      moneyToCents(inputVatTotal) -
      moneyToCents(pp36ReclaimTotal) -
      moneyToCents(carryforwardIn)
  );
  const netPayable =
    moneyToCents(signedNetPosition) > BigInt(0) ? signedNetPosition : "0.00";
  const refundable =
    moneyToCents(signedNetPosition) < BigInt(0)
      ? centsToMoney(-moneyToCents(signedNetPosition))
      : "0.00";
  const warningEndPeriod = addMonthsToPeriod(
    { year: data.periodYear, month: data.periodMonth },
    2
  );

  const [expiringInput] = await conn
    .select({
      count: sql<number>`COUNT(*)::int`,
      vatAmount: sql<string>`COALESCE(SUM(${vatInputItems.vatAmount}), 0)::numeric(14,2)::text`,
    })
    .from(vatInputItems)
    .where(
      and(
        eq(vatInputItems.orgId, data.orgId),
        data.establishmentId ? eq(vatInputItems.establishmentId, data.establishmentId) : undefined,
        eq(vatInputItems.status, "claimable"),
        sql`${vatInputItems.deletedAt} IS NULL`,
        sql`${vatInputItems.taxInvoiceSubtype} IN ('full_ti', 'e_tax_invoice')`,
        sql`${vatInputItems.taxInvoiceNo} IS NOT NULL`,
        sql`${vatInputItems.taxInvoiceDate} IS NOT NULL`,
        sql`${vatInputItems.expiryPeriodYear} IS NOT NULL`,
        sql`${vatInputItems.expiryPeriodMonth} IS NOT NULL`,
        sql`(${vatInputItems.expiryPeriodYear} * 12 + ${vatInputItems.expiryPeriodMonth})
          BETWEEN ${data.periodYear * 12 + data.periodMonth}
          AND ${warningEndPeriod.year * 12 + warningEndPeriod.month}`
      )
    );

  const [pp36ReclaimQueue] = await conn
    .select({
      count: sql<number>`COUNT(*)::int`,
      vatAmount: sql<string>`COALESCE(SUM(${pp36Obligations.vatAmount}), 0)::numeric(14,2)::text`,
    })
    .from(pp36Obligations)
    .where(
      and(
        eq(pp36Obligations.orgId, data.orgId),
        data.establishmentId ? eq(pp36Obligations.establishmentId, data.establishmentId) : undefined,
        eq(pp36Obligations.status, "eligible_for_pp30_reclaim"),
        sql`${pp36Obligations.deletedAt} IS NULL`,
        sql`${pp36Obligations.pp30ReclaimEligiblePeriodYear} IS NOT NULL`,
        sql`${pp36Obligations.pp30ReclaimEligiblePeriodMonth} IS NOT NULL`
      )
    );

  const [availableCarryforward] = await conn
    .select({
      count: sql<number>`COUNT(*)::int`,
      amount: sql<string>`COALESCE(SUM(${vatCreditCarryforwards.remainingAmount}), 0)::numeric(14,2)::text`,
    })
    .from(vatCreditCarryforwards)
    .where(
      and(
        eq(vatCreditCarryforwards.orgId, data.orgId),
        data.establishmentId ? eq(vatCreditCarryforwards.establishmentId, data.establishmentId) : undefined,
        eq(vatCreditCarryforwards.status, "available"),
        sql`${vatCreditCarryforwards.remainingAmount} > 0`,
        sql`(${vatCreditCarryforwards.creditOriginPeriodYear} * 12 + ${vatCreditCarryforwards.creditOriginPeriodMonth}) < ${filingPeriod}`
      )
    );

  return {
    period: {
      year: data.periodYear,
      month: data.periodMonth,
    },
    pp30: {
      filingId: pp30Filing?.id ?? null,
      status: pp30Filing?.status ?? "not_built",
      paymentStatus: pp30Filing?.paymentStatus ?? "not_required",
      deadline: formatBangkokDate(pp30DeadlineDate),
      outputVatTotal,
      inputVatTotal,
      pp36ReclaimTotal,
      carryforwardIn,
      carryforwardOut: normalizeMoney(pp30Filing?.carryforwardOut ?? "0"),
      netPayable,
      refundable,
      signedNetPosition,
      nilFilingRequired:
        moneyToCents(outputVatTotal) === BigInt(0) &&
        moneyToCents(inputVatTotal) === BigInt(0) &&
        moneyToCents(pp36ReclaimTotal) === BigInt(0) &&
        moneyToCents(carryforwardIn) === BigInt(0),
    },
    pp36: {
      filingId: pp36Filing?.id ?? null,
      status: pp36Filing?.status ?? "not_built",
      paymentStatus: pp36Filing?.paymentStatus ?? "not_required",
      deadline: formatBangkokDate(pp36DeadlineDate),
      pp36VatTotal: normalizeMoney(pp36Filing?.pp36VatTotal ?? candidatePp36?.total),
      paidAt: pp36Filing?.paidAt ?? null,
      rdReceiptNo: pp36Filing?.rdReceiptNo ?? null,
    },
    inputItems: overview.inputItems,
    outputItems: overview.outputItems,
    pp36Items: overview.pp36Items,
    exceptions: overview.exceptions,
    warnings: {
      expiringInputVat: {
        count: expiringInput?.count ?? 0,
        vatAmount: normalizeMoney(expiringInput?.vatAmount),
      },
      pp36ReclaimQueue: {
        count: pp36ReclaimQueue?.count ?? 0,
        vatAmount: normalizeMoney(pp36ReclaimQueue?.vatAmount),
      },
      availableCarryforward: {
        count: availableCarryforward?.count ?? 0,
        amount: normalizeMoney(availableCarryforward?.amount),
      },
    },
  };
}

export async function getVatBranchReadiness(
  data: WithConnection & {
    orgId: string;
    periodYear: number;
    periodMonth: number;
  }
) {
  const conn = await getConnection(data.tx);
  const branches = await conn
    .select({
      id: establishments.id,
      branchNumber: establishments.branchNumber,
      nameTh: establishments.nameTh,
      nameEn: establishments.nameEn,
      isHeadOffice: establishments.isHeadOffice,
      consolidatedFilingApproved: establishments.consolidatedFilingApproved,
    })
    .from(establishments)
    .where(
      and(
        eq(establishments.orgId, data.orgId),
        eq(establishments.vatRegistered, true),
        sql`${establishments.deletedAt} IS NULL`
      )
    )
    .orderBy(sql`${establishments.isHeadOffice} DESC`, establishments.branchNumber);

  return Promise.all(
    branches.map(async (branch) => {
      const dashboard = await getVatLedgerPeriodDashboard({
        tx: conn,
        orgId: data.orgId,
        establishmentId: branch.id,
        periodYear: data.periodYear,
        periodMonth: data.periodMonth,
      });
      const [missingInputBranch] = await conn
        .select({ count: sql<number>`COUNT(*)::int` })
        .from(vatInputItems)
        .where(
          and(
            eq(vatInputItems.orgId, data.orgId),
            eq(vatInputItems.status, "claimable"),
            eq(vatInputItems.eligiblePeriodYear, data.periodYear),
            eq(vatInputItems.eligiblePeriodMonth, data.periodMonth),
            sql`${vatInputItems.establishmentId} IS NULL`,
            sql`${vatInputItems.deletedAt} IS NULL`
          )
        );
      const [missingOutputBranch] = await conn
        .select({ count: sql<number>`COUNT(*)::int` })
        .from(vatOutputItems)
        .where(
          and(
            eq(vatOutputItems.orgId, data.orgId),
            eq(vatOutputItems.status, "reportable"),
            eq(vatOutputItems.outputPeriodYear, data.periodYear),
            eq(vatOutputItems.outputPeriodMonth, data.periodMonth),
            sql`${vatOutputItems.establishmentId} IS NULL`,
            sql`${vatOutputItems.deletedAt} IS NULL`
          )
        );

      return {
        ...branch,
        pp30: dashboard.pp30,
        missingBranchCount:
          (missingInputBranch?.count ?? 0) + (missingOutputBranch?.count ?? 0),
      };
    })
  );
}

export async function getVatFilingDrilldown(
  data: WithConnection & {
    orgId: string;
    filingId: string;
  }
) {
  const conn = await getConnection(data.tx);
  const [filing] = await conn
    .select()
    .from(vatFilings)
    .where(
      and(
        eq(vatFilings.orgId, data.orgId),
        eq(vatFilings.id, data.filingId),
        sql`${vatFilings.deletedAt} IS NULL`
      )
    )
    .limit(1);
  if (!filing) {
    throw new VatLedgerStateError("VAT filing not found");
  }

  const lines = await conn
    .select({
      id: vatFilingLines.id,
      lineType: vatFilingLines.lineType,
      amount: vatFilingLines.amount,
      vatAmount: vatFilingLines.vatAmount,
      vatInputItemId: vatFilingLines.vatInputItemId,
      vatOutputItemId: vatFilingLines.vatOutputItemId,
      pp36ObligationId: vatFilingLines.pp36ObligationId,
      frozenSnapshot: vatFilingLines.frozenSnapshot,
      frozenSnapshotHash: vatFilingLines.frozenSnapshotHash,
      createdAt: vatFilingLines.createdAt,
    })
    .from(vatFilingLines)
    .where(and(eq(vatFilingLines.orgId, data.orgId), eq(vatFilingLines.filingId, data.filingId)))
    .orderBy(vatFilingLines.lineType, vatFilingLines.createdAt, vatFilingLines.id);

  const grouped = lines.reduce<Record<string, typeof lines>>((acc, line) => {
    acc[line.lineType] ??= [];
    acc[line.lineType].push(line);
    return acc;
  }, {});
  const totalsByType = Object.fromEntries(
    Object.entries(grouped).map(([lineType, group]) => [
      lineType,
      normalizeMoney(centsToMoney(group.reduce((sum, line) => sum + moneyToCents(line.vatAmount), BigInt(0)))),
    ])
  );

  return {
    filing,
    lines,
    grouped,
    totalsByType,
    reconciles: {
      output:
        normalizeMoney(filing.outputVatTotal) === normalizeMoney(totalsByType.output),
      input:
        normalizeMoney(filing.inputVatTotal) === normalizeMoney(totalsByType.input),
      pp36:
        normalizeMoney(filing.pp36VatTotal) ===
        normalizeMoney(totalsByType.pp36_obligation),
      pp36Reclaim:
        normalizeMoney(filing.pp36ReclaimTotal) ===
        normalizeMoney(totalsByType.pp36_reclaim),
      carryforward:
        normalizeMoney(filing.carryforwardIn) ===
        normalizeMoney(totalsByType.carryforward),
    },
  };
}

export async function getVatForecastByPeriodRange(
  data: WithConnection & {
    orgId: string;
    startYear: number;
    startMonth: number;
    months?: number;
  }
) {
  const conn = await getConnection(data.tx);
  const monthCount = data.months ?? 6;
  const periods = Array.from({ length: monthCount }, (_, index) =>
    addMonthsToPeriod({ year: data.startYear, month: data.startMonth }, index)
  );

  return Promise.all(
    periods.map(async (period) => {
      const dashboard = await getVatLedgerPeriodDashboard({
        tx: conn,
        orgId: data.orgId,
        periodYear: period.year,
        periodMonth: period.month,
      });
      const periodIndex = period.year * 12 + period.month;
      const [localInputExpiring] = await conn
        .select({
          count: sql<number>`COUNT(*)::int`,
          vatAmount: sql<string>`COALESCE(SUM(${vatInputItems.vatAmount}), 0)::numeric(14,2)::text`,
        })
        .from(vatInputItems)
        .where(
          and(
            eq(vatInputItems.orgId, data.orgId),
            eq(vatInputItems.status, "claimable"),
            sql`${vatInputItems.deletedAt} IS NULL`,
            sql`${vatInputItems.taxInvoiceSubtype} IN ('full_ti', 'e_tax_invoice')`,
            sql`${vatInputItems.taxInvoiceNo} IS NOT NULL`,
            sql`${vatInputItems.taxInvoiceDate} IS NOT NULL`,
            eq(vatInputItems.expiryPeriodYear, period.year),
            eq(vatInputItems.expiryPeriodMonth, period.month)
          )
        );
      const [pp36Reclaimable] = await conn
        .select({
          count: sql<number>`COUNT(*)::int`,
          vatAmount: sql<string>`COALESCE(SUM(${pp36Obligations.vatAmount}), 0)::numeric(14,2)::text`,
        })
        .from(pp36Obligations)
        .where(
          and(
            eq(pp36Obligations.orgId, data.orgId),
            eq(pp36Obligations.status, "eligible_for_pp30_reclaim"),
            sql`${pp36Obligations.deletedAt} IS NULL`,
            sql`${pp36Obligations.pp30ReclaimEligiblePeriodYear} IS NOT NULL`,
            sql`${pp36Obligations.pp30ReclaimEligiblePeriodMonth} IS NOT NULL`,
            sql`${pp36Obligations.pp30ReclaimExpiryPeriodYear} IS NOT NULL`,
            sql`${pp36Obligations.pp30ReclaimExpiryPeriodMonth} IS NOT NULL`,
            sql`(${pp36Obligations.pp30ReclaimEligiblePeriodYear} * 12 + ${pp36Obligations.pp30ReclaimEligiblePeriodMonth}) <= ${periodIndex}`,
            sql`(${pp36Obligations.pp30ReclaimExpiryPeriodYear} * 12 + ${pp36Obligations.pp30ReclaimExpiryPeriodMonth}) >= ${periodIndex}`
          )
        );

      return {
        period,
        pp30: dashboard.pp30,
        pp36: dashboard.pp36,
        expiringInputVat: {
          count: localInputExpiring?.count ?? 0,
          vatAmount: normalizeMoney(localInputExpiring?.vatAmount),
        },
        pp36Reclaimable: {
          count: pp36Reclaimable?.count ?? 0,
          vatAmount: normalizeMoney(pp36Reclaimable?.vatAmount),
        },
        advisoryOnly: true,
      };
    })
  );
}

export async function getVatLedgerRegister(
  data: WithConnection & {
    orgId: string;
    periodYear: number;
    periodMonth: number;
  }
) {
  const conn = await getConnection(data.tx);
  const inputRegister = await conn
    .select({
      date: vatInputItems.taxInvoiceDate,
      documentNumber: vatInputItems.taxInvoiceNo,
      vendorName: vendors.name,
      vendorTaxId: vendors.taxId,
      baseAmount: vatInputItems.baseAmount,
      vatAmount: vatInputItems.vatAmount,
      status: vatInputItems.status,
    })
    .from(vatInputItems)
    .leftJoin(vendors, eq(vendors.id, vatInputItems.vendorId))
    .where(
      and(
        eq(vatInputItems.orgId, data.orgId),
        sql`${vatInputItems.deletedAt} IS NULL`,
        sql`${vatInputItems.status} IN ('claimable', 'held', 'allocated_to_draft', 'filed', 'expired')`,
        sql`${vatInputItems.eligiblePeriodYear} IS NOT NULL`,
        sql`${vatInputItems.eligiblePeriodMonth} IS NOT NULL`,
        sql`${vatInputItems.eligiblePeriodYear} = ${data.periodYear}`,
        sql`${vatInputItems.eligiblePeriodMonth} = ${data.periodMonth}`
      )
    )
    .orderBy(vatInputItems.taxInvoiceDate, vatInputItems.createdAt);

  const outputRegister = await conn
    .select({
      date: vatOutputItems.taxPointDate,
      documentNumber: vatOutputItems.taxInvoiceNo,
      customerName: vendors.name,
      customerTaxId: vendors.taxId,
      baseAmount: vatOutputItems.baseAmount,
      vatAmount: vatOutputItems.vatAmount,
      status: vatOutputItems.status,
    })
    .from(vatOutputItems)
    .leftJoin(vendors, eq(vendors.id, vatOutputItems.customerId))
    .where(
      and(
        eq(vatOutputItems.orgId, data.orgId),
        eq(vatOutputItems.outputPeriodYear, data.periodYear),
        eq(vatOutputItems.outputPeriodMonth, data.periodMonth),
        sql`${vatOutputItems.deletedAt} IS NULL`,
        sql`${vatOutputItems.status} IN ('reportable', 'allocated_to_draft', 'filed', 'amended')`
      )
    )
    .orderBy(vatOutputItems.taxPointDate, vatOutputItems.createdAt);

  const inputTotal = centsToMoney(
    inputRegister.reduce((sum, item) => sum + moneyToCents(item.vatAmount), BigInt(0))
  );
  const outputTotal = centsToMoney(
    outputRegister.reduce((sum, item) => sum + moneyToCents(item.vatAmount), BigInt(0))
  );

  return {
    inputRegister: inputRegister.map((item) => ({
      date: item.date ?? "",
      documentNumber: item.documentNumber ?? "",
      vendorName: item.vendorName ?? "",
      vendorTaxId: item.vendorTaxId ?? "",
      baseAmount: item.baseAmount,
      vatAmount: item.vatAmount,
      status: item.status,
      isCreditNote: false,
    })),
    outputRegister: outputRegister.map((item) => ({
      date: item.date ?? "",
      documentNumber: item.documentNumber ?? "",
      customerName: item.customerName ?? "",
      customerTaxId: item.customerTaxId ?? "",
      baseAmount: item.baseAmount,
      vatAmount: item.vatAmount,
      status: item.status,
      isCreditNote: false,
    })),
    inputTotal,
    outputTotal,
  };
}

export async function listClaimableVatInputItemsForPp30Draft(
  data: WithConnection & {
    orgId: string;
    establishmentId?: string;
    periodYear: number;
    periodMonth: number;
    limit?: number;
  }
) {
  const conn = await getConnection(data.tx);
  if (!data.establishmentId) {
    throw new VatLedgerStateError("VAT branch is required for PP30 input candidates");
  }
  const filingPeriod = data.periodYear * 12 + data.periodMonth;
  return conn
    .select({
      id: vatInputItems.id,
      taxTreatmentDecisionId: vatInputItems.taxTreatmentDecisionId,
      sourceDocumentId: vatInputItems.sourceDocumentId,
      vendorId: vatInputItems.vendorId,
      taxInvoiceNo: vatInputItems.taxInvoiceNo,
      taxInvoiceDate: vatInputItems.taxInvoiceDate,
      taxInvoiceReceivedDate: vatInputItems.taxInvoiceReceivedDate,
      taxInvoiceSubtype: vatInputItems.taxInvoiceSubtype,
      vatAmount: vatInputItems.vatAmount,
      baseAmount: vatInputItems.baseAmount,
      vatRate: vatInputItems.vatRate,
      eligiblePeriodYear: vatInputItems.eligiblePeriodYear,
      eligiblePeriodMonth: vatInputItems.eligiblePeriodMonth,
      expiryPeriodYear: vatInputItems.expiryPeriodYear,
      expiryPeriodMonth: vatInputItems.expiryPeriodMonth,
      status: vatInputItems.status,
      sourceSnapshot: vatInputItems.sourceSnapshot,
      sourceSnapshotHash: vatInputItems.sourceSnapshotHash,
    })
    .from(vatInputItems)
    .where(
      and(
        eq(vatInputItems.orgId, data.orgId),
        eq(vatInputItems.establishmentId, data.establishmentId),
        eq(vatInputItems.status, "claimable"),
        sql`${vatInputItems.deletedAt} IS NULL`,
        sql`${vatInputItems.taxInvoiceSubtype} IN ('full_ti', 'e_tax_invoice')`,
        sql`${vatInputItems.taxInvoiceNo} IS NOT NULL`,
        sql`${vatInputItems.taxInvoiceDate} IS NOT NULL`,
        sql`${vatInputItems.eligiblePeriodYear} IS NOT NULL`,
        sql`${vatInputItems.eligiblePeriodMonth} IS NOT NULL`,
        sql`${vatInputItems.expiryPeriodYear} IS NOT NULL`,
        sql`${vatInputItems.expiryPeriodMonth} IS NOT NULL`,
        sql`(${vatInputItems.eligiblePeriodYear} * 12 + ${vatInputItems.eligiblePeriodMonth}) <= ${filingPeriod}`,
        sql`(${vatInputItems.expiryPeriodYear} * 12 + ${vatInputItems.expiryPeriodMonth}) >= ${filingPeriod}`
      )
    )
    .orderBy(
      sql`(${vatInputItems.expiryPeriodYear} IS NULL OR ${vatInputItems.expiryPeriodMonth} IS NULL) ASC`,
      sql`${vatInputItems.expiryPeriodYear} * 12 + ${vatInputItems.expiryPeriodMonth} ASC`,
      sql`${vatInputItems.eligiblePeriodYear} * 12 + ${vatInputItems.eligiblePeriodMonth} ASC`,
      sql`${vatInputItems.taxInvoiceDate} ASC NULLS LAST`,
      sql`${vatInputItems.createdAt} ASC`,
      sql`${vatInputItems.id} ASC`
    )
    .limit(data.limit ?? 500);
}

export async function listReportableVatOutputItemsForPp30Draft(
  data: WithConnection & {
    orgId: string;
    establishmentId?: string;
    periodYear: number;
    periodMonth: number;
    limit?: number;
  }
) {
  const conn = await getConnection(data.tx);
  if (!data.establishmentId) {
    throw new VatLedgerStateError("VAT branch is required for PP30 output candidates");
  }
  return conn
    .select({
      id: vatOutputItems.id,
      taxTreatmentDecisionId: vatOutputItems.taxTreatmentDecisionId,
      sourceDocumentId: vatOutputItems.sourceDocumentId,
      sourceDocumentLineId: vatOutputItems.sourceDocumentLineId,
      sourceTransactionId: vatOutputItems.sourceTransactionId,
      customerId: vatOutputItems.customerId,
      taxInvoiceNo: vatOutputItems.taxInvoiceNo,
      taxInvoiceDate: vatOutputItems.taxInvoiceDate,
      documentDate: vatOutputItems.documentDate,
      taxPointDate: vatOutputItems.taxPointDate,
      taxPointBasis: vatOutputItems.taxPointBasis,
      outputPeriodYear: vatOutputItems.outputPeriodYear,
      outputPeriodMonth: vatOutputItems.outputPeriodMonth,
      vatAmount: vatOutputItems.vatAmount,
      baseAmount: vatOutputItems.baseAmount,
      vatRate: vatOutputItems.vatRate,
      status: vatOutputItems.status,
      sourceSnapshot: vatOutputItems.sourceSnapshot,
      sourceSnapshotHash: vatOutputItems.sourceSnapshotHash,
    })
    .from(vatOutputItems)
    .where(
      and(
        eq(vatOutputItems.orgId, data.orgId),
        eq(vatOutputItems.establishmentId, data.establishmentId),
        eq(vatOutputItems.status, "reportable"),
        eq(vatOutputItems.outputPeriodYear, data.periodYear),
        eq(vatOutputItems.outputPeriodMonth, data.periodMonth),
        sql`${vatOutputItems.deletedAt} IS NULL`
      )
    )
    .orderBy(
      vatOutputItems.taxPointDate,
      vatOutputItems.taxInvoiceDate,
      vatOutputItems.createdAt,
      vatOutputItems.id
    )
    .limit(data.limit ?? 500);
}

export async function allocatePp30OutputVatDraftLines(
  data: WithConnection & {
    orgId: string;
    filingId: string;
    actorId: string;
    limit?: number;
  }
): Promise<{
  filingId: string;
  allocatedCount: number;
  outputVatTotal: string;
  truncated: boolean;
  lines: Array<typeof vatFilingLines.$inferSelect>;
}> {
  if (!data.tx) {
    const { db } = await import("../index");
    return db.transaction((tx) =>
      allocatePp30OutputVatDraftLines({ ...data, tx: tx as DbConnection })
    );
  }

  const conn = data.tx;
  await conn.execute(sql`
    SELECT id
    FROM vat_filings
    WHERE id = ${data.filingId}
      AND org_id = ${data.orgId}
      AND deleted_at IS NULL
    FOR UPDATE
  `);

  const [filing] = await conn
    .select({
      filingType: vatFilings.filingType,
      establishmentId: vatFilings.establishmentId,
      periodYear: vatFilings.periodYear,
      periodMonth: vatFilings.periodMonth,
      status: vatFilings.status,
    })
    .from(vatFilings)
    .where(
      and(
        eq(vatFilings.id, data.filingId),
        eq(vatFilings.orgId, data.orgId),
        sql`${vatFilings.deletedAt} IS NULL`
      )
    )
    .limit(1);

  if (!filing) {
    throw new VatLedgerStateError("PP30 draft filing not found");
  }
  if (filing.filingType !== "pp30" || filing.status !== "draft") {
    throw new VatLedgerStateError("Output VAT can only be allocated to a draft PP30 filing");
  }
  if (!filing.establishmentId) {
    throw new VatLedgerStateError("PP30 filing draft requires a VAT branch");
  }

  const [existingOutputLines] = await conn
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(vatFilingLines)
    .where(
      and(
        eq(vatFilingLines.orgId, data.orgId),
        eq(vatFilingLines.filingId, data.filingId),
        eq(vatFilingLines.lineType, "output")
      )
    );
  if ((existingOutputLines?.count ?? 0) > 0) {
    const pendingCandidates = await listReportableVatOutputItemsForPp30Draft({
      tx: conn,
      orgId: data.orgId,
      establishmentId: filing.establishmentId,
      periodYear: filing.periodYear,
      periodMonth: filing.periodMonth,
      limit: 1,
    });
    if (pendingCandidates.length === 0) {
      const lines = await conn
        .select()
        .from(vatFilingLines)
        .where(
          and(
            eq(vatFilingLines.orgId, data.orgId),
            eq(vatFilingLines.filingId, data.filingId),
            eq(vatFilingLines.lineType, "output")
          )
        )
        .orderBy(vatFilingLines.createdAt, vatFilingLines.id);
      const outputVatTotal = centsToMoney(
        lines.reduce((sum, line) => sum + moneyToCents(line.vatAmount), BigInt(0))
      );
      return {
        filingId: data.filingId,
        allocatedCount: lines.length,
        outputVatTotal,
        truncated: false,
        lines,
      };
    }
  }

  const allocationLimit = data.limit ?? 500;
  const fetchedCandidates = await listReportableVatOutputItemsForPp30Draft({
    tx: conn,
    orgId: data.orgId,
    establishmentId: filing.establishmentId,
    periodYear: filing.periodYear,
    periodMonth: filing.periodMonth,
    limit: allocationLimit + 1,
  });
  const truncated = fetchedCandidates.length > allocationLimit;
  const candidates = fetchedCandidates.slice(0, allocationLimit);
  if (truncated) {
    throw new VatLedgerStateError(
      "PP30 output VAT allocation would exceed the allocation limit; use a larger limit or full draft builder"
    );
  }

  const lines: Array<typeof vatFilingLines.$inferSelect> = [];
  for (const candidate of candidates) {
    const [updated] = await conn
      .update(vatOutputItems)
      .set({ draftFilingId: data.filingId, status: "allocated_to_draft", updatedAt: new Date() })
      .where(
        and(
          eq(vatOutputItems.id, candidate.id),
          eq(vatOutputItems.orgId, data.orgId),
          eq(vatOutputItems.status, "reportable"),
          sql`${vatOutputItems.deletedAt} IS NULL`
        )
      )
      .returning({ id: vatOutputItems.id });
    if (!updated) {
      continue;
    }

    const frozenSnapshot = {
      source: "pp30_output_allocation_v1",
      vatOutputItemId: candidate.id,
      taxTreatmentDecisionId: candidate.taxTreatmentDecisionId,
      sourceDocumentId: candidate.sourceDocumentId,
      sourceDocumentLineId: candidate.sourceDocumentLineId,
      sourceTransactionId: candidate.sourceTransactionId,
      customerId: candidate.customerId,
      taxInvoiceNo: candidate.taxInvoiceNo,
      taxInvoiceDate: candidate.taxInvoiceDate,
      documentDate: candidate.documentDate,
      taxPointDate: candidate.taxPointDate,
      taxPointBasis: candidate.taxPointBasis,
      outputPeriodYear: candidate.outputPeriodYear,
      outputPeriodMonth: candidate.outputPeriodMonth,
      vatRate: candidate.vatRate,
      sourceSnapshotHash: candidate.sourceSnapshotHash,
      sourceSnapshot: candidate.sourceSnapshot,
    };
    const [line] = await conn
      .insert(vatFilingLines)
      .values({
        orgId: data.orgId,
        filingId: data.filingId,
        lineType: "output",
        vatOutputItemId: candidate.id,
        amount: candidate.baseAmount,
        vatAmount: candidate.vatAmount,
        frozenSnapshot,
        frozenSnapshotHash: hashVatSnapshot(frozenSnapshot),
      })
      .returning();
    lines.push(line);
  }

  const [lineTotal] = await conn
    .select({
      outputVatTotal: sql<string>`COALESCE(SUM(${vatFilingLines.vatAmount}), 0)::numeric(14,2)::text`,
    })
    .from(vatFilingLines)
    .where(
      and(
        eq(vatFilingLines.orgId, data.orgId),
        eq(vatFilingLines.filingId, data.filingId),
        eq(vatFilingLines.lineType, "output")
      )
    );
  const outputVatTotal = normalizeMoney(lineTotal?.outputVatTotal ?? "0");

  await conn
    .update(vatFilings)
    .set({ outputVatTotal, updatedAt: new Date() })
    .where(and(eq(vatFilings.id, data.filingId), eq(vatFilings.orgId, data.orgId)));

  await conn.insert(auditLog).values({
    orgId: data.orgId,
    entityType: "vat_filing",
    entityId: data.filingId,
    action: "update",
    actorId: data.actorId,
    newValue: {
      operation: "allocate_pp30_output",
      periodYear: filing.periodYear,
      periodMonth: filing.periodMonth,
      allocatedCount: lines.length,
      outputVatTotal,
      vatOutputItemIds: lines.map((line) => line.vatOutputItemId),
      truncated,
    },
  });

  return {
    filingId: data.filingId,
    allocatedCount: lines.length,
    outputVatTotal,
    truncated,
    lines,
  };
}

export async function listEligiblePp36ReclaimsForPp30Draft(
  data: WithConnection & {
    orgId: string;
    establishmentId?: string;
    periodYear: number;
    periodMonth: number;
    limit?: number;
  }
) {
  const conn = await getConnection(data.tx);
  if (!data.establishmentId) {
    throw new VatLedgerStateError("VAT branch is required for PP36 reclaim candidates");
  }
  const filingPeriod = data.periodYear * 12 + data.periodMonth;
  return conn
    .select({
      id: pp36Obligations.id,
      taxTreatmentDecisionId: pp36Obligations.taxTreatmentDecisionId,
      sourceDocumentId: pp36Obligations.sourceDocumentId,
      sourceDocumentLineId: pp36Obligations.sourceDocumentLineId,
      sourcePaymentTransactionId: pp36Obligations.sourcePaymentTransactionId,
      sourceReconciliationMatchId: pp36Obligations.sourceReconciliationMatchId,
      vendorId: pp36Obligations.vendorId,
      vendorCountryCode: pp36Obligations.vendorCountryCode,
      serviceDescription: pp36Obligations.serviceDescription,
      baseAmountThb: pp36Obligations.baseAmountThb,
      vatAmount: pp36Obligations.vatAmount,
      vatRate: pp36Obligations.vatRate,
      occurredOn: pp36Obligations.occurredOn,
      paymentDate: pp36Obligations.paymentDate,
      taxPointDate: pp36Obligations.taxPointDate,
      pp36PeriodYear: pp36Obligations.pp36PeriodYear,
      pp36PeriodMonth: pp36Obligations.pp36PeriodMonth,
      pp36FilingId: pp36Obligations.pp36FilingId,
      pp36FilingLineId: pp36Obligations.pp36FilingLineId,
      pp36PaidAt: pp36Obligations.pp36PaidAt,
      pp36PaymentTransactionId: pp36Obligations.pp36PaymentTransactionId,
      pp30ReclaimEligiblePeriodYear: pp36Obligations.pp30ReclaimEligiblePeriodYear,
      pp30ReclaimEligiblePeriodMonth: pp36Obligations.pp30ReclaimEligiblePeriodMonth,
      pp30ReclaimExpiryPeriodYear: pp36Obligations.pp30ReclaimExpiryPeriodYear,
      pp30ReclaimExpiryPeriodMonth: pp36Obligations.pp30ReclaimExpiryPeriodMonth,
      sourceSnapshot: pp36Obligations.sourceSnapshot,
      sourceSnapshotHash: pp36Obligations.sourceSnapshotHash,
    })
    .from(pp36Obligations)
    .where(
      and(
        eq(pp36Obligations.orgId, data.orgId),
        // PP36 obligations are org-level: pp36_establishment_null_check forces
        // establishment_id to stay NULL, so reclaim candidates form one org-wide
        // pool. The NOT EXISTS below prevents double-claiming across branch
        // drafts; the establishmentId argument only asserts branch context.
        eq(pp36Obligations.status, "eligible_for_pp30_reclaim"),
        sql`${pp36Obligations.deletedAt} IS NULL`,
        sql`${pp36Obligations.pp36PaidAt} IS NOT NULL`,
        sql`${pp36Obligations.pp30ReclaimEligiblePeriodYear} IS NOT NULL`,
        sql`${pp36Obligations.pp30ReclaimEligiblePeriodMonth} IS NOT NULL`,
        sql`${pp36Obligations.pp30ReclaimExpiryPeriodYear} IS NOT NULL`,
        sql`${pp36Obligations.pp30ReclaimExpiryPeriodMonth} IS NOT NULL`,
        sql`(${pp36Obligations.pp30ReclaimEligiblePeriodYear} * 12 + ${pp36Obligations.pp30ReclaimEligiblePeriodMonth}) <= ${filingPeriod}`,
        sql`(${pp36Obligations.pp30ReclaimExpiryPeriodYear} * 12 + ${pp36Obligations.pp30ReclaimExpiryPeriodMonth}) >= ${filingPeriod}`,
        sql`NOT EXISTS (
          SELECT 1
          FROM ${vatFilingLines}
          WHERE ${vatFilingLines.orgId} = ${pp36Obligations.orgId}
            AND ${vatFilingLines.pp36ObligationId} = ${pp36Obligations.id}
            AND ${vatFilingLines.lineType} = 'pp36_reclaim'
        )`
      )
    )
    .orderBy(
      pp36Obligations.pp30ReclaimExpiryPeriodYear,
      pp36Obligations.pp30ReclaimExpiryPeriodMonth,
      pp36Obligations.pp36PaidAt,
      pp36Obligations.id
    )
    .limit(data.limit ?? 500);
}

export type Pp36ReclaimTrackerRow = {
  id: string;
  vendorCountryCode: string | null;
  serviceDescription: string | null;
  vatAmount: string;
  status: string;
  pp36PeriodYear: number;
  pp36PeriodMonth: number;
  pp36FilingId: string | null;
  pp36PaidAt: Date | null;
  pp30ReclaimEligiblePeriodYear: number | null;
  pp30ReclaimEligiblePeriodMonth: number | null;
  pp30ReclaimExpiryPeriodYear: number | null;
  pp30ReclaimExpiryPeriodMonth: number | null;
  pp30ReclaimFilingId: string | null;
  pp30ReclaimFilingLineId: string | null;
};

export async function getPp36ReclaimTracker(data: WithConnection & {
  orgId: string;
  limit?: number;
}): Promise<Pp36ReclaimTrackerRow[]> {
  const conn = await getConnection(data.tx);
  return conn
    .select({
      id: pp36Obligations.id,
      vendorCountryCode: pp36Obligations.vendorCountryCode,
      serviceDescription: pp36Obligations.serviceDescription,
      vatAmount: pp36Obligations.vatAmount,
      status: pp36Obligations.status,
      pp36PeriodYear: pp36Obligations.pp36PeriodYear,
      pp36PeriodMonth: pp36Obligations.pp36PeriodMonth,
      pp36FilingId: pp36Obligations.pp36FilingId,
      pp36PaidAt: pp36Obligations.pp36PaidAt,
      pp30ReclaimEligiblePeriodYear: pp36Obligations.pp30ReclaimEligiblePeriodYear,
      pp30ReclaimEligiblePeriodMonth: pp36Obligations.pp30ReclaimEligiblePeriodMonth,
      pp30ReclaimExpiryPeriodYear: pp36Obligations.pp30ReclaimExpiryPeriodYear,
      pp30ReclaimExpiryPeriodMonth: pp36Obligations.pp30ReclaimExpiryPeriodMonth,
      pp30ReclaimFilingId: pp36Obligations.pp30ReclaimFilingId,
      pp30ReclaimFilingLineId: pp36Obligations.pp30ReclaimFilingLineId,
    })
    .from(pp36Obligations)
    .where(
      and(
        eq(pp36Obligations.orgId, data.orgId),
        sql`${pp36Obligations.deletedAt} IS NULL`
      )
    )
    .orderBy(
      sql`${pp36Obligations.pp36PeriodYear} DESC`,
      sql`${pp36Obligations.pp36PeriodMonth} DESC`,
      pp36Obligations.id
    )
    .limit(data.limit ?? 50);
}

export async function allocatePp36ReclaimDraftLines(
  data: WithConnection & {
    orgId: string;
    filingId: string;
    actorId: string;
    limit?: number;
  }
): Promise<{
  filingId: string;
  allocatedCount: number;
  pp36ReclaimTotal: string;
  truncated: boolean;
  lines: Array<typeof vatFilingLines.$inferSelect>;
}> {
  if (!data.tx) {
    const { db } = await import("../index");
    return db.transaction((tx) =>
      allocatePp36ReclaimDraftLines({ ...data, tx: tx as DbConnection })
    );
  }

  const conn = data.tx;
  await conn.execute(sql`
    SELECT id
    FROM vat_filings
    WHERE id = ${data.filingId}
      AND org_id = ${data.orgId}
      AND deleted_at IS NULL
    FOR UPDATE
  `);

  const [filing] = await conn
    .select({
      filingType: vatFilings.filingType,
      establishmentId: vatFilings.establishmentId,
      periodYear: vatFilings.periodYear,
      periodMonth: vatFilings.periodMonth,
      status: vatFilings.status,
    })
    .from(vatFilings)
    .where(
      and(
        eq(vatFilings.id, data.filingId),
        eq(vatFilings.orgId, data.orgId),
        sql`${vatFilings.deletedAt} IS NULL`
      )
    )
    .limit(1);

  if (!filing) {
    throw new VatLedgerStateError("PP30 draft filing not found");
  }
  if (filing.filingType !== "pp30" || filing.status !== "draft") {
    throw new VatLedgerStateError("PP36 reclaims can only be allocated to a draft PP30 filing");
  }
  if (!filing.establishmentId) {
    throw new VatLedgerStateError("PP30 filing draft requires a VAT branch");
  }

  const [existingReclaimLines] = await conn
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(vatFilingLines)
    .where(
      and(
        eq(vatFilingLines.orgId, data.orgId),
        eq(vatFilingLines.filingId, data.filingId),
        eq(vatFilingLines.lineType, "pp36_reclaim")
      )
    );
  if ((existingReclaimLines?.count ?? 0) > 0) {
    const pendingCandidates = await listEligiblePp36ReclaimsForPp30Draft({
      tx: conn,
      orgId: data.orgId,
      establishmentId: filing.establishmentId,
      periodYear: filing.periodYear,
      periodMonth: filing.periodMonth,
      limit: 1,
    });
    if (pendingCandidates.length === 0) {
      const lines = await conn
        .select()
        .from(vatFilingLines)
        .where(
          and(
            eq(vatFilingLines.orgId, data.orgId),
            eq(vatFilingLines.filingId, data.filingId),
            eq(vatFilingLines.lineType, "pp36_reclaim")
          )
        )
        .orderBy(vatFilingLines.createdAt, vatFilingLines.id);
      const pp36ReclaimTotal = centsToMoney(
        lines.reduce((sum, line) => sum + moneyToCents(line.vatAmount), BigInt(0))
      );
      return {
        filingId: data.filingId,
        allocatedCount: lines.length,
        pp36ReclaimTotal,
        truncated: false,
        lines,
      };
    }
  }

  const allocationLimit = data.limit ?? 500;
  const fetchedCandidates = await listEligiblePp36ReclaimsForPp30Draft({
    tx: conn,
    orgId: data.orgId,
    establishmentId: filing.establishmentId,
    periodYear: filing.periodYear,
    periodMonth: filing.periodMonth,
    limit: allocationLimit + 1,
  });
  const truncated = fetchedCandidates.length > allocationLimit;
  const candidates = fetchedCandidates.slice(0, allocationLimit);
  if (truncated) {
    throw new VatLedgerStateError(
      "PP36 reclaim allocation would exceed the allocation limit; use a larger limit or full draft builder"
    );
  }

  const lines: Array<typeof vatFilingLines.$inferSelect> = [];
  for (const candidate of candidates) {
    const [locked] = await conn
      .select({ id: pp36Obligations.id })
      .from(pp36Obligations)
      .where(
        and(
          eq(pp36Obligations.id, candidate.id),
          eq(pp36Obligations.orgId, data.orgId),
          eq(pp36Obligations.status, "eligible_for_pp30_reclaim"),
          sql`${pp36Obligations.deletedAt} IS NULL`
        )
      )
      .for("update")
      .limit(1);
    if (!locked) {
      continue;
    }

    const frozenSnapshot = {
      source: "pp30_pp36_reclaim_allocation_v1",
      pp36ObligationId: candidate.id,
      taxTreatmentDecisionId: candidate.taxTreatmentDecisionId,
      sourceDocumentId: candidate.sourceDocumentId,
      sourceDocumentLineId: candidate.sourceDocumentLineId,
      sourcePaymentTransactionId: candidate.sourcePaymentTransactionId,
      sourceReconciliationMatchId: candidate.sourceReconciliationMatchId,
      vendorId: candidate.vendorId,
      vendorCountryCode: candidate.vendorCountryCode,
      serviceDescription: candidate.serviceDescription,
      baseAmountThb: candidate.baseAmountThb,
      vatAmount: candidate.vatAmount,
      vatRate: candidate.vatRate,
      occurredOn: candidate.occurredOn,
      paymentDate: candidate.paymentDate,
      taxPointDate: candidate.taxPointDate,
      pp36PeriodYear: candidate.pp36PeriodYear,
      pp36PeriodMonth: candidate.pp36PeriodMonth,
      pp36FilingId: candidate.pp36FilingId,
      pp36FilingLineId: candidate.pp36FilingLineId,
      pp36PaidAt: candidate.pp36PaidAt,
      pp36PaymentTransactionId: candidate.pp36PaymentTransactionId,
      pp30ReclaimEligiblePeriodYear: candidate.pp30ReclaimEligiblePeriodYear,
      pp30ReclaimEligiblePeriodMonth: candidate.pp30ReclaimEligiblePeriodMonth,
      pp30ReclaimExpiryPeriodYear: candidate.pp30ReclaimExpiryPeriodYear,
      pp30ReclaimExpiryPeriodMonth: candidate.pp30ReclaimExpiryPeriodMonth,
      sourceSnapshotHash: candidate.sourceSnapshotHash,
      sourceSnapshot: candidate.sourceSnapshot,
    };
    const [line] = await conn
      .insert(vatFilingLines)
      .values({
        orgId: data.orgId,
        filingId: data.filingId,
        lineType: "pp36_reclaim",
        pp36ObligationId: candidate.id,
        amount: candidate.vatAmount,
        vatAmount: candidate.vatAmount,
        frozenSnapshot,
        frozenSnapshotHash: hashVatSnapshot(frozenSnapshot),
      })
      .returning();
    lines.push(line);
  }

  const [lineTotal] = await conn
    .select({
      pp36ReclaimTotal: sql<string>`COALESCE(SUM(${vatFilingLines.vatAmount}), 0)::numeric(14,2)::text`,
    })
    .from(vatFilingLines)
    .where(
      and(
        eq(vatFilingLines.orgId, data.orgId),
        eq(vatFilingLines.filingId, data.filingId),
        eq(vatFilingLines.lineType, "pp36_reclaim")
      )
    );
  const pp36ReclaimTotal = normalizeMoney(lineTotal?.pp36ReclaimTotal ?? "0");

  await conn
    .update(vatFilings)
    .set({ pp36ReclaimTotal, updatedAt: new Date() })
    .where(and(eq(vatFilings.id, data.filingId), eq(vatFilings.orgId, data.orgId)));

  await conn.insert(auditLog).values({
    orgId: data.orgId,
    entityType: "vat_filing",
    entityId: data.filingId,
    action: "update",
    actorId: data.actorId,
    newValue: {
      operation: "allocate_pp36_reclaim",
      periodYear: filing.periodYear,
      periodMonth: filing.periodMonth,
      allocatedCount: lines.length,
      pp36ReclaimTotal,
      pp36ObligationIds: lines.map((line) => line.pp36ObligationId),
      truncated,
    },
  });

  return {
    filingId: data.filingId,
    allocatedCount: lines.length,
    pp36ReclaimTotal,
    truncated,
    lines,
  };
}

export async function buildPp30VatFilingDraft(
  data: WithConnection & {
    orgId: string;
    establishmentId?: string;
    periodYear: number;
    periodMonth: number;
    actorId: string;
    limitPerCategory?: number;
  }
): Promise<{
  filing: typeof vatFilings.$inferSelect;
  output: Awaited<ReturnType<typeof allocatePp30OutputVatDraftLines>>;
  input: Awaited<ReturnType<typeof allocatePp30InputVatDraftLines>>;
  pp36Reclaim: Awaited<ReturnType<typeof allocatePp36ReclaimDraftLines>>;
  carryforward: Awaited<ReturnType<typeof allocatePp30CreditCarryforwardDraftLines>>;
}> {
  if (!data.tx) {
    const { db } = await import("../index");
    return db.transaction((tx) =>
      buildPp30VatFilingDraft({ ...data, tx: tx as DbConnection })
    );
  }

  const conn = data.tx;
  if (!data.establishmentId) {
    throw new VatLedgerStateError("PP30 filing draft requires a VAT branch");
  }
  const [existing] = await conn
    .select()
    .from(vatFilings)
    .where(
      and(
        eq(vatFilings.orgId, data.orgId),
        eq(vatFilings.establishmentId, data.establishmentId),
        eq(vatFilings.filingType, "pp30"),
        eq(vatFilings.periodYear, data.periodYear),
        eq(vatFilings.periodMonth, data.periodMonth),
        eq(vatFilings.filingKind, "ordinary"),
        sql`${vatFilings.deletedAt} IS NULL`
      )
    )
    .limit(1);

  if (existing && existing.status !== "draft") {
    throw new VatLedgerStateError("Ordinary PP30 filing for this period is already beyond draft");
  }

  const filing =
    existing ??
    (await createVatFilingDraft({
      tx: conn,
      orgId: data.orgId,
      establishmentId: data.establishmentId,
      filingType: "pp30",
      periodYear: data.periodYear,
      periodMonth: data.periodMonth,
    }));

  const allocationData = {
    tx: conn,
    orgId: data.orgId,
    filingId: filing.id,
    actorId: data.actorId,
    limit: data.limitPerCategory,
  };
  const output = await allocatePp30OutputVatDraftLines(allocationData);
  const input = await allocatePp30InputVatDraftLines(allocationData);
  const pp36Reclaim = await allocatePp36ReclaimDraftLines(allocationData);
  const carryforward = await allocatePp30CreditCarryforwardDraftLines(allocationData);

  const [builtFiling] = await conn
    .select()
    .from(vatFilings)
    .where(and(eq(vatFilings.id, filing.id), eq(vatFilings.orgId, data.orgId)))
    .limit(1);

  await conn.insert(auditLog).values({
    orgId: data.orgId,
    entityType: "vat_filing",
    entityId: filing.id,
    action: "update",
    actorId: data.actorId,
    newValue: {
      operation: "build_pp30_vat_filing_draft",
      establishmentId: data.establishmentId,
      periodYear: data.periodYear,
      periodMonth: data.periodMonth,
      outputVatTotal: output.outputVatTotal,
      inputVatTotal: input.inputVatTotal,
      pp36ReclaimTotal: pp36Reclaim.pp36ReclaimTotal,
      carryforwardIn: carryforward.carryforwardIn,
      allocatedCounts: {
        output: output.allocatedCount,
        input: input.allocatedCount,
        pp36Reclaim: pp36Reclaim.allocatedCount,
        carryforward: carryforward.allocatedCount,
      },
    },
  });

  return {
    filing: builtFiling ?? filing,
    output,
    input,
    pp36Reclaim,
    carryforward,
  };
}

export async function listPp36ObligationsForDraft(
  data: WithConnection & {
    orgId: string;
    periodYear: number;
    periodMonth: number;
    limit?: number;
  }
) {
  const conn = await getConnection(data.tx);
  return conn
    .select({
      id: pp36Obligations.id,
      taxTreatmentDecisionId: pp36Obligations.taxTreatmentDecisionId,
      sourceDocumentId: pp36Obligations.sourceDocumentId,
      sourceDocumentLineId: pp36Obligations.sourceDocumentLineId,
      sourcePaymentTransactionId: pp36Obligations.sourcePaymentTransactionId,
      sourceReconciliationMatchId: pp36Obligations.sourceReconciliationMatchId,
      vendorId: pp36Obligations.vendorId,
      vendorCountryCode: pp36Obligations.vendorCountryCode,
      serviceDescription: pp36Obligations.serviceDescription,
      baseAmountThb: pp36Obligations.baseAmountThb,
      vatAmount: pp36Obligations.vatAmount,
      vatRate: pp36Obligations.vatRate,
      occurredOn: pp36Obligations.occurredOn,
      paymentDate: pp36Obligations.paymentDate,
      taxPointDate: pp36Obligations.taxPointDate,
      periodBasis: pp36Obligations.periodBasis,
      pp36PeriodYear: pp36Obligations.pp36PeriodYear,
      pp36PeriodMonth: pp36Obligations.pp36PeriodMonth,
      sourceSnapshot: pp36Obligations.sourceSnapshot,
      sourceSnapshotHash: pp36Obligations.sourceSnapshotHash,
    })
    .from(pp36Obligations)
    .where(
      and(
        eq(pp36Obligations.orgId, data.orgId),
        eq(pp36Obligations.status, "pp36_required"),
        eq(pp36Obligations.pp36PeriodYear, data.periodYear),
        eq(pp36Obligations.pp36PeriodMonth, data.periodMonth),
        sql`${pp36Obligations.deletedAt} IS NULL`
      )
    )
    .orderBy(
      pp36Obligations.taxPointDate,
      pp36Obligations.paymentDate,
      pp36Obligations.createdAt,
      pp36Obligations.id
    )
    .limit(data.limit ?? 500);
}

export async function allocatePp36ObligationDraftLines(
  data: WithConnection & {
    orgId: string;
    filingId: string;
    actorId: string;
    limit?: number;
  }
): Promise<{
  filingId: string;
  allocatedCount: number;
  pp36VatTotal: string;
  truncated: boolean;
  lines: Array<typeof vatFilingLines.$inferSelect>;
}> {
  if (!data.tx) {
    const { db } = await import("../index");
    return db.transaction((tx) =>
      allocatePp36ObligationDraftLines({ ...data, tx: tx as DbConnection })
    );
  }

  const conn = data.tx;
  await conn.execute(sql`
    SELECT id
    FROM vat_filings
    WHERE id = ${data.filingId}
      AND org_id = ${data.orgId}
      AND deleted_at IS NULL
    FOR UPDATE
  `);

  const [filing] = await conn
    .select({
      filingType: vatFilings.filingType,
      establishmentId: vatFilings.establishmentId,
      periodYear: vatFilings.periodYear,
      periodMonth: vatFilings.periodMonth,
      status: vatFilings.status,
    })
    .from(vatFilings)
    .where(
      and(
        eq(vatFilings.id, data.filingId),
        eq(vatFilings.orgId, data.orgId),
        sql`${vatFilings.deletedAt} IS NULL`
      )
    )
    .limit(1);

  if (!filing) {
    throw new VatLedgerStateError("PP36 draft filing not found");
  }
  if (filing.filingType !== "pp36" || filing.status !== "draft") {
    throw new VatLedgerStateError("PP36 obligations can only be allocated to a draft PP36 filing");
  }

  const [existingLines] = await conn
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(vatFilingLines)
    .where(
      and(
        eq(vatFilingLines.orgId, data.orgId),
        eq(vatFilingLines.filingId, data.filingId),
        eq(vatFilingLines.lineType, "pp36_obligation")
      )
    );
  if ((existingLines?.count ?? 0) > 0) {
    const pendingCandidates = await listPp36ObligationsForDraft({
      tx: conn,
      orgId: data.orgId,
      periodYear: filing.periodYear,
      periodMonth: filing.periodMonth,
      limit: 1,
    });
    if (pendingCandidates.length === 0) {
      const lines = await conn
        .select()
        .from(vatFilingLines)
        .where(
          and(
            eq(vatFilingLines.orgId, data.orgId),
            eq(vatFilingLines.filingId, data.filingId),
            eq(vatFilingLines.lineType, "pp36_obligation")
          )
        )
        .orderBy(vatFilingLines.createdAt, vatFilingLines.id);
      const pp36VatTotal = centsToMoney(
        lines.reduce((sum, line) => sum + moneyToCents(line.vatAmount), BigInt(0))
      );
      return {
        filingId: data.filingId,
        allocatedCount: lines.length,
        pp36VatTotal,
        truncated: false,
        lines,
      };
    }
  }

  const allocationLimit = data.limit ?? 500;
  const fetchedCandidates = await listPp36ObligationsForDraft({
    tx: conn,
    orgId: data.orgId,
    periodYear: filing.periodYear,
    periodMonth: filing.periodMonth,
    limit: allocationLimit + 1,
  });
  const truncated = fetchedCandidates.length > allocationLimit;
  const candidates = fetchedCandidates.slice(0, allocationLimit);
  if (truncated) {
    throw new VatLedgerStateError(
      "PP36 obligation allocation would exceed the allocation limit; use a larger limit or full draft builder"
    );
  }

  const lines: Array<typeof vatFilingLines.$inferSelect> = [];
  for (const candidate of candidates) {
    const [locked] = await conn
      .select({ id: pp36Obligations.id })
      .from(pp36Obligations)
      .where(
        and(
          eq(pp36Obligations.id, candidate.id),
          eq(pp36Obligations.orgId, data.orgId),
          eq(pp36Obligations.status, "pp36_required"),
          sql`${pp36Obligations.deletedAt} IS NULL`
        )
      )
      .for("update")
      .limit(1);
    if (!locked) {
      continue;
    }

    const frozenSnapshot = {
      source: "pp36_obligation_allocation_v1",
      pp36ObligationId: candidate.id,
      taxTreatmentDecisionId: candidate.taxTreatmentDecisionId,
      sourceDocumentId: candidate.sourceDocumentId,
      sourceDocumentLineId: candidate.sourceDocumentLineId,
      sourcePaymentTransactionId: candidate.sourcePaymentTransactionId,
      sourceReconciliationMatchId: candidate.sourceReconciliationMatchId,
      vendorId: candidate.vendorId,
      vendorCountryCode: candidate.vendorCountryCode,
      serviceDescription: candidate.serviceDescription,
      baseAmountThb: candidate.baseAmountThb,
      vatAmount: candidate.vatAmount,
      vatRate: candidate.vatRate,
      occurredOn: candidate.occurredOn,
      paymentDate: candidate.paymentDate,
      taxPointDate: candidate.taxPointDate,
      periodBasis: candidate.periodBasis,
      pp36PeriodYear: candidate.pp36PeriodYear,
      pp36PeriodMonth: candidate.pp36PeriodMonth,
      sourceSnapshotHash: candidate.sourceSnapshotHash,
      sourceSnapshot: candidate.sourceSnapshot,
    };
    const [line] = await conn
      .insert(vatFilingLines)
      .values({
        orgId: data.orgId,
        filingId: data.filingId,
        lineType: "pp36_obligation",
        pp36ObligationId: candidate.id,
        amount: candidate.vatAmount,
        vatAmount: candidate.vatAmount,
        frozenSnapshot,
        frozenSnapshotHash: hashVatSnapshot(frozenSnapshot),
      })
      .returning();

    await conn
      .update(pp36Obligations)
      .set({
        pp36FilingId: data.filingId,
        pp36FilingLineId: line.id,
        status: "allocated_to_draft_pp36",
        updatedAt: new Date(),
      })
      .where(and(eq(pp36Obligations.id, candidate.id), eq(pp36Obligations.orgId, data.orgId)));
    lines.push(line);
  }

  const [lineTotal] = await conn
    .select({
      pp36VatTotal: sql<string>`COALESCE(SUM(${vatFilingLines.vatAmount}), 0)::numeric(14,2)::text`,
    })
    .from(vatFilingLines)
    .where(
      and(
        eq(vatFilingLines.orgId, data.orgId),
        eq(vatFilingLines.filingId, data.filingId),
        eq(vatFilingLines.lineType, "pp36_obligation")
      )
    );
  const pp36VatTotal = normalizeMoney(lineTotal?.pp36VatTotal ?? "0");

  await conn
    .update(vatFilings)
    .set({ pp36VatTotal, updatedAt: new Date() })
    .where(and(eq(vatFilings.id, data.filingId), eq(vatFilings.orgId, data.orgId)));

  await conn.insert(auditLog).values({
    orgId: data.orgId,
    entityType: "vat_filing",
    entityId: data.filingId,
    action: "update",
    actorId: data.actorId,
    newValue: {
      operation: "allocate_pp36_obligations",
      periodYear: filing.periodYear,
      periodMonth: filing.periodMonth,
      allocatedCount: lines.length,
      pp36VatTotal,
      pp36ObligationIds: lines.map((line) => line.pp36ObligationId),
      truncated,
    },
  });

  return {
    filingId: data.filingId,
    allocatedCount: lines.length,
    pp36VatTotal,
    truncated,
    lines,
  };
}

export async function buildPp36VatFilingDraft(
  data: WithConnection & {
    orgId: string;
    periodYear: number;
    periodMonth: number;
    actorId: string;
    limit?: number;
  }
): Promise<{
  filing: typeof vatFilings.$inferSelect;
  obligations: Awaited<ReturnType<typeof allocatePp36ObligationDraftLines>>;
}> {
  if (!data.tx) {
    const { db } = await import("../index");
    return db.transaction((tx) =>
      buildPp36VatFilingDraft({ ...data, tx: tx as DbConnection })
    );
  }

  const conn = data.tx;
  const [existing] = await conn
    .select()
    .from(vatFilings)
    .where(
      and(
        eq(vatFilings.orgId, data.orgId),
        eq(vatFilings.filingType, "pp36"),
        eq(vatFilings.periodYear, data.periodYear),
        eq(vatFilings.periodMonth, data.periodMonth),
        eq(vatFilings.filingKind, "ordinary"),
        sql`${vatFilings.deletedAt} IS NULL`
      )
    )
    .limit(1);

  if (existing && existing.status !== "draft") {
    throw new VatLedgerStateError("Ordinary PP36 filing for this period is already beyond draft");
  }

  const filing =
    existing ??
    (await createVatFilingDraft({
      tx: conn,
      orgId: data.orgId,
      filingType: "pp36",
      periodYear: data.periodYear,
      periodMonth: data.periodMonth,
    }));

  const obligations = await allocatePp36ObligationDraftLines({
    tx: conn,
    orgId: data.orgId,
    filingId: filing.id,
    actorId: data.actorId,
    limit: data.limit,
  });

  const [builtFiling] = await conn
    .select()
    .from(vatFilings)
    .where(and(eq(vatFilings.id, filing.id), eq(vatFilings.orgId, data.orgId)))
    .limit(1);

  await conn.insert(auditLog).values({
    orgId: data.orgId,
    entityType: "vat_filing",
    entityId: filing.id,
    action: "update",
    actorId: data.actorId,
    newValue: {
      operation: "build_pp36_vat_filing_draft",
      periodYear: data.periodYear,
      periodMonth: data.periodMonth,
      pp36VatTotal: obligations.pp36VatTotal,
      allocatedCount: obligations.allocatedCount,
    },
  });

  return {
    filing: builtFiling ?? filing,
    obligations,
  };
}

// Internal PP30 input allocation primitive. Use buildPp30VatFilingDraft when
// constructing a full PP30 filing draft from all ledger source queues.
export async function allocatePp30InputVatDraftLines(
  data: WithConnection & {
    orgId: string;
    filingId: string;
    actorId: string;
    limit?: number;
  }
): Promise<{
  filingId: string;
  allocatedCount: number;
  inputVatTotal: string;
  truncated: boolean;
  lines: Array<typeof vatFilingLines.$inferSelect>;
}> {
  if (!data.tx) {
    const { db } = await import("../index");
    return db.transaction((tx) =>
      allocatePp30InputVatDraftLines({ ...data, tx: tx as DbConnection })
    );
  }

  const conn = data.tx;
  await conn.execute(sql`
    SELECT id
    FROM vat_filings
    WHERE id = ${data.filingId}
      AND org_id = ${data.orgId}
      AND deleted_at IS NULL
    FOR UPDATE
  `);

  const [filing] = await conn
    .select({
      filingType: vatFilings.filingType,
      establishmentId: vatFilings.establishmentId,
      periodYear: vatFilings.periodYear,
      periodMonth: vatFilings.periodMonth,
      status: vatFilings.status,
    })
    .from(vatFilings)
    .where(
      and(
        eq(vatFilings.id, data.filingId),
        eq(vatFilings.orgId, data.orgId),
        sql`${vatFilings.deletedAt} IS NULL`
      )
    )
    .limit(1);

  if (!filing) {
    throw new VatLedgerStateError("PP30 draft filing not found");
  }
  if (filing.filingType !== "pp30" || filing.status !== "draft") {
    throw new VatLedgerStateError("Input VAT can only be allocated to a draft PP30 filing");
  }
  if (!filing.establishmentId) {
    throw new VatLedgerStateError("PP30 filing draft requires a VAT branch");
  }

  const [existingInputLines] = await conn
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(vatFilingLines)
    .where(
      and(
        eq(vatFilingLines.orgId, data.orgId),
        eq(vatFilingLines.filingId, data.filingId),
        eq(vatFilingLines.lineType, "input")
      )
    );
  if ((existingInputLines?.count ?? 0) > 0) {
    const pendingCandidates = await listClaimableVatInputItemsForPp30Draft({
      tx: conn,
      orgId: data.orgId,
      establishmentId: filing.establishmentId,
      periodYear: filing.periodYear,
      periodMonth: filing.periodMonth,
      limit: 1,
    });
    if (pendingCandidates.length === 0) {
      const lines = await conn
        .select()
        .from(vatFilingLines)
        .where(
          and(
            eq(vatFilingLines.orgId, data.orgId),
            eq(vatFilingLines.filingId, data.filingId),
            eq(vatFilingLines.lineType, "input")
          )
        )
        .orderBy(vatFilingLines.createdAt, vatFilingLines.id);
      const inputVatTotal = centsToMoney(
        lines.reduce((sum, line) => sum + moneyToCents(line.vatAmount), BigInt(0))
      );
      return {
        filingId: data.filingId,
        allocatedCount: lines.length,
        inputVatTotal,
        truncated: false,
        lines,
      };
    }
  }

  const allocationLimit = data.limit ?? 500;
  const fetchedCandidates = await listClaimableVatInputItemsForPp30Draft({
    tx: conn,
    orgId: data.orgId,
    establishmentId: filing.establishmentId,
    periodYear: filing.periodYear,
    periodMonth: filing.periodMonth,
    limit: allocationLimit + 1,
  });
  const truncated = fetchedCandidates.length > allocationLimit;
  const candidates = fetchedCandidates.slice(0, allocationLimit);
  if (truncated) {
    throw new VatLedgerStateError(
      "PP30 input VAT allocation would exceed the allocation limit; use a larger limit or full draft builder"
    );
  }

  const lines: Array<typeof vatFilingLines.$inferSelect> = [];
  for (const candidate of candidates) {
    const [updated] = await conn
      .update(vatInputItems)
      .set({
        draftFilingId: data.filingId,
        status: "allocated_to_draft",
        claimPeriodYear: filing.periodYear,
        claimPeriodMonth: filing.periodMonth,
      })
      .where(
        and(
          eq(vatInputItems.id, candidate.id),
          eq(vatInputItems.orgId, data.orgId),
          eq(vatInputItems.status, "claimable"),
          sql`${vatInputItems.deletedAt} IS NULL`
        )
      )
      .returning({ id: vatInputItems.id });
    if (!updated) {
      continue;
    }

    const frozenSnapshot = {
      source: "pp30_input_allocation_v1",
      vatInputItemId: candidate.id,
      taxTreatmentDecisionId: candidate.taxTreatmentDecisionId,
      sourceDocumentId: candidate.sourceDocumentId,
      vendorId: candidate.vendorId,
      taxInvoiceNo: candidate.taxInvoiceNo,
      taxInvoiceDate: candidate.taxInvoiceDate,
      taxInvoiceReceivedDate: candidate.taxInvoiceReceivedDate,
      taxInvoiceSubtype: candidate.taxInvoiceSubtype,
      eligiblePeriodYear: candidate.eligiblePeriodYear,
      eligiblePeriodMonth: candidate.eligiblePeriodMonth,
      expiryPeriodYear: candidate.expiryPeriodYear,
      expiryPeriodMonth: candidate.expiryPeriodMonth,
      vatRate: candidate.vatRate,
      sourceSnapshotHash: candidate.sourceSnapshotHash,
      sourceSnapshot: candidate.sourceSnapshot,
    };
    const [line] = await conn
      .insert(vatFilingLines)
      .values({
        orgId: data.orgId,
        filingId: data.filingId,
        lineType: "input",
        vatInputItemId: candidate.id,
        amount: candidate.baseAmount,
        vatAmount: candidate.vatAmount,
        frozenSnapshot,
        frozenSnapshotHash: hashVatSnapshot(frozenSnapshot),
      })
      .returning();
    lines.push(line);
  }

  const [lineTotal] = await conn
    .select({
      inputVatTotal: sql<string>`COALESCE(SUM(${vatFilingLines.vatAmount}), 0)::numeric(14,2)::text`,
    })
    .from(vatFilingLines)
    .where(
      and(
        eq(vatFilingLines.orgId, data.orgId),
        eq(vatFilingLines.filingId, data.filingId),
        eq(vatFilingLines.lineType, "input")
      )
    );
  const inputVatTotal = normalizeMoney(lineTotal?.inputVatTotal ?? "0");

  await conn
    .update(vatFilings)
    .set({ inputVatTotal, updatedAt: new Date() })
    .where(and(eq(vatFilings.id, data.filingId), eq(vatFilings.orgId, data.orgId)));

  await conn.insert(auditLog).values({
    orgId: data.orgId,
    entityType: "vat_filing",
    entityId: data.filingId,
    action: "update",
    actorId: data.actorId,
    newValue: {
      operation: "allocate_pp30_input",
      periodYear: filing.periodYear,
      periodMonth: filing.periodMonth,
      allocatedCount: lines.length,
      inputVatTotal,
      vatInputItemIds: lines.map((line) => line.vatInputItemId),
      truncated,
    },
  });

  return {
    filingId: data.filingId,
    allocatedCount: lines.length,
    inputVatTotal,
    truncated,
    lines,
  };
}

export async function allocatePp30CreditCarryforwardDraftLines(
  data: WithConnection & {
    orgId: string;
    filingId: string;
    actorId: string;
    limit?: number;
  }
): Promise<{
  filingId: string;
  allocatedCount: number;
  carryforwardIn: string;
  truncated: boolean;
  lines: Array<typeof vatFilingLines.$inferSelect>;
}> {
  if (!data.tx) {
    const { db } = await import("../index");
    return db.transaction((tx) =>
      allocatePp30CreditCarryforwardDraftLines({ ...data, tx: tx as DbConnection })
    );
  }

  const conn = data.tx;
  await conn.execute(sql`
    SELECT id
    FROM vat_filings
    WHERE id = ${data.filingId}
      AND org_id = ${data.orgId}
      AND deleted_at IS NULL
    FOR UPDATE
  `);

  const [filing] = await conn
    .select({
      filingType: vatFilings.filingType,
      establishmentId: vatFilings.establishmentId,
      periodYear: vatFilings.periodYear,
      periodMonth: vatFilings.periodMonth,
      status: vatFilings.status,
    })
    .from(vatFilings)
    .where(
      and(
        eq(vatFilings.id, data.filingId),
        eq(vatFilings.orgId, data.orgId),
        sql`${vatFilings.deletedAt} IS NULL`
      )
    )
    .limit(1);

  if (!filing) {
    throw new VatLedgerStateError("PP30 draft filing not found");
  }
  if (filing.filingType !== "pp30" || filing.status !== "draft") {
    throw new VatLedgerStateError("Credit carryforwards can only be allocated to a draft PP30 filing");
  }
  if (!filing.establishmentId) {
    throw new VatLedgerStateError("PP30 filing draft requires a VAT branch");
  }

  const filingPeriod = filing.periodYear * 12 + filing.periodMonth;
  const [existingCarryforwardLines] = await conn
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(vatFilingLines)
    .where(
      and(
        eq(vatFilingLines.orgId, data.orgId),
        eq(vatFilingLines.filingId, data.filingId),
        eq(vatFilingLines.lineType, "carryforward")
      )
    );
  if ((existingCarryforwardLines?.count ?? 0) > 0) {
    const pendingCandidates = await conn
      .select({ id: vatCreditCarryforwards.id })
      .from(vatCreditCarryforwards)
      .where(
        and(
          eq(vatCreditCarryforwards.orgId, data.orgId),
          eq(vatCreditCarryforwards.establishmentId, filing.establishmentId),
          eq(vatCreditCarryforwards.status, "available"),
          sql`${vatCreditCarryforwards.remainingAmount} > 0`,
          sql`(${vatCreditCarryforwards.creditOriginPeriodYear} * 12 + ${vatCreditCarryforwards.creditOriginPeriodMonth}) < ${filingPeriod}`
        )
      )
      .limit(1);
    if (pendingCandidates.length === 0) {
      const lines = await conn
        .select()
        .from(vatFilingLines)
        .where(
          and(
            eq(vatFilingLines.orgId, data.orgId),
            eq(vatFilingLines.filingId, data.filingId),
            eq(vatFilingLines.lineType, "carryforward")
          )
        )
        .orderBy(vatFilingLines.createdAt, vatFilingLines.id);
      const carryforwardIn = centsToMoney(
        lines.reduce((sum, line) => sum + moneyToCents(line.vatAmount), BigInt(0))
      );
      return {
        filingId: data.filingId,
        allocatedCount: lines.length,
        carryforwardIn,
        truncated: false,
        lines,
      };
    }
  }

  const allocationLimit = data.limit ?? 500;
  const [currentLineTotals] = await conn
    .select({
      outputVatTotal: sql<string>`
        COALESCE(SUM(CASE WHEN ${vatFilingLines.lineType} = 'output' THEN ${vatFilingLines.vatAmount} ELSE 0 END), 0)::numeric(14,2)::text
      `,
      inputVatTotal: sql<string>`
        COALESCE(SUM(CASE WHEN ${vatFilingLines.lineType} = 'input' THEN ${vatFilingLines.vatAmount} ELSE 0 END), 0)::numeric(14,2)::text
      `,
      pp36ReclaimTotal: sql<string>`
        COALESCE(SUM(CASE WHEN ${vatFilingLines.lineType} = 'pp36_reclaim' THEN ${vatFilingLines.vatAmount} ELSE 0 END), 0)::numeric(14,2)::text
      `,
      carryforwardIn: sql<string>`
        COALESCE(SUM(CASE WHEN ${vatFilingLines.lineType} = 'carryforward' THEN ${vatFilingLines.vatAmount} ELSE 0 END), 0)::numeric(14,2)::text
      `,
    })
    .from(vatFilingLines)
    .where(and(eq(vatFilingLines.orgId, data.orgId), eq(vatFilingLines.filingId, data.filingId)));
  let remainingNeedCents =
    moneyToCents(normalizeMoney(currentLineTotals?.outputVatTotal)) -
    moneyToCents(normalizeMoney(currentLineTotals?.inputVatTotal)) -
    moneyToCents(normalizeMoney(currentLineTotals?.pp36ReclaimTotal)) -
    moneyToCents(normalizeMoney(currentLineTotals?.carryforwardIn));
  if (remainingNeedCents <= BigInt(0)) {
    const lines = await conn
      .select()
      .from(vatFilingLines)
      .where(
        and(
          eq(vatFilingLines.orgId, data.orgId),
          eq(vatFilingLines.filingId, data.filingId),
          eq(vatFilingLines.lineType, "carryforward")
        )
      )
      .orderBy(vatFilingLines.createdAt, vatFilingLines.id);
    const carryforwardIn = centsToMoney(
      lines.reduce((sum, line) => sum + moneyToCents(line.vatAmount), BigInt(0))
    );
    await conn
      .update(vatFilings)
      .set({ carryforwardIn, updatedAt: new Date() })
      .where(and(eq(vatFilings.id, data.filingId), eq(vatFilings.orgId, data.orgId)));
    return {
      filingId: data.filingId,
      allocatedCount: lines.length,
      carryforwardIn,
      truncated: false,
      lines,
    };
  }

  const fetchedCandidates = await conn
    .select({
      id: vatCreditCarryforwards.id,
      sourcePp30FilingId: vatCreditCarryforwards.sourcePp30FilingId,
      sourcePp30FilingLineId: vatCreditCarryforwards.sourcePp30FilingLineId,
      creditOriginPeriodYear: vatCreditCarryforwards.creditOriginPeriodYear,
      creditOriginPeriodMonth: vatCreditCarryforwards.creditOriginPeriodMonth,
      amount: vatCreditCarryforwards.amount,
      remainingAmount: vatCreditCarryforwards.remainingAmount,
      createdAt: vatCreditCarryforwards.createdAt,
    })
    .from(vatCreditCarryforwards)
    .where(
      and(
        eq(vatCreditCarryforwards.orgId, data.orgId),
        eq(vatCreditCarryforwards.establishmentId, filing.establishmentId),
        eq(vatCreditCarryforwards.status, "available"),
        sql`${vatCreditCarryforwards.remainingAmount} > 0`,
        sql`(${vatCreditCarryforwards.creditOriginPeriodYear} * 12 + ${vatCreditCarryforwards.creditOriginPeriodMonth}) < ${filingPeriod}`
      )
    )
    .orderBy(
      vatCreditCarryforwards.creditOriginPeriodYear,
      vatCreditCarryforwards.creditOriginPeriodMonth,
      vatCreditCarryforwards.createdAt,
      vatCreditCarryforwards.id
    )
    .limit(allocationLimit + 1);
  const truncated = fetchedCandidates.length > allocationLimit;
  const candidates = fetchedCandidates.slice(0, allocationLimit);
  if (truncated) {
    throw new VatLedgerStateError(
      "PP30 credit carryforward allocation would exceed the allocation limit; use a larger limit or full draft builder"
    );
  }

  const lines: Array<typeof vatFilingLines.$inferSelect> = [];
  for (const candidate of candidates) {
    if (remainingNeedCents <= BigInt(0)) break;
    const candidateRemainingCents = moneyToCents(candidate.remainingAmount);
    const appliedAmountCents =
      candidateRemainingCents > remainingNeedCents ? remainingNeedCents : candidateRemainingCents;
    const appliedAmount = centsToMoney(appliedAmountCents);
    const newRemainingCents = candidateRemainingCents - appliedAmountCents;
    const newRemainingAmount = centsToMoney(newRemainingCents);
    const [updated] = await conn
      .update(vatCreditCarryforwards)
      .set({
        status: newRemainingCents === BigInt(0) ? "applied" : "available",
        remainingAmount: newRemainingAmount,
        appliedToPp30FilingId: newRemainingCents === BigInt(0) ? data.filingId : null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(vatCreditCarryforwards.id, candidate.id),
          eq(vatCreditCarryforwards.orgId, data.orgId),
          eq(vatCreditCarryforwards.status, "available"),
          sql`${vatCreditCarryforwards.remainingAmount} = ${candidate.remainingAmount}`
        )
      )
      .returning({ id: vatCreditCarryforwards.id });
    if (!updated) {
      continue;
    }

    const frozenSnapshot = {
      source: "pp30_credit_carryforward_allocation_v1",
      vatCreditCarryforwardId: candidate.id,
      sourcePp30FilingId: candidate.sourcePp30FilingId,
      sourcePp30FilingLineId: candidate.sourcePp30FilingLineId,
      creditOriginPeriodYear: candidate.creditOriginPeriodYear,
      creditOriginPeriodMonth: candidate.creditOriginPeriodMonth,
      originalCreditAmount: candidate.amount,
      appliedAmount,
      remainingAfterApplication: newRemainingAmount,
    };
    const [line] = await conn
      .insert(vatFilingLines)
      .values({
        orgId: data.orgId,
        filingId: data.filingId,
        lineType: "carryforward",
        amount: appliedAmount,
        vatAmount: appliedAmount,
        frozenSnapshot,
        frozenSnapshotHash: hashVatSnapshot(frozenSnapshot),
      })
      .returning();
    lines.push(line);
    remainingNeedCents -= appliedAmountCents;
  }

  const [lineTotal] = await conn
    .select({
      carryforwardIn: sql<string>`COALESCE(SUM(${vatFilingLines.vatAmount}), 0)::numeric(14,2)::text`,
    })
    .from(vatFilingLines)
    .where(
      and(
        eq(vatFilingLines.orgId, data.orgId),
        eq(vatFilingLines.filingId, data.filingId),
        eq(vatFilingLines.lineType, "carryforward")
      )
    );
  const carryforwardIn = normalizeMoney(lineTotal?.carryforwardIn ?? "0");

  await conn
    .update(vatFilings)
    .set({ carryforwardIn, updatedAt: new Date() })
    .where(and(eq(vatFilings.id, data.filingId), eq(vatFilings.orgId, data.orgId)));

  await conn.insert(auditLog).values({
    orgId: data.orgId,
    entityType: "vat_filing",
    entityId: data.filingId,
    action: "update",
    actorId: data.actorId,
    newValue: {
      operation: "allocate_pp30_credit_carryforward",
      periodYear: filing.periodYear,
      periodMonth: filing.periodMonth,
      allocatedCount: lines.length,
      carryforwardIn,
      vatCreditCarryforwardIds: lines.map((line) => {
        const snapshot = line.frozenSnapshot as VatSourceSnapshot;
        return snapshot.vatCreditCarryforwardId;
      }),
      truncated,
    },
  });

  return {
    filingId: data.filingId,
    allocatedCount: lines.length,
    carryforwardIn,
    truncated,
    lines,
  };
}

function normalizeMoney(value: string | null | undefined): string {
  return centsToMoney(moneyToCents(value ?? "0"));
}

function moneyToCents(value: string): bigint {
  const trimmed = value.trim();
  const sign = trimmed.startsWith("-") ? BigInt(-1) : BigInt(1);
  const unsigned = trimmed.replace(/^[+-]/, "");
  const [whole = "0", fractional = ""] = unsigned.split(".");
  const cents = `${fractional}00`.slice(0, 2);
  return sign * (BigInt(whole || "0") * BigInt(100) + BigInt(cents || "0"));
}

function centsToMoney(cents: bigint): string {
  const zero = BigInt(0);
  const hundred = BigInt(100);
  const sign = cents < zero ? "-" : "";
  const absolute = cents < zero ? -cents : cents;
  const whole = absolute / hundred;
  const fractional = String(absolute % hundred).padStart(2, "0");
  return `${sign}${whole}.${fractional}`;
}
