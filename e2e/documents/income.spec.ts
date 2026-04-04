import { test, expect } from "../fixtures/auth";

test.describe("Documents: Income", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/documents/income");
    await expect(page.locator("main")).toBeVisible();
  });

  test("page title is visible", async ({ page }) => {
    await expect(
      page.getByRole("heading", { name: "Income" }),
    ).toBeVisible();
  });

  test("upload button visible", async ({ page }) => {
    await expect(page.getByText("Upload Documents").first()).toBeVisible();
  });

  test("document table renders with columns", async ({ page }) => {
    const table = page.locator("table");
    await expect(table).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Issue Date" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Vendor" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Total Amount" })).toBeVisible();
  });

  test("select-all checkbox is present", async ({ page }) => {
    await expect(
      page.getByRole("checkbox", { name: "Select all" }),
    ).toBeVisible();
  });

  test("document count shown", async ({ page }) => {
    await expect(page.getByText(/documents shown/)).toBeVisible();
  });
});
