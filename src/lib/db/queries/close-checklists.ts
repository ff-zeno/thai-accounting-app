import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "../index";
import {
  citFilings,
  closeChecklistItems,
  closeChecklists,
  establishments,
  journalEntries,
} from "../schema";
import { orgScopeAlive } from "../helpers/org-scope";
import { ensureHeadOfficeEstablishment } from "./pos-sales-ledger";
import { getPostingOutboxDashboard } from "./posting-outbox";

const CLOSE_ITEMS = [
  ["bank_reconciliation", "Bank reconciliation matched"],
  ["ar_aging_reviewed", "AR aging reviewed"],
  ["ap_aging_reviewed", "AP aging reviewed"],
  ["pos_settlement_reconciled", "POS sales reconciled to processor settlements"],
  ["cash_deposits_matched", "Cash deposit slips matched"],
  ["pp30_prepared", "PP.30 prepared"],
  ["pnd_prepared", "PND filings prepared"],
  ["sso_prepared", "SSO prepared"],
  ["month_end_adjustments", "Month-end accruals and adjustments posted"],
  ["fx_revaluation_run", "FX revaluation reviewed"],
  ["depreciation_posted", "Depreciation posted"],
  ["subledger_ties_verified", "Sub-ledger ties verified"],
  ["trial_balance_reviewed", "Trial balance reviewed"],
  ["period_locked", "Period locked"],
] as const;

export async function getYearEndCloseReadiness(data: {
  orgId: string;
  taxYear: number;
}) {
  const [pnd50] = await db
    .select()
    .from(citFilings)
    .where(
      and(
        ...orgScopeAlive(citFilings, data.orgId),
        eq(citFilings.taxYear, data.taxYear),
        eq(citFilings.filingType, "pnd50"),
        eq(citFilings.isAmendment, false)
      )
    )
    .limit(1);

  const [citAccrual] = pnd50
    ? await db
        .select({ id: journalEntries.id })
        .from(journalEntries)
        .where(
          and(
            ...orgScopeAlive(journalEntries, data.orgId),
            eq(journalEntries.sourceEntityType, "cit_filings"),
            eq(journalEntries.sourceEntityId, pnd50.id),
            eq(journalEntries.postingKind, "cit_accrual"),
            isNull(journalEntries.reversedByEntryId)
          )
        )
        .limit(1)
    : [];

  const checks = [
    {
      key: "pnd50_draft_exists",
      label: "PND.50 draft exists",
      status: pnd50 ? "done" : "blocked",
      evidenceId: pnd50?.id ?? null,
    },
    {
      key: "cit_accrual_posted",
      label: "CIT accrual JE posted",
      status: citAccrual ? "done" : "blocked",
      evidenceId: citAccrual?.id ?? null,
    },
  ] as const;

  return {
    taxYear: data.taxYear,
    ready: checks.every((check) => check.status === "done"),
    checks,
  };
}

export async function ensureCloseChecklist(data: {
  orgId: string;
  periodYear: number;
  periodMonth: number;
}) {
  return db.transaction(async (tx) => {
    const establishment = await ensureHeadOfficeEstablishment(data.orgId, tx);
    const [checklist] = await tx
      .insert(closeChecklists)
      .values({
        orgId: data.orgId,
        establishmentId: establishment.id,
        periodYear: data.periodYear,
        periodMonth: data.periodMonth,
        status: "open",
      })
      .onConflictDoUpdate({
        target: [
          closeChecklists.orgId,
          closeChecklists.establishmentId,
          closeChecklists.periodYear,
          closeChecklists.periodMonth,
        ],
        set: { updatedAt: new Date() },
      })
      .returning();

    await tx
      .insert(closeChecklistItems)
      .values(
        CLOSE_ITEMS.map(([itemKey, description], index) => ({
          orgId: data.orgId,
          checklistId: checklist.id,
          sequence: index + 1,
          itemKey,
          description,
        }))
      )
      .onConflictDoNothing();

    return checklist;
  });
}

