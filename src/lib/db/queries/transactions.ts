import { and, eq, isNull, gte, lte, like, or, desc, gt, lt, count, type SQL } from "drizzle-orm";
import { db, type DbConnection } from "../index";
import { transactions, bankStatements, reconciliationMatches } from "../schema";
import { auditMutation } from "../helpers/audit-log";

const IMPORT_CHUNK_SIZE = 100;

export interface TransactionFilters {
  orgId: string;
  bankAccountId?: string;
  dateFrom?: string;
  dateTo?: string;
  type?: "debit" | "credit";
  reconciliationStatus?: "unmatched" | "matched" | "partially_matched";
  search?: string;
  amountMin?: string;
  amountMax?: string;
}

interface PaginationCursor {
  date: string;
  id: string;
  direction: "forward" | "backward";
}

function buildTransactionConditions(filters: TransactionFilters): SQL[] {
  const conditions: SQL[] = [
    eq(transactions.orgId, filters.orgId),
    isNull(transactions.deletedAt),
  ];

  if (filters.bankAccountId) {
    conditions.push(eq(transactions.bankAccountId, filters.bankAccountId));
  }
  if (filters.dateFrom) {
    conditions.push(gte(transactions.date, filters.dateFrom));
  }
  if (filters.dateTo) {
    conditions.push(lte(transactions.date, filters.dateTo));
  }
  if (filters.type) {
    conditions.push(eq(transactions.type, filters.type));
  }
  if (filters.reconciliationStatus) {
    conditions.push(
      eq(transactions.reconciliationStatus, filters.reconciliationStatus)
    );
  }
  if (filters.amountMin) {
    conditions.push(gte(transactions.amount, filters.amountMin));
  }
  if (filters.amountMax) {
    conditions.push(lte(transactions.amount, filters.amountMax));
  }
  if (filters.search) {
    const pattern = `%${filters.search}%`;
    conditions.push(
      or(
        like(transactions.description, pattern),
        like(transactions.counterparty, pattern),
        like(transactions.referenceNo, pattern)
      )!
    );
  }

  return conditions;
}

export async function countTransactions(filters: TransactionFilters): Promise<number> {
  const conditions = buildTransactionConditions(filters);

  const [row] = await db
    .select({ count: count() })
    .from(transactions)
    .where(and(...conditions));

  return row?.count ?? 0;
}

export async function getTransactions(
  filters: TransactionFilters,
  options?: {
    cursor?: PaginationCursor;
    offset?: number;
    limit?: number;
  }
) {
  const limit = options?.limit ?? 50;
  const conditions = buildTransactionConditions(filters);

  // Cursor-based pagination (keyset on date DESC, id DESC)
  if (options?.cursor) {
    const cursor = options.cursor;
    if (cursor.direction === "forward") {
      conditions.push(
        or(
          lt(transactions.date, cursor.date),
          and(eq(transactions.date, cursor.date), lt(transactions.id, cursor.id))
        )!
      );
    } else {
      conditions.push(
        or(
          gt(transactions.date, cursor.date),
          and(eq(transactions.date, cursor.date), gt(transactions.id, cursor.id))
        )!
      );
    }
  }

  let query = db
    .select()
    .from(transactions)
    .where(and(...conditions))
    .orderBy(desc(transactions.date), desc(transactions.id))
    .limit(limit + 1);

  if (options?.offset !== undefined) {
    query = query.offset(options.offset) as typeof query;
  }

  const rows = await query;

  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;

  return {
    data,
    hasMore,
    nextCursor:
      hasMore && data.length > 0
        ? { date: data[data.length - 1].date, id: data[data.length - 1].id }
        : null,
  };
}

export async function importTransactions(
  orgId: string,
  bankAccountId: string,
  statementId: string,
  txns: {
    date: string;
    description?: string;
    amount: string;
    type: "debit" | "credit";
    runningBalance?: string;
    referenceNo?: string;
    channel?: string;
    counterparty?: string;
    externalRef: string;
  }[],
  tx?: DbConnection
) {
  if (txns.length === 0) return { inserted: 0, skipped: 0 };

  const conn = tx ?? db;
  const values = txns.map((t) => ({
    orgId,
    bankAccountId,
    statementId,
    date: t.date,
    description: t.description,
    amount: t.amount,
    type: t.type as "debit" | "credit",
    runningBalance: t.runningBalance,
    referenceNo: t.referenceNo,
    channel: t.channel,
    counterparty: t.counterparty,
    externalRef: t.externalRef,
  }));

  // Chunk inserts to avoid query size limits on large statements
  let inserted = 0;
  for (let i = 0; i < values.length; i += IMPORT_CHUNK_SIZE) {
    const chunk = values.slice(i, i + IMPORT_CHUNK_SIZE);
    const result = await conn
      .insert(transactions)
      .values(chunk)
      .onConflictDoNothing()
      .returning({ id: transactions.id });
    inserted += result.length;
  }

  return { inserted, skipped: txns.length - inserted };
}

export async function createStatement(data: {
  orgId: string;
  bankAccountId: string;
  periodStart: string;
  periodEnd: string;
  openingBalance?: string;
  closingBalance?: string;
  fileUrl?: string;
  parserUsed: string;
  importStatus: string;
}) {
  const [statement] = await db
    .insert(bankStatements)
    .values(data)
    .returning();
  return statement;
}

/**
 * Find an active (non-deleted) statement with the exact same period, or create a new one.
 * This avoids unique constraint violations from the stmt_org_account_period_active index
 * when re-importing the same period (e.g. after a failed import or to fill gaps).
 */
