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

const PURPOSE_TO_SETTING_KEY: Record<ModelPurpose, "extractionModel" | "classificationModel" | "translationModel"> = {
  extraction: "extractionModel",
  classification: "classificationModel",
  translation: "translationModel",
};

export async function getModelId(
  purpose: ModelPurpose,
  orgId?: string
): Promise<string> {
  if (orgId) {
    const settings = await getOrgAiSettings(orgId);
    const key = PURPOSE_TO_SETTING_KEY[purpose];
    if (settings?.[key]) {
      return settings[key];
    }
  }
  return DEFAULT_MODEL_IDS[purpose];
}

export async function getModel(purpose: ModelPurpose, orgId?: string) {
  const provider = getOpenRouterProvider();
  const modelId = await getModelId(purpose, orgId);
  return provider(modelId);
}
