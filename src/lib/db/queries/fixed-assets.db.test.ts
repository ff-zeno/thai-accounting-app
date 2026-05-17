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
let createFixedAsset: typeof import("./fixed-assets").createFixedAsset;
let buildDepreciationScheduleForAsset: typeof import("./fixed-assets").buildDepreciationScheduleForAsset;
let getFixedAssetsDashboard: typeof import("./fixed-assets").getFixedAssetsDashboard;
let getFixedAssetDetail: typeof import("./fixed-assets").getFixedAssetDetail;
let getFixedAssetDisposalRegister: typeof import("./fixed-assets").getFixedAssetDisposalRegister;
let disposeFixedAsset: typeof import("./fixed-assets").disposeFixedAsset;
let getFixedAssetRollForward: typeof import("./fixed-assets").getFixedAssetRollForward;
let importFixedAssetsCsv: typeof import("./fixed-assets").importFixedAssetsCsv;
let postDepreciationForPeriod: typeof import("./fixed-assets").postDepreciationForPeriod;
let processDepreciationForPeriod: typeof import("./fixed-assets").processDepreciationForPeriod;
let enqueueDepreciationPostingForPeriod: typeof import("./fixed-assets").enqueueDepreciationPostingForPeriod;
let processMonthlyDepreciationForAllOrgs:
  typeof import("./fixed-assets").processMonthlyDepreciationForAllOrgs;
let previousBangkokMonth: typeof import("./fixed-assets").previousBangkokMonth;
let processPostingOutboxRow: typeof import("./posting-outbox").processPostingOutboxRow;
let lockPeriod: typeof import("./period-locks").lockPeriod;
let createJournalEntry: typeof import("./general-ledger").createJournalEntry;
let getGlAccounts: typeof import("./general-ledger").getGlAccounts;
let seedStandardGlAccounts: typeof import("./general-ledger").seedStandardGlAccounts;

