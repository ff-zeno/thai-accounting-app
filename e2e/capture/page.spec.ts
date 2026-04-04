import { test, expect } from "../fixtures/auth";

test.describe("Capture", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/capture");
    await expect(page.locator("main")).toBeVisible();
  });

  test("page title visible", async ({ page }) => {
    await expect(
      page.getByRole("heading", { name: "Capture" }),
    ).toBeVisible();
  });

  test("direction toggle renders", async ({ page }) => {
    await expect(page.getByText("Expense").first()).toBeVisible();
    await expect(page.getByText("Income").first()).toBeVisible();
  });

  test("take photo button visible", async ({ page }) => {
    await expect(
      page.getByRole("button", { name: /Take Photo/i }),
    ).toBeVisible();
  });
});
