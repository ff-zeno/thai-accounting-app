import { test, expect } from "../fixtures/auth";

test.describe("Cost centers and projects settings", () => {
  test("renders cost center management", async ({ page }) => {
    await page.goto("/settings/cost-centers");
    await expect(page.locator("main")).toBeVisible();
    await expect(page.getByRole("heading", { name: /Cost Centers/i })).toBeVisible();
    await expect(page.getByLabel("Code")).toBeVisible();
    await expect(page.getByRole("button", { name: /Create Cost Center/i })).toBeVisible();
  });

  test("renders project management", async ({ page }) => {
    await page.goto("/settings/projects");
    await expect(page.locator("main")).toBeVisible();
    await expect(page.getByRole("heading", { name: /Projects/i })).toBeVisible();
    await expect(page.getByLabel("Customer")).toBeVisible();
    await expect(page.getByRole("button", { name: /Create Project/i })).toBeVisible();
  });

  test("renders allocation rule management", async ({ page }) => {
    await page.goto("/settings/allocation-rules");
    await expect(page.locator("main")).toBeVisible();
    await expect(page.getByRole("heading", { name: /Allocation Rules/i })).toBeVisible();
    await expect(page.getByLabel("Rule name")).toBeVisible();
    await expect(page.getByRole("button", { name: /Create Allocation Rule/i })).toBeVisible();
  });
});
