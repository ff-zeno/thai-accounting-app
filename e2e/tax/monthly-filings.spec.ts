import { test, expect } from "../fixtures/auth";

test.describe("WHT Filings", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/tax/withholding/filings");
    await expect(page.locator("main")).toBeVisible();
  });

  test("page title visible", async ({ page }) => {
    await expect(
      page.getByRole("heading", { name: /WHT Filings/i }),
    ).toBeVisible();
  });

  test("period selector renders", async ({ page }) => {
    await expect(
      page.getByRole("button", { name: "Load Period", exact: true }),
    ).toBeVisible();
  });

  test("PND tabs render", async ({ page }) => {
    await page.getByRole("button", { name: /Load Period/i }).click();
    await expect(page.getByRole("tab", { name: "PND 3" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "PND 53" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "PND 54" })).toBeVisible();
  });
});
