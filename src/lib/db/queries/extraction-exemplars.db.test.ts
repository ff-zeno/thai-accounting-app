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
 * INTEGRATION TESTS -- Extraction Exemplars
 * ==========================================
 *
 * Validates the extraction exemplar query layer:
 *   - upsertExemplar (insert + ON CONFLICT update)
 *   - getTopExemplars (corrected-only, per-field limit)
 *   - getExemplarsByDocument (all fields for a doc)
 *   - Org isolation across all query functions
 *
 * Requires Docker Postgres running:
 *   docker compose -f docker-compose.test.yml up -d
 */

const { db: testDb, pool } = createTestDb();

// Mock the db module so all query functions use our test database
vi.mock("@/lib/db/index", () => ({
  db: testDb,
}));

// Mock audit-log to prevent it from interfering
vi.mock("@/lib/db/helpers/audit-log", () => ({
  auditMutation: vi.fn(),
}));

// Import AFTER mock
const { upsertExemplar, getTopExemplars, getExemplarsByDocument } =
  await import("@/lib/db/queries/extraction-exemplars");

// Shared test data populated in beforeEach
let orgA: { id: string };
let orgB: { id: string };
let vendorA: { id: string };
let vendorB: { id: string };
let docA: { id: string };
let docB: { id: string };

beforeAll(async () => {
  await resetTestDb(pool);
  await migrateTestDb(pool);
});

afterAll(async () => {
  await resetTestDb(pool);
  await pool.end();
});

beforeEach(async () => {
  // Clean in FK order
  await testDb.delete(schema.extractionExemplars);
  await testDb.delete(schema.documents);
  await testDb.delete(schema.vendors);
  await testDb.delete(schema.organizations);

  // Fresh fixtures
  orgA = await createTestOrg(testDb);
  orgB = await createTestOrg(testDb);
  vendorA = await createTestVendor(testDb, orgA.id, { taxId: "1111111111111", name: "Vendor A" });
  vendorB = await createTestVendor(testDb, orgB.id, { taxId: "2222222222222", name: "Vendor B" });
  docA = await createTestDocument(testDb, orgA.id, vendorA.id);
  docB = await createTestDocument(testDb, orgB.id, vendorB.id);
});

// ---------------------------------------------------------------------------
// upsertExemplar
// ---------------------------------------------------------------------------

describe("upsertExemplar", () => {
  it("inserts a new exemplar and returns its ID", async () => {
    const result = await upsertExemplar({
      orgId: orgA.id,
      vendorId: vendorA.id,
      fieldName: "total_amount",
      fieldCriticality: "high",
      aiValue: "1000.00",
      userValue: "1200.00",
      wasCorrected: true,
      documentId: docA.id,
    });

    expect(result.id).toBeTruthy();
  });

  it("ON CONFLICT updates userValue and returns the same ID", async () => {
    // First insert
    const first = await upsertExemplar({
      orgId: orgA.id,
      vendorId: vendorA.id,
      fieldName: "vendor_name",
      fieldCriticality: "medium",
      aiValue: "Acme Ltd",
      userValue: "Acme Co Ltd",
      wasCorrected: true,
      documentId: docA.id,
    });

    // Second upsert — same composite key, different userValue
    const second = await upsertExemplar({
      orgId: orgA.id,
      vendorId: vendorA.id,
      fieldName: "vendor_name",
      fieldCriticality: "medium",
      aiValue: "Acme Ltd",
      userValue: "Acme Corporation Ltd",
      wasCorrected: true,
      documentId: docA.id,
    });

    expect(second.id).toBe(first.id);

    // Confirm the value was actually updated
    const rows = await getExemplarsByDocument(orgA.id, docA.id);
    const vendorNameRow = rows.find((r) => r.fieldName === "vendor_name");
    expect(vendorNameRow).toBeDefined();
    expect(vendorNameRow!.userValue).toBe("Acme Corporation Ltd");
  });
});

