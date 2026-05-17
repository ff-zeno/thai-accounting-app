import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import * as schema from "@/lib/db/schema";
import {
  createTestDb,
  createTestOrg,
  migrateTestDb,
  resetTestDb,
} from "@/tests/db-test-utils";

const { db: testDb, pool } = createTestDb();
let createAllocationRule: typeof import("./allocation-rules").createAllocationRule;
let getAllocationRules: typeof import("./allocation-rules").getAllocationRules;

beforeAll(async () => {
  await resetTestDb(pool);
  await migrateTestDb(pool);
  vi.doMock("../index", () => ({ db: testDb }));
  ({ createAllocationRule, getAllocationRules } = await import("./allocation-rules"));
});

afterAll(async () => {
  await resetTestDb(pool);
  await pool.end();
});

beforeEach(async () => {
  await testDb.execute(sql`
    TRUNCATE TABLE
      allocation_rule_targets,
      allocation_rules,
      projects,
      cost_centers,
      organizations
    CASCADE
  `);
});

describe("allocation rules", () => {
  it("creates split targets that total 100 percent", async () => {
    const org = await createTestOrg(testDb);
    const [ops, admin] = await testDb
      .insert(schema.costCenters)
      .values([
        { orgId: org.id, code: "OPS", nameEn: "Operations" },
        { orgId: org.id, code: "ADM", nameEn: "Admin" },
      ])
      .returning();

    await createAllocationRule({
      orgId: org.id,
      ruleName: "Rent split",
      sourceType: "vendor",
      sourceId: org.id,
      targets: [
        { costCenterId: ops.id, percentage: "0.6000" },
        { costCenterId: admin.id, percentage: "0.4000" },
      ],
    });

    const rules = await getAllocationRules(org.id);
    expect(rules).toHaveLength(1);
    expect(rules[0]).toMatchObject({
      ruleName: "Rent split",
      sourceType: "vendor",
      sourceId: org.id,
      sourceKey: null,
    });
    expect(rules[0].targets.map((target) => target.percentage)).toEqual([
      "0.6000",
      "0.4000",
    ]);
  });

  it("stores normalized source keys for category rules", async () => {
    const org = await createTestOrg(testDb);
    const [ops] = await testDb
      .insert(schema.costCenters)
      .values({ orgId: org.id, code: "OPS", nameEn: "Operations" })
      .returning();

    await createAllocationRule({
      orgId: org.id,
      ruleName: "Marketing split",
      sourceType: "category",
      sourceKey: " Marketing ",
      targets: [{ costCenterId: ops.id, percentage: "1.0000" }],
    });

    const [rule] = await testDb
      .select({
        sourceId: schema.allocationRules.sourceId,
        sourceKey: schema.allocationRules.sourceKey,
      })
      .from(schema.allocationRules)
      .where(sql`${schema.allocationRules.orgId} = ${org.id}`);

    expect(rule).toEqual({ sourceId: null, sourceKey: "marketing" });
  });

  it("rejects targets that do not total 100 percent", async () => {
    const org = await createTestOrg(testDb);
    const [ops] = await testDb
      .insert(schema.costCenters)
      .values({ orgId: org.id, code: "OPS", nameEn: "Operations" })
      .returning();

    await expect(
      createAllocationRule({
        orgId: org.id,
        ruleName: "Bad split",
        sourceType: "category",
        sourceKey: "rent",
        targets: [{ costCenterId: ops.id, percentage: "0.6000" }],
      })
    ).rejects.toThrow(/total 1.0000/);
  });

  it("rejects active rules without a usable source identifier", async () => {
    const org = await createTestOrg(testDb);
    const [ops] = await testDb
      .insert(schema.costCenters)
      .values({ orgId: org.id, code: "OPS", nameEn: "Operations" })
      .returning();

    await expect(
      createAllocationRule({
        orgId: org.id,
        ruleName: "Missing category",
        sourceType: "category",
        targets: [{ costCenterId: ops.id, percentage: "1.0000" }],
      })
    ).rejects.toThrow(/source key/);

    await expect(
      createAllocationRule({
        orgId: org.id,
        ruleName: "Missing vendor",
        sourceType: "vendor",
        targets: [{ costCenterId: ops.id, percentage: "1.0000" }],
      })
    ).rejects.toThrow(/source ID/);
  });

  it("rejects deleted or cross-org target dimensions before insert", async () => {
    const org = await createTestOrg(testDb);
    const otherOrg = await createTestOrg(testDb);
    const [otherCostCenter] = await testDb
      .insert(schema.costCenters)
      .values({ orgId: otherOrg.id, code: "OTHER", nameEn: "Other" })
      .returning();

    await expect(
      createAllocationRule({
        orgId: org.id,
        ruleName: "Cross org",
        sourceType: "category",
        sourceKey: "rent",
        targets: [{ costCenterId: otherCostCenter.id, percentage: "1.0000" }],
      })
    ).rejects.toThrow(/cost center must belong/);
  });

  it("blocks cross-org allocation targets at the database boundary", async () => {
    const org = await createTestOrg(testDb);
    const otherOrg = await createTestOrg(testDb);
    const [rule] = await testDb
      .insert(schema.allocationRules)
      .values({
        orgId: org.id,
        ruleName: "Cross-org check",
        sourceType: "category",
      })
      .returning();
    const [otherCostCenter] = await testDb
      .insert(schema.costCenters)
      .values({
        orgId: otherOrg.id,
        code: "OTHER",
        nameEn: "Other Cost Center",
      })
      .returning();

    await expect(
      testDb.insert(schema.allocationRuleTargets).values({
        orgId: org.id,
        allocationRuleId: rule.id,
        costCenterId: otherCostCenter.id,
        percentage: "1.0000",
      })
    ).rejects.toThrow(/Failed query/);
  });
});
