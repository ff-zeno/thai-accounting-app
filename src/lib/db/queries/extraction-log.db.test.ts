import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  vi,
} from "vitest";
import { eq } from "drizzle-orm";
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
 * INTEGRATION TESTS -- Extraction Log
 * ===================================
 *
 * Validates the per-extraction audit row: insert, idempotency on the Inngest
 * key, and org scoping.
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
const { insertExtractionLog } = await import("@/lib/db/queries/extraction-log");

// Test data populated in beforeEach
let org: Awaited<ReturnType<typeof createTestOrg>>;
let vendor: Awaited<ReturnType<typeof createTestVendor>>;
let doc: Awaited<ReturnType<typeof createTestDocument>>;

async function logsForOrg(orgId: string) {
  return testDb
    .select()
    .from(schema.extractionLog)
    .where(eq(schema.extractionLog.orgId, orgId));
}

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
  await testDb.delete(schema.exceptionQueue);
  await testDb.delete(schema.extractionLog);
  await testDb.delete(schema.documents);
  await testDb.delete(schema.vendors);
  await testDb.delete(schema.organizations);

  // Create fresh test data
  org = await createTestOrg(testDb);
  vendor = await createTestVendor(testDb, org.id);
  doc = await createTestDocument(testDb, org.id, vendor.id);
});

describe("extraction log", () => {
  it("insertExtractionLog creates a log entry", async () => {
    const result = await insertExtractionLog({
      documentId: doc.id,
      orgId: org.id,
      vendorId: vendor.id,
      modelUsed: "gpt-4o",
      inputTokens: 500,
      outputTokens: 200,
      costUsd: "0.01200000",
      latencyMs: 1500,
      inngestIdempotencyKey: "idem-001",
    });

    expect(result).not.toBeNull();
    expect(result!.id).toBeTruthy();

    const [readBack] = await logsForOrg(org.id);
    expect(readBack.documentId).toBe(doc.id);
    expect(readBack.vendorId).toBe(vendor.id);
    expect(readBack.modelUsed).toBe("gpt-4o");
    expect(readBack.inputTokens).toBe(500);
    expect(readBack.outputTokens).toBe(200);
    expect(readBack.latencyMs).toBe(1500);
    expect(readBack.inngestIdempotencyKey).toBe("idem-001");
  });

  it("insertExtractionLog is idempotent on inngestIdempotencyKey", async () => {
    const first = await insertExtractionLog({
      documentId: doc.id,
      orgId: org.id,
      vendorId: vendor.id,
      modelUsed: "gpt-4o",
      inngestIdempotencyKey: "idem-dup",
    });
    expect(first).not.toBeNull();

    // Second insert with same key returns null (ON CONFLICT DO NOTHING)
    const second = await insertExtractionLog({
      documentId: doc.id,
      orgId: org.id,
      vendorId: vendor.id,
      modelUsed: "gpt-4o-mini",
      inngestIdempotencyKey: "idem-dup",
    });
    expect(second).toBeNull();

    // Only one row exists, and it is the first insert
    const logs = await logsForOrg(org.id);
    expect(logs).toHaveLength(1);
    expect(logs[0].modelUsed).toBe("gpt-4o");

    const [exception] = await testDb
      .select()
      .from(schema.exceptionQueue)
      .where(eq(schema.exceptionQueue.orgId, org.id));
    expect(exception.exceptionType).toBe("duplicate_extraction_log");
    expect(exception.entityId).toBe(doc.id);
  });
});

describe("org isolation", () => {
  it("extraction logs are isolated by org", async () => {
    const otherOrg = await createTestOrg(testDb);
    const otherVendor = await createTestVendor(testDb, otherOrg.id);
    const otherDoc = await createTestDocument(
      testDb,
      otherOrg.id,
      otherVendor.id
    );

    await insertExtractionLog({
      documentId: doc.id,
      orgId: org.id,
      vendorId: vendor.id,
      modelUsed: "gpt-4o",
      inngestIdempotencyKey: "idem-org-a",
    });
    await insertExtractionLog({
      documentId: otherDoc.id,
      orgId: otherOrg.id,
      vendorId: otherVendor.id,
      modelUsed: "gpt-4o",
      inngestIdempotencyKey: "idem-org-b",
    });

    const orgLogs = await logsForOrg(org.id);
    expect(orgLogs).toHaveLength(1);
    expect(orgLogs[0].documentId).toBe(doc.id);

    const otherLogs = await logsForOrg(otherOrg.id);
    expect(otherLogs).toHaveLength(1);
    expect(otherLogs[0].documentId).toBe(otherDoc.id);
  });
});
