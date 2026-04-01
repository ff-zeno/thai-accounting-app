import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  findMatches,
  computeFuzzyConfidence,
  findSumCombination,
  filterByDirection,
  escapeRegex,
  type MatchContext,
} from "./matcher";
import type { MatchCandidateRow } from "@/lib/db/queries/reconciliation";

// Mock the database query layer
vi.mock("@/lib/db/queries/reconciliation", () => ({
  findMatchCandidates: vi.fn(),
}));

vi.mock("@/lib/db/queries/vendor-aliases", () => ({
  findAliasByText: vi.fn(),
}));

vi.mock("@/lib/db/queries/reconciliation-rules", () => ({
  getActiveRules: vi.fn().mockResolvedValue([]),
  incrementRuleMatchCount: vi.fn(),
}));

import { findMatchCandidates } from "@/lib/db/queries/reconciliation";
import { findAliasByText } from "@/lib/db/queries/vendor-aliases";

const mockFindCandidates = vi.mocked(findMatchCandidates);
const mockFindAlias = vi.mocked(findAliasByText);

function candidate(
  overrides: Partial<MatchCandidateRow> & { id: string; amount: string; date: string }
): MatchCandidateRow {
  return {
    description: null,
    counterparty: null,
    referenceNo: null,
    channel: null,
    type: "debit",
    bankAccountId: "bank-1",
    ...overrides,
  };
}

