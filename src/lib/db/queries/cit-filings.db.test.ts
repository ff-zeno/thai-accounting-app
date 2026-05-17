import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, sql } from "drizzle-orm";
import * as schema from "@/lib/db/schema";
import {
  createTestDb,
  createTestOrg,
  migrateTestDb,
  resetTestDb,
} from "@/tests/db-test-utils";

const { db: testDb, pool } = createTestDb();
let buildProjectedPnd51Draft: typeof import("./cit-filings").buildProjectedPnd51Draft;
let acceptCitFiling: typeof import("./cit-filings").acceptCitFiling;
let buildActualH1Pnd51Draft: typeof import("./cit-filings").buildActualH1Pnd51Draft;
let buildPnd50DraftFromGlProfit:
  typeof import("./cit-filings").buildPnd50DraftFromGlProfit;
let buildPnd50DraftFromManualProfit:
  typeof import("./cit-filings").buildPnd50DraftFromManualProfit;
let buildTransferPricingDisclosureDraft:
  typeof import("./cit-filings").buildTransferPricingDisclosureDraft;
let submitTransferPricingDisclosure:
  typeof import("./cit-filings").submitTransferPricingDisclosure;
let consumeLossCarryForwardLayers: typeof import("./cit-filings").consumeLossCarryForwardLayers;
let expireLossCarryForwardLayers: typeof import("./cit-filings").expireLossCarryForwardLayers;
let recordLossCarryForwardLayer: typeof import("./cit-filings").recordLossCarryForwardLayer;
let syncEntertainmentExpenseBookTaxAdjustment: typeof import("./cit-filings").syncEntertainmentExpenseBookTaxAdjustment;
let syncFixedAssetDepreciationBookTaxAdjustment: typeof import("./cit-filings").syncFixedAssetDepreciationBookTaxAdjustment;
let refreshTransferPricingRequirementFromGl:
  typeof import("./cit-filings").refreshTransferPricingRequirementFromGl;
let recordBookTaxAdjustment: typeof import("./cit-filings").recordBookTaxAdjustment;
let submitCitFiling: typeof import("./cit-filings").submitCitFiling;
let createFixedAsset: typeof import("./fixed-assets").createFixedAsset;
let buildDepreciationScheduleForAsset: typeof import("./fixed-assets").buildDepreciationScheduleForAsset;
let seedStandardGlAccounts: typeof import("./general-ledger").seedStandardGlAccounts;
let getGlAccounts: typeof import("./general-ledger").getGlAccounts;
let createJournalEntry: typeof import("./general-ledger").createJournalEntry;
let postCitAccrualJournalEntry: typeof import("./general-ledger").postCitAccrualJournalEntry;
let postYearEndCloseJournalEntries: typeof import("./general-ledger").postYearEndCloseJournalEntries;
let reverseJournalEntry: typeof import("./general-ledger").reverseJournalEntry;

