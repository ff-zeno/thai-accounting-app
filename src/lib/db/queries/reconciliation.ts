import {
  and,
  eq,
  isNull,
  gte,
  lte,
  desc,
  count,
  sum,
  sql,
  type SQL,
} from "drizzle-orm";
import { db } from "../index";
import {
  transactions,
  reconciliationMatches,
  documents,
  vendors,
} from "../schema";
import { orgScope } from "../helpers/org-scope";
import { auditMutation } from "../helpers/audit-log";

// ---------------------------------------------------------------------------
// Find candidate transactions for matching
// ---------------------------------------------------------------------------

export interface MatchCandidateRow {
  id: string;
  amount: string;
  date: string;
  description: string | null;
  counterparty: string | null;
  referenceNo: string | null;
  channel: string | null;
  type: "debit" | "credit";
  bankAccountId: string;
}

export async function findMatchCandidates(
  orgId: string,
  bankAccountId: string | null,
  amount: string,
  paymentDate: string,
  options?: {
    amountTolerance?: number; // e.g., 0.01 for 1%
    dateDays?: number; // e.g., 7 or 14
  }
): Promise<MatchCandidateRow[]> {
  const tolerance = options?.amountTolerance ?? 0;
  const dateDays = options?.dateDays ?? 7;

  const parsedAmount = parseFloat(amount);
  const minAmount = (parsedAmount * (1 - tolerance)).toFixed(2);
  const maxAmount = (parsedAmount * (1 + tolerance)).toFixed(2);

  const dateObj = new Date(paymentDate);
  const startDate = new Date(dateObj);
  startDate.setDate(startDate.getDate() - dateDays);
  const endDate = new Date(dateObj);
  endDate.setDate(endDate.getDate() + dateDays);

  const startDateStr = startDate.toISOString().split("T")[0];
  const endDateStr = endDate.toISOString().split("T")[0];

  const conditions: SQL[] = [
    ...orgScope(transactions, orgId),
    eq(transactions.reconciliationStatus, "unmatched"),
    eq(transactions.isPettyCash, false),
    gte(transactions.date, startDateStr),
    lte(transactions.date, endDateStr),
    gte(transactions.amount, minAmount),
    lte(transactions.amount, maxAmount),
  ];

  if (bankAccountId) {
    conditions.push(eq(transactions.bankAccountId, bankAccountId));
  }

  const rows = await db
    .select({
      id: transactions.id,
      amount: transactions.amount,
      date: transactions.date,
      description: transactions.description,
      counterparty: transactions.counterparty,
      referenceNo: transactions.referenceNo,
      channel: transactions.channel,
      type: transactions.type,
      bankAccountId: transactions.bankAccountId,
    })
    .from(transactions)
    .where(and(...conditions))
    .orderBy(desc(transactions.date));

  return rows;
}

// ---------------------------------------------------------------------------
// Create reconciliation match
// ---------------------------------------------------------------------------

export async function createMatch(data: {
  orgId: string;
  transactionId: string;
  documentId: string;
  paymentId?: string | null;
  matchedAmount: string;
  matchType: "exact" | "fuzzy" | "manual" | "ai_suggested" | "reference" | "multi_signal" | "pattern" | "rule";
  confidence: string;
  matchedBy: "auto" | "manual" | "rule" | "pattern";
  matchMetadata?: unknown;
}): Promise<string> {
  const [match] = await db
    .insert(reconciliationMatches)
    .values({
      orgId: data.orgId,
      transactionId: data.transactionId,
      documentId: data.documentId,
      paymentId: data.paymentId ?? null,
      matchedAmount: data.matchedAmount,
      matchType: data.matchType,
      confidence: data.confidence,
      matchedBy: data.matchedBy,
      matchMetadata: data.matchMetadata ?? null,
      matchedAt: new Date(),
    })
    .returning({ id: reconciliationMatches.id });

  await auditMutation({
    orgId: data.orgId,
    entityType: "reconciliation_match",
    entityId: match.id,
    action: "create",
    newValue: {
      transactionId: data.transactionId,
      documentId: data.documentId,
      matchType: data.matchType,
      matchedBy: data.matchedBy,
      confidence: data.confidence,
    },
  });

  return match.id;
}

