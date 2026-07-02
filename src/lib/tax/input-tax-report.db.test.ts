import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import * as schema from "@/lib/db/schema";
import {
  createTestDb,
  createTestDocument,
  createTestOrg,
  createTestVendor,
  migrateTestDb,
  resetTestDb,
} from "@/tests/db-test-utils";

const { db: testDb, pool } = createTestDb();
let buildInputTaxReport: typeof import("./input-tax-report").buildInputTaxReport;

beforeAll(async () => {
  await resetTestDb(pool);
  await migrateTestDb(pool);
  vi.doMock("@/lib/db", () => ({ db: testDb }));
  ({ buildInputTaxReport } = await import("./input-tax-report"));
});

afterAll(async () => {
  await resetTestDb(pool);
  await pool.end();
});

beforeEach(async () => {
  await testDb.execute(sql`
    TRUNCATE TABLE
      vat_input_items,
      documents,
      vendors,
      organizations
    CASCADE
  `);
});

describe("Section 87 input tax report", () => {
  it("uses claimable VAT input items by eligible period", async () => {
    const org = await createTestOrg(testDb);
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
    const vendor = await createTestVendor(testDb, org.id, {
      name: "Thai Supplier",
      taxId: "3333333333333",
    });
    const mayDoc = await createTestDocument(testDb, org.id, vendor.id);
    const maySecondDoc = await createTestDocument(testDb, org.id, vendor.id);
    const heldDoc = await createTestDocument(testDb, org.id, vendor.id);
    const juneDoc = await createTestDocument(testDb, org.id, vendor.id);

    await testDb.insert(schema.vatInputItems).values([
      {
        orgId: org.id,
        establishmentId: establishment.id,
        sourceDocumentId: mayDoc.id,
        vendorId: vendor.id,
        taxInvoiceNo: "SUP-001",
        taxInvoiceDate: "2026-05-03",
        taxInvoiceReceivedDate: "2026-05-03",
        taxInvoiceSubtype: "full_ti",
        documentDate: "2026-05-03",
        baseAmount: "1000.00",
        vatAmount: "70.00",
        vatRate: "0.0700",
        eligiblePeriodYear: 2026,
        eligiblePeriodMonth: 5,
        expiryPeriodYear: 2026,
        expiryPeriodMonth: 11,
        status: "claimable",
        sourceSnapshot: { source: "input-report-test" },
        sourceSnapshotHash: "a".repeat(64),
      },
      {
        orgId: org.id,
        establishmentId: establishment.id,
        sourceDocumentId: maySecondDoc.id,
        vendorId: vendor.id,
        taxInvoiceNo: "SUP-002",
        taxInvoiceDate: "2026-05-03",
        taxInvoiceReceivedDate: "2026-05-03",
        taxInvoiceSubtype: "e_tax_invoice",
        documentDate: "2026-05-03",
        baseAmount: "500.00",
        vatAmount: "35.00",
        vatRate: "0.0700",
        eligiblePeriodYear: 2026,
        eligiblePeriodMonth: 5,
        expiryPeriodYear: 2026,
        expiryPeriodMonth: 11,
        status: "claimable",
        sourceSnapshot: { source: "input-report-test" },
        sourceSnapshotHash: "b".repeat(64),
      },
      {
        orgId: org.id,
        establishmentId: establishment.id,
        sourceDocumentId: heldDoc.id,
        vendorId: vendor.id,
        taxInvoiceNo: "SUP-HELD",
        taxInvoiceDate: "2026-05-04",
        taxInvoiceReceivedDate: "2026-05-04",
        taxInvoiceSubtype: "full_ti",
        documentDate: "2026-05-04",
        baseAmount: "900.00",
        vatAmount: "63.00",
        vatRate: "0.0700",
        eligiblePeriodYear: 2026,
        eligiblePeriodMonth: 5,
        expiryPeriodYear: 2026,
        expiryPeriodMonth: 11,
        status: "held",
        sourceSnapshot: { source: "input-report-test" },
        sourceSnapshotHash: "c".repeat(64),
      },
      {
        orgId: org.id,
        establishmentId: establishment.id,
        sourceDocumentId: juneDoc.id,
        vendorId: vendor.id,
        taxInvoiceNo: "SUP-JUNE",
        taxInvoiceDate: "2026-06-01",
        taxInvoiceReceivedDate: "2026-06-01",
        taxInvoiceSubtype: "full_ti",
        documentDate: "2026-06-01",
        baseAmount: "100.00",
        vatAmount: "7.00",
        vatRate: "0.0700",
        eligiblePeriodYear: 2026,
        eligiblePeriodMonth: 6,
        expiryPeriodYear: 2026,
        expiryPeriodMonth: 12,
        status: "claimable",
        sourceSnapshot: { source: "input-report-test" },
        sourceSnapshotHash: "d".repeat(64),
      },
    ]);

    const report = await buildInputTaxReport({
      orgId: org.id,
      periodYear: 2026,
      periodMonth: 5,
    });

    expect(report.rows.map((row) => row.taxInvoiceNo)).toEqual([
      "SUP-001",
      "SUP-002",
    ]);
    expect(report.totals).toEqual({
      rowCount: 2,
      baseAmount: "1500.00",
      vatAmount: "105.00",
    });
    expect(report.dailySummary).toEqual([
      {
        taxInvoiceDate: "2026-05-03",
        rowCount: 2,
        baseAmount: "1500.00",
        vatAmount: "105.00",
      },
    ]);
  });
});
