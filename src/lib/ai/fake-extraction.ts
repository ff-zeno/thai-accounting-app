import { invoiceExtractionSchema } from "./schemas/invoice-extraction";
import type { ExtractionResult } from "./extract-document";

/**
 * Env-gated fake extraction for e2e tests.
 *
 * When E2E_FAKE_AI=1, extractDocument() returns this canned invoice instead
 * of calling the real model. Everything else in the 7-step pipeline (blob
 * fetch, quality check, vendor lookup, WHT classification, store) stays real.
 * The golden-path spec asserts extraction_log.modelUsed === FAKE_MODEL_ID to
 * prove the real model was never called.
 */

export const FAKE_MODEL_ID = "e2e/fake-extraction";

export function isFakeAiEnabled(): boolean {
  if (process.env.E2E_FAKE_AI !== "1") return false;
  // Fail closed: any VERCEL value except an explicit "0" counts as deployed.
  const onVercel = !!process.env.VERCEL && process.env.VERCEL !== "0";
  if (process.env.NODE_ENV === "production" || onVercel) {
    throw new Error(
      "E2E_FAKE_AI must never be enabled in production environments"
    );
  }
  return true;
}

const CANNED_INVOICE = {
  documentType: "invoice",
  documentNumber: "INV-E2E-GOLDEN-0001",
  taxInvoiceSubtype: "full_ti",
  taxInvoiceWords: "Tax Invoice",
  issueDate: "2026-02-07",
  vendorName: "Golden Path Supplies Co., Ltd.",
  vendorNameEn: "Golden Path Supplies Co., Ltd.",
  vendorTaxId: "0105561234567",
  vendorBranchNumber: "00000",
  vendorAddress: "1 Golden Path Road, Bangkok 10110",
  vendorCountry: "TH",
  subtotal: "1000.00",
  vatRate: "7",
  vatAmount: "70.00",
  totalAmount: "1070.00",
  currency: "THB",
  lineItems: [
    {
      description: "E2E golden path office supplies",
      quantity: 1,
      unitPrice: "1000.00",
      amount: "1000.00",
      vatAmount: "70.00",
    },
  ],
  detectedLanguage: "en",
  confidence: 0.95,
  notes: "Deterministic fixture produced by the e2e fake-AI switch.",
};

export function buildFakeExtraction(): ExtractionResult {
  // Parse through the live schema at call time so schema drift fails loudly
  // in the e2e run instead of silently producing an invalid extraction.
  const data = invoiceExtractionSchema.parse(CANNED_INVOICE);
  return {
    data,
    modelUsed: FAKE_MODEL_ID,
    // Zero token usage keeps the fake run inside every AI budget guard.
    tokenUsage: { input: 0, output: 0 },
  };
}
