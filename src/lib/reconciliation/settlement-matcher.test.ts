import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  findSettlementMatch,
  filterPayoutCandidates,
  type SettlementMatchContext,
} from "./settlement-matcher";
import type { MatchCandidateRow } from "@/lib/db/queries/reconciliation";

// Mock the database query layer — the same boundary matcher.test.ts mocks.
vi.mock("@/lib/db/queries/reconciliation", () => ({
  findMatchCandidates: vi.fn(),
}));

// Reached transitively: settlement-matcher imports two helpers from matcher.ts,
// which pulls in the document matcher's own query modules. Mocked so the suite
// stays a pure unit test rather than needing DATABASE_URL.
vi.mock("@/lib/db/queries/vendor-aliases", () => ({
  findAliasByText: vi.fn(),
}));

vi.mock("@/lib/db/queries/reconciliation-rules", () => ({
  getActiveRules: vi.fn().mockResolvedValue([]),
  incrementRuleMatchCount: vi.fn(),
}));

import { findMatchCandidates } from "@/lib/db/queries/reconciliation";

const mockFindCandidates = vi.mocked(findMatchCandidates);

function candidate(
  overrides: Partial<MatchCandidateRow> & {
    id: string;
    amount: string;
    date: string;
  }
): MatchCandidateRow {
  return {
    description: null,
    counterparty: null,
    referenceNo: null,
    channel: null,
    type: "credit",
    bankAccountId: "bank-1",
    ...overrides,
  };
}

function ctx(overrides?: Partial<SettlementMatchContext>): SettlementMatchContext {
  return {
    orgId: "org-1",
    settlementId: "stl-1",
    netPayout: "1047.10",
    periodEnd: "2026-03-31",
    processor: "Omise",
    externalId: "STL-20260331-001",
    bankAccountId: null,
    ...overrides,
  };
}

/** Every layer calls findMatchCandidates; this answers all of them the same. */
function respondWith(rows: MatchCandidateRow[]) {
  mockFindCandidates.mockResolvedValue(rows);
}

beforeEach(() => {
  vi.clearAllMocks();
  respondWith([]);
});

// ---------------------------------------------------------------------------
// Input guards
// ---------------------------------------------------------------------------

describe("findSettlementMatch input guards", () => {
  it("returns none for a malformed net payout without querying", async () => {
    const result = await findSettlementMatch(ctx({ netPayout: "not-a-number" }));

    expect(result).toEqual({ type: "none" });
    expect(mockFindCandidates).not.toHaveBeenCalled();
  });

  it("returns none for a zero net payout without querying", async () => {
    const result = await findSettlementMatch(ctx({ netPayout: "0.00" }));

    expect(result).toEqual({ type: "none" });
    expect(mockFindCandidates).not.toHaveBeenCalled();
  });

  it("returns none when there are no candidates at all", async () => {
    const result = await findSettlementMatch(ctx());

    expect(result).toEqual({ type: "none" });
  });
});

// ---------------------------------------------------------------------------
// Direction and date window
// ---------------------------------------------------------------------------

