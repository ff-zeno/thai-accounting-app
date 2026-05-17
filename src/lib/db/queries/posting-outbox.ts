import { and, asc, desc, eq, inArray, isNull, notInArray, sql } from "drizzle-orm";
import { db, type DbConnection } from "../index";
import {
  glAccounts,
  auditLog,
  journalEntries,
  periodLocks,
  postingExceptions,
  postingOutbox,
  whtCreditsReceived,
} from "../schema";
import { orgScope } from "../helpers/org-scope";
import {
  createJournalEntryWithConnection,
  postImportBrokerChargeDocumentJournalEntry,
  postImportPaymentJournalEntry,
  postCashDepositJournalEntry,
  postCitAccrualJournalEntry,
  postCitPaymentJournalEntry,
  postPosSaleTransactionJournalEntry,
  postProcessorSettlementJournalEntry,
  postTaxPaymentEventJournalEntry,
  seedStandardGlAccounts,
  type JournalEntryLineInput,
} from "./general-ledger";
import { assertPostingKindForOutboxEvent } from "@/lib/gl/posting-kind-dispatch";

function payloadString(payload: unknown, key: string) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const value = (payload as Record<string, unknown>)[key];
  return typeof value === "string" ? value : null;
}

function paymentDateForOutboxRow(row: typeof postingOutbox.$inferSelect) {
  const paymentDate = row.postingDate ?? payloadString(row.payload, "paymentDate");
  if (!paymentDate || !/^\d{4}-\d{2}-\d{2}$/.test(paymentDate)) {
    throw new Error("Posting outbox row requires a valid paymentDate");
  }
  return paymentDate;
}

function paidAtForOutboxRow(row: typeof postingOutbox.$inferSelect) {
  const paidAt = payloadString(row.payload, "paidAt");
  if (paidAt) {
    const parsed = new Date(paidAt);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date(`${paymentDateForOutboxRow(row)}T12:00:00+07:00`);
}

function createdByForOutboxRow(row: typeof postingOutbox.$inferSelect) {
  return payloadString(row.payload, "createdByUserId") ?? undefined;
}

function postingDatePeriod(postingDate?: string | null) {
  if (!postingDate || !/^\d{4}-\d{2}-\d{2}$/.test(postingDate)) return null;
  const [year, month, day] = postingDate.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }
  return { year, month };
}

export async function lockGlPostingPeriod(
  conn: DbConnection,
  orgId: string,
  periodYear: number,
  periodMonth: number
) {
  await conn.execute(
    sql`SELECT pg_advisory_xact_lock(hashtext(${`gl-posting-period:${orgId}:${periodYear}:${periodMonth}`}))`
  );
}

async function lockGlPostingPeriodForDate(
  conn: DbConnection,
  orgId: string,
  postingDate?: string | null
) {
  const period = postingDatePeriod(postingDate);
  if (!period) return;
  await lockGlPostingPeriod(conn, orgId, period.year, period.month);
}

export async function assertPostingDateOpenForGl(
  conn: DbConnection,
  orgId: string,
  postingDate?: string | null
) {
  const period = postingDatePeriod(postingDate);
  if (!period) return;
  const [lock] = await conn
    .select({ id: periodLocks.id })
    .from(periodLocks)
    .where(
      and(
        eq(periodLocks.orgId, orgId),
        eq(periodLocks.domain, "gl"),
        eq(periodLocks.periodYear, period.year),
        eq(periodLocks.periodMonth, period.month),
        isNull(periodLocks.unlockedAt)
      )
    )
    .limit(1);
  if (lock) {
    throw new Error("Posting outbox row cannot be enqueued into a locked GL period");
  }
}

