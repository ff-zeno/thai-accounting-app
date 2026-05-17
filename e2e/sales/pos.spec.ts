import { test, expect } from "../fixtures/auth";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";

const E2E_ORG_ID = "95aead7c-9942-474f-b48e-2ec5b46f10c9";

async function ensureHeadOffice() {
  const [existingHeadOffice] = await db
    .select()
    .from(schema.establishments)
    .where(
      sql`${schema.establishments.orgId} = ${E2E_ORG_ID}
        AND ${schema.establishments.branchNumber} = '00000'`
    )
    .limit(1);
  if (existingHeadOffice) return existingHeadOffice;
  const [headOffice] = await db
    .insert(schema.establishments)
    .values({
      orgId: E2E_ORG_ID,
      branchNumber: "00000",
      nameEn: "Head Office",
      isHeadOffice: true,
      vatRegistered: true,
    })
    .returning();
  return headOffice;
}

async function seedPendingChannelBalance() {
  const headOffice = await ensureHeadOffice();
  const fixtureKey = `e2e-pending-card-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
  await db.insert(schema.salesTransactions).values({
    orgId: E2E_ORG_ID,
    establishmentId: headOffice.id,
    eventRole: "pos_primary",
    source: "e2e-sales-page",
    externalId: fixtureKey,
    soldAt: new Date("2026-05-03T05:00:00.000Z"),
    channel: "card",
    pricingMode: "vat_inclusive",
    taxInvoiceType: "simplified",
    taxInvoiceNumber: `E2E-${fixtureKey.slice(-8)}`,
    amountIncludingVat: "535.00",
    taxBaseExVat: "500.00",
    vatAmount: "35.00",
    clearingAccountKey: fixtureKey,
    settlementStatus: "pending",
  });
  return fixtureKey;
}

test.describe("Sales Control Tower", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/sales");
    await expect(page.locator("main")).toBeVisible();
  });

  test("renders POS source-ledger controls", async ({ page }) => {
    await expect(
      page.getByRole("heading", { name: /Sales Control Tower/i }),
    ).toBeVisible();
    await expect(page.getByText("Sales controls are manual/CSV v1.")).toBeVisible();
    await expect(page.getByText(/Processor matching, cash variance resolution/i)).toBeVisible();
    await expect(page.getByText("Gross POS Sales")).toBeVisible();
    await expect(page.getByText("Money In Pipe")).toBeVisible();
    await expect(page.getByText("Channel Balances", { exact: true })).toBeVisible();
    await expect(page.getByText("Manual POS Sale")).toBeVisible();
    await expect(page.getByText("POS CSV Import")).toBeVisible();
    await expect(page.getByText("Cash Deposit Slip")).toBeVisible();
    await expect(page.getByText("Processor Settlement", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /Record Sale/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Import POS CSV/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Record Deposit/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Record Settlement/i })).toBeVisible();
  });

  test("renders pending channel balances with aggregate date values", async ({ page }) => {
    const fixtureKey = await seedPendingChannelBalance();
    await page.goto("/sales");
    await expect(page.locator("main")).toBeVisible();
    const row = page.getByRole("row").filter({ hasText: fixtureKey });
    await expect(row).toBeVisible();
    await expect(row.getByText("2026-05-03")).toBeVisible();
    await expect(row.getByText("535.00")).toBeVisible();
  });

  test("has route in primary navigation", async ({ page }) => {
    await expect(page.getByRole("link", { name: /Sales/i }).first()).toBeVisible();
  });
});
