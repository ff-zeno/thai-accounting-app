import { generateObject } from "ai";
import { getModel, getModelId } from "./models";
import { buildFakeExtraction, isFakeAiEnabled } from "./fake-extraction";
import { invoiceExtractionSchema, type InvoiceExtraction } from "./schemas/invoice-extraction";

const EXTRACTION_PROMPT = `You are an expert Thai accounting document extractor. Analyze this document image and extract all financial data.

Key Thai accounting rules:
- Tax IDs are 13 digits (เลขประจำตัวผู้เสียภาษี)
- Branch "00000" = head office (สำนักงานใหญ่)
- Standard VAT rate is 7%
- Thai Buddhist Era dates: subtract 543 to get CE year (e.g., 2567 BE = 2024 CE)
- Common document types: ใบแจ้งหนี้ (invoice), ใบเสร็จรับเงิน (receipt), ใบลดหนี้ (credit note), ใบเพิ่มหนี้ (debit note)
- If the document is an incoming หนังสือรับรองการหักภาษี ณ ที่จ่าย / 50 Tawi certificate from a customer, set documentType to wht_certificate_received, documentNumber to the certificate number, issueDate to the payment/certificate date, totalAmount to the gross income base, and lineItems[].whtAmount / lineItems[].whtRate to the withheld tax evidence.
- Infer vendorCountry as ISO-3166 alpha-2 from vendor address, tax ID shape, currency, domain, and vendor identity. Use TH for Thai vendors; use the foreign country when the vendor is non-Thai.
- For Thai VAT documents, classify taxInvoiceSubtype: full_ti for full tax invoices, e_tax_invoice for electronic tax invoices, abb for abbreviated tax invoices/ABB, and not_a_ti when it is not a tax invoice.
- Extract taxInvoiceWords exactly when the document displays "Tax Invoice" or "ใบกำกับภาษี"; extract taxInvoiceSerialNumber if labeled separately from the invoice number.
- Extract buyerBranchNumber when shown; "สำนักงานใหญ่" or head office means "00000".
- Extract vendorAddress in the seller/vendor address's original document language. If a Thai vendor header shows both Thai and English addresses, use the Thai address for vendorAddress and treat English as translation/context only.
- Set detectedLanguage to mixed when material Thai and English field labels or party details are both present.

Important:
- All monetary amounts must be decimal strings (e.g., "1234.56"), never floating point
- Dates must be YYYY-MM-DD format
- If the document is in Thai, also provide English translations where applicable
- Set confidence score based on image quality and extraction certainty
- Flag any math inconsistencies in the notes field`;

export interface ExtractionResult {
  data: InvoiceExtraction;
  modelUsed: string;
  tokenUsage: { input: number; output: number };
}

export interface ExtractionFile {
  bytes: Uint8Array;
  contentType: string;
}

// ---------------------------------------------------------------------------
// Extraction context
// ---------------------------------------------------------------------------

/**
 * Deterministic facts we already hold about the two parties on the document.
 * This is not a learned signal: it is read straight off the matched vendor
 * record and the tenant's own organization record, and exists only to help the
 * model tell seller fields from buyer fields on bilingual Thai tax invoices.
 */
export interface ExtractionContext {
  vendorId: string | null;
  identityAnchor?: {
    vendorName?: string | null;
    vendorNameTh?: string | null;
    vendorTaxId?: string | null;
    vendorBranchNumber?: string | null;
    vendorAddress?: string | null;
    vendorAddressTh?: string | null;
    buyerName?: string | null;
    buyerNameTh?: string | null;
    buyerTaxId?: string | null;
    buyerBranchNumber?: string | null;
    buyerAddress?: string | null;
    buyerAddressTh?: string | null;
  };
}

/**
 * Build the party-identity block appended to the extraction prompt.
 * Returns "" when no vendor was matched or every anchor value is unusable.
 *
 * Exported for testing.
 */