export async function enqueuePostingOutbox(data: {
  orgId: string;
  sourceEntityType: string;
  sourceEntityId: string;
  eventType: string;
  postingDate?: string | null;
  payload?: Record<string, unknown> | null;
  tx?: DbConnection;
}): Promise<typeof postingOutbox.$inferSelect> {
  if (!data.tx) {
    return db.transaction((tx) =>
      enqueuePostingOutbox({ ...data, tx: tx as DbConnection })
    );
  }
  const conn = data.tx ?? db;
  await lockGlPostingPeriodForDate(conn, data.orgId, data.postingDate);
  await assertPostingDateOpenForGl(conn, data.orgId, data.postingDate);
  const [row] = await conn
    .insert(postingOutbox)
    .values({
      orgId: data.orgId,
      sourceEntityType: data.sourceEntityType,
      sourceEntityId: data.sourceEntityId,
      eventType: data.eventType,
      postingDate: data.postingDate ?? null,
      payload: data.payload ?? null,
      postingStatus: "pending",
    })
    .onConflictDoUpdate({
      target: [
        postingOutbox.orgId,
        postingOutbox.sourceEntityType,
        postingOutbox.sourceEntityId,
        postingOutbox.eventType,
      ],
      set: {
        payload: data.payload ?? null,
        postingDate: data.postingDate ?? null,
        postingStatus: "pending",
        postingAttempts: 0,
        lastAttemptAt: null,
        lastError: null,
        journalEntryId: null,
        updatedAt: sql`now()`,
      },
      setWhere: sql`${postingOutbox.postingStatus} <> 'posted'`,
    })
    .returning();
  if (row) return row;

  const [existing] = await conn
    .select()
    .from(postingOutbox)
    .where(
      and(
        eq(postingOutbox.orgId, data.orgId),
        eq(postingOutbox.sourceEntityType, data.sourceEntityType),
        eq(postingOutbox.sourceEntityId, data.sourceEntityId),
        eq(postingOutbox.eventType, data.eventType)
      )
    )
    .limit(1);
  if (!existing) throw new Error("Posting outbox row could not be enqueued");
  return existing;
}

async function accountByCode(tx: DbConnection, orgId: string, accountCode: string) {
  const [account] = await tx
    .select()
    .from(glAccounts)
    .where(and(...orgScope(glAccounts, orgId), eq(glAccounts.accountCode, accountCode)))
    .limit(1);
  if (!account) throw new Error(`GL account ${accountCode} is not configured`);
  return account;
}

async function postWhtCreditReceived(data: {
  tx: DbConnection;
  orgId: string;
  creditId: string;
}) {
  await seedStandardGlAccounts(data.orgId, data.tx);
  const [existing] = await data.tx
    .select()
    .from(journalEntries)
    .where(
      and(
        eq(journalEntries.orgId, data.orgId),
        eq(journalEntries.sourceEntityType, "wht_credits_received"),
        eq(journalEntries.sourceEntityId, data.creditId),
        eq(journalEntries.postingKind, "wht_credit_received")
      )
    )
    .limit(1);
  if (existing) return existing;

  const [credit] = await data.tx
    .select()
    .from(whtCreditsReceived)
    .where(and(...orgScope(whtCreditsReceived, data.orgId), eq(whtCreditsReceived.id, data.creditId)))
    .limit(1);
  if (!credit) throw new Error("WHT credit received not found");

  const prepaidWht = await accountByCode(data.tx, data.orgId, "1180");
  const tradeReceivable = await accountByCode(data.tx, data.orgId, "1140");
  const lines: JournalEntryLineInput[] = [
    {
      accountId: prepaidWht.id,
      description: "Recognize WHT credit received from customer",
      debitAmount: credit.whtAmount,
      subledgerEntityType: "wht_credits_received",
      subledgerEntityId: credit.id,
    },
    {
      accountId: tradeReceivable.id,
      description: "Apply WHT credit against trade receivable",
      creditAmount: credit.whtAmount,
      subledgerEntityType: "wht_credits_received",
      subledgerEntityId: credit.id,
    },
  ];

  return createJournalEntryWithConnection(
    {
      orgId: data.orgId,
      entryNumber: `WHTC-${credit.paymentDate}-${credit.id.slice(0, 8)}`,
      entryDate: credit.paymentDate,
      entryType: "auto_document",
      postingKind: "wht_credit_received",
      sourceEntityType: "wht_credits_received",
      sourceEntityId: credit.id,
      description: `WHT credit received ${credit.certificateNo ?? credit.id}`,
      lines,
    },
    data.tx
  );
}

