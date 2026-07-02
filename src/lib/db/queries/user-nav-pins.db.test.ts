import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import {
  createTestDb,
  createTestOrg,
  migrateTestDb,
  resetTestDb,
} from "@/tests/db-test-utils";

const { db: testDb, pool } = createTestDb();
let listPins: typeof import("./user-nav-pins").listPins;
let pinItem: typeof import("./user-nav-pins").pinItem;
let unpinItem: typeof import("./user-nav-pins").unpinItem;

const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";

beforeAll(async () => {
  await resetTestDb(pool);
  await migrateTestDb(pool);
  vi.doMock("../index", () => ({ db: testDb }));
  ({ listPins, pinItem, unpinItem } = await import("./user-nav-pins"));
});

afterAll(async () => {
  await resetTestDb(pool);
  await pool.end();
});

beforeEach(async () => {
  await testDb.execute(sql`TRUNCATE TABLE user_nav_pins, organizations CASCADE`);
});

describe("user nav pins", () => {
  it("scopes pins to org and user", async () => {
    const orgA = await createTestOrg(testDb);
    const orgB = await createTestOrg(testDb);

    await pinItem(orgA.id, USER_A, "/reconciliation");
    await pinItem(orgA.id, USER_B, "/tax/vat");
    await pinItem(orgB.id, USER_A, "/documents/upload");

    const pins = await listPins(orgA.id, USER_A);
    expect(pins).toHaveLength(1);
    expect(pins[0].href).toBe("/reconciliation");

    expect(await listPins(orgB.id, USER_A)).toHaveLength(1);
    expect(await listPins(orgB.id, USER_B)).toHaveLength(0);
  });

  it("appends positions and lists in pin order", async () => {
    const org = await createTestOrg(testDb);

    await pinItem(org.id, USER_A, "/tax/vat");
    await pinItem(org.id, USER_A, "/reconciliation");
    await pinItem(org.id, USER_A, "/documents/upload");

    const pins = await listPins(org.id, USER_A);
    expect(pins.map((pin) => pin.href)).toEqual([
      "/tax/vat",
      "/reconciliation",
      "/documents/upload",
    ]);
    expect(pins.map((pin) => pin.position)).toEqual([0, 1, 2]);
  });

  it("is idempotent on the (org, user, href) unique index", async () => {
    const org = await createTestOrg(testDb);

    const first = await pinItem(org.id, USER_A, "/tax/vat");
    const second = await pinItem(org.id, USER_A, "/tax/vat");

    expect(first).not.toBeNull();
    expect(second).toBeNull();
    expect(await listPins(org.id, USER_A)).toHaveLength(1);
  });

  it("unpins only the caller's row", async () => {
    const org = await createTestOrg(testDb);
    await pinItem(org.id, USER_A, "/tax/vat");
    await pinItem(org.id, USER_B, "/tax/vat");

    const removed = await unpinItem(org.id, USER_A, "/tax/vat");
    expect(removed?.href).toBe("/tax/vat");

    expect(await listPins(org.id, USER_A)).toHaveLength(0);
    expect(await listPins(org.id, USER_B)).toHaveLength(1);

    // Unpinning a non-existent href is a no-op.
    expect(await unpinItem(org.id, USER_A, "/tax/vat")).toBeNull();
  });
});
