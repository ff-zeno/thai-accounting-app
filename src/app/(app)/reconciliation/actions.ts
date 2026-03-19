"use server";

import { getVerifiedOrgId } from "@/lib/utils/org-context";
import {
  getReconciliationStats,
  getUnmatchedTransactions,
  getUnmatchedDocuments,
} from "@/lib/db/queries/reconciliation";

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
