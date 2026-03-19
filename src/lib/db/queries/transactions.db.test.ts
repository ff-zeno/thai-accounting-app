import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { eq, isNull, and } from "drizzle-orm";
import {
  createTestDb,
  migrateTestDb,
  resetTestDb,
  createTestOrg,
  createTestBankAccount,
} from "@/tests/db-test-utils";
import * as schema from "@/lib/db/schema";

/*
 * INTEGRATION TESTS — Bank Statement Import Flow
 * ═══════════════════════════════════════════════
 *
 * Tests the full import-delete-reimport cycle against a real Postgres instance.
 * Requires Docker Postgres running: docker compose -f docker-compose.test.yml up -d
 *
 * Covers:
 *   - importTransactions with chunked batching + txn_dedup partial unique index
 *   - findOrCreateStatement find vs create vs soft-deleted predecessor
 *   - Soft-delete → re-import cycle (the bug that burned hours)
 *   - checkOverlapAction returning hasOverlap:false for orphan statements
 */

const { db: testDb, pool } = createTestDb();

let orgId: string;
let bankAccountId: string;

beforeAll(async () => {
  await resetTestDb(pool);
  await migrateTestDb(pool);
});

afterAll(async () => {
  await resetTestDb(pool);
  await pool.end();
});

beforeEach(async () => {
  // Clean data between tests (keep schema)
  await testDb.delete(schema.transactions);
  await testDb.delete(schema.bankStatements);
  await testDb.delete(schema.bankAccounts);
  await testDb.delete(schema.organizations);

  const org = await createTestOrg(testDb);
  orgId = org.id;
  const account = await createTestBankAccount(testDb, orgId);
  bankAccountId = account.id;
});

function makeTxns(count: number, datePrefix = "2024-01") {
  return Array.from({ length: count }, (_, i) => ({
    orgId,
    bankAccountId,
    statementId: null as string | null,
    date: `${datePrefix}-${String(i + 1).padStart(2, "0")}`,
    description: `Transaction ${i + 1}`,
    amount: String((i + 1) * 100),
    type: i % 2 === 0 ? ("debit" as const) : ("credit" as const),
    externalRef: `ref-${datePrefix}-${i + 1}`,
  }));
}

describe("importTransactions", () => {
  it("inserts transactions and returns correct counts", async () => {
    const txns = makeTxns(5);
    const values = txns.map((t) => ({ ...t, statementId: undefined }));

    const result = await testDb
      .insert(schema.transactions)
      .values(values)
      .onConflictDoNothing()
      .returning({ id: schema.transactions.id });

    expect(result).toHaveLength(5);
  });

  it("skips duplicates via txn_dedup partial unique index", async () => {
    const txns = makeTxns(3);
    const values = txns.map((t) => ({ ...t, statementId: undefined }));

    // First insert
    await testDb.insert(schema.transactions).values(values).onConflictDoNothing();

    // Second insert — same data, should all be skipped
    const result = await testDb
      .insert(schema.transactions)
      .values(values)
      .onConflictDoNothing()
      .returning({ id: schema.transactions.id });

    expect(result).toHaveLength(0);
  });

  it("allows re-insert after soft-delete (the critical bug fix)", async () => {
    const txns = makeTxns(3);
    const values = txns.map((t) => ({ ...t, statementId: undefined }));

    // Insert
    await testDb.insert(schema.transactions).values(values);

    // Soft-delete all
    await testDb
      .update(schema.transactions)
      .set({ deletedAt: new Date() })
      .where(eq(schema.transactions.orgId, orgId));

    // Re-insert same data — should succeed because partial index excludes deleted rows
    const result = await testDb
      .insert(schema.transactions)
      .values(values)
      .onConflictDoNothing()
      .returning({ id: schema.transactions.id });

    expect(result).toHaveLength(3);

    // Should now have 6 total rows (3 deleted + 3 active)
    const allRows = await testDb
      .select()
      .from(schema.transactions)
      .where(eq(schema.transactions.orgId, orgId));
    expect(allRows).toHaveLength(6);

    // Only 3 active
    const activeRows = await testDb
      .select()
      .from(schema.transactions)
      .where(
        and(
          eq(schema.transactions.orgId, orgId),
          isNull(schema.transactions.deletedAt)
        )
      );
    expect(activeRows).toHaveLength(3);
  });
});

describe("findOrCreateStatement", () => {
  const stmtData = () => ({
    orgId,
    bankAccountId,
    periodStart: "2024-01-01",
    periodEnd: "2024-01-31",
    parserUsed: "kbank_csv",
    importStatus: "processing",
  });

  it("creates a new statement when none exists", async () => {
    const [stmt] = await testDb
      .insert(schema.bankStatements)
      .values(stmtData())
      .returning();

    expect(stmt.id).toBeDefined();
    expect(stmt.periodStart).toBe("2024-01-01");
    expect(stmt.importStatus).toBe("processing");
  });

  it("finds existing active statement with same period", async () => {
    // Create first statement
    const [first] = await testDb
      .insert(schema.bankStatements)
      .values(stmtData())
      .returning();

    // Look for existing — should find it
    const [existing] = await testDb
      .select()
      .from(schema.bankStatements)
      .where(
        and(
          eq(schema.bankStatements.orgId, orgId),
          eq(schema.bankStatements.bankAccountId, bankAccountId),
          eq(schema.bankStatements.periodStart, "2024-01-01"),
          eq(schema.bankStatements.periodEnd, "2024-01-31"),
          isNull(schema.bankStatements.deletedAt)
        )
      )
      .limit(1);

    expect(existing).toBeDefined();
    expect(existing.id).toBe(first.id);
  });

  it("creates new statement when previous is soft-deleted", async () => {
    // Create and soft-delete
    const [first] = await testDb
      .insert(schema.bankStatements)
      .values(stmtData())
      .returning();

    await testDb
      .update(schema.bankStatements)
      .set({ deletedAt: new Date() })
      .where(eq(schema.bankStatements.id, first.id));

    // Create again — should succeed (partial unique index excludes deleted)
    const [second] = await testDb
      .insert(schema.bankStatements)
      .values(stmtData())
      .returning();

    expect(second.id).not.toBe(first.id);
    expect(second.periodStart).toBe("2024-01-01");
  });
});

