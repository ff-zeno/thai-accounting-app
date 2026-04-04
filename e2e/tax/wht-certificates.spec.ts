import { test, expect } from "../fixtures/auth";

test.describe("WHT Certificates", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/tax/wht-certificates");
    await expect(page.locator("main")).toBeVisible();
  });

  test("page title and subtitle visible", async ({ page }) => {
    await expect(
      page.getByRole("heading", { name: "WHT Certificates" }),
    ).toBeVisible();
    await expect(page.getByText("50 Tawi")).toBeVisible();
  });

  test("filter dropdowns render", async ({ page }) => {
    // Shadcn Select renders as combobox triggers showing "all" values
    await expect(page.getByRole("combobox").first()).toBeVisible();
  });

  test("certificate table or empty state renders", async ({ page }) => {
    const table = page.locator("table");
    const emptyState = page.getByText(/No WHT certificates found/i);
    const hasTable = await table.isVisible().catch(() => false);
    const hasEmpty = await emptyState.isVisible().catch(() => false);
    expect(hasTable || hasEmpty).toBe(true);
  });
});
