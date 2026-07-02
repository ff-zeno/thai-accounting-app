import { test, expect } from "../fixtures/auth";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { buildPp36VatFilingDraft } from "@/lib/db/queries/vat-operations-ledger";

const E2E_ORG_ID = "95aead7c-9942-474f-b48e-2ec5b46f10c9";
const E2E_ACTOR_ID = "00000000-0000-4000-8000-000000000085";
const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

async function seedReviewLearningFixture() {
  const fixtureKey = `e2e-review-learning-${Date.now()}`;
  const [vendor] = await db
    .insert(schema.vendors)
    .values({
      orgId: E2E_ORG_ID,
      name: "E2E Learning Vendor",
      taxId: "0105566000001",
      entityType: "company",
      country: "TH",
    })
    .returning();
  const [doc] = await db
    .insert(schema.documents)
    .values({
      orgId: E2E_ORG_ID,
      vendorId: vendor.id,
      direction: "expense",
      type: "invoice",
      status: "draft",
      issueDate: "2026-05-15",
      documentNumber: `${fixtureKey}-ai`,
      subtotal: "1000.00",
      vatAmount: "70.00",
      totalAmount: "1070.00",
      currency: "THB",
      aiConfidence: "0.62",
      needsReview: true,
    })
    .returning();
  await db.insert(schema.documentFiles).values({
    orgId: E2E_ORG_ID,
    documentId: doc.id,
    fileUrl: "https://example.test/e2e-learning.pdf",
    fileType: "application/pdf",
    originalFilename: "e2e-learning.pdf",
    pipelineStatus: "completed",
    aiRawResponse: {
      documentNumber: `${fixtureKey}-ai`,
      issueDate: "2026-05-15",
      subtotal: "1000.00",
      vatAmount: "70.00",
      totalAmount: "1070.00",
      currency: "THB",
    },
  });
  await db.insert(schema.extractionLog).values({
    orgId: E2E_ORG_ID,
    documentId: doc.id,
    vendorId: vendor.id,
    tierUsed: 1,
    modelUsed: "e2e-fixture",
    inngestIdempotencyKey: fixtureKey,
  });
  return {
    docId: doc.id,
    correctedDocumentNumber: `${fixtureKey}-corrected`,
  };
}

async function seedForeignVendorReviewFixture() {
  const fixtureKey = `e2e-foreign-review-${Date.now()}`;
  const [vendor] = await db
    .insert(schema.vendors)
    .values({
      orgId: E2E_ORG_ID,
      name: "TikTok Pte Ltd E2E",
      entityType: "foreign",
      country: "SG",
    })
    .returning();
  const [doc] = await db
    .insert(schema.documents)
    .values({
      orgId: E2E_ORG_ID,
      vendorId: vendor.id,
      direction: "expense",
      type: "invoice",
      status: "draft",
      issueDate: "2026-05-15",
      documentNumber: fixtureKey,
      subtotal: "1000.00",
      vatAmount: "0.00",
      totalAmount: "1000.00",
      currency: "SGD",
      exchangeRate: "27.000000",
      totalAmountThb: "27000.00",
      isPp36Subject: true,
      aiConfidence: "0.71",
      needsReview: true,
    })
    .returning();
  return { docId: doc.id };
}

