import { test, expect } from "../fixtures/auth";

test.describe("Reconciliation insights", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/reconciliation/insights");
    await expect(page.locator("main")).toBeVisible();
  });

  test("heading is visible", async ({ page }) => {
    await expect(
      page.getByRole("heading", { name: "Reconciliation Insights" }),
    ).toBeVisible();
  });

  test("Export PDF button is visible", async ({ page }) => {
    await expect(page.getByText("Export PDF")).toBeVisible();
  });

  test("health summary banner is visible", async ({ page }) => {
    // HealthSummary renders a colored banner with a status message
    // It always contains one of: "running smoothly", "Needs attention", "Action needed"
    const banner = page.locator(
      '[class*="bg-green-50"], [class*="bg-amber-50"], [class*="bg-red-50"]',
    );
    await expect(banner.first()).toBeVisible();
  });
});
