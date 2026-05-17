import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { db, type DbConnection } from "@/lib/db";
import { establishments, salesTransactions } from "@/lib/db/schema";
import { orgScopeAlive } from "@/lib/db/helpers/org-scope";

export const SECTION_87_REPORT_SOURCES = [
  {
    title: "Revenue Code Sections 87-90",
    url: "https://www.rd.go.th/5209.html",
    retrievedAt: "2026-05-16",
    note: "Primary Thai source: VAT registrants keep output tax, input tax, and goods/raw-material reports by place of business.",
  },
  {
    title: "Revenue Code Sections 87-90 English translation",
    url: "https://www.rd.go.th/english/37747.html",
    retrievedAt: "2026-05-16",
    note: "English cross-check for Section 87 report obligations.",
  },
] as const;

export const SECTION_87_OUTPUT_TAX_REPORT_SOURCES = SECTION_87_REPORT_SOURCES;

export type OutputTaxReportRow = {
  saleId: string;
  taxDate: string;
  branchNumber: string;
  source: string;
  externalId: string;
  channel: string;
  taxInvoiceType: string | null;
  taxInvoiceNumber: string | null;
  taxBaseExVat: string;
  vatAmount: string;
  amountIncludingVat: string;
};

export type OutputTaxReportDailySummary = {
  taxDate: string;
  saleCount: number;
  taxBaseExVat: string;
  vatAmount: string;
  amountIncludingVat: string;
};

export type OutputTaxReport = {
  orgId: string;
  establishmentId: string;
  periodYear: number;
  periodMonth: number;
  rows: OutputTaxReportRow[];
  dailySummary: OutputTaxReportDailySummary[];
  totals: {
    saleCount: number;
    taxBaseExVat: string;
    vatAmount: string;
    amountIncludingVat: string;
  };
  sourceUrls: typeof SECTION_87_REPORT_SOURCES;
};

function periodStart(periodYear: number, periodMonth: number) {
  return `${periodYear}-${String(periodMonth).padStart(2, "0")}-01`;
}

function nextPeriodStart(periodYear: number, periodMonth: number) {
  const nextMonth = periodMonth === 12 ? 1 : periodMonth + 1;
  const nextYear = periodMonth === 12 ? periodYear + 1 : periodYear;
  return `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`;
}

