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
let ensureCloseChecklist: typeof import("./close-checklists").ensureCloseChecklist;
let getYearEndCloseReadiness: typeof import("./close-checklists").getYearEndCloseReadiness;
let getCloseDashboard: typeof import("./close-checklists").getCloseDashboard;
let updateCloseChecklistItem: typeof import("./close-checklists").updateCloseChecklistItem;
let closeChecklistIfComplete: typeof import("./close-checklists").closeChecklistIfComplete;

beforeAll(async () => {
  await resetTestDb(pool);
  await migrateTestDb(pool);
  vi.doMock("../index", () => ({ db: testDb }));
  ({
    ensureCloseChecklist,
    getCloseDashboard,
    getYearEndCloseReadiness,
    updateCloseChecklistItem,
    closeChecklistIfComplete,
  } = await import("./close-checklists"));
});

afterAll(async () => {
  await resetTestDb(pool);
  await pool.end();
});

beforeEach(async () => {
  await testDb.execute(sql`
    TRUNCATE TABLE
      close_checklist_items,
      close_checklists,
      posting_exceptions,
      posting_outbox,
      journal_entries,
      cit_filings,
      establishments,
      organizations
    CASCADE
  `);
});

describe("close checklist foundation", () => {
  it("creates idempotent close checklists with seeded items", async () => {
    const org = await createTestOrg(testDb);
    const checklist = await ensureCloseChecklist({
      orgId: org.id,
      periodYear: 2026,
      periodMonth: 5,
    });
    const rerun = await ensureCloseChecklist({
      orgId: org.id,
      periodYear: 2026,
      periodMonth: 5,
    });

    expect(rerun.id).toBe(checklist.id);
    const items = await testDb.select().from(schema.closeChecklistItems);
    expect(items).toHaveLength(14);
  });

  it("blocks close until pending or blocked items are resolved", async () => {
    const org = await createTestOrg(testDb);
    const checklist = await ensureCloseChecklist({
      orgId: org.id,
      periodYear: 2026,
      periodMonth: 5,
    });
    const items = await testDb.select().from(schema.closeChecklistItems);

    await expect(
      closeChecklistIfComplete({ orgId: org.id, checklistId: checklist.id })
    ).rejects.toThrow(/pending or blocked/);

    for (const item of items) {
      await updateCloseChecklistItem({
        orgId: org.id,
        itemId: item.id,
        status: "done",
        completedByUserId: "tester",
      });
    }

    const closed = await closeChecklistIfComplete({
      orgId: org.id,
      checklistId: checklist.id,
    });
    expect(closed.status).toBe("closed");
    expect(closed.closedAt).toBeInstanceOf(Date);
  });

  it("reports year-end close readiness from PND.50 and CIT accrual evidence", async () => {
    const org = await createTestOrg(testDb);

    const missing = await getYearEndCloseReadiness({ orgId: org.id, taxYear: 2026 });
    expect(missing.ready).toBe(false);
    expect(missing.checks.map((check) => check.status)).toEqual([
      "blocked",
      "blocked",
    ]);

    const [filing] = await testDb
      .insert(schema.citFilings)
      .values({
        orgId: org.id,
        taxYear: 2026,
        filingType: "pnd50",
        periodStart: "2026-01-01",
        periodEnd: "2026-12-31",
        filingStatus: "draft",
        citPayable: "1000.00",
      })
      .returning();
    const draftOnly = await getYearEndCloseReadiness({
      orgId: org.id,
      taxYear: 2026,
    });
    expect(draftOnly.ready).toBe(false);
    expect(draftOnly.checks.map((check) => check.status)).toEqual([
      "done",
      "blocked",
    ]);

    const [accrualEntry] = await testDb.insert(schema.journalEntries).values({
      orgId: org.id,
      entryNumber: "JE-2026-CIT",
      entryDate: "2026-12-31",
      postingDate: "2026-12-31",
      periodYear: 2026,
      periodMonth: 12,
      entryType: "auto_accrual",
      postingKind: "cit_accrual",
      sourceEntityType: "cit_filings",
      sourceEntityId: filing.id,
      description: "CIT accrual",
      notes: "readiness test",
    }).returning();

    const ready = await getYearEndCloseReadiness({ orgId: org.id, taxYear: 2026 });
    expect(ready.ready).toBe(true);
    expect(ready.checks.map((check) => check.status)).toEqual(["done", "done"]);

    const [reversalEntry] = await testDb.insert(schema.journalEntries).values({
      orgId: org.id,
      entryNumber: "JE-2026-CIT-REV",
      entryDate: "2026-12-31",
      postingDate: "2026-12-31",
      periodYear: 2026,
      periodMonth: 12,
      entryType: "manual",
      postingKind: "manual_reversal",
      sourceEntityType: "cit_filings",
      sourceEntityId: filing.id,
      description: "Reverse CIT accrual",
      isReversal: true,
      reversesEntryId: accrualEntry.id,
      notes: "readiness reversal test",
    }).returning();

    await testDb
      .update(schema.journalEntries)
      .set({ reversedByEntryId: reversalEntry.id })
      .where(sql`${schema.journalEntries.id} = ${accrualEntry.id}`);

    const reversed = await getYearEndCloseReadiness({
      orgId: org.id,
      taxYear: 2026,
    });
    expect(reversed.ready).toBe(false);
    expect(reversed.checks.map((check) => check.status)).toEqual([
      "done",
      "blocked",
    ]);
  });

  it("surfaces posting queue readiness on close dashboard", async () => {
    const org = await createTestOrg(testDb);
    const ready = await getCloseDashboard(org.id);
    expect(ready.postingQueue.ready).toBe(true);

    await testDb.insert(schema.postingOutbox).values({
      orgId: org.id,
      sourceEntityType: "wht_credits_received",
      sourceEntityId: "00000000-0000-4000-8000-000000000455",
      eventType: "create",
      payload: { paymentDate: "2099-01-01" },
      postingStatus: "failed",
      postingAttempts: 3,
      lastError: "future failure",
    });
    const futureOnly = await getCloseDashboard(org.id);
    expect(futureOnly.postingQueue.ready).toBe(true);
    expect(futureOnly.postingQueue.summary.failed).toBe(0);

    const sourceEntityId = "00000000-0000-4000-8000-000000000456";
    const [outbox] = await testDb
      .insert(schema.postingOutbox)
      .values({
        orgId: org.id,
        sourceEntityType: "wht_credits_received",
        sourceEntityId,
        eventType: "create",
        postingStatus: "failed",
        postingAttempts: 3,
        lastError: "test failure",
      })
      .returning();
    await testDb.insert(schema.postingExceptions).values({
      orgId: org.id,
      postingOutboxId: outbox.id,
      sourceEntityType: outbox.sourceEntityType,
      sourceEntityId: outbox.sourceEntityId,
      failureClass: "unknown",
      message: "test failure",
    });

    const blocked = await getCloseDashboard(org.id);
    expect(blocked.postingQueue.ready).toBe(false);
    expect(blocked.postingQueue.summary.failed).toBe(1);
    expect(blocked.postingQueue.exceptions).toHaveLength(1);
  });

  it("shows recent close periods newest first", async () => {
    const org = await createTestOrg(testDb);
    for (let month = 1; month <= 12; month += 1) {
      await ensureCloseChecklist({
        orgId: org.id,
        periodYear: 2025,
        periodMonth: month,
      });
    }

    const dashboard = await getCloseDashboard(org.id);
    const periods = dashboard.recentChecklists.map(
      (row) => row.periodYear * 100 + row.periodMonth
    );
    expect(periods).toEqual([...periods].sort((a, b) => b - a));
  });

  it("enforces same-org checklist item guardrails", async () => {
    const org = await createTestOrg(testDb);
    const otherOrg = await createTestOrg(testDb);
    const checklist = await ensureCloseChecklist({
      orgId: org.id,
      periodYear: 2026,
      periodMonth: 5,
    });

    await expect(
      testDb.insert(schema.closeChecklistItems).values({
        orgId: otherOrg.id,
        checklistId: checklist.id,
        sequence: 99,
        itemKey: "cross_org",
        description: "Cross org",
      })
    ).rejects.toThrow(/Failed query/);
  });
});
