import { test, expect } from "../fixtures/auth";

test.describe("Sidebar navigation", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.locator("main")).toBeVisible();
  });

  test("tier-1 categories are visible", async ({ page }) => {
    const categories = [
      "Overview",
      "Documents",
      "Banking",
      "Tax & Filing",
      "Management",
      "Admin",
    ];
    for (const category of categories) {
      await expect(
        page.getByRole("link", { name: category }).first()
      ).toBeVisible();
    }
  });

  test("active link has correct styling on /dashboard", async ({ page }) => {
    const dashboardLink = page
      .locator("nav")
      .getByRole("link", { name: "Dashboard" });
    await expect(dashboardLink).toBeVisible();
    await expect(dashboardLink).toHaveClass(/bg-accent/);
    await expect(dashboardLink).toHaveClass(/font-semibold/);
  });

  test("tier-1 category changes tier-2 panel", async ({ page }) => {
    await page.getByRole("link", { name: "Banking" }).first().click();
    await page.waitForURL("**/bank-accounts");
    await expect(
      page.locator("nav").getByRole("link", { name: "Upload Statement" })
    ).toBeVisible();
  });

  test("keyboard arrows switch tier-1 categories", async ({ page }) => {
    const overviewLink = page.getByRole("link", { name: "Overview" }).first();
    await overviewLink.focus();
    await page.keyboard.press("ArrowDown");
    await page.waitForURL("**/documents/expenses");
    await expect(
      page
        .getByRole("navigation", { name: "Section navigation" })
        .getByRole("link", { name: "Expenses" })
    ).toBeVisible();

    await page.keyboard.press("End");
    await page.waitForURL("**/admin/extraction-health");
    await expect(
      page
        .getByRole("navigation", { name: "Section navigation" })
        .getByRole("link", { name: "Extraction Health" })
    ).toBeVisible();
  });

  test("clicking a nav link navigates to the correct page", async ({
    page,
  }) => {
    await page.getByRole("link", { name: "Banking" }).first().click();
    const bankLink = page
      .locator("nav")
      .getByRole("link", { name: "Bank Accounts" });
    await bankLink.click();
    await page.waitForURL("**/bank-accounts");
    expect(page.url()).toContain("/bank-accounts");
  });

  test("VAT forecast appears in the Tax section", async ({ page }) => {
    await page.getByRole("link", { name: "Tax & Filing" }).first().click();
    const forecastLink = page
      .getByRole("navigation", { name: "Section navigation" })
      .getByRole("link", { name: "VAT Forecast" });
    await expect(forecastLink).toBeVisible();
    await forecastLink.click();
    await page.waitForURL("**/tax/vat/forecast");
  });

  test("mobile drawer exposes tier categories and section links", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/dashboard");
    await page.getByRole("button", { name: "Toggle menu" }).click();
    await page.getByRole("button", { name: "Tax & Filing" }).click();
    await expect(
      page
        .getByRole("navigation", { name: "Mobile navigation" })
        .getByRole("link", { name: "VAT Forecast" })
    ).toBeVisible();
  });
});
