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
let getProfitabilityByCostCenter: typeof import("./segmented-profitability").getProfitabilityByCostCenter;
let getProfitabilityByProject: typeof import("./segmented-profitability").getProfitabilityByProject;

beforeAll(async () => {
  await resetTestDb(pool);
  await migrateTestDb(pool);
  vi.doMock("@/lib/db/index", () => ({ db: testDb }));
  vi.doMock("../db/index", () => ({ db: testDb }));
  ({ getProfitabilityByCostCenter, getProfitabilityByProject } = await import(
    "./segmented-profitability"
  ));
});

afterAll(async () => {
  await resetTestDb(pool);
  await pool.end();
});

beforeEach(async () => {
  await testDb.execute(sql`
    TRUNCATE TABLE
      journal_lines,
      journal_entries,
      gl_accounts,
      projects,
      cost_centers,
      vendors,
      organizations
    CASCADE
  `);
});

async function createAccounts(orgId: string) {
  const [bank, inventory, sales, cogs, salaries] = await testDb
    .insert(schema.glAccounts)
    .values([
      {
        orgId,
        accountCode: "1111",
        nameTh: "Bank",
        nameEn: "Bank",
        accountType: "asset",
      },
      {
        orgId,
        accountCode: "1140",
        nameTh: "Inventory",
        nameEn: "Inventory",
        accountType: "asset",
      },
      {
        orgId,
        accountCode: "4110",
        nameTh: "Sales revenue",
        nameEn: "Sales revenue",
        accountType: "revenue",
      },
      {
        orgId,
        accountCode: "5110",
        nameTh: "COGS",
        nameEn: "COGS",
        accountType: "cogs",
      },
      {
        orgId,
        accountCode: "6110",
        nameTh: "Salaries",
        nameEn: "Salaries",
        accountType: "expense",
      },
    ])
    .returning();

  return { bank, inventory, sales, cogs, salaries };
}

async function createEntry(data: {
  orgId: string;
  entryNumber: string;
  entryDate: string;
  description: string;
  total: string;
  lines: Array<
    Omit<typeof schema.journalLines.$inferInsert, "orgId" | "journalEntryId">
  >;
}) {
  return testDb.transaction(async (tx) => {
    await tx.execute(sql`SET CONSTRAINTS ALL DEFERRED`);
    const [entry] = await tx
      .insert(schema.journalEntries)
      .values({
        orgId: data.orgId,
        entryNumber: data.entryNumber,
        entryDate: data.entryDate,
        postingDate: data.entryDate,
        periodYear: Number(data.entryDate.slice(0, 4)),
        periodMonth: Number(data.entryDate.slice(5, 7)),
        entryType: "manual",
        description: data.description,
        totalDebit: data.total,
        totalCredit: data.total,
      })
      .returning();
    await tx.insert(schema.journalLines).values(
      data.lines.map((line) => ({
        ...line,
        orgId: data.orgId,
        journalEntryId: entry.id,
      }))
    );
    return entry;
  });
}

