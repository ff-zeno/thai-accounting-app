import { and, eq, sql } from "drizzle-orm";
import { db } from "../index";
import {
  vatRecords,
  documents,
  vendors,
  organizations,
} from "../schema";
import { orgScope } from "../helpers/org-scope";
import { auditMutation, isAuditActorId } from "../helpers/audit-log";
import { createOpenException } from "./exception-queue";
import {
  pp30EfilingDeadline,
  pp36Deadline,
  DEFAULT_TAX_CONFIG,
  formatBangkokDate,
} from "@/lib/tax/filing-deadlines";
import {
  isPeriodLocked as isCanonicalPeriodLocked,
  lockPeriod,
} from "./period-locks";

const THAI_VAT_RATE = "0.07";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class OutputVatPathDisabledError extends Error {
  constructor(orgId: string) {
    super(
      `PP30 document-derived output VAT is disabled for organization ${orgId} because POS/channel sales are enabled`
    );
    this.name = "OutputVatPathDisabledError";
  }
}

function foreignVendorNamePattern() {
  return sql`(
    lower(${vendors.name}) LIKE '%pte ltd%'
    OR lower(${vendors.name}) LIKE '%pte. ltd%'
    OR lower(${vendors.name}) LIKE '%gmbh%'
    OR lower(${vendors.name}) LIKE '% llc%'
    OR lower(${vendors.name}) LIKE '% inc%'
    OR lower(${vendors.name}) LIKE '% limited%'
    OR lower(${vendors.name}) LIKE '%ltd.%'
    OR lower(${vendors.name}) LIKE '%tiktok%'
    OR lower(${vendors.name}) LIKE '%meta platforms%'
    OR lower(${vendors.name}) LIKE '%google%'
    OR lower(${vendors.name}) LIKE '%amazon web services%'
    OR lower(${vendors.name}) LIKE '%aws%'
  )`;
}

async function assertDocumentOutputVatAllowed(orgId: string) {
  if (!UUID_PATTERN.test(orgId)) return;

  const [org] = await db
    .select({ hasPosSales: organizations.hasPosSales })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  if (!org?.hasPosSales) return;

  await auditMutation({
    orgId,
    entityType: "organization",
    entityId: orgId,
    action: "update",
    newValue: {
      auditContext: {
        event: "pp30_document_output_vat_blocked",
        reason: "organization_has_pos_sales",
      },
    },
  });

  throw new OutputVatPathDisabledError(orgId);
}

async function queueForeignVendorInputVatReviews(
  orgId: string,
  year: number,
  month: number
) {
  if (!UUID_PATTERN.test(orgId)) return;

  const candidates = await db
    .select({
      id: documents.id,
      vendorId: vendors.id,
      vendorName: vendors.name,
      vatAmount: documents.vatAmount,
    })
    .from(documents)
    .innerJoin(
      vendors,
      and(eq(documents.vendorId, vendors.id), eq(documents.orgId, vendors.orgId))
    )
    .where(
      and(
        ...orgScope(documents, orgId),
        eq(documents.direction, "expense"),
        eq(documents.status, "confirmed"),
        eq(documents.vatPeriodYear, year),
        eq(documents.vatPeriodMonth, month),
        sql`COALESCE(${documents.vatAmount}, 0) > 0`,
        sql`${vendors.entityType} != 'foreign'`,
        sql`COALESCE(${vendors.country}, 'TH') = 'TH'`,
        foreignVendorNamePattern()
      )
    );

  for (const doc of candidates) {
    await createOpenException({
      orgId,
      entityType: "document",
      entityId: doc.id,
      exceptionType: "vendor_country_review",
      severity: "p0",
      summary: `Possible foreign vendor input VAT blocked pending review: ${doc.vendorName}`,
      payload: {
        vendorId: doc.vendorId,
        vendorName: doc.vendorName,
        vatAmount: doc.vatAmount,
        periodYear: year,
        periodMonth: month,
      },
    });
  }
}

