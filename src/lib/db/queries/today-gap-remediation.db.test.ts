import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import * as schema from "@/lib/db/schema";
import {
  createTestDb,
  migrateTestDb,
  resetTestDb,
} from "@/tests/db-test-utils";

const { db: testDb, pool } = createTestDb();
let createPayment: typeof import("./payments").createPayment;
let reissueWhtCertificate: typeof import("./wht-certificates").reissueWhtCertificate;
let updateDocumentFromExtraction: typeof import("./documents").updateDocumentFromExtraction;
let confirmDocument: typeof import("./documents").confirmDocument;

beforeAll(async () => {
  await resetTestDb(pool);
  await migrateTestDb(pool);
  vi.doMock("../index", () => ({ db: testDb }));
  ({ createPayment } = await import("./payments"));
  ({ reissueWhtCertificate } = await import("./wht-certificates"));
  ({ updateDocumentFromExtraction, confirmDocument } = await import("./documents"));
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

  it("blocks full tax invoice confirmation until required snapshot evidence is present", async () => {
    const org = await createOrg({
      taxId: "0105566000001",
      branchNumber: "00000",
    });
    const [vendor] = await testDb
      .insert(schema.vendors)
      .values({
        orgId: org.id,
        name: "Full TI Supplier",
        entityType: "company",
        country: "TH",
        taxId: "0105566000002",
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
        status: "draft",
        issueDate: "2026-05-15",
        documentNumber: "FTI-001",
        subtotal: "1000.00",
        vatAmount: "70.00",
        totalAmount: "1070.00",
        currency: "THB",
        taxInvoiceSubtype: "full_ti",
      })
      .returning();

    await expect(confirmDocument(org.id, doc.id)).rejects.toThrow(
      /recoverable tax invoice wording/
    );

    await updateDocumentFromExtraction(org.id, doc.id, {
      taxInvoiceWords: "Tax Invoice / ใบกำกับภาษี",
    });
    const confirmed = await confirmDocument(org.id, doc.id);

    expect(confirmed).toMatchObject({
      status: "confirmed",
      supplierTaxIdSnapshot: "0105566000002",
      supplierBranchNumberSnapshot: "00000",
      buyerTaxIdSnapshot: "0105566000001",
      buyerBranchNumberSnapshot: "00000",
      taxInvoiceSerialNumber: "FTI-001",
      taxInvoiceWords: "Tax Invoice / ใบกำกับภาษี",
    });

    const [eTaxDoc] = await testDb
      .insert(schema.documents)
      .values({
        orgId: org.id,
        vendorId: vendor.id,
        direction: "expense",
        type: "invoice",
        status: "draft",
        issueDate: "2026-05-16",
        documentNumber: "ETI-001",
        subtotal: "2000.00",
        vatAmount: "140.00",
        totalAmount: "2140.00",
        currency: "THB",
        taxInvoiceSubtype: "e_tax_invoice",
      })
      .returning();
    await expect(confirmDocument(org.id, eTaxDoc.id)).rejects.toThrow(
      /recoverable tax invoice wording/
    );

    const [abbDoc] = await testDb
      .insert(schema.documents)
      .values({
        orgId: org.id,
        vendorId: vendor.id,
        direction: "expense",
        type: "invoice",
        status: "draft",
        issueDate: "2026-05-17",
        documentNumber: "ABB-001",
        subtotal: "300.00",
        vatAmount: "21.00",
        totalAmount: "321.00",
        currency: "THB",
        taxInvoiceSubtype: "abb",
      })
      .returning();
    const abbConfirmed = await confirmDocument(org.id, abbDoc.id);
    expect(abbConfirmed).toMatchObject({
      status: "confirmed",
      taxInvoiceSubtype: "abb",
      supplierTaxIdSnapshot: null,
      taxInvoiceWords: null,
    });
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

    await testDb
      .update(schema.vendors)
      .set({ address: "100 Changed Vendor Road" })
      .where(sql`${schema.vendors.id} = ${vendor.id}`);
    const [unchangedCert] = await testDb.select().from(schema.whtCertificates);
    expect(unchangedCert.payeeAddressSnapshot).toBe("99 Vendor Road");

    const protectedSnapshotFields: Array<
      keyof typeof schema.whtCertificates.$inferInsert
    > = [
      "payerTaxIdSnapshot",
      "payerAddressSnapshot",
      "payeeAddressSnapshot",
      "payeeIdNumberSnapshot",
      "paymentTypeDescription",
      "signatoryNameSnapshot",
      "signatoryPositionSnapshot",
    ];
    for (const field of protectedSnapshotFields) {
      try {
        await testDb
          .update(schema.whtCertificates)
          .set({ [field]: `tampered-${field}` })
          .where(sql`${schema.whtCertificates.id} = ${cert.id}`);
        throw new Error(`Expected ${field} update to fail`);
      } catch (error) {
        const cause = (error as { cause?: unknown }).cause;
        expect(String(cause ?? error)).toContain(
          "wht_certificate_snapshot_immutable"
        );
      }
    }

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

  it("blocks below-default foreign WHT payments without accountant acknowledgment", async () => {
    const org = await createOrg();
    const [vendor] = await testDb
      .insert(schema.vendors)
      .values({
        orgId: org.id,
        name: "Foreign Services Ltd",
        entityType: "foreign",
        country: "SG",
        taxId: "SG-123",
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
        documentNumber: "FOREIGN-WHT-BLOCK",
        totalAmount: "10000.00",
      })
      .returning();
    await testDb.insert(schema.whtRates).values({
      paymentType: "phase9_foreign_service_block",
      entityType: "foreign",
      rdPaymentTypeCode: "PHASE9-BLOCK",
      standardRate: "0.1500",
      effectiveFrom: "2026-01-01",
    });
    await testDb.insert(schema.documentLineItems).values({
      orgId: org.id,
      documentId: doc.id,
      amount: "10000.00",
      whtRate: "0.0500",
      whtAmount: "500.00",
      whtType: "foreign_service",
      rdPaymentTypeCode: "PHASE9-BLOCK",
    });

    await expect(
      createPayment({
        orgId: org.id,
        documentId: doc.id,
        paymentDate: "2026-03-20",
        grossAmount: "10000.00",
        whtAmountWithheld: "500.00",
        netAmountPaid: "9500.00",
      })
    ).rejects.toThrow(/Below-default foreign WHT/);

    expect(await testDb.select().from(schema.payments)).toHaveLength(0);
    expect(await testDb.select().from(schema.whtCertificates)).toHaveLength(0);
  });

  it("persists below-default foreign WHT payment acknowledgment audit fields", async () => {
    const org = await createOrg();
    const [vendor] = await testDb
      .insert(schema.vendors)
      .values({
        orgId: org.id,
        name: "Treaty Reviewed Services Ltd",
        entityType: "foreign",
        country: "SG",
        taxId: "SG-456",
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
        issueDate: "2026-04-10",
        documentNumber: "FOREIGN-WHT-ALLOW",
        totalAmount: "10000.00",
      })
      .returning();
    await testDb.insert(schema.whtRates).values({
      paymentType: "phase9_foreign_service_allow",
      entityType: "foreign",
      rdPaymentTypeCode: "PHASE9-ALLOW",
      standardRate: "0.1500",
      effectiveFrom: "2026-01-01",
    });
    await testDb.insert(schema.documentLineItems).values({
      orgId: org.id,
      documentId: doc.id,
      amount: "10000.00",
      whtRate: "0.0500",
      whtAmount: "500.00",
      whtType: "foreign_service",
      rdPaymentTypeCode: "PHASE9-ALLOW",
    });

    await createPayment({
      orgId: org.id,
      documentId: doc.id,
      paymentDate: "2026-04-20",
      grossAmount: "10000.00",
      whtAmountWithheld: "500.00",
      netAmountPaid: "9500.00",
      foreignWhtBelowDefaultAcknowledgment: {
        acknowledgedByUserId: "owner-1",
        rationale: "CPA confirmed treaty position for this payment",
        accountantNote: "CPA note retained in client workpapers",
      },
    });

    const [cert] = await testDb.select().from(schema.whtCertificates);
    expect(cert.formType).toBe("pnd54");
    expect(cert.rateBelowDefaultAcknowledgedByUserId).toBe("owner-1");
    expect(cert.rateBelowDefaultAcknowledgedAt).toBeTruthy();
    expect(cert.rateBelowDefaultStatutoryRate).toBe("0.1500");
    expect(cert.rateBelowDefaultSelectedRate).toBe("0.0500");
    expect(cert.rateBelowDefaultRationale).toContain("CPA confirmed");
    expect(cert.rateBelowDefaultAccountantNote).toContain("CPA note");

    const replacement = await reissueWhtCertificate(
      org.id,
      cert.id,
      "Correct payee copy"
    );
    const [replacementCert] = await testDb
      .select()
      .from(schema.whtCertificates)
      .where(sql`${schema.whtCertificates.id} = ${replacement.certificateId}`);
    expect(replacementCert.rateBelowDefaultAcknowledgedAt?.toISOString()).toBe(
      cert.rateBelowDefaultAcknowledgedAt?.toISOString()
    );
    expect(replacementCert.rateBelowDefaultStatutoryRate).toBe("0.1500");
    expect(replacementCert.rateBelowDefaultSelectedRate).toBe("0.0500");
    expect(replacementCert.rateBelowDefaultRationale).toContain("CPA confirmed");
  });

  it("rolls back payment when PP36 materialization has a hard compliance error", async () => {
    const org = await createOrg();
    const [vendor] = await testDb
      .insert(schema.vendors)
      .values({
        orgId: org.id,
        name: "Unreviewed FX Service Ltd",
        entityType: "foreign",
        country: "SG",
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
        issueDate: "2026-04-10",
        documentNumber: "PP36-FX-MISSING",
        category: "foreign_service",
        isPp36Subject: true,
        currency: "USD",
        subtotal: "100.00",
        totalAmount: "100.00",
      })
      .returning();

    await expect(
      createPayment({
        orgId: org.id,
        documentId: doc.id,
        paymentDate: "2026-04-20",
        grossAmount: "100.00",
        whtAmountWithheld: "0.00",
        netAmountPaid: "100.00",
      })
    ).rejects.toThrow(/reviewed THB base or exchange-rate snapshot/);

    expect(await testDb.select().from(schema.payments)).toHaveLength(0);
  });
});
