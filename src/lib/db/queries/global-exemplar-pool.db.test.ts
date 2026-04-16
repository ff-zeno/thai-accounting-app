import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import {
  createTestDb,
  migrateTestDb,
  resetTestDb,
} from "@/tests/db-test-utils";
import * as schema from "@/lib/db/schema";
import { createHash } from "crypto";

/*
 * INTEGRATION TESTS -- Global Exemplar Pool
 * ==========================================
 *
 * Validates the global exemplar pool query layer:
 *   - promoteToGlobalPool (insert + ON CONFLICT update)
 *   - getGlobalExemplars (Tier 2 read query)
 *   - retireGlobalExemplar (by vendor+field)
 *   - retireGlobalExemplarById (by ID)
 *   - getGlobalPoolStats (aggregate counts)
 *   - Unique constraint: one active entry per vendor+field
 *
 * Requires Docker Postgres running:
 *   docker compose -f docker-compose.test.yml up -d
 */

const { db: testDb, pool } = createTestDb();

vi.mock("@/lib/db/index", () => ({
  db: testDb,
}));

const {
  getGlobalExemplars,
  promoteToGlobalPool,
  retireGlobalExemplar,
  retireGlobalExemplarById,
  getGlobalPoolStats,
} = await import("@/lib/db/queries/global-exemplar-pool");

const { upsertConsensusEntry } = await import(
  "@/lib/db/queries/exemplar-consensus"
);

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

let consensusId1: string;
let consensusId2: string;

beforeAll(async () => {
  await resetTestDb(pool);
  await migrateTestDb(pool);
});

afterAll(async () => {
  await resetTestDb(pool);
  await pool.end();
});

beforeEach(async () => {
  await testDb.delete(schema.globalExemplarPool);
  await testDb.delete(schema.exemplarConsensus);

  // Create consensus entries that pool entries will reference
  const c1 = await upsertConsensusEntry({
    vendorKey: "1111111111111",
    fieldName: "totalAmount",
    normalizedValue: "1000.00",
    normalizedValueHash: hash("1000.00"),
    fieldCriticality: "high",
    weightedOrgCount: "5.0000",
    agreeingOrgCount: 5,
    contradictingCount: 0,
  });
  consensusId1 = c1.id;

  const c2 = await upsertConsensusEntry({
    vendorKey: "1111111111111",
    fieldName: "documentNumber",
    normalizedValue: "INV-001",
    normalizedValueHash: hash("INV-001"),
    fieldCriticality: "high",
    weightedOrgCount: "5.0000",
    agreeingOrgCount: 5,
    contradictingCount: 0,
  });
  consensusId2 = c2.id;
});

// ---------------------------------------------------------------------------
// promoteToGlobalPool
// ---------------------------------------------------------------------------

