import { and, asc, desc, eq, gte, isNull, inArray, lte, sql, type SQL } from "drizzle-orm";

import { db, type DbConnection } from "../index";
import {
  processorSettlements,
  settlementImportMappings,
  transactions,
} from "../schema";
import { orgScopeAlive } from "../helpers/org-scope";
import { auditMutation } from "../helpers/audit-log";
import { recomputeTransactionStatus } from "./reconciliation";
import type { MatchMetadata } from "@/lib/reconciliation/matcher";
import type {
  ParsedSettlement,
  SettlementColumnMapping,
} from "@/lib/parsers/settlement-csv";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SettlementFilters {
  processor?: string;
  reconciliationStatus?: string;
  periodFrom?: string;
  periodTo?: string;
  limit?: number;
  offset?: number;
}

export interface ImportSettlementsInput {
  orgId: string;
  processor: string;
  settlements: ParsedSettlement[];
  establishmentId?: string | null;
  actorId?: string;
}

export interface ImportSettlementsResult {
  created: number;
  updated: number;
  /** External IDs whose match was dropped because the net payout changed. */
  matchesInvalidated: string[];
}

/**
 * `unreconciled` — nothing claims this payout yet.
 * `suggested`    — the matcher found a deposit; a human should confirm it.
 * `matched`      — confirmed, or matched with nothing left to doubt.
 *
 * `suggested` still writes `bank_transaction_id`, so the deposit counts as
 * explained straight away and the document matcher cannot double-claim it.
 * That mirrors how a pending `reconciliation_matches` row already behaves.
 */
export type SettlementReconciliationStatus =
  | "unreconciled"
  | "suggested"
  | "matched";

export interface LinkSettlementInput {
  orgId: string;
  settlementId: string;
  transactionId: string;
  status: Exclude<SettlementReconciliationStatus, "unreconciled">;
  confidence: string;
  metadata: MatchMetadata;
  /** Deposit minus net payout, in THB. Null when the two agree exactly. */
  discrepancy?: string | null;
  actorId?: string;
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

function buildFilters(orgId: string, filters: SettlementFilters): SQL[] {
  const conditions: SQL[] = [...orgScopeAlive(processorSettlements, orgId)];

  if (filters.processor) {
    conditions.push(eq(processorSettlements.processor, filters.processor));
  }
  if (filters.reconciliationStatus) {
    conditions.push(
      eq(processorSettlements.reconciliationStatus, filters.reconciliationStatus)
    );
  }
  if (filters.periodFrom) {
    conditions.push(
      gte(processorSettlements.periodEnd, new Date(filters.periodFrom))
    );
  }
  if (filters.periodTo) {
    conditions.push(
      lte(processorSettlements.periodEnd, new Date(filters.periodTo))
    );
  }

  return conditions;
}

/** The settlement register, newest period first. */
export async function listSettlements(
  orgId: string,
  filters: SettlementFilters = {}
) {
  return db
    .select()
    .from(processorSettlements)
    .where(and(...buildFilters(orgId, filters)))
    .orderBy(
      desc(processorSettlements.periodEnd),
      desc(processorSettlements.createdAt)
    )
    .limit(filters.limit ?? 100)
    .offset(filters.offset ?? 0);
}

export async function countSettlements(
  orgId: string,
  filters: SettlementFilters = {}
): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(processorSettlements)
    .where(and(...buildFilters(orgId, filters)));
  return row?.count ?? 0;
}

export async function getSettlementById(orgId: string, settlementId: string) {
  const [row] = await db
    .select()
    .from(processorSettlements)
    .where(
      and(
        ...orgScopeAlive(processorSettlements, orgId),
        eq(processorSettlements.id, settlementId)
      )
    )
    .limit(1);
  return row ?? null;
}

/** Distinct processors this org has imported, for the register's filter. */
export async function listProcessors(orgId: string): Promise<string[]> {
  const rows = await db
    .selectDistinct({ processor: processorSettlements.processor })
    .from(processorSettlements)
    .where(and(...orgScopeAlive(processorSettlements, orgId)))
    .orderBy(processorSettlements.processor);
  return rows.map((r) => r.processor);
}

