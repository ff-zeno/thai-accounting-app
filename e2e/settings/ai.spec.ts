import { test, expect } from "../fixtures/auth";

test.describe("Settings: AI", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/settings/ai");
    await expect(page.locator("main")).toBeVisible();
  });

  test("AI model pickers render", async ({ page }) => {
    await expect(page.getByText(/Document Extraction/i).first()).toBeVisible();
  });

  test("budget settings section renders", async ({ page }) => {
    await expect(page.getByText(/Monthly Budget/i).first()).toBeVisible();
  });

  test("copilot provider controls render", async ({ page }) => {
    await expect(page.getByText(/Copilot Controls/i)).toBeVisible();
    await expect(page.getByText(/live model orchestration is preview-only/i)).toBeVisible();
    await expect(page.getByLabel("Provider")).toBeVisible();
    await expect(page.getByRole("textbox", { name: /^Model$/ })).toBeVisible();
    await expect(page.getByLabel("API key secret reference")).toBeVisible();
    // Role query, not getByLabel: the wrapping <label> associates both the
    // Base UI checkbox span and its hidden native input, so getByLabel is
    // ambiguous under strict mode. The role query targets the a11y tree only.
    await expect(
      page.getByRole("checkbox", { name: "Enable live model orchestration" }),
    ).toBeVisible();
  });

  test("rejects raw copilot provider keys", async ({ page }) => {
    await page.getByLabel("API key secret reference").fill("sk-proj-do-not-store");
    await page.getByRole("button", { name: /Save/i }).click();

    await expect(
      page.getByText("Copilot API key secret reference cannot be a raw provider key"),
    ).toBeVisible();
  });

  test("save settings button visible", async ({ page }) => {
    await expect(
      page.getByRole("button", { name: /Save/i }),
    ).toBeVisible();
  });
});
