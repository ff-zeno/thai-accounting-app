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
    // HealthSummary always renders one of these status messages; asserting
    // the copy survives palette changes (the old bg-green-50 classes became
    // bg-success/10 tokens in the Ink Neutral reset).
    await expect(
      page.getByText(/running smoothly|Needs attention|Action needed/).first(),
    ).toBeVisible();
  });
});
