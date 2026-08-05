import { test, expect } from "../fixtures/auth";

test.describe("Settings: AI", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/settings/ai");
    await expect(page.locator("main")).toBeVisible();
  });

  test("AI model pickers render", async ({ page }) => {
    await expect(page.getByText(/Document Extraction/i).first()).toBeVisible();
  });

  test("budget settings section renders", async ({ page }) => {
    await expect(page.getByText(/Monthly Budget/i).first()).toBeVisible();
  });

  test("save settings button visible", async ({ page }) => {
    await expect(
      page.getByRole("button", { name: /Save/i }),
    ).toBeVisible();
  });
});