async function isVatPeriodLocked(orgId: string, year: number, month: number) {
  return (
    (await isCanonicalPeriodLocked(orgId, "vat", year, month)) ||
    (await isCanonicalPeriodLocked(orgId, "vat_pp30", year, month)) ||
    (await isCanonicalPeriodLocked(orgId, "vat_pp36", year, month))
  );
}

// ---------------------------------------------------------------------------
// Compute input/output VAT from confirmed documents for a period
// ---------------------------------------------------------------------------

export async function computeVatForPeriod(
  orgId: string,
  year: number,
  month: number
): Promise<{
  outputVat: string;
  inputVatPp30: string;
  pp36ReverseCharge: string;
  netVatPayable: string;
}> {
  await assertDocumentOutputVatAllowed(orgId);
  await queueForeignVendorInputVatReviews(orgId, year, month);

  // Output VAT: confirmed income documents with VAT in this period
  const outputResult = await db
    .select({
      total: sql<string>`COALESCE(SUM(${documents.vatAmount}), 0)::numeric(14,2)::text`,
    })
    .from(documents)
    .where(
      and(
        ...orgScope(documents, orgId),
        eq(documents.direction, "income"),
        eq(documents.status, "confirmed"),
        eq(documents.vatPeriodYear, year),
        eq(documents.vatPeriodMonth, month),
        sql`${documents.type} != 'credit_note'`
      )
    );

  // Output VAT credit note reductions
  const outputCreditNotes = await db
    .select({
      total: sql<string>`COALESCE(SUM(${documents.vatAmount}), 0)::numeric(14,2)::text`,
    })
    .from(documents)
    .where(
      and(
        ...orgScope(documents, orgId),
        eq(documents.direction, "income"),
        eq(documents.status, "confirmed"),
        eq(documents.type, "credit_note"),
        eq(documents.vatPeriodYear, year),
        eq(documents.vatPeriodMonth, month)
      )
    );

  // Input VAT (PP 30): confirmed expense documents with VAT from domestic VAT-registered vendors only
  const inputResult = await db
    .select({
      total: sql<string>`COALESCE(SUM(${documents.vatAmount}), 0)::numeric(14,2)::text`,
    })
    .from(documents)
    .innerJoin(
      vendors,
      and(eq(documents.vendorId, vendors.id), eq(documents.orgId, vendors.orgId))
    )
    .where(
      and(
        ...orgScope(documents, orgId),
        eq(documents.direction, "expense"),
        eq(documents.status, "confirmed"),
        eq(documents.vatPeriodYear, year),
        eq(documents.vatPeriodMonth, month),
        sql`${documents.taxInvoiceSubtype} IN ('full_ti', 'e_tax_invoice')`,
        eq(vendors.isVatRegistered, true),
        sql`${documents.type} != 'credit_note'`,
        // Domestic vendors only: not foreign entity type and country is TH
        sql`${vendors.entityType} != 'foreign'`,
        sql`COALESCE(${vendors.country}, 'TH') = 'TH'`,
        sql`NOT ${foreignVendorNamePattern()}`
      )
    );

  // Input VAT credit note reductions (domestic vendors only)
  const inputCreditNotes = await db
    .select({
      total: sql<string>`COALESCE(SUM(${documents.vatAmount}), 0)::numeric(14,2)::text`,
    })
    .from(documents)
    .innerJoin(
      vendors,
      and(eq(documents.vendorId, vendors.id), eq(documents.orgId, vendors.orgId))
    )
    .where(
      and(
        ...orgScope(documents, orgId),
        eq(documents.direction, "expense"),
        eq(documents.status, "confirmed"),
        eq(documents.type, "credit_note"),
        eq(documents.vatPeriodYear, year),
        eq(documents.vatPeriodMonth, month),
        sql`${documents.taxInvoiceSubtype} IN ('full_ti', 'e_tax_invoice')`,
        eq(vendors.isVatRegistered, true),
        sql`${vendors.entityType} != 'foreign'`,
        sql`COALESCE(${vendors.country}, 'TH') = 'TH'`,
        sql`NOT ${foreignVendorNamePattern()}`
      )
    );

  // PP 36 reverse charge: Thai VAT on foreign service/royalty/professional fee base.
  const pp36Result = await db
    .select({
      total: sql<string>`COALESCE(SUM(COALESCE(${documents.totalAmountThb}, ${documents.subtotal}, ${documents.totalAmount}) * ${THAI_VAT_RATE}::numeric), 0)::numeric(14,2)::text`,
    })
    .from(documents)
    .innerJoin(
      vendors,
      and(eq(documents.vendorId, vendors.id), eq(documents.orgId, vendors.orgId))
    )
    .where(
      and(
        ...orgScope(documents, orgId),
        eq(documents.direction, "expense"),
        eq(documents.status, "confirmed"),
        eq(documents.vatPeriodYear, year),
        eq(documents.vatPeriodMonth, month),
        sql`${documents.type} != 'credit_note'`,
        eq(documents.isPp36Subject, true),
        sql`(${vendors.entityType} = 'foreign' OR COALESCE(${vendors.country}, 'TH') != 'TH')`
      )
    );

  const outputVatRaw = parseFloat(outputResult[0]?.total ?? "0");
  const outputCreditNoteRaw = parseFloat(outputCreditNotes[0]?.total ?? "0");
  const inputVatRaw = parseFloat(inputResult[0]?.total ?? "0");
  const inputCreditNoteRaw = parseFloat(inputCreditNotes[0]?.total ?? "0");
  const pp36Raw = parseFloat(pp36Result[0]?.total ?? "0");

  const outputVat = outputVatRaw - outputCreditNoteRaw;
  const inputVatPp30 = inputVatRaw - inputCreditNoteRaw;

  // CRITICAL: net_vat_payable = output_vat - input_vat_pp30
  // PP 36 reverse charge is EXCLUDED from this calculation
  const netVatPayable = outputVat - inputVatPp30;

  return {
    outputVat: outputVat.toFixed(2),
    inputVatPp30: inputVatPp30.toFixed(2),
    pp36ReverseCharge: pp36Raw.toFixed(2),
    netVatPayable: netVatPayable.toFixed(2),
  };
}

