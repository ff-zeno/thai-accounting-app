import { z } from "zod/v4";

export const lineItemSchema = z.object({
  description: z.string().describe("Line item description, in original language"),
  descriptionEn: z.string().optional().describe("English translation of description, if original is Thai"),
  quantity: z.number().optional().describe("Quantity, default 1"),
  unitPrice: z.string().optional().describe("Unit price as decimal string"),
  amount: z.string().describe("Line item amount as decimal string"),
  vatAmount: z.string().optional().describe("VAT amount for this line item"),
  whtType: z.string().optional().describe("WHT category (e.g., 'advertising', 'services', 'rent')"),
  whtRate: z.string().optional().describe("Withholding tax rate as a decimal string, e.g. 0.0300"),
  whtAmount: z.string().optional().describe("Withholding tax amount for this line item"),
});

export const invoiceExtractionSchema = z.object({
  documentType: z.enum([
    "invoice",
    "receipt",
    "debit_note",
    "credit_note",
    "wht_certificate_received",
  ])
    .describe("Type of document; use wht_certificate_received for incoming 50 Tawi certificates from customers"),
  documentNumber: z.string().optional()
    .describe("Invoice/receipt number"),
  taxInvoiceSubtype: z.enum(["full_ti", "e_tax_invoice", "abb", "not_a_ti"]).optional()
    .describe("Thai tax invoice subtype: full_ti, e_tax_invoice, abb, or not_a_ti"),
  taxInvoiceSerialNumber: z.string().optional()
    .describe("Tax invoice serial number if separately labeled; often same as documentNumber"),
  taxInvoiceWords: z.string().optional()
    .describe("Exact wording that indicates tax invoice status, e.g. Tax Invoice or ใบกำกับภาษี"),
  issueDate: z.string().optional()
    .describe("Issue date in YYYY-MM-DD format. Convert Buddhist Era (BE) years by subtracting 543"),
  dueDate: z.string().optional()
    .describe("Due date in YYYY-MM-DD format, if present"),

  // Vendor info
  vendorName: z.string().optional()
    .describe("Vendor/seller company name in original language"),
  vendorNameEn: z.string().optional()
    .describe("Vendor name in English, if original is Thai"),
  vendorTaxId: z.string().optional()
    .describe("Vendor 13-digit tax ID (เลขประจำตัวผู้เสียภาษี)"),
  vendorBranchNumber: z.string().optional()
    .describe("Branch number (สาขา), usually '00000' for head office (สำนักงานใหญ่)"),
  vendorAddress: z.string().optional()
    .describe("Vendor address in original language"),
  vendorCountry: z.preprocess((value) => {
    if (typeof value !== "string") return undefined;
    const normalized = value.trim().toUpperCase();
    return /^[A-Z]{2}$/.test(normalized) ? normalized : undefined;
  }, z.string().optional())
    .describe("Vendor country as ISO-3166 alpha-2 code, e.g. TH, SG, US"),

  // Buyer info
  buyerName: z.string().optional()
    .describe("Buyer/purchaser name"),
  buyerTaxId: z.string().optional()
    .describe("Buyer tax ID"),
  buyerBranchNumber: z.string().optional()
    .describe("Buyer branch number, usually 00000 for head office"),

  // Amounts
  subtotal: z.string().optional()
    .describe("Subtotal before VAT as decimal string"),
  vatRate: z.string().optional()
    .describe("VAT rate percentage (usually '7' for Thailand)"),
  vatAmount: z.string().optional()
    .describe("VAT amount as decimal string"),
  totalAmount: z.string()
    .describe("Grand total including VAT as decimal string"),

  currency: z.string().optional()
    .describe("Currency code (THB, USD, etc.)"),

  // Line items
  lineItems: z.array(lineItemSchema).optional()
    .describe("Individual line items, if discernible"),

  // Metadata
  detectedLanguage: z.enum(["th", "en", "mixed"])
    .describe("Primary language of the document"),
  confidence: z.number().min(0).max(1)
    .describe("Overall confidence score 0-1"),
  notes: z.string().optional()
    .describe("Any issues or ambiguities found during extraction"),
});

export type InvoiceExtraction = z.infer<typeof invoiceExtractionSchema>;
export type LineItemExtraction = z.infer<typeof lineItemSchema>;