describe("segmented profitability", () => {
  it("summarizes GL revenue, COGS, and expenses by cost center and project", async () => {
    const org = await createTestOrg(testDb);
    const { bank, inventory, sales, cogs, salaries } = await createAccounts(org.id);
    const [ops, admin] = await testDb
      .insert(schema.costCenters)
      .values([
        { orgId: org.id, code: "OPS", nameEn: "Operations" },
        { orgId: org.id, code: "ADMIN", nameEn: "Admin" },
      ])
      .returning();
    const [project] = await testDb
      .insert(schema.projects)
      .values({ orgId: org.id, code: "BUILD-1", nameEn: "Buildout 1" })
      .returning();

    await createEntry({
      orgId: org.id,
      entryNumber: "JE-2026-SALE",
      entryDate: "2026-05-01",
      description: "Segmented sale",
      total: "1000.00",
      lines: [
        {
          lineNumber: 1,
          accountId: bank.id,
          debitAmount: "1000.00",
        },
        {
          lineNumber: 2,
          accountId: sales.id,
          creditAmount: "1000.00",
          costCenterId: ops.id,
          projectId: project.id,
        },
      ],
    });

    await createEntry({
      orgId: org.id,
      entryNumber: "JE-2026-COGS",
      entryDate: "2026-05-02",
      description: "Segmented COGS",
      total: "350.00",
      lines: [
        {
          lineNumber: 1,
          accountId: cogs.id,
          debitAmount: "350.00",
          costCenterId: ops.id,
          projectId: project.id,
        },
        {
          lineNumber: 2,
          accountId: inventory.id,
          creditAmount: "350.00",
        },
      ],
    });

    await createEntry({
      orgId: org.id,
      entryNumber: "JE-2026-EXP",
      entryDate: "2026-05-03",
      description: "Segmented expense",
      total: "125.00",
      lines: [
        {
          lineNumber: 1,
          accountId: salaries.id,
          debitAmount: "125.00",
          costCenterId: admin.id,
        },
        {
          lineNumber: 2,
          accountId: bank.id,
          creditAmount: "125.00",
        },
      ],
    });

    const byCostCenter = await getProfitabilityByCostCenter({
      orgId: org.id,
      periodStart: "2026-05-01",
      periodEnd: "2026-05-31",
    });
    expect(byCostCenter).toEqual([
      expect.objectContaining({
        segmentCode: "ADMIN",
        revenue: "0.00",
        expenses: "125.00",
        operatingProfit: "-125.00",
      }),
      expect.objectContaining({
        segmentCode: "OPS",
        revenue: "1000.00",
        cogs: "350.00",
        grossMargin: "650.00",
        grossMarginPct: "0.6500",
        operatingProfit: "650.00",
      }),
    ]);

    const byProject = await getProfitabilityByProject({
      orgId: org.id,
      periodStart: "2026-05-01",
      periodEnd: "2026-05-31",
    });
    expect(byProject).toEqual([
      expect.objectContaining({
        segmentCode: "BUILD-1",
        revenue: "1000.00",
        cogs: "350.00",
        grossMargin: "650.00",
        operatingProfit: "650.00",
      }),
      expect.objectContaining({
        segmentCode: "UNASSIGNED",
        expenses: "125.00",
        operatingProfit: "-125.00",
      }),
    ]);
  });

  it("does not leak another organization's GL activity", async () => {
    const org = await createTestOrg(testDb);
    const otherOrg = await createTestOrg(testDb);
    expect(otherOrg.id).not.toBe(org.id);
    const { bank, sales } = await createAccounts(otherOrg.id);

    await createEntry({
      orgId: otherOrg.id,
      entryNumber: "JE-2026-OTHER",
      entryDate: "2026-05-01",
      description: "Other org sale",
      total: "900.00",
      lines: [
        {
          lineNumber: 1,
          accountId: bank.id,
          debitAmount: "900.00",
        },
        {
          lineNumber: 2,
          accountId: sales.id,
          creditAmount: "900.00",
        },
      ],
    });

    const rows = await getProfitabilityByCostCenter({
      orgId: org.id,
      periodStart: "2026-05-01",
      periodEnd: "2026-05-31",
    });
    expect(rows).toEqual([]);
  });

  it("rolls activity tagged to deleted segments into Unassigned instead of dropping it", async () => {
    const org = await createTestOrg(testDb);
    const { bank, sales } = await createAccounts(org.id);
    const [costCenter] = await testDb
      .insert(schema.costCenters)
      .values({
        orgId: org.id,
        code: "OLD",
        nameEn: "Old Segment",
        deletedAt: new Date("2026-05-10T00:00:00.000Z"),
      })
      .returning();
    const [project] = await testDb
      .insert(schema.projects)
      .values({
        orgId: org.id,
        code: "OLD-P",
        nameEn: "Old Project",
        deletedAt: new Date("2026-05-10T00:00:00.000Z"),
      })
      .returning();

    await createEntry({
      orgId: org.id,
      entryNumber: "JE-2026-DELETED-SEGMENT",
      entryDate: "2026-05-01",
      description: "Deleted segment sale",
      total: "700.00",
      lines: [
        {
          lineNumber: 1,
          accountId: bank.id,
          debitAmount: "700.00",
        },
        {
          lineNumber: 2,
          accountId: sales.id,
          creditAmount: "700.00",
          costCenterId: costCenter.id,
          projectId: project.id,
        },
      ],
    });

    await expect(
      getProfitabilityByCostCenter({
        orgId: org.id,
        periodStart: "2026-05-01",
        periodEnd: "2026-05-31",
      })
    ).resolves.toEqual([
      expect.objectContaining({
        segmentCode: "UNASSIGNED",
        revenue: "700.00",
        operatingProfit: "700.00",
      }),
    ]);
    await expect(
      getProfitabilityByProject({
        orgId: org.id,
        periodStart: "2026-05-01",
        periodEnd: "2026-05-31",
      })
    ).resolves.toEqual([
      expect.objectContaining({
        segmentCode: "UNASSIGNED",
        revenue: "700.00",
        operatingProfit: "700.00",
      }),
    ]);
  });
});
