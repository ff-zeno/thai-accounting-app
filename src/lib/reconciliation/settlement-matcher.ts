import {
  findMatchCandidates,
  type MatchCandidateRow,
} from "@/lib/db/queries/reconciliation";
import { escapeRegex, findSumCombination, type MatchMetadata } from "./matcher";
import { normalizeCounterparty } from "./thai-text";
import { amountsEqual, toSatang, toSatangOrZero } from "@/lib/utils/money";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A settlement in the batching pool — the one being matched, or a sibling. */
export interface SettlementRef {
  id: string;
  /** Net payout. Named `amount` so findSumCombination accepts it directly. */
  amount: string;
  externalId: string;
}

export interface SettlementMatchContext {
  orgId: string;
  settlementId: string;
  netPayout: string;
  /** The close of the settlement period. The deposit lands on or after this. */
  periodEnd: string;
  processor: string;
  externalId: string;
  bankAccountId?: string | null;
  /**
   * Other unreconciled settlements from the same processor, for the batched
   * layer. Passed in rather than queried here so the matcher stays a pure
   * function of its inputs, exactly as findMatches is.
   */
  siblings?: SettlementRef[];
}

export type SettlementMatchResult =
  | {
      type: "reference" | "exact" | "processor";
      transactionId: string;
      /** The deposit's own amount, so callers need not re-read it to
       *  record how far it sits from the stated net payout. */
      transactionAmount: string;
      confidence: string;
      metadata: MatchMetadata;
    }
  | {
      /** One deposit clears this settlement plus the other listed ones. */
      type: "batched";
      transactionId: string;
      transactionAmount: string;
      settlementIds: string[];
      confidence: string;
      metadata: MatchMetadata;
    }
  | {
      type: "ambiguous";
      candidates: Array<{ id: string; amount: string; date: string }>;
    }
  | { type: "none" };

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/**
 * Processors deposit *after* a period closes, never before, so the window is
 * forward-only from `periodEnd`. findMatchCandidates only takes a symmetric
 * window, so the matcher widens it there and drops the backward half itself,
 * rather than growing a second candidate query.
 */
const PAYOUT_WINDOW_DAYS = 10;
/** Wider still for the reference layer, where the ID is the primary signal. */
const REFERENCE_WINDOW_DAYS = 21;
/** Amount tolerance for the reference layer — the ID carries the match. */
const REFERENCE_AMOUNT_TOLERANCE = 0.05;
const PROCESSOR_AMOUNT_TOLERANCE = 0.01;
const MAX_BATCHED_SETTLEMENTS = 3;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Find the bank deposit that a merchant settlement explains.
 *
 * Priority cascade, first non-null wins — same shape as findMatches:
 *   Layer 0: Reference — the processor's settlement ID appears in the deposit text
 *   Layer 1: Exact     — a credit equal to the stated net payout
 *   Layer 2: Processor — the processor's name on a credit within 1% of net
 *   Layer 3: Batched   — one deposit clearing this settlement plus 1-2 siblings
 *
 * The comparison is against `net_payout`, which the settlement states itself:
 * the fee haircut is already resolved inside the record, so this never needs
 * the document matcher's fuzzy amount signal (which zeroes out past a 10%
 * difference and would be useless against a 2-3% MDR haircut anyway).
 *
 * A match here is evidence that a deposit is explained. It is never an income
 * figure — output VAT is owed on the gross sale price, not on this net.
 *
 * Only credits are considered: a payout is money arriving.
 */
export async function findSettlementMatch(
  ctx: SettlementMatchContext
): Promise<SettlementMatchResult> {
  // A malformed or zero payout cannot be meaningfully matched, and would make
  // the proportional comparisons below meaningless.
  const netSatang = toSatang(ctx.netPayout);
  if (netSatang === null || netSatang === 0) return { type: "none" };

  const reference = await tryReferenceMatch(ctx);
  if (reference) return reference;

  const exact = await tryExactMatch(ctx);
  if (exact) return exact;

  const processor = await tryProcessorMatch(ctx);
  if (processor) return processor;

  const batched = await tryBatchedMatch(ctx);
  if (batched) return batched;

  return { type: "none" };
}

// ---------------------------------------------------------------------------
// Candidate loading
// ---------------------------------------------------------------------------

/** Credits only, and only on or after the period close. */
function filterPayoutCandidates(
  candidates: MatchCandidateRow[],
  periodEnd: string,
  windowDays: number
): MatchCandidateRow[] {
  const end = new Date(periodEnd);
  if (Number.isNaN(end.getTime())) return [];
  const latest = new Date(end);
  latest.setDate(latest.getDate() + windowDays);

  return candidates.filter((candidate) => {
    if (candidate.type !== "credit") return false;
    const date = new Date(candidate.date);
    if (Number.isNaN(date.getTime())) return false;
    return date >= end && date <= latest;
  });
}

