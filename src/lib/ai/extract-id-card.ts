import { generateObject } from "ai";
import { getOpenRouterProvider } from "./provider";
import {
  idCardExtractionSchema,
  type IdCardExtraction,
} from "./schemas/id-card-extraction";

// Hardcoded: qwen3-vl-32b-instruct was the benchmark winner on Thai ID cards
// (2026-04-15 run), scoring 94% with all critical fields correct (nameTh,
// citizenId, address), in ~3.7s per call vs qwen3.5-9b's ~19s. qwen3-vl-235b
// scored 100% but costs ~2x and is only marginally better — save it for
// reprocessing low-confidence extractions as a second pass.
//
// Full benchmark: benchmarks/output/2026-04-15T10-13-25-166Z/
const ID_CARD_MODEL_ID = "qwen/qwen3-vl-32b-instruct";

const ID_CARD_PROMPT = `Extract name and citizen ID number from this Thai national ID card (บัตรประชาชน).
The card may have lines drawn across it or signatures overlaid (common for copies).
Convert any Buddhist Era (BE) dates by subtracting 543 to get CE year (e.g., 2567 BE = 2024 CE).
Return dates in YYYY-MM-DD format.`;

export interface IdCardExtractionResult {
  data: IdCardExtraction;
  modelUsed: string;
  tokenUsage: { input: number; output: number };
}

export async function extractIdCard(
  image: { bytes: Uint8Array; contentType: string },
  _orgId?: string
): Promise<IdCardExtractionResult> {
  const provider = getOpenRouterProvider();
  const model = provider(ID_CARD_MODEL_ID);

  const result = await generateObject({
    model,
    schema: idCardExtractionSchema,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: ID_CARD_PROMPT },
          { type: "image", image: image.bytes, mediaType: image.contentType },
        ],
      },
    ],
  });

  return {
    data: result.object,
    modelUsed: ID_CARD_MODEL_ID,
    tokenUsage: {
      input: result.usage?.inputTokens ?? 0,
      output: result.usage?.outputTokens ?? 0,
    },
  };
}
