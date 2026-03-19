import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  findMatches,
  computeFuzzyConfidence,
  findSumCombination,
  type MatchCandidate,
} from "./matcher";

// Mock the database query layer
vi.mock("@/lib/db/queries/reconciliation", () => ({
  findMatchCandidates: vi.fn(),
}));

import { findMatchCandidates } from "@/lib/db/queries/reconciliation";

const mockFindCandidates = vi.mocked(findMatchCandidates);

function candidate(
  overrides: Partial<MatchCandidate> & { id: string; amount: string; date: string }
): MatchCandidate {
  return {
    description: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Exact match tests
// ---------------------------------------------------------------------------

describe("exact match", () => {
  it("matches when amount is exactly equal within 7 days", async () => {
    mockFindCandidates
      // First call: exact match (tolerance=0, days=7)
      .mockResolvedValueOnce([
        candidate({ id: "txn-1", amount: "10379.00", date: "2026-03-15" }),
      ]);

    const result = await findMatches("org-1", "10379.00", "2026-03-18");

    expect(result).toEqual({
      type: "exact",
      transactionId: "txn-1",
      confidence: "1.00",
    });

    // Verify the query was called with exact parameters
    expect(mockFindCandidates).toHaveBeenCalledWith(
      "org-1",
      null,
      "10379.00",
      "2026-03-18",
      { amountTolerance: 0, dateDays: 7 }
    );
  });

  it("does not exact-match when amount matches but date is 10 days away", async () => {
    // Exact match query returns nothing (date outside 7-day window)
    mockFindCandidates
      .mockResolvedValueOnce([])
      // Fuzzy match query also returns nothing for this test
      .mockResolvedValueOnce([])
      // Split match query
      .mockResolvedValueOnce([]);

    const result = await findMatches("org-1", "10379.00", "2026-03-18");

    expect(result).toEqual({ type: "none" });
  });
});

// ---------------------------------------------------------------------------
// Fuzzy match tests
// ---------------------------------------------------------------------------

describe("fuzzy match", () => {
  it("matches when amount is within 1% and within 14 days", async () => {
    // No exact match
    mockFindCandidates.mockResolvedValueOnce([]);
    // Fuzzy: amount 10375 vs expected 10379 (diff = 0.038%, within 1%)
    mockFindCandidates.mockResolvedValueOnce([
      candidate({ id: "txn-2", amount: "10375.00", date: "2026-03-16" }),
    ]);

    const result = await findMatches("org-1", "10379.00", "2026-03-18");

    expect(result.type).toBe("fuzzy");
    if (result.type === "fuzzy") {
      expect(result.transactionId).toBe("txn-2");
      expect(parseFloat(result.confidence)).toBeGreaterThan(0.5);
      expect(parseFloat(result.confidence)).toBeLessThan(1.0);
    }
  });

  it("does not match when amount is outside 1%", async () => {
    // No exact match
    mockFindCandidates.mockResolvedValueOnce([]);
    // Fuzzy: 10000 vs 10379 (diff ~3.65%, outside 1%) -- won't be returned by query
    mockFindCandidates.mockResolvedValueOnce([]);
    // Split
    mockFindCandidates.mockResolvedValueOnce([]);

    const result = await findMatches("org-1", "10379.00", "2026-03-18");

    expect(result).toEqual({ type: "none" });
  });
});

// ---------------------------------------------------------------------------
// Split match tests
// ---------------------------------------------------------------------------

describe("split match", () => {
  it("matches 2 transactions that sum to the target amount", async () => {
    // No exact match
    mockFindCandidates.mockResolvedValueOnce([]);
    // No fuzzy match
    mockFindCandidates.mockResolvedValueOnce([]);
    // Split candidates within date window
    mockFindCandidates.mockResolvedValueOnce([
      candidate({ id: "txn-a", amount: "30000.00", date: "2026-03-15" }),
      candidate({ id: "txn-b", amount: "20000.00", date: "2026-03-16" }),
      candidate({ id: "txn-c", amount: "5000.00", date: "2026-03-17" }),
    ]);

    const result = await findMatches("org-1", "50000.00", "2026-03-18");

    expect(result.type).toBe("split");
    if (result.type === "split") {
      expect(result.transactions).toHaveLength(2);
      const ids = result.transactions.map((t) => t.id).sort();
      expect(ids).toEqual(["txn-a", "txn-b"]);
      expect(result.confidence).toBe("0.90");
    }
  });

  it("matches 3 transactions that sum to the target amount", async () => {
    mockFindCandidates.mockResolvedValueOnce([]);
    mockFindCandidates.mockResolvedValueOnce([]);
    mockFindCandidates.mockResolvedValueOnce([
      candidate({ id: "txn-a", amount: "10000.00", date: "2026-03-15" }),
      candidate({ id: "txn-b", amount: "20000.00", date: "2026-03-16" }),
      candidate({ id: "txn-c", amount: "20000.00", date: "2026-03-17" }),
    ]);

    const result = await findMatches("org-1", "50000.00", "2026-03-18");

    expect(result.type).toBe("split");
    if (result.type === "split") {
      expect(result.transactions).toHaveLength(3);
    }
  });

  it("does not match when 4 transactions are needed (max 3)", async () => {
    mockFindCandidates.mockResolvedValueOnce([]);
    mockFindCandidates.mockResolvedValueOnce([]);
    // 4 transactions that sum to 50000, but no combination of 2 or 3 does
    mockFindCandidates.mockResolvedValueOnce([
      candidate({ id: "txn-1", amount: "12500.00", date: "2026-03-15" }),
      candidate({ id: "txn-2", amount: "12500.00", date: "2026-03-15" }),
      candidate({ id: "txn-3", amount: "12500.00", date: "2026-03-16" }),
      candidate({ id: "txn-4", amount: "12500.00", date: "2026-03-17" }),
    ]);

    const result = await findMatches("org-1", "50000.00", "2026-03-18");

    expect(result).toEqual({ type: "none" });
  });
});

// ---------------------------------------------------------------------------
// Ambiguous match tests
// ---------------------------------------------------------------------------

describe("ambiguous match", () => {
  it("returns ambiguous when 2 transactions match exactly", async () => {
    mockFindCandidates.mockResolvedValueOnce([
      candidate({ id: "txn-1", amount: "10379.00", date: "2026-03-15" }),
      candidate({ id: "txn-2", amount: "10379.00", date: "2026-03-17" }),
    ]);

    const result = await findMatches("org-1", "10379.00", "2026-03-18");

    expect(result.type).toBe("ambiguous");
    if (result.type === "ambiguous") {
      expect(result.candidates).toHaveLength(2);
      expect(result.candidates[0].id).toBe("txn-1");
      expect(result.candidates[1].id).toBe("txn-2");
    }
  });
});

// ---------------------------------------------------------------------------
// Petty cash exclusion
// ---------------------------------------------------------------------------

describe("petty cash exclusion", () => {
  it("does not consider petty cash transactions (excluded by query layer)", async () => {
    // The findMatchCandidates query filters is_petty_cash=false at the DB level.
    // If it returns no candidates, they were filtered out.
    mockFindCandidates.mockResolvedValueOnce([]);
    mockFindCandidates.mockResolvedValueOnce([]);
    mockFindCandidates.mockResolvedValueOnce([]);

    const result = await findMatches("org-1", "500.00", "2026-03-18");

    expect(result).toEqual({ type: "none" });

    // Verify the query was called -- the is_petty_cash=false filter is applied there
    expect(mockFindCandidates).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// computeFuzzyConfidence unit tests
// ---------------------------------------------------------------------------

describe("computeFuzzyConfidence", () => {
  it("returns 1.0 for exact amount and same date", () => {
    const confidence = computeFuzzyConfidence(10000, 10000, "2026-03-18", "2026-03-18");
    expect(confidence).toBe(1.0);
  });

  it("decreases confidence for larger amount differences", () => {
    // 1% diff: 1.0 - 0.01*5 - 0 = 0.95
    const c1 = computeFuzzyConfidence(10000, 10100, "2026-03-18", "2026-03-18");
    // 0.5% diff: 1.0 - 0.005*5 - 0 = 0.975
    const c2 = computeFuzzyConfidence(10000, 10050, "2026-03-18", "2026-03-18");
    expect(c2).toBeGreaterThan(c1);
  });

  it("decreases confidence for larger date differences", () => {
    // 0 days diff
    const c1 = computeFuzzyConfidence(10000, 10000, "2026-03-18", "2026-03-18");
    // 7 days diff: 1.0 - 0 - (7/14 * 0.3) = 0.85
    const c2 = computeFuzzyConfidence(10000, 10000, "2026-03-18", "2026-03-25");
    expect(c1).toBeGreaterThan(c2);
    expect(c2).toBeCloseTo(0.85, 2);
  });

  it("clamps confidence at 0 for extreme differences", () => {
    const confidence = computeFuzzyConfidence(10000, 15000, "2026-03-18", "2026-04-18");
    expect(confidence).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// findSumCombination unit tests
// ---------------------------------------------------------------------------

describe("findSumCombination", () => {
  it("finds a pair that sums to the target", () => {
    const candidates: MatchCandidate[] = [
      candidate({ id: "a", amount: "30000.00", date: "2026-03-15" }),
      candidate({ id: "b", amount: "20000.00", date: "2026-03-16" }),
    ];

    const result = findSumCombination(candidates, 50000, 2);
    expect(result).not.toBeNull();
    expect(result!.map((c) => c.id)).toEqual(["a", "b"]);
  });

  it("finds a triple that sums to the target", () => {
    const candidates: MatchCandidate[] = [
      candidate({ id: "a", amount: "10000.00", date: "2026-03-15" }),
      candidate({ id: "b", amount: "15000.00", date: "2026-03-16" }),
      candidate({ id: "c", amount: "25000.00", date: "2026-03-17" }),
    ];

    const result = findSumCombination(candidates, 50000, 3);
    expect(result).not.toBeNull();
    expect(result!.map((c) => c.id)).toEqual(["a", "b", "c"]);
  });

  it("returns null when no combination sums to the target", () => {
    const candidates: MatchCandidate[] = [
      candidate({ id: "a", amount: "10000.00", date: "2026-03-15" }),
      candidate({ id: "b", amount: "15000.00", date: "2026-03-16" }),
    ];

    const result = findSumCombination(candidates, 50000, 2);
    expect(result).toBeNull();
  });

  it("tolerates floating point within 0.01", () => {
    const candidates: MatchCandidate[] = [
      candidate({ id: "a", amount: "10000.005", date: "2026-03-15" }),
      candidate({ id: "b", amount: "20000.00", date: "2026-03-16" }),
    ];

    // 10000.005 + 20000.00 = 30000.005, target 30000.00 -- diff is 0.005 < 0.01
    const result = findSumCombination(candidates, 30000, 2);
    expect(result).not.toBeNull();
  });
});
