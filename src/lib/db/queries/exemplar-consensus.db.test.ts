import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import {
  createTestDb,
  migrateTestDb,
  resetTestDb,
} from "@/tests/db-test-utils";
import * as schema from "@/lib/db/schema";
import { createHash } from "crypto";

/*
 * INTEGRATION TESTS -- Exemplar Consensus
 * =========================================
 *
 * Validates the consensus query layer:
 *   - upsertConsensusEntry (insert + ON CONFLICT update)
 *   - getConsensusForVendor (per-vendor lookup)
 *   - getPromotionCandidates (candidate status filter)
 *   - markPromoted / markRetired (status transitions)
 *   - getConsensusStats (aggregate counts)
 *
 * Requires Docker Postgres running:
 *   docker compose -f docker-compose.test.yml up -d
 */

const { db: testDb, pool } = createTestDb();

vi.mock("@/lib/db/index", () => ({
  db: testDb,
}));

const {
  upsertConsensusEntry,
  getConsensusForVendor,
  getPromotionCandidates,
  markPromoted,
  markRetired,
  getConsensusStats,
} = await import("@/lib/db/queries/exemplar-consensus");

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
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
  await testDb.delete(schema.exemplarConsensus);
});

// ---------------------------------------------------------------------------
// upsertConsensusEntry
// ---------------------------------------------------------------------------

