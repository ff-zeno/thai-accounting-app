import { test, expect } from "../fixtures/auth";

test.describe("App layout & header", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.locator("main")).toBeVisible();
  });

  test("app brand name visible in sidebar", async ({ page }) => {
    await expect(page.getByText("Long Tua").first()).toBeVisible();
  });

  test("org switcher shows current org", async ({ page }) => {
    await expect(page.getByRole("button", { name: "Lumera" })).toBeVisible();
  });

  test("user menu button visible in top bar", async ({ page }) => {
    await expect(
      page.getByRole("button", { name: /Open user menu/i })
    ).toBeVisible();
  });

  test("locale switcher visible in top bar", async ({ page }) => {
    const localeSwitcher = page.getByRole("button", { name: /ไทย|English/i });
    await expect(localeSwitcher).toBeVisible();
  });

  test("capture shortcut visible in top bar", async ({ page }) => {
    // Kit Button rendered as a Link exposes role=button (Base UI useButton).
    await expect(
      page.getByRole("button", { name: "Capture", exact: true })
    ).toHaveAttribute("href", "/capture");
  });

  test("sidebar is visible on desktop", async ({ page }) => {
    await expect(
      page.getByRole("navigation", { name: "Primary navigation" })
    ).toBeVisible();
  });
});
