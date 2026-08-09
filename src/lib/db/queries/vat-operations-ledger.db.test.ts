import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import * as schema from "@/lib/db/schema";
import {
  addVatFilingLine,
  allocatePp30CreditCarryforwardDraftLines,
  allocatePp30InputVatDraftLines,
  allocatePp30OutputVatDraftLines,
  allocatePp36ReclaimDraftLines,
  buildPp30VatFilingDraft,
  buildPp36VatFilingDraft,
  createPp36Obligation,
  createTaxTreatmentDecision,
  createVatFilingDraft,
  createVatInputItem,
  createVatOutputItem,
  getVatLedgerPeriodDashboard,
  hashVatSnapshot,
  listClaimableVatInputItemsForPp30Draft,
  markPp36ObligationPaid,
  markVatFilingDraftFiled,
  periodFromBangkokDate,
  recordPp36FilingPayment,
  recordTaxPaymentEvent,
  VatLedgerStateError,
} from "./vat-operations-ledger";
import {
  createTestDb,
  migrateTestDb,
  resetTestDb,
} from "@/tests/db-test-utils";

const { db: testDb, pool } = createTestDb();

async function expectDbError(promise: Promise<unknown>, pattern: RegExp) {
  try {
    await promise;
  } catch (error) {
    const cause = (error as { cause?: unknown }).cause;
    const constraint = (cause as { constraint?: string } | undefined)?.constraint;
    expect(`${String(error)} ${String(cause)} ${constraint ?? ""}`).toMatch(pattern);
    return;
  }
  throw new Error("Expected database operation to fail");
}

beforeAll(async () => {
  await resetTestDb(pool);
  await migrateTestDb(pool);
});

afterAll(async () => {
  await resetTestDb(pool);
  await pool.end();
});

beforeEach(async () => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.lock_override_user_id', 'test-cleanup', true)");
    await client.query("SELECT set_config('app.lock_override_reason', 'test cleanup reset', true)");
    await client.query(`
      UPDATE vat_input_items
      SET status = 'needs_review',
          draft_filing_id = NULL,
          filed_filing_line_id = NULL;
      UPDATE vat_output_items
      SET status = 'needs_review',
          draft_filing_id = NULL,
          filed_filing_line_id = NULL;
      UPDATE pp36_obligations
      SET status = 'needs_review',
          pp36_filing_id = NULL,
          pp36_filing_line_id = NULL,
          pp36_paid_at = NULL,
          pp36_payment_transaction_id = NULL,
          pp30_reclaim_filing_id = NULL,
          pp30_reclaim_filing_line_id = NULL;
      DELETE FROM tax_payment_events;
      DELETE FROM vat_credit_carryforwards;
      DELETE FROM vat_filing_lines;
      DELETE FROM vat_input_items;
      DELETE FROM vat_output_items;
      DELETE FROM pp36_obligations;
      DELETE FROM period_locks;
      DELETE FROM vat_filings;
      DELETE FROM exception_queue;
      DELETE FROM audit_log;
      DELETE FROM tax_treatment_decisions;
      DELETE FROM tax_rule_versions;
      DELETE FROM reconciliation_matches;
      DELETE FROM payments;
      DELETE FROM document_line_items;
      DELETE FROM document_files;
      DELETE FROM documents;
      DELETE FROM transactions;
      DELETE FROM bank_accounts;
      DELETE FROM vendors;
      DELETE FROM org_memberships;
      DELETE FROM users;
      DELETE FROM establishments;
      DELETE FROM organizations;
    `);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});

async function createVatSource() {
  const [org] = await testDb
    .insert(schema.organizations)
    .values({
      name: "VAT Helper Org",
      taxId: "1234567890123",
      branchNumber: "00000",
    })
    .returning();
  const [establishment] = await testDb
    .insert(schema.establishments)
    .values({
      orgId: org.id,
      branchNumber: "00000",
      nameEn: "Head Office",
      isHeadOffice: true,
      vatRegistered: true,
    })
    .returning();
  const [vendor] = await testDb
    .insert(schema.vendors)
    .values({
      orgId: org.id,
      name: "Thai Supplier",
      entityType: "company",
      country: "TH",
      taxId: "3333333333333",
      branchNumber: "00000",
      isVatRegistered: true,
    })
    .returning();
  const [doc] = await testDb
    .insert(schema.documents)
    .values({
      orgId: org.id,
      vendorId: vendor.id,
      direction: "expense",
      type: "invoice",
      status: "confirmed",
      issueDate: "2026-03-15",
      documentNumber: "TI-001",
      subtotal: "1000.00",
      vatAmount: "70.00",
      totalAmount: "1070.00",
      taxInvoiceSubtype: "full_ti",
    })
    .returning();
  const [line] = await testDb
    .insert(schema.documentLineItems)
    .values({
      orgId: org.id,
      documentId: doc.id,
      description: "Service",
      amount: "1000.00",
      vatAmount: "70.00",
    })
    .returning();

  return { org, establishment, vendor, doc, line };
}

