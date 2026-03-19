import { Suspense } from "react";
import { getActiveOrgId } from "@/lib/utils/org-context";
import {
  getUnmatchedTransactions,
  getUnmatchedDocuments,
} from "@/lib/db/queries/reconciliation";
import { ManualMatch } from "./manual-match";

export default async function ReconciliationReviewPage() {
  const orgId = await getActiveOrgId();

  if (!orgId) {
    return (
      <ManualMatch initialTransactions={[]} initialDocuments={[]} />
    );
  }

  const [txns, docs] = await Promise.all([
    getUnmatchedTransactions(orgId, 100),
    getUnmatchedDocuments(orgId, 100),
  ]);

  return (
    <Suspense>
      <ManualMatch initialTransactions={txns} initialDocuments={docs} />
    </Suspense>
  );
}
