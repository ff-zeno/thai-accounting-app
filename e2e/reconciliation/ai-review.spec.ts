import { test, expect } from "../fixtures/auth";

test.describe("AI Match Suggestions", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/reconciliation/ai-review");
    await expect(page.locator("main")).toBeVisible();
  });

  test("page title is visible", async ({ page }) => {
    await expect(
      page.getByRole("heading", { name: /AI Match Suggestions/i }),
    ).toBeVisible();
  });

  test("back link to reconciliation dashboard", async ({ page }) => {
    const backLink = page.locator("a[href='/reconciliation']");
    await expect(backLink.first()).toBeVisible();
  });

  test("shows suggestions or empty state", async ({ page }) => {
    // Either suggestion cards with Approve/Reject, or the empty state
    const approveBtn = page.getByRole("button", { name: /approve/i });
    const emptyState = page.getByText(/No AI suggestions pending/i);

    const hasApprove = await approveBtn.first().isVisible().catch(() => false);
    const hasEmpty = await emptyState.isVisible().catch(() => false);
    expect(hasApprove || hasEmpty).toBe(true);
  });
});
