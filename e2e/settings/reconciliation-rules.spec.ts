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
    // Either the empty-state template picker or the rules-list heading, both
    // scoped inside main (the settings tab strip also says "Reconciliation
    // Rules").
    const templateSection = page
      .locator("main")
      .getByText(/Set up your business type/i);
    const rulesHeading = page
      .locator("main")
      .getByRole("heading", { name: "Reconciliation Rules" });
    await expect(templateSection.or(rulesHeading).first()).toBeVisible();
  });

  test("create rule button visible", async ({ page }) => {
    await expect(
      page.getByRole("button", { name: /Create Rule/i }).or(
        page.getByRole("link", { name: /Create Rule/i }),
      ),
    ).toBeVisible();
  });
});
