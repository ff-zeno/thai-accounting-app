import { and, eq, sql } from "drizzle-orm";
import { db } from "../index";
import {
  whtMonthlyFilings,
  whtCertificates,
  vendors,
} from "../schema";
import { orgScope } from "../helpers/org-scope";
import { auditMutation, isAuditActorId } from "../helpers/audit-log";
import {
  whtEfilingDeadline,
  formatBangkokDate,
} from "@/lib/tax/filing-deadlines";
import { getFilingDeadlineConfig } from "./tax-config";
import {
  isPeriodLocked as isCanonicalPeriodLocked,
  lockPeriod,
  type PeriodLockDomain,
} from "./period-locks";

type WhtFilingFormType = "pnd2" | "pnd3" | "pnd53" | "pnd54";
const WHT_FILING_FORM_TYPES: WhtFilingFormType[] = [
  "pnd2",
  "pnd3",
  "pnd53",
  "pnd54",
];

function whtDomain(formType: WhtFilingFormType): PeriodLockDomain {
  return `wht_${formType}` as PeriodLockDomain;
}

async function isWhtFilingLocked(
  orgId: string,
  formType: WhtFilingFormType,
  year: number,
  month: number
) {
  return (
    (await isCanonicalPeriodLocked(orgId, "wht", year, month)) ||
    (await isCanonicalPeriodLocked(orgId, whtDomain(formType), year, month))
  );
}

// ---------------------------------------------------------------------------
// Aggregate certificates into monthly filing totals
// ---------------------------------------------------------------------------

export async function aggregateMonthlyFiling(
  orgId: string,
  year: number,
  month: number,
  formType: WhtFilingFormType
): Promise<{
  totalBaseAmount: string;
  totalWhtAmount: string;
  certCount: number;
}> {
  // Only count non-voided certificates for the given period
  const result = await db
    .select({
      totalBaseAmount: sql<string>`COALESCE(SUM(${whtCertificates.totalBaseAmount}), 0)::numeric(14,2)::text`,
      totalWhtAmount: sql<string>`COALESCE(SUM(${whtCertificates.totalWht}), 0)::numeric(14,2)::text`,
      certCount: sql<number>`COUNT(*)::int`,
    })
    .from(whtCertificates)
    .innerJoin(
      vendors,
      and(
        eq(whtCertificates.payeeVendorId, vendors.id),
        eq(whtCertificates.orgId, vendors.orgId)
      )
    )
    .where(
      and(
        ...orgScope(whtCertificates, orgId),
        eq(whtCertificates.formType, formType),
        formType === "pnd53" ? domesticPayeeSql() : sql`true`,
        sql`${whtCertificates.status} != 'voided'`,
        sql`EXTRACT(YEAR FROM ${whtCertificates.paymentDate}::date) = ${year}`,
        sql`EXTRACT(MONTH FROM ${whtCertificates.paymentDate}::date) = ${month}`
      )
    );

  return result[0] ?? { totalBaseAmount: "0.00", totalWhtAmount: "0.00", certCount: 0 };
}

function domesticPayeeSql() {
  return sql`${vendors.entityType} != 'foreign'
    AND UPPER(BTRIM(COALESCE(${vendors.country}, 'TH'))) = 'TH'`;
}

export async function getMonthlyFilingSummaryByForm(
  orgId: string,
  year: number,
  month: number
): Promise<
  Array<{
    formType: WhtFilingFormType;
    totalBaseAmount: string;
    totalWhtAmount: string;
    certCount: number;
    filingId: string | null;
    status: "draft" | "filed" | "paid" | null;
    deadline: string | null;
    periodLocked: boolean;
  }>
> {
  const filings = await getFilingsByPeriod(orgId, year, month);
  const filingByForm = new Map(filings.map((filing) => [filing.formType, filing]));

  return Promise.all(
    WHT_FILING_FORM_TYPES.map(async (formType) => {
      const totals = await aggregateMonthlyFiling(orgId, year, month, formType);
      const filing = filingByForm.get(formType);
      return {
        formType,
        totalBaseAmount: totals.totalBaseAmount,
        totalWhtAmount: totals.totalWhtAmount,
        certCount: totals.certCount,
        filingId: filing?.id ?? null,
        status: filing?.status ?? null,
        deadline: filing?.deadline ?? null,
        periodLocked: filing?.periodLocked ?? false,
      };
    })
  );
}

