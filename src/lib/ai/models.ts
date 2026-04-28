import { getOpenRouterProvider } from "./provider";
import { getOrgAiSettings } from "@/lib/db/queries/ai-settings";

// Re-export client-safe catalog
export {
  AVAILABLE_MODELS,
  MODEL_COSTS,
  DEFAULT_MODEL_IDS,
  getModelsForPurpose,
  type ModelPurpose,
  type ModelInfo,
} from "./models-catalog";

import { DEFAULT_MODEL_IDS } from "./models-catalog";
import type { ModelPurpose } from "./models-catalog";

const PURPOSE_TO_SETTING_KEY: Record<ModelPurpose, "extractionModel" | "classificationModel" | "translationModel" | "reconciliationModel"> = {
  extraction: "extractionModel",
  classification: "classificationModel",
  translation: "translationModel",
  reconciliation: "reconciliationModel",
};

// Hard block: models that must never be resolved from stored ai_settings.
// If an org has one of these persisted (e.g. from an earlier config), we
// log a warning and fall through to the default.
//
// - anthropic/*            : Anthropic is permanently excluded from this app.
// - Commercial OpenRouter routes currently returning 403 on our account:
//   google/gemini-2.0-flash-001, google/gemini-2.5-flash*, openai/gpt-4o*,
//   openai/gpt-5*. Unblock by removing from this list once OpenRouter
//   support clears the account-level flag.
const BLOCKED_MODEL_PREFIXES = [
  "anthropic/",
  "google/gemini-2.0-flash",
  "google/gemini-2.5-flash",
  "openai/gpt-4o",
  "openai/gpt-5",
];

function isBlockedModelId(modelId: string): boolean {
  const lower = modelId.toLowerCase();
  return BLOCKED_MODEL_PREFIXES.some((p) => lower.startsWith(p));
}

export async function getModelId(
  purpose: ModelPurpose,
  orgId?: string
): Promise<string> {
  if (orgId) {
    const settings = await getOrgAiSettings(orgId);
    const key = PURPOSE_TO_SETTING_KEY[purpose];
    const stored = settings?.[key];
    if (stored && !isBlockedModelId(stored)) {
      return stored;
    }
    if (stored && isBlockedModelId(stored)) {
      console.warn(
        `[ai/models] Blocked Anthropic model "${stored}" stored in ai_settings for org ${orgId} (purpose=${purpose}); falling back to default.`
      );
    }
  }
  return DEFAULT_MODEL_IDS[purpose];
}

export async function getModel(purpose: ModelPurpose, orgId?: string) {
  const provider = getOpenRouterProvider();
  const modelId = await getModelId(purpose, orgId);
  return provider(modelId);
}