async function seedTikTokUploadReplayFixture() {
  const stamp = Date.now();
  // Per-run-unique VAT period in the PAST (2000-2014) so confirmed fixture
  // documents can never sort above real documents in date-sorted views, and
  // staying below 2015 keeps them clear of any plausible real period.
  const targetYear = 2000 + (stamp % 15);
  const targetMonth = (Math.floor(stamp / 1000) % 12) + 1;
  const issueDate = `${targetYear}-${String(targetMonth).padStart(2, "0")}-15`;
  const fixtureKey = `e2e-tiktok-pp36-${stamp}`;
  await db
    .insert(schema.users)
    .values({
      id: E2E_ACTOR_ID,
      orgId: E2E_ORG_ID,
      name: "E2E VAT Fixture",
      email: "e2e-vat-fixture@example.com",
      role: "accountant",
    })
    .onConflictDoNothing({ target: schema.users.id });
  const [vendor] = await db
    .insert(schema.vendors)
    .values({
      orgId: E2E_ORG_ID,
      name: "TikTok Pte. Ltd. E2E",
      entityType: "foreign",
      country: "SG",
    })
    .returning();
  const [doc] = await db
    .insert(schema.documents)
    .values({
      orgId: E2E_ORG_ID,
      vendorId: vendor.id,
      direction: "expense",
      type: "invoice",
      status: "draft",
      issueDate,
      documentNumber: `${fixtureKey}-THTT`,
      subtotal: "1000.00",
      vatAmount: "0.00",
      totalAmount: "1000.00",
      currency: "THB",
      totalAmountThb: "1000.00",
      category: "online_ads",
      isPp36Subject: true,
      aiConfidence: "0.95",
      needsReview: true,
    })
    .returning();
  await db.insert(schema.documentFiles).values({
    orgId: E2E_ORG_ID,
    documentId: doc.id,
    fileUrl: "https://example.test/tiktok-e2e-invoice.pdf",
    fileType: "application/pdf",
    originalFilename: "THTT202601830303-LUMERA(THAILAND) CO.,LTD-Invoice.pdf",
    pipelineStatus: "completed",
    aiRawResponse: {
      vendorName: "TikTok Pte. Ltd.",
      vendorCountry: "SG",
      documentNumber: `${fixtureKey}-THTT`,
      issueDate,
      subtotal: "1000.00",
      vatAmount: "0.00",
      totalAmount: "1000.00",
      currency: "THB",
    },
  });
  await db.insert(schema.documentLineItems).values({
    orgId: E2E_ORG_ID,
    documentId: doc.id,
    description: "TikTok advertising services",
    quantity: "1.0000",
    unitPrice: "1000.00",
    amount: "1000.00",
    vatAmount: "0.00",
  });
  return { docId: doc.id, targetYear, targetMonth };
}

async function seedFullTaxInvoiceReviewFixture() {
  const fixtureKey = `e2e-full-ti-${Date.now()}`;
  const supplierTaxId = `0105566${String(Date.now() % 1_000_000).padStart(6, "0")}`;
  await db
    .update(schema.organizations)
    .set({ taxId: "0105566000001", branchNumber: "00000" })
    .where(sql`${schema.organizations.id} = ${E2E_ORG_ID}`);
  const [vendor] = await db
    .insert(schema.vendors)
    .values({
      orgId: E2E_ORG_ID,
      name: "E2E Full TI Supplier",
      taxId: supplierTaxId,
      branchNumber: "00000",
      isVatRegistered: true,
      entityType: "company",
      country: "TH",
    })
    .returning();
  const [doc] = await db
    .insert(schema.documents)
    .values({
      orgId: E2E_ORG_ID,
      vendorId: vendor.id,
      direction: "expense",
      type: "invoice",
      status: "draft",
      issueDate: "2026-05-15",
      documentNumber: fixtureKey,
      subtotal: "1000.00",
      vatAmount: "70.00",
      totalAmount: "1070.00",
      currency: "THB",
      taxInvoiceSubtype: "full_ti",
      aiConfidence: "0.93",
      needsReview: true,
    })
    .returning();
  return { docId: doc.id, supplierTaxId };
}

async function seedCapitalizationFixture() {
  const fixtureKey = `e2e-capitalize-${Date.now()}`;
  const [vendor] = await db
    .insert(schema.vendors)
    .values({
      orgId: E2E_ORG_ID,
      name: "E2E Office Equipment Vendor",
      taxId: "0105566000002",
      entityType: "company",
      country: "TH",
    })
    .returning();
  const [doc] = await db
    .insert(schema.documents)
    .values({
      orgId: E2E_ORG_ID,
      vendorId: vendor.id,
      direction: "expense",
      type: "invoice",
      status: "confirmed",
      issueDate: "2026-05-15",
      documentNumber: fixtureKey,
      subtotal: "10000.00",
      vatAmount: "700.00",
      totalAmount: "10700.00",
      currency: "THB",
      category: "equipment",
      aiConfidence: "0.94",
      needsReview: false,
    })
    .returning();
  await db.insert(schema.documentFiles).values({
    orgId: E2E_ORG_ID,
    documentId: doc.id,
    fileUrl: "https://example.test/e2e-capitalization.pdf",
    fileType: "application/pdf",
    originalFilename: "e2e-capitalization.pdf",
    pipelineStatus: "completed",
  });
  return { docId: doc.id };
}

