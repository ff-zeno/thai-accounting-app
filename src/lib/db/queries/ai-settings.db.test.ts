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
  it("stores Copilot provider configuration without raw API keys", async () => {
    const org = await createTestOrg(testDb);

    await upsertOrgAiSettings(org.id, {
      copilotProvider: "openai",
      copilotModel: "gpt-5.2",
      copilotApiKeySecretRef: "OPENAI_API_KEY_ORG_TEST",
      copilotApiKeyLast4: "abcd",
      copilotMonthlyBudgetUsd: "75.00",
      copilotLiveModelEnabled: true,
      copilotWriteToolsEnabled: false,
    });

    const settings = await getOrgAiSettings(org.id);
    expect(settings).toMatchObject({
      copilotProvider: "openai",
      copilotModel: "gpt-5.2",
      copilotApiKeySecretRef: "OPENAI_API_KEY_ORG_TEST",
      copilotApiKeyLast4: "abcd",
      copilotMonthlyBudgetUsd: "75.00",
      copilotLiveModelEnabled: true,
      copilotWriteToolsEnabled: false,
    });
  });

  it("upserts Copilot controls by organization", async () => {
    const org = await createTestOrg(testDb);

    await upsertOrgAiSettings(org.id, {
      copilotProvider: "openai",
      copilotModel: "gpt-5.2",
      copilotLiveModelEnabled: true,
    });
    await upsertOrgAiSettings(org.id, {
      copilotProvider: "anthropic",
      copilotModel: "claude-sonnet-4.5",
      copilotWriteToolsEnabled: true,
    });

    const rows = await testDb
      .select()
      .from(schema.orgAiSettings)
      .where(sql`${schema.orgAiSettings.orgId} = ${org.id}`);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      copilotProvider: "anthropic",
      copilotModel: "claude-sonnet-4.5",
      copilotWriteToolsEnabled: true,
    });
  });
});
