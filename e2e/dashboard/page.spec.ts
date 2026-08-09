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
        .locator('a[href="/expenses/upload"]')
        .filter({ hasText: "Upload for this month" })
    ).toHaveAttribute("href", "/expenses/upload");
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
    // The satang-split Amount renders bare "0.00" on this card (no THB
    // suffix), so assert a real filing signal instead of currency copy.
    await expect(page.getByText(/PP 30/).first()).toBeVisible();
  });

  test("owner quick actions navigate to core work areas", async ({ page }) => {
    // The quick actions are kit Buttons rendering router Links; Base UI's
    // nativeButton={false} gives the anchor role="button", so they surface
    // as buttons in the accessibility tree while keeping their hrefs.
    const main = page.locator("main");

    await expect(main.getByRole("button", { name: "Bank upload" })).toHaveAttribute(
      "href",
      "/bank-accounts/upload"
    );
    await expect(
      main.getByRole("button", { name: "Documents upload" })
    ).toHaveAttribute("href", "/expenses/upload");
    await expect(
      main.getByRole("button", { name: "Reconciliation" })
    ).toHaveAttribute("href", "/reconciliation");
    await expect(main.getByRole("button", { name: "Tax" })).toHaveAttribute(
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
