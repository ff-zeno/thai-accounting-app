import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import * as schema from "@/lib/db/schema";
import {
  createTestBankAccount,
  createTestDb,
  createTestDocument,
  createTestOrg,
  createTestVendor,
  migrateTestDb,
  resetTestDb,
} from "@/tests/db-test-utils";

const { db: testDb, pool } = createTestDb();
let createManualImportPacket: typeof import("./imports").createManualImportPacket;
let finalizeImportPacketToInventory: typeof import("./imports").finalizeImportPacketToInventory;
let getImportsWorkflowDashboard: typeof import("./imports").getImportsWorkflowDashboard;
let addManualImportChargeLine: typeof import("./imports").addManualImportChargeLine;
let addManualImportVatChargeLine: typeof import("./imports").addManualImportVatChargeLine;
let updateOpenImportPacketHeader: typeof import("./imports").updateOpenImportPacketHeader;
let deleteEmptyOpenImportPacket: typeof import("./imports").deleteEmptyOpenImportPacket;
let deleteOpenImportGoodsLine: typeof import("./imports").deleteOpenImportGoodsLine;
let deleteOpenImportChargeLine: typeof import("./imports").deleteOpenImportChargeLine;
let deleteOpenImportDocumentLink: typeof import("./imports").deleteOpenImportDocumentLink;
let deleteOpenImportPaymentLink: typeof import("./imports").deleteOpenImportPaymentLink;
let linkImportDocument: typeof import("./imports").linkImportDocument;
let linkImportPayment: typeof import("./imports").linkImportPayment;
let enqueuePostingOutbox: typeof import("./posting-outbox").enqueuePostingOutbox;
let processPostingOutboxRow: typeof import("./posting-outbox").processPostingOutboxRow;
let seedStandardGlAccounts: typeof import("./general-ledger").seedStandardGlAccounts;

