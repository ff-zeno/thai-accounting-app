import { test, expect } from "../fixtures/auth";

test.describe("Fixed Asset Register", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeEach(async ({ page }) => {
    await page.goto("/fixed-assets");
    await expect(page.locator("main")).toBeVisible();
  });

  test("renders asset intake and register cards", async ({ page }) => {
    await expect(
      page.getByRole("heading", { name: /Fixed Asset Register/i }),
    ).toBeVisible();
    await expect(page.getByText("Fixed assets are straight-line v1.")).toBeVisible();
    await expect(page.getByText(/Declining-balance, units-of-production, impairment/i)).toBeVisible();
    await expect(page.getByText("Active Assets")).toBeVisible();
    await expect(page.getByText("Book Value").first()).toBeVisible();
    await expect(page.getByText("Roll Forward")).toBeVisible();
    await expect(page.getByText("Disposal Register")).toBeVisible();
    await expect(page.getByRole("button", { name: "CSV", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /Open Report/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Import CSV/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /New Asset/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Create Asset/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Queue Depreciation/i })).toBeVisible();
  });

  test("opens standalone roll-forward report", async ({ page }) => {
    await page.goto("/fixed-assets/reports/roll-forward");
    await expect(
      page.getByRole("heading", { name: /Fixed Asset Roll Forward/i })
    ).toBeVisible();
    await expect(page.getByText("Report Filters")).toBeVisible();
    await expect(page.getByText("Roll Forward Detail")).toBeVisible();
    await expect(page.getByRole("button", { name: /CSV/i })).toBeVisible();
  });

  test("imports fixed assets from CSV", async ({ page }) => {
    const assetCode = `FA-2026-E2E-${Date.now()}`;
    await page.getByRole("button", { name: /Import CSV/i }).click();
    await expect(
      page.getByRole("heading", { name: /Fixed Asset CSV Import/i })
    ).toBeVisible();
    await page.getByLabel("CSV rows").fill([
      "asset_code,name_en,category,acquisition_date,original_cost,salvage_value,useful_life_months",
      `${assetCode},E2E imported asset,equipment,2026-04-01,3600.00,0.00,60`,
    ].join("\n"));
    await page.getByRole("button", { name: /Import Fixed Assets/i }).click();
    await expect(page.getByText("Imported 1 fixed asset")).toBeVisible();
    await expect(page.getByText("Imported Assets")).toBeVisible();
    const importedAssetLink = page.getByRole("link", { name: new RegExp(assetCode) });
    await expect(importedAssetLink).toBeVisible();
    await expect(importedAssetLink).toHaveAttribute(
      "href",
      /\/fixed-assets\/[0-9a-f-]{36}$/
    );
  });

  test("ignores malformed imported asset ids in confirmation URL", async ({ page }) => {
    await page.goto("/fixed-assets/import?status=Imported%201%20fixed%20asset&ids=not-a-uuid&total=1");
    await expect(
      page.getByRole("heading", { name: /Fixed Asset CSV Import/i })
    ).toBeVisible();
    await expect(page.getByText("Imported 1 fixed asset")).toBeVisible();
    await expect(page.getByText("Imported Assets")).toHaveCount(0);
  });

  test("creates an asset from standalone intake page", async ({ page }) => {
    const assetName = `E2E standalone asset ${Date.now()}`;
    await page.getByRole("button", { name: /New Asset/i }).click();
    await expect(page.getByRole("heading", { name: /New Fixed Asset/i })).toBeVisible();
    await expect(page.getByText(/Tax minimum/i)).toBeVisible();
    await page.getByLabel("Book life months").fill("24");
    await expect(page.getByText(/PND\.50 addback/i)).toBeVisible();
    await page.getByLabel("Name EN").fill(assetName);
    await page.getByLabel("Acquisition date").fill("2026-02-01");
    await page.getByLabel("Original cost").fill("2400.00");
    await page.getByRole("button", { name: /Create Asset/i }).click();
    await expect(page).toHaveURL(/\/fixed-assets\/[0-9a-f-]+$/);
    await expect(page.getByRole("heading", { name: /FA-2026-/i })).toBeVisible();
    await expect(page.getByText(assetName)).toBeVisible();
    await expect(page.getByText("Depreciation Register")).toBeVisible();
  });

  test("creates an asset and opens detail depreciation register", async ({ page }) => {
    const suffix = Date.now();
    const assetCode = `FA-2026-E2E-DETAIL-${suffix}`;
    const assetName = `E2E asset ${suffix}`;
    await page.getByRole("button", { name: /New Asset/i }).click();
    await expect(page.getByRole("heading", { name: /New Fixed Asset/i })).toBeVisible();
    await page.getByLabel("Asset code").fill(assetCode);
    await page.getByLabel("Name EN").fill(assetName);
    await page.getByLabel("Acquisition date").fill("2026-12-31");
    await page.getByLabel("Original cost").fill("1200.00");
    await page.getByRole("button", { name: /Create Asset/i }).click();

    await expect(page).toHaveURL(/\/fixed-assets\/[0-9a-f-]+$/);
    await expect(page.getByRole("heading", { name: assetCode })).toBeVisible();
    await expect(page.getByText(assetName)).toBeVisible();
    await expect(page.getByText("Depreciation Register")).toBeVisible();
    await expect(page.getByRole("button", { name: /Build Missing Rows/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Dispose$/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Open Disposal Flow/i })).toBeVisible();
  });

  test("disposes an asset from standalone disposal flow", async ({ page }) => {
    const assetName = `E2E disposal asset ${Date.now()}`;
    await page.getByRole("button", { name: /New Asset/i }).click();
    await expect(page.getByRole("heading", { name: /New Fixed Asset/i })).toBeVisible();
    await page.getByLabel("Name EN").fill(assetName);
    await page.getByLabel("Acquisition date").fill("2026-03-01");
    await page.getByLabel("Original cost").fill("1800.00");
    await page.getByRole("button", { name: /Create Asset/i }).click();
    await expect(page).toHaveURL(/\/fixed-assets\/[0-9a-f-]+$/);

    await page.getByRole("button", { name: /Open Disposal Flow/i }).click();
    await expect(page.getByRole("heading", { name: /FA-2026-/i })).toBeVisible();
    await expect(page.getByText("Asset Snapshot")).toBeVisible();
    await page.getByLabel("Disposal date").fill("2026-06-30");
    await page.getByLabel("Proceeds").fill("1900.00");
    await page.getByRole("button", { name: /Dispose Asset/i }).click();
    await expect(page).toHaveURL(/\/fixed-assets\/[0-9a-f-]+$/);
    await expect(page.getByText(/Disposed 2026-06-30/i)).toBeVisible();
  });

  test("has route in primary navigation", async ({ page }) => {
    await expect(
      page.getByRole("link", { name: /Fixed Asset Register/i }).first(),
    ).toBeVisible();
  });
});
