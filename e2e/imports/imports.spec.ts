import { test, expect } from "../fixtures/auth";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";

const E2E_ORG_ID = "95aead7c-9942-474f-b48e-2ec5b46f10c9";
// One fixed account shared by every run — never create per-run accounts
// (mirrors the golden-path find-or-create convention).
const IMPORTS_ACCOUNT_NUMBER = "IMP-E2E-FIXED-0001";

async function findOrCreateImportsBankAccount() {
  const [existing] = await db
    .select({ id: schema.bankAccounts.id })
    .from(schema.bankAccounts)
    .where(
      and(
        eq(schema.bankAccounts.orgId, E2E_ORG_ID),
        eq(schema.bankAccounts.accountNumber, IMPORTS_ACCOUNT_NUMBER)
      )
    )
    .limit(1);
  if (existing) return existing.id;
  const [created] = await db
    .insert(schema.bankAccounts)
    .values({
      orgId: E2E_ORG_ID,
      bankCode: "KBANK",
      accountNumber: IMPORTS_ACCOUNT_NUMBER,
      accountName: "E2E Imports Bank",
      currency: "THB",
    })
    .returning({ id: schema.bankAccounts.id });
  return created.id;
}

/**
 * Remove transactions prior runs seeded on the fixed imports account, BEFORE
 * this run — never after, so a failed run leaves its state for debugging.
 * import_payments.bank_transaction_id is NOT NULL with a unique
 * (org_id, bank_transaction_id) index, so each run seeds a fresh transaction
 * and deletes the previous ones here (payment links first).
 */
async function cleanupPriorImportTransactions(bankAccountId: string) {
  await db.transaction(async (tx) => {
    await tx.execute(sql`
      DELETE FROM import_payments
      WHERE org_id = ${E2E_ORG_ID}
        AND bank_transaction_id IN (
          SELECT id FROM transactions
          WHERE org_id = ${E2E_ORG_ID} AND bank_account_id = ${bankAccountId}
        )
    `);
    await tx.execute(sql`
      DELETE FROM reconciliation_matches
      WHERE org_id = ${E2E_ORG_ID}
        AND transaction_id IN (
          SELECT id FROM transactions
          WHERE org_id = ${E2E_ORG_ID} AND bank_account_id = ${bankAccountId}
        )
    `);
    await tx.execute(sql`
      DELETE FROM transactions
      WHERE org_id = ${E2E_ORG_ID} AND bank_account_id = ${bankAccountId}
    `);
  });
}

async function seedImportPaymentTransaction(reference: string) {
  const bankAccountId = await findOrCreateImportsBankAccount();
  await cleanupPriorImportTransactions(bankAccountId);
  const [transaction] = await db
    .insert(schema.transactions)
    .values({
      orgId: E2E_ORG_ID,
      bankAccountId,
      date: "2026-05-05",
      description: `Import payment ${reference}`,
      amount: "-10700.00",
      type: "debit",
      externalRef: `import-payment-${reference}`,
    })
    .returning();
  return transaction;
}