beforeAll(async () => {
  await resetTestDb(pool);
  await migrateTestDb(pool);
  vi.doMock("../index", () => ({ db: testDb }));
  ({
    createManualImportPacket,
    finalizeImportPacketToInventory,
    getImportsWorkflowDashboard,
    addManualImportChargeLine,
    addManualImportVatChargeLine,
    updateOpenImportPacketHeader,
    deleteEmptyOpenImportPacket,
    deleteOpenImportGoodsLine,
    deleteOpenImportChargeLine,
    deleteOpenImportDocumentLink,
    deleteOpenImportPaymentLink,
    linkImportDocument,
    linkImportPayment,
  } = await import("./imports"));
  ({ enqueuePostingOutbox, processPostingOutboxRow } = await import("./posting-outbox"));
  ({ seedStandardGlAccounts } = await import("./general-ledger"));
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
      import_payments,
      import_charge_lines,
      import_goods_lines,
      import_documents,
      inventory_movements,
      skus,
      imports,
      journal_lines,
      journal_entries,
      gl_opening_balances,
      gl_accounts,
      transactions,
      bank_statements,
      bank_accounts,
      documents,
      vendors,
      establishments,
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

async function createImportPacket(orgId: string) {
  const establishment = await createHeadOffice(orgId);
  const vendor = await createTestVendor(testDb, orgId, {
    name: "Foreign Supplier",
  });

  const [packet] = await testDb
    .insert(schema.importPackets)
    .values({
      orgId,
      establishmentId: establishment.id,
      supplierVendorId: vendor.id,
      importReference: `IMP-${orgId.slice(0, 8)}`,
      customsDeclarationNumber: "A123456789",
      arrivalDate: "2026-05-01",
      customsClearanceDate: "2026-05-03",
      originalCurrency: "JPY",
      fxRateAtClearance: "0.23500000",
      customsAssessedImportVatThb: "700.00",
    })
    .returning();

  return { establishment, packet, vendor };
}

describe("imports foundation schema", () => {
  it("creates a manual import packet and dashboard read model", async () => {
    const org = await createTestOrg(testDb);

    const packet = await createManualImportPacket({
      orgId: org.id,
      importReference: "JP-2026-DASH",
      customsDeclarationNumber: "DECL-DASH",
      arrivalPort: "Laem Chabang",
      arrivalDate: "2026-05-01",
      customsClearanceDate: "2026-05-03",
      originalCurrency: "JPY",
      fxRateAtClearance: "0.23500000",
      customsAssessedDutyThb: "100.00",
      customsAssessedExciseThb: "0.00",
      customsAssessedImportVatThb: "700.00",
    });

    expect(packet.importReference).toBe("JP-2026-DASH");

    const dashboard = await getImportsWorkflowDashboard(org.id);
    expect(dashboard.summary.openCount).toBe(1);
    expect(dashboard.summary.assessedImportVat).toBe("700.00");
    expect(dashboard.recentPackets[0].branchNumber).toBe("00000");
  });

  it("updates and deletes only empty open import packets", async () => {
    const org = await createTestOrg(testDb);
    const packet = await createManualImportPacket({
      orgId: org.id,
      importReference: "JP-2026-EDIT",
      customsDeclarationNumber: "DECL-EDIT",
      arrivalPort: "Laem Chabang",
      arrivalDate: "2026-05-01",
      customsClearanceDate: "2026-05-03",
      originalCurrency: "JPY",
      fxRateAtClearance: "0.23500000",
      customsAssessedDutyThb: "100.00",
      customsAssessedExciseThb: "0.00",
      customsAssessedImportVatThb: "700.00",
    });

    const updated = await updateOpenImportPacketHeader({
      orgId: org.id,
      importId: packet.id,
      importReference: "JP-2026-EDITED",
      customsDeclarationNumber: "DECL-EDITED",
      arrivalPort: "Suvarnabhumi",
      notes: "owner corrected reference",
    });

    expect(updated).toMatchObject({
      importReference: "JP-2026-EDITED",
      customsDeclarationNumber: "DECL-EDITED",
      arrivalPort: "Suvarnabhumi",
      notes: "owner corrected reference",
    });

    await deleteEmptyOpenImportPacket({
      orgId: org.id,
      importId: packet.id,
      deletedAt: new Date("2026-05-04T00:00:00Z"),
    });

    const dashboard = await getImportsWorkflowDashboard(org.id);
    expect(dashboard.summary.openCount).toBe(0);
  });

  it("blocks deletion of non-empty or finalized import packets", async () => {
    const org = await createTestOrg(testDb);
    const { packet } = await createImportPacket(org.id);

    await testDb.insert(schema.importGoodsLines).values({
      orgId: org.id,
      importId: packet.id,
      skuCode: "SKU-JP-001",
      quantity: "1.0000",
      unitPriceOriginal: "1000.0000",
    });

    await expect(
      deleteEmptyOpenImportPacket({ orgId: org.id, importId: packet.id })
    ).rejects.toThrow(/Only empty open import packets/);

    const finalizedOrg = await createTestOrg(testDb);
    const { packet: finalizedPacket } = await createImportPacket(finalizedOrg.id);
    await testDb.insert(schema.importGoodsLines).values({
      orgId: finalizedOrg.id,
      importId: finalizedPacket.id,
      skuCode: "SKU-JP-FINAL",
      quantity: "1.0000",
      unitPriceOriginal: "1000.0000",
    });
    await testDb
      .update(schema.importPackets)
      .set({
        customsAssessedImportVatThb: "0.00",
        isFinalized: true,
        finalizedAt: new Date("2026-05-06T00:00:00Z"),
      })
      .where(sql`${schema.importPackets.id} = ${finalizedPacket.id}`);

    await expect(
      updateOpenImportPacketHeader({
        orgId: finalizedOrg.id,
        importId: finalizedPacket.id,
        importReference: "LATE-EDIT",
      })
    ).rejects.toThrow(/Finalized import packets cannot be edited/);

    await expect(
      deleteEmptyOpenImportPacket({ orgId: finalizedOrg.id, importId: finalizedPacket.id })
    ).rejects.toThrow(/Finalized import packets cannot be deleted/);
  });

  it("deletes open goods and charge lines with audit trail rows", async () => {
    const org = await createTestOrg(testDb);
    const { packet } = await createImportPacket(org.id);
    const doc = await createTestDocument(testDb, org.id);

    const [goodsLine] = await testDb
      .insert(schema.importGoodsLines)
      .values({
        orgId: org.id,
        importId: packet.id,
        skuCode: "SKU-JP-DELETE",
        quantity: "1.0000",
        unitPriceOriginal: "1000.0000",
      })
      .returning();
    const [chargeLine] = await testDb
      .insert(schema.importChargeLines)
      .values({
        orgId: org.id,
        importId: packet.id,
        sourceDocumentId: doc.id,
        lineDescription: "Broker service fee",
        amountThb: "100.00",
        originalAmount: "100.00",
        vatTreatment: "service_with_vat_pct",
        vatAmountThb: "7.00",
      })
      .returning();

    await deleteOpenImportGoodsLine({
      orgId: org.id,
      importId: packet.id,
      goodsLineId: goodsLine.id,
    });
    await deleteOpenImportChargeLine({
      orgId: org.id,
      importId: packet.id,
      chargeLineId: chargeLine.id,
    });

    const [goodsCount] = await testDb
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(schema.importGoodsLines)
      .where(sql`${schema.importGoodsLines.importId} = ${packet.id}`);
    const [chargeCount] = await testDb
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(schema.importChargeLines)
      .where(sql`${schema.importChargeLines.importId} = ${packet.id}`);
    const [documentLinkCount] = await testDb
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(schema.importDocuments)
      .where(sql`${schema.importDocuments.importId} = ${packet.id}`);
    const [sourceDoc] = await testDb
      .select({ deletedAt: schema.documents.deletedAt })
      .from(schema.documents)
      .where(sql`${schema.documents.id} = ${doc.id}`);
    expect(goodsCount.count).toBe(0);
    expect(chargeCount.count).toBe(0);
    expect(documentLinkCount.count).toBe(0);
    expect(sourceDoc.deletedAt).toBeInstanceOf(Date);

    const auditRows = await testDb
      .select({ oldValue: schema.auditLog.oldValue, newValue: schema.auditLog.newValue })
      .from(schema.auditLog)
      .where(sql`${schema.auditLog.entityId} = ${packet.id}`);
    expect(auditRows.map((row) => (row.newValue as { operation?: string }).operation)).toEqual(
      expect.arrayContaining(["delete_import_goods_line", "delete_import_charge_line"])
    );
    expect(auditRows.some((row) => (row.oldValue as { id?: string } | null)?.id === goodsLine.id)).toBe(true);
    expect(auditRows.some((row) => (row.oldValue as { id?: string } | null)?.id === chargeLine.id)).toBe(true);
  });

  it("blocks goods and charge line deletion in locked import periods", async () => {
    const org = await createTestOrg(testDb);
    const { packet } = await createImportPacket(org.id);
    const doc = await createTestDocument(testDb, org.id);
    const bankAccount = await createTestBankAccount(testDb, org.id);
    const [paymentTxn] = await testDb
      .insert(schema.transactions)
      .values({
        orgId: org.id,
        bankAccountId: bankAccount.id,
        date: "2026-05-05",
        description: "Import broker payment",
        amount: "-10700.00",
        type: "debit",
      })
      .returning();
    const [goodsLine] = await testDb
      .insert(schema.importGoodsLines)
      .values({
        orgId: org.id,
        importId: packet.id,
        skuCode: "SKU-JP-LOCKED",
        quantity: "1.0000",
        unitPriceOriginal: "1000.0000",
      })
      .returning();
    const [chargeLine] = await testDb
      .insert(schema.importChargeLines)
      .values({
        orgId: org.id,
        importId: packet.id,
        sourceDocumentId: doc.id,
        lineDescription: "Broker service fee",
        amountThb: "100.00",
        originalAmount: "100.00",
        vatTreatment: "service_with_vat_pct",
        vatAmountThb: "7.00",
      })
      .returning();

    await testDb.insert(schema.periodLocks).values({
      orgId: org.id,
      establishmentId: packet.establishmentId,
      domain: "vat",
      periodYear: 2026,
      periodMonth: 5,
      lockedByUserId: "user-lock",
      lockReason: "vat_filed",
    });

    await expect(
      deleteOpenImportGoodsLine({
        orgId: org.id,
        importId: packet.id,
        goodsLineId: goodsLine.id,
      })
    ).rejects.toThrow(/locked/);
    await expect(
      deleteOpenImportChargeLine({
        orgId: org.id,
        importId: packet.id,
        chargeLineId: chargeLine.id,
      })
    ).rejects.toThrow(/locked/);
    await expect(
      addManualImportVatChargeLine({
        orgId: org.id,
        importId: packet.id,
        lineDescription: "Customs import VAT",
        amountThb: "700.00",
        documentNumber: "RCPT-LOCK",
      })
    ).rejects.toThrow(/locked/);
    await expect(
      linkImportDocument({
        orgId: org.id,
        importId: packet.id,
        documentRole: "foreign_supplier_invoice",
        documentNumber: "SUP-LOCK",
      })
    ).rejects.toThrow(/locked/);
    await expect(
      linkImportPayment({
        orgId: org.id,
        importId: packet.id,
        bankTransactionId: paymentTxn.id,
        paymentRole: "broker_settlement",
        amountThb: "10700.00",
      })
    ).rejects.toThrow(/locked/);
  });

  it("deletes open document links unless a charge line still uses the document", async () => {
    const org = await createTestOrg(testDb);
    const { packet } = await createImportPacket(org.id);

    const linked = await linkImportDocument({
      orgId: org.id,
      importId: packet.id,
      documentRole: "foreign_supplier_invoice",
      documentNumber: "SUP-001",
      notes: "temporary supplier invoice",
    });

    await deleteOpenImportDocumentLink({
      orgId: org.id,
      importId: packet.id,
      importDocumentId: linked.link.id,
    });

    const [linkCount] = await testDb
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(schema.importDocuments)
      .where(sql`${schema.importDocuments.importId} = ${packet.id}`);
    const [sourceDoc] = await testDb
      .select({ deletedAt: schema.documents.deletedAt })
      .from(schema.documents)
      .where(sql`${schema.documents.id} = ${linked.document.id}`);
    expect(linkCount.count).toBe(0);
    expect(sourceDoc.deletedAt).toBeInstanceOf(Date);

    const doc = await createTestDocument(testDb, org.id);
    const [chargeLink] = await testDb
      .insert(schema.importDocuments)
      .values({
        orgId: org.id,
        importId: packet.id,
        documentId: doc.id,
        documentRole: "broker_invoice",
      })
      .returning();
    await testDb.insert(schema.importChargeLines).values({
      orgId: org.id,
      importId: packet.id,
      sourceDocumentId: doc.id,
      lineDescription: "Broker service fee",
      amountThb: "100.00",
      originalAmount: "100.00",
      vatTreatment: "service_with_vat_pct",
      vatAmountThb: "7.00",
    });

    await expect(
      deleteOpenImportDocumentLink({
        orgId: org.id,
        importId: packet.id,
        importDocumentId: chargeLink.id,
      })
    ).rejects.toThrow(/still used by a charge line/);
  });

  it("stores an import packet with documents, goods, charges, and payments", async () => {
    const org = await createTestOrg(testDb);
    const { packet } = await createImportPacket(org.id);
    const brokerDoc = await createTestDocument(testDb, org.id);
    const bankAccount = await createTestBankAccount(testDb, org.id);
    const [paymentTxn] = await testDb
      .insert(schema.transactions)
      .values({
        orgId: org.id,
        bankAccountId: bankAccount.id,
        date: "2026-05-05",
        description: "Broker settlement",
        amount: "-10700.00",
        type: "debit",
      })
      .returning();

    await testDb.insert(schema.importDocuments).values({
      orgId: org.id,
      importId: packet.id,
      documentId: brokerDoc.id,
      documentRole: "broker_invoice",
    });

    await testDb.insert(schema.importGoodsLines).values({
      orgId: org.id,
      importId: packet.id,
      skuCode: "SKU-JP-001",
      quantity: "10.0000",
      unitPriceOriginal: "1000.0000",
      goodsValueOriginal: "10000.00",
      goodsValueThb: "2350.00",
    });

    await testDb.insert(schema.importChargeLines).values({
      orgId: org.id,
      importId: packet.id,
      sourceDocumentId: brokerDoc.id,
      lineDescription: "Customs import VAT",
      amountThb: "700.00",
      originalAmount: "700.00",
      vatTreatment: "is_import_vat",
      vatPeriodOverride: "2026-05",
    });

    await testDb.insert(schema.importPayments).values({
      orgId: org.id,
      importId: packet.id,
      bankTransactionId: paymentTxn.id,
      paymentRole: "broker_settlement",
      amountThb: "10700.00",
    });

    await expect(
      testDb
        .update(schema.importPackets)
        .set({ isFinalized: true, finalizedAt: new Date("2026-05-06T00:00:00Z") })
        .where(sql`${schema.importPackets.id} = ${packet.id}`)
    ).resolves.toBeDefined();
  });

  it("links import documents and payments through query helpers", async () => {
    const org = await createTestOrg(testDb);
    await seedStandardGlAccounts(org.id);
    const { packet } = await createImportPacket(org.id);
    const bankAccount = await createTestBankAccount(testDb, org.id);
    const [paymentTxn] = await testDb
      .insert(schema.transactions)
      .values({
        orgId: org.id,
        bankAccountId: bankAccount.id,
        date: "2026-05-05",
        description: "Import broker payment",
        amount: "-10700.00",
        type: "debit",
      })
      .returning();

    const linkedDoc = await linkImportDocument({
      orgId: org.id,
      importId: packet.id,
      documentRole: "broker_invoice",
      documentNumber: "UPS-001",
      notes: "Broker bill",
    });
    expect(linkedDoc.link.documentRole).toBe("broker_invoice");
    const beforePaymentDetail = await import("./imports").then((mod) =>
      mod.getImportPacketDetail(org.id, packet.id)
    );
    expect(beforePaymentDetail?.paymentCandidates.map((candidate) => candidate.id)).toContain(
      paymentTxn.id
    );

    const linkedPayment = await linkImportPayment({
      orgId: org.id,
      importId: packet.id,
      bankTransactionId: paymentTxn.id,
      paymentRole: "broker_settlement",
      amountThb: "10700.00",
    });
    expect(linkedPayment.paymentRole).toBe("broker_settlement");

    const detail = await import("./imports").then((mod) =>
      mod.getImportPacketDetail(org.id, packet.id)
    );
    expect(detail?.documents).toHaveLength(1);
    expect(detail?.payments).toHaveLength(1);
    const [entry] = await testDb
      .select()
      .from(schema.journalEntries)
      .where(sql`${schema.journalEntries.sourceEntityId} = ${linkedPayment.id}`);
    expect(entry?.postingKind).toBe("import_payment_clearing");
    expect(entry?.entryType).toBe("auto_payment");
    const [updatedTxn] = await testDb
      .select({ reconciliationStatus: schema.transactions.reconciliationStatus })
      .from(schema.transactions)
      .where(sql`${schema.transactions.id} = ${paymentTxn.id}`);
    expect(updatedTxn.reconciliationStatus).toBe("matched");
    const outbox = await enqueuePostingOutbox({
      orgId: org.id,
      sourceEntityType: "import_payments",
      sourceEntityId: linkedPayment.id,
      eventType: "create",
      postingDate: paymentTxn.date,
      payload: { paymentRole: linkedPayment.paymentRole },
    });
    const posted = await processPostingOutboxRow({
      orgId: org.id,
      postingOutboxId: outbox.id,
    });
    expect(posted.postingStatus).toBe("posted");
    expect(posted.journalEntryId).toBe(entry.id);
    const paymentEntries = await testDb
      .select()
      .from(schema.journalEntries)
      .where(sql`${schema.journalEntries.sourceEntityId} = ${linkedPayment.id}`);
    expect(paymentEntries).toHaveLength(1);
    expect(detail?.auditTrail.map((event) => event.eventType)).toEqual(
      expect.arrayContaining(["audit", "document", "payment", "journal"])
    );
  });

  it("deletes open payment links by reversing GL and releasing the bank transaction", async () => {
    const org = await createTestOrg(testDb);
    await seedStandardGlAccounts(org.id);
    const { packet } = await createImportPacket(org.id);
    const bankAccount = await createTestBankAccount(testDb, org.id);
    const [paymentTxn] = await testDb
      .insert(schema.transactions)
      .values({
        orgId: org.id,
        bankAccountId: bankAccount.id,
        date: "2026-05-05",
        description: "Import broker payment",
        amount: "-10700.00",
        type: "debit",
      })
      .returning();

    const linkedPayment = await linkImportPayment({
      orgId: org.id,
      importId: packet.id,
      bankTransactionId: paymentTxn.id,
      paymentRole: "broker_settlement",
      amountThb: "10700.00",
    });
    const [entry] = await testDb
      .select()
      .from(schema.journalEntries)
      .where(sql`${schema.journalEntries.sourceEntityId} = ${linkedPayment.id}
        AND ${schema.journalEntries.postingKind} = 'import_payment_clearing'`);
    const [outbox] = await testDb
      .select()
      .from(schema.postingOutbox)
      .where(sql`${schema.postingOutbox.sourceEntityId} = ${linkedPayment.id}`);
    await testDb.insert(schema.postingExceptions).values({
      orgId: org.id,
      postingOutboxId: outbox.id,
      sourceEntityType: "import_payments",
      sourceEntityId: linkedPayment.id,
      failureClass: "db_error",
      message: "historical failed import payment post",
    });

    await deleteOpenImportPaymentLink({
      orgId: org.id,
      importId: packet.id,
      importPaymentId: linkedPayment.id,
    });

    const remainingPayments = await testDb
      .select()
      .from(schema.importPayments)
      .where(sql`${schema.importPayments.id} = ${linkedPayment.id}`);
    expect(remainingPayments).toHaveLength(0);
    const remainingOutbox = await testDb
      .select()
      .from(schema.postingOutbox)
      .where(sql`${schema.postingOutbox.sourceEntityId} = ${linkedPayment.id}`);
    expect(remainingOutbox).toHaveLength(0);
    const remainingExceptions = await testDb
      .select()
      .from(schema.postingExceptions)
      .where(sql`${schema.postingExceptions.sourceEntityId} = ${linkedPayment.id}`);
    expect(remainingExceptions).toHaveLength(0);
    const [updatedTxn] = await testDb
      .select({ reconciliationStatus: schema.transactions.reconciliationStatus })
      .from(schema.transactions)
      .where(sql`${schema.transactions.id} = ${paymentTxn.id}`);
    expect(updatedTxn.reconciliationStatus).toBe("unmatched");
    const [updatedEntry] = await testDb
      .select()
      .from(schema.journalEntries)
      .where(sql`${schema.journalEntries.id} = ${entry.id}`);
    expect(updatedEntry.reversedByEntryId).toBeTruthy();
    const reversalLines = await testDb
      .select()
      .from(schema.journalLines)
      .where(sql`${schema.journalLines.journalEntryId} = ${updatedEntry.reversedByEntryId}`);
    expect(reversalLines.every((line) => line.subledgerEntityId === null)).toBe(true);
    const [auditRow] = await testDb
      .select()
      .from(schema.auditLog)
      .where(sql`${schema.auditLog.entityId} = ${packet.id}
        AND ${schema.auditLog.newValue}->>'operation' = 'delete_import_payment_link'`);
    expect(auditRow?.oldValue).toMatchObject({
      id: linkedPayment.id,
      bankTransactionId: paymentTxn.id,
    });
  });

  it("blocks payment-link deletion in locked import periods", async () => {
    const org = await createTestOrg(testDb);
    await seedStandardGlAccounts(org.id);
    const { packet } = await createImportPacket(org.id);
    const bankAccount = await createTestBankAccount(testDb, org.id);
    const [paymentTxn] = await testDb
      .insert(schema.transactions)
      .values({
        orgId: org.id,
        bankAccountId: bankAccount.id,
        date: "2026-05-05",
        description: "Import broker payment",
        amount: "-10700.00",
        type: "debit",
      })
      .returning();

    const linkedPayment = await linkImportPayment({
      orgId: org.id,
      importId: packet.id,
      bankTransactionId: paymentTxn.id,
      paymentRole: "broker_settlement",
      amountThb: "10700.00",
    });

    await testDb.insert(schema.periodLocks).values({
      orgId: org.id,
      domain: "gl",
      periodYear: 2026,
      periodMonth: 5,
      lockedByUserId: "user-lock",
      lockReason: "month_closed",
    });

    await expect(
      deleteOpenImportPaymentLink({
        orgId: org.id,
        importId: packet.id,
        importPaymentId: linkedPayment.id,
      })
    ).rejects.toThrow(/locked/);
  });

  it("blocks payment-link deletion when the bank transaction GL period is locked", async () => {
    const org = await createTestOrg(testDb);
    await seedStandardGlAccounts(org.id);
    const { packet } = await createImportPacket(org.id);
    const bankAccount = await createTestBankAccount(testDb, org.id);
    const [paymentTxn] = await testDb
      .insert(schema.transactions)
      .values({
        orgId: org.id,
        bankAccountId: bankAccount.id,
        date: "2026-04-25",
        description: "Import broker payment",
        amount: "-10700.00",
        type: "debit",
      })
      .returning();

    const linkedPayment = await linkImportPayment({
      orgId: org.id,
      importId: packet.id,
      bankTransactionId: paymentTxn.id,
      paymentRole: "broker_settlement",
      amountThb: "10700.00",
    });

    await testDb.insert(schema.periodLocks).values({
      orgId: org.id,
      domain: "gl",
      periodYear: 2026,
      periodMonth: 4,
      lockedByUserId: "user-lock",
      lockReason: "month_closed",
    });

    await expect(
      deleteOpenImportPaymentLink({
        orgId: org.id,
        importId: packet.id,
        importPaymentId: linkedPayment.id,
      })
    ).rejects.toThrow(/locked GL period/);

    const [stillLinked] = await testDb
      .select()
      .from(schema.importPayments)
      .where(sql`${schema.importPayments.id} = ${linkedPayment.id}`);
    expect(stillLinked).toBeTruthy();
  });

  it("posts foreign supplier import payments to supplier advances", async () => {
    const org = await createTestOrg(testDb);
    const { packet } = await createImportPacket(org.id);
    const bankAccount = await createTestBankAccount(testDb, org.id);
    const [paymentTxn] = await testDb
      .insert(schema.transactions)
      .values({
        orgId: org.id,
        bankAccountId: bankAccount.id,
        date: "2026-05-05",
        description: "Foreign supplier remittance",
        amount: "-2350.00",
        type: "debit",
      })
      .returning();

    const linkedPayment = await linkImportPayment({
      orgId: org.id,
      importId: packet.id,
      bankTransactionId: paymentTxn.id,
      paymentRole: "foreign_supplier_payment",
      amountThb: "2350.00",
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
      .innerJoin(
        schema.journalEntries,
        sql`${schema.journalEntries.id} = ${schema.journalLines.journalEntryId}`
      )
      .where(sql`${schema.journalEntries.sourceEntityId} = ${linkedPayment.id}`);

    expect(lines).toEqual(expect.arrayContaining([
      { accountCode: "1185", debitAmount: "2350.00", creditAmount: "0.00" },
      { accountCode: "1111", debitAmount: "0.00", creditAmount: "2350.00" },
    ]));
  });

  it("rejects import payment links to credit bank transactions", async () => {
    const org = await createTestOrg(testDb);
    const { packet } = await createImportPacket(org.id);
    const bankAccount = await createTestBankAccount(testDb, org.id);
    const [paymentTxn] = await testDb
      .insert(schema.transactions)
      .values({
        orgId: org.id,
        bankAccountId: bankAccount.id,
        date: "2026-05-05",
        description: "Deposit incorrectly linked as import payment",
        amount: "10700.00",
        type: "credit",
      })
      .returning();

    await expect(
      linkImportPayment({
        orgId: org.id,
        importId: packet.id,
        bankTransactionId: paymentTxn.id,
        paymentRole: "broker_settlement",
        amountThb: "10700.00",
      })
    ).rejects.toThrow(/debit bank transaction/);
  });

  it("blocks import payment clearing into a locked GL period", async () => {
    const org = await createTestOrg(testDb);
    await seedStandardGlAccounts(org.id);
    const { packet } = await createImportPacket(org.id);
    const bankAccount = await createTestBankAccount(testDb, org.id);
    const [paymentTxn] = await testDb
      .insert(schema.transactions)
      .values({
        orgId: org.id,
        bankAccountId: bankAccount.id,
        date: "2026-05-05",
        description: "Import broker payment",
        amount: "-10700.00",
        type: "debit",
      })
      .returning();

    await testDb.insert(schema.periodLocks).values({
      orgId: org.id,
      domain: "gl",
      periodYear: 2026,
      periodMonth: 5,
      lockedByUserId: "user-lock",
      lockReason: "month_closed",
    });

    await expect(
      linkImportPayment({
        orgId: org.id,
        importId: packet.id,
        bankTransactionId: paymentTxn.id,
        paymentRole: "broker_settlement",
        amountThb: "10700.00",
      })
    ).rejects.toThrow(/locked/);
  });

  it("captures mixed-treatment broker charge lines", async () => {
    const org = await createTestOrg(testDb);
    const { packet } = await createImportPacket(org.id);

    const charge = await addManualImportChargeLine({
      orgId: org.id,
      importId: packet.id,
      documentNumber: "UPS-FEE-001",
      lineDescription: "Broker service fee",
      amountThb: "100.00",
      vatTreatment: "service_with_vat_pct",
      vatAmountThb: "7.00",
    });

    expect(charge.vatTreatment).toBe("service_with_vat_pct");
    expect(charge.vatAmountThb).toBe("7.00");

    const detail = await import("./imports").then((mod) =>
      mod.getImportPacketDetail(org.id, packet.id)
    );
    expect(detail?.documents).toHaveLength(1);
    expect(detail?.chargeLines.map((line) => line.lineDescription)).toEqual([
      "Broker service fee",
    ]);
    expect(detail?.auditTrail.map((event) => event.eventType)).toEqual(
      expect.arrayContaining(["audit", "document", "charge"])
    );
  });

  it("finalizes an import packet into goods-value-only inventory movements", async () => {
    const org = await createTestOrg(testDb);
    const { packet } = await createImportPacket(org.id);
    const doc = await createTestDocument(testDb, org.id);

    await testDb.insert(schema.importGoodsLines).values({
      orgId: org.id,
      importId: packet.id,
      skuCode: "SKU-JP-FINAL",
      description: "Japan import item",
      quantity: "10.0000",
      unitPriceOriginal: "1000.0000",
      goodsValueOriginal: "10000.00",
      goodsValueThb: "2350.00",
    });

    await testDb.insert(schema.importChargeLines).values({
      orgId: org.id,
      importId: packet.id,
      sourceDocumentId: doc.id,
      lineDescription: "Customs import VAT",
      amountThb: "700.00",
      originalAmount: "700.00",
      vatTreatment: "is_import_vat",
      vatPeriodOverride: "2026-05",
    });

    const result = await finalizeImportPacketToInventory({
      orgId: org.id,
      importId: packet.id,
      finalizedAt: new Date("2026-05-06T00:00:00Z"),
    });

    expect(result.movementCount).toBe(1);
    expect(result.importPacket.isFinalized).toBe(true);

    const [sku] = await testDb.select().from(schema.skus);
    expect(sku.skuCode).toBe("SKU-JP-FINAL");
    expect(sku.currentQuantity).toBe("10.0000");
    expect(sku.currentAvgCost).toBe("235.0000");
    expect(sku.currentValue).toBe("2350.00");

    const [movement] = await testDb.select().from(schema.inventoryMovements);
    expect(movement.movementType).toBe("import_in");
    expect(movement.sourceEntityType).toBe("import_goods_lines");
    expect(movement.unitCost).toBe("235.0000");
    expect(movement.movementAt.toISOString()).toBe("2026-05-03T05:00:00.000Z");

    const brokerLines = await testDb
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
    expect(brokerLines).toEqual([
      { accountCode: "1251", debitAmount: "700.00", creditAmount: "0.00" },
      { accountCode: "2110", debitAmount: "0.00", creditAmount: "700.00" },
    ]);

    const auditRows = await testDb
      .select()
      .from(schema.auditLog)
      .where(sql`${schema.auditLog.entityId} = ${packet.id}`);
    expect(
      auditRows.some(
        (row) =>
          (row.newValue as { operation?: string } | null)?.operation ===
          "finalize_import_packet"
      )
    ).toBe(true);
    expect(auditRows.some((row) => row.action === "update")).toBe(true);
  });

  it("derives import VAT period from the packet and blocks duplicate import VAT lines", async () => {
    const org = await createTestOrg(testDb);
    const { packet } = await createImportPacket(org.id);

    const charge = await addManualImportVatChargeLine({
      orgId: org.id,
      importId: packet.id,
      lineDescription: "Customs import VAT",
      amountThb: "700.00",
      documentNumber: "DECL-VAT-001",
    });

    expect(charge.vatPeriodOverride).toBe("2026-05");
    await expect(
      addManualImportVatChargeLine({
        orgId: org.id,
        importId: packet.id,
        lineDescription: "Duplicate import VAT",
        amountThb: "1.00",
      })
    ).rejects.toThrow(/already has an import VAT line/);
  });

  it("posts mixed-treatment import broker charge lines on finalize", async () => {
    const org = await createTestOrg(testDb);
    const { packet } = await createImportPacket(org.id);
    const doc = await createTestDocument(testDb, org.id);

    await testDb.insert(schema.importGoodsLines).values({
      orgId: org.id,
      importId: packet.id,
      skuCode: "SKU-JP-MIXED",
      quantity: "10.0000",
      unitPriceOriginal: "1000.0000",
    });
    await testDb.insert(schema.importChargeLines).values([
      {
        orgId: org.id,
        importId: packet.id,
        sourceDocumentId: doc.id,
        lineDescription: "Broker service fee",
        amountThb: "100.00",
        originalAmount: "100.00",
        vatTreatment: "service_with_vat_pct",
        vatAmountThb: "7.00",
      },
      {
        orgId: org.id,
        importId: packet.id,
        sourceDocumentId: doc.id,
        lineDescription: "Customs duty advanced",
        amountThb: "200.00",
        originalAmount: "200.00",
        vatTreatment: "is_pass_through",
      },
      {
        orgId: org.id,
        importId: packet.id,
        sourceDocumentId: doc.id,
        lineDescription: "Customs import VAT",
        amountThb: "700.00",
        originalAmount: "700.00",
        vatTreatment: "is_import_vat",
        vatPeriodOverride: "2026-05",
      },
    ]);

    await finalizeImportPacketToInventory({
      orgId: org.id,
      importId: packet.id,
      finalizedAt: new Date("2026-05-06T00:00:00Z"),
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
    expect(lines).toHaveLength(5);
    expect(lines).toEqual(expect.arrayContaining([
      { accountCode: "5160", debitAmount: "100.00", creditAmount: "0.00" },
      { accountCode: "1251", debitAmount: "7.00", creditAmount: "0.00" },
      { accountCode: "5150", debitAmount: "200.00", creditAmount: "0.00" },
      { accountCode: "1251", debitAmount: "700.00", creditAmount: "0.00" },
      { accountCode: "2110", debitAmount: "0.00", creditAmount: "1007.00" },
    ]));

    const [entry] = await testDb
      .select()
      .from(schema.journalEntries)
      .where(sql`${schema.journalEntries.sourceEntityId} = ${doc.id}`);
    const [outbox] = await testDb
      .select()
      .from(schema.postingOutbox)
      .where(sql`${schema.postingOutbox.sourceEntityType} = 'import_charge_documents'
        AND ${schema.postingOutbox.sourceEntityId} = ${doc.id}`);
    expect(outbox.postingStatus).toBe("pending");

    const posted = await processPostingOutboxRow({
      orgId: org.id,
      postingOutboxId: outbox.id,
    });
    expect(posted.postingStatus).toBe("posted");
    expect(posted.journalEntryId).toBe(entry.id);

    const entries = await testDb
      .select()
      .from(schema.journalEntries)
      .where(sql`${schema.journalEntries.sourceEntityId} = ${doc.id}`);
    expect(entries).toHaveLength(1);
  });

  it("credits customs-declaration import VAT to clearing liability, not broker AP", async () => {
    const org = await createTestOrg(testDb);
    const { packet } = await createImportPacket(org.id);

    await testDb.insert(schema.importGoodsLines).values({
      orgId: org.id,
      importId: packet.id,
      skuCode: "SKU-JP-CUSTOMS",
      quantity: "10.0000",
      unitPriceOriginal: "1000.0000",
    });
    await addManualImportVatChargeLine({
      orgId: org.id,
      importId: packet.id,
      lineDescription: "Customs import VAT",
      amountThb: "700.00",
      documentNumber: "DECL-CLEARING",
    });

    await finalizeImportPacketToInventory({
      orgId: org.id,
      importId: packet.id,
      finalizedAt: new Date("2026-05-06T00:00:00Z"),
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
      { accountCode: "1251", debitAmount: "700.00", creditAmount: "0.00" },
      { accountCode: "2190", debitAmount: "0.00", creditAmount: "700.00" },
    ]);
  });

  it("rejects VAT amounts on non-VAT import charge treatments", async () => {
    const org = await createTestOrg(testDb);
    const { packet } = await createImportPacket(org.id);

    await expect(
      addManualImportChargeLine({
        orgId: org.id,
        importId: packet.id,
        documentNumber: "UPS-BAD-VAT",
        lineDescription: "Customs duty advanced",
        amountThb: "200.00",
        vatTreatment: "is_pass_through",
        vatAmountThb: "14.00",
      })
    ).rejects.toThrow(/Only service-with-VAT/);
  });

  it("blocks finalizing imports into locked VAT or GL periods", async () => {
    const org = await createTestOrg(testDb);
    const { packet } = await createImportPacket(org.id);
    const doc = await createTestDocument(testDb, org.id);

    await testDb.insert(schema.importGoodsLines).values({
      orgId: org.id,
      importId: packet.id,
      skuCode: "SKU-LOCKED",
      quantity: "1.0000",
      unitPriceOriginal: "1000.0000",
    });
    await testDb.insert(schema.importChargeLines).values({
      orgId: org.id,
      importId: packet.id,
      sourceDocumentId: doc.id,
      lineDescription: "Customs import VAT",
      amountThb: "700.00",
      originalAmount: "700.00",
      vatTreatment: "is_import_vat",
      vatPeriodOverride: "2026-05",
    });
    await testDb.insert(schema.periodLocks).values({
      orgId: org.id,
      establishmentId: packet.establishmentId,
      domain: "vat",
      periodYear: 2026,
      periodMonth: 5,
      lockedByUserId: "user-lock",
      lockReason: "vat_filed",
    });

    await expect(
      finalizeImportPacketToInventory({ orgId: org.id, importId: packet.id })
    ).rejects.toThrow(/locked/);
  });

  it("requires linked import payment to match the bank transaction amount", async () => {
    const org = await createTestOrg(testDb);
    const { packet } = await createImportPacket(org.id);
    const bankAccount = await createTestBankAccount(testDb, org.id);
    const [paymentTxn] = await testDb
      .insert(schema.transactions)
      .values({
        orgId: org.id,
        bankAccountId: bankAccount.id,
        date: "2026-05-05",
        description: "Import broker payment",
        amount: "-10700.00",
        type: "debit",
      })
      .returning();

    await expect(
      linkImportPayment({
        orgId: org.id,
        importId: packet.id,
        bankTransactionId: paymentTxn.id,
        paymentRole: "broker_settlement",
        amountThb: "100.00",
      })
    ).rejects.toThrow(/must match/);
  });

  it("prevents linking import payments to already matched bank transactions", async () => {
    const org = await createTestOrg(testDb);
    const { packet } = await createImportPacket(org.id);
    const bankAccount = await createTestBankAccount(testDb, org.id);
    const [paymentTxn] = await testDb
      .insert(schema.transactions)
      .values({
        orgId: org.id,
        bankAccountId: bankAccount.id,
        date: "2026-05-05",
        description: "Already matched import broker payment",
        amount: "-10700.00",
        type: "debit",
        reconciliationStatus: "matched",
      })
      .returning();

    await expect(
      linkImportPayment({
        orgId: org.id,
        importId: packet.id,
        bankTransactionId: paymentTxn.id,
        paymentRole: "broker_settlement",
        amountThb: "10700.00",
      })
    ).rejects.toThrow(/unmatched/);
  });

  it("prevents linking one bank transaction to multiple import payments", async () => {
    const org = await createTestOrg(testDb);
    const { packet } = await createImportPacket(org.id);
    const bankAccount = await createTestBankAccount(testDb, org.id);
    const [paymentTxn] = await testDb
      .insert(schema.transactions)
      .values({
        orgId: org.id,
        bankAccountId: bankAccount.id,
        date: "2026-05-05",
        description: "Import broker payment",
        amount: "-10700.00",
        type: "debit",
      })
      .returning();

    await linkImportPayment({
      orgId: org.id,
      importId: packet.id,
      bankTransactionId: paymentTxn.id,
      paymentRole: "broker_settlement",
      amountThb: "10700.00",
    });

    await expect(
      linkImportPayment({
        orgId: org.id,
        importId: packet.id,
        bankTransactionId: paymentTxn.id,
        paymentRole: "broker_settlement",
        amountThb: "10700.00",
      })
    ).rejects.toThrow(/unmatched/);
  });

  it("enforces same-org guardrails on packet parents and children", async () => {
    const org = await createTestOrg(testDb);
    const otherOrg = await createTestOrg(testDb);
    const otherEstablishment = await createHeadOffice(otherOrg.id);
    const otherVendor = await createTestVendor(testDb, otherOrg.id);
    const { packet } = await createImportPacket(org.id);
    const otherDoc = await createTestDocument(testDb, otherOrg.id);

    await expect(
      testDb.insert(schema.importPackets).values({
        orgId: org.id,
        establishmentId: otherEstablishment.id,
        supplierVendorId: otherVendor.id,
        importReference: "IMP-CROSS",
        arrivalDate: "2026-05-01",
        customsClearanceDate: "2026-05-03",
        originalCurrency: "JPY",
        fxRateAtClearance: "0.23500000",
      })
    ).rejects.toThrow(/Failed query/);

    await expect(
      testDb.insert(schema.importDocuments).values({
        orgId: org.id,
        importId: packet.id,
        documentId: otherDoc.id,
        documentRole: "broker_invoice",
      })
    ).rejects.toThrow(/Failed query/);
  });

  it("requires import VAT lines to use customs-clearance period and no expense account", async () => {
    const org = await createTestOrg(testDb);
    const { packet } = await createImportPacket(org.id);
    const doc = await createTestDocument(testDb, org.id);
    const [account] = await testDb
      .insert(schema.glAccounts)
      .values({
        orgId: org.id,
        accountCode: "5110",
        nameTh: "ค่าใช้จ่ายนำเข้า",
        nameEn: "Import expenses",
        accountType: "expense",
      })
      .returning();

    await expect(
      testDb.insert(schema.importChargeLines).values({
        orgId: org.id,
        importId: packet.id,
        sourceDocumentId: doc.id,
        lineDescription: "Import VAT without period",
        amountThb: "700.00",
        originalAmount: "700.00",
        vatTreatment: "is_import_vat",
      })
    ).rejects.toThrow(/Failed query/);

    await expect(
      testDb.insert(schema.importChargeLines).values({
        orgId: org.id,
        importId: packet.id,
        sourceDocumentId: doc.id,
        lineDescription: "Import VAT with expense account",
        amountThb: "700.00",
        originalAmount: "700.00",
        vatTreatment: "is_import_vat",
        vatPeriodOverride: "2026-05",
        expenseAccountId: account.id,
      })
    ).rejects.toThrow(/Failed query/);
  });

  it("rejects finalize when import VAT charge total differs from customs assessment", async () => {
    const org = await createTestOrg(testDb);
    const { packet } = await createImportPacket(org.id);
    const doc = await createTestDocument(testDb, org.id);

    await testDb.insert(schema.importGoodsLines).values({
      orgId: org.id,
      importId: packet.id,
      skuCode: "SKU-JP-001",
      quantity: "1.0000",
      unitPriceOriginal: "1000.0000",
    });

    await testDb.insert(schema.importChargeLines).values({
      orgId: org.id,
      importId: packet.id,
      sourceDocumentId: doc.id,
      lineDescription: "Customs import VAT",
      amountThb: "699.99",
      originalAmount: "699.99",
      vatTreatment: "is_import_vat",
      vatPeriodOverride: "2026-05",
    });

    await expect(
      testDb
        .update(schema.importPackets)
        .set({ isFinalized: true, finalizedAt: new Date("2026-05-06T00:00:00Z") })
        .where(sql`${schema.importPackets.id} = ${packet.id}`)
    ).rejects.toThrow(/Failed query/);
  });

  it("allows edits while an import packet is still open", async () => {
    const org = await createTestOrg(testDb);
    const { packet } = await createImportPacket(org.id);
    const doc = await createTestDocument(testDb, org.id);
    const [charge] = await testDb
      .insert(schema.importChargeLines)
      .values({
        orgId: org.id,
        importId: packet.id,
        sourceDocumentId: doc.id,
        lineDescription: "Brokerage fee",
        amountThb: "100.00",
        originalAmount: "100.00",
        vatTreatment: "service_with_vat_pct",
        vatAmountThb: "7.00",
      })
      .returning();

    const [updated] = await testDb
      .update(schema.importChargeLines)
      .set({ lineDescription: "Brokerage handling fee" })
      .where(sql`${schema.importChargeLines.id} = ${charge.id}`)
      .returning();

    expect(updated.lineDescription).toBe("Brokerage handling fee");
  });

  it("blocks edits to finalized import packets and child rows", async () => {
    const org = await createTestOrg(testDb);
    const { packet } = await createImportPacket(org.id);
    const doc = await createTestDocument(testDb, org.id);

    await testDb.insert(schema.importGoodsLines).values({
      orgId: org.id,
      importId: packet.id,
      skuCode: "SKU-JP-001",
      quantity: "1.0000",
      unitPriceOriginal: "1000.0000",
    });

    const [charge] = await testDb
      .insert(schema.importChargeLines)
      .values({
        orgId: org.id,
        importId: packet.id,
        sourceDocumentId: doc.id,
        lineDescription: "Customs import VAT",
        amountThb: "700.00",
        originalAmount: "700.00",
        vatTreatment: "is_import_vat",
        vatPeriodOverride: "2026-05",
      })
      .returning();

    await testDb
      .update(schema.importPackets)
      .set({ isFinalized: true, finalizedAt: new Date("2026-05-06T00:00:00Z") })
      .where(sql`${schema.importPackets.id} = ${packet.id}`);

    await expect(
      testDb
        .update(schema.importPackets)
        .set({ notes: "late edit" })
        .where(sql`${schema.importPackets.id} = ${packet.id}`)
    ).rejects.toThrow(/Failed query/);

    await expect(
      testDb
        .update(schema.importChargeLines)
        .set({ lineDescription: "late edit" })
        .where(sql`${schema.importChargeLines.id} = ${charge.id}`)
    ).rejects.toThrow(/Failed query/);
  });
});
