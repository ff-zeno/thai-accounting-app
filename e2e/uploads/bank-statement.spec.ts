import { test, expect } from "../fixtures/auth";

test.describe("Bank statement upload", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/bank-accounts/upload");
    await expect(page.locator("main")).toBeVisible();
  });

  test("Upload Statement heading is visible", async ({ page }) => {
    await expect(
      page.getByRole("heading", { name: "Upload Statement" }),
    ).toBeVisible();
  });

  test("dropzone area renders", async ({ page }) => {
    // The upload zone has a dashed border (border-dashed class)
    const dropzone = page.locator('[class*="border-dashed"]');
    await expect(dropzone).toBeVisible();
  });
});
