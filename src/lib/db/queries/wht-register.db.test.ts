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
let getWhtRegisterRows: typeof import("./wht-register").getWhtRegisterRows;

beforeAll(async () => {
  await resetTestDb(pool);
  await migrateTestDb(pool);
  vi.doMock("../index", () => ({ db: testDb }));
  ({ getWhtRegisterRows } = await import("./wht-register"));
});

afterAll(async () => {
  await resetTestDb(pool);
  await pool.end();
});

beforeEach(async () => {
  await testDb.execute(sql`
    TRUNCATE TABLE
      wht_certificate_items,
      wht_certificates,
      wht_credits_received,
      wht_monthly_filings,
      documents,
      vendors,
      organizations
    CASCADE
  `);
});

describe("WHT register read model", () => {
  it("merges incoming credits and outgoing certificates with source links and filing status", async () => {
    const org = await createTestOrg(testDb);
    const [customer] = await testDb
      .insert(schema.vendors)
      .values({ orgId: org.id, name: "Customer Co", entityType: "company" })
      .returning();
    const [vendor] = await testDb
      .insert(schema.vendors)
      .values({ orgId: org.id, name: "Foreign Vendor", entityType: "foreign", country: "JP" })
      .returning();
    const [document] = await testDb
      .insert(schema.documents)
      .values({
        orgId: org.id,
        vendorId: vendor.id,
        type: "invoice",
        direction: "expense",
        documentNumber: "DOC-WHT",
        issueDate: "2026-05-01",
        totalAmount: "100000.00",
        status: "confirmed",
      })
      .returning();
    const [filing] = await testDb
      .insert(schema.whtMonthlyFilings)
      .values({
        orgId: org.id,
        periodYear: 2026,
        periodMonth: 5,
        formType: "pnd54",
        totalBaseAmount: "100000.00",
        totalWhtAmount: "15000.00",
        status: "draft",
      })
      .returning();
    const [certificate] = await testDb
      .insert(schema.whtCertificates)
      .values({
        orgId: org.id,
        certificateNo: "PND54/2026/001",
        payeeVendorId: vendor.id,
        paymentDate: "2026-05-15",
        totalBaseAmount: "100000.00",
        totalWht: "15000.00",
        formType: "pnd54",
        filingId: filing.id,
        status: "issued",
      })
      .returning();
    await testDb.insert(schema.whtCertificateItems).values({
      orgId: org.id,
      certificateId: certificate.id,
      documentId: document.id,
      baseAmount: "100000.00",
      whtRate: "0.1500",
      whtAmount: "15000.00",
      rdPaymentTypeCode: "40_3",
      whtType: "foreign_service",
    });
    await testDb.insert(schema.whtCreditsReceived).values({
      orgId: org.id,
      customerVendorId: customer.id,
      paymentDate: "2026-05-10",
      grossAmount: "10000.00",
      whtAmount: "300.00",
      formType: "pnd53",
      taxYear: 2026,
      certificateNo: "CUST-50TAWI",
    });

    const rows = await getWhtRegisterRows(org.id, { taxYear: 2026, periodMonth: 5 });

    expect(rows).toHaveLength(2);
    expect(rows.find((row) => row.direction === "incoming")).toMatchObject({
      counterpartyName: "Customer Co",
      whtRate: "0.0300",
      certificateStatus: "missing_evidence",
      filingStatus: "cit_credit_pool",
      filingPeriod: "2026",
    });
    expect(rows.find((row) => row.direction === "outgoing")).toMatchObject({
      counterpartyName: "Foreign Vendor",
      formType: "pnd54",
      whtRate: "0.1500",
      certificateStatus: "issued",
      filingStatus: "draft",
      filingPeriod: "2026-05",
      sourceDocumentId: document.id,
    });
  });

  it("keeps PND.54 foreign WHT separate from PND.53 register rows", async () => {
    const org = await createTestOrg(testDb);
    const [vendor] = await testDb
      .insert(schema.vendors)
      .values({ orgId: org.id, name: "Foreign Vendor", entityType: "foreign", country: "JP" })
      .returning();
    await testDb.insert(schema.whtCertificates).values({
      orgId: org.id,
      certificateNo: "PND54/2026/002",
      payeeVendorId: vendor.id,
      paymentDate: "2026-05-20",
      totalBaseAmount: "20000.00",
      totalWht: "3000.00",
      formType: "pnd54",
      status: "issued",
    });

    const rows = await getWhtRegisterRows(org.id, { direction: "outgoing" });
    expect(rows).toHaveLength(1);
    expect(rows[0].formType).toBe("pnd54");
  });
});
