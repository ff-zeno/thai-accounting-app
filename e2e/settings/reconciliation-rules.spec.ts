import { test, expect } from "../fixtures/auth";

test.describe("Settings: Reconciliation Rules", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/settings/reconciliation-rules");
    await expect(page.locator("main")).toBeVisible();
  });

  test("settings page with reconciliation rules tab", async ({ page }) => {
    await expect(
      page.getByRole("heading", { name: "Settings" }),
    ).toBeVisible();
    // Reconciliation Rules tab is active
    await expect(page.getByText("Reconciliation Rules").first()).toBeVisible();
  });

  test("template picker or rules list visible", async ({ page }) => {
    const templateSection = page.getByText(/Set up your business type/i);
    const rulesList = page.getByText("Reconciliation Rules").nth(1);
    const hasTemplate = await templateSection.isVisible().catch(() => false);
    const hasRules = await rulesList.isVisible().catch(() => false);
    expect(hasTemplate || hasRules).toBe(true);
  });

  test("create rule button visible", async ({ page }) => {
    await expect(
      page.getByRole("button", { name: /Create Rule/i }).or(
        page.getByRole("link", { name: /Create Rule/i }),
      ),
    ).toBeVisible();
  });
});
