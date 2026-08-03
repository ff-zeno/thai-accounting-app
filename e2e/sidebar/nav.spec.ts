import { test, expect } from "../fixtures/auth";

test.describe("Sidebar navigation", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.locator("main")).toBeVisible();
  });

  test("top-level entries are visible", async ({ page }) => {
    const primaryNav = page.getByRole("navigation", {
      name: "Primary navigation",
    });

    for (const entry of ["Home", "Bank", "Documents", "Tax", "More"]) {
      await expect(
        primaryNav.getByRole("link", { name: entry, exact: true })
      ).toBeVisible();
    }
    // Settings lives in the sidebar footer, outside the nav landmark.
    await expect(
      page.getByRole("link", { name: "Settings", exact: true })
    ).toBeVisible();

    // Reconciliation is nested under Bank, Admin is gone, and the e2e org
    // has POS sales disabled so the gated Sales entry must not render.
    await expect(
      primaryNav.getByRole("link", { name: "Reconciliation" })
    ).toHaveCount(0);
    await expect(primaryNav.getByRole("link", { name: "Admin" })).toHaveCount(0);
    await expect(
      primaryNav.getByRole("link", { name: "Sales", exact: true })
    ).toHaveCount(0);
  });

  test("active entry has aria-current and active styling on /dashboard", async ({
    page,
  }) => {
    const homeLink = page
      .getByRole("navigation", { name: "Primary navigation" })
      .getByRole("link", { name: "Home", exact: true });
    await expect(homeLink).toBeVisible();
    await expect(homeLink).toHaveAttribute("aria-current", "page");
    await expect(homeLink).toHaveClass(/bg-accent/);
    await expect(homeLink).toHaveClass(/font-semibold/);
  });

  test("clicking an entry navigates and expands its children in place", async ({
    page,
  }) => {
    const primaryNav = page.getByRole("navigation", {
      name: "Primary navigation",
    });
    await primaryNav.getByRole("link", { name: "Bank", exact: true }).click();
    await page.waitForURL("**/bank-accounts");

    // Bank's only sidebar child is the reconciliation section home —
    // upload and the recon sub-surfaces live in the pages' tab strips,
    // never as a second copy in the sidebar.
    await expect(
      primaryNav.getByRole("link", { name: "Reconciliation", exact: true })
    ).toBeVisible();
    await expect(
      primaryNav.getByRole("link", { name: "Upload Statement" })
    ).toHaveCount(0);
  });

  test("keyboard roving: arrows move focus, Enter activates, End jumps to Settings", async ({
    page,
  }) => {
    const primaryNav = page.getByRole("navigation", {
      name: "Primary navigation",
    });
    const homeLink = primaryNav.getByRole("link", { name: "Home", exact: true });
    const bankLink = primaryNav.getByRole("link", { name: "Bank", exact: true });

    await homeLink.focus();
    await page.keyboard.press("ArrowDown");
    await expect(bankLink).toBeFocused();
    // Arrow movement alone must not navigate.
    expect(page.url()).toContain("/dashboard");

    await page.keyboard.press("Enter");
    await page.waitForURL("**/bank-accounts");

    await bankLink.focus();
    await page.keyboard.press("End");
    await expect(
      page.getByRole("link", { name: "Settings", exact: true })
    ).toBeFocused();
  });

  test("VAT forecast is reachable via Tax → VAT → tab strip", async ({
    page,
  }) => {
    const primaryNav = page.getByRole("navigation", {
      name: "Primary navigation",
    });
    await primaryNav.getByRole("link", { name: "Tax", exact: true }).click();
    await page.waitForURL("**/tax");

    // The sidebar stops at one child level under Tax; deeper VAT surfaces
    // are the /tax/vat tab strip.
    for (const child of [
      "VAT",
      "Withholding Tax",
      "Compliance Calendar",
      "Statutory Reports",
    ]) {
      await expect(
        primaryNav.getByRole("link", { name: child, exact: true })
      ).toBeVisible();
    }
    await expect(
      primaryNav.getByRole("link", { name: "VAT Forecast" })
    ).toHaveCount(0);

    await primaryNav.getByRole("link", { name: "VAT", exact: true }).click();
    await page.waitForURL("**/tax/vat");

    const sectionNav = page.getByRole("navigation", {
      name: "Section navigation",
    });
    const forecastTab = sectionNav.getByRole("link", { name: "VAT Forecast" });
    await expect(forecastTab).toBeVisible();
    await forecastTab.click();
    await page.waitForURL("**/tax/vat/forecast");
  });

  test("advanced links are grouped under More", async ({ page }) => {
    const primaryNav = page.getByRole("navigation", {
      name: "Primary navigation",
    });
    await primaryNav.getByRole("link", { name: "More", exact: true }).click();
    await page.waitForURL("**/vendors");

    await expect(
      primaryNav.getByRole("link", { name: "Vendors", exact: true })
    ).toBeVisible();
    await expect(
      primaryNav.getByRole("link", { name: "General Ledger", exact: true })
    ).toBeVisible();
  });

  test("mobile bottom bar and More sheet expose the full tree", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/dashboard");

    const mobileNav = page.getByRole("navigation", {
      name: "Mobile navigation",
    });
    await expect(
      mobileNav.getByRole("link", { name: "Home", exact: true })
    ).toBeVisible();
    await expect(
      mobileNav.getByRole("link", { name: "Bank", exact: true })
    ).toBeVisible();
    await expect(
      mobileNav.getByRole("link", { name: "Tax", exact: true })
    ).toBeVisible();
    await expect(
      mobileNav.getByRole("link", { name: "Capture", exact: true })
    ).toHaveAttribute("href", "/capture");

    await mobileNav.getByRole("button", { name: "More", exact: true }).click();
    const moreNav = page.getByRole("navigation", { name: "More navigation" });
    await expect(
      moreNav.getByRole("link", { name: "Withholding Tax", exact: true })
    ).toBeVisible();
    await expect(
      moreNav.getByRole("link", { name: "Extraction Health" })
    ).toBeVisible();
  });
});
