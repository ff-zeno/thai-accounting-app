import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db/index";
import {
  bankAccounts,
  depreciationSchedule,
  documents,
  fixedAssets,
  inventoryMovements,
  payRuns,
  paySlips,
  payments,
  skus,
  vendors,
} from "@/lib/db/schema";
import { fromSatang, toSatangOrZero } from "@/lib/utils/money";
import { buildAgingSnapshot, summarizeAging } from "./aging";

/** Convert a THB number (e.g. from summarizeAging) to integer satang. */
function thbToSatang(value: number): number {
  return Math.round(value * 100);
}

export async function computeCounterpartyConcentration(data: {
  orgId: string;
  periodStart: string;
  periodEnd: string;
  direction: "income" | "expense";
  limit?: number;
}) {
  const filters = and(
    eq(documents.orgId, data.orgId),
    isNull(documents.deletedAt),
    eq(documents.direction, data.direction),
    sql`${documents.status} IN ('confirmed', 'partially_paid', 'paid')`,
    sql`COALESCE(${documents.issueDate}, ${data.periodStart}::date) >= ${data.periodStart}::date`,
    sql`COALESCE(${documents.issueDate}, ${data.periodStart}::date) <= ${data.periodEnd}::date`
  );
  const totalAmount = sql`COALESCE(SUM(COALESCE(${documents.totalAmountThb}, ${documents.totalAmount}, 0)), 0)`;
  const [totalRow] = await db
    .select({
      total: sql<string>`${totalAmount}::numeric(14,2)`,
    })
    .from(documents)
    .where(filters);
  const grandTotalSatang = toSatangOrZero(totalRow?.total);

  const rows = await db
    .select({
      counterpartyId: vendors.id,
      counterpartyName: sql<string>`COALESCE(${vendors.name}, ${vendors.nameTh}, 'Unassigned')`,
      amount: sql<string>`COALESCE(SUM(COALESCE(${documents.totalAmountThb}, ${documents.totalAmount}, 0)), 0)::numeric(14,2)`,
    })
    .from(documents)
    .leftJoin(vendors, eq(vendors.id, documents.vendorId))
    .where(filters)
    .groupBy(vendors.id, vendors.name, vendors.nameTh)
    .orderBy(desc(sql`COALESCE(SUM(COALESCE(${documents.totalAmountThb}, ${documents.totalAmount}, 0)), 0)`))
    .limit(data.limit ?? 10);

  return rows.map((row) => ({
    ...row,
    // Ratio, not money — satang/satang cancels the scale.
    sharePct:
      grandTotalSatang === 0
        ? "0.0000"
        : (toSatangOrZero(row.amount) / grandTotalSatang).toFixed(4),
  }));
}

export async function computeDso(data: {
  orgId: string;
  asOfDate: string;
  lookbackDays?: number;
}) {
  const lookbackDays = data.lookbackDays ?? 90;
  const [row] = await db
    .select({
      paymentCount: sql<number>`COUNT(${payments.id})::int`,
      paidDocumentCount: sql<number>`COUNT(DISTINCT ${documents.id})::int`,
      averageDays: sql<string>`COALESCE(AVG(${payments.paymentDate} - ${documents.issueDate}), 0)::numeric(14,2)`,
    })
    .from(payments)
    .innerJoin(
      documents,
      and(
        eq(documents.id, payments.documentId),
        eq(documents.orgId, payments.orgId)
      )
    )
    .where(
      and(
        eq(payments.orgId, data.orgId),
        isNull(payments.deletedAt),
        isNull(documents.deletedAt),
        eq(documents.direction, "income"),
        sql`${documents.issueDate} IS NOT NULL`,
        sql`${payments.paymentDate} <= ${data.asOfDate}::date`,
        sql`${payments.paymentDate} >= (${data.asOfDate}::date - (${lookbackDays}::int * INTERVAL '1 day'))`
      )
    );

  return {
    asOfDate: data.asOfDate,
    lookbackDays,
    paymentCount: row?.paymentCount ?? 0,
    paidDocumentCount: row?.paidDocumentCount ?? 0,
    // Days, not money — plain 2dp formatting.
    averageDays: Number(row?.averageDays ?? 0).toFixed(2),
  };
}