beforeAll(async () => {
  await resetTestDb(pool);
  await migrateTestDb(pool);
  vi.doMock("../index", () => ({ db: testDb }));
  ({
    createFixedAsset,
    buildDepreciationScheduleForAsset,
    getFixedAssetsDashboard,
    getFixedAssetDetail,
    getFixedAssetDisposalRegister,
    disposeFixedAsset,
    getFixedAssetRollForward,
    importFixedAssetsCsv,
    postDepreciationForPeriod,
    processDepreciationForPeriod,
    enqueueDepreciationPostingForPeriod,
    processMonthlyDepreciationForAllOrgs,
    previousBangkokMonth,
  } = await import("./fixed-assets"));
  ({ processPostingOutboxRow } = await import("./posting-outbox"));
  ({ lockPeriod } = await import("./period-locks"));
  ({ createJournalEntry, getGlAccounts, seedStandardGlAccounts } = await import(
    "./general-ledger"
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
      posting_exceptions,
      posting_outbox,
      gl_accounts,
      allocation_rule_targets,
      allocation_rules,
      cost_centers,
      projects,
      audit_log,
      period_locks,
      fixed_asset_depreciation_periods,
      depreciation_schedule,
      fixed_assets,
      employee_allowances,
      employees,
      establishments,
      documents,
      organizations
    CASCADE
  `);
});

async function createHeadOffice(orgId: string) {
  const [establishment] = await testDb
    .insert(schema.establishments)
    .values({
      orgId,
      branchNumber: "00000",
      nameEn: "Head Office",
      isHeadOffice: true,
      vatRegistered: true,
    })
    .returning();
  return establishment;
}

describe("fixed asset foundation", () => {
  it("creates asset register rows and full-month straight-line schedule", async () => {
    const org = await createTestOrg(testDb);
    const asset = await createFixedAsset({
      orgId: org.id,
      assetCode: "FA-2026-0001",
      nameEn: "Notebook computer",
      category: "computer_hardware",
      acquisitionDate: "2026-03-15",
      depreciationStartDate: "2026-03-15",
      originalCost: "120000.00",
      usefulLifeMonths: 60,
    });

    expect(asset.taxUsefulLifeMonthsMinimum).toBe(36);

    const schedule = await buildDepreciationScheduleForAsset({
      orgId: org.id,
      assetId: asset.id,
    });

    expect(schedule).toHaveLength(60);
    expect(schedule[0].periodYear).toBe(2026);
    expect(schedule[0].periodMonth).toBe(4);
    expect(schedule[0].depreciationAmount).toBe("2000.00");
    expect(schedule[0].taxDepreciationCappedAmount).toBe("2000.00");
    expect(schedule[59].bookValueAfter).toBe("0.00");

    const rerun = await buildDepreciationScheduleForAsset({
      orgId: org.id,
      assetId: asset.id,
    });
    expect(rerun).toHaveLength(0);

    const dashboard = await getFixedAssetsDashboard(org.id);
    expect(dashboard.summary.activeAssetCount).toBe(1);
    expect(dashboard.summary.originalCost).toBe("120000.00");
    expect(dashboard.recentAssets[0].scheduleRows).toBe(60);
  });

  it("imports fixed asset CSV rows all-or-nothing with row-numbered validation", async () => {
    const org = await createTestOrg(testDb);
    const csv = [
      "asset_code,name_en,category,acquisition_date,original_cost,salvage_value,useful_life_months,depreciation_start_date,serial_number,location,notes",
      "FA-2026-IMP-1,Imported notebook,computer_hardware,2026-01-15,45000.00,0.00,36,2026-01-15,SN-1,HQ,opening import",
      "FA-2026-IMP-2,Imported desk,furniture_fixtures,2026-02-01,12000.00,0.00,60,,,HQ,opening import",
    ].join("\n");

    const result = await importFixedAssetsCsv({ orgId: org.id, csvText: csv });
    expect(result.createdCount).toBe(2);

    const dashboard = await getFixedAssetsDashboard(org.id);
    expect(dashboard.summary.activeAssetCount).toBe(2);
    expect(dashboard.recentAssets.map((asset) => asset.assetCode)).toContain(
      "FA-2026-IMP-1"
    );

    await expect(
      importFixedAssetsCsv({
        orgId: org.id,
        csvText: [
          "name_en,category,acquisition_date,original_cost,salvage_value",
          "Bad asset,equipment,2026-03-01,100.00,200.00",
        ].join("\n"),
      })
    ).rejects.toThrow(/row 2: salvage_value cannot exceed original_cost/);

    const afterFailure = await getFixedAssetsDashboard(org.id);
    expect(afterFailure.summary.activeAssetCount).toBe(2);
  });

  it("generates asset codes from max yearly suffix instead of row count", async () => {
    const org = await createTestOrg(testDb);
    await createFixedAsset({
      orgId: org.id,
      assetCode: "FA-2026-0042",
      nameEn: "Existing migrated asset",
      category: "equipment",
      acquisitionDate: "2026-01-01",
      originalCost: "1000.00",
    });

    const asset = await createFixedAsset({
      orgId: org.id,
      nameEn: "Next automatic asset",
      category: "equipment",
      acquisitionDate: "2026-02-01",
      originalCost: "1000.00",
    });

    expect(asset.assetCode).toBe("FA-2026-0043");
  });

  it("caps tax depreciation when book life is shorter than RD minimum", async () => {
    const org = await createTestOrg(testDb);
    const asset = await createFixedAsset({
      orgId: org.id,
      assetCode: "FA-2026-0002",
      nameEn: "Fast book asset",
      category: "equipment",
      acquisitionDate: "2026-01-01",
      originalCost: "120000.00",
      usefulLifeMonths: 24,
    });

    const schedule = await buildDepreciationScheduleForAsset({
      orgId: org.id,
      assetId: asset.id,
    });

    expect(schedule[0].depreciationAmount).toBe("5000.00");
    expect(schedule[0].taxDepreciationCappedAmount).toBe("2000.00");
    expect(schedule[0].bookTaxDifference).toBe("3000.00");
  });

  it("returns asset detail with depreciation register summary scoped to one org", async () => {
    const org = await createTestOrg(testDb);
    const otherOrg = await createTestOrg(testDb);
    const asset = await createFixedAsset({
      orgId: org.id,
      assetCode: "FA-2026-DETAIL",
      nameEn: "Detail asset",
      category: "equipment",
      acquisitionDate: "2026-01-01",
      originalCost: "120000.00",
      usefulLifeMonths: 24,
    });
    await buildDepreciationScheduleForAsset({
      orgId: org.id,
      assetId: asset.id,
    });

    const detail = await getFixedAssetDetail(org.id, asset.id);

    expect(detail?.asset.assetCode).toBe("FA-2026-DETAIL");
    expect(detail?.summary).toMatchObject({
      accumulatedDepreciation: "0.00",
      bookValue: "120000.00",
      scheduleRows: 24,
      postedRows: 0,
      bookTaxDifference: "72000.00",
    });
    expect(detail?.schedule[0]).toMatchObject({
      periodYear: 2026,
      periodMonth: 2,
      depreciationAmount: "5000.00",
      taxDepreciationCappedAmount: "2000.00",
      bookTaxDifference: "3000.00",
    });

    await expect(getFixedAssetDetail(otherOrg.id, asset.id)).resolves.toBeNull();
  });

  it("marks assets disposed and computes gain or loss against posted book value", async () => {
    const org = await createTestOrg(testDb);
    const asset = await createFixedAsset({
      orgId: org.id,
      assetCode: "FA-2026-DISP",
      nameEn: "Disposed asset",
      category: "equipment",
      acquisitionDate: "2026-01-01",
      originalCost: "120000.00",
      usefulLifeMonths: 60,
    });
    await buildDepreciationScheduleForAsset({
      orgId: org.id,
      assetId: asset.id,
    });

    const disposed = await disposeFixedAsset({
      orgId: org.id,
      assetId: asset.id,
      disposedAt: "2026-06-30",
      disposalProceeds: "100000.00",
    });

    expect(disposed.disposedAt).toBe("2026-06-30");
    expect(disposed.disposalProceeds).toBe("100000.00");
    expect(disposed.gainLossOnDisposal).toBe("-20000.00");

    const dashboard = await getFixedAssetsDashboard(org.id);
    expect(dashboard.summary.activeAssetCount).toBe(0);
    expect(dashboard.disposalRegister[0]).toMatchObject({
      assetCode: "FA-2026-DISP",
      disposedAt: "2026-06-30",
      disposalProceeds: "100000.00",
      gainLossOnDisposal: "-20000.00",
      bookValueAtDisposal: "120000.00",
    });

    await expect(
      buildDepreciationScheduleForAsset({
        orgId: org.id,
        assetId: asset.id,
      })
    ).rejects.toThrow(/Disposed assets/);

    const rollForward = await getFixedAssetRollForward({
      orgId: org.id,
      fromDate: "2026-01-01",
      toDate: "2026-12-31",
    });
    expect(rollForward[0].category).toBe("equipment");
    expect(rollForward[0].additions).toBe("120000.00");
    expect(rollForward[0].disposals).toBe("120000.00");
    expect(rollForward[0].depreciationInPeriod).toBe("10000.00");
    expect(rollForward[0].closingCost).toBe("0.00");

    const disposalRegister = await getFixedAssetDisposalRegister({
      orgId: org.id,
      fromDate: "2026-01-01",
      toDate: "2026-12-31",
    });
    expect(disposalRegister).toHaveLength(1);

    const [audit] = await testDb
      .select()
      .from(schema.auditLog)
      .where(sql`${schema.auditLog.entityType} = 'fixed_asset'
        AND ${schema.auditLog.entityId} = ${asset.id}
        AND ${schema.auditLog.action} = 'update'`);
    expect(audit).toMatchObject({
      orgId: org.id,
      entityType: "fixed_asset",
      entityId: asset.id,
      action: "update",
    });
    expect(audit.newValue).toMatchObject({
      disposedAt: "2026-06-30",
      disposalProceeds: "100000.00",
      accumulatedDepreciation: "0.00",
      bookValueAtDisposal: "120000.00",
      gainLossOnDisposal: "-20000.00",
    });
    expect(audit.newValue).toHaveProperty("journalEntryId");

    const disposalLines = await testDb
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
      .innerJoin(
        schema.journalEntries,
        sql`${schema.journalEntries.id} = ${schema.journalLines.journalEntryId}`
      )
      .where(sql`${schema.journalEntries.sourceEntityType} = 'fixed_assets'
        AND ${schema.journalEntries.sourceEntityId} = ${asset.id}
        AND ${schema.journalEntries.postingKind} = 'fixed_asset_disposal'`)
      .orderBy(schema.glAccounts.accountCode);
    expect(disposalLines).toEqual([
      { accountCode: "1111", debitAmount: "100000.00", creditAmount: "0.00" },
      { accountCode: "1330", debitAmount: "0.00", creditAmount: "120000.00" },
      { accountCode: "6880", debitAmount: "20000.00", creditAmount: "0.00" },
    ]);

    const otherYearDisposals = await getFixedAssetDisposalRegister({
      orgId: org.id,
      fromDate: "2027-01-01",
      toDate: "2027-12-31",
    });
    expect(otherYearDisposals).toHaveLength(0);
  });

  it("clears posted accumulated depreciation when disposing a depreciated asset", async () => {
    const org = await createTestOrg(testDb);
    const asset = await createFixedAsset({
      orgId: org.id,
      assetCode: "FA-2026-DISP-POSTED",
      nameEn: "Posted depreciation disposal",
      category: "equipment",
      acquisitionDate: "2026-01-01",
      originalCost: "120000.00",
      usefulLifeMonths: 60,
    });
    await buildDepreciationScheduleForAsset({
      orgId: org.id,
      assetId: asset.id,
    });
    for (const month of [2, 3, 4, 5, 6]) {
      await postDepreciationForPeriod({
        orgId: org.id,
        periodYear: 2026,
        periodMonth: month,
      });
    }

    const disposed = await disposeFixedAsset({
      orgId: org.id,
      assetId: asset.id,
      disposedAt: "2026-06-30",
      disposalProceeds: "100000.00",
    });

    expect(disposed.gainLossOnDisposal).toBe("-10000.00");

    const disposalLines = await testDb
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
      .innerJoin(
        schema.journalEntries,
        sql`${schema.journalEntries.id} = ${schema.journalLines.journalEntryId}`
      )
      .where(sql`${schema.journalEntries.sourceEntityType} = 'fixed_assets'
        AND ${schema.journalEntries.sourceEntityId} = ${asset.id}
        AND ${schema.journalEntries.postingKind} = 'fixed_asset_disposal'`)
      .orderBy(schema.glAccounts.accountCode);
    expect(disposalLines).toEqual([
      { accountCode: "1111", debitAmount: "100000.00", creditAmount: "0.00" },
      { accountCode: "1330", debitAmount: "0.00", creditAmount: "120000.00" },
      { accountCode: "1331", debitAmount: "10000.00", creditAmount: "0.00" },
      { accountCode: "6880", debitAmount: "10000.00", creditAmount: "0.00" },
    ]);
  });

  it("applies category allocation rules to disposal gain or loss lines only", async () => {
    const org = await createTestOrg(testDb);
    const [ops] = await testDb
      .insert(schema.costCenters)
      .values({ orgId: org.id, code: "OPS", nameEn: "Operations" })
      .returning();
    const [rule] = await testDb
      .insert(schema.allocationRules)
      .values({
        orgId: org.id,
        ruleName: "Equipment disposal split",
        sourceType: "category",
        sourceKey: "fixed_asset:equipment",
      })
      .returning();
    await testDb.insert(schema.allocationRuleTargets).values({
      orgId: org.id,
      allocationRuleId: rule.id,
      costCenterId: ops.id,
      percentage: "1.0000",
    });

    const asset = await createFixedAsset({
      orgId: org.id,
      assetCode: "FA-2026-DISP-ALLOC",
      nameEn: "Allocated disposal loss",
      category: "equipment",
      acquisitionDate: "2026-01-01",
      originalCost: "120000.00",
      usefulLifeMonths: 60,
    });

    await disposeFixedAsset({
      orgId: org.id,
      assetId: asset.id,
      disposedAt: "2026-06-30",
      disposalProceeds: "100000.00",
    });

    const disposalLines = await testDb
      .select({
        accountCode: schema.glAccounts.accountCode,
        costCenterId: schema.journalLines.costCenterId,
      })
      .from(schema.journalLines)
      .innerJoin(
        schema.glAccounts,
        sql`${schema.glAccounts.id} = ${schema.journalLines.accountId}`
      )
      .innerJoin(
        schema.journalEntries,
        sql`${schema.journalEntries.id} = ${schema.journalLines.journalEntryId}`
      )
      .where(sql`${schema.journalEntries.sourceEntityType} = 'fixed_assets'
        AND ${schema.journalEntries.sourceEntityId} = ${asset.id}
        AND ${schema.journalEntries.postingKind} = 'fixed_asset_disposal'`)
      .orderBy(schema.glAccounts.accountCode);

    expect(disposalLines).toEqual([
      { accountCode: "1111", costCenterId: null },
      { accountCode: "1330", costCenterId: null },
      { accountCode: "6880", costCenterId: ops.id },
    ]);
  });

  it("applies category allocation rules to disposal gain lines only", async () => {
    const org = await createTestOrg(testDb);
    const [ops] = await testDb
      .insert(schema.costCenters)
      .values({ orgId: org.id, code: "OPS", nameEn: "Operations" })
      .returning();
    const [rule] = await testDb
      .insert(schema.allocationRules)
      .values({
        orgId: org.id,
        ruleName: "Equipment disposal gain split",
        sourceType: "category",
        sourceKey: "fixed_asset:equipment",
      })
      .returning();
    await testDb.insert(schema.allocationRuleTargets).values({
      orgId: org.id,
      allocationRuleId: rule.id,
      costCenterId: ops.id,
      percentage: "1.0000",
    });

    const asset = await createFixedAsset({
      orgId: org.id,
      assetCode: "FA-2026-DISP-GAIN-ALLOC",
      nameEn: "Allocated disposal gain",
      category: "equipment",
      acquisitionDate: "2026-01-01",
      originalCost: "120000.00",
      usefulLifeMonths: 60,
    });

    await disposeFixedAsset({
      orgId: org.id,
      assetId: asset.id,
      disposedAt: "2026-06-30",
      disposalProceeds: "150000.00",
    });

    const disposalLines = await testDb
      .select({
        accountCode: schema.glAccounts.accountCode,
        costCenterId: schema.journalLines.costCenterId,
      })
      .from(schema.journalLines)
      .innerJoin(
        schema.glAccounts,
        sql`${schema.glAccounts.id} = ${schema.journalLines.accountId}`
      )
      .innerJoin(
        schema.journalEntries,
        sql`${schema.journalEntries.id} = ${schema.journalLines.journalEntryId}`
      )
      .where(sql`${schema.journalEntries.sourceEntityType} = 'fixed_assets'
        AND ${schema.journalEntries.sourceEntityId} = ${asset.id}
        AND ${schema.journalEntries.postingKind} = 'fixed_asset_disposal'`)
      .orderBy(schema.glAccounts.accountCode);

    expect(disposalLines).toEqual([
      { accountCode: "1111", costCenterId: null },
      { accountCode: "1330", costCenterId: null },
      { accountCode: "4340", costCenterId: ops.id },
    ]);
  });

  it("uses posted depreciation amounts instead of scheduled running totals for disposal", async () => {
    const org = await createTestOrg(testDb);
    const asset = await createFixedAsset({
      orgId: org.id,
      assetCode: "FA-2026-DISP-GAP",
      nameEn: "Non-sequential depreciation disposal",
      category: "equipment",
      acquisitionDate: "2026-01-01",
      originalCost: "120000.00",
      usefulLifeMonths: 60,
    });
    await buildDepreciationScheduleForAsset({
      orgId: org.id,
      assetId: asset.id,
    });
    await postDepreciationForPeriod({
      orgId: org.id,
      periodYear: 2026,
      periodMonth: 4,
    });

    const disposed = await disposeFixedAsset({
      orgId: org.id,
      assetId: asset.id,
      disposedAt: "2026-06-30",
      disposalProceeds: "100000.00",
    });

    expect(disposed.gainLossOnDisposal).toBe("-18000.00");

    const disposalLines = await testDb
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
      .innerJoin(
        schema.journalEntries,
        sql`${schema.journalEntries.id} = ${schema.journalLines.journalEntryId}`
      )
      .where(sql`${schema.journalEntries.sourceEntityType} = 'fixed_assets'
        AND ${schema.journalEntries.sourceEntityId} = ${asset.id}
        AND ${schema.journalEntries.postingKind} = 'fixed_asset_disposal'`)
      .orderBy(schema.glAccounts.accountCode);
    expect(disposalLines).toEqual([
      { accountCode: "1111", debitAmount: "100000.00", creditAmount: "0.00" },
      { accountCode: "1330", debitAmount: "0.00", creditAmount: "120000.00" },
      { accountCode: "1331", debitAmount: "2000.00", creditAmount: "0.00" },
      { accountCode: "6880", debitAmount: "18000.00", creditAmount: "0.00" },
    ]);
  });

  it("does not post prebuilt future depreciation rows after disposal", async () => {
    const org = await createTestOrg(testDb);
    const asset = await createFixedAsset({
      orgId: org.id,
      assetCode: "FA-2026-DISP-FUTURE",
      nameEn: "Future depreciation disposal",
      category: "equipment",
      acquisitionDate: "2026-01-01",
      originalCost: "120000.00",
      usefulLifeMonths: 60,
    });
    await buildDepreciationScheduleForAsset({
      orgId: org.id,
      assetId: asset.id,
    });
    await disposeFixedAsset({
      orgId: org.id,
      assetId: asset.id,
      disposedAt: "2026-06-30",
      disposalProceeds: "100000.00",
    });

    const julyPost = await postDepreciationForPeriod({
      orgId: org.id,
      periodYear: 2026,
      periodMonth: 7,
    });
    expect(julyPost).toMatchObject({
      postedRows: 0,
      journalEntryId: null,
      totalAmount: "0.00",
    });

    const [futureRow] = await testDb
      .select({ rowCount: sql<number>`COUNT(*)::int` })
      .from(schema.depreciationSchedule)
      .where(sql`${schema.depreciationSchedule.fixedAssetId} = ${asset.id}
        AND (${schema.depreciationSchedule.periodYear} > 2026
          OR (${schema.depreciationSchedule.periodYear} = 2026
            AND ${schema.depreciationSchedule.periodMonth} > 6))`);
    expect(futureRow.rowCount).toBe(0);
  });

  it("blocks fixed asset disposal into locked GL periods", async () => {
    const org = await createTestOrg(testDb);
    const asset = await createFixedAsset({
      orgId: org.id,
      assetCode: "FA-2026-DISP-LOCK",
      nameEn: "Locked disposal asset",
      category: "equipment",
      acquisitionDate: "2026-01-01",
      originalCost: "120000.00",
      usefulLifeMonths: 60,
    });
    await lockPeriod({
      orgId: org.id,
      domain: "gl",
      periodYear: 2026,
      periodMonth: 6,
      lockedByUserId: "system",
      lockReason: "routine_close",
    });

    await expect(
      disposeFixedAsset({
        orgId: org.id,
        assetId: asset.id,
        disposedAt: "2026-06-30",
        disposalProceeds: "100000.00",
      })
    ).rejects.toThrow(/GL period is locked/);

    const [freshAsset] = await testDb
      .select({ disposedAt: schema.fixedAssets.disposedAt })
      .from(schema.fixedAssets)
      .where(sql`${schema.fixedAssets.id} = ${asset.id}`);
    expect(freshAsset.disposedAt).toBeNull();
  });

  it("generates acquisition-year asset codes without reusing soft-deleted codes", async () => {
    const org = await createTestOrg(testDb);
    const first = await createFixedAsset({
      orgId: org.id,
      nameEn: "First auto-coded asset",
      category: "equipment",
      acquisitionDate: "2025-12-31",
      originalCost: "1000.00",
      usefulLifeMonths: 60,
    });
    expect(first.assetCode).toBe("FA-2025-0001");

    await testDb
      .update(schema.fixedAssets)
      .set({ deletedAt: new Date() })
      .where(sql`${schema.fixedAssets.id} = ${first.id}`);

    const second = await createFixedAsset({
      orgId: org.id,
      nameEn: "Second auto-coded asset",
      category: "equipment",
      acquisitionDate: "2025-12-31",
      originalCost: "1000.00",
      usefulLifeMonths: 60,
    });
    expect(second.assetCode).toBe("FA-2025-0002");
  });

  it("reconciles fixed asset roll-forward closing cost to GL asset account balance", async () => {
    const org = await createTestOrg(testDb);
    await seedStandardGlAccounts(org.id);
    const accounts = await getGlAccounts(org.id);
    const equipment = accounts.find((account) => account.accountCode === "1330")!;
    const bank = accounts.find((account) => account.accountCode === "1111")!;

    await createFixedAsset({
      orgId: org.id,
      assetCode: "FA-2026-GL-MATCH",
      nameEn: "GL matched equipment",
      category: "equipment",
      acquisitionDate: "2026-01-01",
      originalCost: "120000.00",
      usefulLifeMonths: 60,
    });
    await createJournalEntry({
      orgId: org.id,
      entryNumber: "JE-2026-FA-ACQ",
      entryDate: "2026-01-01",
      entryType: "manual",
      description: "Capitalize equipment acquisition",
      lines: [
        { accountId: equipment.id, debitAmount: "120000.00" },
        { accountId: bank.id, creditAmount: "120000.00" },
      ],
    });

    const rollForward = await getFixedAssetRollForward({
      orgId: org.id,
      fromDate: "2026-01-01",
      toDate: "2026-12-31",
    });

    expect(rollForward[0]).toMatchObject({
      category: "equipment",
      closingCost: "120000.00",
      glAssetAccountCode: "1330",
      glClosingCost: "120000.00",
      glVariance: "0.00",
    });
  });

  it("does not show false category variances when categories share one GL account", async () => {
    const org = await createTestOrg(testDb);
    await seedStandardGlAccounts(org.id);
    const accounts = await getGlAccounts(org.id);
    const equipment = accounts.find((account) => account.accountCode === "1330")!;
    const bank = accounts.find((account) => account.accountCode === "1111")!;

    await createFixedAsset({
      orgId: org.id,
      assetCode: "FA-2026-GL-EQUIP",
      nameEn: "Equipment",
      category: "equipment",
      acquisitionDate: "2026-01-01",
      originalCost: "100000.00",
      usefulLifeMonths: 60,
    });
    await createFixedAsset({
      orgId: org.id,
      assetCode: "FA-2026-GL-LEASE",
      nameEn: "Leasehold improvement",
      category: "leasehold_improvement",
      acquisitionDate: "2026-01-01",
      originalCost: "50000.00",
      usefulLifeMonths: 60,
    });
    await createJournalEntry({
      orgId: org.id,
      entryNumber: "JE-2026-FA-SHARED",
      entryDate: "2026-01-01",
      entryType: "manual",
      description: "Capitalize shared account fixed assets",
      lines: [
        { accountId: equipment.id, debitAmount: "150000.00" },
        { accountId: bank.id, creditAmount: "150000.00" },
      ],
    });

    const rollForward = await getFixedAssetRollForward({
      orgId: org.id,
      fromDate: "2026-01-01",
      toDate: "2026-12-31",
    });
    const byCategory = new Map(rollForward.map((row) => [row.category, row]));

    expect(byCategory.get("equipment")).toMatchObject({
      closingCost: "100000.00",
      glAssetAccountCode: "1330",
      glClosingCost: null,
      glVariance: null,
    });
    expect(byCategory.get("leasehold_improvement")).toMatchObject({
      closingCost: "50000.00",
      glAssetAccountCode: "1330",
      glClosingCost: null,
      glVariance: null,
    });
  });

  it("enforces same-org establishment guardrails", async () => {
    const org = await createTestOrg(testDb);
    const otherOrg = await createTestOrg(testDb);
    const otherEstablishment = await createHeadOffice(otherOrg.id);

    await expect(
      testDb.insert(schema.fixedAssets).values({
        orgId: org.id,
        establishmentId: otherEstablishment.id,
        assetCode: "FA-2026-X",
        nameEn: "Cross-org asset",
        category: "equipment",
        acquisitionDate: "2026-01-01",
        originalCost: "1000.00",
        usefulLifeMonths: 60,
        taxUsefulLifeMonthsMinimum: 60,
        depreciationStartDate: "2026-01-01",
      })
    ).rejects.toThrow(/Failed query/);
  });

  it("keeps depreciation schedule scoped to the same org as asset", async () => {
    const org = await createTestOrg(testDb);
    const otherOrg = await createTestOrg(testDb);
    const asset = await createFixedAsset({
      orgId: org.id,
      assetCode: "FA-2026-0003",
      nameEn: "Scoped asset",
      category: "equipment",
      acquisitionDate: "2026-01-01",
      originalCost: "1000.00",
      usefulLifeMonths: 60,
    });

    await expect(
      testDb.insert(schema.depreciationSchedule).values({
        orgId: otherOrg.id,
        fixedAssetId: asset.id,
        periodYear: 2026,
        periodMonth: 2,
        depreciationAmount: "16.66",
        taxDepreciationCappedAmount: "16.66",
        bookTaxDifference: "0.00",
        accumulatedDepreciationAfter: "16.66",
        bookValueAfter: "983.34",
      })
    ).rejects.toThrow(/Failed query/);
  });

  it("posts unposted depreciation schedule rows into a balanced GL entry", async () => {
    const org = await createTestOrg(testDb);
    const asset = await createFixedAsset({
      orgId: org.id,
      assetCode: "FA-2026-DEP",
      nameEn: "Depreciated equipment",
      category: "equipment",
      acquisitionDate: "2026-01-01",
      originalCost: "120000.00",
      usefulLifeMonths: 60,
    });
    await buildDepreciationScheduleForAsset({
      orgId: org.id,
      assetId: asset.id,
    });

    const result = await postDepreciationForPeriod({
      orgId: org.id,
      periodYear: 2026,
      periodMonth: 2,
      createdByUserId: "system",
    });

    expect(result.postedRows).toBe(1);
    expect(result.totalAmount).toBe("2000.00");
    expect(result.journalEntryId).toBeTruthy();

    const [scheduleRow] = await testDb
      .select({
        journalEntryId: schema.depreciationSchedule.journalEntryId,
        postedAt: schema.depreciationSchedule.postedAt,
      })
      .from(schema.depreciationSchedule)
      .where(sql`${schema.depreciationSchedule.fixedAssetId} = ${asset.id}
        AND ${schema.depreciationSchedule.periodYear} = 2026
        AND ${schema.depreciationSchedule.periodMonth} = 2`);

    expect(scheduleRow.journalEntryId).toBe(result.journalEntryId);
    expect(scheduleRow.postedAt).toBeTruthy();

    const journalRows = await testDb.execute(sql`
      SELECT je.entry_type, je.entry_number, je.total_debit, je.total_credit,
             ga.account_code, jl.debit_amount, jl.credit_amount
      FROM journal_entries je
      INNER JOIN journal_lines jl
        ON jl.journal_entry_id = je.id
        AND jl.org_id = je.org_id
      INNER JOIN gl_accounts ga
        ON ga.id = jl.account_id
        AND ga.org_id = jl.org_id
      WHERE je.id = ${result.journalEntryId}
      ORDER BY jl.line_number
    `);

    expect(journalRows.rows).toMatchObject([
      {
        entry_type: "auto_depreciation",
        account_code: "6821",
        debit_amount: "2000.00",
        credit_amount: "0.00",
      },
      {
        entry_type: "auto_depreciation",
        account_code: "1331",
        debit_amount: "0.00",
        credit_amount: "2000.00",
      },
    ]);
    expect(journalRows.rows[0]).toMatchObject({
      total_debit: "2000.00",
      total_credit: "2000.00",
    });

    const rerun = await postDepreciationForPeriod({
      orgId: org.id,
      periodYear: 2026,
      periodMonth: 2,
    });
    expect(rerun).toMatchObject({
      postedRows: 0,
      journalEntryId: null,
      totalAmount: "0.00",
    });
  });

  it("applies category allocation rules to depreciation expense lines only", async () => {
    const org = await createTestOrg(testDb);
    const [ops] = await testDb
      .insert(schema.costCenters)
      .values({ orgId: org.id, code: "OPS", nameEn: "Operations" })
      .returning();
    const [rule] = await testDb
      .insert(schema.allocationRules)
      .values({
        orgId: org.id,
        ruleName: "Equipment depreciation split",
        sourceType: "category",
        sourceKey: "fixed_asset:equipment",
      })
      .returning();
    await testDb.insert(schema.allocationRuleTargets).values({
      orgId: org.id,
      allocationRuleId: rule.id,
      costCenterId: ops.id,
      percentage: "1.0000",
    });

    const asset = await createFixedAsset({
      orgId: org.id,
      assetCode: "FA-2026-DEP-ALLOC",
      nameEn: "Allocated depreciation equipment",
      category: "equipment",
      acquisitionDate: "2026-01-01",
      originalCost: "120000.00",
      usefulLifeMonths: 60,
    });
    await buildDepreciationScheduleForAsset({
      orgId: org.id,
      assetId: asset.id,
    });

    const result = await postDepreciationForPeriod({
      orgId: org.id,
      periodYear: 2026,
      periodMonth: 2,
    });

    const journalLines = await testDb
      .select({
        accountCode: schema.glAccounts.accountCode,
        costCenterId: schema.journalLines.costCenterId,
      })
      .from(schema.journalLines)
      .innerJoin(
        schema.glAccounts,
        sql`${schema.glAccounts.id} = ${schema.journalLines.accountId}`
      )
      .where(sql`${schema.journalLines.journalEntryId} = ${result.journalEntryId}`)
      .orderBy(schema.glAccounts.accountCode);

    expect(journalLines).toEqual([
      { accountCode: "1331", costCenterId: null },
      { accountCode: "6821", costCenterId: ops.id },
    ]);
  });

  it("blocks depreciation posting into locked GL periods", async () => {
    const org = await createTestOrg(testDb);
    const asset = await createFixedAsset({
      orgId: org.id,
      assetCode: "FA-2026-LOCK",
      nameEn: "Locked period asset",
      category: "equipment",
      acquisitionDate: "2026-01-01",
      originalCost: "120000.00",
      usefulLifeMonths: 60,
    });
    await buildDepreciationScheduleForAsset({
      orgId: org.id,
      assetId: asset.id,
    });
    await lockPeriod({
      orgId: org.id,
      domain: "gl",
      periodYear: 2026,
      periodMonth: 2,
      lockedByUserId: "system",
      lockReason: "routine_close",
    });

    await expect(
      postDepreciationForPeriod({
        orgId: org.id,
        periodYear: 2026,
        periodMonth: 2,
      })
    ).rejects.toThrow(/GL period is locked/);

    const [scheduleRow] = await testDb
      .select({ journalEntryId: schema.depreciationSchedule.journalEntryId })
      .from(schema.depreciationSchedule)
      .where(sql`${schema.depreciationSchedule.fixedAssetId} = ${asset.id}
        AND ${schema.depreciationSchedule.periodYear} = 2026
        AND ${schema.depreciationSchedule.periodMonth} = 2`);
    expect(scheduleRow.journalEntryId).toBeNull();
  });

  it("processes a monthly depreciation period by building schedules and posting GL", async () => {
    const org = await createTestOrg(testDb);
    await createFixedAsset({
      orgId: org.id,
      assetCode: "FA-2026-CRON",
      nameEn: "Cron depreciation asset",
      category: "equipment",
      acquisitionDate: "2026-01-01",
      originalCost: "120000.00",
      usefulLifeMonths: 60,
    });

    const result = await processDepreciationForPeriod({
      orgId: org.id,
      periodYear: 2026,
      periodMonth: 2,
      createdByUserId: "system",
    });

    expect(result).toMatchObject({
      assetsConsidered: 1,
      scheduleRowsCreated: 60,
      postedRows: 1,
      totalAmount: "2000.00",
    });

    const rerun = await processDepreciationForPeriod({
      orgId: org.id,
      periodYear: 2026,
      periodMonth: 2,
    });
    expect(rerun).toMatchObject({
      assetsConsidered: 1,
      scheduleRowsCreated: 0,
      postedRows: 0,
      totalAmount: "0.00",
    });
  });

  it("posts depreciation for intangible and natural-resource asset categories", async () => {
    const org = await createTestOrg(testDb);
    await createFixedAsset({
      orgId: org.id,
      assetCode: "FA-2026-INTANGIBLE",
      nameEn: "Other intangible asset",
      category: "intangible_other",
      acquisitionDate: "2026-01-01",
      originalCost: "120000.00",
      usefulLifeMonths: 120,
    });
    await createFixedAsset({
      orgId: org.id,
      assetCode: "FA-2026-RESOURCE",
      nameEn: "Natural resource right",
      category: "natural_resource_right",
      acquisitionDate: "2026-01-01",
      originalCost: "240000.00",
      usefulLifeMonths: 240,
    });

    const result = await processDepreciationForPeriod({
      orgId: org.id,
      periodYear: 2026,
      periodMonth: 2,
      createdByUserId: "system",
    });

    expect(result.postedRows).toBe(2);
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
      { accountCode: "1421", debitAmount: "0.00", creditAmount: "1000.00" },
      { accountCode: "1431", debitAmount: "0.00", creditAmount: "1000.00" },
      { accountCode: "6825", debitAmount: "1000.00", creditAmount: "0.00" },
      { accountCode: "6826", debitAmount: "1000.00", creditAmount: "0.00" },
    ]);
  });

  it("queues monthly depreciation through posting outbox and links the posted period", async () => {
    const org = await createTestOrg(testDb);
    const asset = await createFixedAsset({
      orgId: org.id,
      assetCode: "FA-2026-OUTBOX",
      nameEn: "Outbox depreciation asset",
      category: "equipment",
      acquisitionDate: "2026-01-01",
      originalCost: "120000.00",
      usefulLifeMonths: 60,
    });

    const queued = await enqueueDepreciationPostingForPeriod({
      orgId: org.id,
      periodYear: 2026,
      periodMonth: 2,
      createdByUserId: "system",
    });

    expect(queued).toMatchObject({
      assetsConsidered: 1,
      scheduleRowsCreated: 60,
      postedRows: 0,
      totalAmount: "0.00",
    });
    expect(queued.postingOutboxId).toEqual(expect.any(String));

    const [period] = await testDb
      .select()
      .from(schema.fixedAssetDepreciationPeriods)
      .where(sql`${schema.fixedAssetDepreciationPeriods.id} = ${queued.periodId}`);
    expect(period.postingOutboxId).toBe(queued.postingOutboxId);
    expect(period.journalEntryId).toBeNull();

    const duplicateQueue = await enqueueDepreciationPostingForPeriod({
      orgId: org.id,
      periodYear: 2026,
      periodMonth: 2,
      createdByUserId: "system",
    });
    expect(duplicateQueue.postingOutboxId).toBe(queued.postingOutboxId);
    expect(duplicateQueue.periodId).toBe(queued.periodId);
    const periodRowsBeforePost = await testDb
      .select()
      .from(schema.fixedAssetDepreciationPeriods)
      .where(sql`${schema.fixedAssetDepreciationPeriods.periodYear} = 2026
        AND ${schema.fixedAssetDepreciationPeriods.periodMonth} = 2`);
    expect(periodRowsBeforePost).toHaveLength(1);

    const posted = await processPostingOutboxRow({
      orgId: org.id,
      postingOutboxId: queued.postingOutboxId!,
    });
    expect(posted.postingStatus).toBe("posted");
    expect(posted.journalEntryId).toEqual(expect.any(String));

    const [updatedPeriod] = await testDb
      .select()
      .from(schema.fixedAssetDepreciationPeriods)
      .where(sql`${schema.fixedAssetDepreciationPeriods.id} = ${queued.periodId}`);
    expect(updatedPeriod.journalEntryId).toBe(posted.journalEntryId);
    expect(updatedPeriod.postedAt).not.toBeNull();

    const [scheduleRow] = await testDb
      .select({ journalEntryId: schema.depreciationSchedule.journalEntryId })
      .from(schema.depreciationSchedule)
      .where(sql`${schema.depreciationSchedule.fixedAssetId} = ${asset.id}
        AND ${schema.depreciationSchedule.periodYear} = 2026
        AND ${schema.depreciationSchedule.periodMonth} = 2`);
    expect(scheduleRow.journalEntryId).toBe(posted.journalEntryId);

    const noOp = await enqueueDepreciationPostingForPeriod({
      orgId: org.id,
      periodYear: 2026,
      periodMonth: 2,
    });
    expect(noOp.postingOutboxId).toBeNull();

    const lateAsset = await createFixedAsset({
      orgId: org.id,
      assetCode: "FA-2026-LATE",
      nameEn: "Late depreciation asset",
      category: "equipment",
      acquisitionDate: "2026-01-15",
      originalCost: "60000.00",
      usefulLifeMonths: 60,
    });
    const requeue = await enqueueDepreciationPostingForPeriod({
      orgId: org.id,
      periodYear: 2026,
      periodMonth: 2,
    });
    expect(requeue.postingOutboxId).toEqual(expect.any(String));
    expect(requeue.postingOutboxId).not.toBe(queued.postingOutboxId);

    const latePosted = await processPostingOutboxRow({
      orgId: org.id,
      postingOutboxId: requeue.postingOutboxId!,
    });
    const [lateScheduleRow] = await testDb
      .select({ journalEntryId: schema.depreciationSchedule.journalEntryId })
      .from(schema.depreciationSchedule)
      .where(sql`${schema.depreciationSchedule.fixedAssetId} = ${lateAsset.id}
        AND ${schema.depreciationSchedule.periodYear} = 2026
        AND ${schema.depreciationSchedule.periodMonth} = 2`);
    expect(lateScheduleRow.journalEntryId).toBe(latePosted.journalEntryId);
  });

  it("blocks disposal while depreciation is queued for the disposal period", async () => {
    const org = await createTestOrg(testDb);
    const asset = await createFixedAsset({
      orgId: org.id,
      assetCode: "FA-2026-DISP-PENDING",
      nameEn: "Pending depreciation disposal",
      category: "equipment",
      acquisitionDate: "2026-01-01",
      originalCost: "120000.00",
      usefulLifeMonths: 60,
    });
    await enqueueDepreciationPostingForPeriod({
      orgId: org.id,
      periodYear: 2026,
      periodMonth: 2,
      createdByUserId: "system",
    });

    await expect(
      disposeFixedAsset({
        orgId: org.id,
        assetId: asset.id,
        disposedAt: "2026-02-15",
        disposalProceeds: "100000.00",
      })
    ).rejects.toThrow("Post pending depreciation");

    const [freshAsset] = await testDb
      .select({ disposedAt: schema.fixedAssets.disposedAt })
      .from(schema.fixedAssets)
      .where(sql`${schema.fixedAssets.id} = ${asset.id}`);
    expect(freshAsset.disposedAt).toBeNull();
  });

  it("records monthly depreciation cron failures per organization", async () => {
    const org = await createTestOrg(testDb);
    await createFixedAsset({
      orgId: org.id,
      assetCode: "FA-2026-CRON-FAIL",
      nameEn: "Cron failure visibility asset",
      category: "equipment",
      acquisitionDate: "2026-01-01",
      originalCost: "120000.00",
      usefulLifeMonths: 60,
    });
    await lockPeriod({
      orgId: org.id,
      domain: "gl",
      periodYear: 2026,
      periodMonth: 2,
      lockedByUserId: "system",
      lockReason: "test_lock",
    });

    const result = await processMonthlyDepreciationForAllOrgs({
      periodYear: 2026,
      periodMonth: 2,
      createdByUserId: "system",
    });

    expect(result.orgsFailed).toBe(1);
    expect(result.results[0]).toMatchObject({
      orgId: org.id,
      status: "failed",
      error: "GL period is locked",
    });
    const [audit] = await testDb
      .select()
      .from(schema.auditLog)
      .where(sql`${schema.auditLog.orgId} = ${org.id}
        AND ${schema.auditLog.entityType} = 'fixed_asset_depreciation_period'`);
    expect(audit.newValue).toMatchObject({
      event: "fixed_asset_monthly_depreciation_failed",
      periodYear: 2026,
      periodMonth: 2,
      error: "GL period is locked",
    });
  });

  it("computes the previous Bangkok month for the monthly cron target", () => {
    expect(previousBangkokMonth(new Date("2026-01-31T18:00:00.000Z"))).toEqual({
      periodYear: 2026,
      periodMonth: 1,
    });
    expect(previousBangkokMonth(new Date("2026-01-01T00:30:00.000Z"))).toEqual({
      periodYear: 2025,
      periodMonth: 12,
    });
  });
});
