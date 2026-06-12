import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/index";
import {
  costCenters,
  glAccounts,
  journalEntries,
  journalLines,
  projects,
} from "@/lib/db/schema";
import { fromSatang, toSatangOrZero } from "@/lib/utils/money";

export type ProfitabilitySegmentKind = "cost_center" | "project";

export interface ProfitabilitySegmentRow {
  segmentKind: ProfitabilitySegmentKind;
  segmentId: string | null;
  segmentCode: string;
  segmentName: string;
  revenue: string;
  cogs: string;
  expenses: string;
  grossMargin: string;
  grossMarginPct: string | null;
  operatingProfit: string;
}

function mapProfitabilityRows(
  rows: Array<{
    segmentId: string | null;
    segmentCode: string | null;
    segmentName: string | null;
    revenue: string;
    cogs: string;
    expenses: string;
  }>,
  segmentKind: ProfitabilitySegmentKind
): ProfitabilitySegmentRow[] {
  return rows.map((row) => {
    // Integer satang throughout; ratios stay plain numbers.
    const revenue = toSatangOrZero(row.revenue);
    const cogs = toSatangOrZero(row.cogs);
    const expenses = toSatangOrZero(row.expenses);
    const grossMargin = revenue - cogs;
    const operatingProfit = grossMargin - expenses;

    return {
      segmentKind,
      segmentId: row.segmentId,
      segmentCode: row.segmentCode?.trim() || "UNASSIGNED",
      segmentName: row.segmentName?.trim() || "Unassigned",
      revenue: fromSatang(revenue),
      cogs: fromSatang(cogs),
      expenses: fromSatang(expenses),
      grossMargin: fromSatang(grossMargin),
      grossMarginPct: revenue <= 0 ? null : (grossMargin / revenue).toFixed(4),
      operatingProfit: fromSatang(operatingProfit),
    };
  });
}

export async function getProfitabilityByCostCenter(data: {
  orgId: string;
  periodStart: string;
  periodEnd: string;
}): Promise<ProfitabilitySegmentRow[]> {
  const rows = await db
    .select({
      segmentId: costCenters.id,
      segmentCode: costCenters.code,
      segmentName: costCenters.nameEn,
      revenue: sql<string>`COALESCE(SUM(CASE WHEN ${glAccounts.accountType} = 'revenue' THEN ${journalLines.creditAmount} - ${journalLines.debitAmount} ELSE 0 END), 0)::numeric(14,2)`,
      cogs: sql<string>`COALESCE(SUM(CASE WHEN ${glAccounts.accountType} = 'cogs' THEN ${journalLines.debitAmount} - ${journalLines.creditAmount} ELSE 0 END), 0)::numeric(14,2)`,
      expenses: sql<string>`COALESCE(SUM(CASE WHEN ${glAccounts.accountType} = 'expense' THEN ${journalLines.debitAmount} - ${journalLines.creditAmount} ELSE 0 END), 0)::numeric(14,2)`,
    })
    .from(journalLines)
    .innerJoin(
      journalEntries,
      and(
        eq(journalEntries.id, journalLines.journalEntryId),
        eq(journalEntries.orgId, journalLines.orgId)
      )
    )
    .innerJoin(
      glAccounts,
      and(eq(glAccounts.id, journalLines.accountId), eq(glAccounts.orgId, journalLines.orgId))
    )
    .leftJoin(
      costCenters,
      and(
        eq(costCenters.id, journalLines.costCenterId),
        eq(costCenters.orgId, journalLines.orgId),
        sql`${costCenters.deletedAt} IS NULL`
      )
    )
    .where(
      and(
        eq(journalLines.orgId, data.orgId),
        eq(journalEntries.orgId, data.orgId),
        eq(glAccounts.orgId, data.orgId),
        sql`${journalEntries.postingDate} >= ${data.periodStart}::date`,
        sql`${journalEntries.postingDate} <= ${data.periodEnd}::date`,
        sql`${glAccounts.accountType} IN ('revenue', 'cogs', 'expense')`
      )
    )
    .groupBy(costCenters.id, costCenters.code, costCenters.nameEn)
    .having(sql`
      COALESCE(SUM(CASE WHEN ${glAccounts.accountType} = 'revenue' THEN ${journalLines.creditAmount} - ${journalLines.debitAmount} ELSE 0 END), 0) <> 0
      OR COALESCE(SUM(CASE WHEN ${glAccounts.accountType} = 'cogs' THEN ${journalLines.debitAmount} - ${journalLines.creditAmount} ELSE 0 END), 0) <> 0
      OR COALESCE(SUM(CASE WHEN ${glAccounts.accountType} = 'expense' THEN ${journalLines.debitAmount} - ${journalLines.creditAmount} ELSE 0 END), 0) <> 0
    `)
    .orderBy(asc(sql`COALESCE(${costCenters.code}, 'ZZZ_UNASSIGNED')`));

  return mapProfitabilityRows(rows, "cost_center");
}