function classifyPostingFailure(message: string) {
  if (/not configured|account/i.test(message)) return "unmapped_account";
  if (/not found|No posting handler|invalid source/i.test(message)) return "invalid_source";
  return "db_error";
}

export async function processPostingOutboxRow(data: {
  orgId: string;
  postingOutboxId: string;
  tx?: DbConnection;
}) {
  const processInTransaction = async (tx: DbConnection) => {
    const [row] = await tx
      .select()
      .from(postingOutbox)
      .where(and(eq(postingOutbox.orgId, data.orgId), eq(postingOutbox.id, data.postingOutboxId)))
      .limit(1)
      .for("update");
    if (!row) throw new Error("Posting outbox row not found");
    if (row.postingStatus === "posted") return row;

    const assertExpectedPostingKind = (entry: typeof journalEntries.$inferSelect) => {
      assertPostingKindForOutboxEvent({
        sourceEntityType: row.sourceEntityType,
        eventType: row.eventType,
        postingKind: entry.postingKind,
      });
      return entry;
    };

    let entry: typeof journalEntries.$inferSelect;
    if (
      row.sourceEntityType === "wht_credits_received" &&
      row.eventType === "create"
    ) {
      entry = await postWhtCreditReceived({
        tx,
        orgId: data.orgId,
        creditId: row.sourceEntityId,
      });
    } else if (
      row.sourceEntityType === "tax_payment_events" &&
      row.eventType === "payment"
    ) {
      entry = await postTaxPaymentEventJournalEntry({
        tx,
        orgId: data.orgId,
        taxPaymentEventId: row.sourceEntityId,
      });
    } else if (
      row.sourceEntityType === "cash_deposits" &&
      row.eventType === "create"
    ) {
      entry = await postCashDepositJournalEntry({
        tx,
        orgId: data.orgId,
        cashDepositId: row.sourceEntityId,
      });
    } else if (
      row.sourceEntityType === "sales_transactions" &&
      row.eventType === "create"
    ) {
      entry = await postPosSaleTransactionJournalEntry({
        tx,
        orgId: data.orgId,
        posSaleId: row.sourceEntityId,
      });
    } else if (
      row.sourceEntityType === "processor_settlements" &&
      row.eventType === "create"
    ) {
      entry = await postProcessorSettlementJournalEntry({
        tx,
        orgId: data.orgId,
        processorSettlementId: row.sourceEntityId,
      });
    } else if (
      row.sourceEntityType === "import_payments" &&
      row.eventType === "create"
    ) {
      entry = await postImportPaymentJournalEntry({
        tx,
        orgId: data.orgId,
        paymentId: row.sourceEntityId,
      });
    } else if (
      row.sourceEntityType === "import_charge_documents" &&
      row.eventType === "create"
    ) {
      const importId = payloadString(row.payload, "importId");
      if (!importId) throw new Error("Import charge outbox row requires importId");
      const posted = await postImportBrokerChargeDocumentJournalEntry({
        tx,
        orgId: data.orgId,
        importId,
        sourceDocumentId: row.sourceEntityId,
        entryDate: row.postingDate ?? paymentDateForOutboxRow(row),
      });
      if (!posted) throw new Error("Import charge document has no postable lines");
      entry = posted;
    } else if (
      row.sourceEntityType === "inventory_movements" &&
      row.eventType === "post_gl"
    ) {
      const { postInventoryMovementJournalEntry } = await import("./inventory");
      entry = await postInventoryMovementJournalEntry(tx, {
        orgId: data.orgId,
        movementId: row.sourceEntityId,
      });
    } else if (
      row.sourceEntityType === "cit_filings" &&
      row.eventType === "accrual"
    ) {
      entry = await postCitAccrualJournalEntry({
        tx,
        orgId: data.orgId,
        citFilingId: row.sourceEntityId,
        createdByUserId: createdByForOutboxRow(row),
        enqueueOutbox: false,
      });
    } else if (
      row.sourceEntityType === "cit_filings" &&
      row.eventType === "payment"
    ) {
      entry = await postCitPaymentJournalEntry({
        tx,
        orgId: data.orgId,
        citFilingId: row.sourceEntityId,
        paidAt: paidAtForOutboxRow(row),
        bankAccountCode: payloadString(row.payload, "bankAccountCode") ?? undefined,
        createdByUserId: createdByForOutboxRow(row),
        enqueueOutbox: false,
      });
    } else if (
      row.sourceEntityType === "pay_run" &&
      row.eventType === "payment"
    ) {
      const { postPayrollNetPaymentJournalEntry } = await import("./payroll");
      entry = await postPayrollNetPaymentJournalEntry(tx, {
        orgId: data.orgId,
        payRunId: row.sourceEntityId,
        paymentDate: paymentDateForOutboxRow(row),
        createdByUserId: createdByForOutboxRow(row),
      });
    } else if (
      row.sourceEntityType === "pnd_filing" &&
      row.eventType === "payment"
    ) {
      const { postPnd1RemittanceJournalEntry } = await import("./payroll");
      entry = await postPnd1RemittanceJournalEntry(tx, {
        orgId: data.orgId,
        filingId: row.sourceEntityId,
        paymentDate: paymentDateForOutboxRow(row),
        createdByUserId: createdByForOutboxRow(row),
      });
    } else if (
      row.sourceEntityType === "sso_filing" &&
      row.eventType === "payment"
    ) {
      const { postSsoRemittanceJournalEntry } = await import("./payroll");
      entry = await postSsoRemittanceJournalEntry(tx, {
        orgId: data.orgId,
        filingId: row.sourceEntityId,
        paymentDate: paymentDateForOutboxRow(row),
        createdByUserId: createdByForOutboxRow(row),
      });
    } else if (
      row.sourceEntityType === "fixed_asset_depreciation_period" &&
      row.eventType === "post"
    ) {
      const { postDepreciationOutboxPeriod } = await import("./fixed-assets");
      entry = await postDepreciationOutboxPeriod({
        tx,
        orgId: data.orgId,
        periodId: row.sourceEntityId,
      });
    } else {
      throw new Error(
        `No posting handler for ${row.sourceEntityType}:${row.eventType}`
      );
    }
    assertExpectedPostingKind(entry);

    const [posted] = await tx
      .update(postingOutbox)
      .set({
        postingStatus: "posted",
        postingAttempts: row.postingAttempts + 1,
        lastAttemptAt: new Date(),
        lastError: null,
        journalEntryId: entry.id,
      })
      .where(eq(postingOutbox.id, row.id))
      .returning();
    await tx.insert(auditLog).values({
      orgId: posted.orgId,
      entityType: "posting_outbox",
      entityId: posted.id,
      action: "update",
      newValue: {
        postingStatus: "posted",
        journalEntryId: entry.id,
        sourceEntityType: row.sourceEntityType,
        sourceEntityId: row.sourceEntityId,
      },
    });
    await tx
      .update(postingExceptions)
      .set({
        resolvedAt: new Date(),
        resolution: "posted_on_retry",
        updatedAt: sql`now()`,
      })
      .where(
        and(
          eq(postingExceptions.orgId, row.orgId),
          eq(postingExceptions.postingOutboxId, row.id),
          isNull(postingExceptions.resolvedAt)
        )
      );
    return posted;
  };

  const recordFailure = async (error: unknown) =>
    db.transaction(async (tx) => {
      const [row] = await tx
        .select()
        .from(postingOutbox)
        .where(and(eq(postingOutbox.orgId, data.orgId), eq(postingOutbox.id, data.postingOutboxId)))
        .limit(1)
        .for("update");
      if (!row) throw error;
      if (row.postingStatus === "posted") return row;
      const message = error instanceof Error ? error.message : "unknown posting error";
      const [failed] = await tx
        .update(postingOutbox)
        .set({
          postingStatus: sql`CASE WHEN ${postingOutbox.postingAttempts} + 1 >= 3 THEN 'failed' ELSE 'retrying' END`,
          postingAttempts: sql`${postingOutbox.postingAttempts} + 1`,
          lastAttemptAt: new Date(),
          lastError: message,
        })
        .where(eq(postingOutbox.id, row.id))
        .returning();
      if (failed.postingStatus === "failed") {
        const failureClass = classifyPostingFailure(message);
        const [updatedException] = await tx
          .update(postingExceptions)
          .set({
            failureClass,
            message,
            updatedAt: sql`now()`,
          })
          .where(
            and(
              eq(postingExceptions.orgId, row.orgId),
              eq(postingExceptions.postingOutboxId, row.id),
              isNull(postingExceptions.resolvedAt)
            )
          )
          .returning();
        if (!updatedException) {
          await tx.insert(postingExceptions).values({
            orgId: row.orgId,
            postingOutboxId: row.id,
            sourceEntityType: row.sourceEntityType,
            sourceEntityId: row.sourceEntityId,
            failureClass,
            message,
          });
        }
      }
      await tx.insert(auditLog).values({
        orgId: failed.orgId,
        entityType: "posting_outbox",
        entityId: failed.id,
        action: "update",
        newValue: {
          postingStatus: failed.postingStatus,
          postingAttempts: failed.postingAttempts,
          message,
        },
      });
      return failed;
    });

  if (data.tx) return processInTransaction(data.tx);
  try {
    return await db.transaction((tx) => processInTransaction(tx as DbConnection));
  } catch (error) {
    return recordFailure(error);
  }
}

