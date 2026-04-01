import {
  findMatchCandidates,
  type MatchCandidateRow,
} from "@/lib/db/queries/reconciliation";
import { findAliasByText } from "@/lib/db/queries/vendor-aliases";
import { getActiveRules, incrementRuleMatchCount } from "@/lib/db/queries/reconciliation-rules";
import { normalizeCounterparty, normalizeCompanyName, tokenOverlap } from "./thai-text";
import { evaluateRules, type TransactionContext } from "./rule-engine";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MatchContext {
  orgId: string;
  netAmountPaid: string;
  paymentDate: string;
  documentId: string;
  vendorId: string | null;
  vendorName: string | null;
  vendorNameTh: string | null;
  vendorTaxId: string | null;
  documentNumber: string | null;
  direction: "expense" | "income";
  bankAccountId?: string | null;
}

export interface MatchMetadata {
  layer: "reference" | "exact" | "fuzzy" | "split" | "alias" | "multi_signal" | "rule" | "ai";
  signals: Record<string, { score: number; detail: string }>;
  candidateCount: number;
  selectedRank: number;
}

export type MatchResult =
  | { type: "reference"; transactionId: string; confidence: string; metadata: MatchMetadata }
  | { type: "pattern"; transactionId: string; confidence: string; metadata: MatchMetadata }
  | { type: "exact"; transactionId: string; confidence: string; metadata: MatchMetadata }
  | { type: "fuzzy"; transactionId: string; confidence: string; metadata: MatchMetadata }
  | { type: "multi_signal"; transactionId: string; confidence: string; metadata: MatchMetadata }
  | { type: "rule"; transactionId: string; confidence: string; metadata: MatchMetadata }
  | {
      type: "split";
      transactions: Array<{ id: string; amount: string }>;
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

const EXACT_DATE_WINDOW_DAYS = 7;
const FUZZY_DATE_WINDOW_DAYS = 14;
const FUZZY_AMOUNT_TOLERANCE = 0.01; // 1%
const MAX_SPLIT_TRANSACTIONS = 3;

// ---------------------------------------------------------------------------
// Direction validation
// ---------------------------------------------------------------------------

/**
 * Filter candidates to only those matching the expected direction:
 * - expense documents match debit transactions
 * - income documents match credit transactions
 */
function filterByDirection(
  candidates: MatchCandidateRow[],
  direction: "expense" | "income"
): MatchCandidateRow[] {
  const expectedType = direction === "expense" ? "debit" : "credit";
  return candidates.filter((c) => c.type === expectedType);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Find the best match for a document payment against bank transactions.
 *
 * Priority cascade:
 *   Layer 0: Reference match — doc number, tax ID, vendor name in transaction text
 *   Layer 1: Alias match — learned counterparty → vendor mappings
 *   Layer 2: Exact match — amount exact + date window (deterministic, highest trust)
 *   Layer 3: Rule match — user-defined reconciliation rules
 *   Layer 4: Multi-signal match — weighted scoring across all signals
 *   Split match — 2-3 transactions summing to payment amount
 *
 * If multiple exact matches exist, returns ambiguous instead of auto-matching.
 * Direction validation applied across all layers.
 */
export async function findMatches(ctx: MatchContext): Promise<MatchResult> {
  // Guard: zero-amount documents can't be meaningfully matched
  if (parseFloat(ctx.netAmountPaid) === 0) return { type: "none" };

  // Layer 0: Reference match (document number, tax ID, vendor name in txn text)
  const referenceResult = await tryReferenceMatch(ctx);
  if (referenceResult) return referenceResult;

  // Layer 1: Alias match (learned counterparty → vendor mappings)
  const aliasResult = await tryAliasMatch(ctx);
  if (aliasResult) return aliasResult;

  // Layer 2: Exact match (amount exact + date window — deterministic, highest trust)
  const exactResult = await tryExactMatch(ctx);
  if (exactResult) return exactResult;

  // Layer 3: Rule match (user-defined reconciliation rules)
  const ruleResult = await tryRuleMatch(ctx);
  if (ruleResult) return ruleResult;

  // Layer 4: Multi-signal match (weighted scoring across all signals)
  const multiSignalResult = await tryMultiSignalMatch(ctx);
  if (multiSignalResult) return multiSignalResult;

  // Split match
  const splitResult = await trySplitMatch(ctx);
  if (splitResult) return splitResult;

  return { type: "none" };
}

// ---------------------------------------------------------------------------
// Layer 0: Reference match — document number / tax ID / vendor name in txn text
// ---------------------------------------------------------------------------

async function tryReferenceMatch(ctx: MatchContext): Promise<MatchResult | null> {
  const { orgId, netAmountPaid, paymentDate, direction } = ctx;

  // Wider date window for reference matches (the reference itself is strong signal)
  const candidates = await findMatchCandidates(orgId, null, netAmountPaid, paymentDate, {
    amountTolerance: 0.05, // 5% tolerance — reference text is the primary signal
    dateDays: FUZZY_DATE_WINDOW_DAYS,
  });

  const directionFiltered = filterByDirection(candidates, direction);
  if (directionFiltered.length === 0) return null;

  const parsedAmount = parseFloat(netAmountPaid);

  for (let i = 0; i < directionFiltered.length; i++) {
    const candidate = directionFiltered[i];
    const searchableText = [candidate.description, candidate.counterparty]
      .filter(Boolean)
      .join(" ");

    if (!searchableText) continue;

    const signals: Record<string, { score: number; detail: string }> = {};
    let referenceFound = false;

    // 1. Document number search
    if (ctx.documentNumber) {
      const escapedDocNum = escapeRegex(ctx.documentNumber);
      const docNumRegex = new RegExp(`\\b${escapedDocNum}\\b`, "i");
      if (docNumRegex.test(searchableText)) {
        signals.referenceFound = { score: 1.0, detail: `${ctx.documentNumber} in transaction text` };
        referenceFound = true;
      }
    }

    // 2. Tax ID search (13-digit Thai tax ID)
    if (!referenceFound && ctx.vendorTaxId) {
      if (searchableText.includes(ctx.vendorTaxId)) {
        signals.referenceFound = { score: 1.0, detail: `Tax ID ${ctx.vendorTaxId} in transaction text` };
        referenceFound = true;
      }
    }

    // 3. Vendor name substring match (normalized)
    if (!referenceFound && (ctx.vendorName || ctx.vendorNameTh)) {
      const normalizedCounterparty = normalizeCounterparty(searchableText);
      const names = [ctx.vendorName, ctx.vendorNameTh].filter(Boolean) as string[];

      for (const name of names) {
        const normalizedName = normalizeCompanyName(name);
        if (normalizedName.length < 3) continue;
        // Bidirectional: check if either contains the other
        const nameInCounterparty = normalizedCounterparty.includes(normalizedName);
        const counterpartyInName = normalizedName.includes(normalizedCounterparty);
        if (normalizedCounterparty.length >= 3 && (nameInCounterparty || counterpartyInName)) {
          signals.referenceFound = { score: 0.8, detail: `Vendor name "${name}" in transaction text` };
          referenceFound = true;
          break;
        }
      }
    }

    if (!referenceFound) continue;

    // Score amount match
    const candidateAmount = parseFloat(candidate.amount);
    const amountDiffPct = Math.abs(candidateAmount - parsedAmount) / parsedAmount;

    if (amountDiffPct === 0) {
      signals.amountMatch = { score: 1.0, detail: "exact" };
    } else if (amountDiffPct <= 0.05) {
      signals.amountMatch = { score: 0.85, detail: `${(amountDiffPct * 100).toFixed(1)}% difference` };
    }

    // Compute confidence
    const refScore = signals.referenceFound?.score ?? 0;
    const amtScore = signals.amountMatch?.score ?? 0;
    const confidence = amtScore === 1.0 ? 1.0 : Math.min(refScore * 0.6 + amtScore * 0.4, 0.99);

    // Date proximity signal
    const dateDiffDays = Math.abs(
      (new Date(candidate.date).getTime() - new Date(paymentDate).getTime()) /
        (1000 * 60 * 60 * 24)
    );
    signals.dateProximity = {
      score: Math.max(0, 1 - dateDiffDays / FUZZY_DATE_WINDOW_DAYS),
      detail: `${Math.round(dateDiffDays)} days`,
    };

    signals.directionMatch = { score: 1.0, detail: `${direction} ↔ ${candidate.type}` };

    return {
      type: "reference",
      transactionId: candidate.id,
      confidence: confidence.toFixed(2),
      metadata: {
        layer: "reference",
        signals,
        candidateCount: directionFiltered.length,
        selectedRank: i + 1,
      },
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Layer 1: Alias match — learned counterparty → vendor mappings
// ---------------------------------------------------------------------------

async function tryAliasMatch(ctx: MatchContext): Promise<MatchResult | null> {
  const { orgId, netAmountPaid, paymentDate, direction, vendorId } = ctx;

  if (!vendorId) return null;

  // Get candidates with wider tolerance (alias is the primary signal)
  const candidates = await findMatchCandidates(orgId, null, netAmountPaid, paymentDate, {
    amountTolerance: FUZZY_AMOUNT_TOLERANCE,
    dateDays: FUZZY_DATE_WINDOW_DAYS,
  });

  const directionFiltered = filterByDirection(candidates, direction);
  if (directionFiltered.length === 0) return null;

  const parsedAmount = parseFloat(netAmountPaid);

  for (let i = 0; i < directionFiltered.length; i++) {
    const candidate = directionFiltered[i];
    if (!candidate.counterparty) continue;

    // Look up if this counterparty text is a confirmed alias
    const alias = await findAliasByText(orgId, candidate.counterparty);
    if (!alias || alias.vendorId !== vendorId) continue;

    // Alias found and matches document's vendor
    const candidateAmount = parseFloat(candidate.amount);
    const amountDiffPct = Math.abs(candidateAmount - parsedAmount) / parsedAmount;
    const isExactAmount = amountDiffPct === 0;

    const dateDiffDays = Math.abs(
      (new Date(candidate.date).getTime() - new Date(paymentDate).getTime()) /
        (1000 * 60 * 60 * 24)
    );

    const confidence = isExactAmount
      ? 1.0
      : Math.min(0.99, computeFuzzyConfidence(parsedAmount, candidateAmount, paymentDate, candidate.date) + 0.20);

    return {
      type: "pattern",
      transactionId: candidate.id,
      confidence: confidence.toFixed(2),
      metadata: {
        layer: "alias",
        signals: {
          aliasMatch: { score: 1.0, detail: `Confirmed alias "${candidate.counterparty}" → vendor` },
          amountMatch: {
            score: isExactAmount ? 1.0 : Math.max(0, 1 - amountDiffPct * 5),
            detail: isExactAmount ? "exact" : `${(amountDiffPct * 100).toFixed(2)}% difference`,
          },
          dateProximity: {
            score: Math.max(0, 1 - dateDiffDays / FUZZY_DATE_WINDOW_DAYS),
            detail: `${Math.round(dateDiffDays)} days`,
          },
          directionMatch: { score: 1.0, detail: `${direction} ↔ ${candidate.type}` },
        },
        candidateCount: directionFiltered.length,
        selectedRank: i + 1,
      },
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Layer 3: Rule match — user-defined reconciliation rules
// ---------------------------------------------------------------------------

async function tryRuleMatch(ctx: MatchContext): Promise<MatchResult | null> {
  const { orgId, netAmountPaid, paymentDate, direction } = ctx;

  // Load active rules first — bail early if none (avoids unnecessary DB query)
  const rules = await getActiveRules(orgId);
  if (rules.length === 0) return null;

  // Get candidates within fuzzy window
  const candidates = await findMatchCandidates(orgId, null, netAmountPaid, paymentDate, {
    amountTolerance: FUZZY_AMOUNT_TOLERANCE,
    dateDays: FUZZY_DATE_WINDOW_DAYS,
  });

  const directionFiltered = filterByDirection(candidates, direction);
  if (directionFiltered.length === 0) return null;

  // Evaluate rules against each candidate
  for (let i = 0; i < directionFiltered.length; i++) {
    const candidate = directionFiltered[i];
    const txnContext: TransactionContext = {
      id: candidate.id,
      amount: candidate.amount,
      date: candidate.date,
      description: candidate.description,
      counterparty: candidate.counterparty,
      referenceNo: candidate.referenceNo,
      channel: candidate.channel,
      type: candidate.type,
      bankAccountId: candidate.bankAccountId,
    };

    const ruleMatch = evaluateRules(
      rules.map((r) => ({
        id: r.id,
        name: r.name,
        priority: r.priority,
        conditions: r.conditions as import("@/lib/db/queries/reconciliation-rules").RuleCondition[],
        actions: r.actions as import("@/lib/db/queries/reconciliation-rules").RuleAction[],
      })),
      txnContext
    );

    if (!ruleMatch) continue;

    // Check if the rule's actions include auto_match
    const autoMatchAction = ruleMatch.actions.find((a) => a.type === "auto_match");
    if (!autoMatchAction) continue;

    // Increment rule match counter
    await incrementRuleMatchCount(orgId, ruleMatch.ruleId);

    return {
      type: "rule",
      transactionId: candidate.id,
      confidence: "0.95",
      metadata: {
        layer: "rule",
        signals: {
          ruleMatch: { score: 1.0, detail: `Rule "${ruleMatch.ruleName}" matched` },
          amountMatch: {
            score: parseFloat(candidate.amount) === parseFloat(netAmountPaid) ? 1.0 : 0.9,
            detail: parseFloat(candidate.amount) === parseFloat(netAmountPaid) ? "exact" : "within tolerance",
          },
          directionMatch: { score: 1.0, detail: `${direction} ↔ ${candidate.type}` },
        },
        candidateCount: directionFiltered.length,
        selectedRank: i + 1,
      },
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Exact match: amount matches exactly, date within +/-7 days
// ---------------------------------------------------------------------------

async function tryExactMatch(ctx: MatchContext): Promise<MatchResult | null> {
  const { orgId, netAmountPaid, paymentDate, direction } = ctx;

  const candidates = await findMatchCandidates(orgId, null, netAmountPaid, paymentDate, {
    amountTolerance: 0,
    dateDays: EXACT_DATE_WINDOW_DAYS,
  });

  const directionFiltered = filterByDirection(candidates, direction);

  // Filter to truly exact matches
  const exactMatches = directionFiltered.filter(
    (c) => parseFloat(c.amount) === parseFloat(netAmountPaid)
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

  const match = exactMatches[0];
  const dateDiffDays = Math.abs(
    (new Date(match.date).getTime() - new Date(paymentDate).getTime()) /
      (1000 * 60 * 60 * 24)
  );

  return {
    type: "exact",
    transactionId: match.id,
    confidence: "1.00",
    metadata: {
      layer: "exact",
      signals: {
        amountMatch: { score: 1.0, detail: "exact" },
        dateProximity: {
          score: Math.max(0, 1 - dateDiffDays / EXACT_DATE_WINDOW_DAYS),
          detail: `${Math.round(dateDiffDays)} days`,
        },
        directionMatch: { score: 1.0, detail: `${direction} ↔ ${match.type}` },
      },
      candidateCount: directionFiltered.length,
      selectedRank: 1,
    },
  };
}

// ---------------------------------------------------------------------------
// Multi-signal scoring (replaces old fuzzy match)
// ---------------------------------------------------------------------------

/** Signal weights for multi-signal scoring */
const SIGNAL_WEIGHTS = {
  amount: 0.35,
  date: 0.15,
  counterpartyVendor: 0.25,
  direction: 0.10,
  bankAffinity: 0.10,
  channel: 0.05,
} as const;

const MULTI_SIGNAL_AUTO_THRESHOLD = 0.85;
const MULTI_SIGNAL_SUGGEST_THRESHOLD = 0.60;

/**
 * Compute weighted multi-signal score for a candidate.
 */
function computeMultiSignalScore(
  candidate: MatchCandidateRow,
  ctx: MatchContext
): { score: number; signals: Record<string, { score: number; detail: string }> } {
  const parsedAmount = parseFloat(ctx.netAmountPaid);
  const candidateAmount = parseFloat(candidate.amount);

  const signals: Record<string, { score: number; detail: string }> = {};

  // 1. Amount proximity (weight: 0.35)
  const amountDiffPct = Math.abs(candidateAmount - parsedAmount) / parsedAmount;
  const amountScore = Math.max(0, 1 - amountDiffPct * 10); // 10% diff → 0 score
  signals.amountMatch = {
    score: amountScore,
    detail: amountDiffPct === 0 ? "exact" : `${(amountDiffPct * 100).toFixed(2)}% difference`,
  };

  // 2. Date proximity (weight: 0.15)
  const dateDiffDays = Math.abs(
    (new Date(candidate.date).getTime() - new Date(ctx.paymentDate).getTime()) /
      (1000 * 60 * 60 * 24)
  );
  const dateScore = Math.max(0, 1 - dateDiffDays / FUZZY_DATE_WINDOW_DAYS);
  signals.dateProximity = {
    score: dateScore,
    detail: `${Math.round(dateDiffDays)} days`,
  };

  // 3. Counterparty ↔ vendor name (weight: 0.25)
  let counterpartyScore = 0;
  let counterpartyDetail = "no vendor signal";
  if (candidate.counterparty && (ctx.vendorName || ctx.vendorNameTh)) {
    const normalizedCounterparty = normalizeCounterparty(candidate.counterparty);
    const names = [ctx.vendorName, ctx.vendorNameTh].filter(Boolean) as string[];

    let bestOverlap = 0;
    for (const name of names) {
      const normalizedName = normalizeCompanyName(name);
      const overlap = tokenOverlap(normalizedCounterparty, normalizedName);
      if (overlap > bestOverlap) bestOverlap = overlap;
    }

    counterpartyScore = bestOverlap;
    counterpartyDetail = bestOverlap > 0
      ? `${(bestOverlap * 100).toFixed(0)}% token overlap`
      : "no overlap";
  }
  signals.counterpartyMatch = { score: counterpartyScore, detail: counterpartyDetail };

  // 4. Direction validation (weight: 0.10)
  const expectedType = ctx.direction === "expense" ? "debit" : "credit";
  const directionScore = candidate.type === expectedType ? 1.0 : 0.0;
  signals.directionMatch = {
    score: directionScore,
    detail: `${ctx.direction} ↔ ${candidate.type}`,
  };

  // 5. Bank account affinity (weight: 0.10)
  let bankScore = 0.5; // neutral default
  if (ctx.bankAccountId && candidate.bankAccountId === ctx.bankAccountId) {
    bankScore = 1.0;
  }
  signals.bankAffinity = {
    score: bankScore,
    detail: ctx.bankAccountId && candidate.bankAccountId === ctx.bankAccountId
      ? "same bank account"
      : "no bank preference",
  };

  // 6. Channel consistency (weight: 0.05)
  const channelScore = 0.0; // no data yet — contributes nothing until payment method matching is built
  signals.channelMatch = { score: channelScore, detail: "not available" };

  // Weighted sum
  const totalScore =
    amountScore * SIGNAL_WEIGHTS.amount +
    dateScore * SIGNAL_WEIGHTS.date +
    counterpartyScore * SIGNAL_WEIGHTS.counterpartyVendor +
    directionScore * SIGNAL_WEIGHTS.direction +
    bankScore * SIGNAL_WEIGHTS.bankAffinity +
    channelScore * SIGNAL_WEIGHTS.channel;

  return { score: totalScore, signals };
}

async function tryMultiSignalMatch(ctx: MatchContext): Promise<MatchResult | null> {
  const { orgId, netAmountPaid, paymentDate, direction } = ctx;

  const candidates = await findMatchCandidates(orgId, null, netAmountPaid, paymentDate, {
    amountTolerance: FUZZY_AMOUNT_TOLERANCE,
    dateDays: FUZZY_DATE_WINDOW_DAYS,
  });

  const directionFiltered = filterByDirection(candidates, direction);

  // Exclude exact matches (already tried in tryExactMatch)
  const parsedAmount = parseFloat(netAmountPaid);
  const nonExact = directionFiltered.filter(
    (c) => parseFloat(c.amount) !== parsedAmount
  );

  if (nonExact.length === 0) return null;

  // Score each candidate using multi-signal scoring
  const scored = nonExact
    .map((c) => {
      const { score, signals } = computeMultiSignalScore(c, ctx);
      return { ...c, score, signals };
    })
    .sort((a, b) => b.score - a.score);

  const best = scored[0];

  if (best.score < MULTI_SIGNAL_SUGGEST_THRESHOLD) return null;

  const matchType = best.score >= MULTI_SIGNAL_AUTO_THRESHOLD ? "multi_signal" : "fuzzy";

  return {
    type: matchType as "multi_signal" | "fuzzy",
    transactionId: best.id,
    confidence: best.score.toFixed(2),
    metadata: {
      layer: "multi_signal",
      signals: best.signals,
      candidateCount: nonExact.length,
      selectedRank: 1,
    },
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

async function trySplitMatch(ctx: MatchContext): Promise<MatchResult | null> {
  const { orgId, netAmountPaid, paymentDate, direction } = ctx;

  // Get all unmatched transactions within the date window first (performance guard)
  const candidates = await findMatchCandidates(orgId, null, netAmountPaid, paymentDate, {
    // Use a wide tolerance to get all transactions that could contribute to a split
    amountTolerance: 1.0, // up to 100% of the amount (individual parts can be smaller)
    dateDays: FUZZY_DATE_WINDOW_DAYS,
  });

  const directionFiltered = filterByDirection(candidates, direction);

  // Only consider transactions smaller than the target
  const targetAmount = parseFloat(netAmountPaid);
  const smaller = directionFiltered.filter(
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
      metadata: {
        layer: "split",
        signals: {
          amountMatch: { score: 1.0, detail: "exact sum of 2 transactions" },
          directionMatch: { score: 1.0, detail: `${direction} ↔ all ${direction === "expense" ? "debit" : "credit"}` },
        },
        candidateCount: smaller.length,
        selectedRank: 1,
      },
    };
  }

  const threeMatch = findSumCombination(smaller, targetAmount, 3);
  if (threeMatch) {
    return {
      type: "split",
      transactions: threeMatch.map((t) => ({ id: t.id, amount: t.amount })),
      confidence: "0.70",
      metadata: {
        layer: "split",
        signals: {
          amountMatch: { score: 0.9, detail: "exact sum of 3 transactions" },
          directionMatch: { score: 1.0, detail: `${direction} ↔ all ${direction === "expense" ? "debit" : "credit"}` },
        },
        candidateCount: smaller.length,
        selectedRank: 1,
      },
    };
  }

  return null;
}

/**
 * Find a combination of exactly `count` candidates whose amounts sum to `target`.
 * Uses tolerance of 0.01 (1 satang) for floating point comparison.
 */
function findSumCombination(
  candidates: MatchCandidateRow[],
  target: number,
  count: number
): MatchCandidateRow[] | null {
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
// Helpers
// ---------------------------------------------------------------------------

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ---------------------------------------------------------------------------
// Exported for testing
// ---------------------------------------------------------------------------

export {
  computeFuzzyConfidence,
  computeMultiSignalScore,
  findSumCombination,
  tryExactMatch,
  tryMultiSignalMatch,
  trySplitMatch,
  tryReferenceMatch,
  tryAliasMatch,
  tryRuleMatch,
  filterByDirection,
  escapeRegex,
  SIGNAL_WEIGHTS,
  MULTI_SIGNAL_AUTO_THRESHOLD,
  MULTI_SIGNAL_SUGGEST_THRESHOLD,
  MAX_SPLIT_TRANSACTIONS,
  EXACT_DATE_WINDOW_DAYS,
  FUZZY_DATE_WINDOW_DAYS,
  FUZZY_AMOUNT_TOLERANCE,
};
