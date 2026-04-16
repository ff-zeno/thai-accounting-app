import { generateObject } from "ai";
import { getModel, getModelId } from "./models";
import { invoiceExtractionSchema, type InvoiceExtraction } from "./schemas/invoice-extraction";

const EXTRACTION_PROMPT = `You are an expert Thai accounting document extractor. Analyze this document image and extract all financial data.

Key Thai accounting rules:
- Tax IDs are 13 digits (เลขประจำตัวผู้เสียภาษี)
- Branch "00000" = head office (สำนักงานใหญ่)
- Standard VAT rate is 7%
- Thai Buddhist Era dates: subtract 543 to get CE year (e.g., 2567 BE = 2024 CE)
- Common document types: ใบแจ้งหนี้ (invoice), ใบเสร็จรับเงิน (receipt), ใบลดหนี้ (credit note), ใบเพิ่มหนี้ (debit note)

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
// Extraction context (Phase 8 learning loop)
// ---------------------------------------------------------------------------

export interface ExtractionContext {
  tier: 0 | 1;
  vendorId: string | null;
  exemplarIds: string[];
  exemplars: Array<{
    fieldName: string;
    aiValue: string | null;
    userValue: string | null;
  }>;
}

/**
 * Build a few-shot exemplar block for the extraction prompt.
 * Only invoked when tier >= 1 and exemplars are available.
 */
function buildExemplarPrompt(ctx: ExtractionContext): string {
  if (ctx.tier < 1 || ctx.exemplars.length === 0) return "";

  // Group corrections by field
  const corrections = ctx.exemplars.filter(
    (e) => e.aiValue !== e.userValue && e.userValue != null
  );
  if (corrections.length === 0) return "";

  const lines = corrections.map((e) => {
    const from = e.aiValue ?? "(empty)";
    const to = e.userValue ?? "(empty)";
    return `- ${e.fieldName}: AI extracted "${from}" → user corrected to "${to}"`;
  });

  return `\n\nIMPORTANT — Prior corrections for this vendor:
The user has previously corrected the following fields for documents from this vendor.
Apply these corrections when extracting similar fields:
${lines.join("\n")}

Use these corrections as strong guidance for field extraction.`;
}

export async function extractDocument(
  files: ExtractionFile[],
  orgId?: string,
  context?: ExtractionContext
): Promise<ExtractionResult> {
  const modelId = await getModelId("extraction", orgId);
  const model = await getModel("extraction", orgId);

  // Vercel AI SDK: images go as `type: "image"` with raw bytes;
  // PDFs (and other non-image files) go as `type: "file"` with mediaType.
  type ContentPart =
    | { type: "text"; text: string }
    | { type: "image"; image: Uint8Array; mediaType?: string }
    | { type: "file"; data: Uint8Array; mediaType: string };

  const exemplarBlock = context ? buildExemplarPrompt(context) : "";
  const content: ContentPart[] = [
    { type: "text", text: EXTRACTION_PROMPT + exemplarBlock },
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
