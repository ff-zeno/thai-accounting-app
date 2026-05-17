"use server";

import { getVerifiedOrgId } from "@/lib/utils/org-context";
import { requireOrgOwnerOrAdmin } from "@/lib/utils/admin-guard";
import {
  upsertOrgAiSettings,
  getOrgAiSettings,
  getAiCostSummary,
  getAiCostByDay,
  getAiCostByModel,
  getAiCostByPurpose,
  getRecentAiUsage,
} from "@/lib/db/queries/ai-settings";
import { AVAILABLE_MODELS } from "@/lib/ai/models-catalog";
import { db } from "@/lib/db";
import { auditLog } from "@/lib/db/schema";

const validModelIds = new Set(AVAILABLE_MODELS.map((m) => m.id));
const validCopilotProviders = new Set(["", "openai", "anthropic", "openrouter"]);
const safeSecretReferencePattern = /^[A-Za-z0-9_./:@-]{3,200}$/;
const rawProviderKeyPattern = /^(sk-|sk_|sk-ant-|sk-proj-|sk-or-)/i;
const safeCopilotModelPattern = /^[A-Za-z0-9._:/-]{1,120}$/;
const maxBudgetUsd = 999_999.99;
// Fail closed for audit payloads: add only explicitly safe fields here.
const aiSettingsAuditSafeKeys = [
  "id",
  "orgId",
  "extractionModel",
  "classificationModel",
  "translationModel",
  "monthlyBudgetUsd",
  "budgetAlertThreshold",
  "reconciliationBudgetUsd",
  "reconciliationModel",
  "copilotProvider",
  "copilotModel",
  "copilotMonthlyBudgetUsd",
  "copilotLiveModelEnabled",
  "copilotWriteToolsEnabled",
  "createdAt",
  "updatedAt",
] as const;

function redactAiSettingsForAudit(value: unknown) {
  if (!value || typeof value !== "object") return value;
  const source = value as Record<string, unknown>;
  return {
    ...Object.fromEntries(
      aiSettingsAuditSafeKeys
        .filter((key) => key in source)
        .map((key) => [key, source[key]])
    ),
    copilotApiKeySecretRefSet: Boolean(source.copilotApiKeySecretRef),
    copilotApiKeyLast4Set: Boolean(source.copilotApiKeyLast4),
  };
}

