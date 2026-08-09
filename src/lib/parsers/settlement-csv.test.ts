import { describe, it, expect } from "vitest";
import { parseSettlementCSV, detectSettlementColumns } from "./settlement-csv";
import type { SettlementColumnMapping } from "./settlement-csv";

// A ฿1,070 card sale with a 2% MDR plus 7% VAT on the fee:
// 1070.00 - 21.40 - 1.50 = 1047.10. Output VAT is still owed on 1070.00.
const BASIC_CSV = `Settlement ID,Period Start,Period End,Gross,Fee,Fee VAT,Net
SET-001,2026-01-01,2026-01-07,1070.00,21.40,1.50,1047.10
SET-002,2026-01-08,2026-01-14,2140.00,42.80,3.00,2094.20`;

const BASIC_MAPPING: SettlementColumnMapping = {
  externalId: "Settlement ID",
  periodStart: "Period Start",
  periodEnd: "Period End",
  grossAmount: "Gross",
  feeAmount: "Fee",
  feeVatAmount: "Fee VAT",
  netPayout: "Net",
};

describe("parseSettlementCSV — basic column mapping", () => {
  it("parses every row under a valid mapping", () => {
    const result = parseSettlementCSV(BASIC_CSV, BASIC_MAPPING);
    expect(result.settlements).toHaveLength(2);
    expect(result.errors).toHaveLength(0);
  });

  it("keeps amounts as NUMERIC(14,2) strings", () => {
    const { settlements } = parseSettlementCSV(BASIC_CSV, BASIC_MAPPING);
    expect(settlements[0]).toMatchObject({
      externalId: "SET-001",
      grossAmount: "1070.00",
      feeAmount: "21.40",
      feeVatAmount: "1.50",
      netPayout: "1047.10",
    });
  });

  it("normalizes period dates", () => {
    const { settlements } = parseSettlementCSV(BASIC_CSV, BASIC_MAPPING);
    expect(settlements[0].periodStart).toBe("2026-01-01");
    expect(settlements[0].periodEnd).toBe("2026-01-07");
  });

  it("converts Buddhist Era period dates, as the statement parser does", () => {
    const csv = `Settlement ID,Period End,Gross,Fee,Fee VAT,Net
SET-BE,07/01/2569,1070.00,21.40,1.50,1047.10`;
    const { settlements } = parseSettlementCSV(csv, BASIC_MAPPING);
    expect(settlements[0].periodEnd).toBe("2026-01-07");
  });

  it("strips thousands separators", () => {
    const csv = `Settlement ID,Gross,Fee,Fee VAT,Net
SET-BIG,"1,070,000.00","21,400.00","1,498.00","1,047,102.00"`;
    const { settlements, errors } = parseSettlementCSV(csv, BASIC_MAPPING);
    expect(errors).toHaveLength(0);
    expect(settlements[0].grossAmount).toBe("1070000.00");
    expect(settlements[0].netPayout).toBe("1047102.00");
  });
});

describe("parseSettlementCSV — optional fee VAT", () => {
  it("accepts a row with no fee VAT column mapped", () => {
    const csv = `Settlement ID,Gross,Fee,Net
SET-NOVAT,1070.00,21.40,1048.60`;
    const { settlements, errors } = parseSettlementCSV(csv, {
      externalId: "Settlement ID",
      grossAmount: "Gross",
      feeAmount: "Fee",
      netPayout: "Net",
    });
    expect(errors).toHaveLength(0);
    expect(settlements[0].feeVatAmount).toBeUndefined();
  });

  it("treats a blank fee VAT cell as zero rather than rejecting the row", () => {
    const csv = `Settlement ID,Gross,Fee,Fee VAT,Net
SET-BLANK,1070.00,21.40,,1048.60`;
    const { settlements, errors } = parseSettlementCSV(csv, BASIC_MAPPING);
    expect(errors).toHaveLength(0);
    expect(settlements[0].feeVatAmount).toBeUndefined();
    expect(settlements[0].netPayout).toBe("1048.60");
  });
});