export async function listPendingPostingOutboxRows(data: {
  orgId: string;
  throughDate?: string;
  limit?: number;
  excludeIds?: string[];
  tx?: DbConnection;
}) {
  const conn = data.tx ?? db;
  const conditions = [
    eq(postingOutbox.orgId, data.orgId),
    inArray(postingOutbox.postingStatus, ["pending", "retrying"]),
  ];
  if (data.throughDate) {
    conditions.push(
      sql`COALESCE(${postingOutbox.postingDate}::text, ${postingOutbox.payload}->>'paymentDate', (${postingOutbox.createdAt} AT TIME ZONE 'Asia/Bangkok')::date::text) <= ${data.throughDate}`
    );
  }
  if (data.excludeIds && data.excludeIds.length > 0) {
    conditions.push(notInArray(postingOutbox.id, data.excludeIds));
  }

  return conn
    .select()
    .from(postingOutbox)
    .where(and(...conditions))
    .orderBy(asc(postingOutbox.createdAt))
    .limit(data.limit ?? 50);
}

type PostingOutboxDrainResult = {
  processed: number;
  posted: number;
  retrying: number;
  failed: number;
};

class PostingOutboxDrainError extends Error {
  constructor(message: string, readonly result: PostingOutboxDrainResult) {
    super(message);
    this.name = "PostingOutboxDrainError";
  }
}

