import { getVerifiedOrgId } from "@/lib/utils/org-context";
import {
  getReconciliationStats,
  getUnmatchedTransactions,
  getUnmatchedDocuments,
  getRecentMatches,
} from "@/lib/db/queries/reconciliation";
import { getSuggestionCounts } from "@/lib/db/queries/ai-suggestions";
import { getQualityScoreData } from "@/lib/db/queries/reconciliation-metrics";
import { ReconciliationDashboard } from "./reconciliation-dashboard";

export default async function ReconciliationPage() {
  const orgId = await getVerifiedOrgId();

  const emptyStats = {
    totalTransactions: 0,
    matchedTransactions: 0,
    unmatchedTransactions: 0,
    matchRate: 0,
    unmatchedAmount: "0.00",
  };

  const emptySuggestionCounts = { pending: 0, approved: 0, rejected: 0, total: 0 };
  const emptyQuality = { matchRate: 0, avgAutoConfidence: null, falsePositivePct: 0, aiApprovalRate: null, score: 0 };

  if (!orgId) {
    return (
      <ReconciliationDashboard
        initialStats={emptyStats}
        initialUnmatchedTransactions={[]}
        initialUnmatchedDocuments={[]}
        recentMatches={[]}
        suggestionCounts={emptySuggestionCounts}
        qualityScore={emptyQuality}
        prevQualityScore={null}
      />
    );
  }

  // Compute previous month range for trend comparison
  const now = new Date();
  const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);

  const [stats, unmatchedTxns, unmatchedDocs, recentMatches, suggestionCounts, qualityScore, prevQualityScore] = await Promise.all([
    getReconciliationStats(orgId),
    getUnmatchedTransactions(orgId, 10),
    getUnmatchedDocuments(orgId, 10),
    getRecentMatches(orgId, 10),
    getSuggestionCounts(orgId),
    getQualityScoreData(orgId),
    getQualityScoreData(
      orgId,
      prevMonthStart.toISOString().split("T")[0],
      prevMonthEnd.toISOString().split("T")[0],
    ),
  ]);

  return (
    <ReconciliationDashboard
      initialStats={stats}
      initialUnmatchedTransactions={unmatchedTxns}
      initialUnmatchedDocuments={unmatchedDocs}
      recentMatches={recentMatches}
      suggestionCounts={suggestionCounts}
      qualityScore={qualityScore}
      prevQualityScore={prevQualityScore}
    />
  );
}