test.describe("Imports Control Tower", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/imports");
    await expect(page.locator("main")).toBeVisible();
  });

  test("renders import packet workflow controls", async ({ page }) => {
    await expect(
      page.getByRole("heading", { name: /Imports Control Tower/i }),
    ).toBeVisible();
    await expect(page.getByText("Imports are v1 packet controls.")).toBeVisible();
    await expect(page.getByText(/Direct-clear customs depth/i)).toBeVisible();
    await expect(page.getByText("Open Packets")).toBeVisible();
    await expect(page.getByText("Assessed Import VAT")).toBeVisible();
    await expect(page.getByText("Open Import Aging")).toBeVisible();
    await expect(page.getByText("New Import Packet")).toBeVisible();
    await expect(page.getByRole("button", { name: /Create Packet/i })).toBeVisible();
  });

  test("has route in primary navigation", async ({ page }) => {
    await expect(page.getByRole("link", { name: /Imports Control/i }).first()).toBeVisible();
  });

  test("creates a packet and opens finalize workflow controls", async ({ page }) => {
    const reference = `PW-${Date.now()}`;
    await page.getByLabel("Import reference").fill(reference);
    await page.getByLabel("Customs declaration").fill(`DECL-${reference}`);
    await page.getByLabel("Arrival port").fill("Laem Chabang");
    await page.getByLabel("Currency").fill("JPY");
    await page.getByLabel("Arrival date").fill("2026-05-01");
    await page.getByLabel("Customs clearance").fill("2026-05-03");
    await page.getByLabel("FX at clearance").fill("0.23500000");
    await page.getByLabel("Duty THB").fill("0.00");
    await page.getByLabel("Excise THB").fill("0.00");
    await page.getByLabel("Import VAT THB").fill("700.00");
    await page.getByRole("button", { name: /Create Packet/i }).click();

    await expect(page.getByRole("link", { name: reference }).first()).toBeVisible();
    await expect(page.getByText("Days open")).toBeVisible();
    await page.getByRole("link", { name: reference }).first().click();

    await expect(page.getByRole("button", { name: /Add Goods Line/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Add Import VAT Line/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Add Broker Charge/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Link Document/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Link Payment/i })).toBeVisible();
    await expect(page.getByText("Import Audit Trail")).toBeVisible();
    await expect(page.getByRole("button", { name: /Finalize to Inventory/i })).toBeVisible();
    await expect(page.getByText("Edit Packet Header")).toBeVisible();
    await expect(page.getByRole("button", { name: /Delete Packet/i })).toBeVisible();
  });

  test("edits and deletes an empty open packet", async ({ page }) => {
    const reference = `PW-EDIT-${Date.now()}`;
    const editedReference = `${reference}-2`;
    await page.getByLabel("Import reference").fill(reference);
    await page.getByLabel("Customs declaration").fill(`DECL-${reference}`);
    await page.getByLabel("Arrival port").fill("Laem Chabang");
    await page.getByLabel("Currency").fill("JPY");
    await page.getByLabel("Arrival date").fill("2026-05-01");
    await page.getByLabel("Customs clearance").fill("2026-05-03");
    await page.getByLabel("FX at clearance").fill("0.23500000");
    await page.getByLabel("Import VAT THB").fill("0.00");
    await page.getByRole("button", { name: /Create Packet/i }).click();

    await page.getByRole("link", { name: reference }).first().click();
    const headerForm = page
      .getByRole("button", { name: /Save Header/i })
      .locator("xpath=ancestor::form");
    await headerForm.locator('input[name="importReference"]').fill(editedReference);
    await headerForm.locator('input[name="customsDeclarationNumber"]').fill(`DECL-${editedReference}`);
    await headerForm.locator('input[name="arrivalPort"]').fill("Suvarnabhumi");
    await headerForm.locator('input[name="notes"]').fill("owner corrected header");
    await page.getByRole("button", { name: /Save Header/i }).click();

    await expect(page.getByRole("heading", { name: editedReference })).toBeVisible();
    await expect(page.getByText("Import packet updated.")).toBeVisible();

    await page.getByRole("button", { name: /Delete Packet/i }).click();
    await expect(page).toHaveURL(/\/imports/);
    await expect(page.getByRole("link", { name: editedReference })).toHaveCount(0);
  });

  test("deletes open goods and charge lines", async ({ page }) => {
    test.setTimeout(60_000);
    page.on("dialog", (dialog) => dialog.accept());
    const reference = `PW-LINES-${Date.now()}`;
    await page.getByLabel("Import reference").fill(reference);
    await page.getByLabel("Customs declaration").fill(`DECL-${reference}`);
    await page.getByLabel("Arrival port").fill("Laem Chabang");
    await page.getByLabel("Currency").fill("JPY");
    await page.getByLabel("Arrival date").fill("2026-05-01");
    await page.getByLabel("Customs clearance").fill("2026-05-03");
    await page.getByLabel("FX at clearance").fill("0.23500000");
    await page.getByLabel("Import VAT THB").fill("700.00");
    await page.getByRole("button", { name: /Create Packet/i }).click();
    await page.getByRole("link", { name: reference }).first().click();

    await page.getByLabel("SKU").fill("SKU-DEL");
    await page.getByLabel("Qty").fill("1");
    await page.getByLabel("Unit price").fill("1000");
    await page.getByLabel("THB value").fill("235.00");
    await page.getByRole("button", { name: /Add Goods Line/i }).click();
    await expect(page.getByText("SKU-DEL")).toBeVisible();

    await page.getByLabel("Evidence no.").fill(`RCPT-${reference}`);
    await page.getByLabel("Import VAT THB").fill("700.00");
    await page.getByRole("button", { name: /Add Import VAT Line/i }).click();
    await expect(page.getByText("Customs import VAT").last()).toBeVisible();

    await page.getByRole("button", { name: /Delete Goods Line/i }).click();
    await expect(page.getByText("SKU-DEL")).toHaveCount(0);

    await page.getByRole("button", { name: /Delete Charge Line/i }).click();
    await expect(page.getByText("No broker or customs charge lines linked yet.")).toBeVisible();

    await page.getByLabel("Document no.").fill(`SUP-${reference}`);
    await page.getByRole("button", { name: /Link Document/i }).click();
    await expect(page.getByRole("cell", { name: "foreign_supplier_invoice" }).first()).toBeVisible();
    await page.getByRole("button", { name: /Unlink Document/i }).click();
    await expect(page.getByText("Foreign invoice, customs declaration, broker bill, and evidence links.")).toBeVisible();

    const paymentTxn = await seedImportPaymentTransaction(reference);
    await page.reload();
    const paymentForm = page
      .getByRole("button", { name: /Link Payment/i })
      .locator("xpath=ancestor::form");
    await paymentForm.getByLabel("Amount THB").fill("10700.00");
    await paymentForm.getByLabel("Bank transaction").selectOption(paymentTxn.id);
    await page.getByRole("button", { name: /Link Payment/i }).click();
    await expect(page.getByRole("cell", { name: "broker_settlement" }).first()).toBeVisible();
    await page.getByRole("button", { name: /Unlink Payment/i }).click();
    await expect(page.getByText("Foreign supplier, broker, shipper, and customs payment trace.")).toBeVisible();
  });
});
