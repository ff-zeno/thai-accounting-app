import { test, expect } from "../fixtures/auth";

test.describe("Reports", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/reports");
    await expect(page.locator("main")).toBeVisible();
  });

  test("page title visible", async ({ page }) => {
    await expect(
      page.getByRole("heading", { name: "Reports" }),
    ).toBeVisible();
  });

  test("direction tabs render", async ({ page }) => {
    await expect(page.getByText("Expenses").first()).toBeVisible();
    await expect(page.getByText("Income").first()).toBeVisible();
  });

  test("export cards render", async ({ page }) => {
    await expect(page.getByText("FlowAccount").first()).toBeVisible();
    await expect(page.getByText("Peak").first()).toBeVisible();
    await expect(page.getByText(/Full Data/i).first()).toBeVisible();
  });
});