describe("upsertConsensusEntry", () => {
  it("inserts a new consensus entry", async () => {
    const result = await upsertConsensusEntry({
      vendorKey: "1234567890123",
      fieldName: "totalAmount",
      normalizedValue: "1000.00",
      normalizedValueHash: hash("1000.00"),
      fieldCriticality: "high",
      weightedOrgCount: "2.5000",
      agreeingOrgCount: 2,
      contradictingCount: 0,
    });

    expect(result.id).toBeTruthy();
  });

  it("updates counts on conflict (same vendor+field+hash)", async () => {
    const input = {
      vendorKey: "1234567890123",
      fieldName: "totalAmount",
      normalizedValue: "1000.00",
      normalizedValueHash: hash("1000.00"),
      fieldCriticality: "high" as const,
      weightedOrgCount: "2.5000",
      agreeingOrgCount: 2,
      contradictingCount: 0,
    };

    const first = await upsertConsensusEntry(input);
    const second = await upsertConsensusEntry({
      ...input,
      weightedOrgCount: "5.0000",
      agreeingOrgCount: 4,
    });

    // Same row updated
    expect(second.id).toBe(first.id);

    // Verify updated values
    const rows = await getConsensusForVendor("1234567890123", "totalAmount");
    expect(rows).toHaveLength(1);
    expect(rows[0].agreeingOrgCount).toBe(4);
    expect(rows[0].weightedOrgCount).toBe("5.0000");
  });

  it("creates separate entries for different values", async () => {
    await upsertConsensusEntry({
      vendorKey: "1234567890123",
      fieldName: "totalAmount",
      normalizedValue: "1000.00",
      normalizedValueHash: hash("1000.00"),
      fieldCriticality: "high",
      weightedOrgCount: "2.0000",
      agreeingOrgCount: 2,
      contradictingCount: 0,
    });

    await upsertConsensusEntry({
      vendorKey: "1234567890123",
      fieldName: "totalAmount",
      normalizedValue: "2000.00",
      normalizedValueHash: hash("2000.00"),
      fieldCriticality: "high",
      weightedOrgCount: "1.0000",
      agreeingOrgCount: 1,
      contradictingCount: 0,
    });

    const rows = await getConsensusForVendor("1234567890123", "totalAmount");
    expect(rows).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// getConsensusForVendor
// ---------------------------------------------------------------------------

describe("getConsensusForVendor", () => {
  it("returns empty array for unknown vendor", async () => {
    const rows = await getConsensusForVendor("9999999999999", "totalAmount");
    expect(rows).toEqual([]);
  });

  it("filters by vendor and field name", async () => {
    await upsertConsensusEntry({
      vendorKey: "1111111111111",
      fieldName: "totalAmount",
      normalizedValue: "100.00",
      normalizedValueHash: hash("100.00"),
      fieldCriticality: "high",
      weightedOrgCount: "1.0000",
      agreeingOrgCount: 1,
      contradictingCount: 0,
    });

    await upsertConsensusEntry({
      vendorKey: "1111111111111",
      fieldName: "documentNumber",
      normalizedValue: "INV-001",
      normalizedValueHash: hash("INV-001"),
      fieldCriticality: "high",
      weightedOrgCount: "1.0000",
      agreeingOrgCount: 1,
      contradictingCount: 0,
    });

    const rows = await getConsensusForVendor("1111111111111", "totalAmount");
    expect(rows).toHaveLength(1);
    expect(rows[0].normalizedValue).toBe("100.00");
  });
});

// ---------------------------------------------------------------------------
// Promotion candidates + status transitions
// ---------------------------------------------------------------------------

describe("getPromotionCandidates", () => {
  it("returns only candidate entries", async () => {
    const entry = await upsertConsensusEntry({
      vendorKey: "1111111111111",
      fieldName: "totalAmount",
      normalizedValue: "100.00",
      normalizedValueHash: hash("100.00"),
      fieldCriticality: "high",
      weightedOrgCount: "5.0000",
      agreeingOrgCount: 5,
      contradictingCount: 0,
    });

    const candidates = await getPromotionCandidates();
    expect(candidates).toHaveLength(1);
    expect(candidates[0].id).toBe(entry.id);

    // After promotion, should not appear
    await markPromoted(entry.id);
    const afterPromotion = await getPromotionCandidates();
    expect(afterPromotion).toHaveLength(0);
  });
});

describe("markPromoted", () => {
  it("sets status to promoted and records timestamp", async () => {
    const entry = await upsertConsensusEntry({
      vendorKey: "1111111111111",
      fieldName: "totalAmount",
      normalizedValue: "100.00",
      normalizedValueHash: hash("100.00"),
      fieldCriticality: "high",
      weightedOrgCount: "5.0000",
      agreeingOrgCount: 5,
      contradictingCount: 0,
    });

    await markPromoted(entry.id);

    const rows = await getConsensusForVendor("1111111111111", "totalAmount");
    expect(rows[0].status).toBe("promoted");
    expect(rows[0].promotedAt).not.toBeNull();
  });
});

describe("markRetired", () => {
  it("sets status to retired and records timestamp", async () => {
    const entry = await upsertConsensusEntry({
      vendorKey: "1111111111111",
      fieldName: "totalAmount",
      normalizedValue: "100.00",
      normalizedValueHash: hash("100.00"),
      fieldCriticality: "high",
      weightedOrgCount: "1.0000",
      agreeingOrgCount: 1,
      contradictingCount: 5,
    });

    await markRetired(entry.id);

    const rows = await getConsensusForVendor("1111111111111", "totalAmount");
    expect(rows[0].status).toBe("retired");
    expect(rows[0].retiredAt).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

describe("getConsensusStats", () => {
  it("returns zero counts when empty", async () => {
    const stats = await getConsensusStats();
    expect(stats.total).toBe(0);
    expect(stats.candidates).toBe(0);
    expect(stats.promoted).toBe(0);
    expect(stats.retired).toBe(0);
  });

  it("counts by status", async () => {
    const e1 = await upsertConsensusEntry({
      vendorKey: "1111111111111",
      fieldName: "f1",
      normalizedValue: "v1",
      normalizedValueHash: hash("v1"),
      fieldCriticality: "low",
      weightedOrgCount: "1.0000",
      agreeingOrgCount: 1,
      contradictingCount: 0,
    });

    const e2 = await upsertConsensusEntry({
      vendorKey: "2222222222222",
      fieldName: "f2",
      normalizedValue: "v2",
      normalizedValueHash: hash("v2"),
      fieldCriticality: "medium",
      weightedOrgCount: "3.0000",
      agreeingOrgCount: 3,
      contradictingCount: 0,
    });

    await markPromoted(e1.id);
    await markRetired(e2.id);

    // Add one more candidate
    await upsertConsensusEntry({
      vendorKey: "3333333333333",
      fieldName: "f3",
      normalizedValue: "v3",
      normalizedValueHash: hash("v3"),
      fieldCriticality: "high",
      weightedOrgCount: "2.0000",
      agreeingOrgCount: 2,
      contradictingCount: 0,
    });

    const stats = await getConsensusStats();
    expect(stats.total).toBe(3);
    expect(stats.candidates).toBe(1);
    expect(stats.promoted).toBe(1);
    expect(stats.retired).toBe(1);
  });
});
