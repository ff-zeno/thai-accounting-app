import { test, expect } from "../fixtures/auth";

test.describe("Documents: Expenses", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/documents/expenses");
    await expect(page.locator("main")).toBeVisible();
  });

  test("page title is visible", async ({ page }) => {
    await expect(
      page.getByRole("heading", { name: "Expenses" }),
    ).toBeVisible();
  });

  test("upload button visible", async ({ page }) => {
    await expect(page.getByText("Upload Documents").first()).toBeVisible();
  });

  test("document table renders with columns", async ({ page }) => {
    const table = page.locator("table");
    await expect(table).toBeVisible();
    // Check key column headers
    await expect(page.getByRole("columnheader", { name: "Issue Date" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Vendor" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Total Amount" })).toBeVisible();
  });

  test("search input is present", async ({ page }) => {
    await expect(page.getByRole("textbox")).toBeVisible();
  });

  test("filters button is present", async ({ page }) => {
    await expect(
      page.getByRole("button", { name: "Filters" }),
    ).toBeVisible();
  });

  test("document count shown", async ({ page }) => {
    await expect(page.getByText(/documents shown/)).toBeVisible();
  });
});
