import { test, expect } from "../fixtures/auth";

test.describe("Filing Calendar", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/tax/calendar");
    await expect(page.locator("main")).toBeVisible();
  });

  test("page title visible", async ({ page }) => {
    await expect(
      page.getByRole("heading", { name: /Filing Calendar/i }),
    ).toBeVisible();
  });

  test("year navigation renders", async ({ page }) => {
    // Current year badge should be visible
    const currentYear = new Date().getFullYear().toString();
    await expect(page.getByText(currentYear).first()).toBeVisible();
  });

  test("legend card renders", async ({ page }) => {
    await expect(page.getByText("Upcoming").first()).toBeVisible();
    await expect(page.getByText("Filed").first()).toBeVisible();
  });

  test("month rows displayed", async ({ page }) => {
    // Calendar shows abbreviated months like "Jan 2026", "Feb 2026"
    await expect(page.getByText(/Jan 20\d{2}/).first()).toBeVisible();
    await expect(page.getByText(/Dec 20\d{2}/).first()).toBeVisible();
  });

  test("PND columns in table", async ({ page }) => {
    await expect(page.getByText("PND 3").first()).toBeVisible();
    await expect(page.getByText("PND 53").first()).toBeVisible();
  });
});
