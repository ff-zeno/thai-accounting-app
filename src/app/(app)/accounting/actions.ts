"use server";

import { revalidatePath } from "next/cache";
import { requireOrgAdmin } from "@/lib/utils/admin-guard";
import { db, type DbConnection } from "@/lib/db";
import {
  createManualJournalPair,
  postOpeningBalancePair,
  reverseJournalEntry,
} from "@/lib/db/queries/general-ledger";
import { lockPeriod } from "@/lib/db/queries/period-locks";
import {
  drainPostingOutbox,
  lockGlPostingPeriod,
  processPostingOutboxRow,
} from "@/lib/db/queries/posting-outbox";

function stringField(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function normalizeMoneyInput(value: string) {
  if (!/^\d+(\.\d{1,2})?$/.test(value)) {
    throw new Error("Amount must be a positive number with up to 2 decimals");
  }
  const [whole, fraction = ""] = value.split(".");
  return `${whole}.${fraction.padEnd(2, "0")}`;
}

function isIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

export async function postOpeningBalancePairAction(formData: FormData) {
  const { orgId, userId } = await requireOrgAdmin();
  const asOfDate = stringField(formData, "asOfDate");
  const debitAccountId = stringField(formData, "debitAccountId");
  const creditAccountId = stringField(formData, "creditAccountId");
  const amount = stringField(formData, "amount");

  if (!asOfDate || !debitAccountId || !creditAccountId || !amount) {
    return { error: "Date, debit account, credit account, and amount are required" };
  }

  if (debitAccountId === creditAccountId) {
    return { error: "Debit and credit accounts must be different" };
  }

  try {
    const entry = await postOpeningBalancePair({
      orgId,
      asOfDate,
      debitAccountId,
      creditAccountId,
      amount: normalizeMoneyInput(amount),
      enteredByUserId: userId,
      notes: stringField(formData, "notes"),
    });
    revalidatePath("/accounting");
    return { success: true, entryId: entry.id };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Opening balance could not be posted",
    };
  }
}

export async function createManualJournalPairAction(formData: FormData) {
  const { orgId, userId } = await requireOrgAdmin();
  const entryDate = stringField(formData, "entryDate");
  const debitAccountId = stringField(formData, "manualDebitAccountId");
  const creditAccountId = stringField(formData, "manualCreditAccountId");
  const amount = stringField(formData, "manualAmount");
  const description = stringField(formData, "description");

  if (!entryDate || !debitAccountId || !creditAccountId || !amount || !description) {
    return { error: "Date, accounts, amount, and description are required" };
  }

  if (debitAccountId === creditAccountId) {
    return { error: "Debit and credit accounts must be different" };
  }

  try {
    const entry = await createManualJournalPair({
      orgId,
      entryDate,
      debitAccountId,
      creditAccountId,
      amount: normalizeMoneyInput(amount),
      description,
      createdByUserId: userId,
      notes: stringField(formData, "manualNotes"),
    });
    revalidatePath("/accounting");
    return { success: true, entryId: entry.id };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Manual journal could not be posted",
    };
  }
}

export async function reverseJournalEntryAction(formData: FormData) {
  const { orgId, userId } = await requireOrgAdmin();
  const journalEntryId = stringField(formData, "journalEntryId");
  const reversalDate = stringField(formData, "reversalDate");

  if (!journalEntryId || !reversalDate) {
    return { error: "Journal entry and reversal date are required" };
  }

  try {
    const entry = await reverseJournalEntry({
      orgId,
      journalEntryId,
      reversalDate,
      createdByUserId: userId,
      notes: stringField(formData, "reversalNotes"),
    });
    revalidatePath("/accounting");
    return { success: true, entryId: entry.id };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Journal entry could not be reversed",
    };
  }
}

export async function lockGlPeriodAction(formData: FormData) {
  const { orgId, userId } = await requireOrgAdmin();
  const periodYear = Number(stringField(formData, "periodYear"));
  const periodMonth = Number(stringField(formData, "periodMonth"));
  const lockReason = stringField(formData, "lockReason") || "manual_gl_close";

  if (!Number.isInteger(periodYear) || periodYear < 2000 || periodYear > 2100) {
    return { error: "Valid period year is required" };
  }
  if (!Number.isInteger(periodMonth) || periodMonth < 1 || periodMonth > 12) {
    return { error: "Valid period month is required" };
  }

  try {
    const throughDate = `${periodYear}-${String(periodMonth).padStart(2, "0")}-${String(new Date(Date.UTC(periodYear, periodMonth, 0)).getUTCDate()).padStart(2, "0")}`;
    const lockId = await db.transaction(async (tx) => {
      await lockGlPostingPeriod(tx as DbConnection, orgId, periodYear, periodMonth);
      await drainPostingOutbox({ orgId, throughDate });
      return lockPeriod({
        orgId,
        domain: "gl",
        periodYear,
        periodMonth,
        lockedByUserId: userId,
        lockReason,
        tx: tx as DbConnection,
      });
    });
    revalidatePath("/accounting");
    return { success: true, lockId };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "GL period could not be locked",
    };
  }
}

export async function retryPostingOutboxAction(formData: FormData) {
  const { orgId } = await requireOrgAdmin();
  const postingOutboxId = stringField(formData, "postingOutboxId");
  if (!postingOutboxId) {
    return { error: "Posting outbox row is required" };
  }

  try {
    await processPostingOutboxRow({ orgId, postingOutboxId });
    revalidatePath("/accounting/posting-exceptions");
    revalidatePath("/accounting");
    return { success: true };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Posting outbox row could not be retried",
    };
  }
}

export async function drainPostingOutboxAction(formData: FormData) {
  const { orgId } = await requireOrgAdmin();
  const throughDate = stringField(formData, "throughDate");
  if (!isIsoDate(throughDate)) {
    return { error: "Valid through date is required" };
  }

  try {
    const result = await drainPostingOutbox({ orgId, throughDate });
    revalidatePath("/accounting/posting-exceptions");
    revalidatePath("/accounting");
    revalidatePath("/close");
    return { success: true, ...result };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Posting outbox could not be drained",
    };
  }
}
