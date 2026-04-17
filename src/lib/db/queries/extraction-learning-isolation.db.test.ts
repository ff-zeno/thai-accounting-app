import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
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
 * INTEGRATION TESTS -- Phase 8 Extraction Learning Tenant Isolation
 * ==================================================================
 *
 * Validates that ALL Phase 8 extraction learning tables properly scope
 * results by org_id. Two orgs share a vendor with the same tax ID
 * (realistic scenario), yet data written for Org A must be completely
 * invisible to Org B.
 *
 * Tables under test:
 *   - extraction_exemplars
 *   - vendor_tier
 *   - extraction_log
 *   - extraction_review_outcome
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

// Import all Phase 8 query functions AFTER mock
const { upsertExemplar, getTopExemplars, getExemplarsByDocument } =
  await import("@/lib/db/queries/extraction-exemplars");
const { getVendorTier, upsertVendorTier, promoteVendorTier } =
  await import("@/lib/db/queries/vendor-tier");
const { insertExtractionLog, getLatestExtractionLog, getRecentExtractionLogs } =
  await import("@/lib/db/queries/extraction-log");
const { insertReviewOutcome, getReviewOutcomeByDocument, getReviewOutcomeByLog } =
  await import("@/lib/db/queries/extraction-review-outcome");

beforeAll(async () => {
  await resetTestDb(pool);
  await migrateTestDb(pool);
});

afterAll(async () => {
  await resetTestDb(pool);
  await pool.end();
});

beforeEach(async () => {
  // Clean data between tests in FK-safe order
  await testDb.delete(schema.extractionReviewOutcome);
  await testDb.delete(schema.extractionLog);
  await testDb.delete(schema.extractionExemplars);
  await testDb.delete(schema.vendorTier);
  await testDb.delete(schema.documents);
  await testDb.delete(schema.vendors);
  await testDb.delete(schema.organizations);
});

// ---------------------------------------------------------------------------
// Multi-tenant isolation for all Phase 8 extraction learning tables
// ---------------------------------------------------------------------------

