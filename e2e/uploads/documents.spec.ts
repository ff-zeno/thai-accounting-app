import { test, expect } from "../fixtures/auth";

test.describe("Document upload", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/documents/upload");
    await expect(page.locator("main")).toBeVisible();
  });

  test("Upload Documents heading is visible", async ({ page }) => {
    await expect(
      page.getByRole("heading", { name: "Upload Documents" }),
    ).toBeVisible();
  });

  test("upload form tabs are rendered", async ({ page }) => {
    // The upload page has expense/income tabs via UploadTabs component
    await expect(page.locator("form, [role='tablist']").first()).toBeVisible();
  });
});