// ---------------------------------------------------------------------------
// Get credit note adjustments for a period
// ---------------------------------------------------------------------------

export async function getCreditNoteAdjustments(
  orgId: string,
  year: number,
  month: number
): Promise<{
  outputVatReduction: string;
  inputVatReduction: string;
}> {
  const outputCn = await db
    .select({
      total: sql<string>`COALESCE(SUM(${documents.vatAmount}), 0)::numeric(14,2)::text`,
    })
    .from(documents)
    .where(
      and(
        ...orgScope(documents, orgId),
        eq(documents.direction, "income"),
        eq(documents.status, "confirmed"),
        eq(documents.type, "credit_note"),
        eq(documents.vatPeriodYear, year),
        eq(documents.vatPeriodMonth, month)
      )
    );

  const inputCn = await db
    .select({
      total: sql<string>`COALESCE(SUM(${documents.vatAmount}), 0)::numeric(14,2)::text`,
    })
    .from(documents)
    .where(
      and(
        ...orgScope(documents, orgId),
        eq(documents.direction, "expense"),
        eq(documents.status, "confirmed"),
        eq(documents.type, "credit_note"),
        eq(documents.vatPeriodYear, year),
        eq(documents.vatPeriodMonth, month)
      )
    );

  return {
    outputVatReduction: outputCn[0]?.total ?? "0.00",
    inputVatReduction: inputCn[0]?.total ?? "0.00",
  };
}

// ---------------------------------------------------------------------------
// Upsert VAT record for a period
// ---------------------------------------------------------------------------

