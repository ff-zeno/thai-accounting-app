import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import * as schema from "@/lib/db/schema";
import {
  createTestBankAccount,
  createTestDb,
  createTestDocument,
  createTestOrg,
  createTestTransaction,
  migrateTestDb,
  resetTestDb,
} from "@/tests/db-test-utils";
import type { MatchMetadata } from "@/lib/reconciliation/matcher";

const { db: testDb, pool } = createTestDb();

let importSettlements: typeof import("./processor-settlements").importSettlements;
let getUnreconciledSettlements: typeof import("./processor-settlements").getUnreconciledSettlements;
let linkSettlementToTransaction: typeof import("./processor-settlements").linkSettlementToTransaction;
let unlinkSettlement: typeof import("./processor-settlements").unlinkSettlement;
let confirmSettlementMatch: typeof import("./processor-settlements").confirmSettlementMatch;
let getSettlementMatchStats: typeof import("./processor-settlements").getSettlementMatchStats;
let createMatch: typeof import("./reconciliation").createMatch;
let softDeleteMatch: typeof import("./reconciliation").softDeleteMatch;
let recomputeTransactionStatus: typeof import("./reconciliation").recomputeTransactionStatus;

beforeAll(async () => {
  await resetTestDb(pool);
  await migrateTestDb(pool);
  vi.doMock("../index", () => ({ db: testDb }));
  ({
    importSettlements,
    getUnreconciledSettlements,
    linkSettlementToTransaction,
    unlinkSettlement,
    confirmSettlementMatch,
    getSettlementMatchStats,
  } = await import("./processor-settlements"));
  ({ createMatch, softDeleteMatch, recomputeTransactionStatus } = await import(
    "./reconciliation"
  ));
});

afterAll(async () => {
  await resetTestDb(pool);
  await pool.end();
});

beforeEach(async () => {
  await testDb.execute(sql`
    TRUNCATE TABLE
      processor_settlements,
      settlement_import_mappings,
      reconciliation_matches,
      transactions,
      bank_accounts,
      documents,
      audit_log,
      organizations
    CASCADE
  `);
});

const METADATA: MatchMetadata = {
  layer: "exact",
  signals: { amount: { score: 1, detail: "net payout matches deposit exactly" } },
  candidateCount: 1,
  selectedRank: 0,
};

interface SettlementOverrides {
  externalId?: string;
  grossAmount?: string;
  feeAmount?: string;
  feeVatAmount?: string;
  netPayout?: string;
  periodStart?: string;
  periodEnd?: string;
}

/** gross − fee − feeVat = net, the invariant the parser enforces before import. */
function settlement(overrides: SettlementOverrides = {}) {
  return {
    externalId: overrides.externalId ?? "STL-001",
    grossAmount: overrides.grossAmount ?? "1070.00",
    feeAmount: overrides.feeAmount ?? "21.40",
    feeVatAmount: overrides.feeVatAmount,
    netPayout: overrides.netPayout ?? "1048.60",
    periodStart: overrides.periodStart ?? "2026-03-01",
    periodEnd: overrides.periodEnd ?? "2026-03-31",
  };
}

async function seedSettlement(orgId: string, overrides: SettlementOverrides = {}) {
  await importSettlements({
    orgId,
    processor: "Omise",
    settlements: [settlement(overrides)],
  });
  const [row] = await testDb
    .select()
    .from(schema.processorSettlements)
    .where(
      and(
        eq(schema.processorSettlements.orgId, orgId),
        eq(
          schema.processorSettlements.externalId,
          overrides.externalId ?? "STL-001"
        )
      )
    )
    .limit(1);
  return row;
}

/**
 * The allocation trigger reads `documents.total_amount` as the per-document
 * cap and raises when it is null, so a document used in a match has to carry
 * one — the shared builder deliberately does not.
 */
async function createMatchableDocument(orgId: string, totalAmount: string) {
  const doc = await createTestDocument(testDb, orgId);
  await testDb
    .update(schema.documents)
    .set({ totalAmount })
    .where(eq(schema.documents.id, doc.id));
  return doc;
}

async function readSettlement(settlementId: string) {
  const [row] = await testDb
    .select()
    .from(schema.processorSettlements)
    .where(eq(schema.processorSettlements.id, settlementId));
  return row;
}

async function readTransaction(transactionId: string) {
  const [row] = await testDb
    .select()
    .from(schema.transactions)
    .where(eq(schema.transactions.id, transactionId));
  return row;
}

// ---------------------------------------------------------------------------
// Org scoping
// ---------------------------------------------------------------------------