// ---------------------------------------------------------------------------
// Upsert monthly filing record
// ---------------------------------------------------------------------------

export async function upsertMonthlyFiling(data: {
  orgId: string;
  periodYear: number;
  periodMonth: number;
  formType: WhtFilingFormType;
  totalBaseAmount: string;
  totalWhtAmount: string;
  deadline: string;
}): Promise<string> {
  if (
    await isWhtFilingLocked(
      data.orgId,
      data.formType,
      data.periodYear,
      data.periodMonth
    )
  ) {
    throw new Error(
      `Cannot refresh WHT filing — period ${data.periodMonth}/${data.periodYear} is locked`
    );
  }

  const [filing] = await db
    .insert(whtMonthlyFilings)
    .values({
      orgId: data.orgId,
      periodYear: data.periodYear,
      periodMonth: data.periodMonth,
      formType: data.formType,
      totalBaseAmount: data.totalBaseAmount,
      totalWhtAmount: data.totalWhtAmount,
      deadline: data.deadline,
      status: "draft",
      periodLocked: false,
    })
    .onConflictDoUpdate({
      target: [
        whtMonthlyFilings.orgId,
        whtMonthlyFilings.periodYear,
        whtMonthlyFilings.periodMonth,
        whtMonthlyFilings.formType,
      ],
      set: {
        totalBaseAmount: data.totalBaseAmount,
        totalWhtAmount: data.totalWhtAmount,
        deadline: data.deadline,
      },
    })
    .returning({ id: whtMonthlyFilings.id });

  return filing.id;
}

// ---------------------------------------------------------------------------
// Get filings for an org by period
// ---------------------------------------------------------------------------

export async function getFilingsByPeriod(
  orgId: string,
  year: number,
  month?: number
) {
  const conditions = [
    ...orgScope(whtMonthlyFilings, orgId),
    eq(whtMonthlyFilings.periodYear, year),
  ];

  if (month !== undefined) {
    conditions.push(eq(whtMonthlyFilings.periodMonth, month));
  }

  return db
    .select()
    .from(whtMonthlyFilings)
    .where(and(...conditions))
    .orderBy(
      whtMonthlyFilings.periodMonth,
      whtMonthlyFilings.formType
    );
}

// ---------------------------------------------------------------------------
// Get certificates grouped by vendor for a period/form type
// ---------------------------------------------------------------------------

export async function getCertificatesForFiling(
  orgId: string,
  year: number,
  month: number,
  formType: WhtFilingFormType
) {
  return db
    .select({
      id: whtCertificates.id,
      certificateNo: whtCertificates.certificateNo,
      paymentDate: whtCertificates.paymentDate,
      totalBaseAmount: whtCertificates.totalBaseAmount,
      totalWht: whtCertificates.totalWht,
      status: whtCertificates.status,
      vendorId: vendors.id,
      vendorName: vendors.name,
      vendorNameTh: vendors.nameTh,
      vendorTaxId: vendors.taxId,
    })
    .from(whtCertificates)
    .innerJoin(
      vendors,
      and(
        eq(whtCertificates.payeeVendorId, vendors.id),
        eq(whtCertificates.orgId, vendors.orgId)
      )
    )
    .where(
      and(
        ...orgScope(whtCertificates, orgId),
        eq(whtCertificates.formType, formType),
        formType === "pnd53" ? domesticPayeeSql() : sql`true`,
        sql`${whtCertificates.status} != 'voided'`,
        sql`EXTRACT(YEAR FROM ${whtCertificates.paymentDate}::date) = ${year}`,
        sql`EXTRACT(MONTH FROM ${whtCertificates.paymentDate}::date) = ${month}`
      )
    )
    .orderBy(vendors.name, whtCertificates.paymentDate);
}

