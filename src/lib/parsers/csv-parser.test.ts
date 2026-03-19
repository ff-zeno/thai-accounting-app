import { describe, it, expect } from "vitest";
import { parseCSV, detectColumns } from "./csv-parser";
import type { ColumnMapping } from "./csv-parser";

const BASIC_CSV = `Date,Description,Amount,Type,Balance,Reference
2026-01-15,Transfer from savings,5000.00,credit,55000.00,REF001
2026-01-16,Electric bill payment,1500.00,debit,53500.00,REF002
2026-01-17,Salary deposit,25000.00,credit,78500.00,REF003`;

const BASIC_MAPPING: ColumnMapping = {
  date: "Date",
  description: "Description",
  amount: "Amount",
  type: "Type",
  runningBalance: "Balance",
  referenceNo: "Reference",
};

describe("parseCSV — basic column mapping", () => {
  it("parses all transactions with mapped columns", () => {
    const result = parseCSV(BASIC_CSV, BASIC_MAPPING);
    expect(result.transactions).toHaveLength(3);
    expect(result.errors).toHaveLength(0);
  });

  it("extracts correct dates", () => {
    const result = parseCSV(BASIC_CSV, BASIC_MAPPING);
    expect(result.transactions[0].date).toBe("2026-01-15");
    expect(result.transactions[2].date).toBe("2026-01-17");
  });

  it("extracts amounts and types correctly", () => {
    const result = parseCSV(BASIC_CSV, BASIC_MAPPING);
    expect(result.transactions[0].amount).toBe("5000.00");
    expect(result.transactions[0].type).toBe("credit");
    expect(result.transactions[1].amount).toBe("1500.00");
    expect(result.transactions[1].type).toBe("debit");
  });

  it("extracts running balance", () => {
    const result = parseCSV(BASIC_CSV, BASIC_MAPPING);
    expect(result.transactions[0].runningBalance).toBe("55000.00");
    expect(result.transactions[2].runningBalance).toBe("78500.00");
  });

  it("extracts reference number", () => {
    const result = parseCSV(BASIC_CSV, BASIC_MAPPING);
    expect(result.transactions[0].referenceNo).toBe("REF001");
  });

  it("calculates period from transaction dates", () => {
    const result = parseCSV(BASIC_CSV, BASIC_MAPPING);
    expect(result.periodStart).toBe("2026-01-15");
    expect(result.periodEnd).toBe("2026-01-17");
  });

  it("extracts opening/closing from first/last running balance", () => {
    const result = parseCSV(BASIC_CSV, BASIC_MAPPING);
    expect(result.openingBalance).toBe("55000.00");
    expect(result.closingBalance).toBe("78500.00");
  });
});

describe("parseCSV — missing optional columns", () => {
  const MINIMAL_CSV = `Date,Amount
2026-02-01,500.00
2026-02-02,-200.00
2026-02-03,300.00`;

  const MINIMAL_MAPPING: ColumnMapping = {
    date: "Date",
    amount: "Amount",
  };

  it("parses without description, type, balance, or reference", () => {
    const result = parseCSV(MINIMAL_CSV, MINIMAL_MAPPING);
    expect(result.transactions).toHaveLength(3);
    expect(result.errors).toHaveLength(0);
  });

  it("infers type from sign when no type column", () => {
    const result = parseCSV(MINIMAL_CSV, MINIMAL_MAPPING);
    expect(result.transactions[0].type).toBe("credit");
    expect(result.transactions[1].type).toBe("debit");
    expect(result.transactions[2].type).toBe("credit");
  });

  it("strips negative sign from amount when inferring debit", () => {
    const result = parseCSV(MINIMAL_CSV, MINIMAL_MAPPING);
    expect(result.transactions[1].amount).toBe("200.00");
  });

  it("has no running balance when column not mapped", () => {
    const result = parseCSV(MINIMAL_CSV, MINIMAL_MAPPING);
    expect(result.transactions[0].runningBalance).toBeUndefined();
  });

  it("has empty description when column not mapped", () => {
    const result = parseCSV(MINIMAL_CSV, MINIMAL_MAPPING);
    expect(result.transactions[0].description).toBe("");
  });
});

describe("parseCSV — separate debit/credit columns", () => {
  const SPLIT_CSV = `Date,Description,Withdrawal,Deposit,Balance
2026-03-01,ATM Withdrawal,500.00,,9500.00
2026-03-02,Transfer In,,2000.00,11500.00
2026-03-03,Bill Payment,150.00,,11350.00`;

  const SPLIT_MAPPING: ColumnMapping = {
    date: "Date",
    description: "Description",
    amount: "Amount", // not used when debit/credit are separate
    debitAmount: "Withdrawal",
    creditAmount: "Deposit",
    runningBalance: "Balance",
  };

  it("parses transactions with separate debit/credit columns", () => {
    const result = parseCSV(SPLIT_CSV, SPLIT_MAPPING);
    expect(result.transactions).toHaveLength(3);
    expect(result.errors).toHaveLength(0);
  });

  it("correctly determines type from separate columns", () => {
    const result = parseCSV(SPLIT_CSV, SPLIT_MAPPING);
    expect(result.transactions[0].type).toBe("debit");
    expect(result.transactions[0].amount).toBe("500.00");
    expect(result.transactions[1].type).toBe("credit");
    expect(result.transactions[1].amount).toBe("2000.00");
  });
});

