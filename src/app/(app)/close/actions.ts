"use server";

import { revalidatePath } from "next/cache";
import { requireOrgAdmin } from "@/lib/utils/admin-guard";
import {
  closeChecklistIfComplete,
  ensureCloseChecklist,
  getYearEndCloseReadiness,
  updateCloseChecklistItem,
} from "@/lib/db/queries/close-checklists";
import { postYearEndCloseJournalEntries } from "@/lib/db/queries/general-ledger";
import { getPostingOutboxDashboard } from "@/lib/db/queries/posting-outbox";

function stringField(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

export async function ensureCloseChecklistAction(formData: FormData) {
  const { orgId } = await requireOrgAdmin();
  const periodYear = Number(stringField(formData, "periodYear"));
  const periodMonth = Number(stringField(formData, "periodMonth"));
  if (!periodYear || !periodMonth) return { error: "Period is required" };

  try {
    const checklist = await ensureCloseChecklist({ orgId, periodYear, periodMonth });
    revalidatePath("/close");
    return { success: true, checklistId: checklist.id };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Checklist could not be opened" };
  }
}

export async function updateCloseChecklistItemAction(formData: FormData) {
  const { orgId, userId } = await requireOrgAdmin();
  const itemId = stringField(formData, "itemId");
  const status = stringField(formData, "status") as
    | "pending"
    | "done"
    | "skipped"
    | "blocked";
  if (!itemId || !status) return { error: "Checklist item and status are required" };

  try {
    await updateCloseChecklistItem({
      orgId,
      itemId,
      status,
      completedByUserId: userId,
      notes: stringField(formData, "notes"),
    });
    revalidatePath("/close");
    return { success: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Checklist item could not be updated" };
  }
}

export async function closeChecklistAction(formData: FormData) {
  const { orgId } = await requireOrgAdmin();
  const checklistId = stringField(formData, "checklistId");
  if (!checklistId) return { error: "Checklist is required" };

  try {
    await closeChecklistIfComplete({ orgId, checklistId });
    revalidatePath("/close");
    return { success: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Checklist could not be closed" };
  }
}

export async function postYearEndCloseAction(formData: FormData) {
  const { orgId, userId } = await requireOrgAdmin();
  const taxYear = Number(stringField(formData, "taxYear"));
  if (!taxYear) return { error: "Tax year is required" };

  try {
    const readiness = await getYearEndCloseReadiness({ orgId, taxYear });
    if (!readiness.ready) {
      return { error: "Year-end close readiness is blocked" };
    }
    const postingQueue = await getPostingOutboxDashboard(orgId, 1, `${taxYear}-12-31`);
    if (
      postingQueue.summary.pending +
        postingQueue.summary.retrying +
        postingQueue.summary.failed >
        0 ||
      postingQueue.exceptions.length > 0
    ) {
      return { error: "Year-end close is blocked by posting queue rows or exceptions" };
    }
    const result = await postYearEndCloseJournalEntries({
      orgId,
      taxYear,
      createdByUserId: userId,
    });
    revalidatePath("/close");
    return {
      success: true,
      revenueSummaryEntryId: result.revenueSummaryEntry.id,
      retainedEarningsEntryId: result.retainedEarningsEntry?.id ?? null,
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Year-end close could not be posted" };
  }
}
