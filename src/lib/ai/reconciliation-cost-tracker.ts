import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { aiMatchSuggestions } from "@/lib/db/schema";
import { getOrgAiSettings } from "@/lib/db/queries/ai-settings";

const DEFAULT_RECONCILIATION_BUDGET_USD = 1.0;
const ALERT_THRESHOLD = 0.8;

// ---------------------------------------------------------------------------
// Get total AI reconciliation cost for the current calendar month
// ---------------------------------------------------------------------------

export async function getReconciliationMonthCost(orgId: string): Promise<number> {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [row] = await db
    .select({
      total: sql<string>`coalesce(sum(${aiMatchSuggestions.aiCostUsd}), 0)`,
    })
    .from(aiMatchSuggestions)
    .where(
      sql`${aiMatchSuggestions.orgId} = ${orgId}
        AND ${aiMatchSuggestions.createdAt} >= ${monthStart}
        AND (${aiMatchSuggestions.deletedAt} IS NULL)`
    );

  return parseFloat(row?.total ?? "0");
}

// ---------------------------------------------------------------------------
// Check whether an org can still run AI reconciliation within budget
// ---------------------------------------------------------------------------

export async function isWithinReconciliationBudget(orgId: string): Promise<boolean> {
  const [settings, spent] = await Promise.all([
    getOrgAiSettings(orgId),
    getReconciliationMonthCost(orgId),
  ]);

  const budget = settings?.reconciliationBudgetUsd
    ? parseFloat(settings.reconciliationBudgetUsd)
    : DEFAULT_RECONCILIATION_BUDGET_USD;

  return spent < budget;
}

// ---------------------------------------------------------------------------
// Full budget status for dashboard/alerts
// ---------------------------------------------------------------------------

export interface ReconciliationBudgetStatus {
  budgetUsd: number;
  spentUsd: number;
  remainingUsd: number;
  percentUsed: number;
  isOverBudget: boolean;
  isNearBudget: boolean;
  alertThreshold: number;
}

export async function getReconciliationBudgetStatus(
  orgId: string
): Promise<ReconciliationBudgetStatus> {
  const [settings, spentUsd] = await Promise.all([
    getOrgAiSettings(orgId),
    getReconciliationMonthCost(orgId),
  ]);

  const budgetUsd = settings?.reconciliationBudgetUsd
    ? parseFloat(settings.reconciliationBudgetUsd)
    : DEFAULT_RECONCILIATION_BUDGET_USD;

  const remainingUsd = Math.max(0, budgetUsd - spentUsd);
  const percentUsed = budgetUsd > 0 ? spentUsd / budgetUsd : 0;
  const isOverBudget = spentUsd >= budgetUsd;
  const isNearBudget = percentUsed >= ALERT_THRESHOLD && !isOverBudget;

  return {
    budgetUsd,
    spentUsd,
    remainingUsd,
    percentUsed,
    isOverBudget,
    isNearBudget,
    alertThreshold: ALERT_THRESHOLD,
  };
}
