import { test, expect } from "../fixtures/auth";

test.describe("Bank Accounts list", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/bank-accounts");
    await expect(page.locator("main")).toBeVisible();
  });

  test("page title is visible", async ({ page }) => {
    await expect(
      page.getByRole("heading", { name: "Bank Accounts" }),
    ).toBeVisible();
  });

  test("add account card is visible", async ({ page }) => {
    await expect(page.getByText("Add Bank Account")).toBeVisible();
  });

  test("add account dialog opens", async ({ page }) => {
    await page.getByText("Add Bank Account").click();
    // Dialog should appear with form fields
    await expect(
      page.getByRole("dialog").or(page.locator("[role=dialog]")),
    ).toBeVisible();
  });
});
