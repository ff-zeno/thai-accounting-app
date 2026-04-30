import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import * as schema from "@/lib/db/schema";
import {
  createTestDb,
  migrateTestDb,
  resetTestDb,
} from "@/tests/db-test-utils";

const { db: testDb, pool } = createTestDb();
let computeVatForPeriod: typeof import("./vat-records").computeVatForPeriod;
let OutputVatPathDisabledError: typeof import("./vat-records").OutputVatPathDisabledError;
let createPayment: typeof import("./payments").createPayment;
let updateDocumentFromExtraction: typeof import("./documents").updateDocumentFromExtraction;

beforeAll(async () => {
  await resetTestDb(pool);
  await migrateTestDb(pool);
  vi.doMock("../index", () => ({ db: testDb }));
  ({ computeVatForPeriod, OutputVatPathDisabledError } = await import("./vat-records"));
  ({ createPayment } = await import("./payments"));
  ({ updateDocumentFromExtraction } = await import("./documents"));
});

afterAll(async () => {
  await resetTestDb(pool);
  await pool.end();
});

beforeEach(async () => {
  await testDb.delete(schema.exceptionQueue);
  await testDb.delete(schema.whtAnnualThresholdDecisions);
  await testDb.delete(schema.whtCertificateItems);
  await testDb.delete(schema.whtCertificates);
  await testDb.delete(schema.whtSequenceCounters);
  await testDb.delete(schema.payments);
  await testDb.delete(schema.documentLineItems);
  await testDb.delete(schema.documents);
  await testDb.delete(schema.vendors);
  await testDb.delete(schema.auditLog);
  await testDb.delete(schema.organizations);
});

async function createOrg(overrides: Partial<typeof schema.organizations.$inferInsert> = {}) {
  const [org] = await testDb
    .insert(schema.organizations)
    .values({
      name: "Today Gap Org",
      taxId: "1234567890123",
      branchNumber: "00000",
      ...overrides,
    })
    .returning();
  return org;
}

