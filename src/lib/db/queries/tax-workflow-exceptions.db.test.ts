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
let getTaxWorkflowExceptions: typeof import("./tax-workflow-exceptions").getTaxWorkflowExceptions;

beforeAll(async () => {
  await resetTestDb(pool);
  await migrateTestDb(pool);
  vi.doMock("../index", () => ({ db: testDb }));
  ({ getTaxWorkflowExceptions } = await import("./tax-workflow-exceptions"));
});

afterAll(async () => {
  await resetTestDb(pool);
  await pool.end();
});

beforeEach(async () => {
  await testDb.execute(sql`
    TRUNCATE TABLE
      exception_queue,
      wht_certificates,
      wht_credits_received,
      vendors,
      organizations
    CASCADE
  `);
});

describe("tax workflow exceptions", () => {
  it("aggregates unresolved exceptions and WHT workflow gaps", async () => {
    const org = await createTestOrg(testDb);
    const [customer] = await testDb
      .insert(schema.vendors)
      .values({ orgId: org.id, name: "Customer Co", entityType: "company" })
      .returning();
    const [vendor] = await testDb
      .insert(schema.vendors)
      .values({ orgId: org.id, name: "Vendor Co", entityType: "company" })
      .returning();

    await testDb.insert(schema.exceptionQueue).values({
      orgId: org.id,
      entityType: "document",
      entityId: customer.id,
      exceptionType: "missing_tax_treatment",
      severity: "error",
      summary: "Document tax treatment missing",
    });
    await testDb.insert(schema.whtCreditsReceived).values({
      orgId: org.id,
      customerVendorId: customer.id,
      paymentDate: "2026-05-10",
      grossAmount: "10000.00",
      whtAmount: "300.00",
      formType: "pnd53",
      taxYear: 2026,
    });
    await testDb.insert(schema.whtCertificates).values({
      orgId: org.id,
      certificateNo: "PND53/2026/001",
      payeeVendorId: vendor.id,
      paymentDate: "2026-05-15",
      totalBaseAmount: "10000.00",
      totalWht: "300.00",
      formType: "pnd53",
      status: "issued",
    });

    const rows = await getTaxWorkflowExceptions(org.id);
    expect(rows.map((row) => row.area).sort()).toEqual([
      "system",
      "wht_incoming",
      "wht_outgoing",
    ]);
    expect(rows.find((row) => row.area === "wht_incoming")?.summary).toContain(
      "Missing incoming WHT certificate evidence"
    );
    expect(rows.find((row) => row.area === "wht_outgoing")?.sourceHref).toBe(
      "/tax/withholding/filings"
    );
    expect(rows.find((row) => row.area === "system")?.sourceHref).toBe(
      `/documents/${customer.id}/review`
    );
  });
});
