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
import { db, type DbConnection } from "../index";
import {
  transactions,
  reconciliationMatches,
  documents,
  vendors,
  payments,
  aiMatchSuggestions,
  processorSettlements,
} from "../schema";
import { orgScope } from "../helpers/org-scope";
import { auditMutation } from "../helpers/audit-log";
import { resolveOpenExceptionsForEntity } from "./exception-queue";
import { fromSatang, toSatang, toSatangOrZero } from "@/lib/utils/money";

export class ReconciliationAllocationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReconciliationAllocationError";
  }
}

function toCents(value: string | null | undefined): number {
  return Math.round(Number(value ?? "0") * 100);
}

function assertPositiveMoney(value: string, label: string) {
  const cents = toCents(value);
  if (!Number.isFinite(cents) || cents <= 0) {
    throw new ReconciliationAllocationError(`${label} must be greater than 0`);
  }
  return cents;
}

// ---------------------------------------------------------------------------
// Verify entity ownership (org-scoped existence check)
// ---------------------------------------------------------------------------

export async function verifyTransactionOwnership(
  orgId: string,
  transactionIds: string[],
): Promise<boolean> {
  if (transactionIds.length === 0) return true;
  const [row] = await db
    .select({ cnt: count() })
    .from(transactions)
    .where(
      and(
        eq(transactions.orgId, orgId),
        isNull(transactions.deletedAt),
        sql`${transactions.id} = ANY(${transactionIds})`,
      ),
    );
  return (row?.cnt ?? 0) === transactionIds.length;
}

export async function verifyDocumentOwnership(
  orgId: string,
  documentId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ cnt: count() })
    .from(documents)
    .where(
      and(
        eq(documents.id, documentId),
        eq(documents.orgId, orgId),
        isNull(documents.deletedAt),
      ),
    );
  return (row?.cnt ?? 0) === 1;
}

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

  // Malformed amounts/dates on a single document must not throw — that would
  // poison the whole matching batch (one bad row breaks every other match).
  // Bounds are computed in integer satang. REVIEW NOTE: at exact tolerance
  // boundaries this can differ from the legacy float math by 1 satang
  // (toFixed vs Math.round); the bounds only pre-filter SQL candidates, the
  // matcher layers decide the actual match.
  const parsedSatang = toSatang(amount);
  if (parsedSatang === null) return [];
  const minAmount = fromSatang(Math.round(parsedSatang * (1 - tolerance)));
  const maxAmount = fromSatang(Math.round(parsedSatang * (1 + tolerance)));

  const dateObj = new Date(paymentDate);
  if (Number.isNaN(dateObj.getTime())) return [];
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

