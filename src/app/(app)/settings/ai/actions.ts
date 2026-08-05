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
  "createdAt",
  "updatedAt",
] as const;

function redactAiSettingsForAudit(value: unknown) {
  if (!value || typeof value !== "object") return value;
  const source = value as Record<string, unknown>;
  return Object.fromEntries(
    aiSettingsAuditSafeKeys
      .filter((key) => key in source)
      .map((key) => [key, source[key]])
  );
}

export async function updateAiSettingsAction(formData: FormData) {
  const { orgId, userId } = await requireOrgOwnerOrAdmin();

  const extractionModel = formData.get("extractionModel") as string | null;
  const classificationModel = formData.get("classificationModel") as string | null;
  const translationModel = formData.get("translationModel") as string | null;
  const monthlyBudgetUsd = formData.get("monthlyBudgetUsd") as string | null;
  const budgetAlertThreshold = formData.get("budgetAlertThreshold") as string | null;

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