// ---------------------------------------------------------------------------
// Mark filing as filed + lock period
// ---------------------------------------------------------------------------

export async function markFilingAsFiled(
  orgId: string,
  filingId: string,
  lockedByUserId = "system"
): Promise<void> {
  const today = formatBangkokDate(new Date());

  await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(whtMonthlyFilings)
      .set({
        status: "filed",
        periodLocked: true,
        filingDate: today,
      })
      .where(
        and(
          ...orgScope(whtMonthlyFilings, orgId),
          eq(whtMonthlyFilings.id, filingId)
        )
      )
      .returning();

    if (!updated) {
      throw new Error("Filing not found");
    }

    await lockPeriod({
      orgId,
      domain: whtDomain(updated.formType),
      periodYear: updated.periodYear,
      periodMonth: updated.periodMonth,
      lockedByUserId,
      lockReason: `${updated.formType}_filed`,
      entityType: "wht_monthly_filing",
      entityId: filingId,
      tx,
    });

    await auditMutation(
      {
        orgId,
        entityType: "wht_monthly_filing",
        entityId: filingId,
        action: "update",
        actorId: isAuditActorId(lockedByUserId) ? lockedByUserId : undefined,
        newValue: {
          status: "filed",
          periodLocked: true,
          filingDate: today,
          auditContext: {
            event: "filing_marked_filed",
            filingType: updated.formType,
            lockDomain: whtDomain(updated.formType),
            periodYear: updated.periodYear,
            periodMonth: updated.periodMonth,
            lockReason: `${updated.formType}_filed`,
            actorUserId: lockedByUserId,
          },
        },
      },
      tx
    );
  });
}

// ---------------------------------------------------------------------------
// Check if a period is locked
// ---------------------------------------------------------------------------

export async function isPeriodLocked(
  orgId: string,
  year: number,
  month: number
): Promise<boolean> {
  return isCanonicalPeriodLocked(orgId, "wht", year, month);
}

// ---------------------------------------------------------------------------
// Void a filing (unlock period)
// ---------------------------------------------------------------------------

export async function voidFiling(
  orgId: string,
  filingId: string
): Promise<void> {
  const existing = await db
    .select({
      periodYear: whtMonthlyFilings.periodYear,
      periodMonth: whtMonthlyFilings.periodMonth,
      formType: whtMonthlyFilings.formType,
    })
    .from(whtMonthlyFilings)
    .where(
      and(
        ...orgScope(whtMonthlyFilings, orgId),
        eq(whtMonthlyFilings.id, filingId)
      )
    )
    .limit(1);

  if (!existing[0]) {
    throw new Error("Filing not found");
  }

  if (
    (await isCanonicalPeriodLocked(
      orgId,
      "wht",
      existing[0].periodYear,
      existing[0].periodMonth
    )) ||
    (await isCanonicalPeriodLocked(
      orgId,
      whtDomain(existing[0].formType),
      existing[0].periodYear,
      existing[0].periodMonth
    ))
  ) {
    throw new Error("Cannot void a locked WHT filing directly; create an amendment workflow");
  }

  const [updated] = await db
    .update(whtMonthlyFilings)
    .set({
      status: "draft",
      periodLocked: false,
      filingDate: null,
    })
    .where(
      and(
        ...orgScope(whtMonthlyFilings, orgId),
        eq(whtMonthlyFilings.id, filingId)
      )
    )
    .returning();

  if (!updated) {
    throw new Error("Filing not found");
  }

  await auditMutation({
    orgId,
    entityType: "wht_monthly_filing",
    entityId: filingId,
    action: "void",
    newValue: { status: "draft", periodLocked: false },
  });
}

// ---------------------------------------------------------------------------
// Compute the filing deadline for a WHT period
// ---------------------------------------------------------------------------

export async function computeFilingDeadline(
  periodYear: number,
  periodMonth: number
): Promise<string> {
  const { deadline } = whtEfilingDeadline(
    periodYear,
    periodMonth,
    await getFilingDeadlineConfig()
  );
  return formatBangkokDate(deadline);
}