export async function upsertVatRecord(data: {
  orgId: string;
  periodYear: number;
  periodMonth: number;
  outputVat: string;
  inputVatPp30: string;
  pp36ReverseCharge: string;
  netVatPayable: string;
  pp30Deadline: string;
  pp36Deadline: string;
  nilFilingRequired: boolean;
}): Promise<string> {
  if (
    await isVatPeriodLocked(data.orgId, data.periodYear, data.periodMonth)
  ) {
    throw new Error(
      `Cannot refresh VAT record — period ${data.periodMonth}/${data.periodYear} is locked`
    );
  }

  const [record] = await db
    .insert(vatRecords)
    .values({
      orgId: data.orgId,
      periodYear: data.periodYear,
      periodMonth: data.periodMonth,
      outputVat: data.outputVat,
      inputVatPp30: data.inputVatPp30,
      pp36ReverseCharge: data.pp36ReverseCharge,
      netVatPayable: data.netVatPayable,
      pp30Deadline: data.pp30Deadline,
      pp36Deadline: data.pp36Deadline,
      nilFilingRequired: data.nilFilingRequired,
      pp30Status: "draft",
      pp36Status: "draft",
      periodLocked: false,
    })
    .onConflictDoUpdate({
      target: [vatRecords.orgId, vatRecords.periodYear, vatRecords.periodMonth],
      set: {
        outputVat: data.outputVat,
        inputVatPp30: data.inputVatPp30,
        pp36ReverseCharge: data.pp36ReverseCharge,
        netVatPayable: data.netVatPayable,
        pp30Deadline: data.pp30Deadline,
        pp36Deadline: data.pp36Deadline,
        nilFilingRequired: data.nilFilingRequired,
      },
    })
    .returning({ id: vatRecords.id });

  return record.id;
}

// ---------------------------------------------------------------------------
// Get VAT records for an org
// ---------------------------------------------------------------------------

export async function getVatRecords(orgId: string, year?: number) {
  const conditions = [...orgScope(vatRecords, orgId)];

  if (year !== undefined) {
    conditions.push(eq(vatRecords.periodYear, year));
  }

  return db
    .select()
    .from(vatRecords)
    .where(and(...conditions))
    .orderBy(vatRecords.periodYear, vatRecords.periodMonth);
}

// ---------------------------------------------------------------------------
// Get a single VAT record for a period
// ---------------------------------------------------------------------------

export async function getVatRecordForPeriod(
  orgId: string,
  year: number,
  month: number
) {
  const results = await db
    .select()
    .from(vatRecords)
    .where(
      and(
        ...orgScope(vatRecords, orgId),
        eq(vatRecords.periodYear, year),
        eq(vatRecords.periodMonth, month)
      )
    )
    .limit(1);

  return results[0] ?? null;
}

// ---------------------------------------------------------------------------
// Mark PP 30 as filed (locks period)
// ---------------------------------------------------------------------------

export async function markPp30Filed(
  orgId: string,
  recordId: string,
  lockedByUserId = "system"
): Promise<void> {
  const today = formatBangkokDate(new Date());

  await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(vatRecords)
      .set({
        pp30Status: "filed",
        periodLocked: true,
      })
      .where(
        and(
          ...orgScope(vatRecords, orgId),
          eq(vatRecords.id, recordId)
        )
      )
      .returning();

    if (!updated) {
      throw new Error("VAT record not found");
    }

    await lockPeriod({
      orgId,
      domain: "vat_pp30",
      periodYear: updated.periodYear,
      periodMonth: updated.periodMonth,
      lockedByUserId,
      lockReason: "pp30_filed",
      entityType: "vat_record",
      entityId: recordId,
      tx,
    });

    await auditMutation(
      {
        orgId,
        entityType: "vat_record",
        entityId: recordId,
        action: "update",
        actorId: isAuditActorId(lockedByUserId) ? lockedByUserId : undefined,
        newValue: {
          pp30Status: "filed",
          periodLocked: true,
          filingDate: today,
          auditContext: {
            event: "filing_marked_filed",
            filingType: "pp30",
            lockDomain: "vat_pp30",
            periodYear: updated.periodYear,
            periodMonth: updated.periodMonth,
            lockReason: "pp30_filed",
            actorUserId: lockedByUserId,
          },
        },
      },
      tx
    );
  });
}

// ---------------------------------------------------------------------------
// Mark PP 36 as filed (independent from PP 30)
// ---------------------------------------------------------------------------

