import { test, expect } from "../fixtures/auth";

test.describe("Vendors", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/vendors");
    await expect(page.locator("main")).toBeVisible();
  });

  test("page title visible", async ({ page }) => {
    await expect(
      page.getByRole("heading", { name: "Vendors" }),
    ).toBeVisible();
  });

  test("add vendor button visible", async ({ page }) => {
    await expect(
      page.getByRole("button", { name: /Add Vendor/i }),
    ).toBeVisible();
  });

  test("search input visible", async ({ page }) => {
    await expect(page.getByRole("textbox").first()).toBeVisible();
  });

  test("vendor table renders with columns", async ({ page }) => {
    const table = page.locator("table");
    const emptyState = page.getByText(/No vendors/i);
    const hasTable = await table.isVisible().catch(() => false);
    const hasEmpty = await emptyState.isVisible().catch(() => false);
    expect(hasTable || hasEmpty).toBe(true);

    if (hasTable) {
      await expect(page.getByRole("columnheader", { name: "Name" })).toBeVisible();
      await expect(page.getByRole("columnheader", { name: "Tax ID" })).toBeVisible();
    }
  });

  test("add vendor dialog opens", async ({ page }) => {
    await page.getByRole("button", { name: /Add Vendor/i }).click();
    await expect(
      page.getByRole("dialog").or(page.locator("[role=dialog]")),
    ).toBeVisible();
  });
});
