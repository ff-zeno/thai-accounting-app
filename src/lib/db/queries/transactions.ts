import { and, eq, isNull, gte, lte, like, or, desc, gt, lt } from "drizzle-orm";
import { db } from "../index";
import { transactions, bankStatements } from "../schema";

interface TransactionFilters {
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

export async function getTransactions(
  filters: TransactionFilters,
  cursor?: PaginationCursor,
  limit = 50
) {
  const conditions = [
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

  // Cursor-based pagination (keyset on date DESC, id DESC)
  if (cursor) {
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

  const rows = await db
    .select()
    .from(transactions)
    .where(and(...conditions))
    .orderBy(desc(transactions.date), desc(transactions.id))
    .limit(limit + 1);

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
  }[]
) {
  if (txns.length === 0) return { inserted: 0, skipped: 0 };

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

  const result = await db
    .insert(transactions)
    .values(values)
    .onConflictDoNothing({
      target: [
        transactions.orgId,
        transactions.bankAccountId,
        transactions.externalRef,
        transactions.date,
        transactions.amount,
      ],
    })
    .returning({ id: transactions.id });

  return { inserted: result.length, skipped: txns.length - result.length };
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
    .onConflictDoNothing()
    .returning();
  return statement;
}

export async function updateStatementStatus(
  id: string,
  importStatus: string,
) {
  await db
    .update(bankStatements)
    .set({ importStatus })
    .where(eq(bankStatements.id, id));
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