export async function markPp36Filed(
  orgId: string,
  recordId: string,
  lockedByUserId = "system"
): Promise<void> {
  const today = formatBangkokDate(new Date());

  await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(vatRecords)
      .set({
        pp36Status: "filed",
      })
      .where(
        and(
          ...orgScope(vatRecords, orgId),
          eq(vatRecords.id, recordId)
        )
      )
      .returning();

    if (!updated) {
      throw new Error("VAT record not found");
    }

    await lockPeriod({
      orgId,
      domain: "vat_pp36",
      periodYear: updated.periodYear,
      periodMonth: updated.periodMonth,
      lockedByUserId,
      lockReason: "pp36_filed",
      entityType: "vat_record",
      entityId: recordId,
      tx,
    });

    await auditMutation(
      {
        orgId,
        entityType: "vat_record",
        entityId: recordId,
        action: "update",
        actorId: isAuditActorId(lockedByUserId) ? lockedByUserId : undefined,
        newValue: {
          pp36Status: "filed",
          filingDate: today,
          auditContext: {
            event: "filing_marked_filed",
            filingType: "pp36",
            lockDomain: "vat_pp36",
            periodYear: updated.periodYear,
            periodMonth: updated.periodMonth,
            lockReason: "pp36_filed",
            actorUserId: lockedByUserId,
          },
        },
      },
      tx
    );
  });
}

// ---------------------------------------------------------------------------
// Check nil filing status
// ---------------------------------------------------------------------------

export async function checkNilFiling(
  orgId: string,
  year: number,
  month: number
): Promise<boolean> {
  const vat = await computeVatForPeriod(orgId, year, month);
  return (
    parseFloat(vat.outputVat) === 0 && parseFloat(vat.inputVatPp30) === 0
  );
}

// ---------------------------------------------------------------------------
// Compute filing deadlines
// ---------------------------------------------------------------------------

export function computePp30Deadline(
  periodYear: number,
  periodMonth: number
): string {
  const { deadline } = pp30EfilingDeadline(
    periodYear,
    periodMonth,
    DEFAULT_TAX_CONFIG
  );
  return formatBangkokDate(deadline);
}

export function computePp36Deadline(
  periodYear: number,
  periodMonth: number
): string {
  const { deadline } = pp36Deadline(
    periodYear,
    periodMonth,
    DEFAULT_TAX_CONFIG
  );
  return formatBangkokDate(deadline);
}

// ---------------------------------------------------------------------------
// Get PP 36 triggering documents (foreign vendor expenses)
// ---------------------------------------------------------------------------

export async function getPp36Documents(
  orgId: string,
  year: number,
  month: number
) {
  return db
    .select({
      id: documents.id,
      documentNumber: documents.documentNumber,
      issueDate: documents.issueDate,
      subtotal: documents.subtotal,
      vatAmount: documents.vatAmount,
      totalAmount: documents.totalAmount,
      pp36VatAmount: sql<string>`(COALESCE(${documents.totalAmountThb}, ${documents.subtotal}, ${documents.totalAmount}) * ${THAI_VAT_RATE}::numeric)::numeric(14,2)::text`,
      vendorName: vendors.name,
      vendorNameTh: vendors.nameTh,
      vendorTaxId: vendors.taxId,
      vendorCountry: vendors.country,
      vendorEntityType: vendors.entityType,
    })
    .from(documents)
    .innerJoin(
      vendors,
      and(eq(documents.vendorId, vendors.id), eq(documents.orgId, vendors.orgId))
    )
    .where(
      and(
        ...orgScope(documents, orgId),
        eq(documents.direction, "expense"),
        eq(documents.status, "confirmed"),
        eq(documents.vatPeriodYear, year),
        eq(documents.vatPeriodMonth, month),
        sql`${documents.type} != 'credit_note'`,
        eq(documents.isPp36Subject, true),
        sql`(${vendors.entityType} = 'foreign' OR COALESCE(${vendors.country}, 'TH') != 'TH')`
      )
    )
    .orderBy(documents.issueDate);
}
