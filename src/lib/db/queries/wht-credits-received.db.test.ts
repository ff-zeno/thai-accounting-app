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
let createWhtCreditReceived: typeof import("./wht-credits-received").createWhtCreditReceived;
let getWhtCreditsReceived: typeof import("./wht-credits-received").getWhtCreditsReceived;
let getWhtCreditsReceivedTotal: typeof import("./wht-credits-received").getWhtCreditsReceivedTotal;
let confirmDocument: typeof import("./documents").confirmDocument;

beforeAll(async () => {
  await resetTestDb(pool);
  await migrateTestDb(pool);
  vi.doMock("../index", () => ({ db: testDb }));
  ({
    createWhtCreditReceived,
    getWhtCreditsReceived,
    getWhtCreditsReceivedTotal,
  } = await import("./wht-credits-received"));
  ({ confirmDocument } = await import("./documents"));
});

afterAll(async () => {
  await resetTestDb(pool);
  await pool.end();
});

beforeEach(async () => {
  await testDb.delete(schema.whtCreditsReceived);
  await testDb.delete(schema.documentLineItems);
  await testDb.delete(schema.documents);
  await testDb.delete(schema.vendors);
  await testDb.delete(schema.auditLog);
  await testDb.delete(schema.organizations);
});

describe("WHT credits received", () => {
  it("records payee-side WHT credit and totals by tax year", async () => {
    const org = await createTestOrg(testDb);
    const customer = await createTestVendor(testDb, org.id, {
      name: "Customer Co",
      taxId: "3333333333333",
    });
    const document = await createTestDocument(testDb, org.id);

    const id = await createWhtCreditReceived({
      orgId: org.id,
      customerVendorId: customer.id,
      certificateReceivedDocumentId: document.id,
      paymentDate: "2026-04-15",
      grossAmount: "10000",
      whtAmount: "300",
      formType: "50_tawi",
      certificateNo: "CERT-001",
      notes: "Received from customer",
    });

    const credits = await getWhtCreditsReceived(org.id, 2026);
    expect(credits).toHaveLength(1);
    expect(credits[0].id).toBe(id);
    expect(credits[0].customerName).toBe("Customer Co");
    expect(credits[0].grossAmount).toBe("10000.00");
    expect(credits[0].whtAmount).toBe("300.00");
    expect(await getWhtCreditsReceivedTotal(org.id, 2026)).toBe("300.00");

    const auditRows = await testDb
      .select()
      .from(schema.auditLog)
      .where(sql`${schema.auditLog.entityId} = ${id}`);
    expect(auditRows).toHaveLength(1);
  });

  it("materializes incoming 50 Tawi documents into WHT credits on confirm", async () => {
    const org = await createTestOrg(testDb);
    const customer = await createTestVendor(testDb, org.id, {
      name: "Customer Co",
      taxId: "3333333333333",
    });
    const [document] = await testDb
      .insert(schema.documents)
      .values({
        orgId: org.id,
        vendorId: customer.id,
        direction: "income",
        type: "wht_certificate_received",
        status: "draft",
        issueDate: "2026-04-15",
        documentNumber: "50T-001",
        totalAmount: "10000.00",
      })
      .returning();
    await testDb.insert(schema.documentLineItems).values({
      orgId: org.id,
      documentId: document.id,
      description: "Service fee withholding certificate",
      amount: "10000.00",
      whtRate: "0.0300",
      whtAmount: "300.00",
    });

    await confirmDocument(org.id, document.id);

    const credits = await getWhtCreditsReceived(org.id, 2026);
    expect(credits).toHaveLength(1);
    expect(credits[0]).toMatchObject({
      customerName: "Customer Co",
      certificateReceivedDocumentId: document.id,
      paymentDate: "2026-04-15",
      grossAmount: "10000.00",
      whtAmount: "300.00",
      formType: "50_tawi",
      certificateNo: "50T-001",
    });
    expect(await getWhtCreditsReceivedTotal(org.id, 2026)).toBe("300.00");

    await confirmDocument(org.id, document.id);
    expect(await getWhtCreditsReceived(org.id, 2026)).toHaveLength(1);
  });

  it("keeps incoming 50 Tawi confirmation atomic when withheld amount is missing", async () => {
    const org = await createTestOrg(testDb);
    const customer = await createTestVendor(testDb, org.id);
    const [document] = await testDb
      .insert(schema.documents)
      .values({
        orgId: org.id,
        vendorId: customer.id,
        direction: "income",
        type: "wht_certificate_received",
        status: "draft",
        issueDate: "2026-04-15",
        documentNumber: "50T-MISSING",
        totalAmount: "10000.00",
      })
      .returning();

    await expect(confirmDocument(org.id, document.id)).rejects.toThrow(
      /withheld amount/
    );

    const [unchanged] = await testDb
      .select({ status: schema.documents.status })
      .from(schema.documents)
      .where(sql`${schema.documents.id} = ${document.id}`);
    expect(unchanged.status).toBe("draft");
    expect(await getWhtCreditsReceived(org.id, 2026)).toHaveLength(0);
  });

  it("rejects incoming 50 Tawi documents filed under expenses", async () => {
    const org = await createTestOrg(testDb);
    const customer = await createTestVendor(testDb, org.id);
    const [document] = await testDb
      .insert(schema.documents)
      .values({
        orgId: org.id,
        vendorId: customer.id,
        direction: "expense",
        type: "wht_certificate_received",
        status: "draft",
        issueDate: "2026-04-15",
        documentNumber: "50T-EXPENSE",
        totalAmount: "10000.00",
      })
      .returning();
    await testDb.insert(schema.documentLineItems).values({
      orgId: org.id,
      documentId: document.id,
      amount: "10000.00",
      whtAmount: "300.00",
    });

    await expect(confirmDocument(org.id, document.id)).rejects.toThrow(
      /must be filed under income/
    );
    expect(await getWhtCreditsReceived(org.id, 2026)).toHaveLength(0);
  });

  it("enforces one active WHT credit per certificate document", async () => {
    const org = await createTestOrg(testDb);
    const customer = await createTestVendor(testDb, org.id);
    const document = await createTestDocument(testDb, org.id);

    await createWhtCreditReceived({
      orgId: org.id,
      customerVendorId: customer.id,
      certificateReceivedDocumentId: document.id,
      paymentDate: "2026-04-15",
      grossAmount: "10000.00",
      whtAmount: "300.00",
      formType: "50_tawi",
    });

    await expect(
      createWhtCreditReceived({
        orgId: org.id,
        customerVendorId: customer.id,
        certificateReceivedDocumentId: document.id,
        paymentDate: "2026-04-16",
        grossAmount: "20000.00",
        whtAmount: "600.00",
        formType: "50_tawi",
      })
    ).rejects.toThrow(/Failed query/);
  });

  it("derives tax year from the Bangkok civil payment date", async () => {
    const org = await createTestOrg(testDb);
    const customer = await createTestVendor(testDb, org.id);

    await createWhtCreditReceived({
      orgId: org.id,
      customerVendorId: customer.id,
      paymentDate: "2026-01-01",
      grossAmount: "1000.00",
      whtAmount: "30.00",
      formType: "50_tawi",
    });

    expect(await getWhtCreditsReceivedTotal(org.id, 2026)).toBe("30.00");
    expect(await getWhtCreditsReceivedTotal(org.id, 2025)).toBe("0.00");
  });

  it("rejects customer and document references outside the org", async () => {
    const org = await createTestOrg(testDb);
    const otherOrg = await createTestOrg(testDb);
    const otherCustomer = await createTestVendor(testDb, otherOrg.id, {
      taxId: "4444444444444",
    });
    const customer = await createTestVendor(testDb, org.id, {
      taxId: "5555555555555",
    });
    const otherDocument = await createTestDocument(testDb, otherOrg.id);

    await expect(
      createWhtCreditReceived({
        orgId: org.id,
        customerVendorId: otherCustomer.id,
        paymentDate: "2026-04-15",
        grossAmount: "10000.00",
        whtAmount: "300.00",
        formType: "50_tawi",
      })
    ).rejects.toThrow("Customer vendor not found");

    await expect(
      createWhtCreditReceived({
        orgId: org.id,
        customerVendorId: customer.id,
        certificateReceivedDocumentId: otherDocument.id,
        paymentDate: "2026-04-15",
        grossAmount: "10000.00",
        whtAmount: "300.00",
        formType: "50_tawi",
      })
    ).rejects.toThrow("Certificate document not found");

    await expect(
      testDb.insert(schema.whtCreditsReceived).values({
        orgId: org.id,
        customerVendorId: otherCustomer.id,
        paymentDate: "2026-04-15",
        grossAmount: "10000.00",
        whtAmount: "300.00",
        formType: "50_tawi",
        taxYear: 2026,
      })
    ).rejects.toThrow(/Failed query/);
  });

  it("guards duplicate certificate numbers per org/customer/year", async () => {
    const org = await createTestOrg(testDb);
    const customer = await createTestVendor(testDb, org.id);

    await createWhtCreditReceived({
      orgId: org.id,
      customerVendorId: customer.id,
      paymentDate: "2026-04-15",
      grossAmount: "10000.00",
      whtAmount: "300.00",
      formType: "50_tawi",
      certificateNo: "CERT-001",
    });

    await expect(
      createWhtCreditReceived({
        orgId: org.id,
        customerVendorId: customer.id,
        paymentDate: "2026-04-20",
        grossAmount: "20000.00",
        whtAmount: "600.00",
        formType: "50_tawi",
        certificateNo: "CERT-001",
      })
    ).rejects.toThrow(/Failed query/);
  });

  it("rejects invalid amount combinations", async () => {
    const org = await createTestOrg(testDb);
    const customer = await createTestVendor(testDb, org.id);

    await expect(
      createWhtCreditReceived({
        orgId: org.id,
        customerVendorId: customer.id,
        paymentDate: "2026-04-15",
        grossAmount: "100.00",
        whtAmount: "101.00",
        formType: "50_tawi",
      })
    ).rejects.toThrow("WHT amount cannot exceed gross amount");

    await expect(
      testDb.insert(schema.whtCreditsReceived).values({
        orgId: org.id,
        customerVendorId: customer.id,
        paymentDate: "2026-04-15",
        grossAmount: "100.00",
        whtAmount: "101.00",
        formType: "50_tawi",
        taxYear: 2026,
      })
    ).rejects.toThrow(/Failed query/);
  });
});