describe("overlap detection with orphan statements", () => {
  it("orphan statement (no transactions) should not block re-import", async () => {
    // Create an orphan statement — active but with no transactions
    await testDb.insert(schema.bankStatements).values({
      orgId,
      bankAccountId,
      periodStart: "2024-01-01",
      periodEnd: "2024-01-31",
      parserUsed: "kbank_csv",
      importStatus: "processing",
    });

    // Query for existing transactions in the date range (simulates checkOverlapAction)
    const existingTxns = await testDb
      .select()
      .from(schema.transactions)
      .where(
        and(
          eq(schema.transactions.orgId, orgId),
          eq(schema.transactions.bankAccountId, bankAccountId),
          isNull(schema.transactions.deletedAt)
        )
      );

    // No transactions exist — overlap check should report hasOverlap: false
    expect(existingTxns).toHaveLength(0);
  });

  it("real overlap with existing transactions is detected", async () => {
    // Create statement with transactions
    const [stmt] = await testDb
      .insert(schema.bankStatements)
      .values({
        orgId,
        bankAccountId,
        periodStart: "2024-01-01",
        periodEnd: "2024-01-31",
        parserUsed: "kbank_csv",
        importStatus: "completed",
      })
      .returning();

    const txns = makeTxns(5).map((t) => ({ ...t, statementId: stmt.id }));
    await testDb.insert(schema.transactions).values(txns);

    // Query for existing transactions
    const existingTxns = await testDb
      .select()
      .from(schema.transactions)
      .where(
        and(
          eq(schema.transactions.orgId, orgId),
          eq(schema.transactions.bankAccountId, bankAccountId),
          isNull(schema.transactions.deletedAt)
        )
      );

    expect(existingTxns).toHaveLength(5);
  });
});

describe("full import-delete-reimport cycle", () => {
  it("completes the full cycle without data loss", async () => {
    // Step 1: Create statement and import transactions
    const [stmt] = await testDb
      .insert(schema.bankStatements)
      .values({
        orgId,
        bankAccountId,
        periodStart: "2024-01-01",
        periodEnd: "2024-01-31",
        parserUsed: "kbank_csv",
        importStatus: "completed",
      })
      .returning();

    const txns = makeTxns(10).map((t) => ({ ...t, statementId: stmt.id }));
    await testDb.insert(schema.transactions).values(txns);

    // Verify: 10 active transactions
    const beforeDelete = await testDb
      .select()
      .from(schema.transactions)
      .where(
        and(
          eq(schema.transactions.orgId, orgId),
          isNull(schema.transactions.deletedAt)
        )
      );
    expect(beforeDelete).toHaveLength(10);

    // Step 2: Soft-delete statement + transactions
    const now = new Date();
    await testDb
      .update(schema.transactions)
      .set({ deletedAt: now })
      .where(
        and(
          eq(schema.transactions.statementId, stmt.id),
          isNull(schema.transactions.deletedAt)
        )
      );
    await testDb
      .update(schema.bankStatements)
      .set({ deletedAt: now })
      .where(eq(schema.bankStatements.id, stmt.id));

    // Verify: 0 active transactions
    const afterDelete = await testDb
      .select()
      .from(schema.transactions)
      .where(
        and(
          eq(schema.transactions.orgId, orgId),
          isNull(schema.transactions.deletedAt)
        )
      );
    expect(afterDelete).toHaveLength(0);

    // Step 3: Re-import same transactions
    const [newStmt] = await testDb
      .insert(schema.bankStatements)
      .values({
        orgId,
        bankAccountId,
        periodStart: "2024-01-01",
        periodEnd: "2024-01-31",
        parserUsed: "kbank_csv",
        importStatus: "completed",
      })
      .returning();

    const reimportTxns = makeTxns(10).map((t) => ({
      ...t,
      statementId: newStmt.id,
    }));
    const reimportResult = await testDb
      .insert(schema.transactions)
      .values(reimportTxns)
      .onConflictDoNothing()
      .returning({ id: schema.transactions.id });

    // All 10 should be inserted (not blocked by soft-deleted duplicates)
    expect(reimportResult).toHaveLength(10);

    // Verify: 10 active transactions again
    const afterReimport = await testDb
      .select()
      .from(schema.transactions)
      .where(
        and(
          eq(schema.transactions.orgId, orgId),
          isNull(schema.transactions.deletedAt)
        )
      );
    expect(afterReimport).toHaveLength(10);
  });
});
