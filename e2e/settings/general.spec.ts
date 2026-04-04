import { test, expect } from "../fixtures/auth";

test.describe("Settings: General", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/settings");
    await expect(page.locator("main")).toBeVisible();
  });

  test("org settings form renders", async ({ page }) => {
    // Should show org name fields
    await expect(page.getByText(/Name/i).first()).toBeVisible();
  });

  test("tax ID field visible", async ({ page }) => {
    await expect(page.getByText(/Tax ID/i).first()).toBeVisible();
  });

  test("VAT registered toggle visible", async ({ page }) => {
    await expect(page.getByText(/VAT Registered/i)).toBeVisible();
  });

  test("save button visible", async ({ page }) => {
    await expect(
      page.getByRole("button", { name: /Save/i }),
    ).toBeVisible();
  });
});