function outboxThroughDateCondition(throughDate?: string) {
  return throughDate
    ? sql`COALESCE(${postingOutbox.postingDate}::text, ${postingOutbox.payload}->>'paymentDate', (${postingOutbox.createdAt} AT TIME ZONE 'Asia/Bangkok')::date::text) <= ${throughDate}`
    : undefined;
}

function bangkokTodayDateString() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export async function listPostingOutboxOrgIdsWithPendingRows(data: {
  throughDate?: string;
  limit?: number;
}) {
  const throughDateCondition = outboxThroughDateCondition(data.throughDate);
  const limit = Math.min(Math.max(data.limit ?? 25, 1), 100);
  const rows = await db
    .selectDistinct({ orgId: postingOutbox.orgId })
    .from(postingOutbox)
    .where(
      and(
        inArray(postingOutbox.postingStatus, ["pending", "retrying"]),
        ...(throughDateCondition ? [throughDateCondition] : [])
      )
    )
    .orderBy(asc(postingOutbox.orgId))
    .limit(limit + 1);

  return {
    orgIds: rows.slice(0, limit).map((row) => row.orgId),
    truncated: rows.length > limit,
  };
}

export async function drainPostingOutbox(data: {
  orgId: string;
  throughDate: string;
  chunkSize?: number;
  maxChunks?: number;
  failOnRetrying?: boolean;
}) {
  const chunkSize = data.chunkSize ?? 50;
  const maxChunks = data.maxChunks ?? 100;
  let posted = 0;
  let retrying = 0;
  let failed = 0;
  let processed = 0;
  const currentResult = () => ({ processed, posted, retrying, failed });
  const attemptedRowIds = new Set<string>();

  let exhaustedChunkBudget = false;
  for (let chunk = 0; chunk < maxChunks; chunk += 1) {
    const rows = await listPendingPostingOutboxRows({
      orgId: data.orgId,
      throughDate: data.throughDate,
      limit: chunkSize,
      excludeIds: Array.from(attemptedRowIds),
    });
    if (rows.length === 0) break;

    for (const row of rows) {
      attemptedRowIds.add(row.id);
      const result = await processPostingOutboxRow({
        orgId: data.orgId,
        postingOutboxId: row.id,
      });
      processed += 1;
      if (result.postingStatus === "posted") posted += 1;
      if (result.postingStatus === "retrying") retrying += 1;
      if (result.postingStatus === "failed") failed += 1;
    }

    if (failed > 0) break;
    exhaustedChunkBudget = chunk === maxChunks - 1;
  }

  if (failed > 0) {
    throw new PostingOutboxDrainError(
      `Posting outbox drain failed for ${failed} row(s)`,
      currentResult()
    );
  }
  if (data.failOnRetrying !== false && retrying > 0) {
    throw new PostingOutboxDrainError(
      `Posting outbox drain blocked by ${retrying} retrying row(s)`,
      currentResult()
    );
  }

  const throughDateCondition = outboxThroughDateCondition(data.throughDate);
  const [blockingFailures] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(postingOutbox)
    .where(
      and(
        eq(postingOutbox.orgId, data.orgId),
        eq(postingOutbox.postingStatus, "failed"),
        ...(throughDateCondition ? [throughDateCondition] : [])
      )
    );
  if ((blockingFailures?.count ?? 0) > 0) {
    throw new PostingOutboxDrainError(
      `Posting outbox drain blocked by ${blockingFailures.count} failed row(s)`,
      currentResult()
    );
  }

  const [openExceptions] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(postingExceptions)
    .innerJoin(postingOutbox, eq(postingExceptions.postingOutboxId, postingOutbox.id))
    .where(
      and(
        eq(postingExceptions.orgId, data.orgId),
        isNull(postingExceptions.resolvedAt),
        ...(throughDateCondition ? [throughDateCondition] : [])
      )
    );
  if ((openExceptions?.count ?? 0) > 0) {
    throw new PostingOutboxDrainError(
      `Posting outbox drain blocked by ${openExceptions.count} open exception(s)`,
      currentResult()
    );
  }

  if (exhaustedChunkBudget) {
    const remaining = await listPendingPostingOutboxRows({
      orgId: data.orgId,
      throughDate: data.throughDate,
      limit: 1,
    });
    if (remaining.length > 0) {
      throw new PostingOutboxDrainError(
        "Posting outbox drain stopped before the period queue was empty",
        currentResult()
      );
    }
  }

  if (data.failOnRetrying !== false) {
    const [blockingIncomplete] = await db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(postingOutbox)
      .where(
        and(
          eq(postingOutbox.orgId, data.orgId),
          inArray(postingOutbox.postingStatus, ["pending", "retrying"]),
          ...(throughDateCondition ? [throughDateCondition] : [])
        )
      );
    if ((blockingIncomplete?.count ?? 0) > 0) {
      throw new PostingOutboxDrainError(
        `Posting outbox drain blocked by ${blockingIncomplete.count} incomplete row(s)`,
        currentResult()
      );
    }
  }

  return currentResult();
}

