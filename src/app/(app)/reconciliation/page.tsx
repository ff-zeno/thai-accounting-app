import { getVerifiedOrgId } from "@/lib/utils/org-context";
import {
  getReconciliationStats,
  getUnmatchedTransactions,
  getUnmatchedDocuments,
  getRecentMatches,
} from "@/lib/db/queries/reconciliation";
import { getSuggestionCounts } from "@/lib/db/queries/ai-suggestions";
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

  if (!orgId) {
    return (
      <ReconciliationDashboard
        initialStats={emptyStats}
        initialUnmatchedTransactions={[]}
        initialUnmatchedDocuments={[]}
        recentMatches={[]}
        suggestionCounts={emptySuggestionCounts}
      />
    );
  }

  const [stats, unmatchedTxns, unmatchedDocs, recentMatches, suggestionCounts] = await Promise.all([
    getReconciliationStats(orgId),
    getUnmatchedTransactions(orgId, 10),
    getUnmatchedDocuments(orgId, 10),
    getRecentMatches(orgId, 10),
    getSuggestionCounts(orgId),
  ]);

  return (
    <ReconciliationDashboard
      initialStats={stats}
      initialUnmatchedTransactions={unmatchedTxns}
      initialUnmatchedDocuments={unmatchedDocs}
      recentMatches={recentMatches}
      suggestionCounts={suggestionCounts}
    />
  );
}