export async function computeGrossMarginByCategory(data: {
  orgId: string;
  periodStart: string;
  periodEnd: string;
}) {
  const [revenueRows, cogsRows] = await Promise.all([
    db
      .select({
        category: sql<string>`COALESCE(${documents.category}, 'Uncategorized')`,
        revenue: sql<string>`COALESCE(SUM(COALESCE(${documents.totalAmountThb}, ${documents.totalAmount}, 0)), 0)::numeric(14,2)`,
      })
      .from(documents)
      .where(
        and(
          eq(documents.orgId, data.orgId),
          isNull(documents.deletedAt),
          eq(documents.direction, "income"),
          sql`${documents.status} IN ('confirmed', 'partially_paid', 'paid')`,
          sql`COALESCE(${documents.issueDate}, ${data.periodStart}::date) >= ${data.periodStart}::date`,
          sql`COALESCE(${documents.issueDate}, ${data.periodStart}::date) <= ${data.periodEnd}::date`
        )
      )
      .groupBy(sql`COALESCE(${documents.category}, 'Uncategorized')`),
    db
      .select({
        category: sql<string>`COALESCE(${skus.category}, 'Uncategorized')`,
        cogs: sql<string>`COALESCE(SUM(${inventoryMovements.totalCost}), 0)::numeric(14,2)`,
      })
      .from(inventoryMovements)
      .innerJoin(
        skus,
        and(eq(skus.id, inventoryMovements.skuId), eq(skus.orgId, inventoryMovements.orgId))
      )
      .where(
        and(
          eq(inventoryMovements.orgId, data.orgId),
          isNull(inventoryMovements.deletedAt),
          isNull(skus.deletedAt),
          eq(inventoryMovements.movementType, "sale_out"),
          sql`${inventoryMovements.movementAt}::date >= ${data.periodStart}::date`,
          sql`${inventoryMovements.movementAt}::date <= ${data.periodEnd}::date`
        )
      )
      .groupBy(sql`COALESCE(${skus.category}, 'Uncategorized')`),
  ]);

  // Values are integer satang.
  const byCategory = new Map<
    string,
    { category: string; revenue: number; cogs: number }
  >();
  for (const row of revenueRows) {
    byCategory.set(row.category, {
      category: row.category,
      revenue: toSatangOrZero(row.revenue),
      cogs: 0,
    });
  }
  for (const row of cogsRows) {
    const existing =
      byCategory.get(row.category) ?? { category: row.category, revenue: 0, cogs: 0 };
    existing.cogs += toSatangOrZero(row.cogs);
    byCategory.set(row.category, existing);
  }

  return Array.from(byCategory.values())
    .map((row) => {
      const grossMargin = row.revenue - row.cogs;
      return {
        category: row.category,
        revenue: fromSatang(row.revenue),
        cogs: fromSatang(row.cogs),
        grossMargin: fromSatang(grossMargin),
        grossMarginPct:
          row.revenue === 0 ? null : (grossMargin / row.revenue).toFixed(4),
      };
    })
    .sort((a, b) => {
      const revenueDelta = Number(b.revenue) - Number(a.revenue);
      if (revenueDelta !== 0) return revenueDelta;
      return a.category.localeCompare(b.category);
    });
}

