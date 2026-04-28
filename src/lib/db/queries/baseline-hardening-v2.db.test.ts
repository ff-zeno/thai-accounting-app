import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import * as schema from "@/lib/db/schema";
import {
  createTestDb,
  migrateTestDb,
  resetTestDb,
} from "@/tests/db-test-utils";

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
  await testDb.delete(schema.extractionReviewOutcome);
  await testDb.delete(schema.extractionLog);
  await testDb.delete(schema.extractionExemplars);
  await testDb.delete(schema.vendorTier);
  await testDb.delete(schema.reconciliationMatches);
  await testDb.delete(schema.periodLocks);
  await testDb.delete(schema.whtCertificateItems);
  await testDb.delete(schema.whtCertificates);
  await testDb.delete(schema.payments);
  await testDb.delete(schema.documentLineItems);
  await testDb.delete(schema.documents);
  await testDb.delete(schema.transactions);
  await testDb.delete(schema.bankAccounts);
  await testDb.delete(schema.vendors);
  await testDb.delete(schema.organizations);
});

async function createOrg() {
  const [org] = await testDb
    .insert(schema.organizations)
    .values({
      name: "Baseline Org",
      taxId: "1234567890123",
      branchNumber: "00000",
    })
    .returning();
  return org;
}

describe("baseline hardening v2 DB invariants", () => {
  it("vat_pp36 lock blocks mutation of PP36-subject foreign service documents", async () => {
    const org = await createOrg();
    const [vendor] = await testDb
      .insert(schema.vendors)
      .values({
        orgId: org.id,
        name: "Meta Platforms Ireland",
        entityType: "foreign",
        country: "IE",
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
        documentNumber: "META-1",
        issueDate: "2026-03-31",
        vatPeriodYear: 2026,
        vatPeriodMonth: 3,
        subtotal: "107000.00",
        vatAmount: "0.00",
        totalAmount: "107000.00",
        isPp36Subject: true,
      })
      .returning();

    await testDb.insert(schema.periodLocks).values({
      orgId: org.id,
      domain: "vat_pp36",
      periodYear: 2026,
      periodMonth: 3,
      lockedByUserId: "tester",
      lockReason: "pp36_filed",
    });

    await expect(
      testDb
        .update(schema.documents)
        .set({ totalAmount: "108000.00" })
        .where(sql`${schema.documents.id} = ${doc.id}`)
    ).rejects.toThrow(/Failed query/);
  });

  it("WHT form-specific lock blocks only the filed form source period", async () => {
    const org = await createOrg();
    const [individual] = await testDb
      .insert(schema.vendors)
      .values({
        orgId: org.id,
        name: "Individual Vendor",
        entityType: "individual",
        country: "TH",
      })
      .returning();
    const [company] = await testDb
      .insert(schema.vendors)
      .values({
        orgId: org.id,
        name: "Company Vendor",
        entityType: "company",
        country: "TH",
      })
      .returning();
    const [pnd3] = await testDb
      .insert(schema.whtCertificates)
      .values({
        orgId: org.id,
        certificateNo: "PND3/2026/001",
        payeeVendorId: individual.id,
        paymentDate: "2026-04-05",
        totalBaseAmount: "10000.00",
        totalWht: "300.00",
        formType: "pnd3",
      })
      .returning();
    const [pnd53] = await testDb
      .insert(schema.whtCertificates)
      .values({
        orgId: org.id,
        certificateNo: "PND53/2026/001",
        payeeVendorId: company.id,
        paymentDate: "2026-04-05",
        totalBaseAmount: "10000.00",
        totalWht: "300.00",
        formType: "pnd53",
      })
      .returning();

    await testDb.insert(schema.periodLocks).values({
      orgId: org.id,
      domain: "wht_pnd3",
      periodYear: 2026,
      periodMonth: 4,
      lockedByUserId: "tester",
      lockReason: "pnd3_filed",
    });

    await expect(
      testDb
        .update(schema.whtCertificates)
        .set({ totalWht: "301.00" })
        .where(sql`${schema.whtCertificates.id} = ${pnd3.id}`)
    ).rejects.toThrow(/Failed query/);

    await expect(
      testDb
        .update(schema.whtCertificates)
        .set({ totalWht: "301.00" })
        .where(sql`${schema.whtCertificates.id} = ${pnd53.id}`)
    ).resolves.toBeDefined();
  });

  it("reconciliation match rejects payment from a different document", async () => {
    const org = await createOrg();
    const [vendor] = await testDb
      .insert(schema.vendors)
      .values({
        orgId: org.id,
        name: "Vendor",
        entityType: "company",
        country: "TH",
      })
      .returning();
    const [bankAccount] = await testDb
      .insert(schema.bankAccounts)
      .values({
        orgId: org.id,
        bankCode: "KBANK",
        accountNumber: "1111111111",
        accountName: "Main",
      })
      .returning();
    const [txn] = await testDb
      .insert(schema.transactions)
      .values({
        orgId: org.id,
        bankAccountId: bankAccount.id,
        date: "2026-04-05",
        description: "Payment",
        amount: "1000.00",
        type: "debit",
      })
      .returning();
    const docs = await testDb
      .insert(schema.documents)
      .values([
        {
          orgId: org.id,
          vendorId: vendor.id,
          direction: "expense",
          type: "invoice",
          status: "confirmed",
          totalAmount: "1000.00",
        },
        {
          orgId: org.id,
          vendorId: vendor.id,
          direction: "expense",
          type: "invoice",
          status: "confirmed",
          totalAmount: "1000.00",
        },
      ])
      .returning();
    const [payment] = await testDb
      .insert(schema.payments)
      .values({
        orgId: org.id,
        documentId: docs[1].id,
        paymentDate: "2026-04-05",
        grossAmount: "1000.00",
        whtAmountWithheld: "0.00",
        netAmountPaid: "1000.00",
      })
      .returning();

    await expect(
      testDb.insert(schema.reconciliationMatches).values({
        orgId: org.id,
        transactionId: txn.id,
        documentId: docs[0].id,
        paymentId: payment.id,
        matchedAmount: "1000.00",
        matchType: "manual",
        confidence: "1.00",
        matchedBy: "manual",
      })
    ).rejects.toThrow(/Failed query/);
  });

  it("WHT replacement certificate must belong to the same org", async () => {
    const orgA = await createOrg();
    const orgB = await createOrg();
    const [vendorA] = await testDb
      .insert(schema.vendors)
      .values({
        orgId: orgA.id,
        name: "Vendor A",
        entityType: "company",
        country: "TH",
      })
      .returning();
    const [vendorB] = await testDb
      .insert(schema.vendors)
      .values({
        orgId: orgB.id,
        name: "Vendor B",
        entityType: "company",
        country: "TH",
      })
      .returning();
    const [certA] = await testDb
      .insert(schema.whtCertificates)
      .values({
        orgId: orgA.id,
        certificateNo: "PND3/2026/A001",
        payeeVendorId: vendorA.id,
        paymentDate: "2026-04-05",
        totalBaseAmount: "10000.00",
        totalWht: "300.00",
        formType: "pnd3",
      })
      .returning();
    const [certB] = await testDb
      .insert(schema.whtCertificates)
      .values({
        orgId: orgB.id,
        certificateNo: "PND3/2026/B001",
        payeeVendorId: vendorB.id,
        paymentDate: "2026-04-05",
        totalBaseAmount: "10000.00",
        totalWht: "300.00",
        formType: "pnd3",
      })
      .returning();

    await expect(
      testDb
        .update(schema.whtCertificates)
        .set({ replacementCertId: certB.id })
        .where(sql`${schema.whtCertificates.id} = ${certA.id}`)
    ).rejects.toThrow(/Failed query/);
  });

  it("extraction review outcome must reference an extraction log from the same org", async () => {
    const orgA = await createOrg();
    const orgB = await createOrg();
    const [vendorA] = await testDb
      .insert(schema.vendors)
      .values({
        orgId: orgA.id,
        name: "Vendor A",
        entityType: "company",
        country: "TH",
      })
      .returning();
    const [vendorB] = await testDb
      .insert(schema.vendors)
      .values({
        orgId: orgB.id,
        name: "Vendor B",
        entityType: "company",
        country: "TH",
      })
      .returning();
    const [docA] = await testDb
      .insert(schema.documents)
      .values({
        orgId: orgA.id,
        vendorId: vendorA.id,
        direction: "expense",
        type: "invoice",
        status: "confirmed",
      })
      .returning();
    const [docB] = await testDb
      .insert(schema.documents)
      .values({
        orgId: orgB.id,
        vendorId: vendorB.id,
        direction: "expense",
        type: "invoice",
        status: "confirmed",
      })
      .returning();
    const [logA] = await testDb
      .insert(schema.extractionLog)
      .values({
        orgId: orgA.id,
        documentId: docA.id,
        vendorId: vendorA.id,
        tierUsed: 0,
        inngestIdempotencyKey: "tenant-isolation-log-a",
      })
      .returning();

    await expect(
      testDb.insert(schema.extractionReviewOutcome).values({
        orgId: orgB.id,
        documentId: docB.id,
        extractionLogId: logA.id,
        userCorrected: true,
        correctionCount: 1,
        reviewedByUserId: "user_test",
      })
    ).rejects.toThrow(/Failed query/);
  });

  it("extraction log exemplar_ids must reference exemplars from the same org", async () => {
    const orgA = await createOrg();
    const orgB = await createOrg();
    const [vendorA] = await testDb
      .insert(schema.vendors)
      .values({
        orgId: orgA.id,
        name: "Vendor A",
        entityType: "company",
        country: "TH",
      })
      .returning();
    const [vendorB] = await testDb
      .insert(schema.vendors)
      .values({
        orgId: orgB.id,
        name: "Vendor B",
        entityType: "company",
        country: "TH",
      })
      .returning();
    const [docA] = await testDb
      .insert(schema.documents)
      .values({
        orgId: orgA.id,
        vendorId: vendorA.id,
        direction: "expense",
        type: "invoice",
        status: "confirmed",
      })
      .returning();
    const [docB] = await testDb
      .insert(schema.documents)
      .values({
        orgId: orgB.id,
        vendorId: vendorB.id,
        direction: "expense",
        type: "invoice",
        status: "confirmed",
      })
      .returning();
    const [exemplarA] = await testDb
      .insert(schema.extractionExemplars)
      .values({
        orgId: orgA.id,
        vendorId: vendorA.id,
        documentId: docA.id,
        fieldName: "totalAmount",
        fieldCriticality: "high",
        aiValue: "100.00",
        userValue: "101.00",
        wasCorrected: true,
      })
      .returning();

    await expect(
      testDb.insert(schema.extractionLog).values({
        orgId: orgB.id,
        documentId: docB.id,
        vendorId: vendorB.id,
        tierUsed: 1,
        exemplarIds: [exemplarA.id],
        inngestIdempotencyKey: "tenant-isolation-exemplar-cross-org",
      })
    ).rejects.toThrow(/Failed query/);
  });

  it("org-scoped vendor tier must reference a vendor from the same org", async () => {
    const orgA = await createOrg();
    const orgB = await createOrg();
    const [vendorA] = await testDb
      .insert(schema.vendors)
      .values({
        orgId: orgA.id,
        name: "Vendor A",
        entityType: "company",
        country: "TH",
      })
      .returning();

    await expect(
      testDb.insert(schema.vendorTier).values({
        orgId: orgB.id,
        vendorId: vendorA.id,
        scopeKind: "org",
        tier: 1,
        docsProcessedTotal: 1,
      })
    ).rejects.toThrow(/Failed query/);
  });
});
