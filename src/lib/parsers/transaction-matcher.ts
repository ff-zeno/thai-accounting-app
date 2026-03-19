/**
 * Knockout deduplication for bank transactions.
 *
 * When a user re-uploads a statement whose period overlaps with existing data,
 * we need to identify which incoming transactions are genuinely new vs. already
 * imported. This module does one-to-one elimination matching.
 */

export interface MatchableTransaction {
  date: string;
  amount: string;
  type: "debit" | "credit";
  description?: string | null;
  channel?: string | null;
}

export interface KnockoutResult<E, I> {
  /** Pairs of (existing, incoming) that matched 1:1 */
  matched: Array<{ existing: E; incoming: I }>;
  /** Incoming transactions with no existing match — genuinely new */
  newOnly: I[];
  /** Existing transactions with no incoming match */
  existingOnly: E[];
}

/**
 * Build a fingerprint key for grouping potential matches.
 * We match on (date, type, amount) as the primary key.
 */
function fingerprint(txn: MatchableTransaction): string {
  return `${txn.date}|${txn.type}|${txn.amount}`;
}

/**
 * Score how similar two transactions are beyond the primary key.
 * Higher = better match. Used to break ties when multiple transactions
 * share the same (date, type, amount).
 */
function similarityScore(a: MatchableTransaction, b: MatchableTransaction): number {
  let score = 0;

  // Description match (strongest signal after primary key)
  if (a.description && b.description) {
    const descA = a.description.toLowerCase().trim();
    const descB = b.description.toLowerCase().trim();
    if (descA === descB) score += 3;
    else if (descA.includes(descB) || descB.includes(descA)) score += 1;
  }

  // Channel match
  if (a.channel && b.channel) {
    if (a.channel.toLowerCase() === b.channel.toLowerCase()) score += 1;
  }

  return score;
}

/**
 * Knockout matching: for each (date, type, amount) group, match existing
 * and incoming transactions 1:1 using best similarity, then return
 * unmatched on each side.
 */
export function knockoutMatch<
  E extends MatchableTransaction,
  I extends MatchableTransaction,
>(existing: E[], incoming: I[]): KnockoutResult<E, I> {
  const matched: Array<{ existing: E; incoming: I }> = [];

  // Group by fingerprint
  const existingByKey = new Map<string, E[]>();
  for (const txn of existing) {
    const key = fingerprint(txn);
    const arr = existingByKey.get(key);
    if (arr) arr.push(txn);
    else existingByKey.set(key, [txn]);
  }

  const unmatchedIncoming: I[] = [];
  const matchedExistingSet = new Set<E>();

  for (const inc of incoming) {
    const key = fingerprint(inc);
    const candidates = existingByKey.get(key);

    if (!candidates || candidates.length === 0) {
      unmatchedIncoming.push(inc);
      continue;
    }

    // Find best unmatched candidate by similarity
    let bestIdx = -1;
    let bestScore = -1;
    for (let i = 0; i < candidates.length; i++) {
      if (matchedExistingSet.has(candidates[i])) continue;
      const score = similarityScore(inc, candidates[i]);
      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }

    if (bestIdx >= 0) {
      const matchedExisting = candidates[bestIdx];
      matched.push({ existing: matchedExisting, incoming: inc });
      matchedExistingSet.add(matchedExisting);
    } else {
      unmatchedIncoming.push(inc);
    }
  }

  // Existing transactions that weren't matched
  const existingOnly = existing.filter((e) => !matchedExistingSet.has(e));

  return { matched, newOnly: unmatchedIncoming, existingOnly };
}