async function seedInventoryReceiptFixture() {
  const fixtureKey = `e2e-inventory-receipt-${Date.now()}`;
  const [vendor] = await db
    .insert(schema.vendors)
    .values({
      orgId: E2E_ORG_ID,
      name: "E2E Inventory Vendor",
      taxId: "0105566000003",
      entityType: "company",
      country: "TH",
    })
    .returning();
  const [sku] = await db
    .insert(schema.skus)
    .values({
      orgId: E2E_ORG_ID,
      skuCode: fixtureKey,
      nameEn: "E2E inventory item",
      standardCost: "120.0000",
    })
    .returning();
  const [doc] = await db
    .insert(schema.documents)
    .values({
      orgId: E2E_ORG_ID,
      vendorId: vendor.id,
      direction: "expense",
      type: "invoice",
      status: "confirmed",
      issueDate: "2026-05-15",
      documentNumber: fixtureKey,
      subtotal: "1200.00",
      vatAmount: "84.00",
      totalAmount: "1284.00",
      currency: "THB",
      category: "inventory",
      aiConfidence: "0.94",
      needsReview: false,
    })
    .returning();
  await db.insert(schema.documentLineItems).values({
    orgId: E2E_ORG_ID,
    documentId: doc.id,
    description: "Inventory item",
    quantity: "10.0000",
    unitPrice: "120.00",
    amount: "1200.00",
  });
  await db.insert(schema.documentFiles).values({
    orgId: E2E_ORG_ID,
    documentId: doc.id,
    fileUrl: "https://example.test/e2e-inventory-receipt.pdf",
    fileType: "application/pdf",
    originalFilename: "e2e-inventory-receipt.pdf",
    pipelineStatus: "completed",
  });
  return { docId: doc.id, skuId: sku.id };
}

