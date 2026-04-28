import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  vi,
} from "vitest";
import {
  createTestDb,
  migrateTestDb,
  resetTestDb,
  createTestOrg,
  createTestVendor,
  createTestDocument,
} from "@/tests/db-test-utils";
import * as schema from "@/lib/db/schema";

/*
 * INTEGRATION TESTS -- Extraction Log & Review Outcome
 * =====================================================
 *
 * Validates CRUD operations, idempotency, uniqueness constraints,
 * and org-scoping for the extraction log and review outcome tables.
 *
 * Requires Docker Postgres running:
 *   docker compose -f docker-compose.test.yml up -d
 */

const { db: testDb, pool } = createTestDb();

// Mock the db module so all query functions use our test database
vi.mock("@/lib/db/index", () => ({ db: testDb }));
vi.mock("@/lib/db/helpers/audit-log", () => ({
  auditMutation: vi.fn(),
}));

// Import query functions AFTER the mock is set up
const { insertExtractionLog, getLatestExtractionLog, getRecentExtractionLogs } =
  await import("@/lib/db/queries/extraction-log");
const {
  insertReviewOutcome,
  getReviewOutcomeByDocument,
  getReviewOutcomeByLog,
} = await import("@/lib/db/queries/extraction-review-outcome");

// Test data populated in beforeEach
let org: Awaited<ReturnType<typeof createTestOrg>>;
let vendor: Awaited<ReturnType<typeof createTestVendor>>;
let doc: Awaited<ReturnType<typeof createTestDocument>>;

beforeAll(async () => {
  await resetTestDb(pool);
  await migrateTestDb(pool);
});

afterAll(async () => {
  await resetTestDb(pool);
  await pool.end();
});

beforeEach(async () => {
  // Clean tables in FK order
  await testDb.delete(schema.extractionReviewOutcome);
  await testDb.delete(schema.extractionLog);
  await testDb.delete(schema.documents);
  await testDb.delete(schema.vendors);
  await testDb.delete(schema.organizations);

  // Create fresh test data
  org = await createTestOrg(testDb);
  vendor = await createTestVendor(testDb, org.id);
  doc = await createTestDocument(testDb, org.id, vendor.id);
});

// ---------------------------------------------------------------------------
// Extraction Log
// ---------------------------------------------------------------------------

