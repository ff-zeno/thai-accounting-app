import { test, expect } from "../fixtures/auth";

test.describe("Monthly WHT Filings", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/tax/monthly-filings");
    await expect(page.locator("main")).toBeVisible();
  });

  test("page title visible", async ({ page }) => {
    await expect(
      page.getByRole("heading", { name: /Monthly WHT Filings/i }),
    ).toBeVisible();
  });

  test("period selector renders", async ({ page }) => {
    // Year and month selectors should be present
    await expect(page.getByText(/Load Data/i).or(
      page.getByRole("button", { name: /Load/i }),
    )).toBeVisible();
  });

  test("PND tabs render", async ({ page }) => {
    await expect(page.getByText("PND 3").first()).toBeVisible();
    await expect(page.getByText("PND 53").first()).toBeVisible();
  });
});