/**
 * Settlements with no bank deposit claimed yet — the matcher's work queue.
 *
 * Oldest period first: a processor pays out in order, so matching in the same
 * order keeps a later payout from stealing an earlier one's deposit when two
 * happen to share an amount.
 */
export async function getUnreconciledSettlements(
  orgId: string,
  options: { processor?: string; limit?: number } = {},
  tx?: DbConnection
) {
  const conn = tx ?? db;
  const conditions: SQL[] = [
    ...orgScopeAlive(processorSettlements, orgId),
    isNull(processorSettlements.bankTransactionId),
  ];
  if (options.processor) {
    conditions.push(eq(processorSettlements.processor, options.processor));
  }

  return conn
    .select({
      id: processorSettlements.id,
      processor: processorSettlements.processor,
      externalId: processorSettlements.externalId,
      periodEnd: processorSettlements.periodEnd,
      netPayout: processorSettlements.netPayout,
      establishmentId: processorSettlements.establishmentId,
    })
    .from(processorSettlements)
    .where(and(...conditions))
    .orderBy(
      asc(processorSettlements.periodEnd),
      asc(processorSettlements.createdAt)
    )
    .limit(options.limit ?? 200);
}

/**
 * The payout match queue: every settlement the matcher has an opinion about,
 * with the deposit it picked.
 *
 * Suggested matches come first — those are the ones with a decision waiting —
 * then confirmed matches, then payouts still looking for a deposit.
 */
export async function listPayoutQueue(orgId: string, limit = 100) {
  return db
    .select({
      id: processorSettlements.id,
      processor: processorSettlements.processor,
      externalId: processorSettlements.externalId,
      periodEnd: processorSettlements.periodEnd,
      grossAmount: processorSettlements.grossAmount,
      netPayout: processorSettlements.netPayout,
      reconciliationStatus: processorSettlements.reconciliationStatus,
      reconciliationDiscrepancy: processorSettlements.reconciliationDiscrepancy,
      matchConfidence: processorSettlements.matchConfidence,
      matchMetadata: processorSettlements.matchMetadata,
      transactionId: transactions.id,
      transactionDate: transactions.date,
      transactionAmount: transactions.amount,
      transactionDescription: transactions.description,
      transactionCounterparty: transactions.counterparty,
    })
    .from(processorSettlements)
    .leftJoin(
      transactions,
      eq(processorSettlements.bankTransactionId, transactions.id)
    )
    .where(and(...orgScopeAlive(processorSettlements, orgId)))
    .orderBy(
      // "suggested" sorts before "matched" and "unreconciled" by intent, not
      // alphabet, so the rows needing a decision are never below settled ones.
      sql`case ${processorSettlements.reconciliationStatus}
            when 'suggested' then 0
            when 'unreconciled' then 1
            else 2 end`,
      desc(processorSettlements.periodEnd)
    )
    .limit(limit);
}

export interface SettlementMatchStats {
  total: number;
  matched: number;
  suggested: number;
  unreconciled: number;
  /** Share of settlements with a deposit claimed, 0-100. */
  matchRate: number;
}

/**
 * Settlement match rate, kept separate from the document match-rate metrics on
 * the insights dashboard. Blending the two would make one headline number mean
 * two different things.
 */
export async function getSettlementMatchStats(
  orgId: string
): Promise<SettlementMatchStats> {
  const rows = await db
    .select({
      status: processorSettlements.reconciliationStatus,
      count: sql<number>`count(*)::int`,
    })
    .from(processorSettlements)
    .where(and(...orgScopeAlive(processorSettlements, orgId)))
    .groupBy(processorSettlements.reconciliationStatus);

  const byStatus = new Map(rows.map((r) => [r.status, r.count]));
  const matched = byStatus.get("matched") ?? 0;
  const suggested = byStatus.get("suggested") ?? 0;
  const unreconciled = byStatus.get("unreconciled") ?? 0;
  const total = rows.reduce((sum, r) => sum + r.count, 0);

  return {
    total,
    matched,
    suggested,
    unreconciled,
    matchRate: total === 0 ? 0 : Math.round(((matched + suggested) / total) * 100),
  };
}

