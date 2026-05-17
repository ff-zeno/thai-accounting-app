import { test, expect } from "../fixtures/auth";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";

const E2E_ORG_ID = "95aead7c-9942-474f-b48e-2ec5b46f10c9";

async function seedSkuDetailFixture() {
  const fixtureKey = `e2e-sku-detail-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const [existingHeadOffice] = await db
    .select()
    .from(schema.establishments)
    .where(
      sql`${schema.establishments.orgId} = ${E2E_ORG_ID}
        AND ${schema.establishments.branchNumber} = '00000'`
    )
    .limit(1);
  const headOffice =
    existingHeadOffice ??
    (
      await db
        .insert(schema.establishments)
        .values({
          orgId: E2E_ORG_ID,
          branchNumber: "00000",
          nameEn: "Head Office",
          isHeadOffice: true,
          vatRegistered: true,
        })
        .returning()
    )[0];
  const [sku] = await db
    .insert(schema.skus)
    .values({
      orgId: E2E_ORG_ID,
      establishmentId: headOffice.id,
      skuCode: fixtureKey,
      nameEn: "E2E SKU detail item",
      unitOfMeasure: "pcs",
      reorderPointQuantity: "0.0000",
      currentQuantity: "8.0000",
      currentAvgCost: "120.0000",
      currentValue: "960.00",
      lastMovementAt: new Date("2026-05-02T05:00:00.000Z"),
    })
    .returning();
  const [sale] = await db
    .insert(schema.salesTransactions)
    .values({
      orgId: E2E_ORG_ID,
      establishmentId: headOffice.id,
      eventRole: "pos_primary",
      source: "e2e",
      externalId: `${fixtureKey}-sale`,
      soldAt: new Date("2026-05-02T05:00:00.000Z"),
      channel: "pos",
      pricingMode: "vat_inclusive",
      taxInvoiceType: "simplified",
      amountIncludingVat: "107.00",
      taxBaseExVat: "100.00",
      vatAmount: "7.00",
      clearingAccountKey: "cash",
    })
    .returning();
  await db.insert(schema.inventoryMovements).values([
    {
      orgId: E2E_ORG_ID,
      establishmentId: headOffice.id,
      skuId: sku.id,
      movementAt: new Date("2026-05-01T05:00:00.000Z"),
      movementType: "adjustment_in",
      quantity: "10.0000",
      unitCost: "120.0000",
      totalCost: "1200.00",
      runningQuantityAfter: "10.0000",
      runningAvgCostAfter: "120.0000",
      runningValueAfter: "1200.00",
      sourceEntityType: "manual",
      notes: "E2E opening adjustment",
    },
    {
      orgId: E2E_ORG_ID,
      establishmentId: headOffice.id,
      skuId: sku.id,
      movementAt: new Date("2026-05-02T05:00:00.000Z"),
      movementType: "sale_out",
      quantity: "-2.0000",
      unitCost: "120.0000",
      totalCost: "240.00",
      runningQuantityAfter: "8.0000",
      runningAvgCostAfter: "120.0000",
      runningValueAfter: "960.00",
      sourceEntityType: "sales_transactions",
      sourceEntityId: sale.id,
    },
  ]);

  return sku;
}

async function seedCountDetailFixture() {
  const fixtureKey = `e2e-count-detail-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const [existingHeadOffice] = await db
    .select()
    .from(schema.establishments)
    .where(
      sql`${schema.establishments.orgId} = ${E2E_ORG_ID}
        AND ${schema.establishments.branchNumber} = '00000'`
    )
    .limit(1);
  const headOffice =
    existingHeadOffice ??
    (
      await db
        .insert(schema.establishments)
        .values({
          orgId: E2E_ORG_ID,
          branchNumber: "00000",
          nameEn: "Head Office",
          isHeadOffice: true,
          vatRegistered: true,
        })
        .returning()
    )[0];
  const [sku] = await db
    .insert(schema.skus)
    .values({
      orgId: E2E_ORG_ID,
      establishmentId: headOffice.id,
      skuCode: fixtureKey,
      nameEn: "E2E count item",
      unitOfMeasure: "pcs",
      currentQuantity: "8.0000",
      currentAvgCost: "120.0000",
      currentValue: "960.00",
    })
    .returning();
  const [count] = await db
    .insert(schema.inventoryCounts)
    .values({
      orgId: E2E_ORG_ID,
      establishmentId: headOffice.id,
      countDate: "2026-06-30",
      countType: "cycle",
      status: "reconciled",
      totalVarianceValueThb: "240.00",
      reconciledAt: new Date("2026-05-31T05:00:00.000Z"),
    })
    .returning();
  await db.insert(schema.inventoryCountItems).values({
    orgId: E2E_ORG_ID,
    countId: count.id,
    skuId: sku.id,
    systemQuantity: "10.0000",
    countedQuantity: "8.0000",
    variance: "-2.0000",
    varianceValueThb: "240.00",
    varianceReason: "shrinkage",
  });
  await db.insert(schema.inventoryMovements).values({
    orgId: E2E_ORG_ID,
    establishmentId: headOffice.id,
    skuId: sku.id,
    movementAt: new Date("2026-05-31T05:00:00.000Z"),
    movementType: "count_variance_out",
    quantity: "-2.0000",
    unitCost: "120.0000",
    totalCost: "240.00",
    runningQuantityAfter: "8.0000",
    runningAvgCostAfter: "120.0000",
    runningValueAfter: "960.00",
    sourceEntityType: "inventory_counts",
    sourceEntityId: count.id,
    notes: "E2E count variance",
  });

  return { count, sku };
}