describe("extraction learning multi-tenant isolation", () => {
  it("Org B cannot see any extraction learning data belonging to Org A, even with shared vendor tax ID", async () => {
    // -----------------------------------------------------------------------
    // 1. Create two orgs
    // -----------------------------------------------------------------------
    const orgA = await createTestOrg(testDb);
    const orgB = await createTestOrg(testDb);

    // -----------------------------------------------------------------------
    // 2. Create vendors with the SAME tax ID in both orgs
    //    (simulates real-world scenario: two orgs both work with the same supplier)
    // -----------------------------------------------------------------------
    const vendorA = await createTestVendor(testDb, orgA.id, {
      taxId: "9999999999999",
      name: "Shared Supplier (Org A)",
    });
    const vendorB = await createTestVendor(testDb, orgB.id, {
      taxId: "9999999999999",
      name: "Shared Supplier (Org B)",
    });

    // -----------------------------------------------------------------------
    // 3. Create a document for Org A's vendor
    // -----------------------------------------------------------------------
    const docA = await createTestDocument(testDb, orgA.id, vendorA.id);

    // -----------------------------------------------------------------------
    // 4. Write extraction exemplar for Org A
    // -----------------------------------------------------------------------
    const exemplarResult = await upsertExemplar({
      orgId: orgA.id,
      vendorId: vendorA.id,
      documentId: docA.id,
      fieldName: "totalAmount",
      fieldCriticality: "high",
      aiValue: "100.00",
      userValue: "1000.00",
      wasCorrected: true,
      modelUsed: "gpt-4o",
    });
    expect(exemplarResult.id).toBeDefined();

    // -----------------------------------------------------------------------
    // 5. Write and promote vendor tier for Org A
    // -----------------------------------------------------------------------
    await upsertVendorTier(orgA.id, vendorA.id);
    const promotedTier = await promoteVendorTier(orgA.id, vendorA.id, 1);
    expect(promotedTier.tier).toBe(1);

    // -----------------------------------------------------------------------
    // 6. Insert extraction log for Org A's document
    // -----------------------------------------------------------------------
    const logResult = await insertExtractionLog({
      documentId: docA.id,
      orgId: orgA.id,
      vendorId: vendorA.id,
      tierUsed: 1,
      exemplarIds: [exemplarResult.id],
      modelUsed: "gpt-4o",
      inngestIdempotencyKey: "test-key-isolation-1",
    });
    expect(logResult).not.toBeNull();

    // -----------------------------------------------------------------------
    // 7. Insert review outcome for Org A's extraction log
    // -----------------------------------------------------------------------
    const reviewResult = await insertReviewOutcome({
      extractionLogId: logResult!.id,
      documentId: docA.id,
      orgId: orgA.id,
      userCorrected: true,
      correctionCount: 1,
      reviewedByUserId: "user_test123",
    });
    expect(reviewResult.id).toBeDefined();

    // =======================================================================
    // ISOLATION: Query with Org B -- everything must be empty/null
    // =======================================================================

    // 8. Org B's vendor has no exemplars
    const orgBExemplars = await getTopExemplars(orgB.id, vendorB.id);
    expect(orgBExemplars).toHaveLength(0);

    // 9. Org B cannot see Org A's document exemplars
    const orgBDocExemplars = await getExemplarsByDocument(orgB.id, docA.id);
    expect(orgBDocExemplars).toHaveLength(0);

    // 10. Org B's vendor was never tier-upserted
    const orgBVendorTier = await getVendorTier(orgB.id, vendorB.id);
    expect(orgBVendorTier).toBeNull();

    // 11. Even passing Org A's vendor ID with Org B's org ID returns null
    const orgBWithVendorA = await getVendorTier(orgB.id, vendorA.id);
    expect(orgBWithVendorA).toBeNull();

    // 12. Org B cannot see Org A's extraction log by document
    const orgBLog = await getLatestExtractionLog(orgB.id, docA.id);
    expect(orgBLog).toBeNull();

    // 13. Org B cannot see Org A's extraction logs by vendor
    const orgBLogs = await getRecentExtractionLogs(orgB.id, vendorB.id);
    expect(orgBLogs).toHaveLength(0);

    // 14. Org B cannot see Org A's review outcome by document
    const orgBReview = await getReviewOutcomeByDocument(orgB.id, docA.id);
    expect(orgBReview).toBeNull();

    // 15. Org B cannot see Org A's review outcome by log ID
    const orgBReviewByLog = await getReviewOutcomeByLog(orgB.id, logResult!.id);
    expect(orgBReviewByLog).toBeNull();

    // =======================================================================
    // SANITY: Org A can still see all its own data
    // =======================================================================

    // 16. Org A sees its exemplar
    const orgAExemplars = await getTopExemplars(orgA.id, vendorA.id);
    expect(orgAExemplars).toHaveLength(1);
    expect(orgAExemplars[0].fieldName).toBe("totalAmount");
    expect(orgAExemplars[0].userValue).toBe("1000.00");

    // 17. Org A sees its vendor tier at tier 1
    const orgATier = await getVendorTier(orgA.id, vendorA.id);
    expect(orgATier).not.toBeNull();
    expect(orgATier!.tier).toBe(1);

    // 18. Org A sees its extraction log
    const orgALog = await getLatestExtractionLog(orgA.id, docA.id);
    expect(orgALog).not.toBeNull();
    expect(orgALog!.modelUsed).toBe("gpt-4o");
    expect(orgALog!.tierUsed).toBe(1);

    // 19. Org A sees its review outcome
    const orgAReview = await getReviewOutcomeByDocument(orgA.id, docA.id);
    expect(orgAReview).not.toBeNull();
    expect(orgAReview!.userCorrected).toBe(true);
    expect(orgAReview!.correctionCount).toBe(1);
  });
});