async function assertAllocationWithinLimits(
  data: {
    orgId: string;
    transactionId: string;
    documentId: string;
    paymentId?: string | null;
    matchedAmount: string;
  },
  conn: DbConnection,
) {
  const newAmountCents = assertPositiveMoney(data.matchedAmount, "Matched amount");

  const [txn] = await conn
    .select({ amount: transactions.amount })
    .from(transactions)
    .where(
      and(
        eq(transactions.id, data.transactionId),
        eq(transactions.orgId, data.orgId),
        isNull(transactions.deletedAt),
      ),
    )
    .limit(1);
  if (!txn) throw new ReconciliationAllocationError("Transaction not found");

  const [doc] = await conn
    .select({ totalAmount: documents.totalAmount })
    .from(documents)
    .where(
      and(
        eq(documents.id, data.documentId),
        eq(documents.orgId, data.orgId),
        isNull(documents.deletedAt),
      ),
    )
    .limit(1);
  if (!doc) throw new ReconciliationAllocationError("Document not found");

  const [txnMatched] = await conn
    .select({ total: sum(reconciliationMatches.matchedAmount) })
    .from(reconciliationMatches)
    .where(
      and(
        eq(reconciliationMatches.orgId, data.orgId),
        eq(reconciliationMatches.transactionId, data.transactionId),
        isNull(reconciliationMatches.deletedAt),
      ),
    );

  const txnTotalCents = toCents(txnMatched?.total) + newAmountCents;
  const txnCapCents = toCents(txn.amount);
  if (txnTotalCents > txnCapCents) {
    throw new ReconciliationAllocationError("Matched amount exceeds transaction amount");
  }

  const [docMatched] = await conn
    .select({ total: sum(reconciliationMatches.matchedAmount) })
    .from(reconciliationMatches)
    .where(
      and(
        eq(reconciliationMatches.orgId, data.orgId),
        eq(reconciliationMatches.documentId, data.documentId),
        isNull(reconciliationMatches.deletedAt),
      ),
    );

  const docTotalCents = toCents(docMatched?.total) + newAmountCents;
  const docCapCents = toCents(doc.totalAmount);
  if (docTotalCents > docCapCents) {
    throw new ReconciliationAllocationError("Matched amount exceeds document total");
  }

  if (data.paymentId) {
    const [payment] = await conn
      .select({ netAmountPaid: payments.netAmountPaid, documentId: payments.documentId })
      .from(payments)
      .where(
        and(
          eq(payments.id, data.paymentId),
          eq(payments.orgId, data.orgId),
          isNull(payments.deletedAt),
        ),
      )
      .limit(1);
    if (!payment) throw new ReconciliationAllocationError("Payment not found");
    if (payment.documentId !== data.documentId) {
      throw new ReconciliationAllocationError("Payment does not belong to document");
    }

    const [paymentMatched] = await conn
      .select({ total: sum(reconciliationMatches.matchedAmount) })
      .from(reconciliationMatches)
      .where(
        and(
          eq(reconciliationMatches.orgId, data.orgId),
          eq(reconciliationMatches.paymentId, data.paymentId),
          isNull(reconciliationMatches.deletedAt),
        ),
      );

    const paymentTotalCents = toCents(paymentMatched?.total) + newAmountCents;
    const paymentCapCents = toCents(payment.netAmountPaid);
    if (paymentTotalCents > paymentCapCents) {
      throw new ReconciliationAllocationError("Matched amount exceeds payment net amount");
    }
  }
}

export async function createMatch(
  data: {
    orgId: string;
    transactionId: string;
    documentId: string;
    paymentId?: string | null;
    matchedAmount: string;
    matchType: "exact" | "fuzzy" | "manual" | "ai_suggested" | "reference" | "multi_signal" | "pattern" | "rule";
    confidence: string;
    matchedBy: "auto" | "manual" | "rule" | "pattern";
    matchMetadata?: unknown;
  },
  tx?: DbConnection,
): Promise<string> {
  const conn = tx ?? db;
  await assertAllocationWithinLimits(data, conn);

  const [match] = await conn
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

  await auditMutation(
    {
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
    },
    conn
  );

  return match.id;
}

// ---------------------------------------------------------------------------
// Update transaction reconciliation status
// ---------------------------------------------------------------------------