export async function getProfitabilityByProject(data: {
  orgId: string;
  periodStart: string;
  periodEnd: string;
}): Promise<ProfitabilitySegmentRow[]> {
  const rows = await db
    .select({
      segmentId: projects.id,
      segmentCode: projects.code,
      segmentName: projects.nameEn,
      revenue: sql<string>`COALESCE(SUM(CASE WHEN ${glAccounts.accountType} = 'revenue' THEN ${journalLines.creditAmount} - ${journalLines.debitAmount} ELSE 0 END), 0)::numeric(14,2)`,
      cogs: sql<string>`COALESCE(SUM(CASE WHEN ${glAccounts.accountType} = 'cogs' THEN ${journalLines.debitAmount} - ${journalLines.creditAmount} ELSE 0 END), 0)::numeric(14,2)`,
      expenses: sql<string>`COALESCE(SUM(CASE WHEN ${glAccounts.accountType} = 'expense' THEN ${journalLines.debitAmount} - ${journalLines.creditAmount} ELSE 0 END), 0)::numeric(14,2)`,
    })
    .from(journalLines)
    .innerJoin(
      journalEntries,
      and(
        eq(journalEntries.id, journalLines.journalEntryId),
        eq(journalEntries.orgId, journalLines.orgId)
      )
    )
    .innerJoin(
      glAccounts,
      and(eq(glAccounts.id, journalLines.accountId), eq(glAccounts.orgId, journalLines.orgId))
    )
    .leftJoin(
      projects,
      and(
        eq(projects.id, journalLines.projectId),
        eq(projects.orgId, journalLines.orgId),
        sql`${projects.deletedAt} IS NULL`
      )
    )
    .where(
      and(
        eq(journalLines.orgId, data.orgId),
        eq(journalEntries.orgId, data.orgId),
        eq(glAccounts.orgId, data.orgId),
        sql`${journalEntries.postingDate} >= ${data.periodStart}::date`,
        sql`${journalEntries.postingDate} <= ${data.periodEnd}::date`,
        sql`${glAccounts.accountType} IN ('revenue', 'cogs', 'expense')`
      )
    )
    .groupBy(projects.id, projects.code, projects.nameEn)
    .having(sql`
      COALESCE(SUM(CASE WHEN ${glAccounts.accountType} = 'revenue' THEN ${journalLines.creditAmount} - ${journalLines.debitAmount} ELSE 0 END), 0) <> 0
      OR COALESCE(SUM(CASE WHEN ${glAccounts.accountType} = 'cogs' THEN ${journalLines.debitAmount} - ${journalLines.creditAmount} ELSE 0 END), 0) <> 0
      OR COALESCE(SUM(CASE WHEN ${glAccounts.accountType} = 'expense' THEN ${journalLines.debitAmount} - ${journalLines.creditAmount} ELSE 0 END), 0) <> 0
    `)
    .orderBy(asc(sql`COALESCE(${projects.code}, 'ZZZ_UNASSIGNED')`));

  return mapProfitabilityRows(rows, "project");
}
