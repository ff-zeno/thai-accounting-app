import { test, expect } from "../fixtures/auth";

test.describe("CIT Workbench", () => {
  test("renders projected PND.51 controls", async ({ page }) => {
    await page.goto("/year-end/cit");
    await expect(page.locator("main")).toBeVisible();
      await expect(page.getByRole("heading", { name: /CIT Workbench/i })).toBeVisible();
      await expect(page.getByText(/DBD\/TFRS financial statements/i)).toBeVisible();
      await expect(page.getByText("CIT is working-paper v1.")).toBeVisible();
      await expect(page.getByText(/exact RD transfer-pricing form/i)).toBeVisible();
      await expect(page.getByText("Projected PND.51 Draft")).toBeVisible();
      await expect(page.getByText("Actual H1 PND.51 Draft", { exact: true })).toBeVisible();
      await expect(page.getByText("Annual PND.50 Draft")).toBeVisible();
      await expect(page.getByText("GL PND.50 Draft", { exact: true })).toBeVisible();
      await expect(page.getByText("Transfer Pricing", { exact: true })).toBeVisible();
      await expect(page.getByText("Book-tax Adjustments", { exact: true })).toBeVisible();
      await expect(page.getByText("Loss Carry-forward Layer", { exact: true })).toBeVisible();
      await expect(page.getByText("Loss Carry-forward Layers")).toBeVisible();
      await expect(page.getByRole("button", { name: /Build PND.51 Draft/i })).toBeVisible();
      await expect(
        page.getByRole("button", { name: /Build Actual H1 PND.51 Draft/i }),
      ).toBeVisible();
      await expect(page.getByRole("button", { name: /Build PND.50 Draft/i })).toBeVisible();
      await expect(page.getByRole("button", { name: /Build GL PND.50 Draft/i })).toBeVisible();
      await expect(page.getByRole("button", { name: /Refresh TP Flag/i })).toBeVisible();
      await expect(page.getByLabel("Related-party transactions")).toBeVisible();
      await expect(page.getByRole("button", { name: /Build TP Disclosure/i })).toBeVisible();
      await expect(page.getByRole("button", { name: /Record Adjustment/i })).toBeVisible();
      await expect(
        page.getByRole("button", { name: /Sync Entertainment Addback/i }),
      ).toBeVisible();
      await expect(page.getByText("Losses used")).toBeVisible();
      await expect(page.getByText("Loss disclosure")).toBeVisible();
      await expect(page.getByRole("columnheader", { name: "WHT credits" })).toBeVisible();
      await expect(page.getByRole("columnheader", { name: "Accept" })).toBeVisible();
      await expect(page.getByRole("columnheader", { name: "Payment" })).toBeVisible();
      await expect(page.getByRole("columnheader", { name: "Accrual" })).toBeVisible();
      await expect(
        page.getByRole("button", { name: /Sync Depreciation Addback/i }),
      ).toBeVisible();
      await expect(page.getByLabel("Expire before tax year")).toBeVisible();
      await expect(page.getByRole("button", { name: /Expire Old Layers/i })).toBeVisible();
  });
});
