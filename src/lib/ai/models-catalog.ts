// Client-safe model catalog — no DB imports
// Import this from client components instead of models.ts

export type ModelPurpose = "extraction" | "classification" | "translation" | "reconciliation";

export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  inputCostPer1M: number;
  outputCostPer1M: number;
  purposes: ModelPurpose[];
}

// IMPORTANT PROVIDER POLICY NOTES:
//
// 1. Anthropic models are permanently excluded from this app.
//    Do not add any `anthropic/*` entries.
//
// 2. The following first-party commercial routes on OpenRouter currently
//    return 403 "Terms Of Service" for our account regardless of content:
//      - google/gemini-2.0-flash-001        (Google AI Studio)
//      - google/gemini-2.5-flash            (Google Vertex / AI Studio)
//      - google/gemini-2.5-flash-lite       (Google Vertex / AI Studio)
//      - openai/gpt-4o, openai/gpt-4o-mini  (OpenAI / Azure)
//      - openai/gpt-5-*                     (OpenAI / Azure)
//    This is an account-level OpenRouter flag, cause unknown, support ticket
//    pending. They're excluded from AVAILABLE_MODELS until the flag is cleared.
//    Once cleared, move them back and almost certainly switch the extraction
//    default to google/gemini-2.0-flash-001 (cheaper, faster, stronger vision).
//
// 3. x-ai/grok-4.1-fast is intentionally excluded — the benchmark showed it
//    hallucinates Thai tax IDs and person names. Unsafe for accounting.
//
// 4. meta-llama/llama-4-scout and meta-llama/llama-3.2-11b-vision-instruct
//    are excluded — both fail generateObject() structured output on OpenRouter
//    ("No object generated: could not parse the response" on every call).
//
// Benchmark run 2026-04-15 (12 models × 4 real Thai samples, per-field scoring
// vs Opus 4.6 ground truth) — results drove the defaults below:
//
//   qwen/qwen3-vl-32b-instruct             79% avg,  11/15 critical, 4/4 pass  ← WINNER
//   qwen/qwen3-vl-235b-a22b-instruct       79% avg,  100% on ID cards
//   mistralai/mistral-small-3.2-24b-inst   96% on clean English invoices
//   google/gemma-4-26b-a4b-it              42% avg  ← old default, demoted
//
// Full results: benchmarks/output/2026-04-15T10-13-25-166Z/
export const AVAILABLE_MODELS: ModelInfo[] = [
  {
    id: "qwen/qwen3-vl-32b-instruct",
    name: "Qwen 3 VL 32B",
    provider: "Alibaba",
    // Pricing as of Apr 2026
    inputCostPer1M: 0.104,
    outputCostPer1M: 0.416,
    purposes: ["extraction", "classification", "translation", "reconciliation"],
  },
  {
    id: "qwen/qwen3-vl-235b-a22b-instruct",
    name: "Qwen 3 VL 235B",
    provider: "Alibaba",
    inputCostPer1M: 0.2,
    outputCostPer1M: 0.88,
    purposes: ["extraction", "classification", "translation"],
  },
  {
    id: "qwen/qwen3-vl-8b-instruct",
    name: "Qwen 3 VL 8B",
    provider: "Alibaba",
    inputCostPer1M: 0.08,
    outputCostPer1M: 0.5,
    purposes: ["extraction", "classification", "translation", "reconciliation"],
  },
  {
    id: "mistralai/mistral-small-3.2-24b-instruct",
    name: "Mistral Small 3.2 24B",
    provider: "Mistral",
    inputCostPer1M: 0.075,
    outputCostPer1M: 0.2,
    purposes: ["classification", "translation", "reconciliation"],
  },
  {
    id: "google/gemma-4-26b-a4b-it",
    name: "Gemma 4 26B",
    provider: "Google",
    inputCostPer1M: 0.08,
    outputCostPer1M: 0.35,
    // Kept as a budget fallback; lost the benchmark on Thai docs.
    purposes: ["classification", "translation"],
  },
  {
    id: "qwen/qwen3.5-9b",
    name: "Qwen 3.5 9B",
    provider: "Alibaba",
    inputCostPer1M: 0.05,
    outputCostPer1M: 0.15,
    // Kept as a cheap fallback; superseded by qwen3-vl-32b on vision tasks.
    purposes: ["classification", "translation"],
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
  extraction: "qwen/qwen3-vl-32b-instruct",
  classification: "qwen/qwen3-vl-32b-instruct",
  translation: "qwen/qwen3-vl-32b-instruct",
  reconciliation: "mistralai/mistral-small-3.2-24b-instruct",
};

export function getModelsForPurpose(purpose: ModelPurpose): ModelInfo[] {
  return AVAILABLE_MODELS.filter((m) => m.purposes.includes(purpose));
}
