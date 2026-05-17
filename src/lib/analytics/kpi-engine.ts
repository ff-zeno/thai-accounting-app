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
import { buildAgingSnapshot, summarizeAging } from "./aging";

function money(value: number) {
  return value.toFixed(2);
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
  const grandTotal = Number(totalRow?.total ?? 0);

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
    sharePct:
      grandTotal === 0 ? "0.0000" : (Number(row.amount) / grandTotal).toFixed(4),
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
    averageDays: money(Number(row?.averageDays ?? 0)),
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

  const byCategory = new Map<
    string,
    { category: string; revenue: number; cogs: number }
  >();
  for (const row of revenueRows) {
    byCategory.set(row.category, {
      category: row.category,
      revenue: Number(row.revenue),
      cogs: 0,
    });
  }
  for (const row of cogsRows) {
    const existing =
      byCategory.get(row.category) ?? { category: row.category, revenue: 0, cogs: 0 };
    existing.cogs += Number(row.cogs);
    byCategory.set(row.category, existing);
  }

  return Array.from(byCategory.values())
    .map((row) => {
      const grossMargin = row.revenue - row.cogs;
      return {
        category: row.category,
        revenue: money(row.revenue),
        cogs: money(row.cogs),
        grossMargin: money(grossMargin),
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
  const expected30DayInflows = ar.current + ar.days1To30;
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
  const scheduledPayrollOutflows = Number(payrollForecast?.netPay ?? 0);
  const scheduledDepreciationExpense = Number(
    depreciationForecast?.depreciation ?? 0
  );
  const expected30DayOutflows = ap.current + ap.days1To30 + scheduledPayrollOutflows;
  const projected30DayCash =
    Number(cash?.cashBalance ?? 0) + expected30DayInflows - expected30DayOutflows;

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

  const netMonthlyBurn = Math.max(
    0,
    (Number(burn?.expenses ?? 0) - Number(burn?.income ?? 0)) / 3
  );
  const runwayMonths =
    netMonthlyBurn === 0 ? null : Number((projected30DayCash / netMonthlyBurn).toFixed(2));

  return {
    cashBalance: money(Number(cash?.cashBalance ?? 0)),
    expected30DayInflows: money(expected30DayInflows),
    expected30DayOutflows: money(expected30DayOutflows),
    scheduledPayrollOutflows: money(scheduledPayrollOutflows),
    scheduledDepreciationExpense: money(scheduledDepreciationExpense),
    projected30DayCash: money(projected30DayCash),
    netMonthlyBurn: money(netMonthlyBurn),
    runwayMonths,
    arTotal: money(ar.total),
    apTotal: money(ap.total),
  };
}
