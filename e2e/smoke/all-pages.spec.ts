import { test, expect } from "../fixtures/auth";
import { ALL_ROUTES } from "../helpers/routes";

test.describe("Smoke: all pages load", () => {
  for (const route of ALL_ROUTES) {
    test(`${route} loads without error`, async ({ page }) => {
      const response = await page.goto(route);

      // No server errors
      expect(response?.status()).toBeLessThan(500);

      // Main content area renders
      await expect(page.locator("main")).toBeVisible();

      // Did not redirect to sign-in (auth is valid)
      expect(page.url()).not.toContain("/sign-in");

      // No Next.js error overlay
      await expect(page.getByText("Application error")).not.toBeVisible();
    });
  }
});
