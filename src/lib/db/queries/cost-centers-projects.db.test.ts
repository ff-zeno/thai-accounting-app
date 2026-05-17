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
let createCostCenter: typeof import("./cost-centers").createCostCenter;
let getCostCenters: typeof import("./cost-centers").getCostCenters;
let createProject: typeof import("./projects").createProject;
let getProjects: typeof import("./projects").getProjects;

beforeAll(async () => {
  await resetTestDb(pool);
  await migrateTestDb(pool);
  vi.doMock("../index", () => ({ db: testDb }));
  ({ createCostCenter, getCostCenters } = await import("./cost-centers"));
  ({ createProject, getProjects } = await import("./projects"));
});

afterAll(async () => {
  await resetTestDb(pool);
  await pool.end();
});

beforeEach(async () => {
  await testDb.execute(sql`
    TRUNCATE TABLE
      projects,
      cost_centers,
      vendors,
      organizations
    CASCADE
  `);
});

describe("cost center and project master data", () => {
  it("creates and lists cost centers scoped to one organization", async () => {
    const org = await createTestOrg(testDb);
    const otherOrg = await createTestOrg(testDb);

    await createCostCenter({
      orgId: org.id,
      code: "ops",
      nameEn: "Operations",
      nameTh: "ปฏิบัติการ",
    });
    await createCostCenter({
      orgId: otherOrg.id,
      code: "admin",
      nameEn: "Other Admin",
    });

    const rows = await getCostCenters(org.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      code: "OPS",
      nameEn: "Operations",
      nameTh: "ปฏิบัติการ",
      isActive: true,
    });
  });

  it("creates and lists projects with same-org customer names", async () => {
    const org = await createTestOrg(testDb);
    const otherOrg = await createTestOrg(testDb);
    const [customer] = await testDb
      .insert(schema.vendors)
      .values({
        orgId: org.id,
        name: "Project Customer",
        entityType: "company",
      })
      .returning();

    await createProject({
      orgId: org.id,
      code: "build-1",
      nameEn: "Buildout 1",
      customerVendorId: customer.id,
      startDate: "2026-05-01",
      status: "planned",
    });
    await createProject({
      orgId: otherOrg.id,
      code: "build-2",
      nameEn: "Other Buildout",
    });

    const rows = await getProjects(org.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      code: "BUILD-1",
      nameEn: "Buildout 1",
      customerVendorName: "Project Customer",
      startDate: "2026-05-01",
      status: "planned",
      isActive: true,
    });
  });
});
