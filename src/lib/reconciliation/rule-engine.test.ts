import { describe, it, expect } from "vitest";
import { evaluateRules, isSafeRegex, type TransactionContext, type RuleRecord } from "./rule-engine";

function txn(overrides?: Partial<TransactionContext>): TransactionContext {
  return {
    id: "txn-1",
    amount: "10000.00",
    date: "2026-03-15",
    description: null,
    counterparty: null,
    referenceNo: null,
    channel: null,
    type: "debit",
    bankAccountId: "bank-1",
    ...overrides,
  };
}

function rule(overrides?: Partial<RuleRecord>): RuleRecord {
  return {
    id: "rule-1",
    name: "Test Rule",
    priority: 100,
    conditions: [],
    actions: [{ type: "auto_match", value: "true" }],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Condition operators
// ---------------------------------------------------------------------------

describe("condition evaluation", () => {
  it("contains: matches substring", () => {
    const result = evaluateRules(
      [rule({ conditions: [{ field: "counterparty", operator: "contains", value: "กรมสรรพากร" }] })],
      txn({ counterparty: "กรมสรรพากร สำนักงาน" })
    );
    expect(result).not.toBeNull();
  });

  it("contains: case-insensitive", () => {
    const result = evaluateRules(
      [rule({ conditions: [{ field: "counterparty", operator: "contains", value: "makro" }] })],
      txn({ counterparty: "MAKRO PUBLIC" })
    );
    expect(result).not.toBeNull();
  });

  it("contains: no match", () => {
    const result = evaluateRules(
      [rule({ conditions: [{ field: "counterparty", operator: "contains", value: "xyz" }] })],
      txn({ counterparty: "abc" })
    );
    expect(result).toBeNull();
  });

  it("starts_with: matches prefix", () => {
    const result = evaluateRules(
      [rule({ conditions: [{ field: "description", operator: "starts_with", value: "salary" }] })],
      txn({ description: "Salary payment March" })
    );
    expect(result).not.toBeNull();
  });

  it("ends_with: matches suffix", () => {
    const result = evaluateRules(
      [rule({ conditions: [{ field: "description", operator: "ends_with", value: "ltd." }] })],
      txn({ description: "Payment to ABC Co., Ltd." })
    );
    expect(result).not.toBeNull();
  });

  it("equals: exact match", () => {
    const result = evaluateRules(
      [rule({ conditions: [{ field: "type", operator: "equals", value: "debit" }] })],
      txn({ type: "debit" })
    );
    expect(result).not.toBeNull();
  });

  it("regex: matches pattern", () => {
    const result = evaluateRules(
      [rule({ conditions: [{ field: "counterparty", operator: "regex", value: "TRUE|AIS|DTAC" }] })],
      txn({ counterparty: "TRUE CORPORATION" })
    );
    expect(result).not.toBeNull();
  });

  it("regex: invalid pattern returns false", () => {
    const result = evaluateRules(
      [rule({ conditions: [{ field: "counterparty", operator: "regex", value: "[invalid" }] })],
      txn({ counterparty: "test" })
    );
    expect(result).toBeNull();
  });

  it("regex: ReDoS patterns are rejected", () => {
    const result = evaluateRules(
      [rule({ conditions: [{ field: "counterparty", operator: "regex", value: "(a+)+" }] })],
      txn({ counterparty: "aaaaaaaaaaaaaaaaaaaaa" })
    );
    expect(result).toBeNull();
  });

  it("gt: greater than", () => {
    const result = evaluateRules(
      [rule({ conditions: [{ field: "amount", operator: "gt", value: 5000 }] })],
      txn({ amount: "10000.00" })
    );
    expect(result).not.toBeNull();
  });

  it("lt: less than", () => {
    const result = evaluateRules(
      [rule({ conditions: [{ field: "amount", operator: "lt", value: 2000 }] })],
      txn({ amount: "1500.00" })
    );
    expect(result).not.toBeNull();
  });

  it("between: within range", () => {
    const result = evaluateRules(
      [rule({ conditions: [{ field: "amount", operator: "between", value: [1000, 5000] }] })],
      txn({ amount: "3000.00" })
    );
    expect(result).not.toBeNull();
  });

  it("between: outside range", () => {
    const result = evaluateRules(
      [rule({ conditions: [{ field: "amount", operator: "between", value: [1000, 5000] }] })],
      txn({ amount: "10000.00" })
    );
    expect(result).toBeNull();
  });

  it("day_of_month: matches day", () => {
    const result = evaluateRules(
      [rule({ conditions: [{ field: "day_of_month", operator: "equals", value: "15" }] })],
      txn({ date: "2026-03-15" })
    );
    expect(result).not.toBeNull();
  });

  it("null field returns false", () => {
    const result = evaluateRules(
      [rule({ conditions: [{ field: "counterparty", operator: "contains", value: "test" }] })],
      txn({ counterparty: null })
    );
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Regex safety
// ---------------------------------------------------------------------------

describe("isSafeRegex", () => {
  it("accepts simple valid patterns", () => {
    expect(isSafeRegex("hello")).toBe(true);
    expect(isSafeRegex("\\d+")).toBe(true);
    expect(isSafeRegex("^[A-Z]{3}$")).toBe(true);
    expect(isSafeRegex("TRUE|AIS|DTAC")).toBe(true);
  });

  it("rejects nested quantifiers (ReDoS)", () => {
    expect(isSafeRegex("(a+)+")).toBe(false);
    expect(isSafeRegex("(a*)+")).toBe(false);
    expect(isSafeRegex("(a+)*")).toBe(false);
    expect(isSafeRegex("(a{2,})+")).toBe(false);
  });

  it("rejects patterns exceeding max length", () => {
    expect(isSafeRegex("a".repeat(201))).toBe(false);
    expect(isSafeRegex("a".repeat(200))).toBe(true);
  });

  it("rejects invalid regex syntax", () => {
    expect(isSafeRegex("[")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Multiple conditions (AND logic)
// ---------------------------------------------------------------------------

describe("multiple conditions", () => {
  it("all conditions must pass", () => {
    const result = evaluateRules(
      [rule({
        conditions: [
          { field: "counterparty", operator: "contains", value: "Shopee" },
          { field: "type", operator: "equals", value: "credit" },
        ],
      })],
      txn({ counterparty: "Shopee (Thailand)", type: "credit" })
    );
    expect(result).not.toBeNull();
  });

  it("fails if one condition fails", () => {
    const result = evaluateRules(
      [rule({
        conditions: [
          { field: "counterparty", operator: "contains", value: "Shopee" },
          { field: "type", operator: "equals", value: "credit" },
        ],
      })],
      txn({ counterparty: "Shopee (Thailand)", type: "debit" })
    );
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Priority ordering
// ---------------------------------------------------------------------------

describe("priority ordering", () => {
  it("first matching rule wins (rules pre-sorted by priority)", () => {
    const rules = [
      rule({ id: "high", name: "High Priority", priority: 10, conditions: [{ field: "type", operator: "equals", value: "debit" }] }),
      rule({ id: "low", name: "Low Priority", priority: 100, conditions: [{ field: "type", operator: "equals", value: "debit" }] }),
    ];

    const result = evaluateRules(rules, txn());

    expect(result).not.toBeNull();
    expect(result!.ruleId).toBe("high");
  });

  it("skips non-matching rules", () => {
    const rules = [
      rule({ id: "no-match", priority: 10, conditions: [{ field: "counterparty", operator: "equals", value: "xyz" }] }),
      rule({ id: "match", priority: 100, conditions: [{ field: "type", operator: "equals", value: "debit" }] }),
    ];

    const result = evaluateRules(rules, txn());

    expect(result).not.toBeNull();
    expect(result!.ruleId).toBe("match");
  });
});

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

describe("rule actions", () => {
  it("returns all actions from matching rule", () => {
    const result = evaluateRules(
      [rule({
        conditions: [{ field: "type", operator: "equals", value: "debit" }],
        actions: [
          { type: "assign_category", value: "tax_payment" },
          { type: "auto_match", value: "true" },
        ],
      })],
      txn()
    );

    expect(result).not.toBeNull();
    expect(result!.actions).toHaveLength(2);
    expect(result!.actions[0].type).toBe("assign_category");
    expect(result!.actions[1].type).toBe("auto_match");
  });
});
