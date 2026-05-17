import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../index";
import {
  documents,
  whtMonthlyFilings,
  documentLineItems,
  exceptionQueue,
} from "../schema";
import { orgScope } from "../helpers/org-scope";
import {
  whtEfilingDeadline,
  DEFAULT_TAX_CONFIG,
  formatBangkokDate,
} from "@/lib/tax/filing-deadlines";
import { getVatLedgerPeriodDashboard } from "./vat-operations-ledger";
import { computeCashForecast, computeDso } from "@/lib/analytics/kpi-engine";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FilingDeadline {
  filingType: string;
  period: string;
  status: string;
  deadline: string;
  daysRemaining: number;
}

export interface DashboardMetrics {
  totalExpenses: string;
  totalIncome: string;
  prevMonthExpenses: string;
  prevMonthIncome: string;
  netVatPosition: string;
  outstandingFilings: number;
  analyticsSnapshot: DashboardAnalyticsSnapshot;
  upcomingDeadlines: FilingDeadline[];
  openExceptions: ReviewException[];
}

export interface DashboardAnalyticsSnapshot {
  asOfDate: string;
  arTotal: string;
  apTotal: string;
  projected30DayCash: string;
  runwayMonths: number | null;
  dsoDays: string;
  scheduledPayrollOutflows: string;
  scheduledDepreciationExpense: string;
}

