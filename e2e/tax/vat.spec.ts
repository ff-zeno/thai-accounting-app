import { test, expect } from "../fixtures/auth";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import {
  addVatFilingLine,
  createPp36Obligation,
  createVatFilingDraft,
  markVatFilingDraftFiled,
  recordPp36FilingPayment,
} from "@/lib/db/queries/vat-operations-ledger";

const E2E_ORG_ID = "95aead7c-9942-474f-b48e-2ec5b46f10c9";
const E2E_ACTOR_ID = "00000000-0000-4000-8000-000000000085";

function addMonths(year: number, month: number, offset: number) {
  const zeroBased = year * 12 + (month - 1) + offset;
  return {
    year: Math.floor(zeroBased / 12),
    month: (zeroBased % 12) + 1,
  };
}

function isoDate(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

async function seedPp36PaymentToReclaimFixture() {
  const now = new Date();
  const target = addMonths(now.getFullYear(), now.getMonth() + 1, 1);
  const paymentDate = isoDate(target.year, target.month, 15);
  const fixtureKey = `e2e-pp36-reclaim-${target.year}-${String(target.month).padStart(2, "0")}`;

  const existing = await db
    .select({ id: schema.pp36Obligations.id })
    .from(schema.pp36Obligations)
    .where(
      sql`${schema.pp36Obligations.orgId} = ${E2E_ORG_ID}
        AND ${schema.pp36Obligations.sourceSnapshot}->>'fixtureKey' = ${fixtureKey}
        AND ${schema.pp36Obligations.deletedAt} IS NULL`
    )
    .limit(1);

  if (existing.length > 0) return;

  await db.transaction(async (tx) => {
    await tx
      .insert(schema.users)
      .values({
        id: E2E_ACTOR_ID,
        orgId: E2E_ORG_ID,
        name: "E2E VAT Fixture",
        email: "e2e-vat-fixture@example.com",
        role: "accountant",
      })
      .onConflictDoNothing({ target: schema.users.id });

    const [vendor] = await tx
      .insert(schema.vendors)
      .values({
        orgId: E2E_ORG_ID,
        name: "E2E PP36 Reclaim Vendor",
        entityType: "foreign",
        country: "SG",
      })
      .returning();
    const [doc] = await tx
      .insert(schema.documents)
      .values({
        orgId: E2E_ORG_ID,
        vendorId: vendor.id,
        direction: "expense",
        type: "invoice",
        status: "confirmed",
        issueDate: paymentDate,
        documentNumber: fixtureKey,
        subtotal: "1000.00",
        vatAmount: "70.00",
        totalAmount: "1070.00",
      })
      .returning();

    const obligation = await createPp36Obligation({
      tx,
      orgId: E2E_ORG_ID,
      sourceDocumentId: doc.id,
      vendorId: vendor.id,
      vendorCountryCode: "SG",
      serviceDescription: "E2E foreign service PP36 reclaim",
      baseAmountThb: "1000.00",
      vatAmount: "70.00",
      vatRate: "0.0700",
      occurredOn: paymentDate,
      paymentDate,
      taxPointDate: paymentDate,
      periodBasis: "payment_date",
      sourceSnapshot: { fixtureKey, documentNumber: fixtureKey },
    });

    const filing = await createVatFilingDraft({
      tx,
      orgId: E2E_ORG_ID,
      filingType: "pp36",
      periodYear: target.year,
      periodMonth: target.month,
    });
    await addVatFilingLine({
      tx,
      orgId: E2E_ORG_ID,
      filingId: filing.id,
      lineType: "pp36_obligation",
      pp36ObligationId: obligation.id,
      amount: "70.00",
      vatAmount: "70.00",
      frozenSnapshot: { fixtureKey, obligationId: obligation.id },
    });
    await markVatFilingDraftFiled({
      tx,
      orgId: E2E_ORG_ID,
      filingId: filing.id,
      actorId: E2E_ACTOR_ID,
      filedAt: new Date(`${paymentDate}T00:00:00+07:00`),
    });
    await recordPp36FilingPayment({
      tx,
      orgId: E2E_ORG_ID,
      filingId: filing.id,
      actorId: E2E_ACTOR_ID,
      paidAt: new Date(`${paymentDate}T00:00:00+07:00`),
      amount: "70.00",
      receiptNo: `E2E-${fixtureKey}`,
      idempotencyKey: fixtureKey,
    });
  });
}

test.describe("VAT Management", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeAll(async () => {
    await seedPp36PaymentToReclaimFixture();
  });

  test.beforeEach(async ({ page }) => {
    await page.goto("/tax/vat");
    await expect(page.locator("main")).toBeVisible();
  });

  test("page title visible", async ({ page }) => {
    await expect(
      page.getByRole("heading", { name: /VAT Dashboard/i }),
    ).toBeVisible();
  });

  test("subtitle describes VAT status and drilldowns", async ({ page }) => {
    await expect(page.getByText(/VAT status/i)).toBeVisible();
  });

  test("period selector with Load Period button", async ({ page }) => {
    await expect(page.locator("main").getByText("Year", { exact: true })).toBeVisible();
    await expect(page.locator("main").getByText("Month", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Load Period/i }),
    ).toBeVisible();
  });

  test("initial state prompts to load period", async ({ page }) => {
    await expect(
      page.getByText(/Select a period and click Load Period/i),
    ).toBeVisible();
  });

  test("ledger subroutes render", async ({ page }) => {
    const routes = [
      { path: "/tax/vat/input", heading: /Input VAT/i },
      { path: "/tax/vat/output", heading: /Output VAT/i },
      { path: "/tax/vat/register", heading: /VAT Register/i },
      { path: "/tax/vat/filings", heading: /VAT Filings/i },
      { path: "/tax/vat/forecast", heading: /VAT Forecast/i },
    ];

    for (const route of routes) {
      await page.goto(route.path);
      await expect(page.locator("main")).toBeVisible();
      await expect(page.getByRole("heading", { name: route.heading })).toBeVisible();
    }
  });

  test("forecast shows seeded paid PP36 reclaim eligibility", async ({ page }) => {
    const now = new Date();
    const target = addMonths(now.getFullYear(), now.getMonth() + 1, 1);
    const periodLabel = `${String(target.month).padStart(2, "0")}/${target.year}`;

    await page.goto("/tax/vat/forecast");
    const periodRow = page.locator("table").first().getByRole("row", {
      name: new RegExp(periodLabel),
    });

    await expect(periodRow).toBeVisible();
    await expect(periodRow.getByText("1 / 70.00")).toBeVisible();
    await expect(page.getByText("PP36 Reclaim Tracker")).toBeVisible();
    await expect(page.getByText("E2E foreign service PP36 reclaim")).toBeVisible();
  });
});
