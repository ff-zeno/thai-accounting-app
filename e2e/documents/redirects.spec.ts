import { test, expect } from "../fixtures/auth";

/**
 * Documents split into Income and Expenses on 2026-08-05. DESIGN.md's "URLs
 * never move for IA reasons" rule was amended for that split on the basis
 * that deep links keep working — which is only true while these stubs do.
 */
test.describe("Documents route redirects", () => {
  const cases: Array<{ from: string; to: string }> = [
    { from: "/documents/expenses", to: "/expenses" },
    { from: "/documents/income", to: "/income" },
    { from: "/documents/upload", to: "/expenses/upload" },
    { from: "/documents/upload?direction=expense", to: "/expenses/upload" },
    { from: "/documents/upload?direction=income", to: "/income/upload" },
  ];

  for (const { from, to } of cases) {
    test(`${from} lands on ${to}`, async ({ page }) => {
      await page.goto(from);
      await expect(page.locator("main")).toBeVisible();
      expect(new URL(page.url()).pathname).toBe(to);
    });
  }
});
