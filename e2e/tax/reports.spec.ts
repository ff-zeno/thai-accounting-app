import { test, expect } from "../fixtures/auth";

test.describe("Statutory Tax Reports", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/tax/reports");
    await expect(page.locator("main")).toBeVisible();
  });

  test("renders Section 87 output tax report surface", async ({ page }) => {
    await expect(
      page.getByRole("heading", { name: /Statutory Tax Reports/i }),
    ).toBeVisible();
    await expect(page.getByText(/CSV-first v1 workpapers/i)).toBeVisible();
    await expect(page.getByText("Report Filters")).toBeVisible();
    await expect(page.getByText("Output Tax Report", { exact: true })).toBeVisible();
    await expect(page.getByText("Input Tax Report", { exact: true })).toBeVisible();
    await expect(page.getByText("Goods and Raw Materials Report", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: /Download Output CSV/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /Download Input CSV/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /Download Goods CSV/i })).toBeVisible();
    await expect(page.getByText("Daily Totals", { exact: true })).toBeVisible();
    await expect(page.getByText("Movement Detail", { exact: true })).toBeAttached();
  });

  test("has route in primary navigation", async ({ page }) => {
    await expect(
      page.getByRole("link", { name: /Statutory Reports/i }).first(),
    ).toBeVisible();
  });
});
