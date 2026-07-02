import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import * as schema from "@/lib/db/schema";
import {
  createTestDb,
  createTestDocument,
  createTestOrg,
  migrateTestDb,
  resetTestDb,
} from "@/tests/db-test-utils";

const { db: testDb, pool } = createTestDb();
let ensureHeadOfficeEstablishment: typeof import("./pos-sales-ledger").ensureHeadOfficeEstablishment;
let createManualPosSale: typeof import("./pos-sales-ledger").createManualPosSale;
let getPosSalesWorkflowDashboard: typeof import("./pos-sales-ledger").getPosSalesWorkflowDashboard;
let importPosSalesCsv: typeof import("./pos-sales-ledger").importPosSalesCsv;
let recordCashDeposit: typeof import("./pos-sales-ledger").recordCashDeposit;
let recordProcessorSettlement: typeof import("./pos-sales-ledger").recordProcessorSettlement;
let createSku: typeof import("./inventory").createSku;
let recordInventoryMovement: typeof import("./inventory").recordInventoryMovement;
let enqueuePostingOutbox: typeof import("./posting-outbox").enqueuePostingOutbox;
let processPostingOutboxRow: typeof import("./posting-outbox").processPostingOutboxRow;
let postProcessorSettlementJournalEntry: typeof import("./general-ledger").postProcessorSettlementJournalEntry;
let lockPeriod: typeof import("./period-locks").lockPeriod;

beforeAll(async () => {
  await resetTestDb(pool);
  await migrateTestDb(pool);
  vi.doMock("../index", () => ({ db: testDb }));
  ({
    ensureHeadOfficeEstablishment,
    createManualPosSale,
    getPosSalesWorkflowDashboard,
    importPosSalesCsv,
    recordCashDeposit,
    recordProcessorSettlement,
  } = await import("./pos-sales-ledger"));
  ({ createSku, recordInventoryMovement } = await import("./inventory"));
  ({ enqueuePostingOutbox, processPostingOutboxRow } = await import("./posting-outbox"));
  ({ postProcessorSettlementJournalEntry } = await import("./general-ledger"));
  ({ lockPeriod } = await import("./period-locks"));
});

afterAll(async () => {
  await resetTestDb(pool);
  await pool.end();
});

beforeEach(async () => {
  await testDb.execute(sql`
    TRUNCATE TABLE
      audit_log,
      posting_exceptions,
      posting_outbox,
      journal_lines,
      journal_entries,
      gl_accounts,
      inventory_movements,
      skus,
      vat_output_items,
      cash_deposits,
      processor_settlements,
      voucher_sales,
      sales_transactions,
      period_locks,
      establishments,
      documents,
      organizations
    CASCADE
  `);
});

async function markOrgVatRegistered(orgId: string) {
  await testDb
    .update(schema.organizations)
    .set({ isVatRegistered: true })
    .where(sql`${schema.organizations.id} = ${orgId}`);
}

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

