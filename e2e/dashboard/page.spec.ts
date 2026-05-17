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

  test("analytics overview widgets render", async ({ page }) => {
    await expect(page.getByText("Analytics Overview")).toBeVisible();
    await expect(page.getByText("Projected 30-day Cash")).toBeVisible();
    await expect(page.getByText("Cash Runway")).toBeVisible();
    await expect(page.getByText("Open AR / AP")).toBeVisible();
    await expect(page.getByText("DSO")).toBeVisible();
  });

  test("analytics overview widgets link to drilldowns", async ({ page }) => {
    await expect(
      page.getByRole("link", { name: "Projected 30-day Cash" }),
    ).toHaveAttribute("href", "/analytics/cash-flow");
    await expect(
      page.getByRole("link", { name: "Cash Runway" }),
    ).toHaveAttribute("href", "/analytics/cash-flow");
    await expect(
      page.getByRole("link", { name: "Open AR / AP" }),
    ).toHaveAttribute("href", "/analytics/ar-aging");
    await expect(page.getByRole("link", { name: "DSO" })).toHaveAttribute(
      "href",
      "/analytics/ar-aging",
    );
    await expect(
      page.getByRole("link", { name: /Payroll outflows/i }),
    ).toHaveAttribute("href", "/payroll");
    await expect(
      page.getByRole("link", { name: /^Depreciation$/i }),
    ).toHaveAttribute("href", "/fixed-assets/reports/roll-forward");
    await expect(
      page.getByRole("link", { name: /Concentration/i }),
    ).toHaveAttribute("href", "/analytics/concentration");
    await expect(
      page.getByRole("link", { name: /Profitability/i }),
    ).toHaveAttribute("href", "/analytics/profitability");
  });

  test("filing status section renders", async ({ page }) => {
    await expect(page.getByText("Filing Status Overview").first()).toBeVisible();
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