describe("parseCSV — date format handling", () => {
  it("handles DD/MM/YYYY (Thai convention)", () => {
    const csv = `Date,Amount,Type
15/01/2026,100.00,credit`;
    const result = parseCSV(csv, { date: "Date", amount: "Amount", type: "Type" });
    expect(result.transactions[0].date).toBe("2026-01-15");
  });

  it("handles ISO format (YYYY-MM-DD)", () => {
    const csv = `Date,Amount,Type
2026-01-15,100.00,credit`;
    const result = parseCSV(csv, { date: "Date", amount: "Amount", type: "Type" });
    expect(result.transactions[0].date).toBe("2026-01-15");
  });

  it("handles Buddhist Era dates (BE year > 2500)", () => {
    const csv = `Date,Amount,Type
15/01/2569,100.00,credit`;
    const result = parseCSV(csv, { date: "Date", amount: "Amount", type: "Type" });
    expect(result.transactions[0].date).toBe("2026-01-15");
  });

  it("handles DD-MM-YYYY with dashes", () => {
    const csv = `Date,Amount,Type
15-01-2026,100.00,credit`;
    const result = parseCSV(csv, { date: "Date", amount: "Amount", type: "Type" });
    expect(result.transactions[0].date).toBe("2026-01-15");
  });

  it("handles DD.MM.YYYY with dots", () => {
    const csv = `Date,Amount,Type
15.01.2026,100.00,credit`;
    const result = parseCSV(csv, { date: "Date", amount: "Amount", type: "Type" });
    expect(result.transactions[0].date).toBe("2026-01-15");
  });
});

describe("parseCSV — amount normalization", () => {
  it("handles comma-separated amounts", () => {
    const csv = `Date,Amount,Type
2026-01-15,"12,345.67",credit`;
    const result = parseCSV(csv, { date: "Date", amount: "Amount", type: "Type" });
    expect(result.transactions[0].amount).toBe("12345.67");
  });

  it("handles parenthesized negatives", () => {
    const csv = `Date,Amount
2026-01-15,(500.00)`;
    const result = parseCSV(csv, { date: "Date", amount: "Amount" });
    expect(result.transactions[0].amount).toBe("500.00");
    expect(result.transactions[0].type).toBe("debit");
  });

  it("handles cr/CR type values as credit", () => {
    const csv = `Date,Amount,Type
2026-01-15,100.00,cr`;
    const result = parseCSV(csv, { date: "Date", amount: "Amount", type: "Type" });
    expect(result.transactions[0].type).toBe("credit");
  });
});

describe("parseCSV — external ref generation", () => {
  it("uses referenceNo as externalRef when available", () => {
    const result = parseCSV(BASIC_CSV, BASIC_MAPPING);
    expect(result.transactions[0].externalRef).toBe("REF001");
  });

  it("generates SHA256-based hash when no referenceNo", () => {
    const csv = `Date,Amount,Type
2026-01-15,100.00,credit
2026-01-16,200.00,debit`;
    const result = parseCSV(csv, { date: "Date", amount: "Amount", type: "Type" });
    // Should be a hex string (SHA256 truncated to 16 chars)
    expect(result.transactions[0].externalRef).toMatch(/^[0-9a-f]{16}$/);
    expect(result.transactions[1].externalRef).toMatch(/^[0-9a-f]{16}$/);
  });

  it("generates unique refs for different transactions", () => {
    const csv = `Date,Amount,Type
2026-01-15,100.00,credit
2026-01-16,200.00,debit
2026-01-17,300.00,credit`;
    const result = parseCSV(csv, { date: "Date", amount: "Amount", type: "Type" });
    const refs = result.transactions.map((t) => t.externalRef);
    const unique = new Set(refs);
    expect(unique.size).toBe(refs.length);
  });
});

describe("parseCSV — error handling", () => {
  it("reports rows with missing date", () => {
    const csv = `Date,Amount,Type
2026-01-15,100.00,credit
,200.00,debit`;
    const result = parseCSV(csv, { date: "Date", amount: "Amount", type: "Type" });
    expect(result.transactions).toHaveLength(1);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain("missing date");
  });

  it("reports rows with missing amount", () => {
    const csv = `Date,Amount,Type
2026-01-15,,credit`;
    const result = parseCSV(csv, { date: "Date", amount: "Amount", type: "Type" });
    expect(result.transactions).toHaveLength(0);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain("missing amount");
  });
});

describe("detectColumns", () => {
  it("returns column headers from CSV", () => {
    const columns = detectColumns(BASIC_CSV);
    expect(columns).toEqual(["Date", "Description", "Amount", "Type", "Balance", "Reference"]);
  });

  it("returns empty array for empty CSV", () => {
    const columns = detectColumns("");
    expect(columns).toEqual([]);
  });

  it("preserves raw header strings (trimming happens in parseCSV)", () => {
    const csv = ` Date , Amount , Type \n2026-01-15,100,credit`;
    const columns = detectColumns(csv);
    // detectColumns returns raw headers; parseCSV trims via transformHeader
    expect(columns).toEqual([" Date ", " Amount ", " Type "]);
  });
});
