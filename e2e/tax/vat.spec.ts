import { test, expect } from "../fixtures/auth";

test.describe("VAT Management", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/tax/vat");
    await expect(page.locator("main")).toBeVisible();
  });

  test("page title visible", async ({ page }) => {
    await expect(
      page.getByRole("heading", { name: /VAT Management/i }),
    ).toBeVisible();
  });

  test("subtitle describes PP 30 and PP 36", async ({ page }) => {
    await expect(page.getByText(/PP 30 and PP 36/i)).toBeVisible();
  });

  test("period selector with Load Period button", async ({ page }) => {
    await expect(page.getByText("Year")).toBeVisible();
    await expect(page.getByText("Month", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Load Period/i }),
    ).toBeVisible();
  });

  test("initial state prompts to load period", async ({ page }) => {
    await expect(
      page.getByText(/Select a period and click Load Period/i),
    ).toBeVisible();
  });
});