export async function computeCashForecast(data: {
  orgId: string;
  asOfDate: string;
}) {
  const horizon = new Date(`${data.asOfDate}T00:00:00Z`);
  horizon.setUTCDate(horizon.getUTCDate() + 30);
  const horizonIso = horizon.toISOString().slice(0, 10);
  const [cash] = await db
    .select({
      cashBalance: sql<string>`COALESCE(SUM(${bankAccounts.currentBalance}), 0)::numeric(14,2)`,
    })
    .from(bankAccounts)
    .where(
      and(
        eq(bankAccounts.orgId, data.orgId),
        isNull(bankAccounts.deletedAt),
        eq(bankAccounts.currency, "THB")
      )
    );

  const [arRows, apRows] = await Promise.all([
    buildAgingSnapshot(data.orgId, data.asOfDate, "ar"),
    buildAgingSnapshot(data.orgId, data.asOfDate, "ap"),
  ]);
  const ar = summarizeAging(arRows);
  const ap = summarizeAging(apRows);
  const expected30DayInflowsSatang =
    thbToSatang(ar.current) + thbToSatang(ar.days1To30);
  const [payrollForecast] = await db
    .select({
      netPay: sql<string>`COALESCE(SUM(${paySlips.netPay}), 0)::numeric(14,2)`,
    })
    .from(payRuns)
    .leftJoin(
      paySlips,
      and(eq(paySlips.payRunId, payRuns.id), eq(paySlips.orgId, payRuns.orgId))
    )
    .where(
      and(
        eq(payRuns.orgId, data.orgId),
        sql`${payRuns.status} IN ('draft', 'approved')`,
        sql`${payRuns.payDate} > ${data.asOfDate}::date`,
        sql`${payRuns.payDate} <= ${horizonIso}::date`
      )
    );
  const asOfPeriod = new Date(`${data.asOfDate}T00:00:00Z`);
  const horizonPeriod = new Date(`${horizonIso}T00:00:00Z`);
  const [depreciationForecast] = await db
    .select({
      depreciation: sql<string>`COALESCE(SUM(${depreciationSchedule.depreciationAmount}), 0)::numeric(14,2)`,
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
        eq(depreciationSchedule.orgId, data.orgId),
        sql`${fixedAssets.deletedAt} IS NULL`,
        sql`make_date(${depreciationSchedule.periodYear}, ${depreciationSchedule.periodMonth}, 1) >= date_trunc('month', ${asOfPeriod.toISOString()}::timestamptz)::date`,
        sql`make_date(${depreciationSchedule.periodYear}, ${depreciationSchedule.periodMonth}, 1) <= date_trunc('month', ${horizonPeriod.toISOString()}::timestamptz)::date`,
        sql`(${fixedAssets.disposedAt} IS NULL OR make_date(${depreciationSchedule.periodYear}, ${depreciationSchedule.periodMonth}, 1) <= date_trunc('month', ${fixedAssets.disposedAt})::date)`
      )
    );
  const scheduledPayrollOutflowsSatang = toSatangOrZero(payrollForecast?.netPay);
  const scheduledDepreciationExpenseSatang = toSatangOrZero(
    depreciationForecast?.depreciation
  );
  const expected30DayOutflowsSatang =
    thbToSatang(ap.current) +
    thbToSatang(ap.days1To30) +
    scheduledPayrollOutflowsSatang;
  const projected30DayCashSatang =
    toSatangOrZero(cash?.cashBalance) +
    expected30DayInflowsSatang -
    expected30DayOutflowsSatang;

  const periodStart = new Date(`${data.asOfDate}T00:00:00Z`);
  periodStart.setUTCDate(periodStart.getUTCDate() - 90);
  const periodStartIso = periodStart.toISOString().slice(0, 10);
  const [burn] = await db
    .select({
      income: sql<string>`COALESCE(SUM(COALESCE(${documents.totalAmountThb}, ${documents.totalAmount}, 0)) FILTER (WHERE ${documents.direction} = 'income'), 0)::numeric(14,2)`,
      expenses: sql<string>`COALESCE(SUM(COALESCE(${documents.totalAmountThb}, ${documents.totalAmount}, 0)) FILTER (WHERE ${documents.direction} = 'expense'), 0)::numeric(14,2)`,
    })
    .from(documents)
    .where(
      and(
        eq(documents.orgId, data.orgId),
        isNull(documents.deletedAt),
        eq(documents.status, "confirmed"),
        sql`COALESCE(${documents.issueDate}, ${periodStartIso}::date) >= ${periodStartIso}::date`,
        sql`COALESCE(${documents.issueDate}, ${periodStartIso}::date) <= ${data.asOfDate}::date`
      )
    );

  // Keep the unrounded burn (in satang) for the runway ratio; round only for
  // the canonical money string. x/3 for integer x can never land exactly on
  // .5 satang, so Math.round matches the previous toFixed(2) semantics.
  const netMonthlyBurnSatangExact = Math.max(
    0,
    (toSatangOrZero(burn?.expenses) - toSatangOrZero(burn?.income)) / 3
  );
  const runwayMonths =
    netMonthlyBurnSatangExact === 0
      ? null
      : Number((projected30DayCashSatang / netMonthlyBurnSatangExact).toFixed(2));

  return {
    cashBalance: fromSatang(toSatangOrZero(cash?.cashBalance)),
    expected30DayInflows: fromSatang(expected30DayInflowsSatang),
    expected30DayOutflows: fromSatang(expected30DayOutflowsSatang),
    scheduledPayrollOutflows: fromSatang(scheduledPayrollOutflowsSatang),
    scheduledDepreciationExpense: fromSatang(scheduledDepreciationExpenseSatang),
    projected30DayCash: fromSatang(projected30DayCashSatang),
    netMonthlyBurn: fromSatang(Math.round(netMonthlyBurnSatangExact)),
    runwayMonths,
    arTotal: fromSatang(thbToSatang(ar.total)),
    apTotal: fromSatang(thbToSatang(ap.total)),
  };
}
