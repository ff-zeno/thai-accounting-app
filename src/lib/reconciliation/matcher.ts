import { findMatchCandidates } from "@/lib/db/queries/reconciliation";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MatchResult =
  | { type: "exact"; transactionId: string; confidence: string }
  | { type: "fuzzy"; transactionId: string; confidence: string }
  | {
      type: "split";
      transactions: Array<{ id: string; amount: string }>;
      confidence: string;
    }
  | {
      type: "ambiguous";
      candidates: Array<{ id: string; amount: string; date: string }>;
    }
  | { type: "none" };

export interface MatchCandidate {
  id: string;
  amount: string;
  date: string;
  description: string | null;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const EXACT_DATE_WINDOW_DAYS = 7;
const FUZZY_DATE_WINDOW_DAYS = 14;
const FUZZY_AMOUNT_TOLERANCE = 0.01; // 1%
const MAX_SPLIT_TRANSACTIONS = 3;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Find the best match for a document payment against bank transactions.
 *
 * Priority: exact > fuzzy > split > none.
 * If multiple exact matches exist, returns ambiguous instead of auto-matching.
 */
export async function findMatches(
  orgId: string,
  netAmountPaid: string,
  paymentDate: string
): Promise<MatchResult> {
  // Step 1: Try exact match
  const exactResult = await tryExactMatch(orgId, netAmountPaid, paymentDate);
  if (exactResult) return exactResult;

  // Step 2: Try fuzzy match
  const fuzzyResult = await tryFuzzyMatch(orgId, netAmountPaid, paymentDate);
  if (fuzzyResult) return fuzzyResult;

  // Step 3: Try split match
  const splitResult = await trySplitMatch(orgId, netAmountPaid, paymentDate);
  if (splitResult) return splitResult;

  return { type: "none" };
}

// ---------------------------------------------------------------------------
// Exact match: amount matches exactly, date within +/-7 days
// ---------------------------------------------------------------------------

async function tryExactMatch(
  orgId: string,
  amount: string,
  paymentDate: string
): Promise<MatchResult | null> {
  const candidates = await findMatchCandidates(
    orgId,
    null,
    amount,
    paymentDate,
    { amountTolerance: 0, dateDays: EXACT_DATE_WINDOW_DAYS }
  );

  // Filter to truly exact matches (findMatchCandidates uses >= / <= which
  // already gives exact when tolerance is 0)
  const exactMatches = candidates.filter(
    (c) => parseFloat(c.amount) === parseFloat(amount)
  );

  if (exactMatches.length === 0) return null;

  // Ambiguous: multiple exact matches -- don't auto-pick
  if (exactMatches.length > 1) {
    return {
      type: "ambiguous",
      candidates: exactMatches.map((c) => ({
        id: c.id,
        amount: c.amount,
        date: c.date,
      })),
    };
  }

  return {
    type: "exact",
    transactionId: exactMatches[0].id,
    confidence: "1.00",
  };
}

// ---------------------------------------------------------------------------
// Fuzzy match: amount within 1%, date within +/-14 days
// ---------------------------------------------------------------------------

async function tryFuzzyMatch(
  orgId: string,
  amount: string,
  paymentDate: string
): Promise<MatchResult | null> {
  const candidates = await findMatchCandidates(
    orgId,
    null,
    amount,
    paymentDate,
    {
      amountTolerance: FUZZY_AMOUNT_TOLERANCE,
      dateDays: FUZZY_DATE_WINDOW_DAYS,
    }
  );

  // Exclude exact matches (already tried above)
  const parsedAmount = parseFloat(amount);
  const fuzzyOnly = candidates.filter(
    (c) => parseFloat(c.amount) !== parsedAmount
  );

  if (fuzzyOnly.length === 0) return null;

  // Score each candidate and pick the best
  const scored = fuzzyOnly
    .map((c) => ({
      ...c,
      confidence: computeFuzzyConfidence(
        parsedAmount,
        parseFloat(c.amount),
        paymentDate,
        c.date
      ),
    }))
    .sort((a, b) => b.confidence - a.confidence);

  const best = scored[0];

  return {
    type: "fuzzy",
    transactionId: best.id,
    confidence: best.confidence.toFixed(2),
  };
}

/**
 * Confidence = 1.0 - (amount_diff_pct * 5) - (date_diff_days / 14 * 0.3)
 * Clamped to [0, 1]
 */
function computeFuzzyConfidence(
  expectedAmount: number,
  actualAmount: number,
  expectedDate: string,
  actualDate: string
): number {
  const amountDiffPct = Math.abs(actualAmount - expectedAmount) / expectedAmount;
  const dateDiffDays = Math.abs(
    (new Date(actualDate).getTime() - new Date(expectedDate).getTime()) /
      (1000 * 60 * 60 * 24)
  );

  const confidence = 1.0 - amountDiffPct * 5 - (dateDiffDays / 14) * 0.3;
  return Math.max(0, Math.min(1, confidence));
}

// ---------------------------------------------------------------------------
// Split match: 2-3 unmatched transactions whose sum = netAmountPaid
// ---------------------------------------------------------------------------

async function trySplitMatch(
  orgId: string,
  amount: string,
  paymentDate: string
): Promise<MatchResult | null> {
  // Get all unmatched transactions within the date window first (performance guard)
  const candidates = await findMatchCandidates(
    orgId,
    null,
    amount,
    paymentDate,
    {
      // Use a wide tolerance to get all transactions that could contribute to a split
      amountTolerance: 1.0, // up to 100% of the amount (individual parts can be smaller)
      dateDays: FUZZY_DATE_WINDOW_DAYS,
    }
  );

  // Only consider transactions smaller than the target
  const targetAmount = parseFloat(amount);
  const smaller = candidates.filter(
    (c) => parseFloat(c.amount) < targetAmount
  );

  if (smaller.length < 2) return null;

  // Try 2-transaction combinations first, then 3
  const twoMatch = findSumCombination(smaller, targetAmount, 2);
  if (twoMatch) {
    return {
      type: "split",
      transactions: twoMatch.map((t) => ({ id: t.id, amount: t.amount })),
      confidence: "0.90",
    };
  }

  const threeMatch = findSumCombination(smaller, targetAmount, 3);
  if (threeMatch) {
    return {
      type: "split",
      transactions: threeMatch.map((t) => ({ id: t.id, amount: t.amount })),
      confidence: "0.70",
    };
  }

  return null;
}

/**
 * Find a combination of exactly `count` candidates whose amounts sum to `target`.
 * Uses tolerance of 0.01 (1 satang) for floating point comparison.
 */
function findSumCombination(
  candidates: MatchCandidate[],
  target: number,
  count: number
): MatchCandidate[] | null {
  const TOLERANCE = 0.01;

  if (count === 2) {
    for (let i = 0; i < candidates.length; i++) {
      for (let j = i + 1; j < candidates.length; j++) {
        const sum =
          parseFloat(candidates[i].amount) + parseFloat(candidates[j].amount);
        if (Math.abs(sum - target) <= TOLERANCE) {
          return [candidates[i], candidates[j]];
        }
      }
    }
  }

  if (count === 3) {
    for (let i = 0; i < candidates.length; i++) {
      for (let j = i + 1; j < candidates.length; j++) {
        for (let k = j + 1; k < candidates.length; k++) {
          const sum =
            parseFloat(candidates[i].amount) +
            parseFloat(candidates[j].amount) +
            parseFloat(candidates[k].amount);
          if (Math.abs(sum - target) <= TOLERANCE) {
            return [candidates[i], candidates[j], candidates[k]];
          }
        }
      }
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Exported for testing
// ---------------------------------------------------------------------------

export {
  computeFuzzyConfidence,
  findSumCombination,
  tryExactMatch,
  tryFuzzyMatch,
  trySplitMatch,
  MAX_SPLIT_TRANSACTIONS,
  EXACT_DATE_WINDOW_DAYS,
  FUZZY_DATE_WINDOW_DAYS,
  FUZZY_AMOUNT_TOLERANCE,
};