// ---------------------------------------------------------------------------
// Match writers
// ---------------------------------------------------------------------------

/**
 * Record that a bank deposit explains a settlement.
 *
 * Idempotent, and safe to re-run over an already-matched settlement: the WHERE
 * clause only claims a settlement whose `bank_transaction_id` is still null, so
 * a retried Inngest step cannot move a payout a human has since re-pointed.
 * Returns false when nothing was claimed.
 *
 * The deposit's own `reconciliation_status` is recomputed rather than set, so
 * this agrees with document matches on the same transaction instead of
 * overwriting them.
 */
export async function linkSettlementToTransaction(
  input: LinkSettlementInput,
  tx?: DbConnection
): Promise<boolean> {
  const run = async (conn: DbConnection) => {
    const claimed = await conn
      .update(processorSettlements)
      .set({
        bankTransactionId: input.transactionId,
        reconciliationStatus: input.status,
        reconciliationDiscrepancy: input.discrepancy ?? null,
        matchConfidence: input.confidence,
        matchMetadata: input.metadata,
        matchedAt: sql`now()`,
        updatedAt: sql`now()`,
      })
      .where(
        and(
          ...orgScopeAlive(processorSettlements, input.orgId),
          eq(processorSettlements.id, input.settlementId),
          isNull(processorSettlements.bankTransactionId)
        )
      )
      .returning({ id: processorSettlements.id });

    if (claimed.length === 0) return false;

    await auditMutation(
      {
        orgId: input.orgId,
        entityType: "processor_settlement",
        entityId: input.settlementId,
        action: "update",
        newValue: {
          bankTransactionId: input.transactionId,
          reconciliationStatus: input.status,
          matchConfidence: input.confidence,
          matchMetadata: input.metadata,
          reconciliationDiscrepancy: input.discrepancy ?? null,
        },
        actorId: input.actorId,
      },
      conn
    );

    await recomputeTransactionStatus(input.orgId, input.transactionId, conn);
    return true;
  };

  return tx ? run(tx) : db.transaction(run);
}

/**
 * Confirm a suggested match. Only the status moves — the deposit was already
 * claimed when the suggestion was written, so nothing about the transaction
 * needs recomputing.
 */
export async function confirmSettlementMatch(
  orgId: string,
  settlementId: string,
  actorId?: string
): Promise<boolean> {
  const confirmed = await db
    .update(processorSettlements)
    .set({ reconciliationStatus: "matched", updatedAt: sql`now()` })
    .where(
      and(
        ...orgScopeAlive(processorSettlements, orgId),
        eq(processorSettlements.id, settlementId),
        eq(processorSettlements.reconciliationStatus, "suggested")
      )
    )
    .returning({ id: processorSettlements.id });

  if (confirmed.length === 0) return false;

  await auditMutation({
    orgId,
    entityType: "processor_settlement",
    entityId: settlementId,
    action: "update",
    newValue: { reconciliationStatus: "matched" },
    actorId,
  });
  return true;
}

/**
 * Release a settlement's claim on a deposit — a rejected suggestion, or a
 * correction.
 *
 * The transaction's status is recomputed afterwards, which is what returns the
 * deposit to the document matcher's candidate pool. Skipping that would leave
 * it marked `matched` with nothing explaining it.
 */