describe("org scoping", () => {
  it("never returns another org's settlements", async () => {
    const orgA = await createTestOrg(testDb);
    const orgB = await createTestOrg(testDb);

    await seedSettlement(orgA.id, { externalId: "A-1" });
    await seedSettlement(orgB.id, { externalId: "B-1" });

    const pendingA = await getUnreconciledSettlements(orgA.id);
    expect(pendingA).toHaveLength(1);
    expect(pendingA[0].externalId).toBe("A-1");

    expect(await getSettlementMatchStats(orgB.id)).toMatchObject({
      total: 1,
      unreconciled: 1,
    });
  });

  it("will not link a settlement through another org's id", async () => {
    const orgA = await createTestOrg(testDb);
    const orgB = await createTestOrg(testDb);
    const account = await createTestBankAccount(testDb, orgA.id);
    const deposit = await createTestTransaction(testDb, orgA.id, account.id, {
      amount: "1048.60",
    });
    const stl = await seedSettlement(orgA.id);

    const linked = await linkSettlementToTransaction({
      orgId: orgB.id,
      settlementId: stl.id,
      transactionId: deposit.id,
      status: "matched",
      confidence: "1.00",
      metadata: METADATA,
    });

    expect(linked).toBe(false);
    expect((await readSettlement(stl.id)).bankTransactionId).toBeNull();
  });

  it("will not unlink or confirm through another org's id", async () => {
    const orgA = await createTestOrg(testDb);
    const orgB = await createTestOrg(testDb);
    const account = await createTestBankAccount(testDb, orgA.id);
    const deposit = await createTestTransaction(testDb, orgA.id, account.id, {
      amount: "1048.60",
    });
    const stl = await seedSettlement(orgA.id);

    await linkSettlementToTransaction({
      orgId: orgA.id,
      settlementId: stl.id,
      transactionId: deposit.id,
      status: "suggested",
      confidence: "0.80",
      metadata: METADATA,
    });

    expect(await confirmSettlementMatch(orgB.id, stl.id)).toBe(false);
    expect(await unlinkSettlement(orgB.id, stl.id)).toBe(false);

    const after = await readSettlement(stl.id);
    expect(after.bankTransactionId).toBe(deposit.id);
    expect(after.reconciliationStatus).toBe("suggested");
  });
});

// ---------------------------------------------------------------------------
// Schema guards
// ---------------------------------------------------------------------------

describe("schema constraints", () => {
  it("rejects a fee VAT amount with no processor tax invoice", async () => {
    const org = await createTestOrg(testDb);

    // Fee VAT is only claimable as input VAT once the processor's own tax
    // invoice is captured, so the row cannot exist without one.
    await expect(
      testDb.insert(schema.processorSettlements).values({
        orgId: org.id,
        processor: "Omise",
        externalId: "STL-VAT",
        grossAmount: "1070.00",
        feeAmount: "20.00",
        feeVatAmount: "1.40",
        netPayout: "1048.60",
      })
    ).rejects.toMatchObject({
      // Drizzle wraps the pg error; the constraint name lives on the cause.
      cause: expect.objectContaining({
        constraint: "processor_settlements_fee_vat_document_check",
      }),
    });
  });

  it("allows a zero fee VAT with no tax invoice", async () => {
    const org = await createTestOrg(testDb);

    await expect(
      testDb.insert(schema.processorSettlements).values({
        orgId: org.id,
        processor: "Omise",
        externalId: "STL-VAT-ZERO",
        grossAmount: "1070.00",
        feeAmount: "21.40",
        feeVatAmount: "0.00",
        netPayout: "1048.60",
      })
    ).resolves.toBeDefined();
  });

  it("accepts fee VAT once the processor's tax invoice is attached", async () => {
    const org = await createTestOrg(testDb);
    const taxInvoice = await createTestDocument(testDb, org.id);

    await expect(
      testDb.insert(schema.processorSettlements).values({
        orgId: org.id,
        processor: "Omise",
        externalId: "STL-VAT-OK",
        grossAmount: "1070.00",
        feeAmount: "20.00",
        feeVatAmount: "1.40",
        netPayout: "1048.60",
        processorTaxInvoiceDocumentId: taxInvoice.id,
      })
    ).resolves.toBeDefined();
  });

  it("is idempotent on (org, processor, external id)", async () => {
    const org = await createTestOrg(testDb);

    const first = await importSettlements({
      orgId: org.id,
      processor: "Omise",
      settlements: [settlement()],
    });
    const second = await importSettlements({
      orgId: org.id,
      processor: "Omise",
      settlements: [settlement()],
    });

    expect(first).toMatchObject({ created: 1, updated: 0 });
    expect(second).toMatchObject({ created: 0, updated: 1 });

    const rows = await testDb
      .select()
      .from(schema.processorSettlements)
      .where(eq(schema.processorSettlements.orgId, org.id));
    expect(rows).toHaveLength(1);
  });

  it("treats the same external id from two processors as two settlements", async () => {
    const org = await createTestOrg(testDb);

    await importSettlements({
      orgId: org.id,
      processor: "Omise",
      settlements: [settlement({ externalId: "BATCH-9" })],
    });
    await importSettlements({
      orgId: org.id,
      processor: "2C2P",
      settlements: [settlement({ externalId: "BATCH-9" })],
    });

    expect(await getSettlementMatchStats(org.id)).toMatchObject({ total: 2 });
  });
});