describe("promoteToGlobalPool", () => {
  it("creates a new pool entry", async () => {
    const result = await promoteToGlobalPool({
      vendorKey: "1111111111111",
      fieldName: "totalAmount",
      canonicalValue: "1000.00",
      fieldCriticality: "high",
      consensusId: consensusId1,
    });

    expect(result.id).toBeTruthy();
  });

  it("updates existing active entry on conflict (same vendor+field)", async () => {
    const first = await promoteToGlobalPool({
      vendorKey: "1111111111111",
      fieldName: "totalAmount",
      canonicalValue: "1000.00",
      fieldCriticality: "high",
      consensusId: consensusId1,
    });

    const second = await promoteToGlobalPool({
      vendorKey: "1111111111111",
      fieldName: "totalAmount",
      canonicalValue: "1500.00",
      fieldCriticality: "high",
      consensusId: consensusId1,
    });

    expect(second.id).toBe(first.id);

    const exemplars = await getGlobalExemplars("1111111111111");
    const totalAmountEntry = exemplars.find(
      (e) => e.fieldName === "totalAmount"
    );
    expect(totalAmountEntry!.canonicalValue).toBe("1500.00");
  });

  it("allows separate entries for different fields", async () => {
    await promoteToGlobalPool({
      vendorKey: "1111111111111",
      fieldName: "totalAmount",
      canonicalValue: "1000.00",
      fieldCriticality: "high",
      consensusId: consensusId1,
    });

    await promoteToGlobalPool({
      vendorKey: "1111111111111",
      fieldName: "documentNumber",
      canonicalValue: "INV-001",
      fieldCriticality: "high",
      consensusId: consensusId2,
    });

    const exemplars = await getGlobalExemplars("1111111111111");
    expect(exemplars).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// getGlobalExemplars
// ---------------------------------------------------------------------------

describe("getGlobalExemplars", () => {
  it("returns empty array for unknown vendor", async () => {
    const exemplars = await getGlobalExemplars("9999999999999");
    expect(exemplars).toEqual([]);
  });

  it("returns only active (non-retired) entries", async () => {
    await promoteToGlobalPool({
      vendorKey: "1111111111111",
      fieldName: "totalAmount",
      canonicalValue: "1000.00",
      fieldCriticality: "high",
      consensusId: consensusId1,
    });

    await promoteToGlobalPool({
      vendorKey: "1111111111111",
      fieldName: "documentNumber",
      canonicalValue: "INV-001",
      fieldCriticality: "high",
      consensusId: consensusId2,
    });

    // Retire one
    await retireGlobalExemplar("1111111111111", "totalAmount");

    const exemplars = await getGlobalExemplars("1111111111111");
    expect(exemplars).toHaveLength(1);
    expect(exemplars[0].fieldName).toBe("documentNumber");
  });
});

// ---------------------------------------------------------------------------
// Retire
// ---------------------------------------------------------------------------

describe("retireGlobalExemplar", () => {
  it("retires by vendor+field", async () => {
    await promoteToGlobalPool({
      vendorKey: "1111111111111",
      fieldName: "totalAmount",
      canonicalValue: "1000.00",
      fieldCriticality: "high",
      consensusId: consensusId1,
    });

    await retireGlobalExemplar("1111111111111", "totalAmount");

    const exemplars = await getGlobalExemplars("1111111111111");
    expect(exemplars).toHaveLength(0);
  });

  it("is idempotent — no error if already retired", async () => {
    await promoteToGlobalPool({
      vendorKey: "1111111111111",
      fieldName: "totalAmount",
      canonicalValue: "1000.00",
      fieldCriticality: "high",
      consensusId: consensusId1,
    });

    await retireGlobalExemplar("1111111111111", "totalAmount");
    // Should not throw
    await retireGlobalExemplar("1111111111111", "totalAmount");
  });
});

describe("retireGlobalExemplarById", () => {
  it("retires a specific entry by ID", async () => {
    const { id } = await promoteToGlobalPool({
      vendorKey: "1111111111111",
      fieldName: "totalAmount",
      canonicalValue: "1000.00",
      fieldCriticality: "high",
      consensusId: consensusId1,
    });

    await retireGlobalExemplarById(id);

    const exemplars = await getGlobalExemplars("1111111111111");
    expect(exemplars).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Lifecycle: retire + re-promote
// ---------------------------------------------------------------------------

describe("retire then re-promote lifecycle", () => {
  it("allows re-promotion after retirement", async () => {
    await promoteToGlobalPool({
      vendorKey: "1111111111111",
      fieldName: "totalAmount",
      canonicalValue: "1000.00",
      fieldCriticality: "high",
      consensusId: consensusId1,
    });

    await retireGlobalExemplar("1111111111111", "totalAmount");

    // Re-promote with new value
    const { id } = await promoteToGlobalPool({
      vendorKey: "1111111111111",
      fieldName: "totalAmount",
      canonicalValue: "1500.00",
      fieldCriticality: "high",
      consensusId: consensusId1,
    });

    const exemplars = await getGlobalExemplars("1111111111111");
    expect(exemplars).toHaveLength(1);
    expect(exemplars[0].id).toBe(id);
    expect(exemplars[0].canonicalValue).toBe("1500.00");
  });
});

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

describe("getGlobalPoolStats", () => {
  it("returns zero counts when empty", async () => {
    const stats = await getGlobalPoolStats();
    expect(stats.active).toBe(0);
    expect(stats.retired).toBe(0);
  });

  it("counts active and retired entries", async () => {
    await promoteToGlobalPool({
      vendorKey: "1111111111111",
      fieldName: "totalAmount",
      canonicalValue: "1000.00",
      fieldCriticality: "high",
      consensusId: consensusId1,
    });

    await promoteToGlobalPool({
      vendorKey: "1111111111111",
      fieldName: "documentNumber",
      canonicalValue: "INV-001",
      fieldCriticality: "high",
      consensusId: consensusId2,
    });

    await retireGlobalExemplar("1111111111111", "totalAmount");

    const stats = await getGlobalPoolStats();
    expect(stats.active).toBe(1);
    expect(stats.retired).toBe(1);
  });
});