export async function processPostingOutboxCronBatch(data: {
  throughDate?: string;
  orgLimit?: number;
  chunkSize?: number;
  maxChunksPerOrg?: number;
} = {}) {
  const throughDate = data.throughDate ?? bangkokTodayDateString();
  const pendingOrgs = await listPostingOutboxOrgIdsWithPendingRows({
    throughDate,
    limit: data.orgLimit ?? 25,
  });
  const orgIds = pendingOrgs.orgIds;
  const orgResults: Array<{
    orgId: string;
    status: "drained" | "failed";
    processed: number;
    posted: number;
    retrying: number;
    failed: number;
    error?: string;
  }> = [];

  for (const orgId of orgIds) {
    try {
      const result = await drainPostingOutbox({
        orgId,
        throughDate,
        chunkSize: data.chunkSize ?? 50,
        maxChunks: data.maxChunksPerOrg ?? 20,
        failOnRetrying: false,
      });
      orgResults.push({ orgId, status: "drained", ...result });
    } catch (error) {
      const partial =
        error instanceof PostingOutboxDrainError
          ? error.result
          : { processed: 0, posted: 0, retrying: 0, failed: 1 };
      orgResults.push({
        orgId,
        status: "failed",
        ...partial,
        failed: Math.max(partial.failed, 1),
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    throughDate,
    orgsScanned: orgIds.length,
    orgQueueTruncated: pendingOrgs.truncated,
    processed: orgResults.reduce((sum, row) => sum + row.processed, 0),
    posted: orgResults.reduce((sum, row) => sum + row.posted, 0),
    retrying: orgResults.reduce((sum, row) => sum + row.retrying, 0),
    failed: orgResults.reduce((sum, row) => sum + row.failed, 0),
    orgResults,
  };
}

export async function getPostingOutboxDashboard(
  orgId: string,
  limit: number = 25,
  throughDate?: string
) {
  const throughDateCondition = outboxThroughDateCondition(throughDate);
  const outboxConditions = [
    eq(postingOutbox.orgId, orgId),
    ...(throughDateCondition ? [throughDateCondition] : []),
  ];
  const [summary] = await db
    .select({
      pending: sql<number>`COUNT(*) FILTER (WHERE ${postingOutbox.postingStatus} = 'pending')::int`,
      retrying: sql<number>`COUNT(*) FILTER (WHERE ${postingOutbox.postingStatus} = 'retrying')::int`,
      failed: sql<number>`COUNT(*) FILTER (WHERE ${postingOutbox.postingStatus} = 'failed')::int`,
      posted: sql<number>`COUNT(*) FILTER (WHERE ${postingOutbox.postingStatus} = 'posted')::int`,
    })
    .from(postingOutbox)
    .where(and(...outboxConditions));

  const rows = await db
    .select()
    .from(postingOutbox)
    .where(and(...outboxConditions))
    .orderBy(desc(postingOutbox.createdAt))
    .limit(Math.min(Math.max(limit, 1), 100));

  const exceptions = await db
    .select({
      id: postingExceptions.id,
      orgId: postingExceptions.orgId,
      postingOutboxId: postingExceptions.postingOutboxId,
      sourceEntityType: postingExceptions.sourceEntityType,
      sourceEntityId: postingExceptions.sourceEntityId,
      failureClass: postingExceptions.failureClass,
      message: postingExceptions.message,
      resolvedAt: postingExceptions.resolvedAt,
      resolution: postingExceptions.resolution,
      createdAt: postingExceptions.createdAt,
      updatedAt: postingExceptions.updatedAt,
    })
    .from(postingExceptions)
    .innerJoin(
      postingOutbox,
      and(
        eq(postingOutbox.id, postingExceptions.postingOutboxId),
        eq(postingOutbox.orgId, orgId),
        ...(throughDateCondition ? [throughDateCondition] : [])
      )
    )
    .where(and(eq(postingExceptions.orgId, orgId), isNull(postingExceptions.resolvedAt)))
    .orderBy(desc(postingExceptions.createdAt))
    .limit(Math.min(Math.max(limit, 1), 100));

  return {
    summary: summary ?? { pending: 0, retrying: 0, failed: 0, posted: 0 },
    rows,
    exceptions,
  };
}