export async function buildOutputTaxReport(
  data: {
    orgId: string;
    establishmentId: string;
    periodYear: number;
    periodMonth: number;
  },
  tx: DbConnection = db
): Promise<OutputTaxReport> {
  if (data.periodMonth < 1 || data.periodMonth > 12) {
    throw new Error("Output tax report periodMonth must be between 1 and 12");
  }

  const [establishment] = await tx
    .select({ id: establishments.id })
    .from(establishments)
    .where(
      and(
        ...orgScopeAlive(establishments, data.orgId),
        eq(establishments.id, data.establishmentId)
      )
    )
    .limit(1);
  if (!establishment) {
    throw new Error("Output tax report establishment not found");
  }

  const start = periodStart(data.periodYear, data.periodMonth);
  const end = nextPeriodStart(data.periodYear, data.periodMonth);
  const taxDateExpr = sql<string>`(${salesTransactions.soldAt} AT TIME ZONE 'Asia/Bangkok')::date::text`;

  const rows = await tx
    .select({
      saleId: salesTransactions.id,
      taxDate: taxDateExpr,
      branchNumber: establishments.branchNumber,
      source: salesTransactions.source,
      externalId: salesTransactions.externalId,
      channel: salesTransactions.channel,
      taxInvoiceType: salesTransactions.taxInvoiceType,
      taxInvoiceNumber: salesTransactions.taxInvoiceNumber,
      taxBaseExVat: salesTransactions.taxBaseExVat,
      vatAmount: salesTransactions.vatAmount,
      amountIncludingVat: salesTransactions.amountIncludingVat,
    })
    .from(salesTransactions)
    .innerJoin(
      establishments,
      and(
        eq(establishments.id, salesTransactions.establishmentId),
        eq(establishments.orgId, salesTransactions.orgId)
      )
    )
    .where(
      and(
        ...orgScopeAlive(salesTransactions, data.orgId),
        eq(salesTransactions.establishmentId, data.establishmentId),
        eq(salesTransactions.eventRole, "pos_primary"),
        isNull(salesTransactions.voidedAt),
        isNull(salesTransactions.supersededById),
        isNull(salesTransactions.creditNoteForId),
        sql`(${salesTransactions.soldAt} AT TIME ZONE 'Asia/Bangkok')::date >= ${start}::date`,
        sql`(${salesTransactions.soldAt} AT TIME ZONE 'Asia/Bangkok')::date < ${end}::date`
      )
    )
    .orderBy(asc(sql`(${salesTransactions.soldAt} AT TIME ZONE 'Asia/Bangkok')::date`), asc(salesTransactions.taxInvoiceNumber), asc(salesTransactions.id));

  const dailySummary = await tx
    .select({
      taxDate: taxDateExpr,
      saleCount: sql<number>`COUNT(*)::int`,
      taxBaseExVat: sql<string>`COALESCE(SUM(${salesTransactions.taxBaseExVat}), 0)::numeric(14,2)::text`,
      vatAmount: sql<string>`COALESCE(SUM(${salesTransactions.vatAmount}), 0)::numeric(14,2)::text`,
      amountIncludingVat: sql<string>`COALESCE(SUM(${salesTransactions.amountIncludingVat}), 0)::numeric(14,2)::text`,
    })
    .from(salesTransactions)
    .where(
      and(
        ...orgScopeAlive(salesTransactions, data.orgId),
        eq(salesTransactions.establishmentId, data.establishmentId),
        eq(salesTransactions.eventRole, "pos_primary"),
        isNull(salesTransactions.voidedAt),
        isNull(salesTransactions.supersededById),
        isNull(salesTransactions.creditNoteForId),
        sql`(${salesTransactions.soldAt} AT TIME ZONE 'Asia/Bangkok')::date >= ${start}::date`,
        sql`(${salesTransactions.soldAt} AT TIME ZONE 'Asia/Bangkok')::date < ${end}::date`
      )
    )
    .groupBy(sql`(${salesTransactions.soldAt} AT TIME ZONE 'Asia/Bangkok')::date`)
    .orderBy(asc(sql`(${salesTransactions.soldAt} AT TIME ZONE 'Asia/Bangkok')::date`));

  const [totals] = await tx
    .select({
      saleCount: sql<number>`COUNT(*)::int`,
      taxBaseExVat: sql<string>`COALESCE(SUM(${salesTransactions.taxBaseExVat}), 0)::numeric(14,2)::text`,
      vatAmount: sql<string>`COALESCE(SUM(${salesTransactions.vatAmount}), 0)::numeric(14,2)::text`,
      amountIncludingVat: sql<string>`COALESCE(SUM(${salesTransactions.amountIncludingVat}), 0)::numeric(14,2)::text`,
    })
    .from(salesTransactions)
    .where(
      and(
        ...orgScopeAlive(salesTransactions, data.orgId),
        eq(salesTransactions.establishmentId, data.establishmentId),
        eq(salesTransactions.eventRole, "pos_primary"),
        isNull(salesTransactions.voidedAt),
        isNull(salesTransactions.supersededById),
        isNull(salesTransactions.creditNoteForId),
        sql`(${salesTransactions.soldAt} AT TIME ZONE 'Asia/Bangkok')::date >= ${start}::date`,
        sql`(${salesTransactions.soldAt} AT TIME ZONE 'Asia/Bangkok')::date < ${end}::date`
      )
    );

  return {
    orgId: data.orgId,
    establishmentId: data.establishmentId,
    periodYear: data.periodYear,
    periodMonth: data.periodMonth,
    rows,
    dailySummary,
    totals: totals ?? {
      saleCount: 0,
      taxBaseExVat: "0.00",
      vatAmount: "0.00",
      amountIncludingVat: "0.00",
    },
    sourceUrls: SECTION_87_REPORT_SOURCES,
  };
}