// ---------------------------------------------------------------------------
// Update transaction reconciliation status
// ---------------------------------------------------------------------------

export async function updateTransactionReconStatus(
  orgId: string,
  transactionId: string,
  status: "unmatched" | "matched" | "partially_matched"
): Promise<void> {
  await db
    .update(transactions)
    .set({ reconciliationStatus: status })
    .where(
      and(
        eq(transactions.id, transactionId),
        eq(transactions.orgId, orgId),
        isNull(transactions.deletedAt)
      )
    );
}

// ---------------------------------------------------------------------------
// Get unmatched transactions for an org
// ---------------------------------------------------------------------------

export async function getUnmatchedTransactions(
  orgId: string,
  limit = 50
) {
  return db
    .select({
      id: transactions.id,
      date: transactions.date,
      amount: transactions.amount,
      type: transactions.type,
      description: transactions.description,
      counterparty: transactions.counterparty,
      bankAccountId: transactions.bankAccountId,
    })
    .from(transactions)
    .where(
      and(
        ...orgScope(transactions, orgId),
        eq(transactions.reconciliationStatus, "unmatched"),
        eq(transactions.isPettyCash, false)
      )
    )
    .orderBy(desc(transactions.date))
    .limit(limit);
}

// ---------------------------------------------------------------------------
// Get unmatched documents for an org
// ---------------------------------------------------------------------------

export async function getUnmatchedDocuments(orgId: string, limit = 50) {
  // Documents that are confirmed but have no reconciliation match
  const matchedDocIds = db
    .selectDistinct({ documentId: reconciliationMatches.documentId })
    .from(reconciliationMatches)
    .where(
      and(
        eq(reconciliationMatches.orgId, orgId),
        isNull(reconciliationMatches.deletedAt)
      )
    );

  return db
    .select({
      id: documents.id,
      documentNumber: documents.documentNumber,
      issueDate: documents.issueDate,
      totalAmount: documents.totalAmount,
      currency: documents.currency,
      status: documents.status,
      vendorName: vendors.name,
    })
    .from(documents)
    .leftJoin(vendors, eq(documents.vendorId, vendors.id))
    .where(
      and(
        ...orgScope(documents, orgId),
        eq(documents.status, "confirmed"),
        sql`${documents.id} NOT IN (${matchedDocIds})`
      )
    )
    .orderBy(desc(documents.issueDate))
    .limit(limit);
}

// ---------------------------------------------------------------------------
// Get reconciliation stats for dashboard
// ---------------------------------------------------------------------------

export async function getReconciliationStats(
  orgId: string,
  periodStart?: string,
  periodEnd?: string
): Promise<{
  totalTransactions: number;
  matchedTransactions: number;
  unmatchedTransactions: number;
  matchRate: number;
  unmatchedAmount: string;
}> {
  const dateConditions: SQL[] = [];
  if (periodStart) {
    dateConditions.push(gte(transactions.date, periodStart));
  }
  if (periodEnd) {
    dateConditions.push(lte(transactions.date, periodEnd));
  }

  const baseConditions: SQL[] = [
    ...orgScope(transactions, orgId),
    eq(transactions.isPettyCash, false),
    ...dateConditions,
  ];

  const [totalRow] = await db
    .select({ count: count() })
    .from(transactions)
    .where(and(...baseConditions));

  const [matchedRow] = await db
    .select({ count: count() })
    .from(transactions)
    .where(
      and(
        ...baseConditions,
        eq(transactions.reconciliationStatus, "matched")
      )
    );

  const [unmatchedRow] = await db
    .select({
      count: count(),
      totalAmount: sum(transactions.amount),
    })
    .from(transactions)
    .where(
      and(
        ...baseConditions,
        eq(transactions.reconciliationStatus, "unmatched")
      )
    );

  const total = totalRow?.count ?? 0;
  const matched = matchedRow?.count ?? 0;
  const unmatched = unmatchedRow?.count ?? 0;
  const unmatchedAmount = unmatchedRow?.totalAmount ?? "0.00";
  const matchRate = total > 0 ? matched / total : 0;

  return {
    totalTransactions: total,
    matchedTransactions: matched,
    unmatchedTransactions: unmatched,
    matchRate: Math.round(matchRate * 10000) / 10000,
    unmatchedAmount,
  };
}
