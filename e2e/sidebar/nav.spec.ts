import { test, expect } from "../fixtures/auth";

test.describe("Sidebar navigation", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.locator("main")).toBeVisible();
  });

  test("all 6 group headers are visible", async ({ page }) => {
    const nav = page.locator("nav");
    const groups = [
      "Overview",
      "Banking",
      "Documents",
      "Processing",
      "Tax & Filing",
      "Management",
    ];
    for (const group of groups) {
      await expect(nav.getByRole("button", { name: group })).toBeVisible();
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

  test("collapse inactive group hides its links", async ({ page }) => {
    const nav = page.locator("nav");
    const taxButton = nav.getByRole("button", { name: "Tax & Filing" });

    // Tax & Filing is inactive on /dashboard — chevron starts rotated (expanded)
    const chevron = taxButton.locator("svg");
    await expect(chevron).toHaveClass(/rotate-90/);

    // Collapse it — chevron loses rotation, grid container switches class
    await taxButton.click();
    await expect(chevron).not.toHaveClass(/rotate-90/);
    // The grid div is a sibling of the button inside the group wrapper
    const groupDiv = taxButton.locator("..");
    const gridContainer = groupDiv.locator("> div.grid");
    await expect(gridContainer).toHaveClass(/grid-rows-\[0fr\]/);

    // Re-expand — chevron rotates again
    await taxButton.click();
    await expect(chevron).toHaveClass(/rotate-90/);
    await expect(gridContainer).toHaveClass(/grid-rows-\[1fr\]/);
  });

  test("active group stays expanded when toggled", async ({ page }) => {
    const nav = page.locator("nav");
    const overviewButton = nav.getByRole("button", { name: "Overview" });
    const dashboardLink = nav.getByRole("link", { name: "Dashboard" });

    // Overview is active on /dashboard — always expanded
    await expect(dashboardLink).toBeVisible();

    // Clicking the active group header should not collapse it
    await overviewButton.click();
    await expect(dashboardLink).toBeVisible();
  });

  test("clicking a nav link navigates to the correct page", async ({
    page,
  }) => {
    const bankLink = page
      .locator("nav")
      .getByRole("link", { name: "Bank Accounts" });
    await bankLink.click();
    await page.waitForURL("**/bank-accounts");
    expect(page.url()).toContain("/bank-accounts");
  });
});