export async function updateAiSettingsAction(formData: FormData) {
  const { orgId, userId } = await requireOrgOwnerOrAdmin();

  const extractionModel = formData.get("extractionModel") as string | null;
  const classificationModel = formData.get("classificationModel") as string | null;
  const translationModel = formData.get("translationModel") as string | null;
  const monthlyBudgetUsd = formData.get("monthlyBudgetUsd") as string | null;
  const budgetAlertThreshold = formData.get("budgetAlertThreshold") as string | null;
  const copilotProvider = String(formData.get("copilotProvider") ?? "").trim();
  const copilotModel = String(formData.get("copilotModel") ?? "").trim();
  const copilotApiKeySecretRef = String(formData.get("copilotApiKeySecretRef") ?? "").trim();
  const copilotApiKeyLast4 = String(formData.get("copilotApiKeyLast4") ?? "").trim();
  const copilotMonthlyBudgetUsd = String(formData.get("copilotMonthlyBudgetUsd") ?? "").trim();
  const copilotLiveModelEnabled = formData.get("copilotLiveModelEnabled") === "on";
  const copilotWriteToolsEnabled = formData.get("copilotWriteToolsEnabled") === "on";

  // Validate model IDs are in catalog (empty string means use default)
  for (const [label, modelId] of [
    ["Extraction model", extractionModel],
    ["Classification model", classificationModel],
    ["Translation model", translationModel],
  ] as const) {
    if (modelId && modelId !== "" && !validModelIds.has(modelId)) {
      return { error: `${label} "${modelId}" is not in the available models catalog` };
    }
  }

  // Validate budget
  if (monthlyBudgetUsd && monthlyBudgetUsd !== "") {
    const budget = parseFloat(monthlyBudgetUsd);
    if (isNaN(budget) || budget < 0 || budget > maxBudgetUsd) {
      return { error: "Monthly budget must be between 0 and 999999.99" };
    }
  }
  if (!validCopilotProviders.has(copilotProvider)) {
    return { error: "Copilot provider must be OpenAI, Anthropic, OpenRouter, or blank" };
  }
  if (copilotModel && !safeCopilotModelPattern.test(copilotModel)) {
    return { error: "Copilot model must be 1-120 safe model-id characters" };
  }
  if (copilotLiveModelEnabled && (!copilotProvider || !copilotModel || !copilotApiKeySecretRef)) {
    return {
      error: "Live Copilot model requires provider, model, and API key secret reference",
    };
  }
  if (copilotLiveModelEnabled && copilotApiKeySecretRef && !process.env[copilotApiKeySecretRef]) {
    return {
      error: "Live Copilot model requires the API key secret reference to exist in server environment",
    };
  }
  if (copilotApiKeySecretRef) {
    if (!safeSecretReferencePattern.test(copilotApiKeySecretRef)) {
      return { error: "Copilot API key secret reference must be a safe secret name or reference" };
    }
    if (rawProviderKeyPattern.test(copilotApiKeySecretRef)) {
      return { error: "Copilot API key secret reference cannot be a raw provider key" };
    }
  }
  if (copilotApiKeyLast4 && !/^[A-Za-z0-9_-]{4}$/.test(copilotApiKeyLast4)) {
    return { error: "Copilot API key last 4 must be exactly 4 safe characters" };
  }
  if (copilotMonthlyBudgetUsd) {
    const budget = parseFloat(copilotMonthlyBudgetUsd);
    if (isNaN(budget) || budget < 0 || budget > maxBudgetUsd) {
      return { error: "Copilot monthly budget must be between 0 and 999999.99" };
    }
  }

  // Validate threshold (form sends 0–100, DB stores 0–1)
  let thresholdDecimal: string | null = null;
  if (budgetAlertThreshold && budgetAlertThreshold !== "") {
    const threshold = parseFloat(budgetAlertThreshold);
    if (isNaN(threshold) || threshold < 0 || threshold > 100) {
      return { error: "Alert threshold must be between 0 and 100" };
    }
    thresholdDecimal = (threshold / 100).toFixed(2);
  }

  const oldSettings = await getOrgAiSettings(orgId);
  const updated = await upsertOrgAiSettings(orgId, {
    extractionModel: extractionModel || null,
    classificationModel: classificationModel || null,
    translationModel: translationModel || null,
    monthlyBudgetUsd: monthlyBudgetUsd || null,
    budgetAlertThreshold: thresholdDecimal,
    copilotProvider: copilotProvider || null,
    copilotModel: copilotModel || null,
    copilotApiKeySecretRef: copilotApiKeySecretRef || null,
    copilotApiKeyLast4: copilotApiKeyLast4 || null,
    copilotMonthlyBudgetUsd: copilotMonthlyBudgetUsd || null,
    copilotLiveModelEnabled,
    copilotWriteToolsEnabled,
  });
  await db.insert(auditLog).values({
    orgId,
    entityType: "org_ai_settings",
    entityId: orgId,
    action: "update",
    actorId: userId,
    oldValue: redactAiSettingsForAudit(oldSettings),
    newValue: redactAiSettingsForAudit(updated),
  });

  return { success: true };
}

export async function getAiAnalyticsAction(period: "7d" | "30d" | "90d") {
  const orgId = await getVerifiedOrgId();
  if (!orgId) return null;

  const now = new Date();
  const days = period === "7d" ? 7 : period === "30d" ? 30 : 90;
  const start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

  const [summary, byDay, byModel, byPurpose, recent] = await Promise.all([
    getAiCostSummary(orgId, start, now),
    getAiCostByDay(orgId, start, now),
    getAiCostByModel(orgId, start, now),
    getAiCostByPurpose(orgId, start, now),
    getRecentAiUsage(orgId, 20),
  ]);

  return { summary, byDay, byModel, byPurpose, recent };
}