export function buildIdentityAnchorPrompt(ctx: ExtractionContext): string {
  const anchor = ctx.identityAnchor;
  if (!anchor) return "";

  const sellerLines = [
    formatAnchorLine("vendorName", anchor.vendorName),
    formatAnchorLine("vendorNameTh", anchor.vendorNameTh),
    formatAnchorLine("vendorTaxId", anchor.vendorTaxId),
    formatAnchorLine("vendorBranchNumber", anchor.vendorBranchNumber),
    formatAnchorLine("vendorAddress", anchor.vendorAddress),
    formatAnchorLine("vendorAddressTh", anchor.vendorAddressTh),
  ].filter(Boolean);

  const buyerLines = [
    formatAnchorLine("organizationName", anchor.buyerName),
    formatAnchorLine("organizationNameTh", anchor.buyerNameTh),
    formatAnchorLine("organizationTaxId", anchor.buyerTaxId),
    formatAnchorLine("organizationBranchNumber", anchor.buyerBranchNumber),
    formatAnchorLine("organizationAddress", anchor.buyerAddress),
    formatAnchorLine("organizationAddressTh", anchor.buyerAddressTh),
  ].filter(Boolean);

  if (sellerLines.length === 0 && buyerLines.length === 0) return "";

  const sections = [
    sellerLines.length > 0
      ? `Known seller/vendor identity from the matched vendor record:\n${sellerLines.join("\n")}`
      : null,
    buyerLines.length > 0
      ? `Known organization identity for this tenant:\n${buyerLines.join("\n")}`
      : null,
  ].filter(Boolean);

  return `\n\nIMPORTANT — Deterministic party identity anchors:
${sections.join("\n\n")}

Use these anchors to separate seller/vendor fields from buyer/customer fields on bilingual Thai tax invoices.
Address anchors identify the party only; they do not override the visible document language required for vendorAddress.
For incoming supplier tax invoices, use the organization anchor for buyer fields only when the document's buyer/customer area matches this organization.
For incoming 50 Tawi withholding certificates, the payer/customer on the certificate is usually the counterparty, and this organization is the payee/income recipient; do not force organization identity into buyer fields.
Do not copy buyer/customer tax IDs or names into vendor fields, and do not copy vendor tax IDs or names into buyer fields.
If a Thai vendor header shows both Thai and English addresses, vendorAddress must use the Thai address from the document, not an English address anchor or translation.`;
}

function formatAnchorLine(fieldName: string, value: string | null | undefined) {
  const cleaned = formatAnchorValue(fieldName, value);
  return cleaned ? `- ${fieldName}: ${JSON.stringify(cleaned)}` : null;
}

function formatAnchorValue(fieldName: string, value: string | null | undefined) {
  if (!value) return null;
  const cleaned = value
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned || hasInstructionLikeText(cleaned)) return null;

  if (/TaxId$/i.test(fieldName)) {
    return /^\d{13}$/.test(cleaned) ? cleaned : null;
  }
  if (/BranchNumber$/i.test(fieldName)) {
    return /^\d{5}$/.test(cleaned) ? cleaned : null;
  }

  const maxLength = /Address/i.test(fieldName) ? 180 : 120;
  return cleaned.length <= maxLength ? cleaned : cleaned.slice(0, maxLength);
}

function hasInstructionLikeText(value: string) {
  return /\b(ignore|disregard|forget|system|assistant|developer|instruction|prompt|override|act as|you are|previous|above)\b|ละเลย|ไม่ต้องสนใจ/i.test(
    value
  );
}

export async function extractDocument(
  files: ExtractionFile[],
  orgId?: string,
  context?: ExtractionContext
): Promise<ExtractionResult> {
  if (isFakeAiEnabled()) {
    return buildFakeExtraction();
  }

  const modelId = await getModelId("extraction", orgId);
  const model = await getModel("extraction", orgId);

  // Vercel AI SDK: images go as `type: "image"` with raw bytes;
  // PDFs (and other non-image files) go as `type: "file"` with mediaType.
  type ContentPart =
    | { type: "text"; text: string }
    | { type: "image"; image: Uint8Array; mediaType?: string }
    | { type: "file"; data: Uint8Array; mediaType: string };

  const anchorBlock = context ? buildIdentityAnchorPrompt(context) : "";
  const content: ContentPart[] = [
    { type: "text", text: EXTRACTION_PROMPT + anchorBlock },
  ];

  for (const file of files) {
    if (file.contentType.startsWith("image/")) {
      content.push({
        type: "image",
        image: file.bytes,
        mediaType: file.contentType,
      });
    } else {
      content.push({
        type: "file",
        data: file.bytes,
        mediaType: file.contentType,
      });
    }
  }

  if (files.length > 1) {
    content.push({
      type: "text",
      text: `These ${files.length} files are pages of the same document. Extract data from all pages combined.`,
    });
  }

  const result = await generateObject({
    model,
    schema: invoiceExtractionSchema,
    messages: [{ role: "user", content }],
  });

  return {
    data: result.object,
    modelUsed: modelId,
    tokenUsage: {
      input: result.usage?.inputTokens ?? 0,
      output: result.usage?.outputTokens ?? 0,
    },
  };
}
