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
let processPostingOutboxRow: typeof import("./posting-outbox").processPostingOutboxRow;
let processPostingOutboxCronBatch:
  typeof import("./posting-outbox").processPostingOutboxCronBatch;
let enqueuePostingOutbox: typeof import("./posting-outbox").enqueuePostingOutbox;
let drainPostingOutbox: typeof import("./posting-outbox").drainPostingOutbox;
let getPostingOutboxDashboard: typeof import("./posting-outbox").getPostingOutboxDashboard;
let lockPeriod: typeof import("./period-locks").lockPeriod;

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
  ({
    drainPostingOutbox,
    enqueuePostingOutbox,
    getPostingOutboxDashboard,
    processPostingOutboxCronBatch,
    processPostingOutboxRow,
  } = await import("./posting-outbox"));
  ({ lockPeriod } = await import("./period-locks"));
});

afterAll(async () => {
  await resetTestDb(pool);
  await pool.end();
});

beforeEach(async () => {
  await testDb.execute(
    sql`TRUNCATE TABLE posting_exceptions, posting_outbox, journal_lines, journal_entries, gl_accounts CASCADE`
  );
  await testDb.delete(schema.whtCreditsReceived);
  await testDb.delete(schema.documentLineItems);
  await testDb.delete(schema.documents);
  await testDb.delete(schema.periodLocks);
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
    const outboxRows = await testDb
      .select()
      .from(schema.postingOutbox)
      .where(sql`${schema.postingOutbox.sourceEntityId} = ${id}`);
    expect(outboxRows).toHaveLength(1);
    expect(outboxRows[0]).toMatchObject({
      sourceEntityType: "wht_credits_received",
      eventType: "create",
      postingStatus: "pending",
    });
  });

  it("processes WHT credit posting outbox into an idempotent GL journal", async () => {
    const org = await createTestOrg(testDb);
    const customer = await createTestVendor(testDb, org.id, {
      name: "Customer Co",
      taxId: "3333333333333",
    });
    const creditId = await createWhtCreditReceived({
      orgId: org.id,
      customerVendorId: customer.id,
      paymentDate: "2026-04-15",
      grossAmount: "10000.00",
      whtAmount: "300.00",
      formType: "50_tawi",
      certificateNo: "50T-GL-001",
    });
    const [outbox] = await testDb
      .select()
      .from(schema.postingOutbox)
      .where(sql`${schema.postingOutbox.sourceEntityId} = ${creditId}`);

    const posted = await processPostingOutboxRow({
      orgId: org.id,
      postingOutboxId: outbox.id,
    });
    const postedAgain = await processPostingOutboxRow({
      orgId: org.id,
      postingOutboxId: outbox.id,
    });

    expect(posted.postingStatus).toBe("posted");
    expect(postedAgain.journalEntryId).toBe(posted.journalEntryId);
    const entries = await testDb
      .select()
      .from(schema.journalEntries)
      .where(sql`${schema.journalEntries.sourceEntityId} = ${creditId}`);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      entryType: "auto_document",
      postingKind: "wht_credit_received",
      sourceEntityType: "wht_credits_received",
    });

    const lines = await testDb
      .select({
        accountCode: schema.glAccounts.accountCode,
        debitAmount: schema.journalLines.debitAmount,
        creditAmount: schema.journalLines.creditAmount,
      })
      .from(schema.journalLines)
      .innerJoin(
        schema.glAccounts,
        sql`${schema.glAccounts.id} = ${schema.journalLines.accountId}`
      )
      .where(sql`${schema.journalLines.journalEntryId} = ${entries[0].id}`)
      .orderBy(schema.journalLines.lineNumber);
    expect(lines).toEqual([
      { accountCode: "1180", debitAmount: "300.00", creditAmount: "0.00" },
      { accountCode: "1140", debitAmount: "0.00", creditAmount: "300.00" },
    ]);
  });

  it("cron batch drains due posting outbox rows and leaves future rows pending", async () => {
    const org = await createTestOrg(testDb);
    const customer = await createTestVendor(testDb, org.id, {
      name: "Customer Co",
      taxId: "3333333333333",
    });
    const dueCreditId = await createWhtCreditReceived({
      orgId: org.id,
      customerVendorId: customer.id,
      paymentDate: "2026-04-15",
      grossAmount: "10000.00",
      whtAmount: "300.00",
      formType: "50_tawi",
      certificateNo: "50T-CRON-001",
    });
    const futureCreditId = await createWhtCreditReceived({
      orgId: org.id,
      customerVendorId: customer.id,
      paymentDate: "2026-05-15",
      grossAmount: "10000.00",
      whtAmount: "300.00",
      formType: "50_tawi",
      certificateNo: "50T-CRON-002",
    });

    const result = await processPostingOutboxCronBatch({
      throughDate: "2026-04-30",
      orgLimit: 10,
      chunkSize: 10,
    });

    expect(result).toMatchObject({
      orgsScanned: 1,
      processed: 1,
      posted: 1,
      failed: 0,
    });

    const outboxRows = await testDb
      .select()
      .from(schema.postingOutbox)
      .where(
        sql`${schema.postingOutbox.sourceEntityId} IN (${dueCreditId}, ${futureCreditId})`
      )
      .orderBy(schema.postingOutbox.postingDate);
    expect(outboxRows.map((row) => row.postingStatus)).toEqual(["posted", "pending"]);
  });

  it("cron batch reports partial counters when an org drain fails", async () => {
    const org = await createTestOrg(testDb);
    const bogusSourceId = "00000000-0000-4000-8000-000000000321";
    const outbox = await enqueuePostingOutbox({
      orgId: org.id,
      sourceEntityType: "unknown_source",
      sourceEntityId: bogusSourceId,
      eventType: "create",
      postingDate: "2026-04-15",
    });
    await testDb
      .update(schema.postingOutbox)
      .set({ postingAttempts: 2, postingStatus: "retrying" })
      .where(sql`${schema.postingOutbox.id} = ${outbox.id}`);

    const result = await processPostingOutboxCronBatch({
      throughDate: "2026-04-30",
      orgLimit: 10,
      chunkSize: 1,
      maxChunksPerOrg: 10,
    });

    expect(result).toMatchObject({
      orgsScanned: 1,
      processed: 1,
      posted: 0,
      retrying: 0,
      failed: 1,
    });
    expect(result.orgResults[0]).toMatchObject({
      orgId: org.id,
      status: "failed",
      processed: 1,
      retrying: 0,
      failed: 1,
    });
  });

  it("cron batch does not retry the same row twice in one drain", async () => {
    const org = await createTestOrg(testDb);
    const bogusSourceId = "00000000-0000-4000-8000-000000000654";
    await enqueuePostingOutbox({
      orgId: org.id,
      sourceEntityType: "unknown_source",
      sourceEntityId: bogusSourceId,
      eventType: "create",
      postingDate: "2026-04-15",
    });

    const result = await processPostingOutboxCronBatch({
      throughDate: "2026-04-30",
      orgLimit: 10,
      chunkSize: 1,
      maxChunksPerOrg: 10,
    });

    expect(result).toMatchObject({
      orgsScanned: 1,
      processed: 1,
      posted: 0,
      retrying: 1,
      failed: 0,
    });
    const [outbox] = await testDb
      .select()
      .from(schema.postingOutbox)
      .where(sql`${schema.postingOutbox.sourceEntityId} = ${bogusSourceId}`);
    expect(outbox).toMatchObject({
      postingStatus: "retrying",
      postingAttempts: 1,
    });
  });

  it("fails close-safe manual drains when rows are left retrying", async () => {
    const org = await createTestOrg(testDb);
    const bogusSourceId = "00000000-0000-4000-8000-000000000655";
    await enqueuePostingOutbox({
      orgId: org.id,
      sourceEntityType: "unknown_source",
      sourceEntityId: bogusSourceId,
      eventType: "create",
      postingDate: "2026-04-15",
    });

    await expect(
      drainPostingOutbox({ orgId: org.id, throughDate: "2026-04-30" })
    ).rejects.toThrow(/retrying row/);

    const [outbox] = await testDb
      .select()
      .from(schema.postingOutbox)
      .where(sql`${schema.postingOutbox.sourceEntityId} = ${bogusSourceId}`);
    expect(outbox).toMatchObject({
      postingStatus: "retrying",
      postingAttempts: 1,
    });
  });

  it("cron batch reports when pending org discovery is truncated", async () => {
    const orgA = await createTestOrg(testDb);
    const orgB = await createTestOrg(testDb);
    await enqueuePostingOutbox({
      orgId: orgA.id,
      sourceEntityType: "unknown_source",
      sourceEntityId: "00000000-0000-4000-8000-000000000701",
      eventType: "create",
      postingDate: "2026-04-15",
    });
    await enqueuePostingOutbox({
      orgId: orgB.id,
      sourceEntityType: "unknown_source",
      sourceEntityId: "00000000-0000-4000-8000-000000000702",
      eventType: "create",
      postingDate: "2026-04-15",
    });

    const result = await processPostingOutboxCronBatch({
      throughDate: "2026-04-30",
      orgLimit: 1,
      chunkSize: 1,
      maxChunksPerOrg: 1,
    });

    expect(result.orgsScanned).toBe(1);
    expect(result.orgQueueTruncated).toBe(true);
  });

  it("records posting exceptions after three failed attempts", async () => {
    const org = await createTestOrg(testDb);
    const bogusSourceId = "00000000-0000-4000-8000-000000000123";
    const outbox = await enqueuePostingOutbox({
      orgId: org.id,
      sourceEntityType: "unknown_source",
      sourceEntityId: bogusSourceId,
      eventType: "create",
    });

    await processPostingOutboxRow({ orgId: org.id, postingOutboxId: outbox.id });
    await processPostingOutboxRow({ orgId: org.id, postingOutboxId: outbox.id });
    const failed = await processPostingOutboxRow({
      orgId: org.id,
      postingOutboxId: outbox.id,
    });

    expect(failed.postingStatus).toBe("failed");
    expect(failed.postingAttempts).toBe(3);
    const exceptions = await testDb
      .select()
      .from(schema.postingExceptions)
      .where(sql`${schema.postingExceptions.postingOutboxId} = ${outbox.id}`);
    expect(exceptions).toHaveLength(1);
    expect(exceptions[0].message).toContain("No posting handler");
    expect(exceptions[0].failureClass).toBe("invalid_source");
  });

  it("surfaces outbox dashboard and resolves open exception after successful retry", async () => {
    const org = await createTestOrg(testDb);
    const customer = await createTestVendor(testDb, org.id);
    const creditId = await createWhtCreditReceived({
      orgId: org.id,
      customerVendorId: customer.id,
      paymentDate: "2026-04-15",
      grossAmount: "10000.00",
      whtAmount: "300.00",
      formType: "50_tawi",
      certificateNo: "50T-RETRY",
    });
    const [outbox] = await testDb
      .select()
      .from(schema.postingOutbox)
      .where(sql`${schema.postingOutbox.sourceEntityId} = ${creditId}`);
    await testDb
      .update(schema.postingOutbox)
      .set({ postingStatus: "failed", postingAttempts: 3, lastError: "temporary" })
      .where(sql`${schema.postingOutbox.id} = ${outbox.id}`);
    await testDb.insert(schema.postingExceptions).values({
      orgId: org.id,
      postingOutboxId: outbox.id,
      sourceEntityType: outbox.sourceEntityType,
      sourceEntityId: outbox.sourceEntityId,
      failureClass: "unknown",
      message: "temporary",
    });

    const before = await getPostingOutboxDashboard(org.id);
    expect(before.summary.failed).toBe(1);
    expect(before.exceptions).toHaveLength(1);

    const posted = await processPostingOutboxRow({
      orgId: org.id,
      postingOutboxId: outbox.id,
    });
    expect(posted.postingStatus).toBe("posted");

    const after = await getPostingOutboxDashboard(org.id);
    expect(after.summary.posted).toBe(1);
    expect(after.exceptions).toHaveLength(0);
  });

  it("drains pending WHT credit postings through a cutoff date", async () => {
    const org = await createTestOrg(testDb);
    const customer = await createTestVendor(testDb, org.id);
    const firstCreditId = await createWhtCreditReceived({
      orgId: org.id,
      customerVendorId: customer.id,
      paymentDate: "2026-04-15",
      grossAmount: "10000.00",
      whtAmount: "300.00",
      formType: "50_tawi",
      certificateNo: "50T-DRAIN-APR",
    });
    const secondCreditId = await createWhtCreditReceived({
      orgId: org.id,
      customerVendorId: customer.id,
      paymentDate: "2026-05-15",
      grossAmount: "20000.00",
      whtAmount: "600.00",
      formType: "50_tawi",
      certificateNo: "50T-DRAIN-MAY",
    });

    await expect(
      drainPostingOutbox({ orgId: org.id, throughDate: "2026-04-30" })
    ).resolves.toMatchObject({ posted: 1, failed: 0 });

    const aprilEntries = await testDb
      .select()
      .from(schema.journalEntries)
      .where(sql`${schema.journalEntries.sourceEntityId} = ${firstCreditId}`);
    const mayEntries = await testDb
      .select()
      .from(schema.journalEntries)
      .where(sql`${schema.journalEntries.sourceEntityId} = ${secondCreditId}`);
    expect(aprilEntries).toHaveLength(1);
    expect(mayEntries).toHaveLength(0);

    await expect(
      drainPostingOutbox({ orgId: org.id, throughDate: "2026-05-31" })
    ).resolves.toMatchObject({ posted: 1, failed: 0 });
  });

  it("fails closed when the posting drain chunk budget is exhausted", async () => {
    const org = await createTestOrg(testDb);
    const customer = await createTestVendor(testDb, org.id);
    await createWhtCreditReceived({
      orgId: org.id,
      customerVendorId: customer.id,
      paymentDate: "2026-04-15",
      grossAmount: "10000.00",
      whtAmount: "300.00",
      formType: "50_tawi",
      certificateNo: "50T-DRAIN-LIMIT-1",
    });
    await createWhtCreditReceived({
      orgId: org.id,
      customerVendorId: customer.id,
      paymentDate: "2026-04-16",
      grossAmount: "20000.00",
      whtAmount: "600.00",
      formType: "50_tawi",
      certificateNo: "50T-DRAIN-LIMIT-2",
    });

    await expect(
      drainPostingOutbox({
        orgId: org.id,
        throughDate: "2026-04-30",
        chunkSize: 1,
        maxChunks: 1,
      })
    ).rejects.toThrow(/period queue was empty/);
  });

  it("does not post WHT credit journals into a locked GL period", async () => {
    const org = await createTestOrg(testDb);
    const customer = await createTestVendor(testDb, org.id);
    const creditId = await createWhtCreditReceived({
      orgId: org.id,
      customerVendorId: customer.id,
      paymentDate: "2026-04-15",
      grossAmount: "10000.00",
      whtAmount: "300.00",
      formType: "50_tawi",
      certificateNo: "50T-LOCKED-GL",
    });
    await lockPeriod({
      orgId: org.id,
      domain: "gl",
      periodYear: 2026,
      periodMonth: 4,
      lockedByUserId: "test-user",
      lockReason: "test_lock",
    });
    const [outbox] = await testDb
      .select()
      .from(schema.postingOutbox)
      .where(sql`${schema.postingOutbox.sourceEntityId} = ${creditId}`);

    const result = await processPostingOutboxRow({
      orgId: org.id,
      postingOutboxId: outbox.id,
    });

    expect(result.postingStatus).toBe("retrying");
    expect(result.lastError).toContain("GL period is locked");
    const entries = await testDb
      .select()
      .from(schema.journalEntries)
      .where(sql`${schema.journalEntries.sourceEntityId} = ${creditId}`);
    expect(entries).toHaveLength(0);
  });

  it("rejects enqueuing new posting rows into locked GL periods", async () => {
    const org = await createTestOrg(testDb);
    await lockPeriod({
      orgId: org.id,
      domain: "gl",
      periodYear: 2026,
      periodMonth: 4,
      lockedByUserId: "test-user",
      lockReason: "test_lock",
    });

    await expect(
      enqueuePostingOutbox({
        orgId: org.id,
        sourceEntityType: "wht_credits_received",
        sourceEntityId: "00000000-0000-4000-8000-000000000456",
        eventType: "create",
        postingDate: "2026-04-15",
      })
    ).rejects.toThrow(/locked GL period/);
  });

  it("blocks drains when failed outbox rows or open exceptions already exist", async () => {
    const org = await createTestOrg(testDb);
    const customer = await createTestVendor(testDb, org.id);
    const creditId = await createWhtCreditReceived({
      orgId: org.id,
      customerVendorId: customer.id,
      paymentDate: "2026-04-15",
      grossAmount: "10000.00",
      whtAmount: "300.00",
      formType: "50_tawi",
      certificateNo: "50T-FAILED-DRAIN",
    });
    await lockPeriod({
      orgId: org.id,
      domain: "gl",
      periodYear: 2026,
      periodMonth: 4,
      lockedByUserId: "test-user",
      lockReason: "test_lock",
    });
    const [outbox] = await testDb
      .select()
      .from(schema.postingOutbox)
      .where(sql`${schema.postingOutbox.sourceEntityId} = ${creditId}`);

    await processPostingOutboxRow({ orgId: org.id, postingOutboxId: outbox.id });
    await processPostingOutboxRow({ orgId: org.id, postingOutboxId: outbox.id });
    const failed = await processPostingOutboxRow({
      orgId: org.id,
      postingOutboxId: outbox.id,
    });
    expect(failed.postingStatus).toBe("failed");

    await expect(
      drainPostingOutbox({ orgId: org.id, throughDate: "2026-04-30" })
    ).rejects.toThrow(/failed row|open exception/);
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