describe("today-gap remediation P0 invariants", () => {
  it("blocks document-derived PP30 output VAT for POS/channel-sales organizations", async () => {
    const org = await createOrg({ hasPosSales: true });

    await expect(computeVatForPeriod(org.id, 2026, 3)).rejects.toBeInstanceOf(
      OutputVatPathDisabledError
    );
  });

  it("excludes suspected foreign vendors from PP30 input VAT and queues review", async () => {
    const org = await createOrg();
    const [vendor] = await testDb
      .insert(schema.vendors)
      .values({
        orgId: org.id,
        name: "TikTok Pte. Ltd.",
        entityType: "company",
        country: "TH",
        isVatRegistered: true,
        taxId: "3333333333333",
        branchNumber: "00000",
      })
      .returning();

    await testDb.insert(schema.documents).values({
      orgId: org.id,
      vendorId: vendor.id,
      direction: "expense",
      type: "invoice",
      status: "confirmed",
      issueDate: "2026-03-15",
      vatPeriodYear: 2026,
      vatPeriodMonth: 3,
      documentNumber: "TT-1",
      subtotal: "1000.00",
      vatAmount: "70.00",
      totalAmount: "1070.00",
      taxInvoiceSubtype: "full_ti",
    });

    const result = await computeVatForPeriod(org.id, 2026, 3);
    expect(result.inputVatPp30).toBe("0.00");

    const reviews = await testDb
      .select()
      .from(schema.exceptionQueue)
      .where(
        sql`${schema.exceptionQueue.orgId} = ${org.id}
          AND ${schema.exceptionQueue.exceptionType} = 'vendor_country_review'`
      );
    expect(reviews).toHaveLength(1);
  });

  it("rejects VAT period mismatch unless override reason is present", async () => {
    const org = await createOrg();

    await expect(
      testDb.insert(schema.documents).values({
        orgId: org.id,
        direction: "income",
        type: "invoice",
        status: "confirmed",
        issueDate: "2026-03-15",
        vatPeriodYear: 2026,
        vatPeriodMonth: 4,
      })
    ).rejects.toThrow(/Failed query/);

    await expect(
      testDb.insert(schema.documents).values({
        orgId: org.id,
        direction: "income",
        type: "invoice",
        status: "confirmed",
        issueDate: "2026-03-15",
        vatPeriodYear: 2026,
        vatPeriodMonth: 4,
        vatPeriodOverrideReason: "Late valid tax invoice claimed in later PP30 period",
        vatPeriodOverriddenByUserId: "reviewer",
        vatPeriodOverriddenAt: new Date(),
      })
    ).resolves.toBeDefined();
  });

  it("derives VAT period from issue date during extraction/update storage", async () => {
    const org = await createOrg();
    const [doc] = await testDb
      .insert(schema.documents)
      .values({
        orgId: org.id,
        direction: "income",
        type: "invoice",
        status: "draft",
      })
      .returning();

    const updated = await updateDocumentFromExtraction(org.id, doc.id, {
      issueDate: "2026-01-01",
      documentNumber: "INV-UTC7",
    });

    expect(updated?.vatPeriodYear).toBe(2026);
    expect(updated?.vatPeriodMonth).toBe(1);
  });

  it("snapshots WHT certificate payer/payee fields and enforces filing FK", async () => {
    const org = await createOrg({
      address: "1 Main Road Bangkok",
      addressTh: "1 ถนนหลัก กรุงเทพฯ",
    });
    const [vendor] = await testDb
      .insert(schema.vendors)
      .values({
        orgId: org.id,
        name: "Thai Services Co",
        entityType: "company",
        country: "TH",
        taxId: "3333333333333",
        branchNumber: "00000",
        address: "99 Vendor Road",
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
        documentNumber: "WHT-1",
        totalAmount: "2000.00",
      })
      .returning();
    await testDb.insert(schema.documentLineItems).values({
      orgId: org.id,
      documentId: doc.id,
      amount: "2000.00",
      whtRate: "0.0300",
      whtAmount: "60.00",
      whtType: "service",
      rdPaymentTypeCode: "402",
    });

    await createPayment({
      orgId: org.id,
      documentId: doc.id,
      paymentDate: "2026-03-20",
      grossAmount: "2000.00",
      whtAmountWithheld: "60.00",
      netAmountPaid: "1940.00",
    });

    const [cert] = await testDb.select().from(schema.whtCertificates);
    expect(cert.payerTaxIdSnapshot).toBe("1234567890123");
    expect(cert.payerAddressSnapshot).toBe("1 ถนนหลัก กรุงเทพฯ");
    expect(cert.payeeAddressSnapshot).toBe("99 Vendor Road");
    expect(cert.payeeIdNumberSnapshot).toBe("3333333333333");
    expect(cert.paymentTypeDescription).toContain("service");

    await expect(
      testDb
        .update(schema.whtCertificates)
        .set({ filingId: "00000000-0000-4000-8000-000000000000" })
        .where(sql`${schema.whtCertificates.id} = ${cert.id}`)
    ).rejects.toThrow(/Failed query/);
  });

  it("applies annual below-1000 WHT exemption and catch-up withholding", async () => {
    const org = await createOrg();
    const [vendor] = await testDb
      .insert(schema.vendors)
      .values({
        orgId: org.id,
        name: "Small Service Vendor",
        entityType: "company",
        country: "TH",
        taxId: "3333333333333",
        branchNumber: "00000",
      })
      .returning();

    async function payDoc(number: string, amount: string) {
      const [doc] = await testDb
        .insert(schema.documents)
        .values({
          orgId: org.id,
          vendorId: vendor.id,
          direction: "expense",
          type: "invoice",
          status: "confirmed",
          issueDate: "2026-03-15",
          documentNumber: number,
          totalAmount: amount,
        })
        .returning();
      await testDb.insert(schema.documentLineItems).values({
        orgId: org.id,
        documentId: doc.id,
        amount,
        whtRate: "0.0300",
        whtAmount: (parseFloat(amount) * 0.03).toFixed(2),
        whtType: "service",
        rdPaymentTypeCode: "402",
      });
      await createPayment({
        orgId: org.id,
        documentId: doc.id,
        paymentDate: "2026-03-20",
        grossAmount: amount,
        whtAmountWithheld: (parseFloat(amount) * 0.03).toFixed(2),
        netAmountPaid: (parseFloat(amount) * 0.97).toFixed(2),
      });
    }

    await payDoc("SMALL-1", "400.00");
    await payDoc("SMALL-2", "400.00");
    expect(await testDb.select().from(schema.whtCertificates)).toHaveLength(0);
    const skippedPayments = await testDb.select().from(schema.payments);
    expect(skippedPayments.map((payment) => payment.whtAmountWithheld)).toEqual([
      "0.00",
      "0.00",
    ]);

    await payDoc("SMALL-3", "300.00");
    const certs = await testDb.select().from(schema.whtCertificates);
    expect(certs).toHaveLength(1);
    expect(certs[0].totalBaseAmount).toBe("1100.00");
    expect(certs[0].totalWht).toBe("33.00");
    const finalPayments = await testDb
      .select()
      .from(schema.payments)
      .orderBy(schema.payments.createdAt);
    expect(finalPayments[2].whtAmountWithheld).toBe("33.00");
    expect(finalPayments[2].netAmountPaid).toBe("267.00");
  });
});
