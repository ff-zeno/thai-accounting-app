import { test, expect } from "../fixtures/auth";

test.describe("Accounting Copilot", () => {
  test("renders read-only tool runner and event table", async ({ page }) => {
    await page.goto("/copilot");
    await expect(page.locator("main")).toBeVisible();
    await expect(page.getByRole("heading", { name: /Accounting Copilot/i })).toBeVisible();
    await expect(page.getByText(/Live model orchestration is preview-only/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /Ask Copilot/i })).toBeVisible();
    await expect(page.getByLabel("Prompt")).toBeVisible();
    await expect(page.getByRole("button", { name: /Run Tool/i })).toBeVisible();
    await expect(page.getByLabel("Tool", { exact: true })).toHaveValue("search_documents");
    await expect(page.getByLabel("Target account")).toBeVisible();
    await expect(page.getByLabel("Confirmation")).toBeVisible();
    await expect(page.getByText("preview_recode_documents").nth(1)).toBeVisible();
    await expect(page.getByText("create_accountant_review_task").nth(1)).toBeVisible();
    await expect(page.getByText("apply_recode_documents").nth(1)).toBeVisible();
    await expect(page.getByText("Recent Tool Events")).toBeVisible();
  });
});
