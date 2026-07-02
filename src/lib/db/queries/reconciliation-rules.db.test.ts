import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, sql } from "drizzle-orm";
import * as schema from "@/lib/db/schema";
import {
  createTestDb,
  createTestOrg,
  migrateTestDb,
  resetTestDb,
} from "@/tests/db-test-utils";
import type { RuleAction, RuleCondition } from "./reconciliation-rules";

const { db: testDb, pool } = createTestDb();
let getActiveRules: typeof import("./reconciliation-rules").getActiveRules;
let createRule: typeof import("./reconciliation-rules").createRule;
let incrementRuleMatchCount: typeof import("./reconciliation-rules").incrementRuleMatchCount;

beforeAll(async () => {
  await resetTestDb(pool);
  await migrateTestDb(pool);
  vi.doMock("../index", () => ({ db: testDb }));
  ({ getActiveRules, createRule, incrementRuleMatchCount } = await import(
    "./reconciliation-rules"
  ));
});

afterAll(async () => {
  await resetTestDb(pool);
  await pool.end();
});

beforeEach(async () => {
  await testDb.execute(sql`
    TRUNCATE TABLE
      reconciliation_rules,
      organizations
    CASCADE
  `);
});

const containsCounterparty = (value: string): RuleCondition[] => [
  { field: "counterparty", operator: "contains", value },
];

const autoMatchActions: RuleAction[] = [{ type: "auto_match", value: "true" }];

describe("reconciliation rules queries", () => {
  it("getActiveRules returns rules ordered by priority ascending (lower = higher priority)", async () => {
    const org = await createTestOrg(testDb);

    // Two active rules that would both match an "acme" counterparty.
    // Insert the LOWER-priority (higher number) rule first so insertion
    // order cannot accidentally satisfy the ordering assertion.
    const catchAllRuleId = await createRule({
      orgId: org.id,
      name: "Catch-all ACME rule",
      priority: 200,
      conditions: containsCounterparty("acme"),
      actions: autoMatchActions,
    });
    const specificRuleId = await createRule({
      orgId: org.id,
      name: "Specific ACME rule",
      priority: 50,
      conditions: containsCounterparty("acme corp"),
      actions: autoMatchActions,
    });

    const rules = await getActiveRules(org.id);

    expect(rules).toHaveLength(2);
    expect(rules.map((r) => r.id)).toEqual([specificRuleId, catchAllRuleId]);
    expect(rules.map((r) => r.priority)).toEqual([50, 200]);
  });

  it("incrementRuleMatchCount is a no-op when called with another org's id", async () => {
    const orgA = await createTestOrg(testDb);
    const orgB = await createTestOrg(testDb);

    const ruleId = await createRule({
      orgId: orgA.id,
      name: "Org A rule",
      conditions: containsCounterparty("acme"),
      actions: autoMatchActions,
    });

    // Org B attempts to increment org A's rule — must not change anything.
    await incrementRuleMatchCount(orgB.id, ruleId);

    const [afterCrossTenant] = await testDb
      .select()
      .from(schema.reconciliationRules)
      .where(eq(schema.reconciliationRules.id, ruleId));
    expect(afterCrossTenant.matchCount).toBe(0);
    expect(afterCrossTenant.lastMatchedAt).toBeNull();

    // Sanity check: the owning org CAN increment, so the no-op above is
    // genuinely the org scoping and not a broken helper.
    await incrementRuleMatchCount(orgA.id, ruleId);

    const [afterOwningOrg] = await testDb
      .select()
      .from(schema.reconciliationRules)
      .where(eq(schema.reconciliationRules.id, ruleId));
    expect(afterOwningOrg.matchCount).toBe(1);
    expect(afterOwningOrg.lastMatchedAt).not.toBeNull();
  });
});