export async function unlinkSettlement(
  orgId: string,
  settlementId: string,
  actorId?: string
): Promise<boolean> {
  return db.transaction(async (tx) => {
    // RETURNING gives the row *after* the update, so the deposit being released
    // has to be read before it is cleared — otherwise there is nothing left to
    // recompute against.
    const [prior] = await tx
      .select({ bankTransactionId: processorSettlements.bankTransactionId })
      .from(processorSettlements)
      .where(
        and(
          ...orgScopeAlive(processorSettlements, orgId),
          eq(processorSettlements.id, settlementId)
        )
      )
      .limit(1);

    if (!prior) return false;
    const priorTransactionId = prior.bankTransactionId;

    await tx
      .update(processorSettlements)
      .set({
        bankTransactionId: null,
        reconciliationStatus: "unreconciled",
        reconciliationDiscrepancy: null,
        matchConfidence: null,
        matchMetadata: null,
        matchedAt: null,
        updatedAt: sql`now()`,
      })
      .where(
        and(
          ...orgScopeAlive(processorSettlements, orgId),
          eq(processorSettlements.id, settlementId)
        )
      );

    await auditMutation(
      {
        orgId,
        entityType: "processor_settlement",
        entityId: settlementId,
        action: "update",
        oldValue: { bankTransactionId: priorTransactionId },
        newValue: { bankTransactionId: null, reconciliationStatus: "unreconciled" },
        actorId,
      },
      tx
    );

    if (priorTransactionId) {
      await recomputeTransactionStatus(orgId, priorTransactionId, tx);
    }
    return true;
  });
}

// ---------------------------------------------------------------------------
// Remembered column mappings
// ---------------------------------------------------------------------------

/**
 * The mapping this org last used for a processor, or null if it has never
 * imported one.
 *
 * Returns the stored value only when every column it names is present in
 * `availableColumns`. A processor that changes its export format would
 * otherwise hand the owner a mapping that silently matches nothing; a null
 * here means "ask again", which is the honest outcome.
 */
export async function getSettlementMapping(
  orgId: string,
  processor: string,
  availableColumns?: string[]
): Promise<SettlementColumnMapping | null> {
  const [row] = await db
    .select({ mapping: settlementImportMappings.mapping })
    .from(settlementImportMappings)
    .where(
      and(
        ...orgScopeAlive(settlementImportMappings, orgId),
        eq(settlementImportMappings.processor, processor)
      )
    )
    .limit(1);

  if (!row) return null;
  const mapping = row.mapping as SettlementColumnMapping;

  if (availableColumns) {
    const present = new Set(availableColumns);
    const named = Object.values(mapping).filter(
      (v): v is string => typeof v === "string"
    );
    if (!named.every((column) => present.has(column))) return null;
  }

  return mapping;
}