export async function findOrCreateStatement(data: {
  orgId: string;
  bankAccountId: string;
  periodStart: string;
  periodEnd: string;
  openingBalance?: string;
  closingBalance?: string;
  fileUrl?: string;
  parserUsed: string;
  importStatus: string;
}, tx?: DbConnection) {
  const conn = tx ?? db;

  // Look for an existing active statement with the exact same period
  const [existing] = await conn
    .select()
    .from(bankStatements)
    .where(
      and(
        eq(bankStatements.orgId, data.orgId),
        eq(bankStatements.bankAccountId, data.bankAccountId),
        eq(bankStatements.periodStart, data.periodStart),
        eq(bankStatements.periodEnd, data.periodEnd),
        isNull(bankStatements.deletedAt)
      )
    )
    .limit(1);

  if (existing) {
    // Reuse the existing statement — reset status for this import attempt
    await conn
      .update(bankStatements)
      .set({
        importStatus: data.importStatus,
        parserUsed: data.parserUsed,
        openingBalance: data.openingBalance ?? existing.openingBalance,
        closingBalance: data.closingBalance ?? existing.closingBalance,
      })
      .where(eq(bankStatements.id, existing.id));
    return { ...existing, importStatus: data.importStatus, reused: true as const };
  }

  // Create a new statement
  const [statement] = await conn
    .insert(bankStatements)
    .values(data)
    .returning();
  return { ...statement, reused: false as const };
}

export async function updateStatementStatus(
  orgId: string,
  id: string,
  importStatus: string,
  tx?: DbConnection
) {
  const conn = tx ?? db;
  await conn
    .update(bankStatements)
    .set({ importStatus })
    .where(
      and(
        eq(bankStatements.id, id),
        eq(bankStatements.orgId, orgId),
        isNull(bankStatements.deletedAt)
      )
    );
}

export async function getStatementsByAccount(
  orgId: string,
  bankAccountId: string
) {
  return db
    .select()
    .from(bankStatements)
    .where(
      and(
        eq(bankStatements.orgId, orgId),
        eq(bankStatements.bankAccountId, bankAccountId),
        isNull(bankStatements.deletedAt)
      )
    )
    .orderBy(desc(bankStatements.periodEnd));
}

export async function getStatementsWithTxnCount(
  orgId: string,
  bankAccountId: string
) {
  const rows = await db
    .select({
      id: bankStatements.id,
      periodStart: bankStatements.periodStart,
      periodEnd: bankStatements.periodEnd,
      openingBalance: bankStatements.openingBalance,
      closingBalance: bankStatements.closingBalance,
      parserUsed: bankStatements.parserUsed,
      importStatus: bankStatements.importStatus,
      createdAt: bankStatements.createdAt,
      txnCount: count(transactions.id),
    })
    .from(bankStatements)
    .leftJoin(
      transactions,
      and(
        eq(transactions.statementId, bankStatements.id),
        isNull(transactions.deletedAt)
      )
    )
    .where(
      and(
        eq(bankStatements.orgId, orgId),
        eq(bankStatements.bankAccountId, bankAccountId),
        isNull(bankStatements.deletedAt)
      )
    )
    .groupBy(bankStatements.id)
    .orderBy(desc(bankStatements.periodEnd));

  return rows;
}

export async function softDeleteStatement(
  orgId: string,
  statementId: string
): Promise<{ success: true } | { error: string }> {
  // Check for reconciled transactions
  const reconciledTxns = await db
    .select({ id: transactions.id })
    .from(transactions)
    .innerJoin(
      reconciliationMatches,
      and(
        eq(reconciliationMatches.transactionId, transactions.id),
        isNull(reconciliationMatches.deletedAt)
      )
    )
    .where(
      and(
        eq(transactions.orgId, orgId),
        eq(transactions.statementId, statementId),
        isNull(transactions.deletedAt)
      )
    )
    .limit(1);

  if (reconciledTxns.length > 0) {
    return {
      error:
        "Cannot delete statement: some transactions are linked to reconciliation matches. Remove matches first.",
    };
  }

  const now = new Date();

  // Soft-delete all transactions for this statement
  await db
    .update(transactions)
    .set({ deletedAt: now })
    .where(
      and(
        eq(transactions.orgId, orgId),
        eq(transactions.statementId, statementId),
        isNull(transactions.deletedAt)
      )
    );

  // Soft-delete the statement itself
  await db
    .update(bankStatements)
    .set({ deletedAt: now })
    .where(
      and(
        eq(bankStatements.id, statementId),
        eq(bankStatements.orgId, orgId),
        isNull(bankStatements.deletedAt)
      )
    );

  await auditMutation({
    orgId,
    entityType: "bank_statement",
    entityId: statementId,
    action: "delete",
  });

  return { success: true };
}

export async function getTransactionsByDateRange(
  orgId: string,
  bankAccountId: string,
  startDate: string,
  endDate: string
) {
  return db
    .select()
    .from(transactions)
    .where(
      and(
        eq(transactions.orgId, orgId),
        eq(transactions.bankAccountId, bankAccountId),
        gte(transactions.date, startDate),
        lte(transactions.date, endDate),
        isNull(transactions.deletedAt)
      )
    )
    .orderBy(desc(transactions.date), desc(transactions.id));
}

export async function getOverlappingStatements(
  orgId: string,
  bankAccountId: string,
  periodStart: string,
  periodEnd: string
) {
  return db
    .select()
    .from(bankStatements)
    .where(
      and(
        eq(bankStatements.orgId, orgId),
        eq(bankStatements.bankAccountId, bankAccountId),
        isNull(bankStatements.deletedAt),
        // Overlaps: existing.start <= new.end AND existing.end >= new.start
        lte(bankStatements.periodStart, periodEnd),
        gte(bankStatements.periodEnd, periodStart)
      )
    );
}
