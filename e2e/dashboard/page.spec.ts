import { test, expect } from "../fixtures/auth";

test.describe("Dashboard", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.locator("main")).toBeVisible();
  });

  test("owner Home title is visible", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Home" })).toBeVisible();
  });

  test("owner Home sections render", async ({ page }) => {
    await expect(page.getByText("Needs your attention")).toBeVisible();
    await expect(page.getByText("Monthly checklist")).toBeVisible();
    await expect(page.getByText("This month's tax")).toBeVisible();
  });

  test("monthly checklist shows owner workflow steps", async ({ page }) => {
    await expect(page.getByRole("link", { name: /Bank statements/i })).toHaveAttribute(
      "href",
      "/bank-accounts/upload"
    );
    await expect(
      page
        .locator('a[href="/documents/upload"]')
        .filter({ hasText: "Upload for this month" })
    ).toHaveAttribute("href", "/documents/upload");
    await expect(
      page.locator('a[href="/reconciliation"]').filter({ hasText: "Reconciliation" }).last()
    ).toHaveAttribute("href", "/reconciliation");
    await expect(page.getByRole("link", { name: /VAT review/i })).toHaveAttribute(
      "href",
      "/tax/vat"
    );
    await expect(page.getByRole("link", { name: /WHT review/i })).toHaveAttribute(
      "href",
      "/tax/withholding"
    );
  });

  test("tax summary displays VAT and filing signals", async ({ page }) => {
    await expect(page.getByText("Net VAT Position")).toBeVisible();
    await expect(page.getByText("Outstanding Filings")).toBeVisible();
    await expect(page.getByText(/THB/).first()).toBeVisible();
  });

  test("owner quick actions navigate to core work areas", async ({ page }) => {
    const main = page.locator("main");

    await expect(main.getByRole("link", { name: "Bank upload" })).toHaveAttribute(
      "href",
      "/bank-accounts/upload"
    );
    await expect(
      main.getByRole("link", { name: "Documents upload" })
    ).toHaveAttribute("href", "/documents/upload");
    await expect(
      main.getByRole("link", { name: "Reconciliation" }).first()
    ).toHaveAttribute("href", "/reconciliation");
    await expect(main.getByRole("link", { name: "Tax" })).toHaveAttribute(
      "href",
      "/tax/vat"
    );
  });

  test("old dashboard sections are not owner-visible", async ({ page }) => {
    await expect(page.getByText("Period Comparison")).toHaveCount(0);
    await expect(page.getByText("Analytics Overview")).toHaveCount(0);
    await expect(page.getByText("Quick Links")).toHaveCount(0);
  });
});
