import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import * as schema from "@/lib/db/schema";
import {
  createTestDb,
  createTestOrg,
  createTestVendor,
  migrateTestDb,
  resetTestDb,
} from "@/tests/db-test-utils";

const { db: testDb, pool } = createTestDb();
let seedStandardGlAccounts: typeof import("./general-ledger").seedStandardGlAccounts;
let getGlAccounts: typeof import("./general-ledger").getGlAccounts;
let createJournalEntry: typeof import("./general-ledger").createJournalEntry;
let buildTrialBalance: typeof import("./general-ledger").buildTrialBalance;
let getInventoryBalanceReconciliation:
  typeof import("./general-ledger").getInventoryBalanceReconciliation;
let postOpeningBalancePair: typeof import("./general-ledger").postOpeningBalancePair;
let createManualJournalPair: typeof import("./general-ledger").createManualJournalPair;
let reverseJournalEntry: typeof import("./general-ledger").reverseJournalEntry;
let getJournalEntryList: typeof import("./general-ledger").getJournalEntryList;
let getJournalEntryDetail: typeof import("./general-ledger").getJournalEntryDetail;
let getGeneralLedgerDetail: typeof import("./general-ledger").getGeneralLedgerDetail;
let buildFinancialStatementSummary: typeof import("./general-ledger").buildFinancialStatementSummary;
let postTaxPaymentEventJournalEntry: typeof import("./general-ledger").postTaxPaymentEventJournalEntry;
let postVatFilingPp36LifecycleJournalEntry: typeof import("./general-ledger").postVatFilingPp36LifecycleJournalEntry;
let postCitAccrualJournalEntry: typeof import("./general-ledger").postCitAccrualJournalEntry;
let postCitPaymentJournalEntry: typeof import("./general-ledger").postCitPaymentJournalEntry;
let postYearEndCloseJournalEntries: typeof import("./general-ledger").postYearEndCloseJournalEntries;
let enqueuePostingOutbox: typeof import("./posting-outbox").enqueuePostingOutbox;
let processPostingOutboxRow: typeof import("./posting-outbox").processPostingOutboxRow;
let lockPeriod: typeof import("./period-locks").lockPeriod;