export async function updateTransactionReconStatus(
  orgId: string,
  transactionId: string,
  status: "unmatched" | "matched" | "partially_matched",
  tx?: DbConnection,
): Promise<void> {
  const conn = tx ?? db;
  await conn
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

// ---------------------------------------------------------------------------
// Get a single match by ID (org-scoped, includes soft-deleted check)
// ---------------------------------------------------------------------------

export async function getMatchById(
  orgId: string,
  matchId: string,
  tx?: DbConnection,
) {
  const conn = tx ?? db;
  const [row] = await conn
    .select()
    .from(reconciliationMatches)
    .where(
      and(
        eq(reconciliationMatches.id, matchId),
        eq(reconciliationMatches.orgId, orgId),
        isNull(reconciliationMatches.deletedAt),
      ),
    )
    .limit(1);
  return row ?? null;
}

// ---------------------------------------------------------------------------
// Soft-delete a match + audit log
// ---------------------------------------------------------------------------

export async function softDeleteMatch(
  orgId: string,
  matchId: string,
  tx?: DbConnection,
  actorId?: string,
) {
  const conn = tx ?? db;
  const [deleted] = await conn
    .update(reconciliationMatches)
    .set({ deletedAt: new Date() })
    .where(
      and(
        eq(reconciliationMatches.id, matchId),
        eq(reconciliationMatches.orgId, orgId),
        isNull(reconciliationMatches.deletedAt),
      ),
    )
    .returning();

  if (deleted) {
    await auditMutation(
      {
        orgId,
        entityType: "reconciliation_match",
        entityId: matchId,
        action: "delete",
        oldValue: {
          transactionId: deleted.transactionId,
          documentId: deleted.documentId,
          matchType: deleted.matchType,
          matchedBy: deleted.matchedBy,
        },
        actorId,
      },
      conn
    );
  }

  return deleted ?? null;
}

// ---------------------------------------------------------------------------
// Recompute transaction reconciliation status from remaining active claims.
// Critical for split-match rollback: don't blindly set "unmatched".
// ---------------------------------------------------------------------------

/**
 * Derive a transaction's reconciliation status from everything that currently
 * claims it.
 *
 * A deposit can be claimed two ways, and both must be counted here:
 *
 * - a `reconciliation_matches` row (a document paid by this transaction), and
 * - a `processor_settlements` row whose `bank_transaction_id` is this
 *   transaction (a merchant payout this deposit is).
 *
 * Settlement claims are deliberately not stored in `reconciliation_matches` —
 * that table's `document_id` is NOT NULL with a hard FK, and its allocation
 * trigger raises on an unresolvable document. So the settlement matcher writes
 * `transactions.reconciliation_status` directly, and this function has to know
 * about that. If it did not, undoing an unrelated document match would quietly
 * reset a settled deposit to `unmatched` and hand it back to the document
 * matcher to be double-claimed — a silent data defect, not a visible failure.
 */
export async function recomputeTransactionStatus(
  orgId: string,
  transactionId: string,
  tx?: DbConnection,
): Promise<"matched" | "partially_matched" | "unmatched"> {
  const conn = tx ?? db;

  // Count active (non-deleted) matches for this transaction
  const [result] = await conn
    .select({
      matchCount: count(),
      totalMatchedAmount: sum(reconciliationMatches.matchedAmount),
    })
    .from(reconciliationMatches)
    .where(
      and(
        eq(reconciliationMatches.orgId, orgId),
        eq(reconciliationMatches.transactionId, transactionId),
        isNull(reconciliationMatches.deletedAt),
      ),
    );

  // Count settlement claims on the same transaction.
  const [settlementResult] = await conn
    .select({ claimCount: count() })
    .from(processorSettlements)
    .where(
      and(
        eq(processorSettlements.orgId, orgId),
        eq(processorSettlements.bankTransactionId, transactionId),
      ),
    );

  // Get the transaction amount for comparison
  const [txn] = await conn
    .select({ amount: transactions.amount })
    .from(transactions)
    .where(
      and(
        eq(transactions.id, transactionId),
        eq(transactions.orgId, orgId),
      ),
    )
    .limit(1);

  const activeMatches = result?.matchCount ?? 0;
  const settlementClaims = settlementResult?.claimCount ?? 0;
  let newStatus: "matched" | "partially_matched" | "unmatched";

  if (settlementClaims > 0) {
    // A settlement states its own net payout and is matched against that
    // figure exactly, so a live settlement claim fully explains the deposit.
    newStatus = "matched";
  } else if (activeMatches === 0) {
    newStatus = "unmatched";
  } else {
    // Check if total matched amount covers the transaction. Legacy float
    // tolerance was "< 0.01 THB", i.e. less than one satang — with integer
    // satang that means exact coverage.
    const matchedSatang = toSatangOrZero(result?.totalMatchedAmount ?? "0");
    const txnSatang = toSatangOrZero(txn?.amount ?? "0");
    newStatus = matchedSatang === txnSatang ? "matched" : "partially_matched";
  }

  await conn
    .update(transactions)
    .set({ reconciliationStatus: newStatus })
    .where(
      and(
        eq(transactions.id, transactionId),
        eq(transactions.orgId, orgId),
        isNull(transactions.deletedAt),
      ),
    );

  if (newStatus !== "unmatched") {
    await resolveOpenExceptionsForEntity(
      orgId,
      "transaction",
      transactionId,
      "unmatched_bank_transaction",
      `Transaction marked ${newStatus}`,
      conn
    );
  }

  return newStatus;
}

// ---------------------------------------------------------------------------
// Update match confirmation (human approved an auto/AI match)
// ---------------------------------------------------------------------------

export async function updateMatchConfirmation(
  orgId: string,
  matchId: string,
  matchedBy: "manual",
  tx?: DbConnection,
) {
  const conn = tx ?? db;
  await conn
    .update(reconciliationMatches)
    .set({ matchedBy })
    .where(
      and(
        eq(reconciliationMatches.id, matchId),
        eq(reconciliationMatches.orgId, orgId),
        isNull(reconciliationMatches.deletedAt),
      ),
    );
}

// ---------------------------------------------------------------------------
// Get recent matches (for dashboard display)
// ---------------------------------------------------------------------------

export async function getRecentMatches(orgId: string, limit = 10) {
  return db
    .select({
      id: reconciliationMatches.id,
      transactionId: reconciliationMatches.transactionId,
      documentId: reconciliationMatches.documentId,
      matchedAmount: reconciliationMatches.matchedAmount,
      matchType: reconciliationMatches.matchType,
      confidence: reconciliationMatches.confidence,
      matchedBy: reconciliationMatches.matchedBy,
      matchMetadata: reconciliationMatches.matchMetadata,
      matchedAt: reconciliationMatches.matchedAt,
      // Transaction info
      txnDate: transactions.date,
      txnAmount: transactions.amount,
      txnCounterparty: transactions.counterparty,
      txnDescription: transactions.description,
      // Document info
      docNumber: documents.documentNumber,
      docAmount: documents.totalAmount,
      vendorName: vendors.name,
    })
    .from(reconciliationMatches)
    .innerJoin(transactions, eq(reconciliationMatches.transactionId, transactions.id))
    .innerJoin(documents, eq(reconciliationMatches.documentId, documents.id))
    .leftJoin(vendors, eq(documents.vendorId, vendors.id))
    .where(
      and(
        eq(reconciliationMatches.orgId, orgId),
        isNull(reconciliationMatches.deletedAt),
      ),
    )
    .orderBy(desc(reconciliationMatches.matchedAt))
    .limit(limit);
}

// ---------------------------------------------------------------------------
// Get matches by document ID (for document review page)
// ---------------------------------------------------------------------------

export async function getMatchesByDocumentId(orgId: string, documentId: string) {
  return db
    .select({
      id: reconciliationMatches.id,
      matchedAmount: reconciliationMatches.matchedAmount,
      matchType: reconciliationMatches.matchType,
      confidence: reconciliationMatches.confidence,
      matchedBy: reconciliationMatches.matchedBy,
      matchMetadata: reconciliationMatches.matchMetadata,
      matchedAt: reconciliationMatches.matchedAt,
      txnId: transactions.id,
      txnDate: transactions.date,
      txnAmount: transactions.amount,
      txnType: transactions.type,
      txnCounterparty: transactions.counterparty,
      txnDescription: transactions.description,
    })
    .from(reconciliationMatches)
    .innerJoin(transactions, eq(reconciliationMatches.transactionId, transactions.id))
    .where(
      and(
        eq(reconciliationMatches.orgId, orgId),
        eq(reconciliationMatches.documentId, documentId),
        isNull(reconciliationMatches.deletedAt),
      ),
    )
    .orderBy(desc(reconciliationMatches.matchedAt));
}

// ---------------------------------------------------------------------------
// Get matches by transaction ID (for transaction detail views)
// ---------------------------------------------------------------------------

export async function getMatchesByTransactionId(orgId: string, transactionId: string) {
  return db
    .select({
      id: reconciliationMatches.id,
      matchedAmount: reconciliationMatches.matchedAmount,
      matchType: reconciliationMatches.matchType,
      confidence: reconciliationMatches.confidence,
      matchedBy: reconciliationMatches.matchedBy,
      matchMetadata: reconciliationMatches.matchMetadata,
      matchedAt: reconciliationMatches.matchedAt,
      docId: documents.id,
      docNumber: documents.documentNumber,
      docAmount: documents.totalAmount,
      docDirection: documents.direction,
      docIssueDate: documents.issueDate,
      vendorName: vendors.name,
    })
    .from(reconciliationMatches)
    .innerJoin(documents, eq(reconciliationMatches.documentId, documents.id))
    .leftJoin(vendors, eq(documents.vendorId, vendors.id))
    .where(
      and(
        eq(reconciliationMatches.orgId, orgId),
        eq(reconciliationMatches.transactionId, transactionId),
        isNull(reconciliationMatches.deletedAt),
      ),
    )
    .orderBy(desc(reconciliationMatches.matchedAt));
}

// ---------------------------------------------------------------------------
// Get unmatched transactions for AI matching
// Same as getUnmatchedTransactions but excludes transactions with pending
// AI suggestions created less than 24 hours ago (to avoid re-processing).
// ---------------------------------------------------------------------------

export async function getUnmatchedTransactionsForAi(
  orgId: string,
  limit = 50
) {
  // Sub-query: transaction IDs with recent pending AI suggestions
  const recentPendingSuggestions = db
    .selectDistinct({ transactionId: aiMatchSuggestions.transactionId })
    .from(aiMatchSuggestions)
    .where(
      and(
        eq(aiMatchSuggestions.orgId, orgId),
        eq(aiMatchSuggestions.status, "pending"),
        isNull(aiMatchSuggestions.deletedAt),
        gte(aiMatchSuggestions.createdAt, sql`now() - interval '24 hours'`)
      )
    );

  return db
    .select({
      id: transactions.id,
      date: transactions.date,
      amount: transactions.amount,
      type: transactions.type,
      description: transactions.description,
      counterparty: transactions.counterparty,
      referenceNo: transactions.referenceNo,
      bankAccountId: transactions.bankAccountId,
    })
    .from(transactions)
    .where(
      and(
        ...orgScope(transactions, orgId),
        eq(transactions.reconciliationStatus, "unmatched"),
        eq(transactions.isPettyCash, false),
        sql`${transactions.id} NOT IN (${recentPendingSuggestions})`
      )
    )
    .orderBy(desc(transactions.date))
    .limit(limit);
}

// ---------------------------------------------------------------------------
// Get unmatched documents for AI matching
// Confirmed documents without reconciliation matches, joined with payments
// for net/WHT/gross amounts.
// ---------------------------------------------------------------------------

export async function getUnmatchedDocumentsForAi(
  orgId: string,
  limit = 50
) {
  // Sub-query: document IDs that already have active reconciliation matches
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
      direction: documents.direction,
      vendorName: vendors.name,
      netAmountPaid: payments.netAmountPaid,
      whtAmountWithheld: payments.whtAmountWithheld,
      vatAmount: documents.vatAmount,
    })
    .from(documents)
    .leftJoin(vendors, eq(documents.vendorId, vendors.id))
    .leftJoin(
      payments,
      and(
        eq(payments.documentId, documents.id),
        eq(payments.orgId, orgId),
        isNull(payments.deletedAt)
      )
    )
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