/** Remember a mapping for next time. One row per (org, processor). */
export async function saveSettlementMapping(
  orgId: string,
  processor: string,
  mapping: SettlementColumnMapping
): Promise<void> {
  await db
    .insert(settlementImportMappings)
    .values({ orgId, processor, mapping })
    .onConflictDoUpdate({
      target: [
        settlementImportMappings.orgId,
        settlementImportMappings.processor,
      ],
      set: { mapping, updatedAt: sql`now()` },
    });
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

/**
 * Insert or update settlements from one import.
 *
 * Idempotent by construction: `(org_id, processor, external_id)` is unique, so
 * re-importing an overlapping file updates in place rather than duplicating.
 * No dedup logic needed.
 *
 * Two things the conflict path must get right:
 *
 * 1. A re-import must not silently un-match a settlement, so `bank_transaction_id`
 *    and `reconciliation_status` are carried forward, not overwritten with the
 *    insert's defaults.
 * 2. But a match asserts "this deposit equals this net payout". If a corrected
 *    file changes `net_payout`, that assertion is no longer verified, so the
 *    match is dropped and the settlement returns to `unreconciled` for the
 *    matcher to re-decide. The affected external IDs come back in the result so
 *    the caller can tell the owner rather than letting it happen invisibly.
 *
 * Callers must have validated `gross - fee - feeVat = net` already — that is the
 * parser's job (see settlement-csv.ts) and a row that fails it never gets here.
 */
export async function importSettlements(
  input: ImportSettlementsInput
): Promise<ImportSettlementsResult> {
  const { orgId, processor, settlements, establishmentId, actorId } = input;

  if (settlements.length === 0) {
    return { created: 0, updated: 0, matchesInvalidated: [] };
  }

  return db.transaction(async (tx) => {
    const externalIds = settlements.map((s) => s.externalId);

    // Read the existing rows first so we can report create-vs-update honestly
    // and detect which live matches this import invalidates.
    const existing = await tx
      .select({
        externalId: processorSettlements.externalId,
        netPayout: processorSettlements.netPayout,
        bankTransactionId: processorSettlements.bankTransactionId,
      })
      .from(processorSettlements)
      .where(
        and(
          ...orgScopeAlive(processorSettlements, orgId),
          eq(processorSettlements.processor, processor),
          inArray(processorSettlements.externalId, externalIds)
        )
      );

    const existingByExternalId = new Map(existing.map((r) => [r.externalId, r]));

    const matchesInvalidated = settlements
      .filter((s) => {
        const prior = existingByExternalId.get(s.externalId);
        return (
          prior != null &&
          prior.bankTransactionId != null &&
          prior.netPayout !== s.netPayout
        );
      })
      .map((s) => s.externalId);

    const rows = settlements.map((s) => ({
      orgId,
      establishmentId: establishmentId ?? null,
      processor,
      externalId: s.externalId,
      periodStart: s.periodStart ? new Date(s.periodStart) : null,
      periodEnd: s.periodEnd ? new Date(s.periodEnd) : null,
      grossAmount: s.grossAmount,
      feeAmount: s.feeAmount,
      feeVatAmount: s.feeVatAmount ?? null,
      netPayout: s.netPayout,
    }));

    // In ON CONFLICT DO UPDATE, a bare column reference is the stored row and
    // `excluded` is the row we tried to insert.
    const keepMatchUnlessNetChanged = (column: SQL) =>
      sql`case when ${processorSettlements.netPayout} = excluded.net_payout then ${column} else null end`;

    await tx
      .insert(processorSettlements)
      .values(rows)
      .onConflictDoUpdate({
        target: [
          processorSettlements.orgId,
          processorSettlements.processor,
          processorSettlements.externalId,
        ],
        set: {
          establishmentId: sql`excluded.establishment_id`,
          periodStart: sql`excluded.period_start`,
          periodEnd: sql`excluded.period_end`,
          grossAmount: sql`excluded.gross_amount`,
          feeAmount: sql`excluded.fee_amount`,
          feeVatAmount: sql`excluded.fee_vat_amount`,
          bankTransactionId: keepMatchUnlessNetChanged(
            sql`${processorSettlements.bankTransactionId}`
          ),
          reconciliationStatus: sql`case when ${processorSettlements.netPayout} = excluded.net_payout then ${processorSettlements.reconciliationStatus} else 'unreconciled' end`,
          reconciliationDiscrepancy: keepMatchUnlessNetChanged(
            sql`${processorSettlements.reconciliationDiscrepancy}`
          ),
          // Safe alongside the CASE expressions above: every expression in a
          // SET clause evaluates against the stored row, so they compare the
          // old net payout no matter where this assignment sits.
          netPayout: sql`excluded.net_payout`,
          updatedAt: sql`now()`,
        },
      });

    const stored = await tx
      .select({
        id: processorSettlements.id,
        externalId: processorSettlements.externalId,
      })
      .from(processorSettlements)
      .where(
        and(
          ...orgScopeAlive(processorSettlements, orgId),
          eq(processorSettlements.processor, processor),
          inArray(processorSettlements.externalId, externalIds)
        )
      );

    const settlementByExternalId = new Map(settlements.map((s) => [s.externalId, s]));

    for (const row of stored) {
      const parsed = settlementByExternalId.get(row.externalId);
      if (!parsed) continue;
      const wasExisting = existingByExternalId.has(row.externalId);
      await auditMutation(
        {
          orgId,
          entityType: "processor_settlement",
          entityId: row.id,
          action: wasExisting ? "update" : "create",
          newValue: {
            processor,
            externalId: parsed.externalId,
            grossAmount: parsed.grossAmount,
            feeAmount: parsed.feeAmount,
            feeVatAmount: parsed.feeVatAmount ?? null,
            netPayout: parsed.netPayout,
          },
          actorId,
        },
        tx
      );
    }

    const updated = settlements.filter((s) =>
      existingByExternalId.has(s.externalId)
    ).length;

    return {
      created: settlements.length - updated,
      updated,
      matchesInvalidated,
    };
  });
}
