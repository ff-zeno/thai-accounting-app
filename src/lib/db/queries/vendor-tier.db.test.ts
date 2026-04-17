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
} from "@/tests/db-test-utils";
import * as schema from "@/lib/db/schema";

/*
 * INTEGRATION TESTS -- Vendor Tier Query Layer
 * =============================================
 *
 * Validates the vendor tier CRUD operations: get, upsert, promote, demote.
 * Also verifies org isolation -- Org B cannot see or modify Org A's vendor tiers.
 *
 * Requires Docker Postgres running:
 *   docker compose -f docker-compose.test.yml up -d
 */

const { db: testDb, pool } = createTestDb();

vi.mock("@/lib/db/index", () => ({ db: testDb }));
vi.mock("@/lib/db/helpers/audit-log", () => ({
  auditMutation: vi.fn(),
}));

const { getVendorTier, upsertVendorTier, promoteVendorTier, demoteVendorTier } =
  await import("@/lib/db/queries/vendor-tier");

let orgId: string;
let vendorId: string;

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
  await testDb.delete(schema.vendorTier);
  await testDb.delete(schema.vendors);
  await testDb.delete(schema.organizations);

  // Fresh org + vendor for each test
  const org = await createTestOrg(testDb);
  const vendor = await createTestVendor(testDb, org.id);
  orgId = org.id;
  vendorId = vendor.id;
});

// ---------------------------------------------------------------------------
// getVendorTier
// ---------------------------------------------------------------------------

describe("getVendorTier", () => {
  it("returns null for unknown vendor", async () => {
    const result = await getVendorTier(orgId, vendorId);
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// upsertVendorTier
// ---------------------------------------------------------------------------

describe("upsertVendorTier", () => {
  it("creates tier 0 row", async () => {
    const result = await upsertVendorTier(orgId, vendorId);
    expect(result.tier).toBe(0);
    expect(result.docsProcessedTotal).toBe(1);
    expect(result.vendorId).toBe(vendorId);
    expect(result.orgId).toBe(orgId);
  });

  it("increments docsProcessedTotal on second call", async () => {
    await upsertVendorTier(orgId, vendorId);
    const result = await upsertVendorTier(orgId, vendorId);
    expect(result.docsProcessedTotal).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// promoteVendorTier
// ---------------------------------------------------------------------------

describe("promoteVendorTier", () => {
  it("sets tier and lastPromotedAt", async () => {
    await upsertVendorTier(orgId, vendorId);
    const result = await promoteVendorTier(orgId, vendorId, 1);
    expect(result.tier).toBe(1);
    expect(result.lastPromotedAt).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// demoteVendorTier
// ---------------------------------------------------------------------------

describe("demoteVendorTier", () => {
  it("sets tier to 0 and lastDemotedAt", async () => {
    await upsertVendorTier(orgId, vendorId);
    await promoteVendorTier(orgId, vendorId, 1);
    const result = await demoteVendorTier(orgId, vendorId, 0);
    expect(result).not.toBeNull();
    expect(result!.tier).toBe(0);
    expect(result!.lastDemotedAt).not.toBeNull();
  });

  it("returns null if no existing row", async () => {
    const result = await demoteVendorTier(orgId, vendorId, 0);
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Org isolation
// ---------------------------------------------------------------------------

describe("org isolation", () => {
  it("Org B cannot see Org A vendor tier", async () => {
    // Org A tier exists
    await upsertVendorTier(orgId, vendorId);
    await promoteVendorTier(orgId, vendorId, 1);

    // Create Org B
    const orgB = await createTestOrg(testDb);

    // Org B queries Org A's vendorId -- should return null
    const result = await getVendorTier(orgB.id, vendorId);
    expect(result).toBeNull();
  });

  it("same vendor tax ID in both orgs stays isolated", async () => {
    const sharedTaxId = "1111111111111";

    // Create Org B with its own vendor using the same taxId
    const orgB = await createTestOrg(testDb);
    const vendorA = await createTestVendor(testDb, orgId, {
      taxId: sharedTaxId,
      name: "Vendor A",
    });
    const vendorB = await createTestVendor(testDb, orgB.id, {
      taxId: sharedTaxId,
      name: "Vendor B",
    });

    // Promote Org A's vendor to tier 2
    await upsertVendorTier(orgId, vendorA.id);
    await promoteVendorTier(orgId, vendorA.id, 2);

    // Upsert Org B's vendor (stays at tier 0)
    await upsertVendorTier(orgB.id, vendorB.id);

    // Verify Org A's vendor is tier 2
    const tierA = await getVendorTier(orgId, vendorA.id);
    expect(tierA).not.toBeNull();
    expect(tierA!.tier).toBe(2);

    // Verify Org B's vendor is still tier 0
    const tierB = await getVendorTier(orgB.id, vendorB.id);
    expect(tierB).not.toBeNull();
    expect(tierB!.tier).toBe(0);

    // Cross-org lookup returns null
    const crossA = await getVendorTier(orgB.id, vendorA.id);
    expect(crossA).toBeNull();
    const crossB = await getVendorTier(orgId, vendorB.id);
    expect(crossB).toBeNull();
  });
});
