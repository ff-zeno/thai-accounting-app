"use server";

import { getVerifiedOrgId } from "@/lib/utils/org-context";
import {
  getReconciliationStats,
  getUnmatchedTransactions,
  getUnmatchedDocuments,
} from "@/lib/db/queries/reconciliation";
import { getLastManualTriggerTimestamp, recordBatchRun } from "@/lib/db/queries/ai-suggestions";
import { getCurrentUserId } from "@/lib/utils/auth";
import { isWithinReconciliationBudget } from "@/lib/ai/reconciliation-cost-tracker";
import { inngest } from "@/lib/inngest/client";

export async function getReconciliationDashboardData(period?: {
  start: string;
  end: string;
}) {
  const orgId = await getVerifiedOrgId();
  if (!orgId) {
    return {
      stats: {
        totalTransactions: 0,
        matchedTransactions: 0,
        unmatchedTransactions: 0,
        matchRate: 0,
        unmatchedAmount: "0.00",
      },
      unmatchedTransactions: [],
      unmatchedDocuments: [],
    };
  }

  const [stats, unmatchedTxns, unmatchedDocs] = await Promise.all([
    getReconciliationStats(orgId, period?.start, period?.end),
    getUnmatchedTransactions(orgId, 10),
    getUnmatchedDocuments(orgId, 10),
  ]);

  return {
    stats,
    unmatchedTransactions: unmatchedTxns,
    unmatchedDocuments: unmatchedDocs,
  };
}

// ---------------------------------------------------------------------------
// Manual AI batch trigger
// ---------------------------------------------------------------------------

export async function triggerAiBatchAction(): Promise<
  { success: true } | { error: string }
> {
  const orgId = await getVerifiedOrgId();
  if (!orgId) return { error: "No organization selected" };

  // Budget pre-check
  const withinBudget = await isWithinReconciliationBudget(orgId);
  if (!withinBudget) {
    return { error: "AI reconciliation budget exhausted for this month" };
  }

  // Rate limit: max 1 manual trigger per 10 minutes
  const lastTrigger = await getLastManualTriggerTimestamp(orgId);
  if (lastTrigger) {
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000);
    if (lastTrigger > tenMinAgo) {
      return { error: "Please wait 10 minutes between manual AI triggers" };
    }
  }

  const actorId = (await getCurrentUserId()) ?? undefined;

  // Record the trigger BEFORE sending event (prevents rapid re-triggering)
  await recordBatchRun({
    orgId,
    triggerType: "manual",
    triggeredBy: actorId,
  });

  try {
    await inngest.send({
      name: "reconciliation/ai-batch-requested",
      data: { orgId, trigger: "manual" },
    });
  } catch (err) {
    console.error("[trigger-ai-batch] Failed to send Inngest event:", err);
    return { error: "Failed to trigger AI batch" };
  }

  return { success: true };
}