// ---------------------------------------------------------------------------
// getTopExemplars
// ---------------------------------------------------------------------------

describe("getTopExemplars", () => {
  it("returns only corrected exemplars", async () => {
    const doc2 = await createTestDocument(testDb, orgA.id, vendorA.id);

    // Corrected: aiValue differs from userValue
    await upsertExemplar({
      orgId: orgA.id,
      vendorId: vendorA.id,
      fieldName: "total_amount",
      fieldCriticality: "high",
      aiValue: "1000.00",
      userValue: "1200.00",
      wasCorrected: true,
      documentId: docA.id,
    });

    // Not corrected: aiValue equals userValue
    await upsertExemplar({
      orgId: orgA.id,
      vendorId: vendorA.id,
      fieldName: "total_amount",
      fieldCriticality: "high",
      aiValue: "5000.00",
      userValue: "5000.00",
      wasCorrected: false,
      documentId: doc2.id,
    });

    const results = await getTopExemplars(orgA.id, vendorA.id);
    expect(results).toHaveLength(1);
    expect(results[0].wasCorrected).toBe(true);
    expect(results[0].userValue).toBe("1200.00");
  });

  it("respects per-field limit", async () => {
    // Create 5 documents with corrected exemplars for the same field
    const docs = [];
    for (let i = 0; i < 5; i++) {
      docs.push(await createTestDocument(testDb, orgA.id, vendorA.id));
    }

    for (let i = 0; i < 5; i++) {
      await upsertExemplar({
        orgId: orgA.id,
        vendorId: vendorA.id,
        fieldName: "total_amount",
        fieldCriticality: "high",
        aiValue: `${1000 + i}.00`,
        userValue: `${2000 + i}.00`,
        wasCorrected: true,
        documentId: docs[i].id,
      });
    }

    const results = await getTopExemplars(orgA.id, vendorA.id, 2);
    expect(results).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// getExemplarsByDocument
// ---------------------------------------------------------------------------

describe("getExemplarsByDocument", () => {
  it("returns all fields for a document", async () => {
    const fields = ["vendor_name", "total_amount", "issue_date"];

    for (const fieldName of fields) {
      // vendor_name: corrected (different values)
      // total_amount: corrected (different values)
      // issue_date: not corrected (same values)
      const isCorrected = fieldName !== "issue_date";
      await upsertExemplar({
        orgId: orgA.id,
        vendorId: vendorA.id,
        fieldName,
        fieldCriticality: "medium",
        aiValue: isCorrected ? `ai-${fieldName}` : `same-${fieldName}`,
        userValue: isCorrected ? `user-${fieldName}` : `same-${fieldName}`,
        wasCorrected: isCorrected,
        documentId: docA.id,
      });
    }

    const results = await getExemplarsByDocument(orgA.id, docA.id);
    expect(results).toHaveLength(3);

    // Results are ordered by fieldName
    const returnedFields = results.map((r) => r.fieldName);
    expect(returnedFields).toEqual(["issue_date", "total_amount", "vendor_name"]);
  });
});

// ---------------------------------------------------------------------------
// Org isolation
// ---------------------------------------------------------------------------

describe("org isolation", () => {
  it("Org B cannot see Org A exemplars via any query function", async () => {
    // Insert exemplar for Org A
    await upsertExemplar({
      orgId: orgA.id,
      vendorId: vendorA.id,
      fieldName: "total_amount",
      fieldCriticality: "high",
      aiValue: "1000.00",
      userValue: "1200.00",
      wasCorrected: true,
      documentId: docA.id,
    });

    // Org B queries should return nothing
    const topExemplars = await getTopExemplars(orgB.id, vendorA.id);
    expect(topExemplars).toHaveLength(0);

    const byDocument = await getExemplarsByDocument(orgB.id, docA.id);
    expect(byDocument).toHaveLength(0);
  });
});