beforeAll(async () => {
  await resetTestDb(pool);
  await migrateTestDb(pool);
  vi.doMock("../index", () => ({ db: testDb }));
  ({
    seedStandardGlAccounts,
    getGlAccounts,
    createJournalEntry,
    buildTrialBalance,
    getInventoryBalanceReconciliation,
    postOpeningBalancePair,
    createManualJournalPair,
    reverseJournalEntry,
    getJournalEntryList,
    getJournalEntryDetail,
    getGeneralLedgerDetail,
    buildFinancialStatementSummary,
    postTaxPaymentEventJournalEntry,
    postVatFilingPp36LifecycleJournalEntry,
    postCitAccrualJournalEntry,
    postCitPaymentJournalEntry,
    postYearEndCloseJournalEntries,
  } = await import("./general-ledger"));
  ({ enqueuePostingOutbox, processPostingOutboxRow } = await import("./posting-outbox"));
  ({ lockPeriod } = await import("./period-locks"));
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
      cit_filings,
      skus,
      gl_opening_balances,
      gl_accounts,
      period_locks,
      audit_log,
      organizations
    CASCADE
  `);
});

describe("general ledger primitives", () => {
  it("seeds the standard Thai chart of accounts idempotently", async () => {
    const org = await createTestOrg(testDb);

    await seedStandardGlAccounts(org.id);
    await seedStandardGlAccounts(org.id);

    const accounts = await getGlAccounts(org.id);
    expect(accounts.length).toBeGreaterThanOrEqual(10);
    expect(accounts.filter((account) => account.accountCode === "1111")).toHaveLength(1);
    expect(accounts.find((account) => account.accountCode === "2155")?.whtRegisterRole).toBe(
      "wht_payable_pnd54"
    );
    expect(accounts.find((account) => account.accountCode === "1253")?.vatRegisterRole).toBe(
      "pp36_reclaim"
    );
    expect(accounts.find((account) => account.accountCode === "2152")?.vatRegisterRole).toBe(
      "pp36_payable"
    );
  });

  it("creates balanced journal entries and builds a trial balance", async () => {
    const org = await createTestOrg(testDb);
    await seedStandardGlAccounts(org.id);
    const accounts = await getGlAccounts(org.id);
    const bank = accounts.find((account) => account.accountCode === "1111");
    const capital = accounts.find((account) => account.accountCode === "3110");
    expect(bank).toBeDefined();
    expect(capital).toBeDefined();

    const entry = await createJournalEntry({
      orgId: org.id,
      entryNumber: "JE-2026-0001",
      entryDate: "2026-01-01",
      entryType: "manual",
      description: "Initial capital contribution",
      lines: [
        { accountId: bank!.id, debitAmount: "100000.00" },
        { accountId: capital!.id, creditAmount: "100000.00" },
      ],
    });

    expect(entry.periodYear).toBe(2026);
    expect(entry.periodMonth).toBe(1);

    const trialBalance = await buildTrialBalance(org.id, "2026-01-31");
    expect(
      trialBalance.find((row) => row.accountCode === "1111")?.debitTotal
    ).toBe("100000.00");
    expect(
      trialBalance.find((row) => row.accountCode === "3110")?.creditTotal
    ).toBe("100000.00");
  });

  it("posts opening balance pairs to opening balances and the GL", async () => {
    const org = await createTestOrg(testDb);
    await seedStandardGlAccounts(org.id);
    const accounts = await getGlAccounts(org.id);
    const bank = accounts.find((account) => account.accountCode === "1111");
    const capital = accounts.find((account) => account.accountCode === "3110");
    expect(bank).toBeDefined();
    expect(capital).toBeDefined();

    const entry = await postOpeningBalancePair({
      orgId: org.id,
      asOfDate: "2026-01-01",
      debitAccountId: bank!.id,
      creditAccountId: capital!.id,
      amount: "250000.00",
      enteredByUserId: "user_1",
    });

    expect(entry.entryType).toBe("opening_balance");
    expect(entry.postingKind).toBe("opening_balance_pair");

    const balances = await testDb
      .select()
      .from(schema.glOpeningBalances)
      .where(sql`${schema.glOpeningBalances.orgId} = ${org.id}`);
    expect(balances).toHaveLength(2);

    const trialBalance = await buildTrialBalance(org.id, "2026-01-31");
    expect(
      trialBalance.find((row) => row.accountCode === "1111")?.debitTotal
    ).toBe("250000.00");
    expect(
      trialBalance.find((row) => row.accountCode === "3110")?.creditTotal
    ).toBe("250000.00");

    await expect(
      postOpeningBalancePair({
        orgId: org.id,
        asOfDate: "2026-01-01",
        debitAccountId: bank!.id,
        creditAccountId: capital!.id,
        amount: "1.00",
      })
    ).rejects.toThrow(/already exists/);
  });

  it("derives compact P&L and balance sheet summaries from journal lines", async () => {
    const org = await createTestOrg(testDb);
    await seedStandardGlAccounts(org.id);
    const accounts = await getGlAccounts(org.id);
    const bank = accounts.find((account) => account.accountCode === "1111")!;
    const capital = accounts.find((account) => account.accountCode === "3110")!;
    const sales = accounts.find((account) => account.accountCode === "4110")!;
    const salaries = accounts.find((account) => account.accountCode === "6110")!;

    await postOpeningBalancePair({
      orgId: org.id,
      asOfDate: "2026-01-01",
      debitAccountId: bank.id,
      creditAccountId: capital.id,
      amount: "100000.00",
    });
    await createJournalEntry({
      orgId: org.id,
      entryNumber: "JE-2026-SALE",
      entryDate: "2026-01-05",
      entryType: "manual",
      description: "Cash sale",
      lines: [
        { accountId: bank.id, debitAmount: "1000.00" },
        { accountId: sales.id, creditAmount: "1000.00" },
      ],
    });
    await createJournalEntry({
      orgId: org.id,
      entryNumber: "JE-2026-PAYROLL",
      entryDate: "2026-01-06",
      entryType: "manual",
      description: "Salary payment",
      lines: [
        { accountId: salaries.id, debitAmount: "300.00" },
        { accountId: bank.id, creditAmount: "300.00" },
      ],
    });

    const statements = await buildFinancialStatementSummary(org.id, "2026-01-31");
    expect(statements.profitAndLoss.revenue).toBe("1000.00");
    expect(statements.profitAndLoss.expenses).toBe("300.00");
    expect(statements.profitAndLoss.netIncome).toBe("700.00");
    expect(statements.balanceSheet.assets).toBe("100700.00");
    expect(statements.balanceSheet.check).toBe("0.00");
  });

  it("reconciles GL inventory account 1160 to SKU current value", async () => {
    const org = await createTestOrg(testDb);
    await seedStandardGlAccounts(org.id);
    const accounts = await getGlAccounts(org.id);
    const inventory = accounts.find((account) => account.accountCode === "1160")!;
    const capital = accounts.find((account) => account.accountCode === "3110")!;

    await testDb.insert(schema.skus).values({
      orgId: org.id,
      skuCode: "INV-GL-1",
      nameEn: "Inventory GL Test",
      currentQuantity: "10.0000",
      currentAvgCost: "100.0000",
      currentValue: "1000.00",
    });
    await createJournalEntry({
      orgId: org.id,
      entryNumber: "JE-INV-OPEN",
      entryDate: "2026-01-01",
      entryType: "opening_balance",
      description: "Opening inventory",
      lines: [
        { accountId: inventory.id, debitAmount: "1000.00" },
        { accountId: capital.id, creditAmount: "1000.00" },
      ],
    });

    const reconciliation = await getInventoryBalanceReconciliation(
      org.id,
      "2026-01-31"
    );
    expect(reconciliation).toMatchObject({
      glAccountCode: "1160",
      glInventoryBalance: "1000.00",
      skuCurrentValue: "1000.00",
      variance: "0.00",
    });

    await testDb
      .update(schema.skus)
      .set({ currentValue: "900.00" })
      .where(sql`${schema.skus.orgId} = ${org.id}`);
    const drift = await getInventoryBalanceReconciliation(org.id, "2026-01-31");
    expect(drift.variance).toBe("100.00");
  });

  it("creates manual journal pairs with generated entry numbers", async () => {
    const org = await createTestOrg(testDb);
    await seedStandardGlAccounts(org.id);
    const accounts = await getGlAccounts(org.id);
    const bank = accounts.find((account) => account.accountCode === "1111")!;
    const capital = accounts.find((account) => account.accountCode === "3110")!;

    const entry = await createManualJournalPair({
      orgId: org.id,
      entryDate: "2026-01-10",
      debitAccountId: bank.id,
      creditAccountId: capital.id,
      amount: "1000.00",
      description: "Owner contribution",
      createdByUserId: "user_1",
    });

    expect(entry.entryNumber).toBe("JE-2026-0001");
    expect(entry.entryType).toBe("manual");
    expect(entry.postingKind).toBe("manual_pair");
    expect(entry.totalDebit).toBe("1000.00");

    const auditRows = await testDb
      .select()
      .from(schema.auditLog)
      .where(sql`${schema.auditLog.entityId} = ${entry.id}`);
    expect(auditRows).toHaveLength(1);
    expect(auditRows[0].entityType).toBe("journal_entry");
  });

  it("reads org-scoped journal list and detail lines", async () => {
    const org = await createTestOrg(testDb);
    const otherOrg = await createTestOrg(testDb);
    await seedStandardGlAccounts(org.id);
    const accounts = await getGlAccounts(org.id);
    const bank = accounts.find((account) => account.accountCode === "1111")!;
    const capital = accounts.find((account) => account.accountCode === "3110")!;

    const entry = await createManualJournalPair({
      orgId: org.id,
      entryDate: "2026-01-10",
      debitAccountId: bank.id,
      creditAccountId: capital.id,
      amount: "1000.00",
      description: "Owner contribution",
      createdByUserId: "user_1",
    });

    const entries = await getJournalEntryList(org.id);
    expect(entries).toHaveLength(1);
    expect(entries[0].id).toBe(entry.id);

    const detail = await getJournalEntryDetail(org.id, entry.id);
    expect(detail?.entry.entryNumber).toBe("JE-2026-0001");
    expect(detail?.lines).toHaveLength(2);
    expect(detail?.lines.map((line) => line.accountCode).sort()).toEqual(["1111", "3110"]);

    await expect(getJournalEntryDetail(otherOrg.id, entry.id)).resolves.toBeNull();
  });

  it("reads general ledger detail with account filtering", async () => {
    const org = await createTestOrg(testDb);
    await seedStandardGlAccounts(org.id);
    const accounts = await getGlAccounts(org.id);
    const bank = accounts.find((account) => account.accountCode === "1111")!;
    const capital = accounts.find((account) => account.accountCode === "3110")!;

    await createManualJournalPair({
      orgId: org.id,
      entryDate: "2026-01-10",
      debitAccountId: bank.id,
      creditAccountId: capital.id,
      amount: "1000.00",
      description: "Owner contribution",
      createdByUserId: "user_1",
    });
    await createManualJournalPair({
      orgId: org.id,
      entryDate: "2026-02-10",
      debitAccountId: bank.id,
      creditAccountId: capital.id,
      amount: "500.00",
      description: "Second contribution",
      createdByUserId: "user_1",
    });

    const allLines = await getGeneralLedgerDetail(org.id);
    expect(allLines).toHaveLength(4);
    expect(allLines.map((line) => line.accountCode).sort()).toEqual([
      "1111",
      "1111",
      "3110",
      "3110",
    ]);

    const bankLines = await getGeneralLedgerDetail(org.id, { accountId: bank.id });
    expect(bankLines).toHaveLength(2);
    expect(bankLines[0]).toMatchObject({
      accountCode: "1111",
      debitAmount: "1000.00",
      creditAmount: "0.00",
    });

    const febBankLines = await getGeneralLedgerDetail(org.id, {
      accountId: bank.id,
      startDate: "2026-02-01",
      endDate: "2026-02-28",
    });
    expect(febBankLines).toHaveLength(1);
    expect(febBankLines[0]).toMatchObject({
      entryDate: "2026-02-10",
      debitAmount: "500.00",
    });
  });

  it("creates reversal entries that offset the original journal", async () => {
    const org = await createTestOrg(testDb);
    await seedStandardGlAccounts(org.id);
    const accounts = await getGlAccounts(org.id);
    const bank = accounts.find((account) => account.accountCode === "1111")!;
    const capital = accounts.find((account) => account.accountCode === "3110")!;

    const original = await createManualJournalPair({
      orgId: org.id,
      entryDate: "2026-01-10",
      debitAccountId: bank.id,
      creditAccountId: capital.id,
      amount: "1000.00",
      description: "Owner contribution",
    });
    const reversal = await reverseJournalEntry({
      orgId: org.id,
      journalEntryId: original.id,
      reversalDate: "2026-01-11",
      createdByUserId: "user_1",
    });

    expect(reversal.isReversal).toBe(true);
    expect(reversal.reversesEntryId).toBe(original.id);
    expect(reversal.postingKind).toBe("manual_reversal");

    const auditRows = await testDb
      .select()
      .from(schema.auditLog)
      .where(sql`${schema.auditLog.entityId} = ${reversal.id}`);
    expect(auditRows).toHaveLength(1);

    const [updatedOriginal] = await testDb
      .select()
      .from(schema.journalEntries)
      .where(sql`${schema.journalEntries.id} = ${original.id}`);
    expect(updatedOriginal.reversedByEntryId).toBe(reversal.id);

    const trialBalance = await buildTrialBalance(org.id, "2026-01-31");
    expect(
      trialBalance.find((row) => row.accountCode === "1111")?.debitTotal
    ).toBe("1000.00");
    expect(
      trialBalance.find((row) => row.accountCode === "1111")?.creditTotal
    ).toBe("1000.00");

    await expect(
      reverseJournalEntry({
        orgId: org.id,
        journalEntryId: original.id,
        reversalDate: "2026-01-12",
      })
    ).rejects.toThrow(/already reversed/);
  });

  it("preserves cost center and project tags on reversal lines", async () => {
    const org = await createTestOrg(testDb);
    await seedStandardGlAccounts(org.id);
    const accounts = await getGlAccounts(org.id);
    const bank = accounts.find((account) => account.accountCode === "1111")!;
    const capital = accounts.find((account) => account.accountCode === "3110")!;
    const [costCenter] = await testDb
      .insert(schema.costCenters)
      .values({ orgId: org.id, code: "OPS", nameEn: "Operations" })
      .returning();
    const [project] = await testDb
      .insert(schema.projects)
      .values({ orgId: org.id, code: "BUILD-1", nameEn: "Buildout 1" })
      .returning();

    const original = await createJournalEntry({
      orgId: org.id,
      entryNumber: "JE-2026-SEGMENT",
      entryDate: "2026-01-10",
      entryType: "manual",
      description: "Segmented owner contribution",
      lines: [
        {
          accountId: bank.id,
          debitAmount: "1000.00",
          costCenterId: costCenter.id,
          projectId: project.id,
        },
        {
          accountId: capital.id,
          creditAmount: "1000.00",
          costCenterId: costCenter.id,
          projectId: project.id,
        },
      ],
    });
    const reversal = await reverseJournalEntry({
      orgId: org.id,
      journalEntryId: original.id,
      reversalDate: "2026-01-11",
    });

    const reversalLines = await testDb
      .select({
        costCenterId: schema.journalLines.costCenterId,
        projectId: schema.journalLines.projectId,
      })
      .from(schema.journalLines)
      .where(sql`${schema.journalLines.journalEntryId} = ${reversal.id}`)
      .orderBy(schema.journalLines.lineNumber);

    expect(reversalLines).toEqual([
      { costCenterId: costCenter.id, projectId: project.id },
      { costCenterId: costCenter.id, projectId: project.id },
    ]);
  });

  it("applies active GL account allocation rules when inserting untagged journal lines", async () => {
    const org = await createTestOrg(testDb);
    await seedStandardGlAccounts(org.id);
    const accounts = await getGlAccounts(org.id);
    const bank = accounts.find((account) => account.accountCode === "1111")!;
    const salaries = accounts.find((account) => account.accountCode === "6110")!;
    const [ops, admin] = await testDb
      .insert(schema.costCenters)
      .values([
        { orgId: org.id, code: "OPS", nameEn: "Operations" },
        { orgId: org.id, code: "ADM", nameEn: "Admin" },
      ])
      .returning();
    const [rule] = await testDb
      .insert(schema.allocationRules)
      .values({
        orgId: org.id,
        ruleName: "Salary split",
        sourceType: "gl_account",
        sourceId: salaries.id,
      })
      .returning();
    await testDb.insert(schema.allocationRuleTargets).values([
      {
        orgId: org.id,
        allocationRuleId: rule.id,
        costCenterId: ops.id,
        percentage: "0.6000",
      },
      {
        orgId: org.id,
        allocationRuleId: rule.id,
        costCenterId: admin.id,
        percentage: "0.4000",
      },
    ]);

    const entry = await createJournalEntry({
      orgId: org.id,
      entryNumber: "JE-2026-ALLOC",
      entryDate: "2026-01-10",
      entryType: "manual",
      description: "Allocated salary",
      lines: [
        { accountId: salaries.id, debitAmount: "1000.00", description: "Salary" },
        { accountId: bank.id, creditAmount: "1000.00" },
      ],
    });

    const lines = await testDb
      .select({
        accountId: schema.journalLines.accountId,
        debitAmount: schema.journalLines.debitAmount,
        creditAmount: schema.journalLines.creditAmount,
        costCenterId: schema.journalLines.costCenterId,
        description: schema.journalLines.description,
      })
      .from(schema.journalLines)
      .where(sql`${schema.journalLines.journalEntryId} = ${entry.id}`)
      .orderBy(schema.journalLines.lineNumber);

    expect(lines).toEqual([
      {
        accountId: salaries.id,
        debitAmount: "600.00",
        creditAmount: "0.00",
        costCenterId: ops.id,
        description: "Salary - Allocated by Salary split (60.00%)",
      },
      {
        accountId: salaries.id,
        debitAmount: "400.00",
        creditAmount: "0.00",
        costCenterId: admin.id,
        description: "Salary - Allocated by Salary split (40.00%)",
      },
      {
        accountId: bank.id,
        debitAmount: "0.00",
        creditAmount: "1000.00",
        costCenterId: null,
        description: null,
      },
    ]);
  });

  it("applies vendor allocation rules before GL account fallbacks", async () => {
    const org = await createTestOrg(testDb);
    await seedStandardGlAccounts(org.id);
    const accounts = await getGlAccounts(org.id);
    const bank = accounts.find((account) => account.accountCode === "1111")!;
    const services = accounts.find((account) => account.accountCode === "6110")!;
    const [vendor] = await testDb
      .insert(schema.vendors)
      .values({ orgId: org.id, name: "Shared Services Co.", entityType: "company" })
      .returning();
    const [ops, admin] = await testDb
      .insert(schema.costCenters)
      .values([
        { orgId: org.id, code: "OPS", nameEn: "Operations" },
        { orgId: org.id, code: "ADM", nameEn: "Admin" },
      ])
      .returning();
    const [vendorRule, glRule] = await testDb
      .insert(schema.allocationRules)
      .values([
        {
          orgId: org.id,
          ruleName: "Vendor-specific split",
          sourceType: "vendor",
          sourceId: vendor.id,
        },
        {
          orgId: org.id,
          ruleName: "Generic services split",
          sourceType: "gl_account",
          sourceId: services.id,
        },
      ])
      .returning();
    await testDb.insert(schema.allocationRuleTargets).values([
      {
        orgId: org.id,
        allocationRuleId: vendorRule.id,
        costCenterId: ops.id,
        percentage: "1.0000",
      },
      {
        orgId: org.id,
        allocationRuleId: glRule.id,
        costCenterId: admin.id,
        percentage: "1.0000",
      },
    ]);

    const entry = await createJournalEntry({
      orgId: org.id,
      entryNumber: "JE-2026-VENDOR-ALLOC",
      entryDate: "2026-01-10",
      entryType: "manual",
      description: "Vendor allocation",
      lines: [
        {
          accountId: services.id,
          debitAmount: "1000.00",
          allocationVendorId: vendor.id,
        },
        { accountId: bank.id, creditAmount: "1000.00" },
      ],
    });

    const [allocatedLine] = await testDb
      .select({
        costCenterId: schema.journalLines.costCenterId,
        description: schema.journalLines.description,
      })
      .from(schema.journalLines)
      .where(
        sql`${schema.journalLines.journalEntryId} = ${entry.id}
          AND ${schema.journalLines.accountId} = ${services.id}`
      );

    expect(allocatedLine).toEqual({
      costCenterId: ops.id,
      description: "Allocated by Vendor-specific split (100.00%)",
    });
  });

  it("applies category allocation rules from line source metadata", async () => {
    const org = await createTestOrg(testDb);
    await seedStandardGlAccounts(org.id);
    const accounts = await getGlAccounts(org.id);
    const bank = accounts.find((account) => account.accountCode === "1111")!;
    const services = accounts.find((account) => account.accountCode === "6110")!;
    const [project] = await testDb
      .insert(schema.projects)
      .values({ orgId: org.id, code: "MKT", nameEn: "Marketing Campaign" })
      .returning();
    const [rule] = await testDb
      .insert(schema.allocationRules)
      .values({
        orgId: org.id,
        ruleName: "Marketing category split",
        sourceType: "category",
        sourceKey: "marketing",
      })
      .returning();
    await testDb.insert(schema.allocationRuleTargets).values({
      orgId: org.id,
      allocationRuleId: rule.id,
      projectId: project.id,
      percentage: "1.0000",
    });

    const entry = await createJournalEntry({
      orgId: org.id,
      entryNumber: "JE-2026-CAT-ALLOC",
      entryDate: "2026-01-10",
      entryType: "manual",
      description: "Category allocation",
      lines: [
        {
          accountId: services.id,
          debitAmount: "1000.00",
          allocationCategory: " Marketing ",
        },
        { accountId: bank.id, creditAmount: "1000.00" },
      ],
    });

    const [allocatedLine] = await testDb
      .select({
        projectId: schema.journalLines.projectId,
        description: schema.journalLines.description,
      })
      .from(schema.journalLines)
      .where(
        sql`${schema.journalLines.journalEntryId} = ${entry.id}
          AND ${schema.journalLines.accountId} = ${services.id}`
      );

    expect(allocatedLine).toEqual({
      projectId: project.id,
      description: "Allocated by Marketing category split (100.00%)",
    });
  });

  it("does not apply newly-created allocation rules when reversing untagged historical entries", async () => {
    const org = await createTestOrg(testDb);
    await seedStandardGlAccounts(org.id);
    const accounts = await getGlAccounts(org.id);
    const bank = accounts.find((account) => account.accountCode === "1111")!;
    const salaries = accounts.find((account) => account.accountCode === "6110")!;

    const original = await createJournalEntry({
      orgId: org.id,
      entryNumber: "JE-2026-HISTORICAL",
      entryDate: "2026-01-05",
      entryType: "manual",
      description: "Historical salary",
      lines: [
        { accountId: salaries.id, debitAmount: "1000.00" },
        { accountId: bank.id, creditAmount: "1000.00" },
      ],
    });

    const [ops] = await testDb
      .insert(schema.costCenters)
      .values({ orgId: org.id, code: "OPS", nameEn: "Operations" })
      .returning();
    const [rule] = await testDb
      .insert(schema.allocationRules)
      .values({
        orgId: org.id,
        ruleName: "Future salary split",
        sourceType: "gl_account",
        sourceId: salaries.id,
      })
      .returning();
    await testDb.insert(schema.allocationRuleTargets).values({
      orgId: org.id,
      allocationRuleId: rule.id,
      costCenterId: ops.id,
      percentage: "1.0000",
    });

    const reversal = await reverseJournalEntry({
      orgId: org.id,
      journalEntryId: original.id,
      reversalDate: "2026-01-15",
    });
    const reversalLines = await testDb
      .select({
        debitAmount: schema.journalLines.debitAmount,
        creditAmount: schema.journalLines.creditAmount,
        costCenterId: schema.journalLines.costCenterId,
      })
      .from(schema.journalLines)
      .where(sql`${schema.journalLines.journalEntryId} = ${reversal.id}`)
      .orderBy(schema.journalLines.lineNumber);

    expect(reversalLines).toEqual([
      { debitAmount: "0.00", creditAmount: "1000.00", costCenterId: null },
      { debitAmount: "1000.00", creditAmount: "0.00", costCenterId: null },
    ]);
  });

  it("uses the newest effective GL account allocation rule deterministically", async () => {
    const org = await createTestOrg(testDb);
    await seedStandardGlAccounts(org.id);
    const accounts = await getGlAccounts(org.id);
    const bank = accounts.find((account) => account.accountCode === "1111")!;
    const salaries = accounts.find((account) => account.accountCode === "6110")!;
    const [ops, admin] = await testDb
      .insert(schema.costCenters)
      .values([
        { orgId: org.id, code: "OPS", nameEn: "Operations" },
        { orgId: org.id, code: "ADM", nameEn: "Admin" },
      ])
      .returning();
    const [oldRule, newRule] = await testDb
      .insert(schema.allocationRules)
      .values([
        {
          orgId: org.id,
          ruleName: "Old split",
          sourceType: "gl_account",
          sourceId: salaries.id,
          effectiveFrom: "2026-01-01",
        },
        {
          orgId: org.id,
          ruleName: "New split",
          sourceType: "gl_account",
          sourceId: salaries.id,
          effectiveFrom: "2026-01-05",
        },
      ])
      .returning();
    await testDb.insert(schema.allocationRuleTargets).values([
      {
        orgId: org.id,
        allocationRuleId: oldRule.id,
        costCenterId: ops.id,
        percentage: "1.0000",
      },
      {
        orgId: org.id,
        allocationRuleId: newRule.id,
        costCenterId: admin.id,
        percentage: "1.0000",
      },
    ]);

    const entry = await createJournalEntry({
      orgId: org.id,
      entryNumber: "JE-2026-NEW-RULE",
      entryDate: "2026-01-10",
      entryType: "manual",
      description: "Newest rule salary",
      lines: [
        { accountId: salaries.id, debitAmount: "1000.00" },
        { accountId: bank.id, creditAmount: "1000.00" },
      ],
    });
    const [allocatedLine] = await testDb
      .select({
        costCenterId: schema.journalLines.costCenterId,
        description: schema.journalLines.description,
      })
      .from(schema.journalLines)
      .where(
        sql`${schema.journalLines.journalEntryId} = ${entry.id}
          AND ${schema.journalLines.accountId} = ${salaries.id}`
      );

    expect(allocatedLine).toEqual({
      costCenterId: admin.id,
      description: "Allocated by New split (100.00%)",
    });
  });

  it("fails posting when active allocation targets no longer total 100 percent", async () => {
    const org = await createTestOrg(testDb);
    await seedStandardGlAccounts(org.id);
    const accounts = await getGlAccounts(org.id);
    const bank = accounts.find((account) => account.accountCode === "1111")!;
    const salaries = accounts.find((account) => account.accountCode === "6110")!;
    const [ops, admin] = await testDb
      .insert(schema.costCenters)
      .values([
        { orgId: org.id, code: "OPS", nameEn: "Operations" },
        {
          orgId: org.id,
          code: "ADM",
          nameEn: "Admin",
          deletedAt: new Date("2026-01-09T00:00:00.000Z"),
        },
      ])
      .returning();
    const [rule] = await testDb
      .insert(schema.allocationRules)
      .values({
        orgId: org.id,
        ruleName: "Broken split",
        sourceType: "gl_account",
        sourceId: salaries.id,
      })
      .returning();
    await testDb.insert(schema.allocationRuleTargets).values([
      {
        orgId: org.id,
        allocationRuleId: rule.id,
        costCenterId: ops.id,
        percentage: "0.6000",
      },
      {
        orgId: org.id,
        allocationRuleId: rule.id,
        costCenterId: admin.id,
        percentage: "0.4000",
      },
    ]);

    await expect(
      createJournalEntry({
        orgId: org.id,
        entryNumber: "JE-2026-BROKEN-RULE",
        entryDate: "2026-01-10",
        entryType: "manual",
        description: "Broken rule salary",
        lines: [
          { accountId: salaries.id, debitAmount: "1000.00" },
          { accountId: bank.id, creditAmount: "1000.00" },
        ],
      })
    ).rejects.toThrow(/targets must total 1.0000/);
  });

  it("posts PP36 tax payment events to GL idempotently", async () => {
    const org = await createTestOrg(testDb);
    await seedStandardGlAccounts(org.id);

    const [filing] = await testDb
      .insert(schema.vatFilings)
      .values({
        orgId: org.id,
        filingType: "pp36",
        filingKind: "ordinary",
        periodYear: 2026,
        periodMonth: 4,
        status: "filed",
        pp36VatTotal: "700.00",
        filedAt: new Date("2026-05-10T04:00:00.000Z"),
        filedByUserId: "user_1",
        paymentStatus: "tax_paid",
      })
      .returning();

    const [event] = await testDb
      .insert(schema.taxPaymentEvents)
      .values({
        orgId: org.id,
        filingId: filing.id,
        eventType: "payment",
        paidAt: new Date("2026-05-15T05:00:00.000Z"),
        amount: "700.00",
        receiptNo: "RD-PP36-1",
        idempotencyKey: "pp36-payment-1",
        createdByUserId: "user_1",
      })
      .returning();

    const entry = await postTaxPaymentEventJournalEntry({
      orgId: org.id,
      taxPaymentEventId: event.id,
    });
    const second = await postTaxPaymentEventJournalEntry({
      orgId: org.id,
      taxPaymentEventId: event.id,
    });

    expect(second.id).toBe(entry.id);
    expect(entry.entryType).toBe("auto_payment");
    expect(entry.entryDate).toBe("2026-05-15");
    expect(entry.postingKind).toBe("tax_payment_pp36");
    expect(entry.sourceEntityType).toBe("tax_payment_events");
    expect(entry.sourceEntityId).toBe(event.id);

    const rows = await testDb
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
      .where(sql`${schema.journalLines.journalEntryId} = ${entry.id}`)
      .orderBy(schema.journalLines.lineNumber);
    expect(rows).toEqual([
      { accountCode: "2152", debitAmount: "700.00", creditAmount: "0.00" },
      { accountCode: "1111", debitAmount: "0.00", creditAmount: "700.00" },
    ]);

    const [{ entryCount }] = await testDb
      .select({ entryCount: sql<number>`COUNT(*)::int` })
      .from(schema.journalEntries)
      .where(sql`${schema.journalEntries.sourceEntityId} = ${event.id}`);
    expect(entryCount).toBe(1);

    const [updatedEvent] = await testDb
      .select()
      .from(schema.taxPaymentEvents)
      .where(sql`${schema.taxPaymentEvents.id} = ${event.id}`);
    expect(updatedEvent.eventStatus).toBe("posted_to_gl");
    expect(updatedEvent.postingOutboxStatus).toBe("posted");
  });

  it("posts PP30 tax payment events against the PP30 net payable account", async () => {
    const org = await createTestOrg(testDb);
    await seedStandardGlAccounts(org.id);

    const [filing] = await testDb
      .insert(schema.vatFilings)
      .values({
        orgId: org.id,
        filingType: "pp30",
        filingKind: "ordinary",
        periodYear: 2026,
        periodMonth: 4,
        status: "filed",
        outputVatTotal: "900.00",
        inputVatTotal: "250.00",
        netPayable: "650.00",
        filedAt: new Date("2026-05-10T04:00:00.000Z"),
        filedByUserId: "user_1",
        paymentStatus: "tax_paid",
      })
      .returning();

    const [event] = await testDb
      .insert(schema.taxPaymentEvents)
      .values({
        orgId: org.id,
        filingId: filing.id,
        eventType: "payment",
        paidAt: new Date("2026-05-16T18:30:00.000Z"),
        amount: "650.00",
        receiptNo: "RD-PP30-1",
        idempotencyKey: "pp30-payment-1",
        createdByUserId: "user_1",
      })
      .returning();

    const entry = await postTaxPaymentEventJournalEntry({
      orgId: org.id,
      taxPaymentEventId: event.id,
    });

    expect(entry.entryType).toBe("auto_pp30_settlement");
    expect(entry.entryDate).toBe("2026-05-17");
    expect(entry.postingKind).toBe("tax_payment_pp30");

    const rows = await testDb
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
      .where(sql`${schema.journalLines.journalEntryId} = ${entry.id}`)
      .orderBy(schema.journalLines.lineNumber);
    expect(rows).toEqual([
      { accountCode: "2151", debitAmount: "650.00", creditAmount: "0.00" },
      { accountCode: "1111", debitAmount: "0.00", creditAmount: "650.00" },
    ]);
  });

  it("processes tax payment events from the posting outbox", async () => {
    const org = await createTestOrg(testDb);
    await seedStandardGlAccounts(org.id);

    const [filing] = await testDb
      .insert(schema.vatFilings)
      .values({
        orgId: org.id,
        filingType: "pp30",
        filingKind: "ordinary",
        periodYear: 2026,
        periodMonth: 4,
        status: "filed",
        outputVatTotal: "900.00",
        inputVatTotal: "250.00",
        netPayable: "650.00",
        filedAt: new Date("2026-05-10T04:00:00.000Z"),
        filedByUserId: "user_1",
        paymentStatus: "tax_paid",
      })
      .returning();
    const [event] = await testDb
      .insert(schema.taxPaymentEvents)
      .values({
        orgId: org.id,
        filingId: filing.id,
        eventType: "payment",
        paidAt: new Date("2026-05-16T18:30:00.000Z"),
        amount: "650.00",
        receiptNo: "RD-PP30-OUTBOX",
        idempotencyKey: "pp30-payment-outbox",
        createdByUserId: "user_1",
      })
      .returning();
    const outbox = await enqueuePostingOutbox({
      orgId: org.id,
      sourceEntityType: "tax_payment_events",
      sourceEntityId: event.id,
      eventType: "payment",
      payload: { paymentDate: "2026-05-17" },
    });

    const posted = await processPostingOutboxRow({
      orgId: org.id,
      postingOutboxId: outbox.id,
    });

    expect(posted.postingStatus).toBe("posted");
    expect(posted.journalEntryId).toBeTruthy();
    const [entry] = await testDb
      .select()
      .from(schema.journalEntries)
      .where(sql`${schema.journalEntries.sourceEntityId} = ${event.id}`);
    expect(entry.postingKind).toBe("tax_payment_pp30");

    const [updatedEvent] = await testDb
      .select()
      .from(schema.taxPaymentEvents)
      .where(sql`${schema.taxPaymentEvents.id} = ${event.id}`);
    expect(updatedEvent.postingOutboxStatus).toBe("posted");
  });

  it("posts PP36 self-assessment and later PP30 reclaim transfer entries", async () => {
    const org = await createTestOrg(testDb);
    const vendor = await createTestVendor(testDb, org.id, { name: "Foreign SaaS" });
    await seedStandardGlAccounts(org.id);

    const [obligation] = await testDb
      .insert(schema.pp36Obligations)
      .values({
        orgId: org.id,
        vendorId: vendor.id,
        vendorCountryCode: "SG",
        serviceDescription: "Cloud subscription",
        baseAmountThb: "1000.00",
        vatAmount: "70.00",
        vatRate: "0.0700",
        occurredOn: "2026-04-20",
        paymentDate: "2026-04-20",
        taxPointDate: "2026-04-20",
        periodBasis: "payment_date",
        pp36PeriodYear: 2026,
        pp36PeriodMonth: 4,
        pp30ReclaimEligiblePeriodYear: 2026,
        pp30ReclaimEligiblePeriodMonth: 5,
        pp30ReclaimExpiryPeriodYear: 2026,
        pp30ReclaimExpiryPeriodMonth: 10,
        status: "needs_review",
        sourceSnapshot: { source: "general-ledger-test" },
        sourceSnapshotHash: "a".repeat(64),
      })
      .returning();

    const [pp36Filing] = await testDb
      .insert(schema.vatFilings)
      .values({
        orgId: org.id,
        filingType: "pp36",
        filingKind: "ordinary",
        periodYear: 2026,
        periodMonth: 4,
        status: "draft",
        pp36VatTotal: "70.00",
        paymentStatus: "waiting_to_pay_tax",
      })
      .returning();
    const [pp36Line] = await testDb
      .insert(schema.vatFilingLines)
      .values({
        orgId: org.id,
        filingId: pp36Filing.id,
        lineType: "pp36_obligation",
        pp36ObligationId: obligation.id,
        amount: "70.00",
        vatAmount: "70.00",
        frozenSnapshot: { source: "pp36" },
        frozenSnapshotHash: "b".repeat(64),
      })
      .returning();
    await testDb
      .update(schema.pp36Obligations)
      .set({
        pp36FilingId: pp36Filing.id,
        pp36FilingLineId: pp36Line.id,
        pp36PaidAt: new Date("2026-05-15T05:00:00.000Z"),
        status: "eligible_for_pp30_reclaim",
      })
      .where(sql`${schema.pp36Obligations.id} = ${obligation.id}`);
    await testDb
      .update(schema.vatFilings)
      .set({
        status: "filed",
        filedAt: new Date("2026-05-10T04:00:00.000Z"),
        filedByUserId: "user_1",
      })
      .where(sql`${schema.vatFilings.id} = ${pp36Filing.id}`);

    const pp36Entry = await postVatFilingPp36LifecycleJournalEntry({
      orgId: org.id,
      filingId: pp36Filing.id,
    });
    const pp36Again = await postVatFilingPp36LifecycleJournalEntry({
      orgId: org.id,
      filingId: pp36Filing.id,
    });

    expect(pp36Entry?.id).toBeDefined();
    expect(pp36Again?.id).toBe(pp36Entry?.id);
    expect(pp36Entry?.entryType).toBe("auto_accrual");
    expect(pp36Entry?.entryDate).toBe("2026-04-30");
    expect(pp36Entry?.postingKind).toBe("vat_pp36_self_assessment");

    const pp36Rows = await testDb
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
      .where(sql`${schema.journalLines.journalEntryId} = ${pp36Entry!.id}`)
      .orderBy(schema.journalLines.lineNumber);
    expect(pp36Rows).toEqual([
      { accountCode: "1253", debitAmount: "70.00", creditAmount: "0.00" },
      { accountCode: "2152", debitAmount: "0.00", creditAmount: "70.00" },
    ]);

    const [pp30Filing] = await testDb
      .insert(schema.vatFilings)
      .values({
        orgId: org.id,
        filingType: "pp30",
        filingKind: "ordinary",
        periodYear: 2026,
        periodMonth: 5,
        status: "draft",
        pp36ReclaimTotal: "70.00",
        paymentStatus: "not_required",
      })
      .returning();
    await testDb.insert(schema.vatFilingLines).values({
      orgId: org.id,
      filingId: pp30Filing.id,
      lineType: "pp36_reclaim",
      pp36ObligationId: obligation.id,
      amount: "70.00",
      vatAmount: "70.00",
      frozenSnapshot: { source: "pp30-reclaim" },
      frozenSnapshotHash: "c".repeat(64),
    });
    await testDb
      .update(schema.vatFilings)
      .set({
        status: "filed",
        filedAt: new Date("2026-06-10T04:00:00.000Z"),
        filedByUserId: "user_1",
      })
      .where(sql`${schema.vatFilings.id} = ${pp30Filing.id}`);

    const reclaimEntry = await postVatFilingPp36LifecycleJournalEntry({
      orgId: org.id,
      filingId: pp30Filing.id,
    });

    expect(reclaimEntry?.entryType).toBe("auto_pp30_settlement");
    expect(reclaimEntry?.entryDate).toBe("2026-05-31");
    expect(reclaimEntry?.postingKind).toBe("vat_pp36_reclaim_transfer");

    const reclaimRows = await testDb
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
      .where(sql`${schema.journalLines.journalEntryId} = ${reclaimEntry!.id}`)
      .orderBy(schema.journalLines.lineNumber);
    expect(reclaimRows).toEqual([
      { accountCode: "1251", debitAmount: "70.00", creditAmount: "0.00" },
      { accountCode: "1253", debitAmount: "0.00", creditAmount: "70.00" },
    ]);
  });

  it("posts PND.50 CIT accruals idempotently", async () => {
    const org = await createTestOrg(testDb);
    const [filing] = await testDb
      .insert(schema.citFilings)
      .values({
        orgId: org.id,
        taxYear: 2026,
        filingType: "pnd50",
        periodStart: "2026-01-01",
        periodEnd: "2026-12-31",
        filingStatus: "draft",
        citCalculated: "202000.00",
        whtCreditsUsed: "3000.00",
        prepaymentCreditsUsed: "50000.00",
        citPayable: "149000.00",
      })
      .returning();

    const entry = await postCitAccrualJournalEntry({
      orgId: org.id,
      citFilingId: filing.id,
      createdByUserId: "user-1",
    });
    const second = await postCitAccrualJournalEntry({
      orgId: org.id,
      citFilingId: filing.id,
      createdByUserId: "user-1",
    });

    expect(second.id).toBe(entry.id);
    expect(entry.entryDate).toBe("2026-12-31");
    expect(entry.entryType).toBe("auto_accrual");
    expect(entry.postingKind).toBe("cit_accrual");
    expect(entry.sourceEntityType).toBe("cit_filings");

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
      .where(sql`${schema.journalLines.journalEntryId} = ${entry.id}`)
      .orderBy(schema.journalLines.lineNumber);

    expect(lines).toEqual([
      { accountCode: "6810", debitAmount: "202000.00", creditAmount: "0.00" },
      { accountCode: "1180", debitAmount: "0.00", creditAmount: "3000.00" },
      { accountCode: "1186", debitAmount: "0.00", creditAmount: "50000.00" },
      { accountCode: "2170", debitAmount: "0.00", creditAmount: "149000.00" },
    ]);

    const [outbox] = await testDb
      .select()
      .from(schema.postingOutbox)
      .where(sql`${schema.postingOutbox.sourceEntityId} = ${filing.id}`)
      .limit(1);
    expect(outbox).toMatchObject({
      sourceEntityType: "cit_filings",
      eventType: "accrual",
      postingDate: "2026-12-31",
      postingStatus: "pending",
    });

    const posted = await processPostingOutboxRow({
      orgId: org.id,
      postingOutboxId: outbox.id,
    });
    expect(posted).toMatchObject({
      postingStatus: "posted",
      journalEntryId: entry.id,
    });
  });

  it("posts zero-net-payable PND.50 accruals and omits the payable line", async () => {
    const org = await createTestOrg(testDb);
    const [filing] = await testDb
      .insert(schema.citFilings)
      .values({
        orgId: org.id,
        taxYear: 2026,
        filingType: "pnd50",
        periodStart: "2026-01-01",
        periodEnd: "2026-12-31",
        filingStatus: "draft",
        citCalculated: "100000.00",
        whtCreditsUsed: "40000.00",
        prepaymentCreditsUsed: "60000.00",
        citPayable: "0.00",
      })
      .returning();

    const entry = await postCitAccrualJournalEntry({
      orgId: org.id,
      citFilingId: filing.id,
      createdByUserId: "user-1",
      enqueueOutbox: false,
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
      .where(sql`${schema.journalLines.journalEntryId} = ${entry.id}`)
      .orderBy(schema.journalLines.lineNumber);

    expect(lines).toEqual([
      { accountCode: "6810", debitAmount: "100000.00", creditAmount: "0.00" },
      { accountCode: "1180", debitAmount: "0.00", creditAmount: "40000.00" },
      { accountCode: "1186", debitAmount: "0.00", creditAmount: "60000.00" },
    ]);
  });

  it("reposts CIT accruals after the previous journal entry is reversed", async () => {
    const org = await createTestOrg(testDb);
    const [filing] = await testDb
      .insert(schema.citFilings)
      .values({
        orgId: org.id,
        taxYear: 2026,
        filingType: "pnd50",
        periodStart: "2026-01-01",
        periodEnd: "2026-12-31",
        filingStatus: "draft",
        citCalculated: "50000.00",
        whtCreditsUsed: "0.00",
        prepaymentCreditsUsed: "0.00",
        citPayable: "50000.00",
      })
      .returning();

    const first = await postCitAccrualJournalEntry({
      orgId: org.id,
      citFilingId: filing.id,
      createdByUserId: "user-1",
    });
    const [outbox] = await testDb
      .select()
      .from(schema.postingOutbox)
      .where(sql`${schema.postingOutbox.sourceEntityId} = ${filing.id}`)
      .limit(1);
    await processPostingOutboxRow({ orgId: org.id, postingOutboxId: outbox.id });
    await reverseJournalEntry({
      orgId: org.id,
      journalEntryId: first.id,
      reversalDate: "2026-12-31",
      createdByUserId: "user-2",
    });

    const second = await postCitAccrualJournalEntry({
      orgId: org.id,
      citFilingId: filing.id,
      createdByUserId: "user-1",
    });

    expect(second.id).not.toBe(first.id);
    const [updatedOutbox] = await testDb
      .select()
      .from(schema.postingOutbox)
      .where(sql`${schema.postingOutbox.id} = ${outbox.id}`);
    expect(updatedOutbox).toMatchObject({
      postingStatus: "posted",
      journalEntryId: second.id,
    });
  });

  it("posts submitted CIT filing payments idempotently", async () => {
    const org = await createTestOrg(testDb);
    const [filing] = await testDb
      .insert(schema.citFilings)
      .values({
        orgId: org.id,
        taxYear: 2026,
        filingType: "pnd50",
        periodStart: "2026-01-01",
        periodEnd: "2026-12-31",
        filingStatus: "submitted",
        submittedAt: new Date("2027-05-15T00:00:00Z"),
        citPayable: "149000.00",
      })
      .returning();

    const paidAt = new Date("2027-05-20T00:00:00Z");
    const entry = await postCitPaymentJournalEntry({
      orgId: org.id,
      citFilingId: filing.id,
      paidAt,
      createdByUserId: "user-1",
    });
    const second = await postCitPaymentJournalEntry({
      orgId: org.id,
      citFilingId: filing.id,
      paidAt,
      createdByUserId: "user-1",
    });

    expect(second.id).toBe(entry.id);
    expect(entry.entryDate).toBe("2027-05-20");
    expect(entry.entryType).toBe("auto_payment");
    expect(entry.postingKind).toBe("cit_payment");

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
      .where(sql`${schema.journalLines.journalEntryId} = ${entry.id}`)
      .orderBy(schema.journalLines.lineNumber);

    expect(lines).toEqual([
      { accountCode: "2170", debitAmount: "149000.00", creditAmount: "0.00" },
      { accountCode: "1111", debitAmount: "0.00", creditAmount: "149000.00" },
    ]);
    const [updatedFiling] = await testDb
      .select({ paidAt: schema.citFilings.paidAt })
      .from(schema.citFilings)
      .where(sql`${schema.citFilings.id} = ${filing.id}`);
    expect(updatedFiling.paidAt).toBeTruthy();

    const [outbox] = await testDb
      .select()
      .from(schema.postingOutbox)
      .where(sql`${schema.postingOutbox.sourceEntityId} = ${filing.id}`)
      .limit(1);
    expect(outbox).toMatchObject({
      sourceEntityType: "cit_filings",
      eventType: "payment",
      postingDate: "2027-05-20",
      postingStatus: "pending",
    });

    const posted = await processPostingOutboxRow({
      orgId: org.id,
      postingOutboxId: outbox.id,
    });
    expect(posted).toMatchObject({
      postingStatus: "posted",
      journalEntryId: entry.id,
    });
  });

  it("posts PND.51 payments to prepaid CIT instead of CIT payable", async () => {
    const org = await createTestOrg(testDb);
    const [filing] = await testDb
      .insert(schema.citFilings)
      .values({
        orgId: org.id,
        taxYear: 2026,
        filingType: "pnd51",
        periodStart: "2026-01-01",
        periodEnd: "2026-06-30",
        filingStatus: "submitted",
        submittedAt: new Date("2026-08-15T00:00:00Z"),
        citPayable: "50000.00",
      })
      .returning();

    const entry = await postCitPaymentJournalEntry({
      orgId: org.id,
      citFilingId: filing.id,
      paidAt: new Date("2026-08-31T00:00:00Z"),
      createdByUserId: "user-1",
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
      .where(sql`${schema.journalLines.journalEntryId} = ${entry.id}`)
      .orderBy(schema.journalLines.lineNumber);

    expect(lines).toEqual([
      { accountCode: "1186", debitAmount: "50000.00", creditAmount: "0.00" },
      { accountCode: "1111", debitAmount: "0.00", creditAmount: "50000.00" },
    ]);
  });

  it("reposts CIT payments after the previous journal entry is reversed", async () => {
    const org = await createTestOrg(testDb);
    const [filing] = await testDb
      .insert(schema.citFilings)
      .values({
        orgId: org.id,
        taxYear: 2026,
        filingType: "pnd50",
        periodStart: "2026-01-01",
        periodEnd: "2026-12-31",
        filingStatus: "submitted",
        submittedAt: new Date("2027-05-15T00:00:00Z"),
        citPayable: "149000.00",
      })
      .returning();

    const paidAt = new Date("2027-05-20T00:00:00Z");
    const first = await postCitPaymentJournalEntry({
      orgId: org.id,
      citFilingId: filing.id,
      paidAt,
      createdByUserId: "user-1",
    });
    const [outbox] = await testDb
      .select()
      .from(schema.postingOutbox)
      .where(sql`${schema.postingOutbox.sourceEntityId} = ${filing.id}`)
      .limit(1);
    await processPostingOutboxRow({ orgId: org.id, postingOutboxId: outbox.id });
    await reverseJournalEntry({
      orgId: org.id,
      journalEntryId: first.id,
      reversalDate: "2027-05-21",
      createdByUserId: "user-2",
    });

    const second = await postCitPaymentJournalEntry({
      orgId: org.id,
      citFilingId: filing.id,
      paidAt,
      createdByUserId: "user-1",
    });

    expect(second.id).not.toBe(first.id);
    const [updatedOutbox] = await testDb
      .select()
      .from(schema.postingOutbox)
      .where(sql`${schema.postingOutbox.id} = ${outbox.id}`);
    expect(updatedOutbox).toMatchObject({
      postingStatus: "posted",
      journalEntryId: second.id,
    });
  });

  it("posts year-end close entries after PND.50 and CIT accrual", async () => {
    const org = await createTestOrg(testDb);
    await seedStandardGlAccounts(org.id);
    const accounts = await getGlAccounts(org.id);
    const byCode = new Map(accounts.map((account) => [account.accountCode, account]));

    await createJournalEntry({
      orgId: org.id,
      entryNumber: "JE-2026-OPERATIONS",
      entryDate: "2026-12-30",
      entryType: "manual",
      description: "Year-end operations before close",
      lines: [
        {
          accountId: byCode.get("1111")!.id,
          debitAmount: "1000000.00",
          description: "Cash sales",
        },
        {
          accountId: byCode.get("4110")!.id,
          creditAmount: "1000000.00",
          description: "Cash sales",
        },
        {
          accountId: byCode.get("5110")!.id,
          debitAmount: "300000.00",
          description: "COGS",
        },
        {
          accountId: byCode.get("6110")!.id,
          debitAmount: "100000.00",
          description: "Salaries",
        },
        {
          accountId: byCode.get("1111")!.id,
          creditAmount: "400000.00",
          description: "Cash expenses",
        },
      ],
    });

    const [filing] = await testDb
      .insert(schema.citFilings)
      .values({
        orgId: org.id,
        taxYear: 2026,
        filingType: "pnd50",
        periodStart: "2026-01-01",
        periodEnd: "2026-12-31",
        filingStatus: "draft",
        citCalculated: "50000.00",
        whtCreditsUsed: "0.00",
        prepaymentCreditsUsed: "0.00",
        citPayable: "50000.00",
      })
      .returning();
    await postCitAccrualJournalEntry({
      orgId: org.id,
      citFilingId: filing.id,
      createdByUserId: "user-1",
    });

    const result = await postYearEndCloseJournalEntries({
      orgId: org.id,
      taxYear: 2026,
      createdByUserId: "user-1",
    });
    const second = await postYearEndCloseJournalEntries({
      orgId: org.id,
      taxYear: 2026,
      createdByUserId: "user-1",
    });

    expect(second.revenueSummaryEntry.id).toBe(result.revenueSummaryEntry.id);
    expect(second.retainedEarningsEntry!.id).toBe(result.retainedEarningsEntry!.id);
    expect(result.revenueSummaryEntry.entryType).toBe("auto_year_end_close");
    expect(result.revenueSummaryEntry.postingKind).toBe("year_end_close_revenue_summary");
    expect(result.retainedEarningsEntry!.postingKind).toBe("year_end_close_to_retained_earnings");

    const summaryLines = await testDb
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
      .where(sql`${schema.journalLines.journalEntryId} = ${result.revenueSummaryEntry.id}`)
      .orderBy(schema.glAccounts.accountCode);
    expect(summaryLines).toEqual([
      { accountCode: "3230", debitAmount: "0.00", creditAmount: "550000.00" },
      { accountCode: "4110", debitAmount: "1000000.00", creditAmount: "0.00" },
      { accountCode: "5110", debitAmount: "0.00", creditAmount: "300000.00" },
      { accountCode: "6110", debitAmount: "0.00", creditAmount: "100000.00" },
      { accountCode: "6810", debitAmount: "0.00", creditAmount: "50000.00" },
    ]);

    const retainedLines = await testDb
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
      .where(sql`${schema.journalLines.journalEntryId} = ${result.retainedEarningsEntry!.id}`)
      .orderBy(schema.glAccounts.accountCode);
    expect(retainedLines).toEqual([
      { accountCode: "3220", debitAmount: "0.00", creditAmount: "550000.00" },
      { accountCode: "3230", debitAmount: "550000.00", creditAmount: "0.00" },
    ]);
  });

  it("blocks year-end close when CIT is fully offset by credits but no accrual exists", async () => {
    const org = await createTestOrg(testDb);
    await seedStandardGlAccounts(org.id);
    const accounts = await getGlAccounts(org.id);
    const byCode = new Map(accounts.map((account) => [account.accountCode, account]));

    await createJournalEntry({
      orgId: org.id,
      entryNumber: "JE-2026-ZERO-NET-CIT",
      entryDate: "2026-12-30",
      entryType: "manual",
      description: "Operations before zero-net CIT close",
      lines: [
        { accountId: byCode.get("1111")!.id, debitAmount: "500000.00" },
        { accountId: byCode.get("4110")!.id, creditAmount: "500000.00" },
      ],
    });
    await testDb.insert(schema.citFilings).values({
      orgId: org.id,
      taxYear: 2026,
      filingType: "pnd50",
      periodStart: "2026-01-01",
      periodEnd: "2026-12-31",
      filingStatus: "draft",
      citCalculated: "100000.00",
      whtCreditsUsed: "40000.00",
      prepaymentCreditsUsed: "60000.00",
      citPayable: "0.00",
    });

    await expect(
      postYearEndCloseJournalEntries({
        orgId: org.id,
        taxYear: 2026,
        createdByUserId: "user-1",
      })
    ).rejects.toThrow("Year-end close requires CIT accrual JE");
  });

  it("posts non-calendar loss-year close without requiring CIT accrual", async () => {
    const org = await createTestOrg(testDb);
    await seedStandardGlAccounts(org.id);
    const accounts = await getGlAccounts(org.id);
    const byCode = new Map(accounts.map((account) => [account.accountCode, account]));

    await createJournalEntry({
      orgId: org.id,
      entryNumber: "JE-FY-LOSS",
      entryDate: "2027-03-15",
      entryType: "manual",
      description: "Non-calendar loss year operations",
      lines: [
        {
          accountId: byCode.get("1111")!.id,
          debitAmount: "100000.00",
          description: "Sales",
        },
        {
          accountId: byCode.get("4110")!.id,
          creditAmount: "100000.00",
          description: "Sales",
        },
        {
          accountId: byCode.get("6110")!.id,
          debitAmount: "300000.00",
          description: "Expenses",
        },
        {
          accountId: byCode.get("1111")!.id,
          creditAmount: "300000.00",
          description: "Expenses",
        },
      ],
    });

    await testDb.insert(schema.citFilings).values({
      orgId: org.id,
      taxYear: 2026,
      filingType: "pnd50",
      periodStart: "2026-04-01",
      periodEnd: "2027-03-31",
      filingStatus: "draft",
      citPayable: "0.00",
      taxableLoss: "200000.00",
    });

    const result = await postYearEndCloseJournalEntries({
      orgId: org.id,
      taxYear: 2026,
      createdByUserId: "user-1",
    });

    expect(result.revenueSummaryEntry.entryDate).toBe("2027-03-31");
    expect(result.retainedEarningsEntry!.entryDate).toBe("2027-03-31");

    const retainedLines = await testDb
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
      .where(sql`${schema.journalLines.journalEntryId} = ${result.retainedEarningsEntry!.id}`)
      .orderBy(schema.glAccounts.accountCode);
    expect(retainedLines).toEqual([
      { accountCode: "3220", debitAmount: "200000.00", creditAmount: "0.00" },
      { accountCode: "3230", debitAmount: "0.00", creditAmount: "200000.00" },
    ]);
  });

  it("closes flat years without a retained-earnings transfer", async () => {
    const org = await createTestOrg(testDb);
    await seedStandardGlAccounts(org.id);
    const accounts = await getGlAccounts(org.id);
    const byCode = new Map(accounts.map((account) => [account.accountCode, account]));

    await createJournalEntry({
      orgId: org.id,
      entryNumber: "JE-FLAT",
      entryDate: "2026-12-15",
      entryType: "manual",
      description: "Flat year operations",
      lines: [
        {
          accountId: byCode.get("1111")!.id,
          debitAmount: "500000.00",
          description: "Sales",
        },
        {
          accountId: byCode.get("4110")!.id,
          creditAmount: "500000.00",
          description: "Sales",
        },
        {
          accountId: byCode.get("6110")!.id,
          debitAmount: "500000.00",
          description: "Expenses",
        },
        {
          accountId: byCode.get("1111")!.id,
          creditAmount: "500000.00",
          description: "Expenses",
        },
      ],
    });

    await testDb.insert(schema.citFilings).values({
      orgId: org.id,
      taxYear: 2026,
      filingType: "pnd50",
      periodStart: "2026-01-01",
      periodEnd: "2026-12-31",
      filingStatus: "draft",
      citPayable: "0.00",
    });

    const result = await postYearEndCloseJournalEntries({
      orgId: org.id,
      taxYear: 2026,
    });
    const second = await postYearEndCloseJournalEntries({
      orgId: org.id,
      taxYear: 2026,
    });

    expect(result.retainedEarningsEntry).toBeNull();
    expect(second.revenueSummaryEntry.id).toBe(result.revenueSummaryEntry.id);
    expect(second.retainedEarningsEntry).toBeNull();
  });

  it("closes contra-direction P&L balances instead of skipping them", async () => {
    const org = await createTestOrg(testDb);
    await seedStandardGlAccounts(org.id);
    const accounts = await getGlAccounts(org.id);
    const byCode = new Map(accounts.map((account) => [account.accountCode, account]));

    await createJournalEntry({
      orgId: org.id,
      entryNumber: "JE-CONTRA-PNL",
      entryDate: "2026-12-15",
      entryType: "manual",
      description: "Contra P&L balances",
      lines: [
        {
          accountId: byCode.get("4110")!.id,
          debitAmount: "100000.00",
          description: "Sales returns exceed sales",
        },
        {
          accountId: byCode.get("1111")!.id,
          creditAmount: "100000.00",
          description: "Sales returns exceed sales",
        },
        {
          accountId: byCode.get("1111")!.id,
          debitAmount: "30000.00",
          description: "Expense refund",
        },
        {
          accountId: byCode.get("6110")!.id,
          creditAmount: "30000.00",
          description: "Expense refund",
        },
      ],
    });

    await testDb.insert(schema.citFilings).values({
      orgId: org.id,
      taxYear: 2026,
      filingType: "pnd50",
      periodStart: "2026-01-01",
      periodEnd: "2026-12-31",
      filingStatus: "draft",
      citPayable: "0.00",
    });

    const result = await postYearEndCloseJournalEntries({
      orgId: org.id,
      taxYear: 2026,
    });
    const summaryLines = await testDb
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
      .where(sql`${schema.journalLines.journalEntryId} = ${result.revenueSummaryEntry.id}`)
      .orderBy(schema.glAccounts.accountCode);

    expect(summaryLines).toEqual([
      { accountCode: "3230", debitAmount: "70000.00", creditAmount: "0.00" },
      { accountCode: "4110", debitAmount: "0.00", creditAmount: "100000.00" },
      { accountCode: "6110", debitAmount: "30000.00", creditAmount: "0.00" },
    ]);
  });

  it("blocks year-end close until CIT accrual is posted", async () => {
    const org = await createTestOrg(testDb);
    const [filing] = await testDb
      .insert(schema.citFilings)
      .values({
        orgId: org.id,
        taxYear: 2026,
        filingType: "pnd50",
        periodStart: "2026-01-01",
        periodEnd: "2026-12-31",
        filingStatus: "draft",
        citCalculated: "50000.00",
        whtCreditsUsed: "0.00",
        prepaymentCreditsUsed: "0.00",
        citPayable: "50000.00",
      })
      .returning();
    expect(filing.id).toBeTruthy();

    await expect(
      postYearEndCloseJournalEntries({ orgId: org.id, taxYear: 2026 })
    ).rejects.toThrow(/CIT accrual JE/);

    const [accrualEntry] = await testDb
      .insert(schema.journalEntries)
      .values({
        orgId: org.id,
        entryNumber: "JE-2026-CIT-REVERSED",
        entryDate: "2026-12-31",
        postingDate: "2026-12-31",
        periodYear: 2026,
        periodMonth: 12,
        entryType: "auto_accrual",
        postingKind: "cit_accrual",
        sourceEntityType: "cit_filings",
        sourceEntityId: filing.id,
        description: "CIT accrual reversed",
        notes: "reversed accrual readiness test",
      })
      .returning();
    const [reversalEntry] = await testDb
      .insert(schema.journalEntries)
      .values({
        orgId: org.id,
        entryNumber: "JE-2026-CIT-REVERSAL",
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
        notes: "reversed accrual readiness test",
      })
      .returning();
    await testDb
      .update(schema.journalEntries)
      .set({ reversedByEntryId: reversalEntry.id })
      .where(sql`${schema.journalEntries.id} = ${accrualEntry.id}`);

    await expect(
      postYearEndCloseJournalEntries({ orgId: org.id, taxYear: 2026 })
    ).rejects.toThrow(/CIT accrual JE/);
  });

  it("rejects unbalanced headers and bad debit-credit line shape", async () => {
    const org = await createTestOrg(testDb);
    await seedStandardGlAccounts(org.id);
    const [bank] = await testDb
      .select()
      .from(schema.glAccounts)
      .where(sql`${schema.glAccounts.accountCode} = '1111'`);

    await expect(
      testDb.insert(schema.journalEntries).values({
        orgId: org.id,
        entryNumber: "JE-2026-BAD",
        entryDate: "2026-02-01",
        postingDate: "2026-02-01",
        periodYear: 2026,
        periodMonth: 2,
        entryType: "manual",
        description: "Bad header",
        totalDebit: "100.00",
        totalCredit: "99.00",
      })
    ).rejects.toThrow(/Failed query/);

    await expect(
      testDb.transaction(async (tx) => {
        const [entry] = await tx
          .insert(schema.journalEntries)
          .values({
            orgId: org.id,
            entryNumber: "JE-2026-LINE-BAD",
            entryDate: "2026-02-01",
            postingDate: "2026-02-01",
            periodYear: 2026,
            periodMonth: 2,
            entryType: "manual",
            description: "Bad line",
            totalDebit: "100.00",
            totalCredit: "100.00",
          })
          .returning();

        await tx.insert(schema.journalLines).values({
          orgId: org.id,
          journalEntryId: entry.id,
          lineNumber: 1,
          accountId: bank.id,
          debitAmount: "100.00",
          creditAmount: "100.00",
        });
      })
    ).rejects.toThrow(/Failed query/);
  });

  it("enforces auto-posting idempotency by source and posting kind", async () => {
    const org = await createTestOrg(testDb);
    await seedStandardGlAccounts(org.id);
    const accounts = await getGlAccounts(org.id);
    const bank = accounts.find((account) => account.accountCode === "1111");
    const revenue = accounts.find((account) => account.accountCode === "4110");
    const cogs = accounts.find((account) => account.accountCode === "5110");
    const inventory = accounts.find((account) => account.accountCode === "1160");
    expect(bank).toBeDefined();
    expect(revenue).toBeDefined();
    expect(cogs).toBeDefined();
    expect(inventory).toBeDefined();
    const sourceEntityId = "11111111-1111-4111-8111-111111111111";

    await createJournalEntry({
      orgId: org.id,
      entryNumber: "JE-2026-AUTO-1",
      entryDate: "2026-02-03",
      entryType: "auto_sales",
      postingKind: "pos_primary_sale",
      sourceEntityType: "sales_transactions",
      sourceEntityId,
      description: "POS sale revenue",
      lines: [
        { accountId: bank!.id, debitAmount: "107.00" },
        { accountId: revenue!.id, creditAmount: "107.00" },
      ],
    });

    await expect(
      createJournalEntry({
        orgId: org.id,
        entryNumber: "JE-2026-AUTO-DUP",
        entryDate: "2026-02-03",
        entryType: "auto_sales",
        postingKind: "pos_primary_sale",
        sourceEntityType: "sales_transactions",
        sourceEntityId,
        description: "Duplicate POS sale revenue",
        lines: [
          { accountId: bank!.id, debitAmount: "107.00" },
          { accountId: revenue!.id, creditAmount: "107.00" },
        ],
      })
    ).rejects.toThrow(/Failed query/);

    await expect(
      createJournalEntry({
        orgId: org.id,
        entryNumber: "JE-2026-AUTO-COGS",
        entryDate: "2026-02-03",
        entryType: "auto_sales",
        postingKind: "inventory_sale_cogs",
        sourceEntityType: "sales_transactions",
        sourceEntityId,
        description: "POS sale COGS",
        lines: [
          { accountId: cogs!.id, debitAmount: "50.00" },
          { accountId: inventory!.id, creditAmount: "50.00" },
        ],
      })
    ).resolves.toBeTruthy();
  });

  it("rejects unknown posting_kind values at the database boundary", async () => {
    const org = await createTestOrg(testDb);

    let error: unknown;
    try {
      await testDb.execute(sql`
        INSERT INTO journal_entries (
          org_id,
          entry_number,
          entry_date,
          posting_date,
          period_year,
          period_month,
          entry_type,
          posting_kind,
          description,
          total_debit,
          total_credit,
          notes
        )
        VALUES (
          ${org.id},
          'JE-2026-BAD-KIND',
          '2026-02-01',
          '2026-02-01',
          2026,
          2,
          'auto_sales',
          'revenu',
          'Typo posting kind',
          0,
          0,
          'raw insert to prove enum guard'
        )
      `);
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeTruthy();
    expect((error as { cause?: { code?: string } }).cause?.code).toBe("22P02");
    expect(String((error as { cause?: { message?: string } }).cause?.message)).toMatch(
      /invalid input value for enum "?posting_kind"?/
    );
  });

  it("rejects undocumented zero-value journal entries", async () => {
    const org = await createTestOrg(testDb);

    await expect(
      testDb.insert(schema.journalEntries).values({
        orgId: org.id,
        entryNumber: "JE-2026-ZERO",
        entryDate: "2026-02-01",
        postingDate: "2026-02-01",
        periodYear: 2026,
        periodMonth: 2,
        entryType: "manual",
        description: "Undocumented zero entry",
        totalDebit: "0.00",
        totalCredit: "0.00",
      })
    ).rejects.toThrow(/Failed query/);
  });

  it("rejects balanced headers when line totals are missing or later drift", async () => {
    const org = await createTestOrg(testDb);
    await seedStandardGlAccounts(org.id);
    const accounts = await getGlAccounts(org.id);

    await expect(
      testDb.insert(schema.journalEntries).values({
        orgId: org.id,
        entryNumber: "JE-2026-HEADER-ONLY",
        entryDate: "2026-02-01",
        postingDate: "2026-02-01",
        periodYear: 2026,
        periodMonth: 2,
        entryType: "manual",
        description: "Header only",
        totalDebit: "100.00",
        totalCredit: "100.00",
      })
    ).rejects.toThrow(/Failed query/);

    const entry = await createJournalEntry({
      orgId: org.id,
      entryNumber: "JE-2026-DRIFT",
      entryDate: "2026-02-02",
      entryType: "manual",
      description: "Valid then drift",
      lines: [
        { accountId: accounts[0].id, debitAmount: "100.00" },
        { accountId: accounts[1].id, creditAmount: "100.00" },
      ],
    });

    await expect(
      testDb
        .update(schema.journalEntries)
        .set({ totalDebit: "200.00", totalCredit: "200.00" })
        .where(sql`${schema.journalEntries.id} = ${entry.id}`)
    ).rejects.toThrow(/Failed query/);
  });

  it("rejects journal lines that cross organization boundaries", async () => {
    const org = await createTestOrg(testDb);
    const otherOrg = await createTestOrg(testDb);
    await seedStandardGlAccounts(org.id);
    await seedStandardGlAccounts(otherOrg.id);

    const otherAccounts = await getGlAccounts(otherOrg.id);
    const orgAccounts = await getGlAccounts(org.id);
    const entry = await createJournalEntry({
      orgId: org.id,
      entryNumber: "JE-2026-ORG",
      entryDate: "2026-02-01",
      entryType: "manual",
      description: "Cross-org baseline",
      lines: [
        { accountId: orgAccounts[0].id, debitAmount: "100.00" },
        { accountId: orgAccounts[1].id, creditAmount: "100.00" },
      ],
    });

    await expect(
      testDb.insert(schema.journalLines).values({
        orgId: org.id,
        journalEntryId: entry.id,
        lineNumber: 3,
        accountId: otherAccounts[0].id,
        debitAmount: "100.00",
      })
    ).rejects.toThrow(/Failed query/);

    await expect(
      testDb.insert(schema.journalLines).values({
        orgId: otherOrg.id,
        journalEntryId: entry.id,
        lineNumber: 4,
        accountId: orgAccounts[0].id,
        creditAmount: "100.00",
      })
    ).rejects.toThrow(/Failed query/);
  });

  it("blocks journal entry and line changes in locked GL periods", async () => {
    const org = await createTestOrg(testDb);
    await seedStandardGlAccounts(org.id);
    const accounts = await getGlAccounts(org.id);

    await lockPeriod({
      orgId: org.id,
      domain: "gl",
      periodYear: 2026,
      periodMonth: 3,
      lockedByUserId: "system",
      lockReason: "routine_close",
    });

    await expect(
      createJournalEntry({
        orgId: org.id,
        entryNumber: "JE-2026-LOCKED",
        entryDate: "2026-03-15",
        entryType: "manual",
        description: "Locked period",
        lines: [
          { accountId: accounts[0].id, debitAmount: "100.00" },
          { accountId: accounts[1].id, creditAmount: "100.00" },
        ],
      })
    ).rejects.toThrow(/GL period is locked/);
  });
});
