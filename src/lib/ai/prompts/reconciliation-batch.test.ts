import { describe, it, expect } from "vitest";
import { buildReconciliationPrompt } from "./reconciliation-batch";

const makeTxn = (id: string, overrides = {}) => ({
  id,
  date: "2026-01-15",
  amount: "10000.00",
  type: "debit" as const,
  description: "TRANSFER TO ACME CO",
  counterparty: "ACME",
  referenceNo: "REF001",
  bankAccountId: "bank-1",
  ...overrides,
});

const makeDoc = (id: string, overrides = {}) => ({
  id,
  documentNumber: "INV-001",
  issueDate: "2026-01-14",
  totalAmount: "10700.00",
  currency: "THB",
  vendorName: "ACME Corporation",
  netAmountPaid: "10000.00",
  whtAmountWithheld: "700.00",
  vatAmount: "700.00",
  ...overrides,
});

describe("buildReconciliationPrompt", () => {
  it("returns system and user prompts", () => {
    const result = buildReconciliationPrompt([makeTxn("t1")], [makeDoc("d1")]);
    expect(result.system).toContain("Thai accounting reconciliation");
    expect(result.user).toContain("BANK TRANSACTIONS");
    expect(result.user).toContain("ACCOUNTING DOCUMENTS");
    expect(result.user).toContain("TASK");
  });

  it("maps indices correctly (1-indexed)", () => {
    const txns = [makeTxn("uuid-t1"), makeTxn("uuid-t2"), makeTxn("uuid-t3")];
    const docs = [makeDoc("uuid-d1"), makeDoc("uuid-d2")];

    const result = buildReconciliationPrompt(txns, docs);

    expect(result.transactionIndexToId.get(1)).toBe("uuid-t1");
    expect(result.transactionIndexToId.get(2)).toBe("uuid-t2");
    expect(result.transactionIndexToId.get(3)).toBe("uuid-t3");
    expect(result.documentIndexToId.get(1)).toBe("uuid-d1");
    expect(result.documentIndexToId.get(2)).toBe("uuid-d2");
  });

  it("includes T-prefixed indices in user prompt", () => {
    const result = buildReconciliationPrompt(
      [makeTxn("t1"), makeTxn("t2")],
      [makeDoc("d1")],
    );
    expect(result.user).toContain("T1 |");
    expect(result.user).toContain("T2 |");
    expect(result.user).toContain("D1 |");
  });

  it("truncates long descriptions", () => {
    const longDesc = "A".repeat(300);
    const txn = makeTxn("t1", { description: longDesc });
    const result = buildReconciliationPrompt([txn], [makeDoc("d1")]);

    // Description should be truncated to 200 + "..."
    expect(result.user).not.toContain(longDesc);
    expect(result.user).toContain("A".repeat(200) + "...");
  });

  it("truncates long vendor names", () => {
    const longVendor = "V".repeat(200);
    const doc = makeDoc("d1", { vendorName: longVendor });
    const result = buildReconciliationPrompt([makeTxn("t1")], [doc]);

    expect(result.user).not.toContain(longVendor);
    expect(result.user).toContain("V".repeat(100) + "...");
  });

  it("handles null fields gracefully", () => {
    const txn = makeTxn("t1", { description: null, counterparty: null });
    const doc = makeDoc("d1", {
      vendorName: null,
      documentNumber: null,
      vatAmount: null,
      whtAmountWithheld: null,
    });

    const result = buildReconciliationPrompt([txn], [doc]);
    expect(result.user).toContain("T1");
    expect(result.user).toContain("D1");
    expect(result.user).toContain("Unknown");
  });

  it("formats DEBIT and CREDIT correctly", () => {
    const debit = makeTxn("t1", { type: "debit" });
    const credit = makeTxn("t2", { type: "credit" });

    const result = buildReconciliationPrompt([debit, credit], [makeDoc("d1")]);
    expect(result.user).toContain("DEBIT 10000.00");
    expect(result.user).toContain("CREDIT 10000.00");
  });

  it("includes WHT and net amounts in document format", () => {
    const result = buildReconciliationPrompt([makeTxn("t1")], [makeDoc("d1")]);
    expect(result.user).toContain("WHT: 700.00");
    expect(result.user).toContain("Net: 10000.00");
  });
});
