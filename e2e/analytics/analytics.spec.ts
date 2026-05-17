import { test, expect } from "../fixtures/auth";

test.describe("Analytics and Close", () => {
  test("renders AR aging", async ({ page }) => {
    await page.goto("/analytics/ar-aging");
    await expect(page.locator("main")).toBeVisible();
    await expect(page.getByRole("heading", { name: /AR Aging/i })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: /31-60/ })).toBeVisible();
  });

  test("renders AP aging", async ({ page }) => {
    await page.goto("/analytics/ap-aging");
    await expect(page.locator("main")).toBeVisible();
    await expect(page.getByRole("heading", { name: /AP Aging/i })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: /91\+/ })).toBeVisible();
  });

  test("renders cash forecast", async ({ page }) => {
    await page.goto("/analytics/cash-flow");
    await expect(page.locator("main")).toBeVisible();
    await expect(page.getByRole("heading", { name: /Cash Forecast/i })).toBeVisible();
    await expect(page.getByText("30-day Inflows")).toBeVisible();
    await expect(page.getByText("Payroll Outflows")).toBeVisible();
    await expect(page.getByText("Customer Concentration")).toBeVisible();
  });

  test("renders concentration", async ({ page }) => {
    await page.goto("/analytics/concentration");
    await expect(page.locator("main")).toBeVisible();
    await expect(page.getByRole("heading", { name: /^Concentration$/i })).toBeVisible();
    await expect(page.getByText("Customer Concentration")).toBeVisible();
    await expect(page.getByText("Vendor Concentration")).toBeVisible();
    await expect(page.getByLabel("From")).toBeVisible();
  });

  test("renders profitability", async ({ page }) => {
    await page.goto("/analytics/profitability");
    await expect(page.locator("main")).toBeVisible();
    await expect(page.getByRole("heading", { name: /^Profitability$/i })).toBeVisible();
    await expect(page.getByText("By Cost Center")).toBeVisible();
    await expect(page.getByText("Operating Profit")).toBeVisible();
    await expect(page.getByLabel("From")).toBeVisible();
  });

  test("renders FX rate controls", async ({ page }) => {
    await page.goto("/analytics/fx-rates");
    await expect(page.locator("main")).toBeVisible();
    await expect(page.getByRole("heading", { name: /BOT FX Rates/i })).toBeVisible();
    await expect(page.getByText("FX revaluation is AR/AP v1.")).toBeVisible();
    await expect(page.getByText(/Partially paid documents, bank-account FX/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /Record Rate/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Run Revaluation/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Retry Previous Month End/i })).toBeVisible();
    await expect(page.getByLabel("Source URL")).toBeVisible();
    await expect(page.getByLabel("Valuation date")).toBeVisible();
  });

  test("renders FX rate validation messages", async ({ page }) => {
    await page.goto("/analytics/fx-rates?error=Currency%20must%20be%20a%203-letter%20ISO%20code");
    await expect(page.locator("main")).toBeVisible();
    await expect(page.getByText("Currency must be a 3-letter ISO code")).toBeVisible();
  });

  test("renders close checklist controls", async ({ page }) => {
    await page.goto("/close");
    await expect(page.locator("main")).toBeVisible();
    await expect(page.getByRole("heading", { name: /Close Checklist/i })).toBeVisible();
    await expect(page.getByText(/DBD\/TFRS financial statements/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /Open Checklist/i })).toBeVisible();
    await expect(page.getByText(/Year-end Close Readiness/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /Post Year-end Close/i })).toBeVisible();
    await expect(page.getByText("CIT accrual JE posted")).toBeVisible();
    await expect(page.getByText("Bank reconciliation matched")).toBeVisible();
    await expect(page.getByText("GL Posting Queue Readiness")).toBeVisible();
    const postingQueueLink = page.getByRole("link", { name: /Open posting queue/i });
    await expect(postingQueueLink).toBeVisible();
    await expect(postingQueueLink).toHaveAttribute("href", /throughDate=\d{4}-\d{2}-\d{2}/);
  });
});
