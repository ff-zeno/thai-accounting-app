// Client-safe model catalog — no DB imports
// Import this from client components instead of models.ts

export type ModelPurpose = "extraction" | "classification" | "translation";

export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  inputCostPer1M: number;
  outputCostPer1M: number;
  purposes: ModelPurpose[];
}

export const AVAILABLE_MODELS: ModelInfo[] = [
  {
    id: "anthropic/claude-sonnet-4",
    name: "Claude Sonnet 4",
    provider: "Anthropic",
    inputCostPer1M: 3.0,
    outputCostPer1M: 15.0,
    purposes: ["extraction", "classification"],
  },
  {
    id: "google/gemini-2.0-flash-001",
    name: "Gemini 2.0 Flash",
    provider: "Google",
    inputCostPer1M: 0.1,
    outputCostPer1M: 0.4,
    purposes: ["extraction", "classification", "translation"],
  },
  {
    id: "openai/gpt-4o",
    name: "GPT-4o",
    provider: "OpenAI",
    inputCostPer1M: 2.5,
    outputCostPer1M: 10.0,
    purposes: ["extraction", "classification", "translation"],
  },
  {
    id: "openai/gpt-4o-mini",
    name: "GPT-4o Mini",
    provider: "OpenAI",
    inputCostPer1M: 0.15,
    outputCostPer1M: 0.6,
    purposes: ["classification", "translation"],
  },
  {
    id: "google/gemini-2.5-flash-preview",
    name: "Gemini 2.5 Flash",
    provider: "Google",
    inputCostPer1M: 0.15,
    outputCostPer1M: 0.6,
    purposes: ["extraction", "classification", "translation"],
  },
];

export const MODEL_COSTS: Record<string, { input: number; output: number }> =
  Object.fromEntries(
    AVAILABLE_MODELS.map((m) => [
      m.id,
      { input: m.inputCostPer1M, output: m.outputCostPer1M },
    ])
  );

export const DEFAULT_MODEL_IDS: Record<ModelPurpose, string> = {
  extraction: "anthropic/claude-sonnet-4",
  classification: "google/gemini-2.0-flash-001",
  translation: "google/gemini-2.0-flash-001",
};

export function getModelsForPurpose(purpose: ModelPurpose): ModelInfo[] {
  return AVAILABLE_MODELS.filter((m) => m.purposes.includes(purpose));
}