test.describe("Inventory Control Tower", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/inventory");
    await expect(page.locator("main")).toBeVisible();
  });

  test("renders SKU and movement controls", async ({ page }) => {
    await expect(
      page.getByRole("heading", { name: /Inventory Control Tower/i }),
    ).toBeVisible();
    await expect(page.getByText(/Inventory is weighted-average v1/i)).toBeVisible();
    await expect(page.getByText("Inventory Value")).toBeVisible();
    await expect(page.getByText("Low Stock", { exact: true })).toBeVisible();
    await expect(page.getByLabel("SKU code")).toBeVisible();
    await expect(page.getByLabel("Standard cost")).toBeVisible();
    await expect(page.getByLabel("Reorder point")).toBeVisible();
    await expect(page.getByText("Manual Movement")).toBeVisible();
    await expect(page.locator("#movementType")).toContainText("Adjustment out");
    await expect(page.getByRole("button", { name: /Record Adjustment/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Create Count/i })).toBeVisible();
    await expect(page.getByText("Add Count Item")).toBeVisible();
    await expect(page.getByRole("button", { name: /Save Count Item/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Reconcile Count/i })).toBeVisible();
    await expect(
      page.getByText("Reconciliation posts count variance movements and locks the count."),
    ).toBeVisible();
    await expect(page.getByText("Recent Counts")).toBeVisible();
    await expect(page.getByText("Low Stock Watch")).toBeVisible();
    await expect(page.getByText("SKU Inventory")).toBeVisible();
    await expect(page.getByText("Inventory Roll-forward")).toBeVisible();
    await expect(page.getByText("Aged Inventory")).toBeVisible();
    await expect(page.getByRole("button", { name: /New Adjustment/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Create SKU/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /CSV/i })).toHaveCount(2);
  });

  test("has route in primary navigation", async ({ page }) => {
    await expect(page.getByRole("link", { name: /Inventory Control/i }).first()).toBeVisible();
  });

  test("opens SKU detail movement history", async ({ page }) => {
    const sku = await seedSkuDetailFixture();

    await page.goto(`/inventory/skus/${sku.id}`);

    await expect(page.getByRole("heading", { name: sku.skuCode })).toBeVisible();
    await expect(page.getByLabel("Reorder point")).toHaveValue("0.0000");
    await page.getByLabel("Name").fill("E2E SKU profile edited");
    await page.getByLabel("Reorder point").fill("9.0000");
    await page.getByRole("button", { name: /Save SKU Profile/i }).click();
    await expect(page.getByLabel("Name")).toHaveValue("E2E SKU profile edited");
    await expect(page.getByLabel("Reorder point")).toHaveValue("9.0000");
    await expect(page.getByText("Movement History", { exact: true })).toBeVisible();
    await expect(page.getByText("E2E opening adjustment")).toBeVisible();
    await expect(page.getByText("Sale", { exact: true })).toBeVisible();

    await page.goto("/inventory");
    await expect(page.getByText("Low Stock Watch")).toBeVisible();
    await expect(page.getByRole("link", { name: sku.skuCode })).toBeVisible();
  });

  test("opens inventory count detail", async ({ page }) => {
    const { count, sku } = await seedCountDetailFixture();

    await page.goto("/inventory");
    const countDetailHref = `/inventory/counts/${count.id}`;
    await expect(page.locator(`a[href="${countDetailHref}"]`)).toBeVisible();
    await page.goto(countDetailHref);

    await expect(page).toHaveURL(new RegExp(`/inventory/counts/${count.id}`));
    await expect(page.getByRole("heading", { name: /Inventory Count Detail/i })).toBeVisible();
    await expect(page.getByText("Count Items", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: sku.skuCode })).toBeVisible();
    await expect(page.getByText("Generated Movements", { exact: true })).toBeVisible();
    await expect(page.getByText("count_variance_out")).toBeVisible();
  });

  test("records sign-safe standalone adjustment", async ({ page }) => {
    const sku = await seedSkuDetailFixture();
    const notes = `E2E shrinkage ${Date.now()}`;

    await page.goto("/inventory/adjustments/new");
    await expect(page.getByRole("heading", { name: /New Inventory Adjustment/i })).toBeVisible();
    await page.getByLabel("SKU").selectOption(sku.id);
    await page.getByLabel("Type").selectOption("shrinkage");
    await page.getByLabel("Date").fill("2026-07-01");
    await page.getByLabel("Quantity").fill("1.0000");
    await page.getByLabel("Unit cost").fill("120.0000");
    await page.getByLabel("Notes").fill(notes);
    await page.getByRole("button", { name: /Record Adjustment/i }).click();
    await expect
      .poll(async () => {
        const rows = await db
          .select({ id: schema.inventoryMovements.id })
          .from(schema.inventoryMovements)
          .where(sql`${schema.inventoryMovements.notes} = ${notes}`);
        return rows.length;
      })
      .toBe(1);

    await page.goto(`/inventory/skus/${sku.id}`);
    await expect(page.getByText(notes)).toBeVisible();
    await expect(page.getByRole("cell", { name: "shrinkage", exact: true })).toBeVisible();
    await expect(page.getByRole("cell", { name: "-1.0000", exact: true })).toBeVisible();
  });
});