describe("payout candidate filtering", () => {
  it("ignores debits — a payout is money arriving", async () => {
    respondWith([
      candidate({
        id: "txn-debit",
        amount: "1047.10",
        date: "2026-04-02",
        type: "debit",
      }),
    ]);

    const result = await findSettlementMatch(ctx());

    expect(result).toEqual({ type: "none" });
  });

  it("ignores deposits before the period closes", async () => {
    // A processor cannot pay out a period that has not ended yet, so an exact
    // amount landing on 2026-03-25 is a different deposit, not this payout.
    respondWith([
      candidate({ id: "txn-early", amount: "1047.10", date: "2026-03-25" }),
    ]);

    const result = await findSettlementMatch(ctx());

    expect(result).toEqual({ type: "none" });
  });

  it("accepts a deposit on the period end date itself", async () => {
    respondWith([
      candidate({ id: "txn-same-day", amount: "1047.10", date: "2026-03-31" }),
    ]);

    const result = await findSettlementMatch(ctx());

    expect(result).toMatchObject({ type: "exact", transactionId: "txn-same-day" });
  });

  it("ignores deposits past the forward window", async () => {
    respondWith([
      candidate({ id: "txn-late", amount: "1047.10", date: "2026-04-15" }),
    ]);

    const result = await findSettlementMatch(ctx());

    expect(result).toEqual({ type: "none" });
  });

  it("filterPayoutCandidates rejects an unparseable period end", () => {
    const rows = [candidate({ id: "t", amount: "1.00", date: "2026-04-01" })];

    expect(filterPayoutCandidates(rows, "not-a-date", 10)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Layer 0: reference
// ---------------------------------------------------------------------------

describe("layer 0 — reference", () => {
  it("matches on the settlement ID in the description with full confidence when the amount agrees", async () => {
    respondWith([
      candidate({
        id: "txn-ref",
        amount: "1047.10",
        date: "2026-04-02",
        description: "SETTLEMENT STL-20260331-001 PAYOUT",
      }),
    ]);

    const result = await findSettlementMatch(ctx());

    expect(result).toMatchObject({
      type: "reference",
      transactionId: "txn-ref",
      confidence: "1.00",
    });
  });

  it("drops to 0.85 when the ID matches but the amount does not", async () => {
    respondWith([
      candidate({
        id: "txn-ref",
        amount: "1040.00",
        date: "2026-04-02",
        referenceNo: "STL-20260331-001",
      }),
    ]);

    const result = await findSettlementMatch(ctx());

    expect(result).toMatchObject({
      type: "reference",
      transactionId: "txn-ref",
      confidence: "0.85",
    });
  });

  it("does not match a settlement ID embedded in a longer token", async () => {
    respondWith([
      candidate({
        id: "txn-other",
        amount: "1040.00",
        date: "2026-04-02",
        description: "REF STL-20260331-0019",
      }),
    ]);

    const result = await findSettlementMatch(ctx());

    expect(result).toEqual({ type: "none" });
  });

  it("skips the layer when the settlement has no external ID", async () => {
    respondWith([
      candidate({
        id: "txn-exact",
        amount: "1047.10",
        date: "2026-04-02",
        description: "OMISE PAYOUT",
      }),
    ]);

    const result = await findSettlementMatch(ctx({ externalId: "  " }));

    // Falls through to the exact layer rather than throwing on an empty regex.
    expect(result).toMatchObject({ type: "exact", transactionId: "txn-exact" });
  });
});

// ---------------------------------------------------------------------------
// Layer 1: exact
// ---------------------------------------------------------------------------

describe("layer 1 — exact", () => {
  it("matches a lone credit equal to the net payout", async () => {
    respondWith([
      candidate({ id: "txn-exact", amount: "1047.10", date: "2026-04-01" }),
    ]);

    const result = await findSettlementMatch(ctx());

    expect(result).toMatchObject({
      type: "exact",
      transactionId: "txn-exact",
      confidence: "1.00",
    });
  });

  it("returns ambiguous rather than guessing between two identical deposits", async () => {
    respondWith([
      candidate({ id: "txn-a", amount: "1047.10", date: "2026-04-01" }),
      candidate({ id: "txn-b", amount: "1047.10", date: "2026-04-03" }),
    ]);

    const result = await findSettlementMatch(ctx());

    expect(result).toEqual({
      type: "ambiguous",
      candidates: [
        { id: "txn-a", amount: "1047.10", date: "2026-04-01" },
        { id: "txn-b", amount: "1047.10", date: "2026-04-03" },
      ],
    });
  });

  it("does not treat a near-net amount as exact", async () => {
    respondWith([
      candidate({ id: "txn-near", amount: "1047.11", date: "2026-04-01" }),
    ]);

    const result = await findSettlementMatch(ctx());

    expect(result).not.toMatchObject({ type: "exact" });
  });
});

// ---------------------------------------------------------------------------
// Layer 2: processor
// ---------------------------------------------------------------------------

describe("layer 2 — processor", () => {
  it("matches the processor name on a near-net credit", async () => {
    respondWith([
      candidate({
        id: "txn-proc",
        amount: "1047.11",
        date: "2026-04-02",
        counterparty: "OMISE PAYMENT SERVICES",
      }),
    ]);

    const result = await findSettlementMatch(ctx());

    expect(result).toMatchObject({
      type: "processor",
      transactionId: "txn-proc",
      confidence: "0.80",
    });
  });

  it("does not match a credit with no processor name anywhere in its text", async () => {
    respondWith([
      candidate({
        id: "txn-anon",
        amount: "1047.11",
        date: "2026-04-02",
        description: "TRANSFER IN",
      }),
    ]);

    const result = await findSettlementMatch(ctx());

    expect(result).toEqual({ type: "none" });
  });

  it("skips the layer when the processor name normalizes to nothing", async () => {
    respondWith([
      candidate({
        id: "txn-proc",
        amount: "1047.11",
        date: "2026-04-02",
        counterparty: "OMISE",
      }),
    ]);

    const result = await findSettlementMatch(ctx({ processor: "   " }));

    expect(result).toEqual({ type: "none" });
  });
});

// ---------------------------------------------------------------------------
// Layer 3: batched
// ---------------------------------------------------------------------------

describe("layer 3 — batched", () => {
  it("matches one deposit clearing two payouts at 0.90", async () => {
    respondWith([
      candidate({ id: "txn-batch", amount: "2094.20", date: "2026-04-02" }),
    ]);

    const result = await findSettlementMatch(
      ctx({
        siblings: [
          { id: "stl-2", amount: "1047.10", externalId: "STL-20260331-002" },
        ],
      })
    );

    expect(result).toMatchObject({
      type: "batched",
      transactionId: "txn-batch",
      confidence: "0.90",
    });
    if (result.type === "batched") {
      expect(result.settlementIds).toEqual(["stl-1", "stl-2"]);
    }
  });

  it("matches a three-way batch at the lower 0.70 confidence", async () => {
    respondWith([
      candidate({ id: "txn-batch3", amount: "3200.00", date: "2026-04-02" }),
    ]);

    const result = await findSettlementMatch(
      ctx({
        netPayout: "1000.00",
        siblings: [
          { id: "stl-2", amount: "1200.00", externalId: "STL-002" },
          { id: "stl-3", amount: "1000.00", externalId: "STL-003" },
        ],
      })
    );

    expect(result).toMatchObject({ type: "batched", confidence: "0.70" });
    if (result.type === "batched") {
      expect(result.settlementIds).toEqual(["stl-1", "stl-2", "stl-3"]);
    }
  });

  it("rejects a combination that excludes the settlement being matched", async () => {
    // 1200 + 1300 = 2500 exactly, but neither is stl-1, and no combination
    // containing stl-1 reaches 2500. Recording this deposit against stl-1
    // would attach it to a payout it does not explain.
    respondWith([
      candidate({ id: "txn-others", amount: "2500.00", date: "2026-04-02" }),
    ]);

    const result = await findSettlementMatch(
      ctx({
        netPayout: "1000.00",
        siblings: [
          { id: "stl-2", amount: "1200.00", externalId: "STL-002" },
          { id: "stl-3", amount: "1300.00", externalId: "STL-003" },
        ],
      })
    );

    expect(result).toEqual({ type: "none" });
  });

  it("skips the layer entirely when there are no siblings", async () => {
    respondWith([
      candidate({ id: "txn-big", amount: "2094.20", date: "2026-04-02" }),
    ]);

    const result = await findSettlementMatch(ctx());

    expect(result).toEqual({ type: "none" });
  });

  it("ignores a deposit no larger than this settlement's own net", async () => {
    respondWith([
      candidate({ id: "txn-small", amount: "900.00", date: "2026-04-02" }),
    ]);

    const result = await findSettlementMatch(
      ctx({
        netPayout: "1000.00",
        siblings: [{ id: "stl-2", amount: "-100.00", externalId: "STL-002" }],
      })
    );

    expect(result).toEqual({ type: "none" });
  });
});

// ---------------------------------------------------------------------------
// Cascade sequencing
// ---------------------------------------------------------------------------

describe("cascade sequencing", () => {
  it("prefers the reference layer over an exact amount on a different deposit", async () => {
    respondWith([
      candidate({ id: "txn-exact", amount: "1047.10", date: "2026-04-01" }),
      candidate({
        id: "txn-ref",
        amount: "1047.09",
        date: "2026-04-02",
        description: "PAYOUT STL-20260331-001",
      }),
    ]);

    const result = await findSettlementMatch(ctx());

    expect(result).toMatchObject({ type: "reference", transactionId: "txn-ref" });
  });

  it("continues past the reference layer when the ID is absent", async () => {
    respondWith([
      candidate({
        id: "txn-exact",
        amount: "1047.10",
        date: "2026-04-01",
        description: "PAYOUT STL-99999999-999",
      }),
    ]);

    const result = await findSettlementMatch(ctx());

    expect(result).toMatchObject({ type: "exact", transactionId: "txn-exact" });
  });

  it("prefers an exact amount over a named processor on a near-net deposit", async () => {
    respondWith([
      candidate({
        id: "txn-proc",
        amount: "1047.11",
        date: "2026-04-02",
        counterparty: "OMISE",
      }),
      candidate({ id: "txn-exact", amount: "1047.10", date: "2026-04-03" }),
    ]);

    const result = await findSettlementMatch(ctx());

    expect(result).toMatchObject({ type: "exact", transactionId: "txn-exact" });
  });

  it("stops at ambiguous instead of falling through to a weaker layer", async () => {
    // Both deposits are exact, and one also names the processor. Letting the
    // processor layer break the tie would dress a coin flip up as a signal.
    respondWith([
      candidate({
        id: "txn-a",
        amount: "1047.10",
        date: "2026-04-01",
        counterparty: "OMISE",
      }),
      candidate({ id: "txn-b", amount: "1047.10", date: "2026-04-03" }),
    ]);

    const result = await findSettlementMatch(ctx());

    expect(result.type).toBe("ambiguous");
  });

  it("prefers the processor layer over a batched sum", async () => {
    respondWith([
      candidate({
        id: "txn-proc",
        amount: "1047.11",
        date: "2026-04-02",
        counterparty: "OMISE",
      }),
      candidate({ id: "txn-batch", amount: "2094.20", date: "2026-04-03" }),
    ]);

    const result = await findSettlementMatch(
      ctx({
        siblings: [{ id: "stl-2", amount: "1047.10", externalId: "STL-002" }],
      })
    );

    expect(result).toMatchObject({ type: "processor", transactionId: "txn-proc" });
  });
});
