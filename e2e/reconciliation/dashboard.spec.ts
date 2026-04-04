import { test, expect } from "../fixtures/auth";

test.describe("Reconciliation dashboard", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/reconciliation");
    await expect(page.locator("main")).toBeVisible();
  });

  test("page loads without error", async ({ page }) => {
    expect(page.url()).toContain("/reconciliation");
    await expect(page.getByText("Application error")).not.toBeVisible();
  });

  test("Quality Score card is present", async ({ page }) => {
    await expect(page.getByText("Quality Score")).toBeVisible();
  });

  test("stats section shows key metrics", async ({ page }) => {
    // The reconciliation dashboard shows these stat labels
    await expect(page.getByText("Total Transactions")).toBeVisible();
  });

  test("Manual Match button or empty state is present", async ({ page }) => {
    const manualMatch = page.getByText("Manual Match");
    const emptyState = page.getByText(/no unmatched/i);
    const hasManualMatch = await manualMatch.isVisible().catch(() => false);
    const hasEmptyState = await emptyState.isVisible().catch(() => false);
    expect(hasManualMatch || hasEmptyState).toBe(true);
  });

  test("recent sections render", async ({ page }) => {
    await expect(page.getByText(/Recent Unmatched Transactions/i).first()).toBeVisible();
    await expect(page.getByText(/Recent Unmatched Documents/i).first()).toBeVisible();
    await expect(page.getByText(/Recent Matches/i).first()).toBeVisible();
  });

  test("stats cards show match rate", async ({ page }) => {
    await expect(page.getByText(/Match Rate/i).first()).toBeVisible();
  });

  test("unmatched sections render", async ({ page }) => {
    await expect(page.getByText(/Unmatched Transactions/i).first()).toBeVisible();
    await expect(page.getByText(/Unmatched Documents/i).first()).toBeVisible();
  });
});
