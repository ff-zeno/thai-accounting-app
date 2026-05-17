import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import * as schema from "@/lib/db/schema";
import {
  createTestDb,
  migrateTestDb,
  resetTestDb,
} from "@/tests/db-test-utils";
import { materializePp36ObligationFromDocument } from "./foreign-vendor-tax";
import {
  buildPp30VatFilingDraft,
  buildPp36VatFilingDraft,
  createVatOutputItem,
  markVatFilingDraftFiled,
  recordPp36FilingPayment,
} from "./vat-operations-ledger";

const { db: testDb, pool } = createTestDb();

beforeAll(async () => {
  await resetTestDb(pool);
  await migrateTestDb(pool);
});

afterAll(async () => {
  await resetTestDb(pool);
  await pool.end();
});

beforeEach(async () => {
  await testDb.execute(sql`
    DELETE FROM tax_payment_events;
    DELETE FROM vat_filing_lines;
    DELETE FROM vat_filings;
    DELETE FROM vat_output_items;
    DELETE FROM pp36_obligations;
    DELETE FROM tax_treatment_decisions;
    DELETE FROM payments;
    DELETE FROM document_line_items;
    DELETE FROM documents;
    DELETE FROM users;
    DELETE FROM vendors;
    DELETE FROM organizations;
  `);
});

async function createForeignServiceDocument(overrides: {
  category?: string;
  isPp36Subject?: boolean;
  totalAmountThb?: string | null;
  currency?: string;
} = {}) {
  const [org] = await testDb
    .insert(schema.organizations)
    .values({ name: "PP36 Org", taxId: "1234567890123" })
    .returning();
  const [vendor] = await testDb
    .insert(schema.vendors)
    .values({
      orgId: org.id,
      name: "TikTok Pte Ltd",
      entityType: "foreign",
      country: "SG",
      taxId: "SG-201123456A",
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
      documentNumber: "TT-001",
      subtotal: "1000.00",
      vatAmount: "0.00",
      totalAmount: "1000.00",
      currency: overrides.currency ?? "USD",
      totalAmountThb: Object.hasOwn(overrides, "totalAmountThb")
        ? overrides.totalAmountThb
        : "36500.00",
      category: overrides.category ?? "foreign_service",
      isPp36Subject: overrides.isPp36Subject ?? true,
    })
    .returning();
  await testDb.insert(schema.documentLineItems).values({
    orgId: org.id,
    documentId: doc.id,
    description: "Advertising service",
    amount: "1000.00",
    vatAmount: "0.00",
  });
  return { org, vendor, doc };
}