describe("extraction log", () => {
  it("insertExtractionLog creates a log entry", async () => {
    const result = await insertExtractionLog({
      documentId: doc.id,
      orgId: org.id,
      vendorId: vendor.id,
      tierUsed: 1,
      exemplarIds: [],
      modelUsed: "gpt-4o",
      inputTokens: 500,
      outputTokens: 200,
      costUsd: "0.01200000",
      latencyMs: 1500,
      inngestIdempotencyKey: "idem-001",
    });

    expect(result).not.toBeNull();
    expect(result!.id).toBeTruthy();

    // Read back and verify fields
    const readBack = await getLatestExtractionLog(org.id, doc.id);
    expect(readBack).not.toBeNull();
    expect(readBack!.documentId).toBe(doc.id);
    expect(readBack!.orgId).toBe(org.id);
    expect(readBack!.vendorId).toBe(vendor.id);
    expect(readBack!.tierUsed).toBe(1);
    expect(readBack!.modelUsed).toBe("gpt-4o");
    expect(readBack!.inputTokens).toBe(500);
    expect(readBack!.outputTokens).toBe(200);
    expect(readBack!.latencyMs).toBe(1500);
    expect(readBack!.inngestIdempotencyKey).toBe("idem-001");
  });

  it("insertExtractionLog is idempotent on inngestIdempotencyKey", async () => {
    const first = await insertExtractionLog({
      documentId: doc.id,
      orgId: org.id,
      vendorId: vendor.id,
      tierUsed: 1,
      exemplarIds: [],
      modelUsed: "gpt-4o",
      inngestIdempotencyKey: "idem-dup",
    });
    expect(first).not.toBeNull();

    // Second insert with same key returns null (ON CONFLICT DO NOTHING)
    const second = await insertExtractionLog({
      documentId: doc.id,
      orgId: org.id,
      vendorId: vendor.id,
      tierUsed: 2,
      exemplarIds: [],
      modelUsed: "gpt-4o-mini",
      inngestIdempotencyKey: "idem-dup",
    });
    expect(second).toBeNull();

    // Only one row exists
    const logs = await getRecentExtractionLogs(org.id, vendor.id);
    expect(logs).toHaveLength(1);
    expect(logs[0].tierUsed).toBe(1); // kept the first insert's tier
  });

  it("getLatestExtractionLog returns most recent", async () => {
    await insertExtractionLog({
      documentId: doc.id,
      orgId: org.id,
      vendorId: vendor.id,
      tierUsed: 1,
      exemplarIds: [],
      modelUsed: "gpt-4o",
      inngestIdempotencyKey: "idem-older",
    });

    await insertExtractionLog({
      documentId: doc.id,
      orgId: org.id,
      vendorId: vendor.id,
      tierUsed: 2,
      exemplarIds: [],
      modelUsed: "gpt-4o-mini",
      inngestIdempotencyKey: "idem-newer",
    });

    const latest = await getLatestExtractionLog(org.id, doc.id);
    expect(latest).not.toBeNull();
    expect(latest!.tierUsed).toBe(2);
    expect(latest!.inngestIdempotencyKey).toBe("idem-newer");
  });

  it("getRecentExtractionLogs returns vendor logs ordered by recency", async () => {
    // Create 3 documents for the same vendor
    const doc2 = await createTestDocument(testDb, org.id, vendor.id);
    const doc3 = await createTestDocument(testDb, org.id, vendor.id);

    await insertExtractionLog({
      documentId: doc.id,
      orgId: org.id,
      vendorId: vendor.id,
      tierUsed: 1,
      exemplarIds: [],
      modelUsed: "gpt-4o",
      inngestIdempotencyKey: "idem-v1",
    });

    await insertExtractionLog({
      documentId: doc2.id,
      orgId: org.id,
      vendorId: vendor.id,
      tierUsed: 2,
      exemplarIds: [],
      modelUsed: "gpt-4o",
      inngestIdempotencyKey: "idem-v2",
    });

    await insertExtractionLog({
      documentId: doc3.id,
      orgId: org.id,
      vendorId: vendor.id,
      tierUsed: 3,
      exemplarIds: [],
      modelUsed: "gpt-4o",
      inngestIdempotencyKey: "idem-v3",
    });

    const logs = await getRecentExtractionLogs(org.id, vendor.id);
    expect(logs).toHaveLength(3);
    // Most recent first (descending createdAt)
    expect(logs[0].tierUsed).toBe(3);
    expect(logs[1].tierUsed).toBe(2);
    expect(logs[2].tierUsed).toBe(1);
  });

  it("getRecentExtractionLogs respects limit", async () => {
    const doc2 = await createTestDocument(testDb, org.id, vendor.id);
    const doc3 = await createTestDocument(testDb, org.id, vendor.id);

    await insertExtractionLog({
      documentId: doc.id,
      orgId: org.id,
      vendorId: vendor.id,
      tierUsed: 1,
      exemplarIds: [],
      modelUsed: "gpt-4o",
      inngestIdempotencyKey: "idem-lim1",
    });
    await insertExtractionLog({
      documentId: doc2.id,
      orgId: org.id,
      vendorId: vendor.id,
      tierUsed: 2,
      exemplarIds: [],
      modelUsed: "gpt-4o",
      inngestIdempotencyKey: "idem-lim2",
    });
    await insertExtractionLog({
      documentId: doc3.id,
      orgId: org.id,
      vendorId: vendor.id,
      tierUsed: 3,
      exemplarIds: [],
      modelUsed: "gpt-4o",
      inngestIdempotencyKey: "idem-lim3",
    });

    const logs = await getRecentExtractionLogs(org.id, vendor.id, 2);
    expect(logs).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Review Outcome
// ---------------------------------------------------------------------------

describe("review outcome", () => {
  it("insertReviewOutcome creates an outcome", async () => {
    const log = await insertExtractionLog({
      documentId: doc.id,
      orgId: org.id,
      vendorId: vendor.id,
      tierUsed: 1,
      exemplarIds: [],
      modelUsed: "gpt-4o",
      inngestIdempotencyKey: "idem-ro-1",
    });

    const outcome = await insertReviewOutcome({
      extractionLogId: log!.id,
      documentId: doc.id,
      orgId: org.id,
      userCorrected: true,
      correctionCount: 3,
      reviewedByUserId: "user_abc123",
    });

    expect(outcome).not.toBeNull();
    expect(outcome.id).toBeTruthy();
    expect(outcome.extractionLogId).toBe(log!.id);
    expect(outcome.documentId).toBe(doc.id);
    expect(outcome.orgId).toBe(org.id);
    expect(outcome.userCorrected).toBe(true);
    expect(outcome.correctionCount).toBe(3);
    expect(outcome.reviewedByUserId).toBe("user_abc123");
    expect(outcome.reviewedAt).toBeInstanceOf(Date);
  });

  it("insertReviewOutcome duplicate extractionLogId updates existing outcome", async () => {
    const log = await insertExtractionLog({
      documentId: doc.id,
      orgId: org.id,
      vendorId: vendor.id,
      tierUsed: 1,
      exemplarIds: [],
      modelUsed: "gpt-4o",
      inngestIdempotencyKey: "idem-ro-dup",
    });

    await insertReviewOutcome({
      extractionLogId: log!.id,
      documentId: doc.id,
      orgId: org.id,
      userCorrected: false,
      correctionCount: 0,
      reviewedByUserId: "user_abc123",
    });

    const updated = await insertReviewOutcome({
        extractionLogId: log!.id,
        documentId: doc.id,
        orgId: org.id,
        userCorrected: true,
        correctionCount: 2,
        reviewedByUserId: "user_xyz456",
      });

    expect(updated.extractionLogId).toBe(log!.id);
    expect(updated.userCorrected).toBe(true);
    expect(updated.correctionCount).toBe(2);
    expect(updated.reviewedByUserId).toBe("user_xyz456");
  });

  it("getReviewOutcomeByDocument returns outcome", async () => {
    const log = await insertExtractionLog({
      documentId: doc.id,
      orgId: org.id,
      vendorId: vendor.id,
      tierUsed: 1,
      exemplarIds: [],
      modelUsed: "gpt-4o",
      inngestIdempotencyKey: "idem-ro-bydoc",
    });

    await insertReviewOutcome({
      extractionLogId: log!.id,
      documentId: doc.id,
      orgId: org.id,
      userCorrected: false,
      correctionCount: 0,
      reviewedByUserId: "user_abc123",
    });

    const result = await getReviewOutcomeByDocument(org.id, doc.id);
    expect(result).not.toBeNull();
    expect(result!.documentId).toBe(doc.id);
    expect(result!.userCorrected).toBe(false);
  });

  it("getReviewOutcomeByLog returns outcome", async () => {
    const log = await insertExtractionLog({
      documentId: doc.id,
      orgId: org.id,
      vendorId: vendor.id,
      tierUsed: 1,
      exemplarIds: [],
      modelUsed: "gpt-4o",
      inngestIdempotencyKey: "idem-ro-bylog",
    });

    await insertReviewOutcome({
      extractionLogId: log!.id,
      documentId: doc.id,
      orgId: org.id,
      userCorrected: true,
      correctionCount: 5,
      reviewedByUserId: "user_abc123",
    });

    const result = await getReviewOutcomeByLog(org.id, log!.id);
    expect(result).not.toBeNull();
    expect(result!.extractionLogId).toBe(log!.id);
    expect(result!.correctionCount).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// Org Isolation
// ---------------------------------------------------------------------------

describe("org isolation", () => {
  let orgB: Awaited<ReturnType<typeof createTestOrg>>;

  beforeEach(async () => {
    // orgB is created after the main beforeEach creates orgA data.
    // Need a unique taxId to avoid collisions with org A.
    const [ob] = await testDb
      .insert(schema.organizations)
      .values({ name: "Org B - Beta Co", taxId: "9999999999999" })
      .returning();
    orgB = ob;
  });

  it("extraction logs are isolated by org", async () => {
    const log = await insertExtractionLog({
      documentId: doc.id,
      orgId: org.id,
      vendorId: vendor.id,
      tierUsed: 1,
      exemplarIds: [],
      modelUsed: "gpt-4o",
      inngestIdempotencyKey: "idem-iso-log",
    });
    expect(log).not.toBeNull();

    // Org B cannot see Org A's extraction log
    const latestForB = await getLatestExtractionLog(orgB.id, doc.id);
    expect(latestForB).toBeNull();

    const recentForB = await getRecentExtractionLogs(orgB.id, vendor.id);
    expect(recentForB).toHaveLength(0);
  });

  it("review outcomes are isolated by org", async () => {
    const log = await insertExtractionLog({
      documentId: doc.id,
      orgId: org.id,
      vendorId: vendor.id,
      tierUsed: 1,
      exemplarIds: [],
      modelUsed: "gpt-4o",
      inngestIdempotencyKey: "idem-iso-ro",
    });

    await insertReviewOutcome({
      extractionLogId: log!.id,
      documentId: doc.id,
      orgId: org.id,
      userCorrected: true,
      correctionCount: 2,
      reviewedByUserId: "user_abc123",
    });

    // Org B cannot see Org A's review outcome
    const byDocForB = await getReviewOutcomeByDocument(orgB.id, doc.id);
    expect(byDocForB).toBeNull();

    const byLogForB = await getReviewOutcomeByLog(orgB.id, log!.id);
    expect(byLogForB).toBeNull();
  });
});