beforeAll(async () => {
  await resetTestDb(pool);
  await migrateTestDb(pool);
  vi.doMock("../index", () => ({ db: testDb }));
  ({
    acceptCitFiling,
    buildActualH1Pnd51Draft,
    buildPnd50DraftFromGlProfit,
    buildPnd50DraftFromManualProfit,
    buildProjectedPnd51Draft,
    buildTransferPricingDisclosureDraft,
    consumeLossCarryForwardLayers,
    expireLossCarryForwardLayers,
    recordLossCarryForwardLayer,
    recordBookTaxAdjustment,
    refreshTransferPricingRequirementFromGl,
    syncFixedAssetDepreciationBookTaxAdjustment,
    syncEntertainmentExpenseBookTaxAdjustment,
    submitCitFiling,
    submitTransferPricingDisclosure,
  } = await import("./cit-filings"));
  ({
    createFixedAsset,
    buildDepreciationScheduleForAsset,
  } = await import("./fixed-assets"));
  ({
    seedStandardGlAccounts,
    getGlAccounts,
    createJournalEntry,
    postCitAccrualJournalEntry,
    postYearEndCloseJournalEntries,
    reverseJournalEntry,
  } = await import("./general-ledger"));
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
      audit_log,
      cit_filings,
      transfer_pricing_disclosures,
      wht_credits_received,
      book_tax_adjustments,
      loss_carry_forward_layers,
      depreciation_schedule,
      fixed_assets,
      gl_accounts,
      vendors,
      establishments,
      organizations
    CASCADE
  `);
});

describe("CIT filing foundation", () => {
  it("builds a projected PND.51 draft using standard CIT rates", async () => {
    const org = await createTestOrg(testDb);
    const filing = await buildProjectedPnd51Draft({
      orgId: org.id,
      taxYear: 2026,
      entityType: "standard",
      projectedFullYearProfit: "1000000.00",
      rationale: "First year projection",
    });

    expect(filing.filingType).toBe("pnd51");
    expect(filing.citCalculated).toBe("200000.00");
    expect(filing.citPayable).toBe("100000.00");
    expect(filing.pnd51Method).toBe("projected_full_year");
  });

  it("updates an existing projected PND.51 draft instead of duplicating", async () => {
    const org = await createTestOrg(testDb);
    const first = await buildProjectedPnd51Draft({
      orgId: org.id,
      taxYear: 2026,
      entityType: "standard",
      projectedFullYearProfit: "1000000.00",
    });
    const second = await buildProjectedPnd51Draft({
      orgId: org.id,
      taxYear: 2026,
      entityType: "standard",
      projectedFullYearProfit: "2000000.00",
    });

    expect(second.id).toBe(first.id);
    expect(second.citPayable).toBe("200000.00");
    const filings = await testDb.select().from(schema.citFilings);
    expect(filings).toHaveLength(1);
  });

  it("builds an actual-H1 PND.51 draft from GL profit", async () => {
    const org = await createTestOrg(testDb);
    await seedStandardGlAccounts(org.id);
    const accounts = await getGlAccounts(org.id);
    const bank = accounts.find((account) => account.accountCode === "1111")!;
    const sales = accounts.find((account) => account.accountCode === "4110")!;
    const cogs = accounts.find((account) => account.accountCode === "5110")!;
    const salaries = accounts.find((account) => account.accountCode === "6110")!;

    await createJournalEntry({
      orgId: org.id,
      entryNumber: "JE-2026-H1-SALE",
      entryDate: "2026-06-15",
      entryType: "manual",
      description: "H1 sale",
      lines: [
        { accountId: bank.id, debitAmount: "1000000.00" },
        { accountId: sales.id, creditAmount: "1000000.00" },
      ],
    });
    await createJournalEntry({
      orgId: org.id,
      entryNumber: "JE-2026-H1-COSTS",
      entryDate: "2026-06-20",
      entryType: "manual",
      description: "H1 costs",
      lines: [
        { accountId: cogs.id, debitAmount: "200000.00" },
        { accountId: salaries.id, debitAmount: "300000.00" },
        { accountId: bank.id, creditAmount: "500000.00" },
      ],
    });
    await createJournalEntry({
      orgId: org.id,
      entryNumber: "JE-2026-H2-SALE",
      entryDate: "2026-07-01",
      entryType: "manual",
      description: "H2 sale excluded",
      lines: [
        { accountId: bank.id, debitAmount: "900000.00" },
        { accountId: sales.id, creditAmount: "900000.00" },
      ],
    });

    const filing = await buildActualH1Pnd51Draft({
      orgId: org.id,
      taxYear: 2026,
      entityType: "standard",
      rationale: "H1 books complete",
    });

    expect(filing.pnd51Method).toBe("actual_h1_books");
    expect(filing.revenueTotal).toBe("1000000.00");
    expect(filing.cogsTotal).toBe("200000.00");
    expect(filing.expenseTotal).toBe("300000.00");
    expect(filing.accountingProfit).toBe("500000.00");
    expect(filing.pnd51H1ActualProfit).toBe("500000.00");
    expect(filing.pnd51ProjectedFullYearProfit).toBe("1000000.00");
    expect(filing.citCalculated).toBe("200000.00");
    expect(filing.citPayable).toBe("100000.00");
  });

  it("blocks rebuilding submitted CIT filings without an amendment workflow", async () => {
    const org = await createTestOrg(testDb);
    const pnd51 = await buildProjectedPnd51Draft({
      orgId: org.id,
      taxYear: 2026,
      entityType: "standard",
      projectedFullYearProfit: "1000000.00",
    });
    await testDb
      .update(schema.citFilings)
      .set({ filingStatus: "submitted" })
      .where(sql`${schema.citFilings.id} = ${pnd51.id}`);

    await expect(
      buildProjectedPnd51Draft({
        orgId: org.id,
        taxYear: 2026,
        entityType: "standard",
        projectedFullYearProfit: "2000000.00",
      })
    ).rejects.toThrow("Submitted CIT filings cannot be rebuilt");

    const pnd50 = await buildPnd50DraftFromManualProfit({
      orgId: org.id,
      taxYear: 2026,
      entityType: "standard",
      accountingProfit: "1000000.00",
    });
    await testDb
      .update(schema.citFilings)
      .set({ filingStatus: "accepted" })
      .where(sql`${schema.citFilings.id} = ${pnd50.id}`);

    await expect(
      buildPnd50DraftFromManualProfit({
        orgId: org.id,
        taxYear: 2026,
        entityType: "standard",
        accountingProfit: "1100000.00",
      })
    ).rejects.toThrow("Submitted CIT filings cannot be rebuilt");
  });

  it("submits draft CIT filings with an audit trail", async () => {
    const org = await createTestOrg(testDb);
    const filing = await buildProjectedPnd51Draft({
      orgId: org.id,
      taxYear: 2026,
      entityType: "standard",
      projectedFullYearProfit: "1000000.00",
    });

    const submitted = await submitCitFiling({
      orgId: org.id,
      filingId: filing.id,
      submittedByUserId: "user-1",
      rdReferenceNumber: "RD-CIT-001",
    });

    expect(submitted.filingStatus).toBe("submitted");
    expect(submitted.submittedAt).toBeTruthy();
    expect(submitted.rdReferenceNumber).toBe("RD-CIT-001");
    await expect(
      submitCitFiling({
        orgId: org.id,
        filingId: filing.id,
      })
    ).rejects.toThrow("Only draft CIT filings can be submitted");
    const [log] = await testDb
      .select()
      .from(schema.auditLog)
      .where(sql`${schema.auditLog.entityId} = ${filing.id}`);
    expect(log.action).toBe("update");
  });

  it("accepts submitted CIT filings with an audit trail", async () => {
    const org = await createTestOrg(testDb);
    const filing = await buildProjectedPnd51Draft({
      orgId: org.id,
      taxYear: 2026,
      entityType: "standard",
      projectedFullYearProfit: "1000000.00",
    });
    await submitCitFiling({
      orgId: org.id,
      filingId: filing.id,
      submittedByUserId: "user-1",
    });

    const accepted = await acceptCitFiling({
      orgId: org.id,
      filingId: filing.id,
      acceptedByUserId: "user-2",
    });

    expect(accepted.filingStatus).toBe("accepted");
    expect(accepted.acceptedAt).toBeTruthy();
    await expect(
      acceptCitFiling({
        orgId: org.id,
        filingId: filing.id,
      })
    ).rejects.toThrow("Only submitted CIT filings can be accepted");
    const logs = await testDb
      .select()
      .from(schema.auditLog)
      .where(sql`${schema.auditLog.entityId} = ${filing.id}`)
      .orderBy(schema.auditLog.createdAt);
    expect(logs.map((log) => log.action)).toEqual(["update", "update"]);
  });

  it("builds annual PND.50 draft with book-tax adjustments, PND.51, and WHT credits", async () => {
    const org = await createTestOrg(testDb);
    const [customer] = await testDb
      .insert(schema.vendors)
      .values({
        orgId: org.id,
        name: "Customer Withholding Co",
        entityType: "company",
        country: "TH",
      })
      .returning();
    await testDb.insert(schema.whtCreditsReceived).values({
      orgId: org.id,
      customerVendorId: customer.id,
      paymentDate: "2026-05-15",
      grossAmount: "100000.00",
      whtAmount: "3000.00",
      formType: "pnd53",
      taxYear: 2026,
    });
    await testDb.insert(schema.bookTaxAdjustments).values({
      orgId: org.id,
      taxYear: 2026,
      description: "Non-deductible expense addback",
      amount: "10000.00",
      direction: "add_back",
      category: "non_deductible_expense",
    });
    const pnd51 = await buildProjectedPnd51Draft({
      orgId: org.id,
      taxYear: 2026,
      entityType: "standard",
      projectedFullYearProfit: "500000.00",
    });

    const filing = await buildPnd50DraftFromManualProfit({
      orgId: org.id,
      taxYear: 2026,
      entityType: "standard",
      accountingProfit: "1000000.00",
    });

    expect(filing.filingType).toBe("pnd50");
    expect(filing.accountingProfit).toBe("1000000.00");
    expect(filing.taxableIncome).toBe("1010000.00");
    expect(filing.citCalculated).toBe("202000.00");
    expect(filing.whtCreditsUsed).toBe("3000.00");
    expect(filing.prepaymentCreditsUsed).toBe("0.00");
    expect(filing.citPayable).toBe("199000.00");

    await testDb
      .update(schema.citFilings)
      .set({ filingStatus: "submitted" })
      .where(sql`${schema.citFilings.id} = ${pnd51.id}`);

    const withUnpaidPrepayment = await buildPnd50DraftFromManualProfit({
      orgId: org.id,
      taxYear: 2026,
      entityType: "standard",
      accountingProfit: "1000000.00",
    });
    expect(withUnpaidPrepayment.prepaymentCreditsUsed).toBe("0.00");
    expect(withUnpaidPrepayment.citPayable).toBe("199000.00");

    await testDb
      .update(schema.citFilings)
      .set({ paidAt: new Date("2026-08-31T00:00:00Z") })
      .where(sql`${schema.citFilings.id} = ${pnd51.id}`);

    const withPrepayment = await buildPnd50DraftFromManualProfit({
      orgId: org.id,
      taxYear: 2026,
      entityType: "standard",
      accountingProfit: "1000000.00",
    });
    expect(withPrepayment.id).toBe(filing.id);
    expect(withPrepayment.prepaymentCreditsUsed).toBe("50000.00");
    expect(withPrepayment.citPayable).toBe("149000.00");

    const updated = await buildPnd50DraftFromManualProfit({
      orgId: org.id,
      taxYear: 2026,
      entityType: "standard",
      accountingProfit: "1100000.00",
    });
    expect(updated.id).toBe(filing.id);
    expect(await testDb.select().from(schema.citFilings)).toHaveLength(2);
  });

  it("blocks PND.50 draft rebuild after an active CIT accrual is posted", async () => {
    const org = await createTestOrg(testDb);
    const filing = await buildPnd50DraftFromManualProfit({
      orgId: org.id,
      taxYear: 2026,
      entityType: "standard",
      accountingProfit: "1000000.00",
    });

    await postCitAccrualJournalEntry({
      orgId: org.id,
      citFilingId: filing.id,
      createdByUserId: "user-1",
      enqueueOutbox: false,
    });

    await expect(
      buildPnd50DraftFromManualProfit({
        orgId: org.id,
        taxYear: 2026,
        entityType: "standard",
        accountingProfit: "1100000.00",
      })
    ).rejects.toThrow("CIT accrual already posted");
  });

  it("allows PND.50 draft rebuild after the CIT accrual is reversed", async () => {
    const org = await createTestOrg(testDb);
    const filing = await buildPnd50DraftFromManualProfit({
      orgId: org.id,
      taxYear: 2026,
      entityType: "standard",
      accountingProfit: "1000000.00",
    });

    const accrual = await postCitAccrualJournalEntry({
      orgId: org.id,
      citFilingId: filing.id,
      createdByUserId: "user-1",
      enqueueOutbox: false,
    });
    await reverseJournalEntry({
      orgId: org.id,
      journalEntryId: accrual.id,
      reversalDate: "2026-12-31",
      createdByUserId: "user-2",
    });

    const rebuilt = await buildPnd50DraftFromManualProfit({
      orgId: org.id,
      taxYear: 2026,
      entityType: "standard",
      accountingProfit: "1100000.00",
    });

    expect(rebuilt.id).toBe(filing.id);
    expect(rebuilt.accountingProfit).toBe("1100000.00");
  });

  it("supports manual PND.50 loss-year drafts", async () => {
    const org = await createTestOrg(testDb);
    const filing = await buildPnd50DraftFromManualProfit({
      orgId: org.id,
      taxYear: 2026,
      entityType: "standard",
      accountingProfit: "-250000.00",
    });

    expect(filing.accountingProfit).toBe("-250000.00");
    expect(filing.taxableIncome).toBe("-250000.00");
    expect(filing.taxableLoss).toBe("250000.00");
    expect(filing.citPayable).toBe("0.00");
  });

  it("previews loss carry-forward consumption in PND.50 draft without mutating layers", async () => {
    const org = await createTestOrg(testDb);
    const layer = await recordLossCarryForwardLayer({
      orgId: org.id,
      originatedTaxYear: 2025,
      originalAmount: "200000.00",
    });

    const filing = await buildPnd50DraftFromManualProfit({
      orgId: org.id,
      taxYear: 2026,
      entityType: "standard",
      accountingProfit: "500000.00",
    });

    expect(filing.taxableIncome).toBe("300000.00");
    expect(filing.lossesConsumedThisYear).toBe("200000.00");
    expect(filing.citCalculated).toBe("60000.00");
    const [unchangedLayer] = await testDb
      .select()
      .from(schema.lossCarryForwardLayers)
      .where(sql`${schema.lossCarryForwardLayers.id} = ${layer.id}`);
    expect(unchangedLayer.remainingAmount).toBe("200000.00");
  });

  it("consumes loss layers and records disclosure payload when PND.50 is submitted", async () => {
    const org = await createTestOrg(testDb);
    const layer = await recordLossCarryForwardLayer({
      orgId: org.id,
      originatedTaxYear: 2025,
      originalAmount: "200000.00",
    });
    const filing = await buildPnd50DraftFromManualProfit({
      orgId: org.id,
      taxYear: 2026,
      entityType: "standard",
      accountingProfit: "500000.00",
    });

    const submitted = await submitCitFiling({
      orgId: org.id,
      filingId: filing.id,
      submittedByUserId: "user-1",
    });

    expect(submitted.lossCarryForwardConsumptionPayload).toEqual([
      {
        layerId: layer.id,
        originatedTaxYear: 2025,
        consumedAmount: "200000.00",
        remainingAmountAfter: "0.00",
      },
    ]);
    const [consumedLayer] = await testDb
      .select()
      .from(schema.lossCarryForwardLayers)
      .where(sql`${schema.lossCarryForwardLayers.id} = ${layer.id}`);
    expect(consumedLayer.remainingAmount).toBe("0.00");
  });

  it("records audited manual book-tax adjustments with same-org GL guardrails", async () => {
    const org = await createTestOrg(testDb);
    const otherOrg = await createTestOrg(testDb);
    await seedStandardGlAccounts(org.id);
    await seedStandardGlAccounts(otherOrg.id);
    const orgAccounts = await getGlAccounts(org.id);
    const otherAccounts = await getGlAccounts(otherOrg.id);
    const salaryAccount = orgAccounts.find((account) => account.accountCode === "6110")!;
    const otherSalary = otherAccounts.find((account) => account.accountCode === "6110")!;

    await expect(
      recordBookTaxAdjustment({
        orgId: org.id,
        taxYear: 2026,
        description: "Wrong-org account",
        amount: "100.00",
        direction: "add_back",
        category: "non_deductible_expense",
        glAccountId: otherSalary.id,
      })
    ).rejects.toThrow("GL account does not belong to this organization");

    const adjustment = await recordBookTaxAdjustment({
      orgId: org.id,
      taxYear: 2026,
      description: "Manual addback",
      amount: "1000.00",
      direction: "add_back",
      category: "non_deductible_expense",
      glAccountId: salaryAccount.id,
      notes: "Accountant reviewed",
    });

    expect(adjustment.auditLogRef).toBeTruthy();
    expect(adjustment.amount).toBe("1000.00");
    const [log] = await testDb
      .select()
      .from(schema.auditLog)
      .where(sql`${schema.auditLog.id} = ${adjustment.auditLogRef}`);
    expect(log.entityType).toBe("book_tax_adjustment");
  });

  it("builds annual PND.50 draft from GL profit", async () => {
    const org = await createTestOrg(testDb);
    await seedStandardGlAccounts(org.id);
    const accounts = await getGlAccounts(org.id);
    const bank = accounts.find((account) => account.accountCode === "1111")!;
    const sales = accounts.find((account) => account.accountCode === "4110")!;
    const cogs = accounts.find((account) => account.accountCode === "5110")!;
    const salaries = accounts.find((account) => account.accountCode === "6110")!;
    const [customer] = await testDb
      .insert(schema.vendors)
      .values({
        orgId: org.id,
        name: "Customer WHT GL Co",
        entityType: "company",
        country: "TH",
      })
      .returning();

    await createJournalEntry({
      orgId: org.id,
      entryNumber: "JE-2026-GL-SALE",
      entryDate: "2026-12-15",
      entryType: "manual",
      description: "Annual sale",
      lines: [
        { accountId: bank.id, debitAmount: "1200000.00" },
        { accountId: sales.id, creditAmount: "1200000.00" },
      ],
    });
    await createJournalEntry({
      orgId: org.id,
      entryNumber: "JE-2026-GL-COSTS",
      entryDate: "2026-12-20",
      entryType: "manual",
      description: "Annual costs",
      lines: [
        { accountId: cogs.id, debitAmount: "200000.00" },
        { accountId: salaries.id, debitAmount: "100000.00" },
        { accountId: bank.id, creditAmount: "300000.00" },
      ],
    });
    await testDb.insert(schema.bookTaxAdjustments).values({
      orgId: org.id,
      taxYear: 2026,
      description: "GL addback",
      amount: "10000.00",
      direction: "add_back",
      category: "non_deductible_expense",
    });
    await testDb.insert(schema.whtCreditsReceived).values({
      orgId: org.id,
      customerVendorId: customer.id,
      paymentDate: "2026-12-15",
      grossAmount: "100000.00",
      whtAmount: "3000.00",
      formType: "pnd53",
      taxYear: 2026,
    });
    const pnd51 = await buildProjectedPnd51Draft({
      orgId: org.id,
      taxYear: 2026,
      entityType: "standard",
      projectedFullYearProfit: "500000.00",
    });
    await testDb
      .update(schema.citFilings)
      .set({ filingStatus: "submitted", paidAt: new Date("2026-08-31T00:00:00Z") })
      .where(sql`${schema.citFilings.id} = ${pnd51.id}`);

    const filing = await buildPnd50DraftFromGlProfit({
      orgId: org.id,
      taxYear: 2026,
      entityType: "standard",
    });

    expect(filing.revenueTotal).toBe("1200000.00");
    expect(filing.cogsTotal).toBe("200000.00");
    expect(filing.expenseTotal).toBe("100000.00");
    expect(filing.accountingProfit).toBe("900000.00");
    expect(filing.taxableIncome).toBe("910000.00");
    expect(filing.citCalculated).toBe("182000.00");
    expect(filing.whtCreditsUsed).toBe("3000.00");
    expect(filing.prepaymentCreditsUsed).toBe("50000.00");
    expect(filing.citPayable).toBe("129000.00");
  });

  it("keeps GL-derived PND.50 profit stable after year-end close and accrual reversal", async () => {
    const org = await createTestOrg(testDb);
    await seedStandardGlAccounts(org.id);
    const accounts = await getGlAccounts(org.id);
    const bank = accounts.find((account) => account.accountCode === "1111")!;
    const sales = accounts.find((account) => account.accountCode === "4110")!;
    const salaries = accounts.find((account) => account.accountCode === "6110")!;

    await createJournalEntry({
      orgId: org.id,
      entryNumber: "JE-2026-GL-CLOSE-SALE",
      entryDate: "2026-12-15",
      entryType: "manual",
      description: "Annual sale",
      lines: [
        { accountId: bank.id, debitAmount: "1000000.00" },
        { accountId: sales.id, creditAmount: "1000000.00" },
      ],
    });
    await createJournalEntry({
      orgId: org.id,
      entryNumber: "JE-2026-GL-CLOSE-COSTS",
      entryDate: "2026-12-20",
      entryType: "manual",
      description: "Annual costs",
      lines: [
        { accountId: salaries.id, debitAmount: "300000.00" },
        { accountId: bank.id, creditAmount: "300000.00" },
      ],
    });

    const filing = await buildPnd50DraftFromGlProfit({
      orgId: org.id,
      taxYear: 2026,
      entityType: "standard",
    });
    expect(filing.accountingProfit).toBe("700000.00");

    const accrual = await postCitAccrualJournalEntry({
      orgId: org.id,
      citFilingId: filing.id,
      createdByUserId: "user-1",
      enqueueOutbox: false,
    });
    await postYearEndCloseJournalEntries({
      orgId: org.id,
      taxYear: 2026,
      createdByUserId: "user-1",
    });
    await reverseJournalEntry({
      orgId: org.id,
      journalEntryId: accrual.id,
      reversalDate: "2026-12-31",
      createdByUserId: "user-2",
    });

    const rebuilt = await buildPnd50DraftFromGlProfit({
      orgId: org.id,
      taxYear: 2026,
      entityType: "standard",
    });
    expect(rebuilt.accountingProfit).toBe("700000.00");
  });

  it("refreshes transfer pricing flag from annual GL revenue", async () => {
    const org = await createTestOrg(testDb);
    await seedStandardGlAccounts(org.id);
    const accounts = await getGlAccounts(org.id);
    const bank = accounts.find((account) => account.accountCode === "1111")!;
    const sales = accounts.find((account) => account.accountCode === "4110")!;

    await createJournalEntry({
      orgId: org.id,
      entryNumber: "JE-2026-TP-SALE",
      entryDate: "2026-12-15",
      entryType: "manual",
      description: "TP threshold sale",
      lines: [
        { accountId: bank.id, debitAmount: "200000001.00" },
        { accountId: sales.id, creditAmount: "200000001.00" },
      ],
    });

    const result = await refreshTransferPricingRequirementFromGl({
      orgId: org.id,
      taxYear: 2026,
    });

    expect(result.revenueTotal).toBe("200000001.00");
    expect(result.transferPricingRequired).toBe(true);
    const [updatedOrg] = await testDb
      .select({ transferPricingRequired: schema.organizations.transferPricingRequired })
      .from(schema.organizations)
      .where(sql`${schema.organizations.id} = ${org.id}`);
    expect(updatedOrg.transferPricingRequired).toBe(true);
  });

  it("builds transfer pricing disclosure drafts from the threshold flag and related-party notes", async () => {
    const org = await createTestOrg(testDb);
    await seedStandardGlAccounts(org.id);
    const accounts = await getGlAccounts(org.id);
    const bank = accounts.find((account) => account.accountCode === "1111")!;
    const sales = accounts.find((account) => account.accountCode === "4110")!;

    await createJournalEntry({
      orgId: org.id,
      entryNumber: "JE-2026-TP-DISC",
      entryDate: "2026-12-20",
      entryType: "manual",
      description: "TP disclosure sale",
      lines: [
        { accountId: bank.id, debitAmount: "210000000.00" },
        { accountId: sales.id, creditAmount: "210000000.00" },
      ],
    });

    const disclosure = await buildTransferPricingDisclosureDraft({
      orgId: org.id,
      taxYear: 2026,
      relatedPartyTransactionsText:
        "Parent Co|0105559000001|TH|parent|service|0|0|500000.00|0|0|0|Management fee\nIntercompany loan",
      notes: "Prepared from accountant interview",
      preparedByUserId: "user-1",
    });

    expect(disclosure.revenueTotal).toBe("210000000.00");
    expect(disclosure.disclosureRequired).toBe(true);
    expect(disclosure.relatedPartyTransactionsPayload).toEqual([
      {
        relatedPartyName: "Parent Co",
        taxpayerId: "0105559000001",
        countryCode: "TH",
        relationship: "parent",
        transactionCategory: "service",
        revenueAmount: "0.00",
        purchaseAmount: "0.00",
        serviceFeeAmount: "500000.00",
        royaltyAmount: "0.00",
        interestAmount: "0.00",
        loanBalance: "0.00",
        notes: "Management fee",
      },
      { description: "Intercompany loan" },
    ]);
    const submitted = await submitTransferPricingDisclosure({
      orgId: org.id,
      disclosureId: disclosure.id,
      submittedByUserId: "user-1",
    });
    expect(submitted.status).toBe("submitted");
    expect(submitted.submittedAt).toBeInstanceOf(Date);
    await expect(
      buildTransferPricingDisclosureDraft({
        orgId: org.id,
        taxYear: 2026,
        relatedPartyTransactionsText: "Replacement",
      })
    ).rejects.toThrow(/cannot be rebuilt/);
    await expect(
      buildTransferPricingDisclosureDraft({
        orgId: org.id,
        taxYear: 2027,
        relatedPartyTransactionsText: "Parent Co|0105559000001|TH|parent|service|1000.00",
      })
    ).rejects.toThrow(/12 pipe-delimited fields/);
    const [log] = await testDb
      .select()
      .from(schema.auditLog)
      .where(sql`${schema.auditLog.entityId} = ${disclosure.id}`);
    expect(log.entityType).toBe("transfer_pricing_disclosure");
  });

  it("syncs entertainment expense cap excess into a generated CIT addback", async () => {
    const org = await createTestOrg(testDb);
    await seedStandardGlAccounts(org.id);
    const accounts = await getGlAccounts(org.id);
    const bank = accounts.find((account) => account.accountCode === "1111")!;
    const sales = accounts.find((account) => account.accountCode === "4110")!;
    const entertainment = accounts.find((account) => account.accountCode === "6610")!;

    await createJournalEntry({
      orgId: org.id,
      entryNumber: "JE-2026-ENT",
      entryDate: "2026-12-20",
      entryType: "manual",
      description: "Entertainment cap test",
      lines: [
        { accountId: bank.id, debitAmount: "1000000.00" },
        { accountId: sales.id, creditAmount: "1000000.00" },
        { accountId: entertainment.id, debitAmount: "10000.00" },
        { accountId: bank.id, creditAmount: "10000.00" },
      ],
    });

    const adjustment = await syncEntertainmentExpenseBookTaxAdjustment({
      orgId: org.id,
      taxYear: 2026,
    });

    expect(adjustment).toMatchObject({
      taxYear: 2026,
      amount: "7000.00",
      direction: "add_back",
      category: "entertainment_cap_excess",
    });
    const rerun = await syncEntertainmentExpenseBookTaxAdjustment({
      orgId: org.id,
      taxYear: 2026,
    });
    expect(rerun?.amount).toBe("7000.00");

    const adjustments = await testDb
      .select()
      .from(schema.bookTaxAdjustments)
      .where(sql`${schema.bookTaxAdjustments.orgId} = ${org.id}`);
    expect(adjustments).toHaveLength(1);
  });

  it("keeps loss carry-forward layers to five-year expiry", async () => {
    const org = await createTestOrg(testDb);
    const layer = await recordLossCarryForwardLayer({
      orgId: org.id,
      originatedTaxYear: 2026,
      originalAmount: "500000.00",
    });

    expect(layer.expiryTaxYear).toBe(2031);
  });

  it("prevents duplicate non-amendment CIT filing drafts", async () => {
    const org = await createTestOrg(testDb);
    await testDb.insert(schema.citFilings).values({
      orgId: org.id,
      taxYear: 2026,
      filingType: "pnd50",
      periodStart: "2026-01-01",
      periodEnd: "2026-12-31",
      filingStatus: "draft",
    });

    await expect(
      testDb.insert(schema.citFilings).values({
        orgId: org.id,
        taxYear: 2026,
        filingType: "pnd50",
        periodStart: "2026-01-01",
        periodEnd: "2026-12-31",
        filingStatus: "draft",
      })
    ).rejects.toThrow(/Failed query/);
  });

  it("consumes eligible loss layers oldest first and leaves expired layers untouched", async () => {
    const org = await createTestOrg(testDb);
    const expired = await recordLossCarryForwardLayer({
      orgId: org.id,
      originatedTaxYear: 2020,
      originalAmount: "999999.00",
    });
    const oldLayer = await recordLossCarryForwardLayer({
      orgId: org.id,
      originatedTaxYear: 2024,
      originalAmount: "200000.00",
    });
    const newLayer = await recordLossCarryForwardLayer({
      orgId: org.id,
      originatedTaxYear: 2025,
      originalAmount: "500000.00",
    });

    const result = await consumeLossCarryForwardLayers({
      orgId: org.id,
      taxYear: 2026,
      taxableIncome: "600000.00",
    });

    expect(result.totalLossesConsumed).toBe("600000.00");
    expect(result.taxableIncomeAfterLosses).toBe("0.00");
    expect(result.consumption.map((item) => item.layerId)).toEqual([
      oldLayer.id,
      newLayer.id,
    ]);

    const layers = await testDb
      .select()
      .from(schema.lossCarryForwardLayers)
      .orderBy(schema.lossCarryForwardLayers.originatedTaxYear);
    expect(layers.find((layer) => layer.id === expired.id)?.remainingAmount).toBe("999999.00");
    expect(layers.find((layer) => layer.id === oldLayer.id)?.remainingAmount).toBe("0.00");
    expect(layers.find((layer) => layer.id === newLayer.id)?.remainingAmount).toBe("100000.00");
  });

  it("expires loss carry-forward layers no longer eligible for the selected tax year", async () => {
    const org = await createTestOrg(testDb);
    const otherOrg = await createTestOrg(testDb);
    const expiredCandidate = await recordLossCarryForwardLayer({
      orgId: org.id,
      originatedTaxYear: 2020,
      originalAmount: "250000.00",
    });
    const stillEligible = await recordLossCarryForwardLayer({
      orgId: org.id,
      originatedTaxYear: 2021,
      originalAmount: "150000.00",
    });
    const otherOrgLayer = await recordLossCarryForwardLayer({
      orgId: otherOrg.id,
      originatedTaxYear: 2020,
      originalAmount: "999999.00",
    });
    await testDb.insert(schema.citFilings).values({
      orgId: org.id,
      taxYear: 2025,
      filingType: "pnd50",
      periodStart: "2025-01-01",
      periodEnd: "2025-12-31",
      filingStatus: "submitted",
    });

    const result = await expireLossCarryForwardLayers({
      orgId: org.id,
      taxYear: 2026,
      expiredByUserId: "user_1",
    });

    expect(result).toMatchObject({
      expiredCount: 1,
      forfeitedAmount: "250000.00",
      expiredLayerIds: [expiredCandidate.id],
    });

    const layers = await testDb
      .select()
      .from(schema.lossCarryForwardLayers)
      .orderBy(schema.lossCarryForwardLayers.originatedTaxYear);
    expect(layers.find((layer) => layer.id === expiredCandidate.id)).toMatchObject({
      remainingAmount: "0.00",
    });
    expect(layers.find((layer) => layer.id === expiredCandidate.id)?.expiredAt).toBeTruthy();
    expect(layers.find((layer) => layer.id === stillEligible.id)).toMatchObject({
      remainingAmount: "150000.00",
      expiredAt: null,
    });
    expect(layers.find((layer) => layer.id === otherOrgLayer.id)).toMatchObject({
      remainingAmount: "999999.00",
      expiredAt: null,
    });

    const rerun = await expireLossCarryForwardLayers({
      orgId: org.id,
      taxYear: 2026,
    });
    expect(rerun).toMatchObject({ expiredCount: 0, forfeitedAmount: "0.00" });

    const auditRows = await testDb
      .select()
      .from(schema.auditLog)
      .where(eq(schema.auditLog.entityType, "loss_carry_forward_layers"));
    expect(auditRows).toHaveLength(1);
    expect(auditRows[0].newValue).toMatchObject({
      event: "loss_carry_forward_layer_expired",
      taxYear: 2026,
      expiredByUserId: "user_1",
      forfeitedAmount: "250000.00",
    });
    expect(auditRows[0].entityId).toBe(expiredCandidate.id);
  });

  it("refuses loss layer expiry until the expiry-year PND.50 is filed", async () => {
    const org = await createTestOrg(testDb);
    await recordLossCarryForwardLayer({
      orgId: org.id,
      originatedTaxYear: 2020,
      originalAmount: "250000.00",
    });

    await expect(
      expireLossCarryForwardLayers({
        orgId: org.id,
        taxYear: 2026,
      })
    ).rejects.toThrow(/Submit PND.50 for tax year 2025/);
  });

  it("syncs fixed-asset depreciation book-tax differences into a single CIT addback", async () => {
    const org = await createTestOrg(testDb);
    const otherOrg = await createTestOrg(testDb);
    const asset = await createFixedAsset({
      orgId: org.id,
      assetCode: "FA-2026-CIT",
      nameEn: "Fast tax-cap asset",
      category: "equipment",
      acquisitionDate: "2026-01-01",
      originalCost: "120000.00",
      usefulLifeMonths: 24,
    });
    await buildDepreciationScheduleForAsset({
      orgId: org.id,
      assetId: asset.id,
    });
    const otherAsset = await createFixedAsset({
      orgId: otherOrg.id,
      assetCode: "FA-2026-OTHER",
      nameEn: "Other org asset",
      category: "equipment",
      acquisitionDate: "2026-01-01",
      originalCost: "120000.00",
      usefulLifeMonths: 24,
    });
    await buildDepreciationScheduleForAsset({
      orgId: otherOrg.id,
      assetId: otherAsset.id,
    });

    const adjustment = await syncFixedAssetDepreciationBookTaxAdjustment({
      orgId: org.id,
      taxYear: 2026,
    });

    expect(adjustment).toMatchObject({
      taxYear: 2026,
      amount: "33000.00",
      direction: "add_back",
      category: "depreciation_method_difference",
    });

    const rerun = await syncFixedAssetDepreciationBookTaxAdjustment({
      orgId: org.id,
      taxYear: 2026,
    });
    expect(rerun?.amount).toBe("33000.00");

    const adjustments = await testDb
      .select()
      .from(schema.bookTaxAdjustments)
      .where(sql`${schema.bookTaxAdjustments.orgId} = ${org.id}`);
    expect(adjustments).toHaveLength(1);
  });
});
