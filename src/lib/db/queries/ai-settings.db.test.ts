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
let getOrgAiSettings: typeof import("./ai-settings").getOrgAiSettings;
let upsertOrgAiSettings: typeof import("./ai-settings").upsertOrgAiSettings;

beforeAll(async () => {
  await resetTestDb(pool);
  await migrateTestDb(pool);
  vi.doMock("../index", () => ({ db: testDb }));
  ({ getOrgAiSettings, upsertOrgAiSettings } = await import("./ai-settings"));
});

afterAll(async () => {
  await resetTestDb(pool);
  await pool.end();
});

beforeEach(async () => {
  await testDb.execute(sql`
    TRUNCATE TABLE
      org_ai_settings,
      organizations
    CASCADE
  `);
});

describe("AI settings", () => {
  it("stores model and budget configuration", async () => {
    const org = await createTestOrg(testDb);

    await upsertOrgAiSettings(org.id, {
      extractionModel: "openai/gpt-5.2",
      translationModel: "openai/gpt-5.2-mini",
      monthlyBudgetUsd: "75.00",
      budgetAlertThreshold: "0.80",
    });

    const settings = await getOrgAiSettings(org.id);
    expect(settings).toMatchObject({
      extractionModel: "openai/gpt-5.2",
      translationModel: "openai/gpt-5.2-mini",
      monthlyBudgetUsd: "75.00",
      budgetAlertThreshold: "0.80",
    });
  });

  it("upserts settings by organization", async () => {
    const org = await createTestOrg(testDb);

    await upsertOrgAiSettings(org.id, {
      extractionModel: "openai/gpt-5.2",
      monthlyBudgetUsd: "10.00",
    });
    await upsertOrgAiSettings(org.id, {
      extractionModel: "anthropic/claude-sonnet-4.5",
      monthlyBudgetUsd: "25.00",
    });

    const rows = await testDb
      .select()
      .from(schema.orgAiSettings)
      .where(sql`${schema.orgAiSettings.orgId} = ${org.id}`);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      extractionModel: "anthropic/claude-sonnet-4.5",
      monthlyBudgetUsd: "25.00",
    });
  });
});
