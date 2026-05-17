import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/lib/db/schema";
import {
  createTestDb,
  migrateTestDb,
  resetTestDb,
} from "@/tests/db-test-utils";

const { db: testDb, pool } = createTestDb();
let getMonthlyFilingSummaryByForm:
  typeof import("./wht-filings").getMonthlyFilingSummaryByForm;
let upsertMonthlyFiling: typeof import("./wht-filings").upsertMonthlyFiling;

beforeAll(async () => {
  await resetTestDb(pool);
  await migrateTestDb(pool);
  vi.doMock("../index", () => ({ db: testDb }));
  ({ getMonthlyFilingSummaryByForm, upsertMonthlyFiling } = await import(
    "./wht-filings"
  ));
});

afterAll(async () => {
  await resetTestDb(pool);
  await pool.end();
});

beforeEach(async () => {
  await testDb.delete(schema.whtCertificateItems);
  await testDb.delete(schema.whtCertificates);
  await testDb.delete(schema.whtMonthlyFilings);
  await testDb.delete(schema.vendors);
  await testDb.delete(schema.organizations);
});

async function createOrg() {
  const [org] = await testDb
    .insert(schema.organizations)
    .values({ name: "WHT Filing Org", taxId: "1234567890123" })
    .returning();
  return org;
}

describe("getMonthlyFilingSummaryByForm", () => {
  it("summarizes certificates by actual PND form without blending PND54 into PND53", async () => {
    const org = await createOrg();
    const [thaiCompany] = await testDb
      .insert(schema.vendors)
      .values({
        orgId: org.id,
        name: "Thai Corporate Vendor",
        entityType: "company",
        country: " th ",
      })
      .returning();
    const [foreignCompany] = await testDb
      .insert(schema.vendors)
      .values({
        orgId: org.id,
        name: "Foreign Corporate Vendor",
        entityType: "company",
        country: "SG",
      })
      .returning();
    const [thaiIndividual] = await testDb
      .insert(schema.vendors)
      .values({
        orgId: org.id,
        name: "Thai Individual Investor",
        entityType: "individual",
        country: "TH",
      })
      .returning();

    await testDb.insert(schema.whtCertificates).values([
      {
        orgId: org.id,
        certificateNo: "PND2/2026/001",
        payeeVendorId: thaiIndividual.id,
        paymentDate: "2026-05-10",
        totalBaseAmount: "5000.00",
        totalWht: "500.00",
        formType: "pnd2",
        status: "issued",
      },
      {
        orgId: org.id,
        certificateNo: "PND53/2026/001",
        payeeVendorId: thaiCompany.id,
        paymentDate: "2026-05-15",
        totalBaseAmount: "10000.00",
        totalWht: "300.00",
        formType: "pnd53",
        status: "issued",
      },
      {
        orgId: org.id,
        certificateNo: "PND54/2026/001",
        payeeVendorId: foreignCompany.id,
        paymentDate: "2026-05-18",
        totalBaseAmount: "20000.00",
        totalWht: "3000.00",
        formType: "pnd54",
        status: "issued",
      },
    ]);
    const pnd54FilingId = await upsertMonthlyFiling({
      orgId: org.id,
      periodYear: 2026,
      periodMonth: 5,
      formType: "pnd54",
      totalBaseAmount: "20000.00",
      totalWhtAmount: "3000.00",
      deadline: "2026-06-15",
    });

    const summary = await getMonthlyFilingSummaryByForm(org.id, 2026, 5);
    const pnd2 = summary.find((row) => row.formType === "pnd2");
    const pnd53 = summary.find((row) => row.formType === "pnd53");
    const pnd54 = summary.find((row) => row.formType === "pnd54");

    expect(summary.map((row) => row.formType)).toEqual([
      "pnd2",
      "pnd3",
      "pnd53",
      "pnd54",
    ]);
    expect(pnd2).toMatchObject({
      totalBaseAmount: "5000.00",
      totalWhtAmount: "500.00",
      certCount: 1,
      filingId: null,
    });
    expect(pnd53).toMatchObject({
      totalBaseAmount: "10000.00",
      totalWhtAmount: "300.00",
      certCount: 1,
      filingId: null,
    });
    expect(pnd54).toMatchObject({
      totalBaseAmount: "20000.00",
      totalWhtAmount: "3000.00",
      certCount: 1,
      filingId: pnd54FilingId,
      status: "draft",
      deadline: "2026-06-15",
    });
  });
});

describe("wht_certificates filing guardrails", () => {
  it("rejects missing and cross-org monthly filing references", async () => {
    const org = await createOrg();
    const [vendor] = await testDb
      .insert(schema.vendors)
      .values({
        orgId: org.id,
        name: "Thai Vendor",
        entityType: "company",
        country: "TH",
      })
      .returning();

    await expect(
      testDb.insert(schema.whtCertificates).values({
        orgId: org.id,
        certificateNo: "PND53/2026/FK-MISSING",
        payeeVendorId: vendor.id,
        paymentDate: "2026-05-20",
        totalBaseAmount: "10000.00",
        totalWht: "300.00",
        formType: "pnd53",
        status: "issued",
        filingId: "00000000-0000-4000-8000-000000000001",
      })
    ).rejects.toThrow(/Failed query/);

    const otherOrg = await createOrg();
    const otherFilingId = await upsertMonthlyFiling({
      orgId: otherOrg.id,
      periodYear: 2026,
      periodMonth: 5,
      formType: "pnd53",
      totalBaseAmount: "5000.00",
      totalWhtAmount: "150.00",
      deadline: "2026-06-15",
    });

    await expect(
      testDb.insert(schema.whtCertificates).values({
        orgId: org.id,
        certificateNo: "PND53/2026/FK-CROSS",
        payeeVendorId: vendor.id,
        paymentDate: "2026-05-21",
        totalBaseAmount: "10000.00",
        totalWht: "300.00",
        formType: "pnd53",
        status: "issued",
        filingId: otherFilingId,
      })
    ).rejects.toThrow(/Failed query/);
  });
});
