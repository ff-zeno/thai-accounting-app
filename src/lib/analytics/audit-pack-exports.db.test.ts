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
let getAgingSnapshot: typeof import("./audit-pack-exports").getAgingSnapshot;
let getConcentrationAnalysis: typeof import("./audit-pack-exports").getConcentrationAnalysis;
let getCloseChecklistLog: typeof import("./audit-pack-exports").getCloseChecklistLog;

beforeAll(async () => {
  await resetTestDb(pool);
  await migrateTestDb(pool);
  vi.doMock("@/lib/db/index", () => ({ db: testDb }));
  ({
    getAgingSnapshot,
    getConcentrationAnalysis,
    getCloseChecklistLog,
  } = await import("./audit-pack-exports"));
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
      establishments,
      bank_accounts,
      documents,
      vendors,
      organizations
    CASCADE
  `);
});

describe("Phase 14 audit-pack input exports", () => {
  it("returns point-in-time aging rows and summary for a quarter-end", async () => {
    const org = await createTestOrg(testDb);
    const otherOrg = await createTestOrg(testDb);
    const [customer] = await testDb
      .insert(schema.vendors)
      .values({
        orgId: org.id,
        name: "Quarter Customer",
        entityType: "company",
      })
      .returning();

    await testDb.insert(schema.documents).values([
      {
        orgId: org.id,
        vendorId: customer.id,
        type: "invoice",
        direction: "income",
        documentNumber: "AR-Q1",
        issueDate: "2026-02-15",
        dueDate: "2026-03-15",
        totalAmount: "120000.00",
        totalAmountThb: "120000.00",
        status: "confirmed",
      },
      {
        orgId: otherOrg.id,
        type: "invoice",
        direction: "income",
        documentNumber: "AR-OTHER",
        issueDate: "2026-02-15",
        dueDate: "2026-03-15",
        totalAmount: "999999.00",
        totalAmountThb: "999999.00",
        status: "confirmed",
      },
    ]);

    const snapshot = await getAgingSnapshot(org.id, "2026-03-31", "ar");

    expect(snapshot.kind).toBe("ar");
    expect(snapshot.asOfDate).toBe("2026-03-31");
    expect(snapshot.rows).toHaveLength(1);
    expect(snapshot.rows[0]).toMatchObject({
      counterpartyName: "Quarter Customer",
      days1To30: "120000.00",
      total: "120000.00",
    });
    expect(snapshot.summary).toMatchObject({
      days1To30: 120000,
      total: 120000,
    });
  });

  it("returns tax-year top-10 customer and vendor concentration", async () => {
    const org = await createTestOrg(testDb);
    const [customer] = await testDb
      .insert(schema.vendors)
      .values({
        orgId: org.id,
        name: "Top Audit Customer",
        entityType: "company",
      })
      .returning();
    const [vendor] = await testDb
      .insert(schema.vendors)
      .values({
        orgId: org.id,
        name: "Top Audit Vendor",
        entityType: "company",
      })
      .returning();

    await testDb.insert(schema.documents).values([
      {
        orgId: org.id,
        vendorId: customer.id,
        type: "invoice",
        direction: "income",
        documentNumber: "REV-2026",
        issueDate: "2026-06-01",
        totalAmount: "400000.00",
        totalAmountThb: "400000.00",
        status: "confirmed",
      },
      {
        orgId: org.id,
        vendorId: vendor.id,
        type: "invoice",
        direction: "expense",
        documentNumber: "EXP-2026",
        issueDate: "2026-06-01",
        totalAmount: "250000.00",
        totalAmountThb: "250000.00",
        status: "confirmed",
      },
      {
        orgId: org.id,
        vendorId: vendor.id,
        type: "invoice",
        direction: "expense",
        documentNumber: "EXP-OLD",
        issueDate: "2025-12-31",
        totalAmount: "999999.00",
        totalAmountThb: "999999.00",
        status: "confirmed",
      },
    ]);

    const analysis = await getConcentrationAnalysis(org.id, 2026);

    expect(analysis).toMatchObject({
      taxYear: 2026,
      periodStart: "2026-01-01",
      periodEnd: "2026-12-31",
    });
    expect(analysis.customers[0]).toMatchObject({
      counterpartyName: "Top Audit Customer",
      amount: "400000.00",
      sharePct: "1.0000",
    });
    expect(analysis.vendors[0]).toMatchObject({
      counterpartyName: "Top Audit Vendor",
      amount: "250000.00",
      sharePct: "1.0000",
    });
  });

  it("returns monthly close checklist log with sign-off stats", async () => {
    const org = await createTestOrg(testDb);
    const otherOrg = await createTestOrg(testDb);
    const [establishment] = await testDb
      .insert(schema.establishments)
      .values({
        orgId: org.id,
        branchNumber: "00000",
        nameEn: "Head Office",
        isHeadOffice: true,
      })
      .returning();
    const [checklist] = await testDb
      .insert(schema.closeChecklists)
      .values({
        orgId: org.id,
        establishmentId: establishment.id,
        periodYear: 2026,
        periodMonth: 3,
        status: "closed",
        closedAt: new Date("2026-04-02T09:00:00.000Z"),
        updatedAt: new Date("2026-04-03T08:00:00.000Z"),
      })
      .returning();

    await testDb.insert(schema.closeChecklistItems).values([
      {
        orgId: org.id,
        checklistId: checklist.id,
        sequence: 1,
        itemKey: "bank_reconciliation",
        description: "Bank reconciliation matched",
        status: "done",
        completedByUserId: "reviewer",
        completedAt: new Date("2026-04-02T08:00:00.000Z"),
        notes: "Matched",
      },
      {
        orgId: org.id,
        checklistId: checklist.id,
        sequence: 2,
        itemKey: "fx_revaluation_run",
        description: "FX revaluation reviewed",
        status: "skipped",
        notes: "No FX monetary items",
      },
    ]);

    await testDb.insert(schema.closeChecklists).values({
      orgId: otherOrg.id,
      periodYear: 2026,
      periodMonth: 3,
      status: "closed",
      closedAt: new Date("2026-04-02T09:00:00.000Z"),
    });
    await testDb.insert(schema.closeChecklists).values({
      orgId: org.id,
      periodYear: 2026,
      periodMonth: 4,
      status: "in_progress",
    });

    const log = await getCloseChecklistLog(org.id, 2026);

    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({
      checklistId: checklist.id,
      branchNumber: "00000",
      periodYear: 2026,
      periodMonth: 3,
      status: "closed",
      itemCount: 2,
      doneCount: 1,
      blockedCount: 0,
    });
    expect(log[0].closedAt?.toISOString()).toBe("2026-04-02T09:00:00.000Z");
    expect(log[0].items.map((item) => item.itemKey)).toEqual([
      "bank_reconciliation",
      "fx_revaluation_run",
    ]);
  });
});
