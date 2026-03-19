import { getActiveOrgId } from "@/lib/utils/org-context";
import {
  getReconciliationStats,
  getUnmatchedTransactions,
  getUnmatchedDocuments,
} from "@/lib/db/queries/reconciliation";
import { ReconciliationDashboard } from "./reconciliation-dashboard";

export default async function ReconciliationPage() {
  const orgId = await getActiveOrgId();

  const emptyStats = {
    totalTransactions: 0,
    matchedTransactions: 0,
    unmatchedTransactions: 0,
    matchRate: 0,
    unmatchedAmount: "0.00",
  };

  if (!orgId) {
    return (
      <ReconciliationDashboard
        initialStats={emptyStats}
        initialUnmatchedTransactions={[]}
        initialUnmatchedDocuments={[]}
      />
    );
  }

  const [stats, unmatchedTxns, unmatchedDocs] = await Promise.all([
    getReconciliationStats(orgId),
    getUnmatchedTransactions(orgId, 10),
    getUnmatchedDocuments(orgId, 10),
  ]);

  return (
    <ReconciliationDashboard
      initialStats={stats}
      initialUnmatchedTransactions={unmatchedTxns}
      initialUnmatchedDocuments={unmatchedDocs}
    />
  );
}
