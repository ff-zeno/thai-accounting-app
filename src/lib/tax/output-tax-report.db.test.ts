import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import * as schema from "@/lib/db/schema";
import {
  createTestDb,
  createTestOrg,
  migrateTestDb,
  resetTestDb,
} from "@/tests/db-test-utils";

const { db: testDb, pool } = createTestDb();
let buildOutputTaxReport: typeof import("./output-tax-report").buildOutputTaxReport;

beforeAll(async () => {
  await resetTestDb(pool);
  await migrateTestDb(pool);
  vi.doMock("@/lib/db", () => ({ db: testDb }));
  ({ buildOutputTaxReport } = await import("./output-tax-report"));
});

afterAll(async () => {
  await resetTestDb(pool);
  await pool.end();
});

beforeEach(async () => {
  await testDb.execute(sql`
    TRUNCATE TABLE
      sales_transactions,
      establishments,
      organizations
    CASCADE
  `);
});

describe("Section 87 output tax report", () => {
  it("uses POS-primary rows by Bangkok tax month and establishment", async () => {
    const org = await createTestOrg(testDb);
    const [headOffice] = await testDb
      .insert(schema.establishments)
      .values({
        orgId: org.id,
        branchNumber: "00000",
        nameEn: "Head Office",
        isHeadOffice: true,
      })
      .returning();
    const [branch] = await testDb
      .insert(schema.establishments)
      .values({
        orgId: org.id,
        branchNumber: "00001",
        nameEn: "Branch",
      })
      .returning();

    const canonicalSaleId = randomUUID();
    await testDb.insert(schema.salesTransactions).values([
      {
        id: canonicalSaleId,
        orgId: org.id,
        establishmentId: headOffice.id,
        eventRole: "pos_primary",
        source: "manual",
        externalId: "may-bangkok-boundary",
        soldAt: new Date("2026-04-30T17:30:00.000Z"),
        channel: "card",
        pricingMode: "vat_inclusive",
        amountIncludingVat: "1070.00",
        taxBaseExVat: "1000.00",
        vatAmount: "70.00",
        taxInvoiceType: "abb",
        taxInvoiceNumber: "ABB-001",
        terminalId: "T1",
        clearingAccountKey: "card_beam",
      },
      {
        orgId: org.id,
        establishmentId: headOffice.id,
        eventRole: "pos_primary",
        source: "manual",
        externalId: "may-normal",
        soldAt: new Date("2026-05-15T05:00:00.000Z"),
        channel: "qr_promptpay",
        pricingMode: "vat_inclusive",
        amountIncludingVat: "535.00",
        taxBaseExVat: "500.00",
        vatAmount: "35.00",
        taxInvoiceType: "full_ti",
        taxInvoiceNumber: "TI-002",
        terminalId: "T1",
        clearingAccountKey: "qr_promptpay",
      },
      {
        orgId: org.id,
        establishmentId: headOffice.id,
        eventRole: "processor_shadow",
        source: "processor:ksher",
        externalId: "processor-shadow",
        soldAt: new Date("2026-05-15T05:05:00.000Z"),
        channel: "card",
        pricingMode: "vat_inclusive",
        amountIncludingVat: "9999.00",
        taxBaseExVat: "9344.86",
        vatAmount: "654.14",
        clearingAccountKey: "card_ksher",
      },
      {
        orgId: org.id,
        establishmentId: headOffice.id,
        eventRole: "pos_primary",
        source: "manual",
        externalId: "voided-sale",
        soldAt: new Date("2026-05-15T05:20:00.000Z"),
        channel: "card",
        pricingMode: "vat_inclusive",
        amountIncludingVat: "107.00",
        taxBaseExVat: "100.00",
        vatAmount: "7.00",
        taxInvoiceType: "abb",
        taxInvoiceNumber: "ABB-VOID",
        terminalId: "T1",
        clearingAccountKey: "card_beam",
        voidedAt: new Date("2026-05-15T05:21:00.000Z"),
      },
      {
        orgId: org.id,
        establishmentId: headOffice.id,
        eventRole: "pos_primary",
        source: "manual",
        externalId: "superseded-sale",
        soldAt: new Date("2026-05-15T05:30:00.000Z"),
        channel: "card",
        pricingMode: "vat_inclusive",
        amountIncludingVat: "214.00",
        taxBaseExVat: "200.00",
        vatAmount: "14.00",
        taxInvoiceType: "abb",
        taxInvoiceNumber: "ABB-SUPER",
        terminalId: "T1",
        clearingAccountKey: "card_beam",
        supersededById: canonicalSaleId,
      },
      {
        orgId: org.id,
        establishmentId: headOffice.id,
        eventRole: "pos_primary",
        source: "manual",
        externalId: "credit-note",
        soldAt: new Date("2026-05-15T05:40:00.000Z"),
        channel: "card",
        pricingMode: "vat_inclusive",
        amountIncludingVat: "321.00",
        taxBaseExVat: "300.00",
        vatAmount: "21.00",
        taxInvoiceType: "full_ti",
        taxInvoiceNumber: "CN-001",
        terminalId: "T1",
        clearingAccountKey: "card_beam",
        creditNoteForId: canonicalSaleId,
      },
      {
        orgId: org.id,
        establishmentId: branch.id,
        eventRole: "pos_primary",
        source: "manual",
        externalId: "other-branch",
        soldAt: new Date("2026-05-15T05:10:00.000Z"),
        channel: "cash",
        pricingMode: "vat_inclusive",
        amountIncludingVat: "214.00",
        taxBaseExVat: "200.00",
        vatAmount: "14.00",
        taxInvoiceType: "abb",
        taxInvoiceNumber: "ABB-BR-001",
        terminalId: "B1",
        clearingAccountKey: "cash_drawer_b1",
      },
      {
        orgId: org.id,
        establishmentId: headOffice.id,
        eventRole: "pos_primary",
        source: "manual",
        externalId: "april-bangkok",
        soldAt: new Date("2026-04-30T16:30:00.000Z"),
        channel: "card",
        pricingMode: "vat_inclusive",
        amountIncludingVat: "321.00",
        taxBaseExVat: "300.00",
        vatAmount: "21.00",
        taxInvoiceType: "abb",
        taxInvoiceNumber: "ABB-APR",
        terminalId: "T1",
        clearingAccountKey: "card_beam",
      },
    ]);

    const report = await buildOutputTaxReport({
      orgId: org.id,
      establishmentId: headOffice.id,
      periodYear: 2026,
      periodMonth: 5,
    });

    expect(report.rows.map((row) => row.taxInvoiceNumber)).toEqual([
      "ABB-001",
      "TI-002",
    ]);
    expect(report.rows[0].taxDate).toBe("2026-05-01");
    expect(report.totals).toEqual({
      saleCount: 2,
      taxBaseExVat: "1500.00",
      vatAmount: "105.00",
      amountIncludingVat: "1605.00",
    });
    expect(report.dailySummary).toEqual([
      {
        taxDate: "2026-05-01",
        saleCount: 1,
        taxBaseExVat: "1000.00",
        vatAmount: "70.00",
        amountIncludingVat: "1070.00",
      },
      {
        taxDate: "2026-05-15",
        saleCount: 1,
        taxBaseExVat: "500.00",
        vatAmount: "35.00",
        amountIncludingVat: "535.00",
      },
    ]);
    expect(report.sourceUrls[0].url).toBe("https://www.rd.go.th/5209.html");
  });
});