export interface ReviewException {
  id: string;
  entityType: string;
  entityId: string;
  exceptionType: string;
  severity: string;
  summary: string;
  createdAt: Date;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getPreviousMonth(year: number, month: number): { year: number; month: number } {
  if (month === 1) return { year: year - 1, month: 12 };
  return { year, month: month - 1 };
}

function formatPeriod(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function todayBangkokDate(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function daysBetween(from: Date, to: Date): number {
  const msPerDay = 86400000;
  return Math.ceil((to.getTime() - from.getTime()) / msPerDay);
}

// ---------------------------------------------------------------------------
// Aggregate document totals for a given month
// ---------------------------------------------------------------------------

async function getMonthlyDocumentTotals(
  orgId: string,
  year: number,
  month: number,
  direction: "expense" | "income"
): Promise<string> {
  const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const endDate = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`;

  const [result] = await db
    .select({
      total: sql<string>`COALESCE(SUM(${documents.totalAmount}), 0)::numeric(14,2)::text`,
    })
    .from(documents)
    .where(
      and(
        ...orgScope(documents, orgId),
        eq(documents.direction, direction),
        eq(documents.status, "confirmed"),
        sql`${documents.issueDate} >= ${startDate}`,
        sql`${documents.issueDate} < ${endDate}`
      )
    );

  return result?.total ?? "0.00";
}

// ---------------------------------------------------------------------------
// Main dashboard query
// ---------------------------------------------------------------------------

export async function getDashboardMetrics(
  orgId: string,
  year: number,
  month: number
): Promise<DashboardMetrics> {
  const prev = getPreviousMonth(year, month);
  const asOfDate = todayBangkokDate();

  const [
    totalExpenses,
    totalIncome,
    prevMonthExpenses,
    prevMonthIncome,
    vatResult,
    outstandingResult,
    cashForecast,
    dso,
  ] = await Promise.all([
    getMonthlyDocumentTotals(orgId, year, month, "expense"),
    getMonthlyDocumentTotals(orgId, year, month, "income"),
    getMonthlyDocumentTotals(orgId, prev.year, prev.month, "expense"),
    getMonthlyDocumentTotals(orgId, prev.year, prev.month, "income"),
    getVatLedgerPeriodDashboard({
      orgId,
      periodYear: year,
      periodMonth: month,
    }),
    // Outstanding WHT filings count
    db
      .select({
        count: sql<number>`COUNT(*)::int`,
      })
      .from(whtMonthlyFilings)
      .where(
        and(
          ...orgScope(whtMonthlyFilings, orgId),
          sql`${whtMonthlyFilings.status} != 'filed'`
        )
      ),
    computeCashForecast({ orgId, asOfDate }),
    computeDso({ orgId, asOfDate }),
  ]);

  const netVatPosition = vatResult.pp30.signedNetPosition;
  const outstandingFilings = outstandingResult[0]?.count ?? 0;

  // Build upcoming deadlines from WHT filings and VAT ledger state.
  const upcomingDeadlines = await getUpcomingDeadlines(orgId, year, month);
  const openExceptions = await getOpenExceptions(orgId);

  return {
    totalExpenses,
    totalIncome,
    prevMonthExpenses,
    prevMonthIncome,
    netVatPosition,
    outstandingFilings,
    analyticsSnapshot: {
      asOfDate,
      arTotal: cashForecast.arTotal,
      apTotal: cashForecast.apTotal,
      projected30DayCash: cashForecast.projected30DayCash,
      runwayMonths: cashForecast.runwayMonths,
      dsoDays: dso.averageDays,
      scheduledPayrollOutflows: cashForecast.scheduledPayrollOutflows,
      scheduledDepreciationExpense: cashForecast.scheduledDepreciationExpense,
    },
    upcomingDeadlines,
    openExceptions,
  };
}

async function getOpenExceptions(orgId: string): Promise<ReviewException[]> {
  return db
    .select({
      id: exceptionQueue.id,
      entityType: exceptionQueue.entityType,
      entityId: exceptionQueue.entityId,
      exceptionType: exceptionQueue.exceptionType,
      severity: exceptionQueue.severity,
      summary: exceptionQueue.summary,
      createdAt: exceptionQueue.createdAt,
    })
    .from(exceptionQueue)
    .where(
      and(
        eq(exceptionQueue.orgId, orgId),
        sql`${exceptionQueue.resolvedAt} IS NULL`
      )
    )
    .orderBy(
      sql`CASE ${exceptionQueue.severity}
        WHEN 'p0' THEN 0
        WHEN 'p1' THEN 1
        WHEN 'p2' THEN 2
        ELSE 3
      END`,
      desc(exceptionQueue.createdAt)
    )
    .limit(8);
}

// ---------------------------------------------------------------------------
// Upcoming deadlines
// ---------------------------------------------------------------------------

async function getUpcomingDeadlines(
  orgId: string,
  year: number,
  month: number
): Promise<FilingDeadline[]> {
  const today = new Date();
  const deadlines: FilingDeadline[] = [];

  // Check WHT filings for current and previous 2 months
  const periodsToCheck = [
    getPreviousMonth(year, month),
    { year, month },
  ];

  // WHT filings
  for (const period of periodsToCheck) {
    const filings = await db
      .select({
        formType: whtMonthlyFilings.formType,
        status: whtMonthlyFilings.status,
        deadline: whtMonthlyFilings.deadline,
      })
      .from(whtMonthlyFilings)
      .where(
        and(
          ...orgScope(whtMonthlyFilings, orgId),
          eq(whtMonthlyFilings.periodYear, period.year),
          eq(whtMonthlyFilings.periodMonth, period.month)
        )
      );

    for (const filing of filings) {
      const deadlineDate = filing.deadline
        ? new Date(filing.deadline)
        : whtEfilingDeadline(period.year, period.month, DEFAULT_TAX_CONFIG).deadline;

      deadlines.push({
        filingType: filing.formType.toUpperCase(),
        period: formatPeriod(period.year, period.month),
        status: filing.status,
        deadline: filing.deadline ?? formatBangkokDate(deadlineDate),
        daysRemaining: daysBetween(today, deadlineDate),
      });
    }
  }

  // VAT PP 30 and PP 36 deadlines from the operations ledger
  for (const period of periodsToCheck) {
    const vat = await getVatLedgerPeriodDashboard({
      orgId,
      periodYear: period.year,
      periodMonth: period.month,
    });
    const pp30DeadlineDate = new Date(vat.pp30.deadline);

    deadlines.push({
      filingType: "PP 30",
      period: formatPeriod(period.year, period.month),
      status: vat.pp30.status,
      deadline: vat.pp30.deadline,
      daysRemaining: daysBetween(today, pp30DeadlineDate),
    });

    const hasPp36 =
      parseFloat(vat.pp36.pp36VatTotal) > 0 || vat.pp36.status === "filed";
    if (hasPp36) {
      const pp36DeadlineDate = new Date(vat.pp36.deadline);

      deadlines.push({
        filingType: "PP 36",
        period: formatPeriod(period.year, period.month),
        status: vat.pp36.status,
        deadline: vat.pp36.deadline,
        daysRemaining: daysBetween(today, pp36DeadlineDate),
      });
    }
  }

  // Sort by deadline ascending
  deadlines.sort((a, b) => a.deadline.localeCompare(b.deadline));

  return deadlines;
}

// ---------------------------------------------------------------------------
// Expense/Income summary grouped query
// ---------------------------------------------------------------------------

export interface SummaryRow {
  groupKey: string;
  groupLabel: string;
  documentCount: number;
  totalPreVat: string;
  totalVat: string;
  totalWht: string;
  netPaid: string;
}

export async function getDocumentSummary(
  orgId: string,
  direction: "expense" | "income",
  groupBy: "month" | "vendor" | "payment_type",
  filters?: {
    dateFrom?: string;
    dateTo?: string;
    vendorId?: string;
  }
): Promise<SummaryRow[]> {
  const conditions = [
    ...orgScope(documents, orgId),
    eq(documents.direction, direction),
    eq(documents.status, "confirmed"),
  ];

  if (filters?.dateFrom) {
    conditions.push(sql`${documents.issueDate} >= ${filters.dateFrom}`);
  }
  if (filters?.dateTo) {
    conditions.push(sql`${documents.issueDate} <= ${filters.dateTo}`);
  }
  if (filters?.vendorId) {
    conditions.push(eq(documents.vendorId, filters.vendorId));
  }

  // WHT withheld subquery per document
  const whtSubquery = sql<string>`COALESCE((
    SELECT SUM(${documentLineItems.whtAmount})
    FROM ${documentLineItems}
    WHERE ${documentLineItems.documentId} = ${documents.id}
      AND ${documentLineItems.deletedAt} IS NULL
  ), 0)`;

  let groupExpression: ReturnType<typeof sql>;
  let labelExpression: ReturnType<typeof sql>;

  switch (groupBy) {
    case "month":
      groupExpression = sql`to_char(${documents.issueDate}::date, 'YYYY-MM')`;
      labelExpression = sql`to_char(${documents.issueDate}::date, 'YYYY-MM')`;
      break;
    case "vendor":
      groupExpression = sql`COALESCE(${documents.vendorId}::text, 'unassigned')`;
      labelExpression = sql`COALESCE(${documents.vendorId}::text, 'unassigned')`;
      break;
    case "payment_type":
      groupExpression = sql`COALESCE(${documents.category}, 'uncategorized')`;
      labelExpression = sql`COALESCE(${documents.category}, 'uncategorized')`;
      break;
  }

  const rows = await db
    .select({
      groupKey: groupExpression.as("group_key"),
      groupLabel: labelExpression.as("group_label"),
      documentCount: sql<number>`COUNT(*)::int`.as("document_count"),
      totalPreVat: sql<string>`COALESCE(SUM(${documents.subtotal}), 0)::numeric(14,2)::text`.as("total_pre_vat"),
      totalVat: sql<string>`COALESCE(SUM(${documents.vatAmount}), 0)::numeric(14,2)::text`.as("total_vat"),
      totalWht: sql<string>`COALESCE(SUM(${whtSubquery}), 0)::numeric(14,2)::text`.as("total_wht"),
      netPaid: sql<string>`COALESCE(SUM(${documents.totalAmount}), 0)::numeric(14,2)::text`.as("net_paid"),
    })
    .from(documents)
    .where(and(...conditions))
    .groupBy(groupExpression)
    .orderBy(groupExpression);

  return rows as SummaryRow[];
}

// ---------------------------------------------------------------------------
// Vendor name resolution for summary view
// ---------------------------------------------------------------------------

export async function getVendorNamesForSummary(
  orgId: string,
  vendorIds: string[]
): Promise<Record<string, string>> {
  const validVendorIds = vendorIds.filter((id) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
  );
  if (validVendorIds.length === 0) return {};

  const { vendors } = await import("../schema");
  const { inArray } = await import("drizzle-orm");

  const rows = await db
    .select({
      id: vendors.id,
      name: vendors.name,
      displayAlias: vendors.displayAlias,
    })
    .from(vendors)
    .where(
      and(
        ...orgScope(vendors, orgId),
        inArray(vendors.id, validVendorIds)
      )
    );

  const map: Record<string, string> = {};
  for (const row of rows) {
    map[row.id] = row.displayAlias ?? row.name;
  }
  return map;
}