test.describe("Document review learning", () => {
  test("saving a correction note creates a draft correction session", async ({ page }) => {
    const fixture = await seedReviewLearningFixture();

    await page.goto(`/documents/${fixture.docId}/review`);
    await expect(page.getByRole("heading", { name: /Document Review/i })).toBeVisible();
    await expect(page.getByLabel("Correction note")).toBeVisible();

    await page.getByLabel("Document #").fill(fixture.correctedDocumentNumber);
    await page
      .getByLabel("Correction note")
      .fill("For this vendor, use the tax invoice number at the top right.");
    await page.getByRole("button", { name: /^Save$/i }).click();
    await expect(page.getByText("Document updated")).toBeVisible();

    await expect
      .poll(async () => {
        const [row] = await db
          .select({ count: sql<number>`COUNT(*)::int` })
          .from(schema.extractionCorrectionSessions)
          .where(
            sql`${schema.extractionCorrectionSessions.orgId} = ${E2E_ORG_ID}
              AND ${schema.extractionCorrectionSessions.documentId} = ${fixture.docId}
              AND ${schema.extractionCorrectionSessions.status} = 'draft'
              AND ${schema.extractionCorrectionSessions.userExplanation} IS NOT NULL`
          );
        return row?.count ?? 0;
      })
      .toBe(1);
  });

  test("foreign vendor review shows PP36/WHT warning", async ({ page }) => {
    const fixture = await seedForeignVendorReviewFixture();

    await page.goto(`/documents/${fixture.docId}/review`);
    await expect(page.getByText(/Foreign vendor/i)).toBeVisible();
    await expect(page.getByText(/Review PP36 self-assessed VAT/i)).toBeVisible();
    await expect(page.getByLabel("PP36 foreign service")).toBeChecked();
  });

  test("TikTok foreign-service replay confirms into PP36 calendar lane", async ({ page }) => {
    const fixture = await seedTikTokUploadReplayFixture();

    await page.goto(`/documents/${fixture.docId}/review`);
    await expect(page.getByText(/Foreign vendor/i)).toBeVisible();
    await expect(page.getByText(/Review PP36 self-assessed VAT/i)).toBeVisible();
    await expect(page.getByLabel("PP36 foreign service")).toBeChecked();

    await page.getByRole("button", { name: /Confirm & Save/i }).click();
    await expect(page.getByText("Document confirmed")).toBeVisible();

    await expect
      .poll(async () => {
        const [row] = await db
          .select({ count: sql<number>`COUNT(*)::int` })
          .from(schema.pp36Obligations)
          .where(
            sql`${schema.pp36Obligations.orgId} = ${E2E_ORG_ID}
              AND ${schema.pp36Obligations.sourceDocumentId} = ${fixture.docId}
              AND ${schema.pp36Obligations.status} = 'pp36_required'`
          );
        return row?.count ?? 0;
      })
      .toBe(1);

    const draft = await buildPp36VatFilingDraft({
      orgId: E2E_ORG_ID,
      periodYear: fixture.targetYear,
      periodMonth: fixture.targetMonth,
      actorId: E2E_ACTOR_ID,
    });
    await expect
      .poll(async () => {
        const [row] = await db
          .select({
            count: sql<number>`COUNT(*)::int`,
          })
          .from(schema.pp36Obligations)
          .where(
            sql`${schema.pp36Obligations.orgId} = ${E2E_ORG_ID}
              AND ${schema.pp36Obligations.sourceDocumentId} = ${fixture.docId}
              AND ${schema.pp36Obligations.status} = 'allocated_to_draft_pp36'`
          );
        return row?.count ?? 0;
      })
      .toBe(1);

    await page.goto(`/tax/calendar?year=${fixture.targetYear}`);
    const monthLabel = `${MONTH_NAMES[fixture.targetMonth - 1]} ${fixture.targetYear}`;
    const calendarRow = page.getByRole("row", { name: new RegExp(monthLabel, "i") });
    await expect(calendarRow).toContainText(`VAT: ${draft.filing.pp36VatTotal}`);
  });

  test("full tax invoice confirm saves evidence fields before confirmation", async ({ page }) => {
    const fixture = await seedFullTaxInvoiceReviewFixture();

    await page.goto(`/documents/${fixture.docId}/review`);
    await expect(page.getByLabel("Tax invoice wording")).toBeVisible();
    await expect(
      page.getByText("Ask supplier for a full tax invoice")
    ).toBeVisible();
    await page.getByLabel("Tax invoice wording").fill("Tax Invoice / ใบกำกับภาษี");
    await page.getByRole("button", { name: /Confirm & Save/i }).click();
    await expect(page.getByText("Document confirmed")).toBeVisible();

    await expect
      .poll(async () => {
        const [row] = await db
          .select({
            status: schema.documents.status,
            taxInvoiceWords: schema.documents.taxInvoiceWords,
            supplierTaxIdSnapshot: schema.documents.supplierTaxIdSnapshot,
          })
          .from(schema.documents)
          .where(sql`${schema.documents.id} = ${fixture.docId}`);
        return row;
      })
      .toMatchObject({
        status: "confirmed",
        taxInvoiceWords: "Tax Invoice / ใบกำกับภาษี",
        supplierTaxIdSnapshot: fixture.supplierTaxId,
      });
  });

  test("confirmed asset purchase can be capitalized into fixed asset register", async ({ page }) => {
    const fixture = await seedCapitalizationFixture();

    await page.goto(`/documents/${fixture.docId}/review`);
    await expect(page.getByText("Capitalize as fixed asset")).toBeVisible();
    await expect(page.getByRole("button", { name: /Create Fixed Asset/i })).toBeVisible();
    await page.getByRole("button", { name: /Create Fixed Asset/i }).click();
    await expect(page.getByText("Fixed asset created", { exact: true })).toBeVisible();

    await expect
      .poll(async () => {
        const [row] = await db
          .select({ count: sql<number>`COUNT(*)::int` })
          .from(schema.fixedAssets)
          .where(
            sql`${schema.fixedAssets.orgId} = ${E2E_ORG_ID}
              AND ${schema.fixedAssets.acquisitionDocumentId} = ${fixture.docId}`
          );
        return row?.count ?? 0;
      })
      .toBe(1);
  });

  test("confirmed inventory purchase can receive stock and post inventory AP", async ({ page }) => {
    const fixture = await seedInventoryReceiptFixture();

    await page.goto(`/documents/${fixture.docId}/review`);
    await expect(page.getByText("Receive inventory from document")).toBeVisible();
    const skuSelect = page.locator("#inventorySkuId");
    await expect(skuSelect.locator(`option[value="${fixture.skuId}"]`)).toHaveCount(1);
    await expect
      .poll(async () => {
        await skuSelect.selectOption(fixture.skuId);
        await page.waitForTimeout(100);
        return skuSelect.inputValue();
      })
      .toBe(fixture.skuId);
    await page.getByRole("button", { name: /Receive Inventory/i }).click();
    await expect(page.getByText("Inventory received", { exact: true })).toBeVisible({
      timeout: 15_000,
    });

    await expect
      .poll(async () => {
        const [row] = await db
          .select({
            movementCount: sql<number>`COUNT(*)::int`,
            postedCount: sql<number>`COUNT(${schema.inventoryMovements.journalEntryId})::int`,
          })
          .from(schema.inventoryMovements)
          .where(
            sql`${schema.inventoryMovements.orgId} = ${E2E_ORG_ID}
              AND ${schema.inventoryMovements.sourceEntityId} = ${fixture.docId}
              AND ${schema.inventoryMovements.movementType} = 'purchase_in'`
          );
        return row;
      })
      .toMatchObject({ movementCount: 1, postedCount: 1 });
  });
});
