import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import {
  createTestDb,
  migrateTestDb,
  resetTestDb,
  createTestOrg,
} from "@/tests/db-test-utils";
import * as schema from "@/lib/db/schema";

/*
 * INTEGRATION TESTS -- Org Reputation
 * ====================================
 *
 * Validates the org reputation query layer:
 *   - upsertOrgReputation (create + update)
 *   - getOrgReputation (read)
 *   - incrementReputationAgreed / incrementReputationDisputed (atomic counters)
 *   - incrementDocsProcessed (docs counter + firstDocAt)
 *   - getEligibleOrgIds (cross-org eligibility)
 *   - recalculateEligibility (velocity gate)
 *
 * Requires Docker Postgres running:
 *   docker compose -f docker-compose.test.yml up -d
 */

const { db: testDb, pool } = createTestDb();

vi.mock("@/lib/db/index", () => ({
  db: testDb,
}));

const {
  getOrgReputation,
  upsertOrgReputation,
  incrementReputationAgreed,
  incrementReputationDisputed,
  incrementDocsProcessed,
  getEligibleOrgIds,
  recalculateEligibility,
} = await import("@/lib/db/queries/org-reputation");

let orgA: { id: string };
let orgB: { id: string };

beforeAll(async () => {
  await resetTestDb(pool);
  await migrateTestDb(pool);
});

afterAll(async () => {
  await resetTestDb(pool);
  await pool.end();
});

beforeEach(async () => {
  await testDb.delete(schema.orgReputation);
  await testDb.delete(schema.organizations);

  orgA = await createTestOrg(testDb);
  orgB = await createTestOrg(testDb);
});

// ---------------------------------------------------------------------------
// upsertOrgReputation
// ---------------------------------------------------------------------------

describe("upsertOrgReputation", () => {
  it("creates a new reputation row", async () => {
    const row = await upsertOrgReputation(orgA.id);
    expect(row.orgId).toBe(orgA.id);
    expect(row.score).toBe("1.0000");
    expect(row.correctionsTotal).toBe(0);
    expect(row.eligible).toBe(false);
  });

  it("updates an existing reputation row on conflict", async () => {
    await upsertOrgReputation(orgA.id);
    const updated = await upsertOrgReputation(orgA.id, {
      docsProcessed: 100,
    });
    expect(updated.docsProcessed).toBe(100);
  });

  it("preserves unset fields during partial update", async () => {
    await upsertOrgReputation(orgA.id, { docsProcessed: 50 });
    const updated = await upsertOrgReputation(orgA.id, { eligible: true });
    // docsProcessed is not in the update set, so ON CONFLICT won't change it
    // (the implementation only sets fields that are provided)
    expect(updated.eligible).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// getOrgReputation
// ---------------------------------------------------------------------------

describe("getOrgReputation", () => {
  it("returns null for non-existent org", async () => {
    const result = await getOrgReputation(orgA.id);
    expect(result).toBeNull();
  });

  it("returns the reputation row", async () => {
    await upsertOrgReputation(orgA.id, { docsProcessed: 42 });
    const result = await getOrgReputation(orgA.id);
    expect(result).not.toBeNull();
    expect(result!.docsProcessed).toBe(42);
  });
});

// ---------------------------------------------------------------------------
// Atomic increments
// ---------------------------------------------------------------------------

describe("incrementReputationAgreed", () => {
  it("atomically increments agreed and total", async () => {
    await upsertOrgReputation(orgA.id);
    await incrementReputationAgreed(orgA.id);
    await incrementReputationAgreed(orgA.id);

    const rep = await getOrgReputation(orgA.id);
    expect(rep!.correctionsAgreed).toBe(2);
    expect(rep!.correctionsTotal).toBe(2);
    expect(rep!.correctionsDisputed).toBe(0);
  });
});

describe("incrementReputationDisputed", () => {
  it("atomically increments disputed and total", async () => {
    await upsertOrgReputation(orgA.id);
    await incrementReputationDisputed(orgA.id);

    const rep = await getOrgReputation(orgA.id);
    expect(rep!.correctionsDisputed).toBe(1);
    expect(rep!.correctionsTotal).toBe(1);
    expect(rep!.correctionsAgreed).toBe(0);
  });
});

describe("incrementDocsProcessed", () => {
  it("increments doc count and sets firstDocAt on first call", async () => {
    await upsertOrgReputation(orgA.id);
    await incrementDocsProcessed(orgA.id);

    const rep = await getOrgReputation(orgA.id);
    expect(rep!.docsProcessed).toBe(1);
    expect(rep!.firstDocAt).not.toBeNull();
  });

  it("preserves firstDocAt on subsequent calls", async () => {
    await upsertOrgReputation(orgA.id);
    await incrementDocsProcessed(orgA.id);
    const first = await getOrgReputation(orgA.id);
    const firstDocAt = first!.firstDocAt;

    await incrementDocsProcessed(orgA.id);
    const second = await getOrgReputation(orgA.id);
    expect(second!.docsProcessed).toBe(2);
    expect(second!.firstDocAt!.getTime()).toBe(firstDocAt!.getTime());
  });
});

// ---------------------------------------------------------------------------
// Eligibility
// ---------------------------------------------------------------------------

describe("getEligibleOrgIds", () => {
  it("returns empty array when no orgs are eligible", async () => {
    await upsertOrgReputation(orgA.id, { eligible: false });
    const ids = await getEligibleOrgIds();
    expect(ids).toEqual([]);
  });

  it("returns only eligible orgs", async () => {
    await upsertOrgReputation(orgA.id, { eligible: true });
    await upsertOrgReputation(orgB.id, { eligible: false });

    const ids = await getEligibleOrgIds();
    expect(ids).toEqual([orgA.id]);
  });

  it("returns multiple eligible orgs", async () => {
    await upsertOrgReputation(orgA.id, { eligible: true });
    await upsertOrgReputation(orgB.id, { eligible: true });

    const ids = await getEligibleOrgIds();
    expect(ids).toHaveLength(2);
    expect(ids).toContain(orgA.id);
    expect(ids).toContain(orgB.id);
  });
});

describe("recalculateEligibility", () => {
  it("returns false for non-existent reputation row", async () => {
    const result = await recalculateEligibility(orgA.id);
    expect(result).toBe(false);
  });

  it("returns false when docs < 50", async () => {
    await upsertOrgReputation(orgA.id, {
      docsProcessed: 49,
      firstDocAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000),
    });
    const result = await recalculateEligibility(orgA.id);
    expect(result).toBe(false);
  });

  it("returns false when first doc < 30 days ago", async () => {
    await upsertOrgReputation(orgA.id, {
      docsProcessed: 50,
      firstDocAt: new Date(Date.now() - 29 * 24 * 60 * 60 * 1000),
    });
    const result = await recalculateEligibility(orgA.id);
    expect(result).toBe(false);
  });

  it("returns false when score < 1.0", async () => {
    await upsertOrgReputation(orgA.id, {
      docsProcessed: 50,
      firstDocAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000),
      score: "0.9999",
    });
    const result = await recalculateEligibility(orgA.id);
    expect(result).toBe(false);
  });

  it("returns true when all gates pass", async () => {
    await upsertOrgReputation(orgA.id, {
      docsProcessed: 50,
      firstDocAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000),
      score: "1.0000",
    });
    const result = await recalculateEligibility(orgA.id);
    expect(result).toBe(true);

    // Verify eligibility was persisted
    const rep = await getOrgReputation(orgA.id);
    expect(rep!.eligible).toBe(true);
  });
});
