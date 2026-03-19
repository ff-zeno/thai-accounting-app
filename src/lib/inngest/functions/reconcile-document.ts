import { inngest } from "../client";
import { findMatches, type MatchResult } from "@/lib/reconciliation/matcher";
import {
  createMatch,
  updateTransactionReconStatus,
} from "@/lib/db/queries/reconciliation";

export const reconcileDocument = inngest.createFunction(
  {
    id: "reconcile-document",
    concurrency: [{ scope: "fn", key: "event.data.orgId", limit: 1 }],
    retries: 2,
  },
  { event: "document/confirmed" },
  async ({ event, step }) => {
    const { documentId, paymentId, orgId, netAmountPaid, paymentDate } =
      event.data;

    // Step 1: Find match candidates
    const matchResult: MatchResult = await step.run(
      "find-matches",
      async () => {
        return findMatches(orgId, netAmountPaid, paymentDate);
      }
    );

    // Step 2: Process match result
    if (matchResult.type === "exact" || matchResult.type === "fuzzy") {
      await step.run("apply-single-match", async () => {
        await createMatch({
          orgId,
          transactionId: matchResult.transactionId,
          documentId,
          paymentId,
          matchedAmount: netAmountPaid,
          matchType: matchResult.type as "exact" | "fuzzy",
          confidence: matchResult.confidence,
          matchedBy: "auto",
        });

        await updateTransactionReconStatus(
          orgId,
          matchResult.transactionId,
          "matched"
        );
      });

      return {
        status: "matched",
        type: matchResult.type,
        transactionId: matchResult.transactionId,
      };
    }

    if (matchResult.type === "split") {
      await step.run("apply-split-match", async () => {
        for (const txn of matchResult.transactions) {
          await createMatch({
            orgId,
            transactionId: txn.id,
            documentId,
            paymentId,
            matchedAmount: txn.amount,
            matchType: "exact",
            confidence: matchResult.confidence,
            matchedBy: "auto",
          });

          await updateTransactionReconStatus(orgId, txn.id, "matched");
        }
      });

      return {
        status: "matched",
        type: "split",
        transactionIds: matchResult.transactions.map((t) => t.id),
      };
    }

    if (matchResult.type === "ambiguous") {
      // Create ai_suggested matches for manual resolution -- don't auto-pick
      await step.run("flag-ambiguous", async () => {
        for (const candidate of matchResult.candidates) {
          await createMatch({
            orgId,
            transactionId: candidate.id,
            documentId,
            paymentId,
            matchedAmount: netAmountPaid,
            matchType: "ai_suggested",
            confidence: "0.50",
            matchedBy: "auto",
          });
        }
      });

      return {
        status: "ambiguous",
        candidateCount: matchResult.candidates.length,
      };
    }

    // No match found -- document remains unmatched
    return { status: "unmatched" };
  }
);