describe("materializePp36ObligationFromDocument", () => {
  it("creates one idempotent tenant-scoped PP36 obligation with source snapshot hash", async () => {
    const { org, doc } = await createForeignServiceDocument();

    const first = await materializePp36ObligationFromDocument({
      tx: testDb,
      orgId: org.id,
      documentId: doc.id,
      actorId: "user-1",
    });
    const second = await materializePp36ObligationFromDocument({
      tx: testDb,
      orgId: org.id,
      documentId: doc.id,
      actorId: "user-1",
    });

    expect(second?.id).toBe(first?.id);
    expect(first?.vendorCountryCode).toBe("SG");
    expect(first?.baseAmountThb).toBe("36500.00");
    expect(first?.vatAmount).toBe("2555.00");
    expect(first?.sourceSnapshotHash).toMatch(/^[0-9a-f]{64}$/);

    const rows = await testDb
      .select()
      .from(schema.pp36Obligations)
      .where(sql`${schema.pp36Obligations.orgId} = ${org.id}`);
    expect(rows).toHaveLength(1);
  });

  it("does not create PP36 obligations for foreign goods imports", async () => {
    const { org, doc } = await createForeignServiceDocument({
      category: "goods_import",
      isPp36Subject: false,
    });

    const result = await materializePp36ObligationFromDocument({
      tx: testDb,
      orgId: org.id,
      documentId: doc.id,
      actorId: "user-1",
    });

    expect(result).toBeNull();
  });

  it("requires reviewed THB base or FX snapshot for non-THB PP36 services", async () => {
    const { org, doc } = await createForeignServiceDocument({
      totalAmountThb: null,
      currency: "USD",
    });

    await expect(
      materializePp36ObligationFromDocument({
        tx: testDb,
        orgId: org.id,
        documentId: doc.id,
        actorId: "user-1",
      })
    ).rejects.toThrow(/THB base|exchange-rate/);
  });

  it("integrates foreign service PP36 materialization through paid PP36 filing into PP30 reclaim", async () => {
    const { org, vendor, doc } = await createForeignServiceDocument({
      totalAmountThb: "1000.00",
      currency: "USD",
    });
    const [actor] = await testDb
      .insert(schema.users)
      .values({
        orgId: org.id,
        name: "Foreign PP36 Reclaim Filer",
        email: "foreign-pp36-reclaim@example.com",
        role: "accountant",
      })
      .returning();

    const obligation = await materializePp36ObligationFromDocument({
      tx: testDb,
      orgId: org.id,
      documentId: doc.id,
      actorId: actor.id,
    });
    expect(obligation).toMatchObject({
      vendorCountryCode: "SG",
      status: "pp36_required",
      pp36PeriodYear: 2026,
      pp36PeriodMonth: 3,
      vatAmount: "70.00",
    });

    const pp36Draft = await buildPp36VatFilingDraft({
      tx: testDb,
      orgId: org.id,
      periodYear: 2026,
      periodMonth: 3,
      actorId: actor.id,
    });
    expect(pp36Draft.obligations).toMatchObject({
      allocatedCount: 1,
      pp36VatTotal: "70.00",
    });
    await markVatFilingDraftFiled({
      tx: testDb,
      orgId: org.id,
      filingId: pp36Draft.filing.id,
      actorId: actor.id,
      filedAt: new Date("2026-04-15T02:00:00.000Z"),
    });

    const payment = await recordPp36FilingPayment({
      tx: testDb,
      orgId: org.id,
      filingId: pp36Draft.filing.id,
      actorId: actor.id,
      paidAt: new Date("2026-04-20T02:00:00.000Z"),
      amount: "70.00",
      receiptNo: "PP36-E2E-1",
      idempotencyKey: "foreign-service-pp36-to-pp30",
    });
    expect(payment.paidObligations).toHaveLength(1);
    expect(payment.paidObligations[0]).toMatchObject({
      status: "eligible_for_pp30_reclaim",
      pp30ReclaimEligiblePeriodYear: 2026,
      pp30ReclaimEligiblePeriodMonth: 4,
      pp30ReclaimExpiryPeriodYear: 2026,
      pp30ReclaimExpiryPeriodMonth: 9,
    });

    const [outputDoc] = await testDb
      .insert(schema.documents)
      .values({
        orgId: org.id,
        direction: "income",
        type: "invoice",
        status: "confirmed",
        issueDate: "2026-04-20",
        documentNumber: "PP36-RECLAIM-OUTPUT",
        subtotal: "2000.00",
        vatAmount: "140.00",
        totalAmount: "2140.00",
      })
      .returning();
    await createVatOutputItem({
      tx: testDb,
      orgId: org.id,
      sourceDocumentId: outputDoc.id,
      taxInvoiceNo: "PP36-RECLAIM-OUTPUT",
      taxInvoiceDate: "2026-04-20",
      documentDate: "2026-04-20",
      taxPointDate: "2026-04-20",
      taxPointBasis: "issue_date",
      baseAmount: "2000.00",
      vatAmount: "140.00",
      vatRate: "0.0700",
      status: "reportable",
      sourceSnapshot: { documentNumber: "PP36-RECLAIM-OUTPUT" },
    });

    const pp30Draft = await buildPp30VatFilingDraft({
      tx: testDb,
      orgId: org.id,
      periodYear: 2026,
      periodMonth: 4,
      actorId: actor.id,
    });
    expect(pp30Draft.output).toMatchObject({
      allocatedCount: 1,
      outputVatTotal: "140.00",
    });
    expect(pp30Draft.pp36Reclaim).toMatchObject({
      allocatedCount: 1,
      pp36ReclaimTotal: "70.00",
    });

    const filedPp30 = await markVatFilingDraftFiled({
      tx: testDb,
      orgId: org.id,
      filingId: pp30Draft.filing.id,
      actorId: actor.id,
      filedAt: new Date("2026-05-15T02:00:00.000Z"),
    });
    expect(filedPp30).toMatchObject({
      filingType: "pp30",
      outputVatTotal: "140.00",
      pp36ReclaimTotal: "70.00",
      netPayable: "70.00",
    });

    const [reclaimed] = await testDb
      .select()
      .from(schema.pp36Obligations)
      .where(sql`${schema.pp36Obligations.id} = ${obligation!.id}`);
    expect(reclaimed).toMatchObject({
      status: "reclaimed_in_pp30",
      pp30ReclaimFilingId: pp30Draft.filing.id,
    });
    expect(reclaimed.pp36PaidAt).toBeTruthy();
    expect(reclaimed.pp30ReclaimFilingLineId).toBeTruthy();
    expect(vendor.country).toBe("SG");
  });
});