// ---------------------------------------------------------------------------
// Re-import over a live match
// ---------------------------------------------------------------------------

describe("re-import over a matched settlement", () => {
  it("keeps the match when the net payout is unchanged", async () => {
    const org = await createTestOrg(testDb);
    const account = await createTestBankAccount(testDb, org.id);
    const deposit = await createTestTransaction(testDb, org.id, account.id, {
      amount: "1048.60",
    });
    const stl = await seedSettlement(org.id);

    await linkSettlementToTransaction({
      orgId: org.id,
      settlementId: stl.id,
      transactionId: deposit.id,
      status: "matched",
      confidence: "1.00",
      metadata: METADATA,
    });

    // Same net to bank, corrected gross/fee split.
    const result = await importSettlements({
      orgId: org.id,
      processor: "Omise",
      settlements: [settlement({ grossAmount: "1071.00", feeAmount: "22.40" })],
    });

    expect(result.matchesInvalidated).toEqual([]);
    const after = await readSettlement(stl.id);
    expect(after.bankTransactionId).toBe(deposit.id);
    expect(after.reconciliationStatus).toBe("matched");
    expect(after.grossAmount).toBe("1071.00");
  });

  it("drops the match when the net payout changes", async () => {
    const org = await createTestOrg(testDb);
    const account = await createTestBankAccount(testDb, org.id);
    const deposit = await createTestTransaction(testDb, org.id, account.id, {
      amount: "1048.60",
    });
    const stl = await seedSettlement(org.id);

    await linkSettlementToTransaction({
      orgId: org.id,
      settlementId: stl.id,
      transactionId: deposit.id,
      status: "matched",
      confidence: "1.00",
      metadata: METADATA,
    });

    // The match asserted "this deposit is this net payout". A corrected file
    // that moves the net payout invalidates that assertion.
    const result = await importSettlements({
      orgId: org.id,
      processor: "Omise",
      settlements: [settlement({ feeAmount: "31.40", netPayout: "1038.60" })],
    });

    expect(result.matchesInvalidated).toEqual(["STL-001"]);
    const after = await readSettlement(stl.id);
    expect(after.bankTransactionId).toBeNull();
    expect(after.reconciliationStatus).toBe("unreconciled");
    expect(after.netPayout).toBe("1038.60");
  });
});

// ---------------------------------------------------------------------------
// The claim guard
// ---------------------------------------------------------------------------

