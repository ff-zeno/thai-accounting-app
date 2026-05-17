import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import * as schema from "@/lib/db/schema";
import {
  createTestDb,
  createTestOrg,
  migrateTestDb,
  resetTestDb,
} from "@/tests/db-test-utils";

const { db: testDb, pool } = createTestDb();
let runFxRevaluation: typeof import("./fx-revaluation").runFxRevaluation;
let processMonthEndFxRevaluationForAllOrgs: typeof import("./fx-revaluation").processMonthEndFxRevaluationForAllOrgs;
let previousBangkokMonthEnd: typeof import("./fx-revaluation").previousBangkokMonthEnd;

beforeAll(async () => {
  await resetTestDb(pool);
  await migrateTestDb(pool);
  vi.doMock("@/lib/db/index", () => ({ db: testDb }));
  vi.doMock("../db/index", () => ({ db: testDb }));
  vi.doMock("../index", () => ({ db: testDb }));
  ({
    runFxRevaluation,
    processMonthEndFxRevaluationForAllOrgs,
    previousBangkokMonthEnd,
  } = await import("./fx-revaluation"));
});

afterAll(async () => {
  await resetTestDb(pool);
  await pool.end();
});

beforeEach(async () => {
  await testDb.execute(sql`
    TRUNCATE TABLE
      exception_queue,
      audit_log,
      period_locks,
      journal_lines,
      journal_entries,
      fx_valuation_layers,
      fx_rates_bot,
      gl_accounts,
      payments,
      documents,
      vendors,
      organizations
    CASCADE
  `);
});

