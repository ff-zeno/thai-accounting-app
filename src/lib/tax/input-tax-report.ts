import { and, asc, eq, isNotNull, sql } from "drizzle-orm";
import { db, type DbConnection } from "@/lib/db";
import { vatInputItems, vendors } from "@/lib/db/schema";
import { SECTION_87_REPORT_SOURCES } from "./output-tax-report";

export type InputTaxReportRow = {
  inputItemId: string;
  taxInvoiceDate: string;
  taxInvoiceNo: string;
  vendorName: string;
  vendorTaxId: string;
  taxInvoiceSubtype: string;
  status: string;
  baseAmount: string;
  vatAmount: string;
};

export type InputTaxReportDailySummary = {
  taxInvoiceDate: string;
  rowCount: number;
  baseAmount: string;
  vatAmount: string;
};

export type InputTaxReport = {
  orgId: string;
  periodYear: number;
  periodMonth: number;
  rows: InputTaxReportRow[];
  dailySummary: InputTaxReportDailySummary[];
  totals: {
    rowCount: number;
    baseAmount: string;
    vatAmount: string;
  };
  sourceUrls: typeof SECTION_87_REPORT_SOURCES;
};

export async function buildInputTaxReport(
  data: {
    orgId: string;
    periodYear: number;
    periodMonth: number;
  },
  tx: DbConnection = db
): Promise<InputTaxReport> {
  if (data.periodMonth < 1 || data.periodMonth > 12) {
    throw new Error("Input tax report periodMonth must be between 1 and 12");
  }

  const statusFilter = sql`${vatInputItems.status} IN ('claimable', 'allocated_to_draft', 'filed')`;
  const baseWhere = and(
    eq(vatInputItems.orgId, data.orgId),
    eq(vatInputItems.eligiblePeriodYear, data.periodYear),
    eq(vatInputItems.eligiblePeriodMonth, data.periodMonth),
    sql`${vatInputItems.deletedAt} IS NULL`,
    isNotNull(vatInputItems.taxInvoiceDate),
    isNotNull(vatInputItems.taxInvoiceNo),
    statusFilter
  );

  const rows = await tx
    .select({
      inputItemId: vatInputItems.id,
      taxInvoiceDate: vatInputItems.taxInvoiceDate,
      taxInvoiceNo: vatInputItems.taxInvoiceNo,
      vendorName: vendors.name,
      vendorTaxId: vendors.taxId,
      taxInvoiceSubtype: vatInputItems.taxInvoiceSubtype,
      status: vatInputItems.status,
      baseAmount: vatInputItems.baseAmount,
      vatAmount: vatInputItems.vatAmount,
    })
    .from(vatInputItems)
    .leftJoin(
      vendors,
      and(eq(vendors.id, vatInputItems.vendorId), eq(vendors.orgId, vatInputItems.orgId))
    )
    .where(baseWhere)
    .orderBy(asc(vatInputItems.taxInvoiceDate), asc(vatInputItems.taxInvoiceNo), asc(vatInputItems.id));

  const dailySummary = await tx
    .select({
      taxInvoiceDate: sql<string>`${vatInputItems.taxInvoiceDate}::text`,
      rowCount: sql<number>`COUNT(*)::int`,
      baseAmount: sql<string>`COALESCE(SUM(${vatInputItems.baseAmount}), 0)::numeric(14,2)::text`,
      vatAmount: sql<string>`COALESCE(SUM(${vatInputItems.vatAmount}), 0)::numeric(14,2)::text`,
    })
    .from(vatInputItems)
    .where(baseWhere)
    .groupBy(vatInputItems.taxInvoiceDate)
    .orderBy(asc(vatInputItems.taxInvoiceDate));

  const [totals] = await tx
    .select({
      rowCount: sql<number>`COUNT(*)::int`,
      baseAmount: sql<string>`COALESCE(SUM(${vatInputItems.baseAmount}), 0)::numeric(14,2)::text`,
      vatAmount: sql<string>`COALESCE(SUM(${vatInputItems.vatAmount}), 0)::numeric(14,2)::text`,
    })
    .from(vatInputItems)
    .where(baseWhere);

  return {
    orgId: data.orgId,
    periodYear: data.periodYear,
    periodMonth: data.periodMonth,
    rows: rows.map((row) => ({
      inputItemId: row.inputItemId,
      taxInvoiceDate: row.taxInvoiceDate ?? "",
      taxInvoiceNo: row.taxInvoiceNo ?? "",
      vendorName: row.vendorName ?? "",
      vendorTaxId: row.vendorTaxId ?? "",
      taxInvoiceSubtype: row.taxInvoiceSubtype,
      status: row.status,
      baseAmount: row.baseAmount,
      vatAmount: row.vatAmount,
    })),
    dailySummary,
    totals: totals ?? {
      rowCount: 0,
      baseAmount: "0.00",
      vatAmount: "0.00",
    },
    sourceUrls: SECTION_87_REPORT_SOURCES,
  };
}
