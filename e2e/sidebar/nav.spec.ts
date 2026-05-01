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
});