async function loadCandidates(
  ctx: SettlementMatchContext,
  options: { amountTolerance: number; windowDays: number }
): Promise<MatchCandidateRow[]> {
  const candidates = await findMatchCandidates(
    ctx.orgId,
    ctx.bankAccountId ?? null,
    ctx.netPayout,
    ctx.periodEnd,
    { amountTolerance: options.amountTolerance, dateDays: options.windowDays }
  );
  return filterPayoutCandidates(candidates, ctx.periodEnd, options.windowDays);
}

function searchableText(candidate: MatchCandidateRow): string {
  return [candidate.description, candidate.counterparty, candidate.referenceNo]
    .filter(Boolean)
    .join(" ");
}

function metadata(
  layer: MatchMetadata["layer"],
  signals: MatchMetadata["signals"],
  candidateCount: number,
  selectedRank: number
): MatchMetadata {
  return { layer, signals, candidateCount, selectedRank };
}

// ---------------------------------------------------------------------------
// Layer 0: Reference — the settlement ID appears in the deposit text
// ---------------------------------------------------------------------------

async function tryReferenceMatch(
  ctx: SettlementMatchContext
): Promise<SettlementMatchResult | null> {
  const externalId = ctx.externalId.trim();
  if (!externalId) return null;

  const candidates = await loadCandidates(ctx, {
    amountTolerance: REFERENCE_AMOUNT_TOLERANCE,
    windowDays: REFERENCE_WINDOW_DAYS,
  });
  if (candidates.length === 0) return null;

  // \b would not fire on an ID ending in a non-word character, and settlement
  // IDs routinely carry punctuation, so the boundary is spelled out.
  const idPattern = new RegExp(
    `(^|[^A-Za-z0-9])${escapeRegex(externalId)}([^A-Za-z0-9]|$)`,
    "i"
  );

  for (let rank = 0; rank < candidates.length; rank++) {
    const candidate = candidates[rank];
    const text = searchableText(candidate);
    if (!text || !idPattern.test(text)) continue;

    const amountExact = amountsEqual(candidate.amount, ctx.netPayout);

    return {
      type: "reference",
      transactionId: candidate.id,
      transactionAmount: candidate.amount,
      // An exact amount alongside the ID leaves nothing to doubt. Without it
      // the ID is still strong, but the two figures disagree and a human
      // should see why before the deposit counts as explained.
      confidence: amountExact ? "1.00" : "0.85",
      metadata: metadata(
        "reference",
        {
          referenceFound: {
            score: 1.0,
            detail: `settlement ${externalId} in transaction text`,
          },
          amount: {
            score: amountExact ? 1.0 : 0,
            detail: amountExact
              ? `exact: ${ctx.netPayout}`
              : `deposit ${candidate.amount} vs net payout ${ctx.netPayout}`,
          },
        },
        candidates.length,
        rank
      ),
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Layer 1: Exact — a credit equal to the stated net payout
// ---------------------------------------------------------------------------

async function tryExactMatch(
  ctx: SettlementMatchContext
): Promise<SettlementMatchResult | null> {
  const candidates = await loadCandidates(ctx, {
    amountTolerance: 0,
    windowDays: PAYOUT_WINDOW_DAYS,
  });

  const exact = candidates.filter((candidate) =>
    amountsEqual(candidate.amount, ctx.netPayout)
  );
  if (exact.length === 0) return null;

  // Two deposits of the same amount in the same window are genuinely
  // indistinguishable on amount alone. Picking one would silently attach the
  // payout to the wrong deposit, so this goes to a human instead.
  if (exact.length > 1) {
    return {
      type: "ambiguous",
      candidates: exact.map((candidate) => ({
        id: candidate.id,
        amount: candidate.amount,
        date: candidate.date,
      })),
    };
  }

  return {
    type: "exact",
    transactionId: exact[0].id,
    transactionAmount: exact[0].amount,
    confidence: "1.00",
    metadata: metadata(
      "exact",
      {
        amount: { score: 1.0, detail: `exact: ${ctx.netPayout}` },
        dateProximity: {
          score: 1.0,
          detail: `${exact[0].date}, within ${PAYOUT_WINDOW_DAYS} days of period end ${ctx.periodEnd}`,
        },
      },
      candidates.length,
      candidates.indexOf(exact[0])
    ),
  };
}

// ---------------------------------------------------------------------------
// Layer 2: Processor — the processor's name on a near-net credit
// ---------------------------------------------------------------------------

async function tryProcessorMatch(
  ctx: SettlementMatchContext
): Promise<SettlementMatchResult | null> {
  const processorKey = normalizeCounterparty(ctx.processor);
  if (!processorKey) return null;

  const candidates = await loadCandidates(ctx, {
    amountTolerance: PROCESSOR_AMOUNT_TOLERANCE,
    windowDays: PAYOUT_WINDOW_DAYS,
  });
  if (candidates.length === 0) return null;

  for (let rank = 0; rank < candidates.length; rank++) {
    const candidate = candidates[rank];
    const text = normalizeCounterparty(searchableText(candidate));
    if (!text || !text.includes(processorKey)) continue;

    return {
      type: "processor",
      transactionId: candidate.id,
      transactionAmount: candidate.amount,
      confidence: "0.80",
      metadata: metadata(
        "processor",
        {
          processorName: { score: 1.0, detail: ctx.processor },
          amount: {
            score: 1.0,
            detail: `${candidate.amount}, within 1% of net payout ${ctx.netPayout}`,
          },
        },
        candidates.length,
        rank
      ),
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Layer 3: Batched — one deposit clearing several payouts
// ---------------------------------------------------------------------------

async function tryBatchedMatch(
  ctx: SettlementMatchContext
): Promise<SettlementMatchResult | null> {
  const siblings = ctx.siblings ?? [];
  if (siblings.length === 0) return null;

  const netSatang = toSatangOrZero(ctx.netPayout);
  if (netSatang <= 0) return null;

  const pool: SettlementRef[] = [
    { id: ctx.settlementId, amount: ctx.netPayout, externalId: ctx.externalId },
    ...siblings,
  ];

  // A batched deposit is larger than this settlement's own net, so the
  // candidate query has to be opened up on amount. The widest a real batch can
  // be is this settlement plus the largest siblings that could join it, so the
  // tolerance is derived from the pool rather than guessed at.
  const largestSiblings = siblings
    .map((sibling) => toSatangOrZero(sibling.amount))
    .sort((a, b) => b - a)
    .slice(0, MAX_BATCHED_SETTLEMENTS - 1);
  const maxBatchSatang =
    netSatang + largestSiblings.reduce((sum, value) => sum + value, 0);
  const amountTolerance = (maxBatchSatang - netSatang) / netSatang;
  if (amountTolerance <= 0) return null;

  const candidates = await loadCandidates(ctx, {
    amountTolerance,
    windowDays: PAYOUT_WINDOW_DAYS,
  });
  if (candidates.length === 0) return null;

  for (let rank = 0; rank < candidates.length; rank++) {
    const candidate = candidates[rank];
    const targetSatang = toSatangOrZero(candidate.amount);
    // A batch is strictly larger than any one settlement inside it; anything
    // at or below this net was already the exact layer's business.
    if (targetSatang <= netSatang) continue;

    for (let size = 2; size <= MAX_BATCHED_SETTLEMENTS; size++) {
      if (size > pool.length) break;
      const combination = findSumCombination(pool, targetSatang, size);
      // The settlement being matched has to be in the batch. Without this the
      // result would be a match for some *other* settlements, recorded against
      // this one. The check is exact rather than approximate: this settlement
      // sits at index 0 of the pool and findSumCombination enumerates indices
      // ascending, so every combination containing it is tried first — a first
      // hit that excludes it means no qualifying combination exists.
      if (
        !combination ||
        !combination.some((entry) => entry.id === ctx.settlementId)
      ) {
        continue;
      }

      return {
        type: "batched",
        transactionId: candidate.id,
        transactionAmount: candidate.amount,
        settlementIds: combination.map((entry) => entry.id),
        // Two payouts adding up is a common, legible batch. Three is far more
        // likely to be a coincidence of amounts, so it wants a human.
        confidence: size === 2 ? "0.90" : "0.70",
        metadata: metadata(
          "batched",
          {
            batch: {
              score: 1.0,
              detail: `${size} settlements sum to deposit ${candidate.amount} (${combination
                .map((entry) => entry.externalId)
                .join(", ")})`,
            },
          },
          candidates.length,
          rank
        ),
      };
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Exported for testing
// ---------------------------------------------------------------------------

export {
  tryReferenceMatch,
  tryExactMatch,
  tryProcessorMatch,
  tryBatchedMatch,
  filterPayoutCandidates,
  PAYOUT_WINDOW_DAYS,
  REFERENCE_WINDOW_DAYS,
  PROCESSOR_AMOUNT_TOLERANCE,
  MAX_BATCHED_SETTLEMENTS,
};