describe("parseSettlementCSV — the balance invariant", () => {
  it("rejects a row where gross - fee - feeVat does not equal net", () => {
    const csv = `Settlement ID,Gross,Fee,Fee VAT,Net
SET-BAD,1070.00,21.40,1.50,1050.00`;
    const { settlements, errors } = parseSettlementCSV(csv, BASIC_MAPPING);
    expect(settlements).toHaveLength(0);
    expect(errors).toHaveLength(1);
  });

  it("reports the discrepancy so the owner can see what is wrong", () => {
    const csv = `Settlement ID,Gross,Fee,Fee VAT,Net
SET-BAD,1070.00,21.40,1.50,1050.00`;
    const { errors } = parseSettlementCSV(csv, BASIC_MAPPING);
    expect(errors[0].message).toContain("SET-BAD");
    expect(errors[0].message).toContain("1047.10");
    expect(errors[0].message).toContain("off by -2.90");
  });

  it("catches a single-satang drift", () => {
    const csv = `Settlement ID,Gross,Fee,Fee VAT,Net
SET-DRIFT,1070.00,21.40,1.50,1047.11`;
    const { settlements, errors } = parseSettlementCSV(csv, BASIC_MAPPING);
    expect(settlements).toHaveLength(0);
    expect(errors[0].message).toContain("off by -0.01");
  });

  it("keeps the good rows when one row fails", () => {
    const csv = `Settlement ID,Gross,Fee,Fee VAT,Net
SET-OK,1070.00,21.40,1.50,1047.10
SET-BAD,1070.00,21.40,1.50,1050.00
SET-OK2,2140.00,42.80,3.00,2094.20`;
    const { settlements, errors } = parseSettlementCSV(csv, BASIC_MAPPING);
    expect(settlements.map((s) => s.externalId)).toEqual(["SET-OK", "SET-OK2"]);
    expect(errors).toHaveLength(1);
    expect(errors[0].row).toBe(2);
  });
});

describe("parseSettlementCSV — malformed input", () => {
  it("rejects a row with no settlement ID", () => {
    const csv = `Settlement ID,Gross,Fee,Fee VAT,Net
,1070.00,21.40,1.50,1047.10`;
    const { settlements, errors } = parseSettlementCSV(csv, BASIC_MAPPING);
    expect(settlements).toHaveLength(0);
    expect(errors[0].message).toContain("missing settlement ID");
  });

  it("rejects a non-numeric amount rather than coercing it", () => {
    const csv = `Settlement ID,Gross,Fee,Fee VAT,Net
SET-JUNK,n/a,21.40,1.50,1047.10`;
    const { settlements, errors } = parseSettlementCSV(csv, BASIC_MAPPING);
    expect(settlements).toHaveLength(0);
    expect(errors[0].message).toContain("grossAmount is not a valid amount");
  });

  it("rejects a row missing a required amount", () => {
    const csv = `Settlement ID,Gross,Fee,Fee VAT,Net
SET-SHORT,1070.00,,1.50,1047.10`;
    const { settlements, errors } = parseSettlementCSV(csv, BASIC_MAPPING);
    expect(settlements).toHaveLength(0);
    expect(errors[0].message).toContain("missing feeAmount");
  });

  it("reports every bad amount in a row, not just the first", () => {
    const csv = `Settlement ID,Gross,Fee,Fee VAT,Net
SET-JUNK,n/a,n/a,1.50,1047.10`;
    const { errors } = parseSettlementCSV(csv, BASIC_MAPPING);
    expect(errors).toHaveLength(2);
  });

  it("reports an empty file at file level, not against row 1", () => {
    const { settlements, errors } = parseSettlementCSV("", BASIC_MAPPING);
    expect(settlements).toHaveLength(0);
    expect(errors).toHaveLength(1);
    expect(errors[0].row).toBe(0);
  });
});

describe("detectSettlementColumns", () => {
  it("returns the headers for the mapping UI", () => {
    expect(detectSettlementColumns(BASIC_CSV)).toEqual([
      "Settlement ID",
      "Period Start",
      "Period End",
      "Gross",
      "Fee",
      "Fee VAT",
      "Net",
    ]);
  });

  it("trims whitespace-padded headers", () => {
    expect(detectSettlementColumns(` Gross , Net \n1.00,1.00`)).toEqual([
      "Gross",
      "Net",
    ]);
  });
});
