import { MODEL_COSTS } from "./models";
import {
  getCurrentMonthCost,
  getOrgAiSettings,
} from "@/lib/db/queries/ai-settings";

const DEFAULT_BUDGET_USD = 0.5;

export interface CostEstimate {
  inputCost: number;
  outputCost: number;
  totalCost: number;
}

export interface BudgetStatus {
  budgetUsd: number | null;
  spentUsd: number;
  remainingUsd: number | null;
  percentUsed: number | null;
  isOverBudget: boolean;
  isNearBudget: boolean;
  alertThreshold: number;
}

export function estimateCost(
  modelId: string,
  inputTokens: number,
  outputTokens: number
): CostEstimate {
  const costs = MODEL_COSTS[modelId] ?? { input: 5.0, output: 15.0 };

  const inputCost = (inputTokens / 1_000_000) * costs.input;
  const outputCost = (outputTokens / 1_000_000) * costs.output;

  return {
    inputCost,
    outputCost,
    totalCost: inputCost + outputCost,
  };
}

export async function isWithinBudget(orgId: string): Promise<boolean> {
  const [settings, monthCost] = await Promise.all([
    getOrgAiSettings(orgId),
    getCurrentMonthCost(orgId),
  ]);

  const budgetUsd = settings?.monthlyBudgetUsd
    ? parseFloat(settings.monthlyBudgetUsd)
    : DEFAULT_BUDGET_USD;
  const spentUsd = parseFloat(monthCost.totalCost);

  return spentUsd < budgetUsd;
}

export async function getBudgetStatus(orgId: string): Promise<BudgetStatus> {
  const [settings, monthCost] = await Promise.all([
    getOrgAiSettings(orgId),
    getCurrentMonthCost(orgId),
  ]);

  const budgetUsd = settings?.monthlyBudgetUsd
    ? parseFloat(settings.monthlyBudgetUsd)
    : null;
  const spentUsd = parseFloat(monthCost.totalCost);
  const alertThreshold = settings?.budgetAlertThreshold
    ? parseFloat(settings.budgetAlertThreshold)
    : 0.8;

  const remainingUsd = budgetUsd !== null ? budgetUsd - spentUsd : null;
  const percentUsed = budgetUsd !== null && budgetUsd > 0 ? spentUsd / budgetUsd : null;
  const isOverBudget = budgetUsd !== null && spentUsd >= budgetUsd;
  const isNearBudget =
    percentUsed !== null && percentUsed >= alertThreshold && !isOverBudget;

  return {
    budgetUsd,
    spentUsd,
    remainingUsd,
    percentUsed,
    isOverBudget,
    isNearBudget,
    alertThreshold,
  };
}
