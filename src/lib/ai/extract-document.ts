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

export async function extractDocument(
  imageUrls: string[],
  orgId?: string
): Promise<ExtractionResult> {
  const modelId = await getModelId("extraction", orgId);
  const model = await getModel("extraction", orgId);

  const content: Array<{ type: "text"; text: string } | { type: "image"; image: string }> = [
    { type: "text", text: EXTRACTION_PROMPT },
    ...imageUrls.map((url) => ({
      type: "image" as const,
      image: url,
    })),
  ];

  if (imageUrls.length > 1) {
    content.push({
      type: "text",
      text: `These ${imageUrls.length} images are pages of the same document. Extract data from all pages combined.`,
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
