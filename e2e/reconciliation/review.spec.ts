import { test, expect } from "../fixtures/auth";

test.describe("Manual Reconciliation", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/reconciliation/review");
    await expect(page.locator("main")).toBeVisible();
  });

  test("page title is visible", async ({ page }) => {
    await expect(
      page.getByRole("heading", { name: /Manual Reconciliation/i }),
    ).toBeVisible();
  });

  test("back link to reconciliation dashboard", async ({ page }) => {
    const backLink = page.getByRole("link", { name: /back|reconciliation/i }).or(
      page.locator("a[href='/reconciliation']"),
    );
    await expect(backLink.first()).toBeVisible();
  });

  test("two-panel layout renders", async ({ page }) => {
    const main = page.locator("main");
    // Card titles contain "Unmatched Transactions" + badge count
    await expect(
      main.locator("[data-slot='card-title']", { hasText: "Unmatched Transactions" }),
    ).toBeVisible();
    await expect(
      main.locator("[data-slot='card-title']", { hasText: "Unmatched Documents" }),
    ).toBeVisible();
  });

  test("instructions text visible", async ({ page }) => {
    await expect(
      page.getByText(/Select transaction.*on the left/i),
    ).toBeVisible();
  });
});