describe("linkSettlementToTransaction", () => {
  it("will not re-claim a settlement that already has a deposit", async () => {
    const org = await createTestOrg(testDb);
    const account = await createTestBankAccount(testDb, org.id);
    const first = await createTestTransaction(testDb, org.id, account.id, {
      amount: "1048.60",
    });
    const second = await createTestTransaction(testDb, org.id, account.id, {
      amount: "1048.60",
      date: "2026-04-05",
    });
    const stl = await seedSettlement(org.id);

    expect(
      await linkSettlementToTransaction({
        orgId: org.id,
        settlementId: stl.id,
        transactionId: first.id,
        status: "matched",
        confidence: "1.00",
        metadata: METADATA,
      })
    ).toBe(true);

    // A retried Inngest step must not move a payout that is already explained.
    expect(
      await linkSettlementToTransaction({
        orgId: org.id,
        settlementId: stl.id,
        transactionId: second.id,
        status: "matched",
        confidence: "1.00",
        metadata: METADATA,
      })
    ).toBe(false);

    expect((await readSettlement(stl.id)).bankTransactionId).toBe(first.id);
    expect((await readTransaction(second.id)).reconciliationStatus).toBe(
      "unmatched"
    );
  });

  it("marks the deposit matched on a suggestion and drops it out of the queue", async () => {
    const org = await createTestOrg(testDb);
    const account = await createTestBankAccount(testDb, org.id);
    const deposit = await createTestTransaction(testDb, org.id, account.id, {
      amount: "1048.60",
    });
    const stl = await seedSettlement(org.id);

    await linkSettlementToTransaction({
      orgId: org.id,
      settlementId: stl.id,
      transactionId: deposit.id,
      status: "suggested",
      confidence: "0.80",
      metadata: METADATA,
    });

    // A suggestion still claims the deposit, so the document matcher cannot
    // double-claim it while the owner is deciding.
    expect((await readTransaction(deposit.id)).reconciliationStatus).toBe(
      "matched"
    );
    expect(await getUnreconciledSettlements(org.id)).toHaveLength(0);

    const stored = await readSettlement(stl.id);
    expect(stored.matchConfidence).toBe("0.8000");
    expect(stored.matchMetadata).toMatchObject({ layer: "exact" });
    expect(stored.matchedAt).not.toBeNull();
  });

  it("records the discrepancy when the deposit is not exactly the net payout", async () => {
    const org = await createTestOrg(testDb);
    const account = await createTestBankAccount(testDb, org.id);
    const deposit = await createTestTransaction(testDb, org.id, account.id, {
      amount: "1045.00",
    });
    const stl = await seedSettlement(org.id);

    await linkSettlementToTransaction({
      orgId: org.id,
      settlementId: stl.id,
      transactionId: deposit.id,
      status: "suggested",
      confidence: "0.80",
      metadata: METADATA,
      discrepancy: "-3.60",
    });

    expect((await readSettlement(stl.id)).reconciliationDiscrepancy).toBe(
      "-3.60"
    );
  });

  it("confirm moves a suggestion to matched, and only once", async () => {
    const org = await createTestOrg(testDb);
    const account = await createTestBankAccount(testDb, org.id);
    const deposit = await createTestTransaction(testDb, org.id, account.id, {
      amount: "1048.60",
    });
    const stl = await seedSettlement(org.id);

    await linkSettlementToTransaction({
      orgId: org.id,
      settlementId: stl.id,
      transactionId: deposit.id,
      status: "suggested",
      confidence: "0.80",
      metadata: METADATA,
    });

    expect(await confirmSettlementMatch(org.id, stl.id)).toBe(true);
    // Nothing left to confirm the second time.
    expect(await confirmSettlementMatch(org.id, stl.id)).toBe(false);

    expect(await getSettlementMatchStats(org.id)).toMatchObject({
      matched: 1,
      suggested: 0,
      matchRate: 100,
    });
  });

  it("unlink releases the deposit back to unmatched", async () => {
    const org = await createTestOrg(testDb);
    const account = await createTestBankAccount(testDb, org.id);
    const deposit = await createTestTransaction(testDb, org.id, account.id, {
      amount: "1048.60",
    });
    const stl = await seedSettlement(org.id);

    await linkSettlementToTransaction({
      orgId: org.id,
      settlementId: stl.id,
      transactionId: deposit.id,
      status: "matched",
      confidence: "1.00",
      metadata: METADATA,
    });

    expect(await unlinkSettlement(org.id, stl.id)).toBe(true);

    expect((await readTransaction(deposit.id)).reconciliationStatus).toBe(
      "unmatched"
    );
    const after = await readSettlement(stl.id);
    expect(after.matchConfidence).toBeNull();
    expect(after.matchMetadata).toBeNull();
    expect(after.matchedAt).toBeNull();
    expect(await getUnreconciledSettlements(org.id)).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// The regression this whole feature turns on
// ---------------------------------------------------------------------------

describe("recomputeTransactionStatus with a settlement claim", () => {
  /**
   * The highest-risk line in the money-flow plan.
   *
   * Settlement claims live on processor_settlements, not in
   * reconciliation_matches. If recomputeTransactionStatus counted only the
   * matches table, undoing an *unrelated* document match on the same deposit
   * would quietly reset a settled deposit to `unmatched` and hand it back to
   * the document matcher to be double-claimed — a silent data defect, not a
   * visible failure.
   */
  it("keeps a settled deposit matched after an unrelated document match is undone", async () => {
    const org = await createTestOrg(testDb);
    const account = await createTestBankAccount(testDb, org.id);
    const document = await createMatchableDocument(org.id, "1048.60");
    const deposit = await createTestTransaction(testDb, org.id, account.id, {
      amount: "1048.60",
    });
    const stl = await seedSettlement(org.id);

    await linkSettlementToTransaction({
      orgId: org.id,
      settlementId: stl.id,
      transactionId: deposit.id,
      status: "matched",
      confidence: "1.00",
      metadata: METADATA,
    });

    const matchId = await createMatch({
      orgId: org.id,
      transactionId: deposit.id,
      documentId: document.id,
      matchedAmount: "1048.60",
      matchType: "manual",
      confidence: "1.00",
      matchedBy: "manual",
    });

    await softDeleteMatch(org.id, matchId);

    expect(await recomputeTransactionStatus(org.id, deposit.id)).toBe("matched");
    expect((await readTransaction(deposit.id)).reconciliationStatus).toBe(
      "matched"
    );
  });

  it("returns the deposit to unmatched once the settlement claim is released too", async () => {
    const org = await createTestOrg(testDb);
    const account = await createTestBankAccount(testDb, org.id);
    const deposit = await createTestTransaction(testDb, org.id, account.id, {
      amount: "1048.60",
    });
    const stl = await seedSettlement(org.id);

    await linkSettlementToTransaction({
      orgId: org.id,
      settlementId: stl.id,
      transactionId: deposit.id,
      status: "matched",
      confidence: "1.00",
      metadata: METADATA,
    });
    await unlinkSettlement(org.id, stl.id);

    expect(await recomputeTransactionStatus(org.id, deposit.id)).toBe(
      "unmatched"
    );
  });

  it("does not count another org's settlement as a claim", async () => {
    const orgA = await createTestOrg(testDb);
    const orgB = await createTestOrg(testDb);
    const account = await createTestBankAccount(testDb, orgA.id);
    const deposit = await createTestTransaction(testDb, orgA.id, account.id, {
      amount: "1048.60",
    });

    // Org B points a settlement at org A's deposit. The FK permits it; the org
    // filter inside recomputeTransactionStatus is what must not.
    await testDb.insert(schema.processorSettlements).values({
      orgId: orgB.id,
      processor: "Omise",
      externalId: "CROSS-1",
      grossAmount: "1070.00",
      feeAmount: "21.40",
      netPayout: "1048.60",
      bankTransactionId: deposit.id,
    });

    expect(await recomputeTransactionStatus(orgA.id, deposit.id)).toBe(
      "unmatched"
    );
  });
});

// ---------------------------------------------------------------------------
// Audit trail
// ---------------------------------------------------------------------------

describe("audit log", () => {
  it("records the import and the match", async () => {
    const org = await createTestOrg(testDb);
    const account = await createTestBankAccount(testDb, org.id);
    const deposit = await createTestTransaction(testDb, org.id, account.id, {
      amount: "1048.60",
    });
    const stl = await seedSettlement(org.id);

    await linkSettlementToTransaction({
      orgId: org.id,
      settlementId: stl.id,
      transactionId: deposit.id,
      status: "matched",
      confidence: "1.00",
      metadata: METADATA,
    });

    const entries = await testDb
      .select()
      .from(schema.auditLog)
      .where(
        and(
          eq(schema.auditLog.orgId, org.id),
          eq(schema.auditLog.entityType, "processor_settlement"),
          eq(schema.auditLog.entityId, stl.id)
        )
      );

    expect(entries.some((e) => e.action === "create")).toBe(true);
    expect(entries.some((e) => e.action === "update")).toBe(true);
  });

  it("records the released deposit when a match is undone", async () => {
    const org = await createTestOrg(testDb);
    const account = await createTestBankAccount(testDb, org.id);
    const deposit = await createTestTransaction(testDb, org.id, account.id, {
      amount: "1048.60",
    });
    const stl = await seedSettlement(org.id);

    await linkSettlementToTransaction({
      orgId: org.id,
      settlementId: stl.id,
      transactionId: deposit.id,
      status: "matched",
      confidence: "1.00",
      metadata: METADATA,
    });
    await unlinkSettlement(org.id, stl.id);

    const entries = await testDb
      .select()
      .from(schema.auditLog)
      .where(
        and(
          eq(schema.auditLog.orgId, org.id),
          eq(schema.auditLog.entityId, stl.id)
        )
      );

    // Which deposit was released is only recoverable from the audit row: the
    // settlement itself no longer references it.
    expect(
      entries.some(
        (e) =>
          (e.oldValue as { bankTransactionId?: string } | null)
            ?.bankTransactionId === deposit.id
      )
    ).toBe(true);
  });
});