/** Helper to build a MatchContext with sensible defaults */
function ctx(overrides?: Partial<MatchContext>): MatchContext {
  return {
    orgId: "org-1",
    netAmountPaid: "10379.00",
    paymentDate: "2026-03-18",
    documentId: "doc-1",
    vendorId: null,
    vendorName: null,
    vendorNameTh: null,
    vendorTaxId: null,
    documentNumber: null,
    direction: "expense",
    bankAccountId: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Reference match tests (Layer 0)
// ---------------------------------------------------------------------------

describe("reference match", () => {
  it("matches when document number is found in transaction description", async () => {
    // Reference match query
    mockFindCandidates.mockResolvedValueOnce([
      candidate({
        id: "txn-ref",
        amount: "10379.00",
        date: "2026-03-15",
        description: "Payment for INV-2026-001",
        type: "debit",
      }),
    ]);

    const result = await findMatches(
      ctx({ documentNumber: "INV-2026-001" })
    );

    expect(result.type).toBe("reference");
    if (result.type === "reference") {
      expect(result.transactionId).toBe("txn-ref");
      expect(parseFloat(result.confidence)).toBe(1.0);
      expect(result.metadata.layer).toBe("reference");
      expect(result.metadata.signals.referenceFound.detail).toContain("INV-2026-001");
    }
  });

  it("matches when tax ID is found in counterparty", async () => {
    mockFindCandidates.mockResolvedValueOnce([
      candidate({
        id: "txn-tax",
        amount: "10379.00",
        date: "2026-03-15",
        counterparty: "0105564012345 บจก. ทดสอบ",
        type: "debit",
      }),
    ]);

    const result = await findMatches(
      ctx({ vendorTaxId: "0105564012345" })
    );

    expect(result.type).toBe("reference");
    if (result.type === "reference") {
      expect(result.transactionId).toBe("txn-tax");
      expect(result.metadata.signals.referenceFound.detail).toContain("Tax ID");
    }
  });

  it("matches when vendor name found in counterparty", async () => {
    mockFindCandidates.mockResolvedValueOnce([
      candidate({
        id: "txn-vendor",
        amount: "10379.00",
        date: "2026-03-15",
        counterparty: "บจก. ทดสอบ",
        type: "debit",
      }),
    ]);

    const result = await findMatches(
      ctx({ vendorNameTh: "ทดสอบ (ประเทศไทย) จำกัด" })
    );

    expect(result.type).toBe("reference");
    if (result.type === "reference") {
      expect(result.transactionId).toBe("txn-vendor");
      expect(result.metadata.signals.referenceFound.detail).toContain("Vendor name");
    }
  });

  it("returns lower confidence when reference found but amount differs", async () => {
    mockFindCandidates.mockResolvedValueOnce([
      candidate({
        id: "txn-ref",
        amount: "10500.00", // 1.2% different from 10379.00
        date: "2026-03-15",
        description: "Payment for INV-2026-001",
        type: "debit",
      }),
    ]);

    const result = await findMatches(
      ctx({ documentNumber: "INV-2026-001" })
    );

    expect(result.type).toBe("reference");
    if (result.type === "reference") {
      expect(parseFloat(result.confidence)).toBeLessThan(1.0);
      expect(parseFloat(result.confidence)).toBeGreaterThan(0.5);
    }
  });

  it("skips reference match when no identifiers provided", async () => {
    // Reference: candidate found but no identifiers to match → falls through
    mockFindCandidates.mockResolvedValueOnce([
      candidate({ id: "txn-1", amount: "10379.00", date: "2026-03-15", type: "debit" }),
    ]);
    // Exact: same candidate returned
    mockFindCandidates.mockResolvedValueOnce([
      candidate({ id: "txn-1", amount: "10379.00", date: "2026-03-15", type: "debit" }),
    ]);

    const result = await findMatches(ctx());

    // Should fall through to exact match, not reference
    expect(result.type).toBe("exact");
  });
});

// ---------------------------------------------------------------------------
// Direction validation tests
// ---------------------------------------------------------------------------

describe("direction validation", () => {
  it("expense document does NOT match credit transaction", async () => {
    // Reference: credit transaction won't match expense
    mockFindCandidates.mockResolvedValueOnce([
      candidate({ id: "txn-credit", amount: "10379.00", date: "2026-03-15", type: "credit" }),
    ]);
    // Exact: same credit transaction filtered out
    mockFindCandidates.mockResolvedValueOnce([
      candidate({ id: "txn-credit", amount: "10379.00", date: "2026-03-15", type: "credit" }),
    ]);
    // Fuzzy
    mockFindCandidates.mockResolvedValueOnce([]);
    // Split
    mockFindCandidates.mockResolvedValueOnce([]);

    const result = await findMatches(ctx({ direction: "expense" }));

    expect(result.type).toBe("none");
  });

  it("income document does NOT match debit transaction", async () => {
    // Reference: debit won't match income
    mockFindCandidates.mockResolvedValueOnce([
      candidate({ id: "txn-debit", amount: "10379.00", date: "2026-03-15", type: "debit" }),
    ]);
    // Exact
    mockFindCandidates.mockResolvedValueOnce([
      candidate({ id: "txn-debit", amount: "10379.00", date: "2026-03-15", type: "debit" }),
    ]);
    // Fuzzy
    mockFindCandidates.mockResolvedValueOnce([]);
    // Split
    mockFindCandidates.mockResolvedValueOnce([]);

    const result = await findMatches(ctx({ direction: "income" }));

    expect(result.type).toBe("none");
  });

  it("income document matches credit transaction", async () => {
    // Reference: falls through (no identifiers)
    mockFindCandidates.mockResolvedValueOnce([
      candidate({ id: "txn-credit", amount: "10379.00", date: "2026-03-15", type: "credit" }),
    ]);
    // Exact
    mockFindCandidates.mockResolvedValueOnce([
      candidate({ id: "txn-credit", amount: "10379.00", date: "2026-03-15", type: "credit" }),
    ]);

    const result = await findMatches(ctx({ direction: "income" }));

    expect(result.type).toBe("exact");
    if (result.type === "exact") {
      expect(result.transactionId).toBe("txn-credit");
    }
  });
});

// ---------------------------------------------------------------------------
// filterByDirection unit tests
// ---------------------------------------------------------------------------

describe("filterByDirection", () => {
  it("filters to debit for expense", () => {
    const candidates = [
      candidate({ id: "d1", amount: "100", date: "2026-01-01", type: "debit" }),
      candidate({ id: "c1", amount: "100", date: "2026-01-01", type: "credit" }),
    ];
    expect(filterByDirection(candidates, "expense")).toHaveLength(1);
    expect(filterByDirection(candidates, "expense")[0].id).toBe("d1");
  });

  it("filters to credit for income", () => {
    const candidates = [
      candidate({ id: "d1", amount: "100", date: "2026-01-01", type: "debit" }),
      candidate({ id: "c1", amount: "100", date: "2026-01-01", type: "credit" }),
    ];
    expect(filterByDirection(candidates, "income")).toHaveLength(1);
    expect(filterByDirection(candidates, "income")[0].id).toBe("c1");
  });
});

// ---------------------------------------------------------------------------
// Alias match tests (Layer 1)
// ---------------------------------------------------------------------------

describe("alias match", () => {
  it("matches when confirmed alias maps counterparty to document vendor", async () => {
    // Reference: no match (no identifiers)
    mockFindCandidates.mockResolvedValueOnce([]);
    // Alias: candidate with counterparty
    mockFindCandidates.mockResolvedValueOnce([
      candidate({
        id: "txn-alias",
        amount: "10379.00",
        date: "2026-03-15",
        counterparty: "X6898 Din Print",
        type: "debit",
      }),
    ]);
    mockFindAlias.mockResolvedValueOnce({
      vendorId: "vendor-1",
      matchCount: 3,
    });

    const result = await findMatches(
      ctx({ vendorId: "vendor-1" })
    );

    expect(result.type).toBe("pattern");
    if (result.type === "pattern") {
      expect(result.transactionId).toBe("txn-alias");
      expect(parseFloat(result.confidence)).toBe(1.0);
      expect(result.metadata.layer).toBe("alias");
      expect(result.metadata.signals.aliasMatch.score).toBe(1.0);
    }
  });

  it("does not match when alias vendor differs from document vendor", async () => {
    mockFindCandidates.mockResolvedValueOnce([]);
    // Alias: candidate found
    mockFindCandidates.mockResolvedValueOnce([
      candidate({
        id: "txn-alias",
        amount: "10379.00",
        date: "2026-03-15",
        counterparty: "X6898 Din Print",
        type: "debit",
      }),
    ]);
    // Alias maps to different vendor
    mockFindAlias.mockResolvedValueOnce({
      vendorId: "vendor-DIFFERENT",
      matchCount: 3,
    });
    // Falls through to exact
    mockFindCandidates.mockResolvedValueOnce([
      candidate({ id: "txn-alias", amount: "10379.00", date: "2026-03-15", type: "debit" }),
    ]);

    const result = await findMatches(
      ctx({ vendorId: "vendor-1" })
    );

    // Should fall through to exact match since alias vendor doesn't match
    expect(result.type).toBe("exact");
  });

  it("skips alias match when vendorId is null", async () => {
    // Reference: no match
    mockFindCandidates.mockResolvedValueOnce([
      candidate({ id: "txn-1", amount: "10379.00", date: "2026-03-15", type: "debit" }),
    ]);
    // Exact (alias skipped because vendorId is null)
    mockFindCandidates.mockResolvedValueOnce([
      candidate({ id: "txn-1", amount: "10379.00", date: "2026-03-15", type: "debit" }),
    ]);

    const result = await findMatches(ctx({ vendorId: null }));

    expect(result.type).toBe("exact");
    // findAliasByText should NOT have been called
    expect(mockFindAlias).not.toHaveBeenCalled();
  });

  it("does not match when no confirmed alias exists", async () => {
    mockFindCandidates.mockResolvedValueOnce([]);
    mockFindCandidates.mockResolvedValueOnce([
      candidate({
        id: "txn-1",
        amount: "10379.00",
        date: "2026-03-15",
        counterparty: "Unknown Corp",
        type: "debit",
      }),
    ]);
    mockFindAlias.mockResolvedValueOnce(null); // no alias found
    // Falls through to exact
    mockFindCandidates.mockResolvedValueOnce([
      candidate({ id: "txn-1", amount: "10379.00", date: "2026-03-15", type: "debit" }),
    ]);

    const result = await findMatches(ctx({ vendorId: "vendor-1" }));

    expect(result.type).toBe("exact");
  });
});

// ---------------------------------------------------------------------------
// Exact match tests (with direction)
// ---------------------------------------------------------------------------

describe("exact match", () => {
  it("matches when amount is exactly equal within 7 days", async () => {
    // Reference: falls through (no identifiers in ctx)
    mockFindCandidates.mockResolvedValueOnce([
      candidate({ id: "txn-1", amount: "10379.00", date: "2026-03-15", type: "debit" }),
    ]);
    // Exact: same candidate
    mockFindCandidates.mockResolvedValueOnce([
      candidate({ id: "txn-1", amount: "10379.00", date: "2026-03-15", type: "debit" }),
    ]);

    const result = await findMatches(ctx());

    expect(result.type).toBe("exact");
    if (result.type === "exact") {
      expect(result.transactionId).toBe("txn-1");
      expect(result.confidence).toBe("1.00");
      expect(result.metadata.layer).toBe("exact");
      expect(result.metadata.signals.amountMatch.score).toBe(1.0);
    }
  });

  it("does not exact-match when amount matches but date is 10 days away", async () => {
    // Reference: nothing
    mockFindCandidates.mockResolvedValueOnce([]);
    // Exact: nothing in 7-day window
    mockFindCandidates.mockResolvedValueOnce([]);
    // Fuzzy
    mockFindCandidates.mockResolvedValueOnce([]);
    // Split
    mockFindCandidates.mockResolvedValueOnce([]);

    const result = await findMatches(ctx());

    expect(result).toEqual({ type: "none" });
  });
});

// ---------------------------------------------------------------------------
// Fuzzy match tests
// ---------------------------------------------------------------------------

describe("multi-signal match (replaces fuzzy)", () => {
  it("matches when amount is within 1% and within 14 days", async () => {
    // Reference: no match
    mockFindCandidates.mockResolvedValueOnce([]);
    // Exact: no match (amount not exact)
    mockFindCandidates.mockResolvedValueOnce([]);
    // Multi-signal: amount 10375 vs expected 10379 (diff = 0.038%, within 1%)
    mockFindCandidates.mockResolvedValueOnce([
      candidate({ id: "txn-2", amount: "10375.00", date: "2026-03-16", type: "debit" }),
    ]);

    const result = await findMatches(ctx());

    // Multi-signal scoring: amount close + direction match → should match
    expect(result.type === "fuzzy" || result.type === "multi_signal").toBe(true);
    if (result.type === "fuzzy" || result.type === "multi_signal") {
      expect(result.transactionId).toBe("txn-2");
      expect(parseFloat(result.confidence)).toBeGreaterThan(0);
      expect(result.metadata.layer).toBe("multi_signal");
      expect(result.metadata.signals.amountMatch).toBeDefined();
      expect(result.metadata.signals.directionMatch).toBeDefined();
    }
  });

  it("does not match when no candidates returned", async () => {
    // Reference
    mockFindCandidates.mockResolvedValueOnce([]);
    // Exact
    mockFindCandidates.mockResolvedValueOnce([]);
    // Multi-signal
    mockFindCandidates.mockResolvedValueOnce([]);
    // Split
    mockFindCandidates.mockResolvedValueOnce([]);

    const result = await findMatches(ctx());

    expect(result).toEqual({ type: "none" });
  });

  it("scores higher when counterparty matches vendor name", async () => {
    mockFindCandidates.mockResolvedValueOnce([]);
    mockFindCandidates.mockResolvedValueOnce([]);
    // Two candidates with same amount diff: one has matching counterparty
    mockFindCandidates.mockResolvedValueOnce([
      candidate({
        id: "txn-match",
        amount: "10375.00",
        date: "2026-03-16",
        type: "debit",
        counterparty: "บจก. ทดสอบ เทรดดิ้ง",
      }),
      candidate({
        id: "txn-no-match",
        amount: "10375.00",
        date: "2026-03-16",
        type: "debit",
        counterparty: "Unknown Corp",
      }),
    ]);

    const result = await findMatches(
      ctx({ vendorNameTh: "บริษัท ทดสอบ เทรดดิ้ง จำกัด" })
    );

    // The candidate with matching counterparty should score higher
    if (result.type === "fuzzy" || result.type === "multi_signal") {
      expect(result.transactionId).toBe("txn-match");
    }
  });
});

// ---------------------------------------------------------------------------
// Split match tests
// ---------------------------------------------------------------------------

describe("split match", () => {
  it("matches 2 transactions that sum to the target amount", async () => {
    mockFindCandidates.mockResolvedValueOnce([]);
    mockFindCandidates.mockResolvedValueOnce([]);
    mockFindCandidates.mockResolvedValueOnce([]);
    // Split candidates
    mockFindCandidates.mockResolvedValueOnce([
      candidate({ id: "txn-a", amount: "30000.00", date: "2026-03-15", type: "debit" }),
      candidate({ id: "txn-b", amount: "20000.00", date: "2026-03-16", type: "debit" }),
      candidate({ id: "txn-c", amount: "5000.00", date: "2026-03-17", type: "debit" }),
    ]);

    const result = await findMatches(ctx({ netAmountPaid: "50000.00" }));

    expect(result.type).toBe("split");
    if (result.type === "split") {
      expect(result.transactions).toHaveLength(2);
      const ids = result.transactions.map((t) => t.id).sort();
      expect(ids).toEqual(["txn-a", "txn-b"]);
      expect(result.confidence).toBe("0.90");
      expect(result.metadata.layer).toBe("split");
    }
  });

  it("matches 3 transactions that sum to the target amount", async () => {
    mockFindCandidates.mockResolvedValueOnce([]);
    mockFindCandidates.mockResolvedValueOnce([]);
    mockFindCandidates.mockResolvedValueOnce([]);
    mockFindCandidates.mockResolvedValueOnce([
      candidate({ id: "txn-a", amount: "10000.00", date: "2026-03-15", type: "debit" }),
      candidate({ id: "txn-b", amount: "20000.00", date: "2026-03-16", type: "debit" }),
      candidate({ id: "txn-c", amount: "20000.00", date: "2026-03-17", type: "debit" }),
    ]);

    const result = await findMatches(ctx({ netAmountPaid: "50000.00" }));

    expect(result.type).toBe("split");
    if (result.type === "split") {
      expect(result.transactions).toHaveLength(3);
    }
  });

  it("does not match when 4 transactions are needed (max 3)", async () => {
    mockFindCandidates.mockResolvedValueOnce([]);
    mockFindCandidates.mockResolvedValueOnce([]);
    mockFindCandidates.mockResolvedValueOnce([]);
    // 4 transactions that sum to 50000, but no combination of 2 or 3 does
    mockFindCandidates.mockResolvedValueOnce([
      candidate({ id: "txn-1", amount: "12500.00", date: "2026-03-15", type: "debit" }),
      candidate({ id: "txn-2", amount: "12500.00", date: "2026-03-15", type: "debit" }),
      candidate({ id: "txn-3", amount: "12500.00", date: "2026-03-16", type: "debit" }),
      candidate({ id: "txn-4", amount: "12500.00", date: "2026-03-17", type: "debit" }),
    ]);

    const result = await findMatches(ctx({ netAmountPaid: "50000.00" }));

    expect(result).toEqual({ type: "none" });
  });

  it("split match filters by direction", async () => {
    mockFindCandidates.mockResolvedValueOnce([]);
    mockFindCandidates.mockResolvedValueOnce([]);
    mockFindCandidates.mockResolvedValueOnce([]);
    // Mix of debit and credit — only debit should match expense
    mockFindCandidates.mockResolvedValueOnce([
      candidate({ id: "txn-a", amount: "30000.00", date: "2026-03-15", type: "debit" }),
      candidate({ id: "txn-b", amount: "20000.00", date: "2026-03-16", type: "credit" }), // wrong direction
      candidate({ id: "txn-c", amount: "20000.00", date: "2026-03-17", type: "debit" }),
    ]);

    const result = await findMatches(ctx({ netAmountPaid: "50000.00" }));

    expect(result.type).toBe("split");
    if (result.type === "split") {
      // Should match txn-a (30k) + txn-c (20k), not txn-b (credit)
      const ids = result.transactions.map((t) => t.id).sort();
      expect(ids).toEqual(["txn-a", "txn-c"]);
    }
  });
});

// ---------------------------------------------------------------------------
// Ambiguous match tests
// ---------------------------------------------------------------------------

describe("ambiguous match", () => {
  it("returns ambiguous when 2 transactions match exactly", async () => {
    // Reference: falls through (no identifiers)
    mockFindCandidates.mockResolvedValueOnce([
      candidate({ id: "txn-1", amount: "10379.00", date: "2026-03-15", type: "debit" }),
      candidate({ id: "txn-2", amount: "10379.00", date: "2026-03-17", type: "debit" }),
    ]);
    // Exact: both returned → ambiguous
    mockFindCandidates.mockResolvedValueOnce([
      candidate({ id: "txn-1", amount: "10379.00", date: "2026-03-15", type: "debit" }),
      candidate({ id: "txn-2", amount: "10379.00", date: "2026-03-17", type: "debit" }),
    ]);

    const result = await findMatches(ctx());

    expect(result.type).toBe("ambiguous");
    if (result.type === "ambiguous") {
      expect(result.candidates).toHaveLength(2);
    }
  });
});

// ---------------------------------------------------------------------------
// Match metadata tests
// ---------------------------------------------------------------------------

describe("match metadata", () => {
  it("exact match has metadata with layer and signals", async () => {
    // Reference: falls through (no identifiers)
    mockFindCandidates.mockResolvedValueOnce([
      candidate({ id: "txn-1", amount: "10379.00", date: "2026-03-15", type: "debit" }),
    ]);
    // Exact
    mockFindCandidates.mockResolvedValueOnce([
      candidate({ id: "txn-1", amount: "10379.00", date: "2026-03-15", type: "debit" }),
    ]);

    const result = await findMatches(ctx());

    expect(result.type).toBe("exact");
    if (result.type === "exact") {
      expect(result.metadata).toBeDefined();
      expect(result.metadata.layer).toBe("exact");
      expect(result.metadata.signals.amountMatch).toBeDefined();
      expect(result.metadata.signals.dateProximity).toBeDefined();
      expect(result.metadata.signals.directionMatch).toBeDefined();
      expect(result.metadata.candidateCount).toBeGreaterThanOrEqual(1);
      expect(result.metadata.selectedRank).toBe(1);
    }
  });

  it("reference match metadata shows which signal fired", async () => {
    mockFindCandidates.mockResolvedValueOnce([
      candidate({
        id: "txn-1",
        amount: "10379.00",
        date: "2026-03-15",
        description: "INV-2026-001 payment",
        type: "debit",
      }),
    ]);

    const result = await findMatches(ctx({ documentNumber: "INV-2026-001" }));

    expect(result.type).toBe("reference");
    if (result.type === "reference") {
      expect(result.metadata.signals.referenceFound.score).toBe(1.0);
      expect(result.metadata.signals.amountMatch.score).toBe(1.0);
    }
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
    const candidates = [
      candidate({ id: "a", amount: "30000.00", date: "2026-03-15" }),
      candidate({ id: "b", amount: "20000.00", date: "2026-03-16" }),
    ];

    const result = findSumCombination(candidates, 50000, 2);
    expect(result).not.toBeNull();
    expect(result!.map((c) => c.id)).toEqual(["a", "b"]);
  });

  it("finds a triple that sums to the target", () => {
    const candidates = [
      candidate({ id: "a", amount: "10000.00", date: "2026-03-15" }),
      candidate({ id: "b", amount: "15000.00", date: "2026-03-16" }),
      candidate({ id: "c", amount: "25000.00", date: "2026-03-17" }),
    ];

    const result = findSumCombination(candidates, 50000, 3);
    expect(result).not.toBeNull();
    expect(result!.map((c) => c.id)).toEqual(["a", "b", "c"]);
  });

  it("returns null when no combination sums to the target", () => {
    const candidates = [
      candidate({ id: "a", amount: "10000.00", date: "2026-03-15" }),
      candidate({ id: "b", amount: "15000.00", date: "2026-03-16" }),
    ];

    const result = findSumCombination(candidates, 50000, 2);
    expect(result).toBeNull();
  });

  it("tolerates floating point within 0.01", () => {
    const candidates = [
      candidate({ id: "a", amount: "10000.005", date: "2026-03-15" }),
      candidate({ id: "b", amount: "20000.00", date: "2026-03-16" }),
    ];

    // 10000.005 + 20000.00 = 30000.005, target 30000.00 -- diff is 0.005 < 0.01
    const result = findSumCombination(candidates, 30000, 2);
    expect(result).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// escapeRegex unit tests
// ---------------------------------------------------------------------------

describe("escapeRegex", () => {
  it("passes through non-special characters", () => {
    expect(escapeRegex("INV-2026-001")).toBe("INV-2026-001");
  });

  it("escapes dots and parens", () => {
    expect(escapeRegex("test.file(1)")).toBe("test\\.file\\(1\\)");
  });

  it("escapes all regex metacharacters", () => {
    expect(escapeRegex("a.*+?^${}()|[]\\b")).toBe("a\\.\\*\\+\\?\\^\\$\\{\\}\\(\\)\\|\\[\\]\\\\b");
  });
});
