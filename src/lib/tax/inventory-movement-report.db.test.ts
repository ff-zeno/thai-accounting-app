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
let buildInventoryMovementReport: typeof import("./inventory-movement-report").buildInventoryMovementReport;

beforeAll(async () => {
  await resetTestDb(pool);
  await migrateTestDb(pool);
  vi.doMock("@/lib/db", () => ({ db: testDb }));
  ({ buildInventoryMovementReport } = await import("./inventory-movement-report"));
});

afterAll(async () => {
  await resetTestDb(pool);
  await pool.end();
});

beforeEach(async () => {
  await testDb.execute(sql`
    TRUNCATE TABLE
      inventory_movements,
      skus,
      establishments,
      organizations
    CASCADE
  `);
});

async function createHeadOffice(orgId: string, branchNumber = "00000") {
  const [establishment] = await testDb
    .insert(schema.establishments)
    .values({
      orgId,
      branchNumber,
      nameEn: branchNumber === "00000" ? "Head Office" : `Branch ${branchNumber}`,
      isHeadOffice: branchNumber === "00000",
      vatRegistered: true,
    })
    .returning();
  return establishment;
}

describe("Section 87 goods/raw-materials report", () => {
  it("uses inventory movements by Bangkok tax month, establishment, and SKU", async () => {
    const org = await createTestOrg(testDb);
    const headOffice = await createHeadOffice(org.id);
    const branch = await createHeadOffice(org.id, "00001");
    const [sku] = await testDb
      .insert(schema.skus)
      .values({
        orgId: org.id,
        establishmentId: headOffice.id,
        skuCode: "SKU-001",
        nameEn: "Retail Item",
        unitOfMeasure: "pcs",
      })
      .returning();
    const [branchSku] = await testDb
      .insert(schema.skus)
      .values({
        orgId: org.id,
        establishmentId: branch.id,
        skuCode: "SKU-BR",
        nameEn: "Branch Item",
        unitOfMeasure: "pcs",
      })
      .returning();

    await testDb.insert(schema.inventoryMovements).values([
      {
        orgId: org.id,
        establishmentId: headOffice.id,
        skuId: sku.id,
        movementAt: new Date("2026-04-30T17:30:00.000Z"),
        movementType: "purchase_in",
        quantity: "10.0000",
        unitCost: "12.0000",
        totalCost: "120.00",
        runningQuantityAfter: "15.0000",
        sourceEntityType: "documents",
        sourceEntityId: "00000000-0000-4000-8000-000000000001",
      },
      {
        orgId: org.id,
        establishmentId: headOffice.id,
        skuId: sku.id,
        movementAt: new Date("2026-05-15T05:00:00.000Z"),
        movementType: "sale_out",
        quantity: "-3.0000",
        unitCost: "12.0000",
        totalCost: "36.00",
        runningQuantityAfter: "12.0000",
      },
      {
        orgId: org.id,
        establishmentId: branch.id,
        skuId: branchSku.id,
        movementAt: new Date("2026-05-15T06:00:00.000Z"),
        movementType: "purchase_in",
        quantity: "99.0000",
        unitCost: "1.0000",
        totalCost: "99.00",
        runningQuantityAfter: "99.0000",
      },
      {
        orgId: org.id,
        establishmentId: headOffice.id,
        skuId: sku.id,
        movementAt: new Date("2026-04-30T16:30:00.000Z"),
        movementType: "purchase_in",
        quantity: "5.0000",
        unitCost: "12.0000",
        totalCost: "60.00",
        runningQuantityAfter: "5.0000",
      },
    ]);

    const report = await buildInventoryMovementReport({
      orgId: org.id,
      establishmentId: headOffice.id,
      periodYear: 2026,
      periodMonth: 5,
    });

    expect(report.rows.map((row) => row.movementType)).toEqual([
      "purchase_in",
      "sale_out",
    ]);
    expect(report.rows[0].movementDate).toBe("2026-05-01");
    expect(report.rows[0].sourceEntityType).toBe("documents");
    expect(report.rows[0].sourceEntityId).toBe(
      "00000000-0000-4000-8000-000000000001"
    );
    expect(report.rows[0].journalEntryId).toBeNull();
    expect(report.rows[1].sourceEntityType).toBeNull();
    expect(report.skuSummary).toEqual([
      {
        skuId: sku.id,
        skuCode: "SKU-001",
        skuName: "Retail Item",
        unitOfMeasure: "pcs",
        openingQuantity: "5.0000",
        movementCount: 2,
        inboundQuantity: "10.0000",
        outboundQuantity: "3.0000",
        netQuantity: "7.0000",
        closingQuantity: "12.0000",
        movementValue: "156.00",
      },
    ]);
    expect(report.totals).toEqual({
      movementCount: 2,
      openingQuantity: "5.0000",
      inboundQuantity: "10.0000",
      outboundQuantity: "3.0000",
      netQuantity: "7.0000",
      closingQuantity: "12.0000",
      movementValue: "156.00",
    });
    expect(report.sourceUrls[0].url).toBe("https://www.rd.go.th/5209.html");
  });
});
