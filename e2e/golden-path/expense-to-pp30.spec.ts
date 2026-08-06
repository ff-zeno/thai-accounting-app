/**
 * Golden path: expense upload → fake-AI extraction → confirm → bank statement
 * import → deterministic reconciliation → VAT register → PP30 draft build.
 *
 * Local recipe (3 terminals):
 *   1. E2E_FAKE_AI=1 pnpm dev
 *   2. pnpm inngest:dev
 *   3. pnpm test:e2e e2e/golden-path
 *
 * Requires the Inngest dev server on :8288 — the suite skips when it is
 * unreachable unless CI or E2E_REQUIRE_INNGEST=1 turns that into a failure.
 * The dev server MUST run with E2E_FAKE_AI=1; the spec proves the real model
 * was never called by asserting extraction_log.modelUsed === the fake id.
 */
import { test, expect } from "../fixtures/auth";
import path from "path";
import { and, desc, eq, isNull, like, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { createVatInputItem } from "@/lib/db/queries/vat-operations-ledger";
import { generateVatRegister } from "@/lib/tax/vat-register";
import { FAKE_MODEL_ID } from "@/lib/ai/fake-extraction";

const E2E_ORG_ID = "95aead7c-9942-474f-b48e-2ec5b46f10c9";
const VENDOR_TAX_ID = "0105561234567";
const VENDOR_NAME = "Golden Path Supplies Co., Ltd.";
const DOC_NUMBER = "INV-E2E-GOLDEN-0001";
const ACCOUNT_NUMBER = "170-3-26995-4";
// The KBank parser appends transfer details to the description, so match by prefix.
const TXN_DESCRIPTION_PREFIX = "Golden Path Vendor Payment";
const UPLOAD_FILENAME = "expense-invoice.png";
const FIXTURES = path.join(__dirname, "..", "fixtures", "files");

// The canned invoice is dated 2026-02-07 ⇒ VAT period Feb 2026.
const PERIOD_YEAR = 2026;
const PERIOD_MONTH = 2;

const POLL_OPTS = { timeout: 90_000, intervals: [1_000, 2_000, 5_000] };

let documentId: string;
let establishmentId: string;

async function inngestDevServerReachable(): Promise<boolean> {
  try {
    const res = await fetch("http://localhost:8288", {
      signal: AbortSignal.timeout(3_000),
    });
    return res.status < 500;
  } catch {
    return false;
  }
}

async function latestGoldenDocumentFile() {
  const [row] = await db
    .select({
      documentId: schema.documentFiles.documentId,
      pipelineStatus: schema.documentFiles.pipelineStatus,
    })
    .from(schema.documentFiles)
    .where(
      and(
        eq(schema.documentFiles.orgId, E2E_ORG_ID),
        eq(schema.documentFiles.originalFilename, UPLOAD_FILENAME)
      )
    )
    .orderBy(desc(schema.documentFiles.createdAt))
    .limit(1);
  return row ?? null;
}

/**
 * Remove everything a previous golden-path run created, BEFORE this run —
 * never after, so a failed run leaves its state behind for debugging.
 */
async function cleanupPriorRun() {
  await db.transaction(async (tx) => {
    const docs = await tx
      .select({ id: schema.documents.id })
      .from(schema.documents)
      .where(
        and(
          eq(schema.documents.orgId, E2E_ORG_ID),
          eq(schema.documents.documentNumber, DOC_NUMBER)
        )
      );
    const docIds = docs.map((d) => d.id);
    // The Neon driver doesn't serialize JS arrays for ANY($1) — build an
    // explicit uuid[] literal instead.
    const docIdList = sql.join(
      docIds.map((id) => sql`${id}::uuid`),
      sql`, `
    );

    // PP30 draft for the golden period (lines first, then filing).
    await tx.execute(sql`
      DELETE FROM vat_filing_lines
      WHERE org_id = ${E2E_ORG_ID}
        AND filing_id IN (
          SELECT id FROM vat_filings
          WHERE org_id = ${E2E_ORG_ID}
            AND filing_type = 'pp30'
            AND period_year = ${PERIOD_YEAR}
            AND period_month = ${PERIOD_MONTH}
        )
    `);
    if (docIds.length > 0) {
      await tx.execute(sql`
        DELETE FROM vat_input_items
        WHERE org_id = ${E2E_ORG_ID}
          AND source_document_id IN (${docIdList})
      `);
    }
    await tx.execute(sql`
      DELETE FROM vat_filings
      WHERE org_id = ${E2E_ORG_ID}
        AND filing_type = 'pp30'
        AND period_year = ${PERIOD_YEAR}
        AND period_month = ${PERIOD_MONTH}
    `);

    // Reconciliation matches, payments, transactions, statements from the
    // golden statement import.
    await tx.execute(sql`
      DELETE FROM reconciliation_matches
      WHERE org_id = ${E2E_ORG_ID}
        AND transaction_id IN (
          SELECT id FROM transactions
          WHERE org_id = ${E2E_ORG_ID} AND description LIKE ${TXN_DESCRIPTION_PREFIX + "%"}
        )
    `);
    if (docIds.length > 0) {
      await tx.execute(sql`
        DELETE FROM reconciliation_matches
        WHERE org_id = ${E2E_ORG_ID} AND document_id IN (${docIdList})
      `);
      await tx.execute(sql`
        DELETE FROM payments
        WHERE org_id = ${E2E_ORG_ID} AND document_id IN (${docIdList})
      `);
    }
    await tx.execute(sql`
      DELETE FROM transactions
      WHERE org_id = ${E2E_ORG_ID} AND description LIKE ${TXN_DESCRIPTION_PREFIX + "%"}
    `);
    await tx.execute(sql`
      DELETE FROM bank_statements
      WHERE org_id = ${E2E_ORG_ID}
        AND bank_account_id IN (
          SELECT id FROM bank_accounts
          WHERE org_id = ${E2E_ORG_ID} AND account_number = ${ACCOUNT_NUMBER}
        )
        AND NOT EXISTS (
          SELECT 1 FROM transactions
          WHERE transactions.statement_id = bank_statements.id
        )
    `);

    // Document graph: extraction log, files, line items, then documents.
    if (docIds.length > 0) {
      // Extraction learning graph hangs off extraction_log + documents.
      await tx.execute(sql`
        DELETE FROM extraction_review_outcome
        WHERE document_id IN (${docIdList})
      `);
      await tx.execute(sql`
        DELETE FROM extraction_exemplars
        WHERE document_id IN (${docIdList})
      `);
      await tx.execute(sql`
        DELETE FROM extraction_correction_sessions
        WHERE document_id IN (${docIdList})
      `);
      await tx.execute(sql`
        DELETE FROM extraction_log
        WHERE org_id = ${E2E_ORG_ID} AND document_id IN (${docIdList})
      `);
      await tx.execute(sql`
        DELETE FROM document_files
        WHERE org_id = ${E2E_ORG_ID} AND document_id IN (${docIdList})
      `);
      await tx.execute(sql`
        DELETE FROM document_line_items
        WHERE org_id = ${E2E_ORG_ID} AND document_id IN (${docIdList})
      `);
      await tx.execute(sql`
        DELETE FROM audit_log
        WHERE org_id = ${E2E_ORG_ID}
          AND entity_type = 'document'
          AND entity_id IN (${docIdList})
      `);
      await tx.execute(sql`
        DELETE FROM documents
        WHERE org_id = ${E2E_ORG_ID} AND id IN (${docIdList})
      `);
    }
  });
}

/**
 * Seed the stable fixtures the flow depends on (idempotent upserts):
 * - org is VAT-registered (full-tax-invoice evidence checks at confirmation
 *   need the org tax id, which the e2e org already has)
 * - a vat-registered head-office establishment (PP30 drafts are branch-scoped)
 * - the golden vendor, VAT-registered with tax id + branch (recoverable input
 *   VAT requires all three at confirmation; the pipeline matches it by tax id)
 * - the KBank account matching the fixture statement's account number
 */
async function seedFixtures() {
  await db
    .update(schema.organizations)
    .set({ isVatRegistered: true })
    .where(eq(schema.organizations.id, E2E_ORG_ID));

  const [establishment] = await db
    .insert(schema.establishments)
    .values({
      orgId: E2E_ORG_ID,
      branchNumber: "00000",
      nameEn: "Head Office",
      nameTh: "สำนักงานใหญ่",
      isHeadOffice: true,
      vatRegistered: true,
    })
    .onConflictDoUpdate({
      target: [schema.establishments.orgId, schema.establishments.branchNumber],
      set: { vatRegistered: true, isHeadOffice: true, deletedAt: null },
    })
    .returning();
  establishmentId = establishment.id;

  const [existingVendor] = await db
    .select({ id: schema.vendors.id })
    .from(schema.vendors)
    .where(
      and(
        eq(schema.vendors.orgId, E2E_ORG_ID),
        eq(schema.vendors.taxId, VENDOR_TAX_ID),
        isNull(schema.vendors.deletedAt)
      )
    )
    .limit(1);
  if (existingVendor) {
    await db
      .update(schema.vendors)
      .set({ isVatRegistered: true, branchNumber: "00000", country: "TH" })
      .where(eq(schema.vendors.id, existingVendor.id));
  } else {
    await db.insert(schema.vendors).values({
      orgId: E2E_ORG_ID,
      name: VENDOR_NAME,
      taxId: VENDOR_TAX_ID,
      branchNumber: "00000",
      entityType: "company",
      country: "TH",
      isVatRegistered: true,
    });
  }

  const [existingAccount] = await db
    .select({ id: schema.bankAccounts.id })
    .from(schema.bankAccounts)
    .where(
      and(
        eq(schema.bankAccounts.orgId, E2E_ORG_ID),
        eq(schema.bankAccounts.accountNumber, ACCOUNT_NUMBER)
      )
    )
    .limit(1);
  if (!existingAccount) {
    await db.insert(schema.bankAccounts).values({
      orgId: E2E_ORG_ID,
      bankCode: "KBANK",
      accountNumber: ACCOUNT_NUMBER,
      accountName: "E2E Golden Path Account",
    });
  }
}

test.describe("Golden path: expense to PP30", () => {
  test.describe.configure({ mode: "serial" });
  // DB polls wait up to 90s for the Inngest pipeline — give tests headroom.
  test.setTimeout(180_000);

  test.beforeAll(async () => {
    const inngestUp = await inngestDevServerReachable();
    if (!inngestUp) {
      if (process.env.CI || process.env.E2E_REQUIRE_INNGEST === "1") {
        throw new Error(
          "Inngest dev server (:8288) is unreachable — the golden path cannot run. Start it with: pnpm inngest:dev"
        );
      }
      test.skip(
        true,
        "Inngest dev server (:8288) not running — skipping golden path. Start it with: pnpm inngest:dev"
      );
      return;
    }
    await cleanupPriorRun();
    await seedFixtures();
  });

  test("upload expense → fake extraction completes", async ({ page }) => {
    await page.goto("/expenses/upload");
    await page
      .locator('input[type="file"]')
      .first()
      .setInputFiles(path.join(FIXTURES, UPLOAD_FILENAME));
    await page.getByRole("button", { name: /Upload \(1 file\)/i }).click();
    // Successful upload navigates to the expenses list.
    await page.waitForURL("**/expenses", { timeout: 30_000 });

    // Wait for the Inngest pipeline to finish: uploaded → ... → completed.
    await expect
      .poll(async () => (await latestGoldenDocumentFile())?.pipelineStatus, POLL_OPTS)
      .toBe("completed");
    const fileRow = await latestGoldenDocumentFile();
    documentId = fileRow!.documentId;

    // The canned extraction landed on the documents row.
    const [doc] = await db
      .select()
      .from(schema.documents)
      .where(
        and(
          eq(schema.documents.orgId, E2E_ORG_ID),
          eq(schema.documents.id, documentId)
        )
      );
    expect(doc.documentNumber).toBe(DOC_NUMBER);
    expect(doc.subtotal).toBe("1000.00");
    expect(doc.vatAmount).toBe("70.00");
    expect(doc.totalAmount).toBe("1070.00");
    expect(doc.issueDate).toBe("2026-02-07");
    expect(doc.vendorId).toBeTruthy();

    // Proof the real model was never called (catches env misconfiguration).
    const [logRow] = await db
      .select({ modelUsed: schema.extractionLog.modelUsed })
      .from(schema.extractionLog)
      .where(
        and(
          eq(schema.extractionLog.orgId, E2E_ORG_ID),
          eq(schema.extractionLog.documentId, documentId)
        )
      )
      .orderBy(desc(schema.extractionLog.createdAt))
      .limit(1);
    expect(logRow?.modelUsed).toBe(FAKE_MODEL_ID);
  });

  test("review page shows extracted values → confirm", async ({ page }) => {
    await page.goto(`/documents/${documentId}/review`);
    await expect(page.locator("main")).toBeVisible();
    await expect(page.locator("#documentNumber")).toHaveValue(DOC_NUMBER);
    await expect(page.locator('input[value="1070.00"]').first()).toBeVisible();

    await page.getByRole("button", { name: /Confirm & Save/i }).click();
    await expect
      .poll(async () => {
        const [doc] = await db
          .select({ status: schema.documents.status })
          .from(schema.documents)
          .where(
            and(
              eq(schema.documents.orgId, E2E_ORG_ID),
              eq(schema.documents.id, documentId)
            )
          );
        return doc?.status;
      }, POLL_OPTS)
      .toBe("confirmed");
  });

  test("import bank statement → transaction auto-matches", async ({ page }) => {
    await page.goto("/bank-accounts/upload");
    await page
      .locator('input[type="file"]')
      .first()
      .setInputFiles(path.join(FIXTURES, "kbank-statement-golden.csv"));

    // KBank CSV parses without account metadata (only the PDF format carries
    // the account number), so pick the seeded account explicitly.
    await page
      .getByRole("button", { name: /Select Existing Account/i })
      .click({ timeout: 30_000 });
    await page
      .locator("div")
      .filter({ hasText: ACCOUNT_NUMBER })
      .getByRole("button", { name: /^Select$/ })
      .last()
      .click({ timeout: 15_000 });
    // Overlap-check step (only shown when the import needs confirmation).
    const importNewButton = page.getByRole("button", {
      name: /Import 1 new transaction/i,
    });
    if (
      await importNewButton.isVisible({ timeout: 10_000 }).catch(() => false)
    ) {
      await importNewButton.click();
    }
    await expect(page.getByText(/Import complete/i)).toBeVisible({
      timeout: 30_000,
    });

    // Exactly one imported withdrawal of 1,070.00.
    await expect
      .poll(async () => {
        const rows = await db
          .select({ id: schema.transactions.id })
          .from(schema.transactions)
          .where(
            and(
              eq(schema.transactions.orgId, E2E_ORG_ID),
              like(schema.transactions.description, `${TXN_DESCRIPTION_PREFIX}%`)
            )
          );
        return rows.length;
      }, POLL_OPTS)
      .toBe(1);
    const [txn] = await db
      .select({ id: schema.transactions.id, amount: schema.transactions.amount })
      .from(schema.transactions)
      .where(
        and(
          eq(schema.transactions.orgId, E2E_ORG_ID),
          like(schema.transactions.description, `${TXN_DESCRIPTION_PREFIX}%`)
        )
      );
    expect(txn.amount).toBe("1070.00");

    // match-imported-transactions (Inngest) reconciles it against the
    // confirmed document — deterministic cascade, no AI involved.
    await expect
      .poll(async () => {
        const [match] = await db
          .select({ id: schema.reconciliationMatches.id })
          .from(schema.reconciliationMatches)
          .where(
            and(
              eq(schema.reconciliationMatches.orgId, E2E_ORG_ID),
              eq(schema.reconciliationMatches.transactionId, txn.id),
              eq(schema.reconciliationMatches.documentId, documentId)
            )
          )
          .limit(1);
        return match?.id ?? null;
      }, POLL_OPTS)
      .not.toBeNull();

    await expect
      .poll(async () => {
        const [row] = await db
          .select({
            reconciliationStatus: schema.transactions.reconciliationStatus,
          })
          .from(schema.transactions)
          .where(eq(schema.transactions.id, txn.id));
        return row?.reconciliationStatus;
      }, POLL_OPTS)
      .toBe("matched");
  });

  test("VAT register shows the 70.00 input line for Feb 2026", async ({
    page,
  }) => {
    // Data-level assertion through the production register query — the
    // confirmed full-tax-invoice expense is an input VAT line for Feb 2026.
    const register = await generateVatRegister(
      E2E_ORG_ID,
      PERIOD_YEAR,
      PERIOD_MONTH
    );
    const goldenLine = register.inputRegister.find(
      (line) => line.documentNumber === DOC_NUMBER
    );
    expect(goldenLine).toBeDefined();
    expect(goldenLine?.vatAmount).toBe("70.00");
    expect(goldenLine?.vendorTaxId).toBe(VENDOR_TAX_ID);

    // And the register page renders.
    await page.goto("/tax/vat/register");
    await expect(
      page.getByRole("heading", { name: /VAT Register/i })
    ).toBeVisible();
  });

  test("build PP30 draft for Feb 2026 includes the input VAT", async ({
    page,
  }) => {
    // The document→VAT-ledger materialization is not wired yet (no production
    // caller of createVatInputItem). Bridge with the production helper so the
    // branch-scoped allocation path is still exercised end-to-end.
    const [doc] = await db
      .select()
      .from(schema.documents)
      .where(eq(schema.documents.id, documentId));
    await createVatInputItem({
      orgId: E2E_ORG_ID,
      establishmentId,
      sourceDocumentId: documentId,
      vendorId: doc.vendorId!,
      taxInvoiceNo: DOC_NUMBER,
      taxInvoiceDate: "2026-02-07",
      taxInvoiceSubtype: "full_ti",
      documentDate: "2026-02-07",
      baseAmount: "1000.00",
      vatAmount: "70.00",
      vatRate: "0.0700",
      eligiblePeriodYear: PERIOD_YEAR,
      eligiblePeriodMonth: PERIOD_MONTH,
      expiryPeriodYear: PERIOD_YEAR,
      expiryPeriodMonth: PERIOD_MONTH + 6,
      status: "claimable",
      sourceSnapshot: { documentNumber: DOC_NUMBER, golden: true },
    });

    await page.goto("/tax/vat");
    await expect(
      page.getByRole("heading", { name: /VAT Dashboard/i })
    ).toBeVisible();

    // Load Feb 2026.
    await page.locator("main select").first().selectOption(String(PERIOD_YEAR));
    await page
      .locator("main select")
      .nth(1)
      .selectOption(String(PERIOD_MONTH));
    await page.getByRole("button", { name: /Load Period/i }).click();
    await expect(page.getByText(/PP 30 Branch Readiness/i)).toBeVisible({
      timeout: 30_000,
    });

    await page.getByRole("button", { name: /Build PP 30/i }).click();

    // Draft renders with the allocated input VAT.
    await expect(page.getByText(/Input 1/)).toBeVisible({ timeout: 30_000 });

    const [filing] = await db
      .select({
        inputVatTotal: schema.vatFilings.inputVatTotal,
        status: schema.vatFilings.status,
        establishmentId: schema.vatFilings.establishmentId,
      })
      .from(schema.vatFilings)
      .where(
        and(
          eq(schema.vatFilings.orgId, E2E_ORG_ID),
          eq(schema.vatFilings.filingType, "pp30"),
          eq(schema.vatFilings.periodYear, PERIOD_YEAR),
          eq(schema.vatFilings.periodMonth, PERIOD_MONTH),
          isNull(schema.vatFilings.deletedAt)
        )
      )
      .orderBy(desc(schema.vatFilings.createdAt))
      .limit(1);
    expect(filing?.status).toBe("draft");
    expect(filing?.inputVatTotal).toBe("70.00");
    expect(filing?.establishmentId).toBe(establishmentId);
  });
});
