import { inngest } from "../client";
import { db } from "@/lib/db";
import {
  getUnreconciledSettlements,
  linkSettlementToTransaction,
} from "@/lib/db/queries/processor-settlements";
import {
  findSettlementMatch,
  type SettlementMatchResult,
  type SettlementRef,
} from "@/lib/reconciliation/settlement-matcher";
import { fromSatang, toSatangOrZero } from "@/lib/utils/money";

export interface SettlementMatchingSummary {
  considered: number;
  matched: number;
  suggested: number;
  ambiguous: number;
  unmatched: number;
}

/** A settlement match at full confidence needs no second opinion. */
function statusFor(confidence: string): "matched" | "suggested" {
  return confidence === "1.00" ? "matched" : "suggested";
}

/** Thrown to roll a partially-claimed batch back rather than half-explain a deposit. */
class IncompleteBatchError extends Error {}

/**
 * Match unreconciled merchant settlements against unmatched bank credits.
 *
 * Shared by both entry points — a fresh settlement import, and a fresh
 * statement import — so the two cannot drift apart.
 *
 * Settlements are processed oldest period first, one at a time. Each link
 * commits before the next is attempted, and `findMatchCandidates` only ever
 * offers transactions still marked `unmatched`, so a deposit claimed here drops
 * out of the pool for every settlement considered afterwards. That is what
 * stops two payouts from claiming the same deposit, and it is also why this
 * loop is deliberately sequential rather than parallel.
 *
 * Nothing here touches VAT. A settlement explains a deposit; output VAT is owed
 * on the gross sale price recorded at the point of sale, never on this net.
 */
export async function runSettlementMatching(
  orgId: string,
  options: { processor?: string; limit?: number } = {}
): Promise<SettlementMatchingSummary> {
  const pending = await getUnreconciledSettlements(orgId, options);

  const summary: SettlementMatchingSummary = {
    considered: pending.length,
    matched: 0,
    suggested: 0,
    ambiguous: 0,
    unmatched: 0,
  };
  if (pending.length === 0) return summary;

  // Claimed within this run, so a settlement already linked is not offered back
  // to a later one as a batching sibling.
  const claimed = new Set<string>();

  for (const settlement of pending) {
    if (claimed.has(settlement.id)) continue;

    // A settlement with no period end has no date anchor, so there is nothing
    // to match against. It stays unreconciled for a human to correct.
    if (!settlement.periodEnd) {
      summary.unmatched++;
      continue;
    }
    const periodEnd = settlement.periodEnd.toISOString().split("T")[0];

    const siblings: SettlementRef[] = pending
      .filter(
        (other) =>
          other.id !== settlement.id &&
          !claimed.has(other.id) &&
          other.processor === settlement.processor
      )
      .map((other) => ({
        id: other.id,
        amount: other.netPayout,
        externalId: other.externalId,
      }));

    const result: SettlementMatchResult = await findSettlementMatch({
      orgId,
      settlementId: settlement.id,
      netPayout: settlement.netPayout,
      periodEnd,
      processor: settlement.processor,
      externalId: settlement.externalId,
      bankAccountId: null,
      siblings,
    });

    if (result.type === "none") {
      summary.unmatched++;
      continue;
    }

    if (result.type === "ambiguous") {
      // Two deposits the payout could equally be. Left for a human on the
      // payouts queue rather than resolved by coin flip.
      summary.ambiguous++;
      continue;
    }

    const status = statusFor(result.confidence);

    if (result.type === "batched") {
      const linked = await linkBatch(orgId, result, status);
      if (!linked) {
        summary.unmatched++;
        continue;
      }
      for (const id of result.settlementIds) claimed.add(id);
      // Every member of the batch is now explained by this deposit.
      const members = result.settlementIds.length;
      if (status === "matched") summary.matched += members;
      else summary.suggested += members;
      continue;
    }

    const discrepancySatang =
      toSatangOrZero(result.transactionAmount) -
      toSatangOrZero(settlement.netPayout);

    const linked = await linkSettlementToTransaction({
      orgId,
      settlementId: settlement.id,
      transactionId: result.transactionId,
      status,
      confidence: result.confidence,
      metadata: result.metadata,
      discrepancy:
        discrepancySatang === 0 ? null : fromSatang(discrepancySatang),
    });

    if (!linked) {
      summary.unmatched++;
      continue;
    }

    claimed.add(settlement.id);
    if (status === "matched") summary.matched++;
    else summary.suggested++;
  }

  return summary;
}

/**
 * Link every settlement in a batch to the one deposit, all or nothing.
 *
 * A half-linked batch is worse than no link: `recomputeTransactionStatus`
 * treats any live settlement claim as fully explaining the deposit, so one
 * member of a two-member batch would mark the deposit matched while half its
 * value went unaccounted for.
 *
 * No per-row discrepancy is recorded: a batch member's net is only part of the
 * deposit, so the difference between them is not a discrepancy. The batch as a
 * whole is within one satang by construction, and the members are named in the
 * stored match metadata.
 */
async function linkBatch(
  orgId: string,
  result: Extract<SettlementMatchResult, { type: "batched" }>,
  status: "matched" | "suggested"
): Promise<boolean> {
  try {
    await db.transaction(async (tx) => {
      for (const settlementId of result.settlementIds) {
        const linked = await linkSettlementToTransaction(
          {
            orgId,
            settlementId,
            transactionId: result.transactionId,
            status,
            confidence: result.confidence,
            metadata: result.metadata,
            discrepancy: null,
          },
          tx
        );
        if (!linked) throw new IncompleteBatchError();
      }
    });
    return true;
  } catch (error) {
    if (error instanceof IncompleteBatchError) return false;
    throw error;
  }
}

/**
 * Match settlements as soon as they are imported, against deposits that are
 * already on the statement.
 */
export const matchSettlements = inngest.createFunction(
  {
    id: "match-settlements",
    concurrency: [{ scope: "fn", key: "event.data.orgId", limit: 1 }],
    retries: 2,
  },
  { event: "settlements/imported" },
  async ({ event, step }) => {
    const { orgId, processor } = event.data as {
      orgId: string;
      processor?: string;
    };

    if (!orgId) return { status: "no-org" };

    // Idempotent: only settlements with no deposit claimed are considered, so
    // a retry re-runs against whatever is genuinely still outstanding.
    const summary = await step.run("match-settlements", () =>
      runSettlementMatching(orgId, { processor })
    );

    return { status: "complete", ...summary };
  }
);
