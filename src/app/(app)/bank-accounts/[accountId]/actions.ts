"use server";

import { and, eq, isNull, inArray, lte } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getActiveOrgId } from "@/lib/utils/org-context";
import {
  getTransactions,
  countTransactions,
  softDeleteStatement,
  type TransactionFilters,
} from "@/lib/db/queries/transactions";
import { softDeleteBankAccount } from "@/lib/db/queries/bank-accounts";
import { db } from "@/lib/db";
import { transactions } from "@/lib/db/schema";
import { auditMutation } from "@/lib/db/helpers/audit-log";

export interface TransactionSearchFilters {
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  type?: "debit" | "credit";
  reconciliationStatus?: "unmatched" | "matched" | "partially_matched";
  amountMin?: string;
  amountMax?: string;
}

export interface CursorPaginationParams {
  cursor?: { date: string; id: string } | null;
  direction: "forward" | "backward";
  pageSize?: number;
}

export async function paginateTransactionsAction(
  accountId: string,
  filters: TransactionSearchFilters,
  pagination?: CursorPaginationParams
) {
  const orgId = await getActiveOrgId();
  if (!orgId) return { data: [], totalCount: 0, hasMore: false, nextCursor: null };

  const pageSize = pagination?.pageSize ?? 50;

  const queryFilters: TransactionFilters = {
    orgId,
    bankAccountId: accountId,
    search: filters.search || undefined,
    dateFrom: filters.dateFrom || undefined,
    dateTo: filters.dateTo || undefined,
    type: filters.type || undefined,
    reconciliationStatus: filters.reconciliationStatus || undefined,
    amountMin: filters.amountMin || undefined,
    amountMax: filters.amountMax || undefined,
  };

  const cursorOption = pagination?.cursor
    ? { date: pagination.cursor.date, id: pagination.cursor.id, direction: pagination.direction }
    : undefined;

  const [{ data, hasMore, nextCursor }, totalCount] = await Promise.all([
    getTransactions(queryFilters, { cursor: cursorOption, limit: pageSize }),
    countTransactions(queryFilters),
  ]);

  return { data, totalCount, hasMore, nextCursor };
}

export async function deleteStatementAction(statementId: string) {
  const orgId = await getActiveOrgId();
  if (!orgId) return { error: "No organization selected" };

  const result = await softDeleteStatement(orgId, statementId);

  if ("error" in result) return result;

  revalidatePath("/bank-accounts");
  return { success: true };
}

export async function deleteBankAccountAction(accountId: string) {
  const orgId = await getActiveOrgId();
  if (!orgId) return { error: "No organization selected" };

  const result = await softDeleteBankAccount(orgId, accountId);

  if ("error" in result) return result;

  revalidatePath("/bank-accounts");
  return { success: true };
}

export async function markAsPettyCashAction(
  transactionIds: string[]
): Promise<{ success: true; count: number } | { error: string }> {
  const orgId = await getActiveOrgId();
  if (!orgId) return { error: "No organization selected" };

  if (transactionIds.length === 0) {
    return { error: "No transactions selected" };
  }

  const result = await db
    .update(transactions)
    .set({ isPettyCash: true })
    .where(
      and(
        eq(transactions.orgId, orgId),
        isNull(transactions.deletedAt),
        inArray(transactions.id, transactionIds)
      )
    )
    .returning({ id: transactions.id });

  for (const row of result) {
    await auditMutation({
      orgId,
      entityType: "transaction",
      entityId: row.id,
      action: "update",
      newValue: { isPettyCash: true },
    });
  }

  revalidatePath("/bank-accounts");
  return { success: true, count: result.length };
}

export async function unmarkPettyCashAction(
  transactionIds: string[]
): Promise<{ success: true; count: number } | { error: string }> {
  const orgId = await getActiveOrgId();
  if (!orgId) return { error: "No organization selected" };

  if (transactionIds.length === 0) {
    return { error: "No transactions selected" };
  }

  const result = await db
    .update(transactions)
    .set({ isPettyCash: false })
    .where(
      and(
        eq(transactions.orgId, orgId),
        isNull(transactions.deletedAt),
        inArray(transactions.id, transactionIds)
      )
    )
    .returning({ id: transactions.id });

  for (const row of result) {
    await auditMutation({
      orgId,
      entityType: "transaction",
      entityId: row.id,
      action: "update",
      newValue: { isPettyCash: false },
    });
  }

  revalidatePath("/bank-accounts");
  return { success: true, count: result.length };
}

export async function bulkMarkPettyCashBelowThresholdAction(
  bankAccountId: string,
  thresholdAmount: string
): Promise<{ success: true; count: number } | { error: string }> {
  const orgId = await getActiveOrgId();
  if (!orgId) return { error: "No organization selected" };

  const result = await db
    .update(transactions)
    .set({ isPettyCash: true })
    .where(
      and(
        eq(transactions.orgId, orgId),
        eq(transactions.bankAccountId, bankAccountId),
        eq(transactions.isPettyCash, false),
        eq(transactions.reconciliationStatus, "unmatched"),
        isNull(transactions.deletedAt),
        lte(transactions.amount, thresholdAmount)
      )
    )
    .returning({ id: transactions.id });

  for (const row of result) {
    await auditMutation({
      orgId,
      entityType: "transaction",
      entityId: row.id,
      action: "update",
      newValue: { isPettyCash: true, bulkThreshold: thresholdAmount },
    });
  }

  revalidatePath("/bank-accounts");
  return { success: true, count: result.length };
}
