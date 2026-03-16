import { describe, it, expect } from "vitest";
import {
  parseKBankStatement,
  parseKBankIntraday,
  detectKBankFormat,
  parseKBank,
} from "./kbank-parser";

const SAMPLE_STATEMENT_CSV = `"KASIKORNBANK"
"Account Number : 170-3-26995-4"
"Account Name : TEST CO.,LTD."
"","","","","","","","","","","","",""
"","","","","","","","","","","","",""
"","","","","","","","","","","","",""
"","","","","","","","","","","","",""
"","","","","","","","","","","","",""
"","","","","","","","","","","","",""
"","","","","","","","","","","","",""
"Statement Period : 01/02/2026 - 28/02/2026"
"","","","","","","","","","","","",""
"","Date","Time","Description","Withdrawal","","Deposit","","Balance","","Channel","","Details"
"","","","Beginning Balance","","","","","50,000.00","","","",""
"","07-02-26","09:15","Transfer Deposit","","","5,000.00","","55,000.00","","K PLUS","","From Acct 123-4-56789-0"
"","07-02-26","10:30","Transfer Withdrawal","1,500.00","","","","53,500.00","","K PLUS","","To Acct 987-6-54321-0"
"","08-02-26","14:22","Transfer Deposit","","","12,345.67","","65,845.67","","Internet/Mobile","","Salary Payment"
"","15-02-26","16:00","Cash Withdrawal","500.00","","","","65,345.67","","ATM","",""
"","28-02-26","11:45","Transfer Deposit","","",""2,654.33"","","68,000.00","","K PLUS","","Invoice #1234"
"","","","Ending Balance","","","","","68,000.00","","","",""`;

const SAMPLE_INTRADAY_CSV = `"Account number : 1703269954"
"From Date : 07/02/2026"
"To Date : 07/02/2026"
"Transaction Date","Transaction","Withdrawal (Baht)","Deposit (Baht)","Account/PromptPay or Biller","Channel"
"2026-02-07 09:15:30","รับโอนเงิน","","5000.00","บัญชีธนาคารกสิกรไทย","K PLUS"
"2026-02-07 10:30:45","โอนเงิน","-1500.00","","บัญชีธนาคารกสิกรไทย","K PLUS"
"2026-02-07 14:22:10","รับโอนเงิน","","12345.67","Internet/Mobile ต่างธนาคาร","Internet/Mobile ต่างธนาคาร"`;

describe("detectKBankFormat", () => {
  it("detects statement format", () => {
    expect(detectKBankFormat(SAMPLE_STATEMENT_CSV)).toBe("statement");
  });

  it("detects intraday format", () => {
    expect(detectKBankFormat(SAMPLE_INTRADAY_CSV)).toBe("intraday");
  });

  it("returns null for unknown format", () => {
    expect(detectKBankFormat("Date,Amount,Balance\n2026-01-01,100,200")).toBe(
      null
    );
  });
});

describe("parseKBankStatement", () => {
  it("parses transactions correctly", () => {
    const result = parseKBankStatement(SAMPLE_STATEMENT_CSV);
    expect(result.errors).toHaveLength(0);
    expect(result.transactions).toHaveLength(5);
  });

  it("extracts correct dates", () => {
    const result = parseKBankStatement(SAMPLE_STATEMENT_CSV);
    expect(result.transactions[0].date).toBe("2026-02-07");
    expect(result.transactions[2].date).toBe("2026-02-08");
  });

  it("parses amounts correctly", () => {
    const result = parseKBankStatement(SAMPLE_STATEMENT_CSV);
    // First txn: deposit 5000
    expect(result.transactions[0].amount).toBe("5000.00");
    expect(result.transactions[0].type).toBe("credit");
    // Second txn: withdrawal 1500
    expect(result.transactions[1].amount).toBe("1500.00");
    expect(result.transactions[1].type).toBe("debit");
  });

  it("handles quoted amounts with commas", () => {
    const result = parseKBankStatement(SAMPLE_STATEMENT_CSV);
    // Third txn: deposit 12,345.67
    expect(result.transactions[2].amount).toBe("12345.67");
  });

  it("extracts running balance", () => {
    const result = parseKBankStatement(SAMPLE_STATEMENT_CSV);
    expect(result.transactions[0].runningBalance).toBe("55000.00");
  });

  it("extracts period dates", () => {
    const result = parseKBankStatement(SAMPLE_STATEMENT_CSV);
    expect(result.periodStart).toBe("2026-02-07");
    expect(result.periodEnd).toBe("2026-02-28");
  });

  it("extracts opening and closing balance", () => {
    const result = parseKBankStatement(SAMPLE_STATEMENT_CSV);
    expect(result.openingBalance).toBe("50000.00");
    expect(result.closingBalance).toBe("68000.00");
  });

  it("includes counterparty from Details column", () => {
    const result = parseKBankStatement(SAMPLE_STATEMENT_CSV);
    expect(result.transactions[0].counterparty).toBe(
      "From Acct 123-4-56789-0"
    );
  });

  it("generates unique external refs", () => {
    const result = parseKBankStatement(SAMPLE_STATEMENT_CSV);
    const refs = result.transactions.map((t) => t.externalRef);
    const unique = new Set(refs);
    expect(unique.size).toBe(refs.length);
  });
});

describe("parseKBankIntraday", () => {
  it("parses transactions correctly", () => {
    const result = parseKBankIntraday(SAMPLE_INTRADAY_CSV);
    expect(result.errors).toHaveLength(0);
    expect(result.transactions).toHaveLength(3);
  });

  it("translates Thai descriptions to English", () => {
    const result = parseKBankIntraday(SAMPLE_INTRADAY_CSV);
    expect(result.transactions[0].description).toBe("Transfer Deposit");
    expect(result.transactions[1].description).toBe("Transfer Withdrawal");
  });

  it("handles negative withdrawal amounts", () => {
    const result = parseKBankIntraday(SAMPLE_INTRADAY_CSV);
    expect(result.transactions[1].amount).toBe("1500.00");
    expect(result.transactions[1].type).toBe("debit");
  });

  it("translates Thai channel names", () => {
    const result = parseKBankIntraday(SAMPLE_INTRADAY_CSV);
    expect(result.transactions[2].channel).toBe(
      "Internet/Mobile Across Banks"
    );
  });

  it("has no running balance (intraday limitation)", () => {
    const result = parseKBankIntraday(SAMPLE_INTRADAY_CSV);
    expect(result.transactions[0].runningBalance).toBeUndefined();
  });
});

describe("parseKBank (unified)", () => {
  it("auto-detects and parses statement format", () => {
    const result = parseKBank(SAMPLE_STATEMENT_CSV);
    expect(result.transactions.length).toBe(5);
  });

  it("auto-detects and parses intraday format", () => {
    const result = parseKBank(SAMPLE_INTRADAY_CSV);
    expect(result.transactions.length).toBe(3);
  });

  it("returns error for unknown format", () => {
    const result = parseKBank("random,csv,data\n1,2,3");
    expect(result.transactions).toHaveLength(0);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});