export async function getCloseDashboard(orgId: string) {
  const now = new Date();
  const periodYear = now.getUTCFullYear();
  const periodMonth = now.getUTCMonth() + 1;
  const periodEnd = `${periodYear}-${String(periodMonth).padStart(2, "0")}-${String(new Date(Date.UTC(periodYear, periodMonth, 0)).getUTCDate()).padStart(2, "0")}`;
  const checklist = await ensureCloseChecklist({ orgId, periodYear, periodMonth });
  const yearEndReadiness = await getYearEndCloseReadiness({
    orgId,
    taxYear: periodYear - 1,
  });
  const postingQueue = await getPostingOutboxDashboard(orgId, 10, periodEnd);
  const postingQueueBlocked =
    postingQueue.summary.pending + postingQueue.summary.retrying + postingQueue.summary.failed > 0 ||
    postingQueue.exceptions.length > 0;

  const items = await db
    .select()
    .from(closeChecklistItems)
    .where(
      and(
        ...orgScopeAlive(closeChecklistItems, orgId),
        eq(closeChecklistItems.checklistId, checklist.id)
      )
    )
    .orderBy(asc(closeChecklistItems.sequence));

  const [summary] = await db
    .select({
      openCount: sql<number>`COUNT(*) FILTER (WHERE ${closeChecklists.status} <> 'closed')::int`,
      closedCount: sql<number>`COUNT(*) FILTER (WHERE ${closeChecklists.status} = 'closed')::int`,
      blockedItemCount: sql<number>`COUNT(${closeChecklistItems.id}) FILTER (WHERE ${closeChecklistItems.status} = 'blocked')::int`,
    })
    .from(closeChecklists)
    .leftJoin(
      closeChecklistItems,
      and(
        eq(closeChecklistItems.checklistId, closeChecklists.id),
        eq(closeChecklistItems.orgId, closeChecklists.orgId)
      )
    )
    .where(eq(closeChecklists.orgId, orgId));

  const recentChecklists = await db
    .select({
      id: closeChecklists.id,
      periodYear: closeChecklists.periodYear,
      periodMonth: closeChecklists.periodMonth,
      status: closeChecklists.status,
      branchNumber: establishments.branchNumber,
      itemCount: sql<number>`COUNT(${closeChecklistItems.id})::int`,
      doneCount: sql<number>`COUNT(${closeChecklistItems.id}) FILTER (WHERE ${closeChecklistItems.status} = 'done')::int`,
      blockedCount: sql<number>`COUNT(${closeChecklistItems.id}) FILTER (WHERE ${closeChecklistItems.status} = 'blocked')::int`,
    })
    .from(closeChecklists)
    .leftJoin(establishments, eq(establishments.id, closeChecklists.establishmentId))
    .leftJoin(
      closeChecklistItems,
      and(
        eq(closeChecklistItems.checklistId, closeChecklists.id),
        eq(closeChecklistItems.orgId, closeChecklists.orgId)
      )
    )
    .where(eq(closeChecklists.orgId, orgId))
    .groupBy(closeChecklists.id, establishments.branchNumber)
    .orderBy(desc(closeChecklists.periodYear), desc(closeChecklists.periodMonth))
    .limit(12);

  return {
    currentChecklist: checklist,
    currentItems: items,
    summary,
    recentChecklists,
    yearEndReadiness,
    postingQueue: {
      ...postingQueue,
      ready: !postingQueueBlocked,
      throughDate: periodEnd,
    },
  };
}

export async function updateCloseChecklistItem(data: {
  orgId: string;
  itemId: string;
  status: "pending" | "done" | "skipped" | "blocked";
  completedByUserId?: string;
  notes?: string;
}) {
  const [item] = await db
    .update(closeChecklistItems)
    .set({
      status: data.status,
      completedByUserId:
        data.status === "done" ? data.completedByUserId || "system" : null,
      completedAt: data.status === "done" ? new Date() : null,
      notes: data.notes || null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(closeChecklistItems.id, data.itemId),
        ...orgScopeAlive(closeChecklistItems, data.orgId)
      )
    )
    .returning();

  if (!item) throw new Error("Close checklist item not found");
  return item;
}

export async function closeChecklistIfComplete(data: {
  orgId: string;
  checklistId: string;
}) {
  const [blocked] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(closeChecklistItems)
    .where(
      and(
        ...orgScopeAlive(closeChecklistItems, data.orgId),
        eq(closeChecklistItems.checklistId, data.checklistId),
        sql`${closeChecklistItems.status} IN ('pending', 'blocked')`
      )
    );

  if ((blocked?.count ?? 0) > 0) {
    throw new Error("Checklist has pending or blocked items");
  }

  const closedAt = new Date();
  const [checklist] = await db
    .update(closeChecklists)
    .set({ status: "closed", closedAt, updatedAt: closedAt })
    .where(
      and(
        ...orgScopeAlive(closeChecklists, data.orgId),
        eq(closeChecklists.id, data.checklistId)
      )
    )
    .returning();

  if (!checklist) throw new Error("Close checklist not found");
  return checklist;
}
