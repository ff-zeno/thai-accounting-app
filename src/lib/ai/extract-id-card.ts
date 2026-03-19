import { generateObject } from "ai";
import { getOpenRouterProvider } from "./provider";
import {
  idCardExtractionSchema,
  type IdCardExtraction,
} from "./schemas/id-card-extraction";

// Hardcoded: always use the cheapest validated model for ID card extraction
const ID_CARD_MODEL_ID = "google/gemini-2.0-flash-001";

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
  imageUrl: string,
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
          { type: "image", image: imageUrl },
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