describe("VAT operations ledger helpers", () => {
  it("hashes source snapshots deterministically and parses Bangkok dates", () => {
    expect(hashVatSnapshot({ b: 2, a: { d: 4, c: 3 } })).toEqual(
      hashVatSnapshot({ a: { c: 3, d: 4 }, b: 2 })
    );
    expect(hashVatSnapshot({ "เลขที่": "TI-001", amount: [{ "มูลค่า": 1000 }] })).toEqual(
      hashVatSnapshot({ amount: [{ "มูลค่า": 1000 }], "เลขที่": "TI-001" })
    );
    expect(periodFromBangkokDate("2026-03-31")).toEqual({ year: 2026, month: 3 });
    expect(() => periodFromBangkokDate("2026-13-01")).toThrow(/Invalid Bangkok/);
  });

  it("creates tax treatment and input VAT item rows with computed source snapshot hashes", async () => {
    const { org, vendor, doc, line } = await createVatSource();
    const decision = await createTaxTreatmentDecision({
      tx: testDb,
      orgId: org.id,
      sourceDocumentId: doc.id,
      sourceDocumentLineId: line.id,
      treatmentType: "local_vat_input",
      reviewStatus: "confirmed",
      evidence: { source: "test" },
    });

    const item = await createVatInputItem({
      tx: testDb,
      orgId: org.id,
      taxTreatmentDecisionId: decision.id,
      sourceDocumentId: doc.id,
      sourceDocumentLineId: line.id,
      vendorId: vendor.id,
      taxInvoiceNo: "TI-001",
      taxInvoiceDate: "2026-03-15",
      taxInvoiceSubtype: "full_ti",
      baseAmount: "1000.00",
      vatAmount: "70.00",
      vatRate: "0.0700",
      status: "claimable",
      sourceSnapshot: { documentNumber: "TI-001", totalAmount: "1070.00" },
    });

    expect(item.sourceSnapshotHash).toEqual(
      hashVatSnapshot({ documentNumber: "TI-001", totalAmount: "1070.00" })
    );
  });

  it("rejects claimable input VAT without full or electronic tax invoice evidence", async () => {
    const { org, vendor, doc } = await createVatSource();

    await expect(
      createVatInputItem({
        tx: testDb,
        orgId: org.id,
        sourceDocumentId: doc.id,
        vendorId: vendor.id,
        taxInvoiceNo: "ABB-001",
        taxInvoiceDate: "2026-03-15",
        taxInvoiceSubtype: "abb",
        baseAmount: "1000.00",
        vatAmount: "70.00",
        vatRate: "0.0700",
        status: "claimable",
        sourceSnapshot: { documentNumber: "ABB-001" },
      })
    ).rejects.toThrow(/full or electronic tax invoice subtype/);

    await expect(
      createVatInputItem({
        tx: testDb,
        orgId: org.id,
        sourceDocumentId: doc.id,
        vendorId: vendor.id,
        taxInvoiceNo: "NONTI-001",
        taxInvoiceDate: "2026-03-15",
        taxInvoiceSubtype: "not_a_ti",
        baseAmount: "1000.00",
        vatAmount: "70.00",
        vatRate: "0.0700",
        status: "claimable",
        sourceSnapshot: { documentNumber: "NONTI-001" },
      })
    ).rejects.toThrow(/full or electronic tax invoice subtype/);

    await expect(
      createVatInputItem({
        tx: testDb,
        orgId: org.id,
        sourceDocumentId: doc.id,
        vendorId: vendor.id,
        taxInvoiceNo: undefined,
        taxInvoiceDate: "2026-03-15",
        taxInvoiceSubtype: "full_ti",
        baseAmount: "1000.00",
        vatAmount: "70.00",
        vatRate: "0.0700",
        status: "claimable",
        sourceSnapshot: { documentNumber: "TI-MISSING-NO" },
      })
    ).rejects.toThrow(/tax invoice number and date/);

    await expect(
      createVatInputItem({
        tx: testDb,
        orgId: org.id,
        sourceDocumentId: doc.id,
        vendorId: vendor.id,
        taxInvoiceNo: "TI-MISSING-DATE",
        taxInvoiceDate: undefined,
        taxInvoiceSubtype: "full_ti",
        baseAmount: "1000.00",
        vatAmount: "70.00",
        vatRate: "0.0700",
        status: "claimable",
        sourceSnapshot: { documentNumber: "TI-MISSING-DATE" },
      })
    ).rejects.toThrow(/tax invoice number and date/);
  });

  it("lists PP30 input VAT candidates oldest eligible and expiry-sensitive first with explicit expiry only", async () => {
    const { org, establishment, vendor } = await createVatSource();

    async function createClaimableInput(
      documentNumber: string,
      taxInvoiceDate: string,
      vatAmount: string,
      eligiblePeriodYear: number,
      eligiblePeriodMonth: number,
      expiryPeriodYear: number | null,
      expiryPeriodMonth: number | null,
      status: "claimable" | "needs_review" = "claimable"
    ) {
      const [doc] = await testDb
        .insert(schema.documents)
        .values({
          orgId: org.id,
          vendorId: vendor.id,
          direction: "expense",
          type: "invoice",
          status: "confirmed",
          issueDate: taxInvoiceDate,
          documentNumber,
          subtotal: "1000.00",
          vatAmount,
          totalAmount: (1000 + Number(vatAmount)).toFixed(2),
          taxInvoiceSubtype: "full_ti",
        })
        .returning();

      return createVatInputItem({
        tx: testDb,
        orgId: org.id,
        sourceDocumentId: doc.id,
        vendorId: vendor.id,
        taxInvoiceNo: documentNumber,
        taxInvoiceDate,
        taxInvoiceSubtype: "full_ti",
        baseAmount: "1000.00",
        vatAmount,
        vatRate: "0.0700",
        eligiblePeriodYear,
        eligiblePeriodMonth,
        expiryPeriodYear: expiryPeriodYear ?? undefined,
        expiryPeriodMonth: expiryPeriodMonth ?? undefined,
        status,
        sourceSnapshot: { documentNumber },
      });
    }

    await createClaimableInput("EXPIRED", "2025-10-15", "10.00", 2025, 10, 2026, 2);
    await createClaimableInput("NO-EXPIRY", "2025-09-15", "20.00", 2025, 9, null, null);
    const expiresMarch = await createClaimableInput("EXP-MAR", "2025-12-15", "30.00", 2025, 12, 2026, 3);
    const expiresApril = await createClaimableInput("EXP-APR", "2025-11-15", "40.00", 2025, 11, 2026, 4);
    await createClaimableInput("FUTURE", "2026-04-01", "50.00", 2026, 4, 2026, 9);
    await createClaimableInput("REVIEW", "2025-12-20", "60.00", 2025, 12, 2026, 3, "needs_review");

    const candidates = await listClaimableVatInputItemsForPp30Draft({
      tx: testDb,
      orgId: org.id,
      establishmentId: establishment.id,
      periodYear: 2026,
      periodMonth: 3,
    });

    expect(candidates.map((item) => item.id)).toEqual([
      expiresMarch.id,
      expiresApril.id,
    ]);
  });

  it("derives draft-period dashboard totals from ledger queues, not legacy rollups", async () => {
    const { org, establishment, vendor } = await createVatSource();
    const [actor] = await testDb
      .insert(schema.users)
      .values({
        orgId: org.id,
        name: "Dashboard Ledger",
        email: "dashboard-ledger@example.com",
        role: "accountant",
      })
      .returning();
    async function createDashboardDocument(documentNumber: string, direction: "expense" | "income") {
      const [sourceDoc] = await testDb
        .insert(schema.documents)
        .values({
          orgId: org.id,
          vendorId: direction === "expense" ? vendor.id : undefined,
          direction,
          type: "invoice",
          status: "confirmed",
          issueDate: "2026-03-15",
          documentNumber,
          subtotal: "1000.00",
          vatAmount: "70.00",
          totalAmount: "1070.00",
          taxInvoiceSubtype: direction === "expense" ? "full_ti" : undefined,
        })
        .returning();
      return sourceDoc;
    }

    const carryDoc = await createDashboardDocument("DASH-CARRY-SOURCE", "expense");
    await createVatInputItem({
      tx: testDb,
      orgId: org.id,
      sourceDocumentId: carryDoc.id,
      vendorId: vendor.id,
      taxInvoiceNo: "DASH-CARRY-SOURCE",
      taxInvoiceDate: "2026-02-15",
      taxInvoiceSubtype: "full_ti",
      baseAmount: "142.86",
      vatAmount: "10.00",
      vatRate: "0.0700",
      eligiblePeriodYear: 2026,
      eligiblePeriodMonth: 2,
      expiryPeriodYear: 2026,
      expiryPeriodMonth: 7,
      status: "claimable",
      sourceSnapshot: { documentNumber: "DASH-CARRY-SOURCE" },
    });
    const carrySourceFiling = await createVatFilingDraft({
      tx: testDb,
      orgId: org.id,
      establishmentId: establishment.id,
      filingType: "pp30",
      periodYear: 2026,
      periodMonth: 2,
    });
    await allocatePp30InputVatDraftLines({
      tx: testDb,
      orgId: org.id,
      filingId: carrySourceFiling.id,
      actorId: actor.id,
    });
    await markVatFilingDraftFiled({
      tx: testDb,
      orgId: org.id,
      filingId: carrySourceFiling.id,
      actorId: actor.id,
      filedAt: new Date("2026-03-15T02:00:00.000Z"),
    });

    const outputDoc = await createDashboardDocument("DASH-OUTPUT", "income");
    await createVatOutputItem({
      tx: testDb,
      orgId: org.id,
      sourceDocumentId: outputDoc.id,
      taxInvoiceNo: "DASH-OUTPUT",
      taxInvoiceDate: "2026-03-20",
      documentDate: "2026-03-20",
      taxPointDate: "2026-03-20",
      taxPointBasis: "issue_date",
      baseAmount: "2000.00",
      vatAmount: "140.00",
      vatRate: "0.0700",
      status: "reportable",
      sourceSnapshot: { documentNumber: "DASH-OUTPUT" },
    });
    const olderInputDoc = await createDashboardDocument("DASH-OLDER-INPUT", "expense");
    await createVatInputItem({
      tx: testDb,
      orgId: org.id,
      sourceDocumentId: olderInputDoc.id,
      vendorId: vendor.id,
      taxInvoiceNo: "DASH-OLDER-INPUT",
      taxInvoiceDate: "2026-01-15",
      taxInvoiceSubtype: "full_ti",
      baseAmount: "1000.00",
      vatAmount: "70.00",
      vatRate: "0.0700",
      eligiblePeriodYear: 2026,
      eligiblePeriodMonth: 1,
      expiryPeriodYear: 2026,
      expiryPeriodMonth: 6,
      status: "claimable",
      sourceSnapshot: { documentNumber: "DASH-OLDER-INPUT" },
    });

    const pp36Doc = await createDashboardDocument("DASH-PP36", "expense");
    const obligation = await createPp36Obligation({
      tx: testDb,
      orgId: org.id,
      sourceDocumentId: pp36Doc.id,
      vendorId: vendor.id,
      vendorCountryCode: "SG",
      serviceDescription: "Foreign service",
      baseAmountThb: "285.71",
      vatAmount: "20.00",
      vatRate: "0.0700",
      occurredOn: "2026-02-28",
      paymentDate: "2026-02-28",
      taxPointDate: "2026-02-28",
      periodBasis: "payment_date",
      sourceSnapshot: { documentNumber: "DASH-PP36" },
    });
    await testDb
      .update(schema.pp36Obligations)
      .set({ status: "pp36_required" })
      .where(sql`${schema.pp36Obligations.id} = ${obligation.id}`);
    const pp36Filing = await buildPp36VatFilingDraft({
      tx: testDb,
      orgId: org.id,
      periodYear: 2026,
      periodMonth: 2,
      actorId: actor.id,
    });
    await markVatFilingDraftFiled({
      tx: testDb,
      orgId: org.id,
      filingId: pp36Filing.filing.id,
      actorId: actor.id,
      filedAt: new Date("2026-03-15T02:00:00.000Z"),
    });
    await recordPp36FilingPayment({
      tx: testDb,
      orgId: org.id,
      filingId: pp36Filing.filing.id,
      actorId: actor.id,
      paidAt: new Date("2026-03-15T02:00:00.000Z"),
      amount: "20.00",
      idempotencyKey: "dashboard-pp36-payment",
    });
    await testDb
      .update(schema.pp36Obligations)
      .set({
        pp30ReclaimEligiblePeriodYear: 2026,
        pp30ReclaimEligiblePeriodMonth: 3,
        pp30ReclaimExpiryPeriodYear: 2026,
        pp30ReclaimExpiryPeriodMonth: 8,
      })
      .where(sql`${schema.pp36Obligations.id} = ${obligation.id}`);

    const dashboard = await getVatLedgerPeriodDashboard({
      tx: testDb,
      orgId: org.id,
      periodYear: 2026,
      periodMonth: 3,
    });

    expect(dashboard.pp30).toMatchObject({
      status: "not_built",
      outputVatTotal: "140.00",
      inputVatTotal: "70.00",
      pp36ReclaimTotal: "20.00",
      carryforwardIn: "10.00",
      netPayable: "40.00",
      refundable: "0.00",
    });
    expect(dashboard.warnings.availableCarryforward).toMatchObject({
      count: 1,
      amount: "10.00",
    });
  });

  it("allocates claimable input VAT candidates to a draft PP30 filing transactionally", async () => {
    const { org, establishment, vendor } = await createVatSource();

    async function createInput(documentNumber: string, vatAmount: string) {
      const [doc] = await testDb
        .insert(schema.documents)
        .values({
          orgId: org.id,
          vendorId: vendor.id,
          direction: "expense",
          type: "invoice",
          status: "confirmed",
          issueDate: "2026-03-15",
          documentNumber,
          subtotal: "1000.00",
          vatAmount,
          totalAmount: (1000 + Number(vatAmount)).toFixed(2),
          taxInvoiceSubtype: "full_ti",
        })
        .returning();

      return createVatInputItem({
        tx: testDb,
        orgId: org.id,
        sourceDocumentId: doc.id,
        vendorId: vendor.id,
        taxInvoiceNo: documentNumber,
        taxInvoiceDate: "2026-03-15",
        taxInvoiceSubtype: "full_ti",
        baseAmount: "1000.00",
        vatAmount,
        vatRate: "0.0700",
        eligiblePeriodYear: 2026,
        eligiblePeriodMonth: 3,
        expiryPeriodYear: 2026,
        expiryPeriodMonth: 8,
        status: "claimable",
        sourceSnapshot: { documentNumber },
      });
    }

    const first = await createInput("ALLOC-1", "70.00");
    const second = await createInput("ALLOC-2", "35.00");
    const [actor] = await testDb
      .insert(schema.users)
      .values({
        orgId: org.id,
        name: "VAT Allocator",
        email: "vat-allocator@example.com",
        role: "accountant",
      })
      .returning();
    const filing = await createVatFilingDraft({
      tx: testDb,
      orgId: org.id,
      establishmentId: establishment.id,
      filingType: "pp30",
      periodYear: 2026,
      periodMonth: 3,
    });

    const result = await allocatePp30InputVatDraftLines({
      tx: testDb,
      orgId: org.id,
      filingId: filing.id,
      actorId: actor.id,
    });

    expect(result).toMatchObject({
      filingId: filing.id,
      allocatedCount: 2,
      inputVatTotal: "105.00",
      truncated: false,
    });
    expect(result.lines.map((line) => line.vatInputItemId).sort()).toEqual(
      [first.id, second.id].sort()
    );
    expect(result.lines[0]?.frozenSnapshotHash).toEqual(
      hashVatSnapshot(result.lines[0]?.frozenSnapshot as Record<string, unknown>)
    );

    const rows = await testDb
      .select({
        id: schema.vatInputItems.id,
        status: schema.vatInputItems.status,
        draftFilingId: schema.vatInputItems.draftFilingId,
        claimPeriodYear: schema.vatInputItems.claimPeriodYear,
        claimPeriodMonth: schema.vatInputItems.claimPeriodMonth,
      })
      .from(schema.vatInputItems)
      .where(
        sql`${schema.vatInputItems.id} = ${first.id}
          OR ${schema.vatInputItems.id} = ${second.id}`
      );

    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.status === "allocated_to_draft")).toBe(true);
    expect(rows.every((row) => row.draftFilingId === filing.id)).toBe(true);
    expect(rows.every((row) => row.claimPeriodYear === 2026)).toBe(true);
    expect(rows.every((row) => row.claimPeriodMonth === 3)).toBe(true);

    const [updatedFiling] = await testDb
      .select({ inputVatTotal: schema.vatFilings.inputVatTotal })
      .from(schema.vatFilings)
      .where(sql`${schema.vatFilings.id} = ${filing.id}`)
      .limit(1);
    expect(updatedFiling?.inputVatTotal).toBe("105.00");

    const [auditRow] = await testDb
      .select()
      .from(schema.auditLog)
      .where(sql`${schema.auditLog.entityType} = 'vat_filing'`)
      .limit(1);
    expect(auditRow).toMatchObject({
      orgId: org.id,
      entityId: filing.id,
      action: "update",
      actorId: actor.id,
    });
    expect(auditRow?.newValue).toMatchObject({
      operation: "allocate_pp30_input",
      allocatedCount: 2,
      inputVatTotal: "105.00",
      truncated: false,
    });

    await expect(
      allocatePp30InputVatDraftLines({
        tx: testDb,
        orgId: org.id,
        filingId: filing.id,
        actorId: actor.id,
      })
    ).resolves.toMatchObject({
      allocatedCount: 2,
      inputVatTotal: "105.00",
      truncated: false,
    });
  });

  it("rejects input VAT allocation to non-draft or non-PP30 filings", async () => {
    const { org } = await createVatSource();
    const [actor] = await testDb
      .insert(schema.users)
      .values({
        orgId: org.id,
        name: "VAT Allocator 2",
        email: "vat-allocator-2@example.com",
        role: "accountant",
      })
      .returning();
    const pp36Filing = await createVatFilingDraft({
      tx: testDb,
      orgId: org.id,
      filingType: "pp36",
      periodYear: 2026,
      periodMonth: 3,
    });
    await expect(
      allocatePp30InputVatDraftLines({
        tx: testDb,
        orgId: org.id,
        filingId: pp36Filing.id,
        actorId: actor.id,
      })
    ).rejects.toThrow(/draft PP30/);
  });

  it("does not allocate input VAT to soft-deleted draft filings", async () => {
    const { org, establishment } = await createVatSource();
    const [actor] = await testDb
      .insert(schema.users)
      .values({
        orgId: org.id,
        name: "VAT Allocator 3",
        email: "vat-allocator-3@example.com",
        role: "accountant",
      })
      .returning();
    const filing = await createVatFilingDraft({
      tx: testDb,
      orgId: org.id,
      establishmentId: establishment.id,
      filingType: "pp30",
      periodYear: 2026,
      periodMonth: 3,
    });
    await testDb
      .update(schema.vatFilings)
      .set({ deletedAt: new Date() })
      .where(sql`${schema.vatFilings.id} = ${filing.id}`);

    await expect(
      allocatePp30InputVatDraftLines({
        tx: testDb,
        orgId: org.id,
        filingId: filing.id,
        actorId: actor.id,
      })
    ).rejects.toThrow(/not found/);
  });

  it("rejects truncated PP30 input allocation before mutating candidate items", async () => {
    const { org, establishment, vendor } = await createVatSource();
    const [actor] = await testDb
      .insert(schema.users)
      .values({
        orgId: org.id,
        name: "VAT Allocator 4",
        email: "vat-allocator-4@example.com",
        role: "accountant",
      })
      .returning();

    async function createClaimableInput(documentNumber: string) {
      const [doc] = await testDb
        .insert(schema.documents)
        .values({
          orgId: org.id,
          vendorId: vendor.id,
          direction: "expense",
          type: "invoice",
          status: "confirmed",
          issueDate: "2026-03-15",
          documentNumber,
          subtotal: "1000.00",
          vatAmount: "70.00",
          totalAmount: "1070.00",
          taxInvoiceSubtype: "full_ti",
        })
        .returning();

      return createVatInputItem({
        tx: testDb,
        orgId: org.id,
        sourceDocumentId: doc.id,
        vendorId: vendor.id,
        taxInvoiceNo: documentNumber,
        taxInvoiceDate: "2026-03-15",
        taxInvoiceSubtype: "full_ti",
        baseAmount: "1000.00",
        vatAmount: "70.00",
        vatRate: "0.0700",
        eligiblePeriodYear: 2026,
        eligiblePeriodMonth: 3,
        expiryPeriodYear: 2026,
        expiryPeriodMonth: 8,
        status: "claimable",
        sourceSnapshot: { documentNumber },
      });
    }

    const first = await createClaimableInput("LIMIT-1");
    const second = await createClaimableInput("LIMIT-2");
    const filing = await createVatFilingDraft({
      tx: testDb,
      orgId: org.id,
      establishmentId: establishment.id,
      filingType: "pp30",
      periodYear: 2026,
      periodMonth: 3,
    });

    await expect(
      allocatePp30InputVatDraftLines({
        tx: testDb,
        orgId: org.id,
        filingId: filing.id,
        actorId: actor.id,
        limit: 1,
      })
    ).rejects.toThrow(/exceed the allocation limit/);

    const rows = await testDb
      .select({ id: schema.vatInputItems.id, status: schema.vatInputItems.status })
      .from(schema.vatInputItems)
      .where(
        sql`${schema.vatInputItems.id} = ${first.id}
          OR ${schema.vatInputItems.id} = ${second.id}`
      );
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.status === "claimable")).toBe(true);
  });

  it("derives output VAT and PP36 filing periods from caller-confirmed tax-point dates", async () => {
    const { org, vendor, doc, line } = await createVatSource();

    const output = await createVatOutputItem({
      tx: testDb,
      orgId: org.id,
      sourceDocumentId: doc.id,
      sourceDocumentLineId: line.id,
      customerId: vendor.id,
      taxInvoiceDate: "2026-03-15",
      documentDate: "2026-03-15",
      taxPointDate: "2026-03-20",
      taxPointBasis: "payment_date",
      baseAmount: "1000.00",
      vatAmount: "70.00",
      vatRate: "0.0700",
      sourceSnapshot: { kind: "output" },
    });
    expect(output.outputPeriodYear).toBe(2026);
    expect(output.outputPeriodMonth).toBe(3);

    const pp36 = await createPp36Obligation({
      tx: testDb,
      orgId: org.id,
      sourceDocumentId: doc.id,
      sourceDocumentLineId: line.id,
      vendorId: vendor.id,
      vendorCountryCode: "sg",
      baseAmountThb: "1000.00",
      vatAmount: "70.00",
      vatRate: "0.0700",
      occurredOn: "2026-03-15",
      paymentDate: "2026-04-01",
      taxPointDate: "2026-04-01",
      periodBasis: "payment_date",
      sourceSnapshot: { kind: "pp36" },
    });
    expect(pp36.vendorCountryCode).toBe("SG");
    expect(pp36.pp36PeriodYear).toBe(2026);
    expect(pp36.pp36PeriodMonth).toBe(4);
  });

  it("uses filing helpers while preserving immutability and payment idempotency guards", async () => {
    const { org, establishment, vendor, doc } = await createVatSource();
    const [actor] = await testDb
      .insert(schema.users)
      .values({
        orgId: org.id,
        name: "VAT Filer",
        email: "vat-filer@example.com",
        role: "accountant",
      })
      .returning();
    const filing = await createVatFilingDraft({
      tx: testDb,
      orgId: org.id,
      filingType: "pp36",
      periodYear: 2026,
      periodMonth: 4,
    });
    const pp36 = await createPp36Obligation({
      tx: testDb,
      orgId: org.id,
      sourceDocumentId: doc.id,
      vendorId: vendor.id,
      vendorCountryCode: "SG",
      baseAmountThb: "1000.00",
      vatAmount: "70.00",
      vatRate: "0.0700",
      occurredOn: "2026-03-15",
      paymentDate: "2026-04-01",
      taxPointDate: "2026-04-01",
      periodBasis: "payment_date",
      sourceSnapshot: { kind: "pp36" },
    });
    const line = await addVatFilingLine({
      tx: testDb,
      orgId: org.id,
      filingId: filing.id,
      lineType: "pp36_obligation",
      pp36ObligationId: pp36.id,
      amount: "70.00",
      vatAmount: "70.00",
      frozenSnapshot: { obligationId: pp36.id },
    });

    await expect(
      markPp36ObligationPaid({
        tx: testDb,
        orgId: org.id,
        obligationId: pp36.id,
        pp36FilingId: filing.id,
        pp36FilingLineId: line.id,
        taxPaymentEventId: "00000000-0000-0000-0000-000000000000",
        paidAt: new Date("2026-05-15T02:00:00.000Z"),
      })
    ).rejects.toBeInstanceOf(VatLedgerStateError);

    const filed = await markVatFilingDraftFiled({
      tx: testDb,
      orgId: org.id,
      filingId: filing.id,
      actorId: actor.id,
      filedAt: new Date("2026-05-15T02:00:00.000Z"),
    });
    expect(filed).toMatchObject({
      status: "filed",
      pp36VatTotal: "70.00",
      netPayable: "70.00",
      paymentStatus: "waiting_to_pay_tax",
      filedByUserId: actor.id,
    });

    const event = await recordTaxPaymentEvent({
      tx: testDb,
      orgId: org.id,
        filingId: filing.id,
        eventType: "payment",
        paidAt: new Date("2026-05-15T02:00:00.000Z"),
        amount: "70.00",
        idempotencyKey: "pp36-payment-1",
        createdByUserId: actor.id,
      });

    const paid = await markPp36ObligationPaid({
      tx: testDb,
      orgId: org.id,
      obligationId: pp36.id,
      pp36FilingId: filing.id,
      pp36FilingLineId: line.id,
      taxPaymentEventId: event.id,
      paidAt: new Date("2026-05-15T02:00:00.000Z"),
    });
    expect(paid.status).toBe("eligible_for_pp30_reclaim");
    expect(paid).toMatchObject({
      pp30ReclaimEligiblePeriodYear: 2026,
      pp30ReclaimEligiblePeriodMonth: 5,
      pp30ReclaimExpiryPeriodYear: 2026,
      pp30ReclaimExpiryPeriodMonth: 10,
    });
    const [matchedEvent] = await testDb
      .update(schema.taxPaymentEvents)
      .set({ eventStatus: "matched_to_bank" })
      .where(sql`${schema.taxPaymentEvents.id} = ${event.id}`)
      .returning();
    expect(matchedEvent.eventStatus).toBe("matched_to_bank");

    const pp30Filing = await createVatFilingDraft({
      tx: testDb,
      orgId: org.id,
      establishmentId: establishment.id,
      filingType: "pp30",
      periodYear: 2026,
      periodMonth: 5,
    });

    const reclaimLine = await addVatFilingLine({
      tx: testDb,
      orgId: org.id,
      filingId: pp30Filing.id,
      lineType: "pp36_reclaim",
      pp36ObligationId: pp36.id,
      amount: "70.00",
      vatAmount: "70.00",
      frozenSnapshot: { obligationId: pp36.id, reclaim: true },
    });
    expect(reclaimLine.lineType).toBe("pp36_reclaim");

    await expectDbError(
      recordTaxPaymentEvent({
        tx: testDb,
        orgId: org.id,
        filingId: filing.id,
        eventType: "payment",
        paidAt: new Date("2026-05-15T02:00:00.000Z"),
        amount: "70.00",
        idempotencyKey: "pp36-payment-1",
        createdByUserId: actor.id,
      }),
      /tax_payment_events_idempotency/
    );

    await expect(
      addVatFilingLine({
        tx: testDb,
        orgId: org.id,
        filingId: filing.id,
        lineType: "carryforward",
        amount: "1.00",
        vatAmount: "1.00",
        frozenSnapshot: { afterFiled: true },
      })
    ).rejects.toThrow(/draft filings/);
  });

  it("files PP30 drafts as immutable snapshots and creates credit carryforward separately from unclaimed VAT", async () => {
    const { org, establishment, vendor, doc } = await createVatSource();
    const [actor] = await testDb
      .insert(schema.users)
      .values({
        orgId: org.id,
        name: "PP30 Filer",
        email: "pp30-filer@example.com",
        role: "accountant",
      })
      .returning();
    const input = await createVatInputItem({
      tx: testDb,
      orgId: org.id,
      sourceDocumentId: doc.id,
      vendorId: vendor.id,
      taxInvoiceNo: "PP30-FILE-1",
      taxInvoiceDate: "2026-03-15",
      taxInvoiceSubtype: "full_ti",
      baseAmount: "1000.00",
      vatAmount: "70.00",
      vatRate: "0.0700",
      eligiblePeriodYear: 2026,
      eligiblePeriodMonth: 3,
      expiryPeriodYear: 2026,
      expiryPeriodMonth: 8,
      status: "claimable",
      sourceSnapshot: { documentNumber: "PP30-FILE-1" },
    });
    const filing = await createVatFilingDraft({
      tx: testDb,
      orgId: org.id,
      establishmentId: establishment.id,
      filingType: "pp30",
      periodYear: 2026,
      periodMonth: 3,
    });

    await allocatePp30InputVatDraftLines({
      tx: testDb,
      orgId: org.id,
      filingId: filing.id,
      actorId: actor.id,
    });
    await expectDbError(
      testDb
        .update(schema.vatInputItems)
        .set({ vatAmount: "71.00" })
        .where(sql`${schema.vatInputItems.id} = ${input.id}`),
      /allocated VAT input item financial\/source fields are frozen/
    );
    const filed = await markVatFilingDraftFiled({
      tx: testDb,
      orgId: org.id,
      filingId: filing.id,
      actorId: actor.id,
      filedAt: new Date("2026-04-15T02:00:00.000Z"),
    });

    expect(filed).toMatchObject({
      status: "filed",
      inputVatTotal: "70.00",
      carryforwardOut: "70.00",
      netPayable: "0.00",
      paymentStatus: "refund_or_credit",
    });

    const [filedInput] = await testDb
      .select({
        status: schema.vatInputItems.status,
        draftFilingId: schema.vatInputItems.draftFilingId,
        filedFilingLineId: schema.vatInputItems.filedFilingLineId,
      })
      .from(schema.vatInputItems)
      .where(sql`${schema.vatInputItems.id} = ${input.id}`)
      .limit(1);
    expect(filedInput).toMatchObject({
      status: "filed",
      draftFilingId: filing.id,
    });
    expect(filedInput?.filedFilingLineId).toBeTruthy();

    const [carryforward] = await testDb
      .select()
      .from(schema.vatCreditCarryforwards)
      .where(sql`${schema.vatCreditCarryforwards.sourcePp30FilingId} = ${filing.id}`)
      .limit(1);
    expect(carryforward).toMatchObject({
      orgId: org.id,
      amount: "70.00",
      remainingAmount: "70.00",
      status: "available",
    });

    const [lock] = await testDb
      .select()
      .from(schema.periodLocks)
      .where(
        sql`${schema.periodLocks.orgId} = ${org.id}
          AND ${schema.periodLocks.domain} = 'vat_pp30'
          AND ${schema.periodLocks.periodYear} = 2026
          AND ${schema.periodLocks.periodMonth} = 3
          AND ${schema.periodLocks.unlockedAt} IS NULL`
      )
      .limit(1);
    expect(lock).toBeTruthy();
  });

  it("builds PP36 drafts from exact-period required obligations only", async () => {
    const { org, vendor, doc } = await createVatSource();
    const other = await createVatSource();
    const [actor] = await testDb
      .insert(schema.users)
      .values({
        orgId: org.id,
        name: "PP36 Builder",
        email: "pp36-builder@example.com",
        role: "accountant",
      })
      .returning();
    const obligation = await createPp36Obligation({
      tx: testDb,
      orgId: org.id,
      sourceDocumentId: doc.id,
      vendorId: vendor.id,
      vendorCountryCode: "SG",
      serviceDescription: "Foreign service",
      baseAmountThb: "1000.00",
      vatAmount: "70.00",
      vatRate: "0.0700",
      occurredOn: "2026-04-01",
      paymentDate: "2026-04-01",
      taxPointDate: "2026-04-01",
      periodBasis: "payment_date",
      sourceSnapshot: { kind: "pp36-builder" },
    });
    const futureObligation = await createPp36Obligation({
      tx: testDb,
      orgId: org.id,
      vendorId: vendor.id,
      vendorCountryCode: "SG",
      serviceDescription: "Future foreign service",
      baseAmountThb: "1000.00",
      vatAmount: "70.00",
      vatRate: "0.0700",
      occurredOn: "2026-05-01",
      paymentDate: "2026-05-01",
      taxPointDate: "2026-05-01",
      periodBasis: "payment_date",
      sourceSnapshot: { kind: "pp36-builder-future" },
    });
    const otherObligation = await createPp36Obligation({
      tx: testDb,
      orgId: other.org.id,
      sourceDocumentId: other.doc.id,
      vendorId: other.vendor.id,
      vendorCountryCode: "SG",
      serviceDescription: "Other org foreign service",
      baseAmountThb: "3000.00",
      vatAmount: "210.00",
      vatRate: "0.0700",
      occurredOn: "2026-04-01",
      paymentDate: "2026-04-01",
      taxPointDate: "2026-04-01",
      periodBasis: "payment_date",
      sourceSnapshot: { kind: "pp36-builder-other" },
    });
    await testDb
      .update(schema.pp36Obligations)
      .set({ status: "pp36_required" })
      .where(
        sql`${schema.pp36Obligations.id} = ${obligation.id}
          OR ${schema.pp36Obligations.id} = ${futureObligation.id}
          OR ${schema.pp36Obligations.id} = ${otherObligation.id}`
      );

    await expect(
      buildPp36VatFilingDraft({
        tx: testDb,
        orgId: org.id,
        periodYear: 2026,
        periodMonth: 4,
        actorId: actor.id,
        limit: 0,
      })
    ).rejects.toThrow(/PP36 obligation allocation would exceed/);

    const built = await buildPp36VatFilingDraft({
      tx: testDb,
      orgId: org.id,
      periodYear: 2026,
      periodMonth: 4,
      actorId: actor.id,
    });

    expect(built.filing).toMatchObject({
      filingType: "pp36",
      periodYear: 2026,
      periodMonth: 4,
      status: "draft",
      pp36VatTotal: "70.00",
    });
    expect(built.obligations).toMatchObject({
      allocatedCount: 1,
      pp36VatTotal: "70.00",
    });
    expect(built.obligations.lines[0]).toMatchObject({
      lineType: "pp36_obligation",
      pp36ObligationId: obligation.id,
      vatAmount: "70.00",
    });

    const [allocated] = await testDb
      .select({
        status: schema.pp36Obligations.status,
        pp36FilingId: schema.pp36Obligations.pp36FilingId,
        pp36FilingLineId: schema.pp36Obligations.pp36FilingLineId,
      })
      .from(schema.pp36Obligations)
      .where(sql`${schema.pp36Obligations.id} = ${obligation.id}`)
      .limit(1);
    expect(allocated).toMatchObject({
      status: "allocated_to_draft_pp36",
      pp36FilingId: built.filing.id,
    });
    expect(allocated?.pp36FilingLineId).toBeTruthy();

    await expect(
      buildPp36VatFilingDraft({
        tx: testDb,
        orgId: org.id,
        periodYear: 2026,
        periodMonth: 4,
        actorId: actor.id,
      })
    ).resolves.toMatchObject({
      filing: { id: built.filing.id },
      obligations: {
        allocatedCount: 1,
        pp36VatTotal: "70.00",
        truncated: false,
      },
    });

    const filed = await markVatFilingDraftFiled({
      tx: testDb,
      orgId: org.id,
      filingId: built.filing.id,
      actorId: actor.id,
      filedAt: new Date("2026-05-15T02:00:00.000Z"),
    });
    expect(filed).toMatchObject({
      status: "filed",
      pp36VatTotal: "70.00",
      netPayable: "70.00",
      paymentStatus: "waiting_to_pay_tax",
    });
    const [filedObligation] = await testDb
      .select({ status: schema.pp36Obligations.status })
      .from(schema.pp36Obligations)
      .where(sql`${schema.pp36Obligations.id} = ${obligation.id}`)
      .limit(1);
    expect(filedObligation?.status).toBe("pp36_filed");
  });

  it("records PP36 filing payment events and marks filed obligations paid", async () => {
    const { org, vendor, doc } = await createVatSource();
    const [actor] = await testDb
      .insert(schema.users)
      .values({
        orgId: org.id,
        name: "PP36 Payment Recorder",
        email: "pp36-payment-recorder@example.com",
        role: "accountant",
      })
      .returning();
    const obligation = await createPp36Obligation({
      tx: testDb,
      orgId: org.id,
      sourceDocumentId: doc.id,
      vendorId: vendor.id,
      vendorCountryCode: "SG",
      serviceDescription: "Foreign service payment",
      baseAmountThb: "1000.00",
      vatAmount: "70.00",
      vatRate: "0.0700",
      occurredOn: "2026-04-01",
      paymentDate: "2026-04-01",
      taxPointDate: "2026-04-01",
      periodBasis: "payment_date",
      sourceSnapshot: { kind: "pp36-payment" },
    });
    await testDb
      .update(schema.pp36Obligations)
      .set({ status: "pp36_required" })
      .where(sql`${schema.pp36Obligations.id} = ${obligation.id}`);
    const built = await buildPp36VatFilingDraft({
      tx: testDb,
      orgId: org.id,
      periodYear: 2026,
      periodMonth: 4,
      actorId: actor.id,
    });
    const filed = await markVatFilingDraftFiled({
      tx: testDb,
      orgId: org.id,
      filingId: built.filing.id,
      actorId: actor.id,
      filedAt: new Date("2026-05-15T02:00:00.000Z"),
    });

    await expect(
      recordPp36FilingPayment({
        tx: testDb,
        orgId: org.id,
        filingId: filed.id,
        actorId: actor.id,
        paidAt: new Date("2026-05-16T02:00:00.000Z"),
        amount: "69.99",
        receiptNo: "PP36-RD-BAD",
      })
    ).rejects.toThrow(/amount must match/);

    const payment = await recordPp36FilingPayment({
      tx: testDb,
      orgId: org.id,
      filingId: filed.id,
      actorId: actor.id,
      paidAt: new Date("2026-05-16T02:00:00.000Z"),
      amount: "70.00",
      receiptNo: "PP36-RD-1",
      idempotencyKey: "pp36-filing-payment-1",
    });

    expect(payment.event).toMatchObject({
      orgId: org.id,
      filingId: filed.id,
      eventType: "payment",
      amount: "70.00",
      receiptNo: "PP36-RD-1",
    });
    expect(payment.paidObligations).toHaveLength(1);
    expect(payment.paidObligations[0]).toMatchObject({
      id: obligation.id,
      status: "eligible_for_pp30_reclaim",
      pp30ReclaimEligiblePeriodYear: 2026,
      pp30ReclaimEligiblePeriodMonth: 5,
      pp30ReclaimExpiryPeriodYear: 2026,
      pp30ReclaimExpiryPeriodMonth: 10,
    });

    const [paidFiling] = await testDb
      .select({
        paymentStatus: schema.vatFilings.paymentStatus,
        paidAt: schema.vatFilings.paidAt,
        rdReceiptNo: schema.vatFilings.rdReceiptNo,
      })
      .from(schema.vatFilings)
      .where(sql`${schema.vatFilings.id} = ${filed.id}`)
      .limit(1);
    expect(paidFiling).toMatchObject({
      paymentStatus: "tax_paid",
      rdReceiptNo: "PP36-RD-1",
    });
    expect(paidFiling?.paidAt).toBeTruthy();

    await expectDbError(
      recordPp36FilingPayment({
        tx: testDb,
        orgId: org.id,
        filingId: filed.id,
        actorId: actor.id,
        paidAt: new Date("2026-05-16T02:00:00.000Z"),
        amount: "70.00",
        receiptNo: "PP36-RD-1",
        idempotencyKey: "pp36-filing-payment-1",
      }),
      /tax_payment_events_idempotency/
    );
  });

  it("allows unclaimed input VAT to be claimed in a later PP30 after the eligible source period is locked", async () => {
    const { org, establishment, vendor, doc } = await createVatSource();
    const [actor] = await testDb
      .insert(schema.users)
      .values({
        orgId: org.id,
        name: "Cross Period Filer",
        email: "cross-period-filer@example.com",
        role: "accountant",
      })
      .returning();
    const input = await createVatInputItem({
      tx: testDb,
      orgId: org.id,
      sourceDocumentId: doc.id,
      vendorId: vendor.id,
      taxInvoiceNo: "CROSS-PERIOD-1",
      taxInvoiceDate: "2026-05-15",
      taxInvoiceSubtype: "full_ti",
      baseAmount: "1000.00",
      vatAmount: "70.00",
      vatRate: "0.0700",
      eligiblePeriodYear: 2026,
      eligiblePeriodMonth: 5,
      expiryPeriodYear: 2026,
      expiryPeriodMonth: 10,
      status: "claimable",
      sourceSnapshot: { documentNumber: "CROSS-PERIOD-1" },
    });
    const mayFiling = await createVatFilingDraft({
      tx: testDb,
      orgId: org.id,
      establishmentId: establishment.id,
      filingType: "pp30",
      periodYear: 2026,
      periodMonth: 5,
    });
    await markVatFilingDraftFiled({
      tx: testDb,
      orgId: org.id,
      filingId: mayFiling.id,
      actorId: actor.id,
      filedAt: new Date("2026-06-15T02:00:00.000Z"),
    });

    const juneFiling = await createVatFilingDraft({
      tx: testDb,
      orgId: org.id,
      establishmentId: establishment.id,
      filingType: "pp30",
      periodYear: 2026,
      periodMonth: 6,
    });
    const allocation = await allocatePp30InputVatDraftLines({
      tx: testDb,
      orgId: org.id,
      filingId: juneFiling.id,
      actorId: actor.id,
    });

    expect(allocation).toMatchObject({
      allocatedCount: 1,
      inputVatTotal: "70.00",
    });
    const [claimed] = await testDb
      .select({
        id: schema.vatInputItems.id,
        status: schema.vatInputItems.status,
        claimPeriodYear: schema.vatInputItems.claimPeriodYear,
        claimPeriodMonth: schema.vatInputItems.claimPeriodMonth,
      })
      .from(schema.vatInputItems)
      .where(sql`${schema.vatInputItems.id} = ${input.id}`)
      .limit(1);
    expect(claimed).toMatchObject({
      status: "allocated_to_draft",
      claimPeriodYear: 2026,
      claimPeriodMonth: 6,
    });
  });

  it("allocates reportable output VAT into matching PP30 draft periods only", async () => {
    const { org, establishment, doc } = await createVatSource();
    const other = await createVatSource();
    const [actor] = await testDb
      .insert(schema.users)
      .values({
        orgId: org.id,
        name: "Output VAT Filer",
        email: "output-vat-filer@example.com",
        role: "accountant",
      })
      .returning();
    const output = await createVatOutputItem({
      tx: testDb,
      orgId: org.id,
      sourceDocumentId: doc.id,
      taxInvoiceNo: "OUT-ALLOC-1",
      taxInvoiceDate: "2026-04-20",
      documentDate: "2026-04-20",
      taxPointDate: "2026-04-20",
      taxPointBasis: "issue_date",
      baseAmount: "2000.00",
      vatAmount: "140.00",
      vatRate: "0.0700",
      status: "reportable",
      sourceSnapshot: { documentNumber: "OUT-ALLOC-1" },
    });
    const [futureDoc] = await testDb
      .insert(schema.documents)
      .values({
        orgId: org.id,
        direction: "income",
        type: "invoice",
        status: "confirmed",
        issueDate: "2026-05-01",
        documentNumber: "OUT-ALLOC-FUTURE",
        subtotal: "1000.00",
        vatAmount: "70.00",
        totalAmount: "1070.00",
      })
      .returning();
    await createVatOutputItem({
      tx: testDb,
      orgId: org.id,
      sourceDocumentId: futureDoc.id,
      taxInvoiceNo: "OUT-ALLOC-FUTURE",
      taxInvoiceDate: "2026-05-01",
      documentDate: "2026-05-01",
      taxPointDate: "2026-05-01",
      taxPointBasis: "issue_date",
      baseAmount: "1000.00",
      vatAmount: "70.00",
      vatRate: "0.0700",
      status: "reportable",
      sourceSnapshot: { documentNumber: "OUT-ALLOC-FUTURE" },
    });
    await createVatOutputItem({
      tx: testDb,
      orgId: other.org.id,
      sourceDocumentId: other.doc.id,
      taxInvoiceNo: "OUT-ALLOC-OTHER",
      taxInvoiceDate: "2026-04-20",
      documentDate: "2026-04-20",
      taxPointDate: "2026-04-20",
      taxPointBasis: "issue_date",
      baseAmount: "3000.00",
      vatAmount: "210.00",
      vatRate: "0.0700",
      status: "reportable",
      sourceSnapshot: { documentNumber: "OUT-ALLOC-OTHER" },
    });
    const filing = await createVatFilingDraft({
      tx: testDb,
      orgId: org.id,
      establishmentId: establishment.id,
      filingType: "pp30",
      periodYear: 2026,
      periodMonth: 4,
    });
    await expect(
      allocatePp30OutputVatDraftLines({
        tx: testDb,
        orgId: org.id,
        filingId: filing.id,
        actorId: actor.id,
        limit: 0,
      })
    ).rejects.toThrow(/output VAT allocation would exceed/);

    const allocation = await allocatePp30OutputVatDraftLines({
      tx: testDb,
      orgId: org.id,
      filingId: filing.id,
      actorId: actor.id,
    });

    expect(allocation).toMatchObject({
      allocatedCount: 1,
      outputVatTotal: "140.00",
      truncated: false,
    });
    expect(allocation.lines[0]).toMatchObject({
      lineType: "output",
      vatOutputItemId: output.id,
      amount: "2000.00",
      vatAmount: "140.00",
    });

    const outputStatuses = await testDb
      .select({
        taxInvoiceNo: schema.vatOutputItems.taxInvoiceNo,
        status: schema.vatOutputItems.status,
      })
      .from(schema.vatOutputItems)
      .where(sql`${schema.vatOutputItems.orgId} = ${org.id}`)
      .orderBy(schema.vatOutputItems.taxInvoiceNo);
    expect(outputStatuses).toEqual([
      { taxInvoiceNo: "OUT-ALLOC-1", status: "allocated_to_draft" },
      { taxInvoiceNo: "OUT-ALLOC-FUTURE", status: "reportable" },
    ]);

    await expect(
      allocatePp30OutputVatDraftLines({
        tx: testDb,
        orgId: org.id,
        filingId: filing.id,
        actorId: actor.id,
      })
    ).resolves.toMatchObject({
      allocatedCount: 1,
      outputVatTotal: "140.00",
      truncated: false,
    });

    const filed = await markVatFilingDraftFiled({
      tx: testDb,
      orgId: org.id,
      filingId: filing.id,
      actorId: actor.id,
      filedAt: new Date("2026-05-15T02:00:00.000Z"),
    });
    expect(filed).toMatchObject({
      outputVatTotal: "140.00",
      netPayable: "140.00",
      paymentStatus: "waiting_to_pay_tax",
    });
    await expect(
      allocatePp30OutputVatDraftLines({
        tx: testDb,
        orgId: org.id,
        filingId: filing.id,
        actorId: actor.id,
      })
    ).rejects.toThrow(/draft PP30 filing/);
  });

  it("allocates filed PP30 credit carryforwards into later PP30 drafts without mixing them with input VAT claims", async () => {
    const { org, establishment, vendor, doc } = await createVatSource();
    const [actor] = await testDb
      .insert(schema.users)
      .values({
        orgId: org.id,
        name: "Carryforward Filer",
        email: "carryforward-filer@example.com",
        role: "accountant",
      })
      .returning();
    await createVatInputItem({
      tx: testDb,
      orgId: org.id,
      sourceDocumentId: doc.id,
      vendorId: vendor.id,
      taxInvoiceNo: "CARRY-SOURCE-1",
      taxInvoiceDate: "2026-03-15",
      taxInvoiceSubtype: "full_ti",
      baseAmount: "1000.00",
      vatAmount: "70.00",
      vatRate: "0.0700",
      eligiblePeriodYear: 2026,
      eligiblePeriodMonth: 3,
      expiryPeriodYear: 2026,
      expiryPeriodMonth: 8,
      status: "claimable",
      sourceSnapshot: { documentNumber: "CARRY-SOURCE-1" },
    });
    const sourceFiling = await createVatFilingDraft({
      tx: testDb,
      orgId: org.id,
      establishmentId: establishment.id,
      filingType: "pp30",
      periodYear: 2026,
      periodMonth: 3,
    });
    await allocatePp30InputVatDraftLines({
      tx: testDb,
      orgId: org.id,
      filingId: sourceFiling.id,
      actorId: actor.id,
    });
    await markVatFilingDraftFiled({
      tx: testDb,
      orgId: org.id,
      filingId: sourceFiling.id,
      actorId: actor.id,
      filedAt: new Date("2026-04-15T02:00:00.000Z"),
    });

    const targetFiling = await createVatFilingDraft({
      tx: testDb,
      orgId: org.id,
      establishmentId: establishment.id,
      filingType: "pp30",
      periodYear: 2026,
      periodMonth: 4,
    });
    const output = await createVatOutputItem({
      tx: testDb,
      orgId: org.id,
      sourceDocumentId: doc.id,
      taxInvoiceNo: "OUT-CARRY-1",
      taxInvoiceDate: "2026-04-20",
      documentDate: "2026-04-20",
      taxPointDate: "2026-04-20",
      taxPointBasis: "issue_date",
      baseAmount: "2000.00",
      vatAmount: "140.00",
      vatRate: "0.0700",
      status: "reportable",
      sourceSnapshot: { documentNumber: "OUT-CARRY-1" },
    });
    await addVatFilingLine({
      tx: testDb,
      orgId: org.id,
      filingId: targetFiling.id,
      lineType: "output",
      vatOutputItemId: output.id,
      amount: output.baseAmount,
      vatAmount: output.vatAmount,
      frozenSnapshot: { outputId: output.id },
    });

    const allocation = await allocatePp30CreditCarryforwardDraftLines({
      tx: testDb,
      orgId: org.id,
      filingId: targetFiling.id,
      actorId: actor.id,
    });

    expect(allocation).toMatchObject({
      allocatedCount: 1,
      carryforwardIn: "70.00",
      truncated: false,
    });
    expect(allocation.lines[0]).toMatchObject({
      lineType: "carryforward",
      amount: "70.00",
      vatAmount: "70.00",
      vatInputItemId: null,
      vatOutputItemId: null,
      pp36ObligationId: null,
    });

    const [credit] = await testDb
      .select()
      .from(schema.vatCreditCarryforwards)
      .where(sql`${schema.vatCreditCarryforwards.sourcePp30FilingId} = ${sourceFiling.id}`)
      .limit(1);
    expect(credit).toMatchObject({
      status: "applied",
      remainingAmount: "0.00",
      appliedToPp30FilingId: targetFiling.id,
    });

    const filed = await markVatFilingDraftFiled({
      tx: testDb,
      orgId: org.id,
      filingId: targetFiling.id,
      actorId: actor.id,
      filedAt: new Date("2026-05-15T02:00:00.000Z"),
    });
    expect(filed).toMatchObject({
      outputVatTotal: "140.00",
      carryforwardIn: "70.00",
      netPayable: "70.00",
      paymentStatus: "waiting_to_pay_tax",
    });
  });

  it("allocates paid PP36 obligations as later PP30 reclaim lines and consumes them only on filing", async () => {
    const { org, establishment, vendor, doc } = await createVatSource();
    const [actor] = await testDb
      .insert(schema.users)
      .values({
        orgId: org.id,
        name: "PP36 Reclaim Filer",
        email: "pp36-reclaim-filer@example.com",
        role: "accountant",
      })
      .returning();
    const pp36 = await createPp36Obligation({
      tx: testDb,
      orgId: org.id,
      sourceDocumentId: doc.id,
      vendorId: vendor.id,
      vendorCountryCode: "JP",
      serviceDescription: "Foreign cloud service",
      baseAmountThb: "1000.00",
      vatAmount: "70.00",
      vatRate: "0.0700",
      occurredOn: "2026-04-01",
      paymentDate: "2026-04-01",
      taxPointDate: "2026-04-01",
      periodBasis: "payment_date",
      sourceSnapshot: { kind: "pp36-reclaim" },
    });
    const pp36Filing = await createVatFilingDraft({
      tx: testDb,
      orgId: org.id,
      filingType: "pp36",
      periodYear: 2026,
      periodMonth: 4,
    });
    const pp36Line = await addVatFilingLine({
      tx: testDb,
      orgId: org.id,
      filingId: pp36Filing.id,
      lineType: "pp36_obligation",
      pp36ObligationId: pp36.id,
      amount: "70.00",
      vatAmount: "70.00",
      frozenSnapshot: { obligationId: pp36.id },
    });
    await markVatFilingDraftFiled({
      tx: testDb,
      orgId: org.id,
      filingId: pp36Filing.id,
      actorId: actor.id,
      filedAt: new Date("2026-05-15T02:00:00.000Z"),
    });
    const paymentEvent = await recordTaxPaymentEvent({
      tx: testDb,
      orgId: org.id,
      filingId: pp36Filing.id,
      eventType: "payment",
      paidAt: new Date("2026-05-15T02:00:00.000Z"),
      amount: "70.00",
      idempotencyKey: "pp36-reclaim-payment-1",
      createdByUserId: actor.id,
    });
    await markPp36ObligationPaid({
      tx: testDb,
      orgId: org.id,
      obligationId: pp36.id,
      pp36FilingId: pp36Filing.id,
      pp36FilingLineId: pp36Line.id,
      taxPaymentEventId: paymentEvent.id,
      paidAt: new Date("2026-05-15T02:00:00.000Z"),
    });
    await testDb
      .update(schema.pp36Obligations)
      .set({
        pp30ReclaimEligiblePeriodYear: 2026,
        pp30ReclaimEligiblePeriodMonth: 5,
        pp30ReclaimExpiryPeriodYear: 2026,
        pp30ReclaimExpiryPeriodMonth: 10,
      })
      .where(sql`${schema.pp36Obligations.id} = ${pp36.id}`);

    const pp30Filing = await createVatFilingDraft({
      tx: testDb,
      orgId: org.id,
      establishmentId: establishment.id,
      filingType: "pp30",
      periodYear: 2026,
      periodMonth: 5,
    });
    const output = await createVatOutputItem({
      tx: testDb,
      orgId: org.id,
      sourceDocumentId: doc.id,
      taxInvoiceNo: "OUT-PP36-RECLAIM-1",
      taxInvoiceDate: "2026-05-20",
      documentDate: "2026-05-20",
      taxPointDate: "2026-05-20",
      taxPointBasis: "issue_date",
      baseAmount: "2000.00",
      vatAmount: "140.00",
      vatRate: "0.0700",
      status: "reportable",
      sourceSnapshot: { documentNumber: "OUT-PP36-RECLAIM-1" },
    });
    await addVatFilingLine({
      tx: testDb,
      orgId: org.id,
      filingId: pp30Filing.id,
      lineType: "output",
      vatOutputItemId: output.id,
      amount: "2000.00",
      vatAmount: "140.00",
      frozenSnapshot: { outputId: output.id },
    });

    await expect(
      allocatePp36ReclaimDraftLines({
        tx: testDb,
        orgId: org.id,
        filingId: pp30Filing.id,
        actorId: actor.id,
        limit: 0,
      })
    ).rejects.toThrow(/PP36 reclaim allocation would exceed/);

    const allocation = await allocatePp36ReclaimDraftLines({
      tx: testDb,
      orgId: org.id,
      filingId: pp30Filing.id,
      actorId: actor.id,
    });
    expect(allocation).toMatchObject({
      allocatedCount: 1,
      pp36ReclaimTotal: "70.00",
      truncated: false,
    });
    expect(allocation.lines[0]).toMatchObject({
      lineType: "pp36_reclaim",
      pp36ObligationId: pp36.id,
      amount: "70.00",
      vatAmount: "70.00",
    });

    const [draftObligation] = await testDb
      .select({
        status: schema.pp36Obligations.status,
        pp30ReclaimFilingId: schema.pp36Obligations.pp30ReclaimFilingId,
      })
      .from(schema.pp36Obligations)
      .where(sql`${schema.pp36Obligations.id} = ${pp36.id}`)
      .limit(1);
    expect(draftObligation).toMatchObject({
      status: "eligible_for_pp30_reclaim",
      pp30ReclaimFilingId: null,
    });

    await expect(
      allocatePp36ReclaimDraftLines({
        tx: testDb,
        orgId: org.id,
        filingId: pp30Filing.id,
        actorId: actor.id,
      })
    ).resolves.toMatchObject({
      allocatedCount: 1,
      pp36ReclaimTotal: "70.00",
      truncated: false,
    });

    const filed = await markVatFilingDraftFiled({
      tx: testDb,
      orgId: org.id,
      filingId: pp30Filing.id,
      actorId: actor.id,
      filedAt: new Date("2026-06-15T02:00:00.000Z"),
    });
    expect(filed).toMatchObject({
      outputVatTotal: "140.00",
      pp36ReclaimTotal: "70.00",
      netPayable: "70.00",
      paymentStatus: "waiting_to_pay_tax",
    });
    const [filedObligation] = await testDb
      .select({
        status: schema.pp36Obligations.status,
        pp30ReclaimFilingId: schema.pp36Obligations.pp30ReclaimFilingId,
        pp30ReclaimFilingLineId: schema.pp36Obligations.pp30ReclaimFilingLineId,
      })
      .from(schema.pp36Obligations)
      .where(sql`${schema.pp36Obligations.id} = ${pp36.id}`)
      .limit(1);
    expect(filedObligation).toMatchObject({
      status: "reclaimed_in_pp30",
      pp30ReclaimFilingId: pp30Filing.id,
    });
    expect(filedObligation?.pp30ReclaimFilingLineId).toBeTruthy();
  });

  it("builds a full PP30 draft from output, input, PP36 reclaim, and carryforward queues", async () => {
    const { org, establishment, vendor, doc } = await createVatSource();
    const [actor] = await testDb
      .insert(schema.users)
      .values({
        orgId: org.id,
        name: "Full PP30 Builder",
        email: "full-pp30-builder@example.com",
        role: "accountant",
      })
      .returning();

    await createVatInputItem({
      tx: testDb,
      orgId: org.id,
      sourceDocumentId: doc.id,
      vendorId: vendor.id,
      taxInvoiceNo: "FULL-BUILDER-CREDIT",
      taxInvoiceDate: "2026-03-15",
      taxInvoiceSubtype: "full_ti",
      baseAmount: "1000.00",
      vatAmount: "70.00",
      vatRate: "0.0700",
      eligiblePeriodYear: 2026,
      eligiblePeriodMonth: 3,
      expiryPeriodYear: 2026,
      expiryPeriodMonth: 8,
      status: "claimable",
      sourceSnapshot: { documentNumber: "FULL-BUILDER-CREDIT" },
    });
    const sourceCreditFiling = await createVatFilingDraft({
      tx: testDb,
      orgId: org.id,
      establishmentId: establishment.id,
      filingType: "pp30",
      periodYear: 2026,
      periodMonth: 3,
    });
    await allocatePp30InputVatDraftLines({
      tx: testDb,
      orgId: org.id,
      filingId: sourceCreditFiling.id,
      actorId: actor.id,
    });
    await markVatFilingDraftFiled({
      tx: testDb,
      orgId: org.id,
      filingId: sourceCreditFiling.id,
      actorId: actor.id,
      filedAt: new Date("2026-04-15T02:00:00.000Z"),
    });

    const [mayInputDoc] = await testDb
      .insert(schema.documents)
      .values({
        orgId: org.id,
        vendorId: vendor.id,
        direction: "expense",
        type: "invoice",
        status: "confirmed",
        issueDate: "2026-05-02",
        documentNumber: "FULL-BUILDER-INPUT",
        subtotal: "1000.00",
        vatAmount: "70.00",
        totalAmount: "1070.00",
        taxInvoiceSubtype: "full_ti",
      })
      .returning();
    await createVatInputItem({
      tx: testDb,
      orgId: org.id,
      sourceDocumentId: mayInputDoc.id,
      vendorId: vendor.id,
      taxInvoiceNo: "FULL-BUILDER-INPUT",
      taxInvoiceDate: "2026-05-02",
      taxInvoiceSubtype: "full_ti",
      baseAmount: "1000.00",
      vatAmount: "70.00",
      vatRate: "0.0700",
      eligiblePeriodYear: 2026,
      eligiblePeriodMonth: 5,
      expiryPeriodYear: 2026,
      expiryPeriodMonth: 10,
      status: "claimable",
      sourceSnapshot: { documentNumber: "FULL-BUILDER-INPUT" },
    });

    const [outputDoc] = await testDb
      .insert(schema.documents)
      .values({
        orgId: org.id,
        direction: "income",
        type: "invoice",
        status: "confirmed",
        issueDate: "2026-05-10",
        documentNumber: "FULL-BUILDER-OUTPUT",
        subtotal: "4000.00",
        vatAmount: "280.00",
        totalAmount: "4280.00",
      })
      .returning();
    await createVatOutputItem({
      tx: testDb,
      orgId: org.id,
      sourceDocumentId: outputDoc.id,
      taxInvoiceNo: "FULL-BUILDER-OUTPUT",
      taxInvoiceDate: "2026-05-10",
      documentDate: "2026-05-10",
      taxPointDate: "2026-05-10",
      taxPointBasis: "issue_date",
      baseAmount: "4000.00",
      vatAmount: "280.00",
      vatRate: "0.0700",
      status: "reportable",
      sourceSnapshot: { documentNumber: "FULL-BUILDER-OUTPUT" },
    });

    const pp36 = await createPp36Obligation({
      tx: testDb,
      orgId: org.id,
      sourceDocumentId: doc.id,
      vendorId: vendor.id,
      vendorCountryCode: "SG",
      serviceDescription: "Foreign subscription",
      baseAmountThb: "1000.00",
      vatAmount: "70.00",
      vatRate: "0.0700",
      occurredOn: "2026-04-01",
      paymentDate: "2026-04-01",
      taxPointDate: "2026-04-01",
      periodBasis: "payment_date",
      sourceSnapshot: { kind: "full-builder-pp36" },
    });
    const pp36Filing = await createVatFilingDraft({
      tx: testDb,
      orgId: org.id,
      filingType: "pp36",
      periodYear: 2026,
      periodMonth: 4,
    });
    const pp36Line = await addVatFilingLine({
      tx: testDb,
      orgId: org.id,
      filingId: pp36Filing.id,
      lineType: "pp36_obligation",
      pp36ObligationId: pp36.id,
      amount: "70.00",
      vatAmount: "70.00",
      frozenSnapshot: { obligationId: pp36.id },
    });
    await markVatFilingDraftFiled({
      tx: testDb,
      orgId: org.id,
      filingId: pp36Filing.id,
      actorId: actor.id,
      filedAt: new Date("2026-05-15T02:00:00.000Z"),
    });
    const paymentEvent = await recordTaxPaymentEvent({
      tx: testDb,
      orgId: org.id,
      filingId: pp36Filing.id,
      eventType: "payment",
      paidAt: new Date("2026-05-15T02:00:00.000Z"),
      amount: "70.00",
      idempotencyKey: "full-builder-pp36-payment",
      createdByUserId: actor.id,
    });
    await markPp36ObligationPaid({
      tx: testDb,
      orgId: org.id,
      obligationId: pp36.id,
      pp36FilingId: pp36Filing.id,
      pp36FilingLineId: pp36Line.id,
      taxPaymentEventId: paymentEvent.id,
      paidAt: new Date("2026-05-15T02:00:00.000Z"),
    });
    await testDb
      .update(schema.pp36Obligations)
      .set({
        pp30ReclaimEligiblePeriodYear: 2026,
        pp30ReclaimEligiblePeriodMonth: 5,
        pp30ReclaimExpiryPeriodYear: 2026,
        pp30ReclaimExpiryPeriodMonth: 10,
      })
      .where(sql`${schema.pp36Obligations.id} = ${pp36.id}`);

    const built = await buildPp30VatFilingDraft({
      tx: testDb,
      orgId: org.id,
      establishmentId: establishment.id,
      periodYear: 2026,
      periodMonth: 5,
      actorId: actor.id,
    });

    expect(built.output).toMatchObject({ allocatedCount: 1, outputVatTotal: "280.00" });
    expect(built.input).toMatchObject({ allocatedCount: 1, inputVatTotal: "70.00" });
    expect(built.pp36Reclaim).toMatchObject({ allocatedCount: 1, pp36ReclaimTotal: "70.00" });
    expect(built.carryforward).toMatchObject({ allocatedCount: 1, carryforwardIn: "70.00" });
    expect(built.filing).toMatchObject({
      filingType: "pp30",
      periodYear: 2026,
      periodMonth: 5,
      status: "draft",
      outputVatTotal: "280.00",
      inputVatTotal: "70.00",
      pp36ReclaimTotal: "70.00",
      carryforwardIn: "70.00",
    });

    await expect(
      buildPp30VatFilingDraft({
        tx: testDb,
        orgId: org.id,
        establishmentId: establishment.id,
        periodYear: 2026,
        periodMonth: 5,
        actorId: actor.id,
      })
    ).resolves.toMatchObject({
      filing: { id: built.filing.id },
      output: { allocatedCount: 1, outputVatTotal: "280.00", truncated: false },
      input: { allocatedCount: 1, inputVatTotal: "70.00", truncated: false },
      pp36Reclaim: { allocatedCount: 1, pp36ReclaimTotal: "70.00", truncated: false },
      carryforward: { allocatedCount: 1, carryforwardIn: "70.00", truncated: false },
    });

    const [lateOutputDoc] = await testDb
      .insert(schema.documents)
      .values({
        orgId: org.id,
        direction: "income",
        type: "invoice",
        status: "confirmed",
        issueDate: "2026-05-20",
        documentNumber: "FULL-BUILDER-LATE-OUTPUT",
        subtotal: "1000.00",
        vatAmount: "70.00",
        totalAmount: "1070.00",
      })
      .returning();
    await createVatOutputItem({
      tx: testDb,
      orgId: org.id,
      sourceDocumentId: lateOutputDoc.id,
      taxInvoiceNo: "FULL-BUILDER-LATE-OUTPUT",
      taxInvoiceDate: "2026-05-20",
      documentDate: "2026-05-20",
      taxPointDate: "2026-05-20",
      taxPointBasis: "issue_date",
      baseAmount: "1000.00",
      vatAmount: "70.00",
      vatRate: "0.0700",
      status: "reportable",
      sourceSnapshot: { documentNumber: "FULL-BUILDER-LATE-OUTPUT" },
    });

    const rebuilt = await buildPp30VatFilingDraft({
      tx: testDb,
      orgId: org.id,
      establishmentId: establishment.id,
      periodYear: 2026,
      periodMonth: 5,
      actorId: actor.id,
    });
    expect(rebuilt.output).toMatchObject({
      allocatedCount: 1,
      outputVatTotal: "350.00",
      truncated: false,
    });

    const filed = await markVatFilingDraftFiled({
      tx: testDb,
      orgId: org.id,
      filingId: built.filing.id,
      actorId: actor.id,
      filedAt: new Date("2026-06-15T02:00:00.000Z"),
    });
    expect(filed).toMatchObject({
      outputVatTotal: "350.00",
      inputVatTotal: "70.00",
      pp36ReclaimTotal: "70.00",
      carryforwardIn: "70.00",
      netPayable: "140.00",
      paymentStatus: "waiting_to_pay_tax",
    });
  });

  it("keeps PP30 credit carryforward allocation tenant-scoped and draft-only", async () => {
    const { org, establishment, vendor, doc } = await createVatSource();
    const other = await createVatSource();
    const [actor] = await testDb
      .insert(schema.users)
      .values({
        orgId: org.id,
        name: "Scoped Carryforward Filer",
        email: "scoped-carryforward-filer@example.com",
        role: "accountant",
      })
      .returning();
    const sourceFiling = await createVatFilingDraft({
      tx: testDb,
      orgId: org.id,
      establishmentId: establishment.id,
      filingType: "pp30",
      periodYear: 2026,
      periodMonth: 3,
    });
    const otherSourceFiling = await createVatFilingDraft({
      tx: testDb,
      orgId: other.org.id,
      establishmentId: other.establishment.id,
      filingType: "pp30",
      periodYear: 2026,
      periodMonth: 3,
    });
    await testDb.insert(schema.vatCreditCarryforwards).values([
      {
        orgId: org.id,
        establishmentId: establishment.id,
        sourcePp30FilingId: sourceFiling.id,
        creditOriginPeriodYear: 2026,
        creditOriginPeriodMonth: 3,
        amount: "50.00",
        remainingAmount: "50.00",
        status: "available",
      },
      {
        orgId: other.org.id,
        establishmentId: other.establishment.id,
        sourcePp30FilingId: otherSourceFiling.id,
        creditOriginPeriodYear: 2026,
        creditOriginPeriodMonth: 3,
        amount: "90.00",
        remainingAmount: "90.00",
        status: "available",
      },
    ]);
    const filing = await createVatFilingDraft({
      tx: testDb,
      orgId: org.id,
      establishmentId: establishment.id,
      filingType: "pp30",
      periodYear: 2026,
      periodMonth: 4,
    });
    const output = await createVatOutputItem({
      tx: testDb,
      orgId: org.id,
      sourceDocumentId: doc.id,
      taxInvoiceNo: "SCOPED-CARRY-OUTPUT",
      taxInvoiceDate: "2026-04-20",
      documentDate: "2026-04-20",
      taxPointDate: "2026-04-20",
      taxPointBasis: "issue_date",
      baseAmount: "714.29",
      vatAmount: "50.00",
      vatRate: "0.0700",
      status: "reportable",
      sourceSnapshot: { documentNumber: "SCOPED-CARRY-OUTPUT" },
    });
    await addVatFilingLine({
      tx: testDb,
      orgId: org.id,
      filingId: filing.id,
      lineType: "output",
      vatOutputItemId: output.id,
      amount: output.baseAmount,
      vatAmount: output.vatAmount,
      frozenSnapshot: { outputId: output.id },
    });

    await expect(
      allocatePp30CreditCarryforwardDraftLines({
        tx: testDb,
        orgId: org.id,
        filingId: filing.id,
        actorId: actor.id,
        limit: 0,
      })
    ).rejects.toThrow(/allocation would exceed/);

    const allocation = await allocatePp30CreditCarryforwardDraftLines({
      tx: testDb,
      orgId: org.id,
      filingId: filing.id,
      actorId: actor.id,
    });
    expect(allocation).toMatchObject({
      allocatedCount: 1,
      carryforwardIn: "50.00",
    });

    await expect(
      allocatePp30CreditCarryforwardDraftLines({
        tx: testDb,
        orgId: org.id,
        filingId: filing.id,
        actorId: actor.id,
      })
    ).resolves.toMatchObject({
      allocatedCount: 1,
      carryforwardIn: "50.00",
      truncated: false,
    });

    const otherCredit = await testDb
      .select()
      .from(schema.vatCreditCarryforwards)
      .where(sql`${schema.vatCreditCarryforwards.orgId} = ${other.org.id}`)
      .limit(1);
    expect(otherCredit[0]).toMatchObject({
      status: "available",
      remainingAmount: "90.00",
      appliedToPp30FilingId: null,
    });

    await markVatFilingDraftFiled({
      tx: testDb,
      orgId: org.id,
      filingId: filing.id,
      actorId: actor.id,
      filedAt: new Date("2026-05-15T02:00:00.000Z"),
    });
    await expect(
      allocatePp30CreditCarryforwardDraftLines({
        tx: testDb,
        orgId: org.id,
        filingId: filing.id,
        actorId: actor.id,
      })
    ).rejects.toThrow(/draft PP30 filing/);

    expect(vendor.orgId).toBe(org.id);
    expect(doc.orgId).toBe(org.id);
  });

  it("applies only the PP30 net need from available carryforwards", async () => {
    const { org, establishment, doc } = await createVatSource();
    const [actor] = await testDb
      .insert(schema.users)
      .values({
        orgId: org.id,
        name: "Partial Carryforward Filer",
        email: "partial-carryforward-filer@example.com",
        role: "accountant",
      })
      .returning();
    const sourceFiling = await createVatFilingDraft({
      tx: testDb,
      orgId: org.id,
      establishmentId: establishment.id,
      filingType: "pp30",
      periodYear: 2026,
      periodMonth: 3,
    });
    await testDb.insert(schema.vatCreditCarryforwards).values({
      orgId: org.id,
      establishmentId: establishment.id,
      sourcePp30FilingId: sourceFiling.id,
      creditOriginPeriodYear: 2026,
      creditOriginPeriodMonth: 3,
      amount: "90.00",
      remainingAmount: "90.00",
      status: "available",
    });
    const filing = await createVatFilingDraft({
      tx: testDb,
      orgId: org.id,
      establishmentId: establishment.id,
      filingType: "pp30",
      periodYear: 2026,
      periodMonth: 4,
    });
    const output = await createVatOutputItem({
      tx: testDb,
      orgId: org.id,
      sourceDocumentId: doc.id,
      taxInvoiceNo: "PARTIAL-CARRY-OUTPUT",
      taxInvoiceDate: "2026-04-20",
      documentDate: "2026-04-20",
      taxPointDate: "2026-04-20",
      taxPointBasis: "issue_date",
      baseAmount: "714.29",
      vatAmount: "50.00",
      vatRate: "0.0700",
      status: "reportable",
      sourceSnapshot: { documentNumber: "PARTIAL-CARRY-OUTPUT" },
    });
    await addVatFilingLine({
      tx: testDb,
      orgId: org.id,
      filingId: filing.id,
      lineType: "output",
      vatOutputItemId: output.id,
      amount: output.baseAmount,
      vatAmount: output.vatAmount,
      frozenSnapshot: { outputId: output.id },
    });

    const allocation = await allocatePp30CreditCarryforwardDraftLines({
      tx: testDb,
      orgId: org.id,
      filingId: filing.id,
      actorId: actor.id,
    });

    expect(allocation).toMatchObject({
      allocatedCount: 1,
      carryforwardIn: "50.00",
      truncated: false,
    });
    expect(allocation.lines[0]?.frozenSnapshot).toMatchObject({
      appliedAmount: "50.00",
      remainingAfterApplication: "40.00",
    });

    const [credit] = await testDb
      .select()
      .from(schema.vatCreditCarryforwards)
      .where(sql`${schema.vatCreditCarryforwards.sourcePp30FilingId} = ${sourceFiling.id}`)
      .limit(1);
    expect(credit).toMatchObject({
      status: "available",
      remainingAmount: "40.00",
      appliedToPp30FilingId: null,
    });

    const filed = await markVatFilingDraftFiled({
      tx: testDb,
      orgId: org.id,
      filingId: filing.id,
      actorId: actor.id,
      filedAt: new Date("2026-05-15T02:00:00.000Z"),
    });
    expect(filed).toMatchObject({
      outputVatTotal: "50.00",
      carryforwardIn: "50.00",
      netPayable: "0.00",
      paymentStatus: "not_required",
    });
  });
});