describe("POS sales ledger schema", () => {
  it("creates the head-office establishment and dashboard read model", async () => {
    const org = await createTestOrg(testDb);
    await markOrgVatRegistered(org.id);
    const establishment = await ensureHeadOfficeEstablishment(org.id);
    expect(establishment.branchNumber).toBe("00000");

    await createManualPosSale({
      orgId: org.id,
      soldAt: new Date("2026-04-01T05:00:00Z"),
      channel: "cash",
      amountIncludingVat: "1070.00",
      taxBaseExVat: "1000.00",
      vatAmount: "70.00",
      taxInvoiceType: "abb",
      taxInvoiceNumber: "ABB-DASH-1",
      terminalId: "T01",
    });

    const dashboard = await getPosSalesWorkflowDashboard(org.id);
    expect(dashboard.salesSummary.grossSales).toBe("1070.00");
    expect(dashboard.salesSummary.outputVat).toBe("70.00");
    expect(dashboard.channelBalances).toEqual([
      expect.objectContaining({
        branchNumber: "00000",
        clearingAccountKey: "cash_T01",
        saleCount: 1,
        pendingGross: "1070.00",
        agedCount: 0,
      }),
    ]);
    expect(dashboard.recentSales).toHaveLength(1);
    expect(dashboard.recentSales[0].branchNumber).toBe("00000");

    const vatOutput = await testDb.select().from(schema.vatOutputItems);
    expect(vatOutput).toHaveLength(1);
    expect(vatOutput[0].sourcePosSaleId).toBe(dashboard.recentSales[0].id);
    expect(vatOutput[0].status).toBe("reportable");
    const saleAuditRows = await testDb
      .select()
      .from(schema.auditLog)
      .where(sql`${schema.auditLog.entityType} = 'sales_transactions'
        AND ${schema.auditLog.entityId} = ${dashboard.recentSales[0].id}
        AND ${schema.auditLog.action} = 'create'`);
    expect(saleAuditRows).toHaveLength(1);

    const journalEntries = await testDb.select().from(schema.journalEntries);
    expect(journalEntries).toHaveLength(1);
    expect(journalEntries[0].entryType).toBe("auto_sales");
    expect(journalEntries[0].postingKind).toBe("pos_primary_sale");
    expect(journalEntries[0].sourceEntityId).toBe(dashboard.recentSales[0].id);

    const journalLines = await testDb.select().from(schema.journalLines);
    expect(journalLines).toHaveLength(3);
    expect(journalLines.reduce((sum, line) => sum + Number(line.debitAmount), 0)).toBe(1070);
    expect(journalLines.reduce((sum, line) => sum + Number(line.creditAmount), 0)).toBe(1070);

    const [outbox] = await testDb.select().from(schema.postingOutbox);
    expect(outbox).toMatchObject({
      sourceEntityType: "sales_transactions",
      sourceEntityId: dashboard.recentSales[0].id,
      eventType: "create",
      postingDate: "2026-04-01",
      postingStatus: "pending",
    });
    const posted = await processPostingOutboxRow({
      orgId: org.id,
      postingOutboxId: outbox.id,
    });
    expect(posted.postingStatus).toBe("posted");
    expect(posted.journalEntryId).toBe(journalEntries[0].id);

    const afterRetry = await testDb.select().from(schema.journalEntries);
    expect(afterRetry).toHaveLength(1);
  });

  it("rejects POS sales whose gross does not equal base plus VAT", async () => {
    const org = await createTestOrg(testDb);

    await expect(
      createManualPosSale({
        orgId: org.id,
        soldAt: new Date("2026-04-01T05:00:00Z"),
        channel: "cash",
        amountIncludingVat: "1071.00",
        taxBaseExVat: "1000.00",
        vatAmount: "70.00",
        taxInvoiceType: "abb",
        taxInvoiceNumber: "ABB-BAD-TIEOUT",
        terminalId: "T01",
      })
    ).rejects.toThrow(/gross must equal tax base plus VAT/);

    const sales = await testDb.select().from(schema.salesTransactions);
    expect(sales).toHaveLength(0);
  });

  it("requires POS primary sale rows to carry tax invoice classification", async () => {
    const org = await createTestOrg(testDb);
    const establishment = await createHeadOffice(org.id);

    await expect(
      testDb.insert(schema.salesTransactions).values({
        orgId: org.id,
        establishmentId: establishment.id,
        eventRole: "pos_primary",
        source: "pos:zort",
        externalId: "sale-1",
        soldAt: new Date("2026-04-01T03:00:00Z"),
        channel: "card",
        pricingMode: "vat_inclusive",
        amountIncludingVat: "1070.00",
        taxBaseExVat: "1000.00",
        vatAmount: "70.00",
        clearingAccountKey: "card_ksher",
      })
    ).rejects.toThrow(/Failed query/);

    await expect(
      testDb.insert(schema.salesTransactions).values({
        orgId: org.id,
        establishmentId: establishment.id,
        eventRole: "pos_primary",
        source: "pos:zort",
        externalId: "sale-2",
        soldAt: new Date("2026-04-01T03:00:00Z"),
        channel: "card",
        pricingMode: "vat_inclusive",
        amountIncludingVat: "1070.00",
        taxBaseExVat: "1000.00",
        vatAmount: "70.00",
        taxInvoiceType: "abb",
        taxInvoiceNumber: "ABB-001",
        terminalId: "T01",
        clearingAccountKey: "card_ksher",
      })
    ).resolves.toBeDefined();
  });

  it("imports POS CSV rows idempotently and materializes VAT/GL", async () => {
    const org = await createTestOrg(testDb);
    await markOrgVatRegistered(org.id);
    const csv = [
      "\uFEFFexternal_id,sold_at,channel,amount_including_vat,tax_base_ex_vat,vat_amount,tax_invoice_type,tax_invoice_number,terminal_id,clearing_account_key",
      "csv-1,2026-05-01,cash,1070.00,1000.00,70.00,abb,ABB-CSV-1,T01,cash_T01",
      "csv-2,2026-05-02,card,535.00,500.00,35.00,full_ti,TI-CSV-2,T02,card_beam",
    ].join("\n");

    await expect(importPosSalesCsv({ orgId: org.id, csvText: csv })).resolves.toEqual({
      created: 2,
      skipped: 0,
      totalRows: 2,
    });
    await expect(importPosSalesCsv({ orgId: org.id, csvText: csv })).resolves.toEqual({
      created: 0,
      skipped: 2,
      totalRows: 2,
    });

    const sales = await testDb.select().from(schema.salesTransactions);
    expect(sales).toHaveLength(2);
    expect(sales.every((sale) => sale.source === "manual_csv")).toBe(true);

    const vatOutput = await testDb.select().from(schema.vatOutputItems);
    expect(vatOutput).toHaveLength(2);

    const journalEntries = await testDb.select().from(schema.journalEntries);
    expect(journalEntries).toHaveLength(2);

    const outboxRows = await testDb
      .select()
      .from(schema.postingOutbox)
      .orderBy(schema.postingOutbox.postingDate);
    expect(outboxRows).toHaveLength(2);
    for (const row of outboxRows) {
      const posted = await processPostingOutboxRow({
        orgId: org.id,
        postingOutboxId: row.id,
      });
      expect(posted.postingStatus).toBe("posted");
      expect(posted.journalEntryId).toBeTruthy();
    }

    const afterOutboxDrain = await testDb.select().from(schema.journalEntries);
    expect(afterOutboxDrain).toHaveLength(2);

    const dashboard = await getPosSalesWorkflowDashboard(org.id);
    expect(dashboard.channelBalances.map((row) => row.clearingAccountKey)).toEqual([
      "cash_T01",
      "card_beam",
    ]);
  });

  it("imports POS CSV SKU lines into sale_out inventory movements with COGS", async () => {
    const org = await createTestOrg(testDb);
    await markOrgVatRegistered(org.id);
    const establishment = await ensureHeadOfficeEstablishment(org.id);
    const sku = await createSku({
      orgId: org.id,
      skuCode: "SKU-POS-1",
      nameEn: "POS Test SKU",
      standardCost: "100.0000",
    });
    await recordInventoryMovement({
      orgId: org.id,
      establishmentId: establishment.id,
      skuId: sku.id,
      movementAt: new Date("2026-05-01T03:00:00Z"),
      movementType: "adjustment_in",
      quantity: "10.0000",
      unitCost: "100.0000",
      sourceEntityType: "manual",
    });

    const csv = [
      "external_id,sold_at,channel,amount_including_vat,tax_base_ex_vat,vat_amount,tax_invoice_type,tax_invoice_number,terminal_id,sku_code,quantity",
      "csv-sku-1,2026-05-02,cash,214.00,200.00,14.00,abb,ABB-SKU-1,T01,SKU-POS-1,2",
    ].join("\n");

    await expect(importPosSalesCsv({ orgId: org.id, csvText: csv })).resolves.toEqual({
      created: 1,
      skipped: 0,
      totalRows: 1,
    });
    await expect(importPosSalesCsv({ orgId: org.id, csvText: csv })).resolves.toEqual({
      created: 0,
      skipped: 1,
      totalRows: 1,
    });

    const sales = await testDb.select().from(schema.salesTransactions);
    expect(sales).toHaveLength(1);

    const movements = await testDb
      .select()
      .from(schema.inventoryMovements)
      .orderBy(schema.inventoryMovements.movementAt);
    expect(movements).toHaveLength(2);
    expect(movements[1]).toMatchObject({
      movementType: "sale_out",
      quantity: "-2.0000",
      unitCost: "100.0000",
      totalCost: "200.00",
      sourceEntityType: "sales_transactions",
      sourceEntityId: sales[0].id,
    });
    expect(movements[1].journalEntryId).toBeTruthy();

    const [updatedSku] = await testDb.select().from(schema.skus);
    expect(updatedSku.currentQuantity).toBe("8.0000");
    expect(updatedSku.currentValue).toBe("800.00");

    const journalEntries = await testDb.select().from(schema.journalEntries);
    expect(journalEntries.map((entry) => entry.postingKind).sort()).toEqual([
      "inventory_cogs",
      "inventory_count_variance",
      "pos_primary_sale",
    ]);
  });

  it("rejects ambiguous POS CSV dates and invalid manual inventory quantities", async () => {
    const org = await createTestOrg(testDb);
    const ambiguousDateCsv = [
      "external_id,sold_at,channel,amount_including_vat,tax_base_ex_vat,vat_amount,tax_invoice_type,tax_invoice_number,terminal_id",
      "bad-date,01/02/2026,cash,107.00,100.00,7.00,abb,ABB-BAD-DATE,T01",
    ].join("\n");

    await expect(
      importPosSalesCsv({ orgId: org.id, csvText: ambiguousDateCsv })
    ).rejects.toThrow(/sold_at must be YYYY-MM-DD/);

    await expect(
      createManualPosSale({
        orgId: org.id,
        soldAt: new Date("2026-05-02T03:00:00Z"),
        channel: "cash",
        amountIncludingVat: "107.00",
        taxBaseExVat: "100.00",
        vatAmount: "7.00",
        taxInvoiceType: "abb",
        taxInvoiceNumber: "ABB-BAD-QTY",
        terminalId: "T01",
        inventoryLine: { skuCode: "SKU-POS-1", quantity: "-2" },
      })
    ).rejects.toThrow(/inventoryLine.quantity must be a positive quantity/);
  });

  it("records manual cash deposits into the channel dashboard", async () => {
    const org = await createTestOrg(testDb);

    const deposit = await recordCashDeposit({
      orgId: org.id,
      depositedAt: "2026-05-03",
      amount: "950.00",
      depositedBy: "Store Staff",
      slipReference: "SLIP-001",
      posCashPeriodStart: "2026-05-01",
      posCashPeriodEnd: "2026-05-02",
      cashVariance: "-50.00",
    });

    expect(deposit.slipReference).toBe("SLIP-001");
    expect(deposit.cashVariance).toBe("-50.00");

    const dashboard = await getPosSalesWorkflowDashboard(org.id);
    expect(dashboard.cashSummary.depositedAmount).toBe("950.00");
    expect(dashboard.cashSummary.openVariance).toBe("-50.00");
    const depositAuditRows = await testDb
      .select()
      .from(schema.auditLog)
      .where(sql`${schema.auditLog.entityType} = 'cash_deposits'
        AND ${schema.auditLog.entityId} = ${deposit.id}
        AND ${schema.auditLog.action} = 'create'`);
    expect(depositAuditRows).toHaveLength(1);

    const lines = await testDb
      .select({
        accountCode: schema.glAccounts.accountCode,
        debitAmount: schema.journalLines.debitAmount,
        creditAmount: schema.journalLines.creditAmount,
        cashDepositKey: schema.journalLines.cashDepositKey,
      })
      .from(schema.journalLines)
      .innerJoin(
        schema.glAccounts,
        sql`${schema.glAccounts.id} = ${schema.journalLines.accountId}`
      )
      .orderBy(schema.journalLines.lineNumber);
    expect(lines).toEqual([
      {
        accountCode: "1111",
        debitAmount: "950.00",
        creditAmount: "0.00",
        cashDepositKey: "SLIP-001",
      },
      {
        accountCode: "1142",
        debitAmount: "0.00",
        creditAmount: "950.00",
        cashDepositKey: "SLIP-001",
      },
    ]);

    const outbox = await enqueuePostingOutbox({
      orgId: org.id,
      sourceEntityType: "cash_deposits",
      sourceEntityId: deposit.id,
      eventType: "create",
      postingDate: deposit.depositedAt,
      payload: { depositedAt: deposit.depositedAt },
    });
    const posted = await processPostingOutboxRow({
      orgId: org.id,
      postingOutboxId: outbox.id,
    });
    expect(posted.postingStatus).toBe("posted");
    expect(posted.journalEntryId).toBeTruthy();
    const depositEntries = await testDb
      .select()
      .from(schema.journalEntries)
      .where(sql`${schema.journalEntries.sourceEntityId} = ${deposit.id}`);
    expect(depositEntries).toHaveLength(1);
  });

  it("records manual processor settlements into the sales dashboard", async () => {
    const org = await createTestOrg(testDb);

    const settlement = await recordProcessorSettlement({
      orgId: org.id,
      processor: "ksher",
      externalId: "KS-20260503",
      periodEnd: new Date("2026-05-03T12:00:00+07:00"),
      grossAmount: "1070.00",
      feeAmount: "20.00",
      netPayout: "1050.00",
      reconciliationDiscrepancy: "0.00",
    });

    expect(settlement.processor).toBe("ksher");
    expect(settlement.reconciliationStatus).toBe("unreconciled");

    const dashboard = await getPosSalesWorkflowDashboard(org.id);
    expect(dashboard.settlementSummary.settlementCount).toBe(1);
    expect(dashboard.settlementSummary.grossAmount).toBe("1070.00");
    expect(dashboard.settlementSummary.netPayout).toBe("1050.00");
    const settlementAuditRows = await testDb
      .select()
      .from(schema.auditLog)
      .where(sql`${schema.auditLog.entityType} = 'processor_settlements'
        AND ${schema.auditLog.entityId} = ${settlement.id}
        AND ${schema.auditLog.action} = 'create'`);
    expect(settlementAuditRows).toHaveLength(1);

    const lines = await testDb
      .select({
        accountCode: schema.glAccounts.accountCode,
        debitAmount: schema.journalLines.debitAmount,
        creditAmount: schema.journalLines.creditAmount,
        processorKey: schema.journalLines.processorKey,
      })
      .from(schema.journalLines)
      .innerJoin(
        schema.glAccounts,
        sql`${schema.glAccounts.id} = ${schema.journalLines.accountId}`
      )
      .orderBy(schema.journalLines.lineNumber);
    expect(lines).toEqual([
      {
        accountCode: "1111",
        debitAmount: "1050.00",
        creditAmount: "0.00",
        processorKey: "ksher",
      },
      {
        accountCode: "6411",
        debitAmount: "20.00",
        creditAmount: "0.00",
        processorKey: "ksher",
      },
      {
        accountCode: "1142",
        debitAmount: "0.00",
        creditAmount: "1070.00",
        processorKey: "ksher",
      },
    ]);

    const outbox = await enqueuePostingOutbox({
      orgId: org.id,
      sourceEntityType: "processor_settlements",
      sourceEntityId: settlement.id,
      eventType: "create",
      postingDate: "2026-05-03",
      payload: { processor: "ksher", paymentDate: "2026-05-03" },
    });
    const posted = await processPostingOutboxRow({
      orgId: org.id,
      postingOutboxId: outbox.id,
    });
    expect(posted.postingStatus).toBe("posted");
    expect(posted.journalEntryId).toBeTruthy();
    const settlementEntries = await testDb
      .select()
      .from(schema.journalEntries)
      .where(sql`${schema.journalEntries.sourceEntityId} = ${settlement.id}`);
    expect(settlementEntries).toHaveLength(1);
  });

  it("posts zero-fee processor settlements without zero-value journal lines", async () => {
    const org = await createTestOrg(testDb);

    await recordProcessorSettlement({
      orgId: org.id,
      processor: "promptpay",
      externalId: "PP-20260503",
      periodEnd: new Date("2026-05-03T12:00:00+07:00"),
      grossAmount: "1070.00",
      feeAmount: "0.00",
      netPayout: "1070.00",
      reconciliationDiscrepancy: "0.00",
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
      .orderBy(schema.journalLines.lineNumber);
    expect(lines).toEqual([
      { accountCode: "1111", debitAmount: "1070.00", creditAmount: "0.00" },
      { accountCode: "1142", debitAmount: "0.00", creditAmount: "1070.00" },
    ]);
  });

  it("posts processor fee VAT only with linked tax invoice evidence", async () => {
    const org = await createTestOrg(testDb);
    const doc = await createTestDocument(testDb, org.id);

    const settlement = await recordProcessorSettlement({
      orgId: org.id,
      processor: "beam",
      externalId: "BEAM-20260503",
      periodEnd: new Date("2026-05-03T12:00:00+07:00"),
      grossAmount: "1070.00",
      feeAmount: "20.00",
      feeVatAmount: "1.40",
      netPayout: "1048.60",
      processorTaxInvoiceDocumentId: doc.id,
      reconciliationDiscrepancy: "0.00",
    });

    await postProcessorSettlementJournalEntry({
      tx: testDb,
      orgId: org.id,
      processorSettlementId: settlement.id,
    });

    const entries = await testDb
      .select()
      .from(schema.journalEntries)
      .where(sql`${schema.journalEntries.sourceEntityId} = ${settlement.id}`);
    expect(entries).toHaveLength(1);
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
      .orderBy(schema.journalLines.lineNumber);
    expect(lines).toEqual([
      { accountCode: "1111", debitAmount: "1048.60", creditAmount: "0.00" },
      { accountCode: "6411", debitAmount: "20.00", creditAmount: "0.00" },
      { accountCode: "1251", debitAmount: "1.40", creditAmount: "0.00" },
      { accountCode: "1142", debitAmount: "0.00", creditAmount: "1070.00" },
    ]);
  });

  it("rejects processor settlement posting when gross does not tie to net plus fees", async () => {
    const org = await createTestOrg(testDb);

    await expect(
      recordProcessorSettlement({
        orgId: org.id,
        processor: "ksher",
        externalId: "KS-BAD-TIEOUT",
        periodEnd: new Date("2026-05-03T12:00:00+07:00"),
        grossAmount: "1070.00",
        feeAmount: "20.00",
        netPayout: "1040.00",
        reconciliationDiscrepancy: "0.00",
      })
    ).rejects.toThrow(/gross must equal net payout plus fee/);
  });

  it("blocks processor settlement posting in locked GL periods", async () => {
    const org = await createTestOrg(testDb);
    await lockPeriod({
      orgId: org.id,
      domain: "gl",
      periodYear: 2026,
      periodMonth: 5,
      lockedByUserId: "test-user",
      lockReason: "test_lock",
    });

    await expect(
      recordProcessorSettlement({
        orgId: org.id,
        processor: "ksher",
        externalId: "KS-LOCKED",
        periodEnd: new Date("2026-05-03T12:00:00+07:00"),
        grossAmount: "1070.00",
        feeAmount: "20.00",
        netPayout: "1050.00",
        reconciliationDiscrepancy: "0.00",
      })
    ).rejects.toThrow(/GL period is locked/);
  });

  it("keeps processor shadow rows distinct from POS primary rows", async () => {
    const org = await createTestOrg(testDb);
    const establishment = await createHeadOffice(org.id);

    await testDb.insert(schema.salesTransactions).values({
      orgId: org.id,
      establishmentId: establishment.id,
      eventRole: "processor_shadow",
      source: "processor:ksher",
      externalId: "ksher-shadow-1",
      soldAt: new Date("2026-04-01T03:00:00Z"),
      channel: "card",
      pricingMode: "vat_inclusive",
      amountIncludingVat: "1070.00",
      taxBaseExVat: "1000.00",
      vatAmount: "70.00",
      clearingAccountKey: "card_ksher",
    });

    const rows = await testDb.select().from(schema.salesTransactions);
    expect(rows[0].eventRole).toBe("processor_shadow");
    expect(rows[0].taxInvoiceType).toBeNull();
  });

  it("enforces same-org establishment guardrails on POS source tables", async () => {
    const org = await createTestOrg(testDb);
    const otherOrg = await createTestOrg(testDb);
    const otherEstablishment = await createHeadOffice(otherOrg.id);

    await expect(
      testDb.insert(schema.salesTransactions).values({
        orgId: org.id,
        establishmentId: otherEstablishment.id,
        eventRole: "pos_primary",
        source: "pos:zort",
        externalId: "sale-cross-org",
        soldAt: new Date("2026-04-01T03:00:00Z"),
        channel: "cash",
        pricingMode: "vat_inclusive",
        amountIncludingVat: "107.00",
        taxBaseExVat: "100.00",
        vatAmount: "7.00",
        taxInvoiceType: "abb",
        taxInvoiceNumber: "ABB-X",
        terminalId: "T01",
        clearingAccountKey: "cash_drawer_T01",
      })
    ).rejects.toThrow(/Failed query/);

    await expect(
      testDb.insert(schema.cashDeposits).values({
        orgId: org.id,
        establishmentId: otherEstablishment.id,
        depositedAt: "2026-04-02",
        amount: "100.00",
      })
    ).rejects.toThrow(/Failed query/);
  });

  it("requires tax invoice evidence before claiming processor fee VAT", async () => {
    const org = await createTestOrg(testDb);
    const establishment = await createHeadOffice(org.id);
    const doc = await createTestDocument(testDb, org.id);

    await expect(
      testDb.insert(schema.processorSettlements).values({
        orgId: org.id,
        establishmentId: establishment.id,
        processor: "ksher",
        externalId: "settlement-1",
        grossAmount: "1070.00",
        feeAmount: "20.00",
        feeVatAmount: "1.40",
        netPayout: "1048.60",
      })
    ).rejects.toThrow(/Failed query/);

    await expect(
      testDb.insert(schema.processorSettlements).values({
        orgId: org.id,
        establishmentId: establishment.id,
        processor: "ksher",
        externalId: "settlement-2",
        grossAmount: "1070.00",
        feeAmount: "20.00",
        feeVatAmount: "1.40",
        netPayout: "1048.60",
        processorTaxInvoiceDocumentId: doc.id,
      })
    ).resolves.toBeDefined();
  });

  it("deduplicates active tax invoice serials per terminal and branch", async () => {
    const org = await createTestOrg(testDb);
    const establishment = await createHeadOffice(org.id);

    await testDb.insert(schema.salesTransactions).values({
      orgId: org.id,
      establishmentId: establishment.id,
      eventRole: "pos_primary",
      source: "pos:zort",
      externalId: "sale-serial-1",
      soldAt: new Date("2026-04-01T03:00:00Z"),
      channel: "cash",
      pricingMode: "vat_inclusive",
      amountIncludingVat: "107.00",
      taxBaseExVat: "100.00",
      vatAmount: "7.00",
      taxInvoiceType: "abb",
      taxInvoiceNumber: "ABB-001",
      terminalId: "T01",
      clearingAccountKey: "cash_drawer_T01",
    });

    await expect(
      testDb.insert(schema.salesTransactions).values({
        orgId: org.id,
        establishmentId: establishment.id,
        eventRole: "pos_primary",
        source: "pos:zort",
        externalId: "sale-serial-2",
        soldAt: new Date("2026-04-01T04:00:00Z"),
        channel: "cash",
        pricingMode: "vat_inclusive",
        amountIncludingVat: "107.00",
        taxBaseExVat: "100.00",
        vatAmount: "7.00",
        taxInvoiceType: "abb",
        taxInvoiceNumber: "ABB-001",
        terminalId: "T01",
        clearingAccountKey: "cash_drawer_T01",
      })
    ).rejects.toThrow(/Failed query/);
  });
});
