import { describe, it, expect } from "vitest";
import { knockoutMatch, type MatchableTransaction } from "./transaction-matcher";

function txn(overrides: Partial<MatchableTransaction> & { date: string; amount: string; type: "debit" | "credit" }): MatchableTransaction {
  return {
    description: null,
    channel: null,
    ...overrides,
  };
}

describe("knockoutMatch", () => {
  it("returns all incoming as new when no existing transactions", () => {
    const incoming = [
      txn({ date: "2024-01-15", amount: "100.00", type: "credit" }),
      txn({ date: "2024-01-16", amount: "200.00", type: "debit" }),
    ];

    const result = knockoutMatch([], incoming);

    expect(result.matched).toHaveLength(0);
    expect(result.newOnly).toHaveLength(2);
    expect(result.existingOnly).toHaveLength(0);
  });

  it("returns all existing as existingOnly when no incoming transactions", () => {
    const existing = [
      txn({ date: "2024-01-15", amount: "100.00", type: "credit" }),
    ];

    const result = knockoutMatch(existing, []);

    expect(result.matched).toHaveLength(0);
    expect(result.newOnly).toHaveLength(0);
    expect(result.existingOnly).toHaveLength(1);
  });

  it("matches identical transactions 1:1", () => {
    const existing = [
      txn({ date: "2024-01-15", amount: "100.00", type: "credit", description: "Transfer" }),
    ];
    const incoming = [
      txn({ date: "2024-01-15", amount: "100.00", type: "credit", description: "Transfer" }),
    ];

    const result = knockoutMatch(existing, incoming);

    expect(result.matched).toHaveLength(1);
    expect(result.newOnly).toHaveLength(0);
    expect(result.existingOnly).toHaveLength(0);
  });

  it("identifies new transactions not in existing", () => {
    const existing = [
      txn({ date: "2024-01-15", amount: "100.00", type: "credit" }),
    ];
    const incoming = [
      txn({ date: "2024-01-15", amount: "100.00", type: "credit" }),
      txn({ date: "2024-01-16", amount: "500.00", type: "debit" }),
    ];

    const result = knockoutMatch(existing, incoming);

    expect(result.matched).toHaveLength(1);
    expect(result.newOnly).toHaveLength(1);
    expect(result.newOnly[0].amount).toBe("500.00");
    expect(result.existingOnly).toHaveLength(0);
  });

  it("handles multiple identical transactions on the same day (1:1 elimination)", () => {
    // 3 existing + 4 incoming with same fingerprint → 3 matched, 1 new
    const existing = [
      txn({ date: "2024-01-15", amount: "50.00", type: "debit", description: "ATM" }),
      txn({ date: "2024-01-15", amount: "50.00", type: "debit", description: "ATM" }),
      txn({ date: "2024-01-15", amount: "50.00", type: "debit", description: "ATM" }),
    ];
    const incoming = [
      txn({ date: "2024-01-15", amount: "50.00", type: "debit", description: "ATM" }),
      txn({ date: "2024-01-15", amount: "50.00", type: "debit", description: "ATM" }),
      txn({ date: "2024-01-15", amount: "50.00", type: "debit", description: "ATM" }),
      txn({ date: "2024-01-15", amount: "50.00", type: "debit", description: "ATM" }),
    ];

    const result = knockoutMatch(existing, incoming);

    expect(result.matched).toHaveLength(3);
    expect(result.newOnly).toHaveLength(1);
    expect(result.existingOnly).toHaveLength(0);
  });

  it("handles fewer incoming than existing (partial overlap)", () => {
    const existing = [
      txn({ date: "2024-01-15", amount: "100.00", type: "credit" }),
      txn({ date: "2024-01-16", amount: "200.00", type: "credit" }),
      txn({ date: "2024-01-17", amount: "300.00", type: "debit" }),
    ];
    const incoming = [
      txn({ date: "2024-01-16", amount: "200.00", type: "credit" }),
    ];

    const result = knockoutMatch(existing, incoming);

    expect(result.matched).toHaveLength(1);
    expect(result.newOnly).toHaveLength(0);
    expect(result.existingOnly).toHaveLength(2);
  });

  it("does not match different types (credit vs debit)", () => {
    const existing = [
      txn({ date: "2024-01-15", amount: "100.00", type: "credit" }),
    ];
    const incoming = [
      txn({ date: "2024-01-15", amount: "100.00", type: "debit" }),
    ];

    const result = knockoutMatch(existing, incoming);

    expect(result.matched).toHaveLength(0);
    expect(result.newOnly).toHaveLength(1);
    expect(result.existingOnly).toHaveLength(1);
  });

  it("does not match different amounts", () => {
    const existing = [
      txn({ date: "2024-01-15", amount: "100.00", type: "credit" }),
    ];
    const incoming = [
      txn({ date: "2024-01-15", amount: "100.01", type: "credit" }),
    ];

    const result = knockoutMatch(existing, incoming);

    expect(result.matched).toHaveLength(0);
    expect(result.newOnly).toHaveLength(1);
    expect(result.existingOnly).toHaveLength(1);
  });

  it("prefers better similarity when multiple candidates share same fingerprint", () => {
    const existing = [
      txn({ date: "2024-01-15", amount: "100.00", type: "credit", description: "Payment A", channel: "ATM" }),
      txn({ date: "2024-01-15", amount: "100.00", type: "credit", description: "Payment B", channel: "ONLINE" }),
    ];
    const incoming = [
      txn({ date: "2024-01-15", amount: "100.00", type: "credit", description: "Payment B", channel: "ONLINE" }),
    ];

    const result = knockoutMatch(existing, incoming);

    expect(result.matched).toHaveLength(1);
    expect(result.matched[0].existing.description).toBe("Payment B");
    expect(result.newOnly).toHaveLength(0);
    expect(result.existingOnly).toHaveLength(1);
    expect(result.existingOnly[0].description).toBe("Payment A");
  });

  it("handles empty inputs", () => {
    const result = knockoutMatch([], []);

    expect(result.matched).toHaveLength(0);
    expect(result.newOnly).toHaveLength(0);
    expect(result.existingOnly).toHaveLength(0);
  });

  it("full re-upload: same statement uploaded twice → 0 new", () => {
    const txns = [
      txn({ date: "2024-01-15", amount: "100.00", type: "credit", description: "A" }),
      txn({ date: "2024-01-16", amount: "200.00", type: "debit", description: "B" }),
      txn({ date: "2024-01-17", amount: "300.00", type: "credit", description: "C" }),
    ];

    const result = knockoutMatch(txns, [...txns]);

    expect(result.matched).toHaveLength(3);
    expect(result.newOnly).toHaveLength(0);
    expect(result.existingOnly).toHaveLength(0);
  });

  it("wider date range: existing has subset, incoming has superset", () => {
    const existing = [
      txn({ date: "2024-01-15", amount: "100.00", type: "credit" }),
      txn({ date: "2024-01-16", amount: "200.00", type: "debit" }),
    ];
    const incoming = [
      txn({ date: "2024-01-15", amount: "100.00", type: "credit" }),
      txn({ date: "2024-01-16", amount: "200.00", type: "debit" }),
      txn({ date: "2024-01-17", amount: "300.00", type: "credit" }),
      txn({ date: "2024-01-18", amount: "400.00", type: "debit" }),
    ];

    const result = knockoutMatch(existing, incoming);

    expect(result.matched).toHaveLength(2);
    expect(result.newOnly).toHaveLength(2);
    expect(result.newOnly.map((t) => t.date)).toEqual(["2024-01-17", "2024-01-18"]);
    expect(result.existingOnly).toHaveLength(0);
  });
});
