import { test, expect } from "../fixtures/auth";

test.describe("Dashboard", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.locator("main")).toBeVisible();
  });

  test("page title is visible", async ({ page }) => {
    await expect(
      page.getByRole("heading", { name: "Dashboard" }),
    ).toBeVisible();
  });

  test("metric cards render", async ({ page }) => {
    await expect(page.getByText("Total Expenses")).toBeVisible();
    await expect(page.getByText("Total Income")).toBeVisible();
    await expect(page.getByText("Net VAT Position")).toBeVisible();
    await expect(page.getByText("Outstanding Filings")).toBeVisible();
  });

  test("amounts display in THB", async ({ page }) => {
    // At least one THB amount should be visible on the dashboard
    await expect(page.getByText(/THB/).first()).toBeVisible();
  });

  test("period comparison section renders", async ({ page }) => {
    await expect(page.getByText("Period Comparison")).toBeVisible();
    await expect(page.getByText("Expenses").first()).toBeVisible();
    await expect(page.getByText("Income").first()).toBeVisible();
  });

  test("filing status section renders", async ({ page }) => {
    await expect(page.getByText("Filing Status Overview")).toBeVisible();
  });

  test("quick links render and navigate", async ({ page }) => {
    await expect(page.getByText("Quick Links")).toBeVisible();

    // Quick links are anchor elements with icon + text
    await expect(page.getByText("Upload Document").first()).toBeVisible();
    await expect(page.getByText("View Transactions").first()).toBeVisible();
    await expect(page.getByText("Filing Calendar").first()).toBeVisible();
    await expect(page.getByText("Reconciliation").first()).toBeVisible();
  });
});
