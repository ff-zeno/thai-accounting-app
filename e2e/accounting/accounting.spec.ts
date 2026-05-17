import { test, expect } from "../fixtures/auth";

test.describe("General Ledger", () => {
  test("renders chart of accounts and opening balance controls", async ({ page }) => {
    await page.goto("/accounting");
    await expect(page.locator("main")).toBeVisible();
    await expect(page.getByRole("heading", { name: /General Ledger/i })).toBeVisible();
    await expect(page.getByText("General ledger is compact v1.")).toBeVisible();
    await expect(page.getByText(/Bulk opening balance import, advanced journal grids/i)).toBeVisible();
    await expect(page.getByText("Net Income", { exact: true })).toBeVisible();
    await expect(page.getByText("Inventory 1160", { exact: true })).toBeVisible();
    await expect(page.getByText("SKU Inventory", { exact: true })).toBeVisible();
    await expect(page.getByText("Inventory Variance", { exact: true })).toBeVisible();
    await expect(page.getByText("Chart of Accounts", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /Post Opening Balance/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Post Manual Journal/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Reverse Journal/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Close GL Period/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /View all/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /GL detail/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /Trial balance/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /Open balance sheet/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /Open profit and loss/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /Posting queue/i })).toBeVisible();
  });

  test("renders journal entry list route", async ({ page }) => {
    await page.goto("/accounting/journal");
    await expect(page.locator("main")).toBeVisible();
    await expect(page.getByRole("heading", { name: /Journal Entries/i })).toBeVisible();
    await expect(page.getByText(/No journal entries yet|Recent Journal Entries/i)).toBeVisible();
  });

  test("renders general ledger detail route", async ({ page }) => {
    await page.goto("/accounting/reports/general-ledger");
    await expect(page.locator("main")).toBeVisible();
    await expect(page.getByRole("heading", { name: /General Ledger Detail/i })).toBeVisible();
    await expect(page.getByText(/No ledger lines yet|Ledger Lines/i)).toBeVisible();
    await expect(page.getByRole("columnheader", { name: /Running balance/i })).toBeVisible();
    await expect(page.locator('input[name="startDate"]')).toBeVisible();
    await expect(page.locator('input[name="endDate"]')).toBeVisible();
    await expect(page.getByRole("link", { name: /Download CSV/i })).toBeVisible();
  });

  test("renders trial balance route", async ({ page }) => {
    await page.goto("/accounting/reports/trial-balance");
    await expect(page.locator("main")).toBeVisible();
    await expect(page.getByRole("heading", { name: /Trial Balance/i })).toBeVisible();
    await expect(page.getByText(/Accounts as of/i)).toBeVisible();
    await expect(page.getByRole("link", { name: /Download CSV/i })).toBeVisible();
  });

  test("renders profit and loss route", async ({ page }) => {
    await page.goto("/accounting/reports/profit-loss");
    await expect(page.locator("main")).toBeVisible();
    await expect(page.getByRole("heading", { name: /Profit and Loss/i })).toBeVisible();
    await expect(page.getByText(/Net income/i)).toBeVisible();
    await expect(page.getByRole("link", { name: /Download CSV/i })).toBeVisible();
  });

  test("renders balance sheet route", async ({ page }) => {
    await page.goto("/accounting/reports/balance-sheet");
    await expect(page.locator("main")).toBeVisible();
    await expect(page.getByRole("heading", { name: /Balance Sheet/i })).toBeVisible();
    await expect(page.getByRole("cell", { name: "Balance check" })).toBeVisible();
    await expect(page.getByRole("link", { name: /Download CSV/i })).toBeVisible();
  });

  test("renders posting queue route", async ({ page }) => {
    await page.goto("/accounting/posting-exceptions");
    await expect(page.locator("main")).toBeVisible();
    await expect(page.getByRole("heading", { name: /Posting Queue/i })).toBeVisible();
    await expect(page.getByText("Queue Filter", { exact: true })).toBeVisible();
    await expect(page.locator('input[type="date"][name="throughDate"]')).toBeVisible();
    await expect(page.getByRole("button", { name: /Drain Queue/i })).toBeDisabled();
    await expect(page.getByText("Open Posting Exceptions", { exact: true })).toBeVisible();
    await expect(page.getByText("Recent Outbox Rows", { exact: true })).toBeVisible();

    await page.goto("/accounting/posting-exceptions?throughDate=2026-05-31");
    await expect(page.getByRole("button", { name: /Drain Queue/i })).toBeEnabled();

    await page.goto("/accounting/posting-exceptions?postingMessage=Drain%20complete");
    await expect(page.getByText("Drain complete", { exact: true })).toBeVisible();
  });

  test("has route in primary navigation", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByRole("link", { name: /Accounting/i })).toBeVisible();
  });
});
