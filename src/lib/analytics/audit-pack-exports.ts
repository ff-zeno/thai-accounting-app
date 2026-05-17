import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/index";
import {
  closeChecklistItems,
  closeChecklists,
  establishments,
  organizations,
} from "@/lib/db/schema";
import {
  buildAgingSnapshot,
  summarizeAging,
  type AgingKind,
  type AgingRow,
} from "./aging";
import { computeCounterpartyConcentration } from "./kpi-engine";

export interface AuditPackAgingSnapshot {
  asOfDate: string;
  kind: AgingKind;
  rows: AgingRow[];
  summary: ReturnType<typeof summarizeAging>;
}

export interface AuditPackConcentrationAnalysis {
  taxYear: number;
  periodStart: string;
  periodEnd: string;
  customers: AuditPackConcentrationRow[];
  vendors: AuditPackConcentrationRow[];
}

export interface AuditPackConcentrationRow {
  counterpartyId: string | null;
  counterpartyName: string;
  amount: string;
  sharePct: string;
}

export interface CloseChecklistLogItem {
  itemId: string;
  sequence: number;
  itemKey: string;
  description: string;
  status: string;
  assignedToUserId: string | null;
  completedByUserId: string | null;
  completedAt: Date | null;
  notes: string | null;
}

export interface CloseChecklistLogEntry {
  checklistId: string;
  establishmentId: string | null;
  branchNumber: string | null;
  periodYear: number;
  periodMonth: number;
  status: string;
  closedAt: Date | null;
  itemCount: number;
  doneCount: number;
  blockedCount: number;
  items: CloseChecklistLogItem[];
}

async function getFiscalYearWindow(orgId: string, taxYear: number) {
  const [org] = await db
    .select({
      fiscalYearEndMonth: organizations.fiscalYearEndMonth,
      fiscalYearEndDay: organizations.fiscalYearEndDay,
    })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  const endMonth = org?.fiscalYearEndMonth ?? 12;
  const endDay = org?.fiscalYearEndDay ?? 31;
  const end = new Date(Date.UTC(taxYear, endMonth - 1, endDay));
  const start = new Date(Date.UTC(taxYear - 1, endMonth - 1, endDay + 1));

  return {
    periodStart: start.toISOString().slice(0, 10),
    periodEnd: end.toISOString().slice(0, 10),
  };
}

export async function getAgingSnapshot(
  orgId: string,
  asOfDate: string,
  kind: AgingKind
): Promise<AuditPackAgingSnapshot> {
  const rows = await buildAgingSnapshot(orgId, asOfDate, kind);
  return {
    asOfDate,
    kind,
    rows,
    summary: summarizeAging(rows),
  };
}

export async function getConcentrationAnalysis(
  orgId: string,
  taxYear: number
): Promise<AuditPackConcentrationAnalysis> {
  const { periodStart, periodEnd } = await getFiscalYearWindow(orgId, taxYear);
  const [customers, vendors] = await Promise.all([
    computeCounterpartyConcentration({
      orgId,
      periodStart,
      periodEnd,
      direction: "income",
      limit: 10,
    }),
    computeCounterpartyConcentration({
      orgId,
      periodStart,
      periodEnd,
      direction: "expense",
      limit: 10,
    }),
  ]);

  return {
    taxYear,
    periodStart,
    periodEnd,
    customers: customers.map((row) => ({
      counterpartyId: row.counterpartyId,
      counterpartyName: row.counterpartyName,
      amount: row.amount,
      sharePct: row.sharePct,
    })),
    vendors: vendors.map((row) => ({
      counterpartyId: row.counterpartyId,
      counterpartyName: row.counterpartyName,
      amount: row.amount,
      sharePct: row.sharePct,
    })),
  };
}

export async function getCloseChecklistLog(
  orgId: string,
  taxYear: number
): Promise<CloseChecklistLogEntry[]> {
  const { periodStart, periodEnd } = await getFiscalYearWindow(orgId, taxYear);
  const rows = await db
    .select({
      checklistId: closeChecklists.id,
      establishmentId: closeChecklists.establishmentId,
      branchNumber: establishments.branchNumber,
      periodYear: closeChecklists.periodYear,
      periodMonth: closeChecklists.periodMonth,
      checklistStatus: closeChecklists.status,
      checklistClosedAt: closeChecklists.closedAt,
      itemId: closeChecklistItems.id,
      sequence: closeChecklistItems.sequence,
      itemKey: closeChecklistItems.itemKey,
      description: closeChecklistItems.description,
      itemStatus: closeChecklistItems.status,
      assignedToUserId: closeChecklistItems.assignedToUserId,
      completedByUserId: closeChecklistItems.completedByUserId,
      completedAt: closeChecklistItems.completedAt,
      notes: closeChecklistItems.notes,
    })
    .from(closeChecklists)
    .leftJoin(
      establishments,
      and(
        eq(establishments.id, closeChecklists.establishmentId),
        eq(establishments.orgId, closeChecklists.orgId)
      )
    )
    .leftJoin(
      closeChecklistItems,
      and(
        eq(closeChecklistItems.checklistId, closeChecklists.id),
        eq(closeChecklistItems.orgId, closeChecklists.orgId)
      )
    )
    .where(
      and(
        eq(closeChecklists.orgId, orgId),
        eq(closeChecklists.status, "closed"),
        sql`make_date(${closeChecklists.periodYear}, ${closeChecklists.periodMonth}, 1) >= ${periodStart}::date`,
        sql`make_date(${closeChecklists.periodYear}, ${closeChecklists.periodMonth}, 1) <= ${periodEnd}::date`
      )
    )
    .orderBy(
      asc(closeChecklists.periodYear),
      asc(closeChecklists.periodMonth),
      asc(establishments.branchNumber),
      asc(closeChecklistItems.sequence)
    );

  const entries = new Map<string, CloseChecklistLogEntry>();
  for (const row of rows) {
    let entry = entries.get(row.checklistId);
    if (!entry) {
      entry = {
        checklistId: row.checklistId,
        establishmentId: row.establishmentId,
        branchNumber: row.branchNumber,
        periodYear: row.periodYear,
        periodMonth: row.periodMonth,
        status: row.checklistStatus,
        closedAt: row.checklistClosedAt,
        itemCount: 0,
        doneCount: 0,
        blockedCount: 0,
        items: [],
      };
      entries.set(row.checklistId, entry);
    }

    if (!row.itemId || row.sequence == null || !row.itemKey || !row.description || !row.itemStatus) {
      continue;
    }

    entry.itemCount += 1;
    if (row.itemStatus === "done") entry.doneCount += 1;
    if (row.itemStatus === "blocked") entry.blockedCount += 1;
    entry.items.push({
      itemId: row.itemId,
      sequence: row.sequence,
      itemKey: row.itemKey,
      description: row.description,
      status: row.itemStatus,
      assignedToUserId: row.assignedToUserId,
      completedByUserId: row.completedByUserId,
      completedAt: row.completedAt,
      notes: row.notes,
    });
  }

  return Array.from(entries.values());
}
