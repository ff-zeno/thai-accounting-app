import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import * as schema from "@/lib/db/schema";
import {
  createTestDb,
  migrateTestDb,
  resetTestDb,
} from "@/tests/db-test-utils";

const { db: testDb, pool } = createTestDb();

beforeAll(async () => {
  await resetTestDb(pool);
  await migrateTestDb(pool);
});

afterAll(async () => {
  await resetTestDb(pool);
  await pool.end();
});

beforeEach(async () => {
  await testDb.delete(schema.auditLog);
  await testDb.delete(schema.organizations);
});

async function createOrg() {
  const [org] = await testDb
    .insert(schema.organizations)
    .values({
      name: "Audit Partition Org",
      taxId: "1234567890123",
      branchNumber: "00000",
    })
    .returning();
  return org;
}

async function getAuditRowPartition(id: string): Promise<string> {
  const result = await pool.query<{ partition_name: string }>(
    "SELECT tableoid::regclass::text AS partition_name FROM audit_log WHERE id = $1",
    [id]
  );
  return result.rows[0].partition_name;
}

describe("audit_log partitioning", () => {
  it("routes current audit rows into the monthly partition", async () => {
    const org = await createOrg();
    const [entry] = await testDb
      .insert(schema.auditLog)
      .values({
        orgId: org.id,
        entityType: "document",
        entityId: crypto.randomUUID(),
        action: "create",
      })
      .returning();

    const partitionName = await getAuditRowPartition(entry.id);
    const expectedSuffix = entry.createdAt
      .toISOString()
      .slice(0, 7)
      .replace("-", "_");

    expect(partitionName).toBe(`audit_log_${expectedSuffix}`);
  });

  it("routes out-of-range audit rows into the default partition", async () => {
    const org = await createOrg();
    const [entry] = await testDb
      .insert(schema.auditLog)
      .values({
        orgId: org.id,
        entityType: "document",
        entityId: crypto.randomUUID(),
        action: "create",
        createdAt: new Date("2099-01-15T00:00:00.000Z"),
      })
      .returning();

    await expect(getAuditRowPartition(entry.id)).resolves.toBe("audit_log_default");
  });

  it("moves default-partition rows when creating the missing monthly partition", async () => {
    const org = await createOrg();
    const createdAt = new Date("2099-02-15T00:00:00.000Z");
    const [entry] = await testDb
      .insert(schema.auditLog)
      .values({
        orgId: org.id,
        entityType: "document",
        entityId: crypto.randomUUID(),
        action: "create",
        createdAt,
      })
      .returning();

    await expect(getAuditRowPartition(entry.id)).resolves.toBe("audit_log_default");

    await testDb.execute(sql`SELECT ensure_audit_log_partition_for_month(${createdAt})`);

    await expect(getAuditRowPartition(entry.id)).resolves.toBe("audit_log_2099_02");
  });

  it("prunes unrelated monthly partitions for bounded created_at queries", async () => {
    const org = await createOrg();
    const [entry] = await testDb
      .insert(schema.auditLog)
      .values({
        orgId: org.id,
        entityType: "document",
        entityId: crypto.randomUUID(),
        action: "create",
      })
      .returning();

    const monthStart = new Date(Date.UTC(
      entry.createdAt.getUTCFullYear(),
      entry.createdAt.getUTCMonth(),
      1
    ));
    const nextMonthStart = new Date(Date.UTC(
      entry.createdAt.getUTCFullYear(),
      entry.createdAt.getUTCMonth() + 1,
      1
    ));
    const expectedPartition = `audit_log_${entry.createdAt
      .toISOString()
      .slice(0, 7)
      .replace("-", "_")}`;

    const plan = await testDb.execute(sql`
      EXPLAIN
      SELECT *
      FROM audit_log
      WHERE org_id = ${org.id}
        AND created_at >= ${monthStart}
        AND created_at < ${nextMonthStart}
    `);
    const planText = plan.rows.map((row) => String(row["QUERY PLAN"])).join("\n");

    expect(planText).toContain(expectedPartition);
    expect(planText).not.toContain("audit_log_default");
  });
});