describe("FX revaluation", () => {
  it("revalues foreign AP documents without mutating original THB base", async () => {
    const org = await createTestOrg(testDb);
    const [vendor] = await testDb
      .insert(schema.vendors)
      .values({ orgId: org.id, name: "USD Vendor", entityType: "company" })
      .returning();
    const [doc] = await testDb
      .insert(schema.documents)
      .values({
        orgId: org.id,
        vendorId: vendor.id,
        type: "invoice",
        direction: "expense",
        documentNumber: "AP-USD-1",
        issueDate: "2026-05-01",
        totalAmount: "5000.00",
        totalAmountThb: "175000.00",
        currency: "USD",
        status: "confirmed",
      })
      .returning();
    await testDb.insert(schema.fxRatesBot).values({
      rateDate: "2026-05-31",
      currency: "USD",
      midRate: "36.00000000",
      sourceUrl: "https://portal.api.bot.or.th/portal/catalogue-products/exchange-rates-1",
      fetchedAt: new Date("2026-05-31T12:00:00.000Z"),
    });

    const result = await runFxRevaluation({
      orgId: org.id,
      valuationDate: "2026-05-31",
      createdByUserId: "user_fx",
    });

    expect(result).toMatchObject({
      candidateCount: 1,
      layerCount: 1,
      skippedExistingCount: 0,
    });
    expect(result.journalEntryId).toBeTruthy();

    const [unchangedDoc] = await testDb
      .select({ totalAmountThb: schema.documents.totalAmountThb })
      .from(schema.documents)
      .where(sql`${schema.documents.id} = ${doc.id}`);
    expect(unchangedDoc.totalAmountThb).toBe("175000.00");

    const [layer] = await testDb.select().from(schema.fxValuationLayers);
    expect(layer).toMatchObject({
      monetaryItemType: "ap_invoice",
      monetaryItemId: doc.id,
      originalAmount: "5000.00",
      originalCurrency: "USD",
      valuationDate: "2026-05-31",
      valuationRate: "36.00000000",
      valuedThbAmount: "180000.00",
      journalEntryId: result.journalEntryId,
    });

    const lines = await testDb
      .select({
        accountCode: schema.glAccounts.accountCode,
        debitAmount: schema.journalLines.debitAmount,
        creditAmount: schema.journalLines.creditAmount,
      })
      .from(schema.journalLines)
      .innerJoin(
        schema.glAccounts,
        sql`${schema.glAccounts.id} = ${schema.journalLines.accountId}`
      )
      .where(sql`${schema.journalLines.journalEntryId} = ${result.journalEntryId}`)
      .orderBy(schema.glAccounts.accountCode);

    expect(lines).toEqual([
      { accountCode: "2110", debitAmount: "0.00", creditAmount: "5000.00" },
      { accountCode: "6870", debitAmount: "5000.00", creditAmount: "0.00" },
    ]);

    const [audit] = await testDb.select().from(schema.auditLog);
    expect(audit).toMatchObject({
      orgId: org.id,
      entityType: "fx_revaluation",
      entityId: result.journalEntryId,
      action: "create",
    });
    expect(audit.newValue).toMatchObject({
      valuationDate: "2026-05-31",
      candidateCount: 1,
      layerCount: 1,
      journalEntryId: result.journalEntryId,
      skippedExistingCount: 0,
    });
  });

  it("is idempotent for the same monetary item and valuation date", async () => {
    const org = await createTestOrg(testDb);
    await testDb.insert(schema.documents).values({
      orgId: org.id,
      type: "invoice",
      direction: "income",
      documentNumber: "AR-EUR-1",
      issueDate: "2026-05-01",
      totalAmount: "1000.00",
      totalAmountThb: "39000.00",
      currency: "EUR",
      status: "confirmed",
    });
    await testDb.insert(schema.fxRatesBot).values({
      rateDate: "2026-05-31",
      currency: "EUR",
      midRate: "40.00000000",
      sourceUrl: "https://portal.api.bot.or.th/portal/catalogue-products/exchange-rates-1",
      fetchedAt: new Date("2026-05-31T12:00:00.000Z"),
    });

    await runFxRevaluation({ orgId: org.id, valuationDate: "2026-05-31" });
    const second = await runFxRevaluation({ orgId: org.id, valuationDate: "2026-05-31" });

    expect(second).toMatchObject({
      candidateCount: 1,
      layerCount: 0,
      journalEntryId: null,
      skippedExistingCount: 1,
    });
    const layers = await testDb.select().from(schema.fxValuationLayers);
    expect(layers).toHaveLength(1);
  });

  it("can process new same-date candidates on a later run", async () => {
    const org = await createTestOrg(testDb);
    await testDb.insert(schema.fxRatesBot).values({
      rateDate: "2026-05-31",
      currency: "EUR",
      midRate: "40.00000000",
      sourceUrl: "https://portal.api.bot.or.th/portal/catalogue-products/exchange-rates-1",
      fetchedAt: new Date("2026-05-31T12:00:00.000Z"),
    });
    await testDb.insert(schema.documents).values({
      orgId: org.id,
      type: "invoice",
      direction: "income",
      documentNumber: "AR-EUR-1",
      issueDate: "2026-05-01",
      totalAmount: "1000.00",
      totalAmountThb: "39000.00",
      currency: "EUR",
      status: "confirmed",
    });
    await runFxRevaluation({ orgId: org.id, valuationDate: "2026-05-31" });
    await testDb.insert(schema.documents).values({
      orgId: org.id,
      type: "invoice",
      direction: "income",
      documentNumber: "AR-EUR-2",
      issueDate: "2026-05-20",
      totalAmount: "2000.00",
      totalAmountThb: "78000.00",
      currency: "EUR",
      status: "confirmed",
    });

    const second = await runFxRevaluation({ orgId: org.id, valuationDate: "2026-05-31" });

    expect(second).toMatchObject({
      candidateCount: 2,
      layerCount: 1,
      skippedExistingCount: 1,
    });
    expect(second.journalEntryId).toBeTruthy();
    const entries = await testDb
      .select({ entryNumber: schema.journalEntries.entryNumber })
      .from(schema.journalEntries)
      .orderBy(schema.journalEntries.entryNumber);
    expect(entries.map((entry) => entry.entryNumber)).toEqual([
      "FX-2026-05-31-001",
      "FX-2026-05-31-002",
    ]);
    const layers = await testDb.select().from(schema.fxValuationLayers);
    expect(layers).toHaveLength(2);
  });

  it("excludes partially paid documents until realized FX settlement is implemented", async () => {
    const org = await createTestOrg(testDb);
    const [doc] = await testDb
      .insert(schema.documents)
      .values({
        orgId: org.id,
        type: "invoice",
        direction: "income",
        documentNumber: "AR-USD-PARTIAL",
        issueDate: "2026-05-01",
        totalAmount: "1000.00",
        totalAmountThb: "35000.00",
        currency: "USD",
        status: "partially_paid",
      })
      .returning();
    await testDb.insert(schema.payments).values({
      orgId: org.id,
      documentId: doc.id,
      paymentDate: "2026-05-20",
      grossAmount: "10000.00",
      netAmountPaid: "10000.00",
    });
    await testDb.insert(schema.fxRatesBot).values({
      rateDate: "2026-05-31",
      currency: "USD",
      midRate: "36.00000000",
      sourceUrl: "https://portal.api.bot.or.th/portal/catalogue-products/exchange-rates-1",
      fetchedAt: new Date("2026-05-31T12:00:00.000Z"),
    });

    const result = await runFxRevaluation({ orgId: org.id, valuationDate: "2026-05-31" });

    expect(result).toMatchObject({
      candidateCount: 0,
      layerCount: 0,
      journalEntryId: null,
    });
  });

  it("requires a BOT rate on or before the valuation date", async () => {
    const org = await createTestOrg(testDb);
    await testDb.insert(schema.documents).values({
      orgId: org.id,
      type: "invoice",
      direction: "income",
      documentNumber: "AR-JPY-1",
      issueDate: "2026-05-01",
      totalAmount: "100000.00",
      totalAmountThb: "24000.00",
      currency: "JPY",
      status: "confirmed",
    });

    await expect(
      runFxRevaluation({ orgId: org.id, valuationDate: "2026-05-31" })
    ).rejects.toThrow(/Missing BOT FX rate/);
  });

  it("blocks revaluation in locked GL periods", async () => {
    const org = await createTestOrg(testDb);
    await testDb.insert(schema.periodLocks).values({
      orgId: org.id,
      domain: "gl",
      periodYear: 2026,
      periodMonth: 5,
      lockedByUserId: "user_lock",
      lockReason: "Closed",
    });

    await expect(
      runFxRevaluation({ orgId: org.id, valuationDate: "2026-05-31" })
    ).rejects.toThrow(/GL period is locked/);
  });

  it("computes previous Bangkok month-end for scheduled valuation", () => {
    expect(previousBangkokMonthEnd(new Date("2026-06-01T00:30:00.000Z"))).toBe(
      "2026-05-31"
    );
    expect(previousBangkokMonthEnd(new Date("2026-01-01T00:30:00.000Z"))).toBe(
      "2025-12-31"
    );
  });

  it("processes month-end revaluation across orgs with isolated failures", async () => {
    const org = await createTestOrg(testDb);
    const failingOrg = await createTestOrg(testDb);
    await testDb.insert(schema.documents).values({
      orgId: org.id,
      type: "invoice",
      direction: "expense",
      documentNumber: "AP-USD-CRON",
      issueDate: "2026-05-01",
      totalAmount: "5000.00",
      totalAmountThb: "175000.00",
      currency: "USD",
      status: "confirmed",
    });
    await testDb.insert(schema.documents).values({
      orgId: failingOrg.id,
      type: "invoice",
      direction: "expense",
      documentNumber: "AP-JPY-CRON",
      issueDate: "2026-05-01",
      totalAmount: "100000.00",
      totalAmountThb: "24000.00",
      currency: "JPY",
      status: "confirmed",
    });
    await testDb.insert(schema.fxRatesBot).values({
      rateDate: "2026-05-31",
      currency: "USD",
      midRate: "36.00000000",
      sourceUrl: "https://portal.api.bot.or.th/portal/catalogue-products/exchange-rates-1",
      fetchedAt: new Date("2026-05-31T12:00:00.000Z"),
    });

    const result = await processMonthEndFxRevaluationForAllOrgs({
      valuationDate: "2026-05-31",
      createdByUserId: "system",
    });

    expect(result).toMatchObject({
      valuationDate: "2026-05-31",
      orgsProcessed: 1,
      orgsFailed: 1,
    });
    expect(result.results).toContainEqual(
      expect.objectContaining({
        orgId: org.id,
        status: "processed",
        layerCount: 1,
      })
    );
    expect(result.results).toContainEqual(
      expect.objectContaining({
        orgId: failingOrg.id,
        status: "failed",
        error: expect.stringMatching(/Missing BOT FX rate/),
      })
    );

    const [exception] = await testDb
      .select()
      .from(schema.exceptionQueue)
      .where(sql`${schema.exceptionQueue.orgId} = ${failingOrg.id}`);
    expect(exception).toMatchObject({
      entityType: "fx_revaluation",
      entityId: failingOrg.id,
      exceptionType: "month_end_fx_revaluation_failed",
      severity: "p1",
      summary: expect.stringMatching(/Month-end FX revaluation failed/),
    });
    expect(exception.payload).toMatchObject({
      valuationDate: "2026-05-31",
      error: expect.stringMatching(/Missing BOT FX rate/),
    });
  });
});
