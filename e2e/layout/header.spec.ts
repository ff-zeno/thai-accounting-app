import { test, expect } from "../fixtures/auth";

test.describe("App layout & header", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.locator("main")).toBeVisible();
  });

  test("app brand name visible in sidebar", async ({ page }) => {
    await expect(page.getByText("Long Dtua").first()).toBeVisible();
  });

  test("org switcher shows current org", async ({ page }) => {
    await expect(
      page.getByRole("button", { name: "Lumera" }),
    ).toBeVisible();
  });

  test("user menu button visible", async ({ page }) => {
    await expect(
      page.getByRole("button", { name: /Open user menu/i }),
    ).toBeVisible();
  });

  test("locale switcher visible", async ({ page }) => {
    // Should show current locale toggle
    const localeSwitcher = page.getByRole("button", { name: /ไทย|English/i });
    await expect(localeSwitcher).toBeVisible();
  });

  test("sidebar is visible on desktop", async ({ page }) => {
    await expect(page.locator("nav")).toBeVisible();
  });
});
