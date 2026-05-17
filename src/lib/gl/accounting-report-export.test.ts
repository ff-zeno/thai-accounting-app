import { describe, expect, it } from "vitest";
import {
  balanceSheetToCsv,
  generalLedgerDetailToCsv,
  profitLossToCsv,
  trialBalanceToCsv,
} from "./accounting-report-export";

describe("accounting report CSV exports", () => {
  it("exports trial balance rows with BOM and escaped cells", () => {
    const csv = trialBalanceToCsv(
      [
        {
          accountCode: "1111",
          accountNameEn: 'Bank "Main"',
          accountType: "asset",
          debitTotal: "1000.00",
          creditTotal: "0.00",
          netBalance: "1000.00",
        },
      ],
      "2026-05-31"
    );

    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain('"2026-05-31","1111","Bank ""Main"""');
    expect(csv).toContain("\r\n");
  });

  it("exports general ledger source references", () => {
    const csv = generalLedgerDetailToCsv([
      {
        entryDate: "2026-05-01",
        entryNumber: "JE-2026-0001",
        accountCode: "1111",
        accountNameEn: "Bank",
        description: "Receipt",
        debitAmount: "1000.00",
        creditAmount: "0.00",
        subledgerEntityType: "documents",
        subledgerEntityId: "11111111-1111-1111-1111-111111111111",
        sourceEntityType: null,
        sourceEntityId: null,
        postingKind: "manual_pair",
      },
    ]);

    expect(csv).toContain('"documents:11111111-1111-1111-1111-111111111111"');
  });

  it("exports profit and loss statement rows", () => {
    const csv = profitLossToCsv(
      {
        profitAndLoss: {
          revenue: "1000.00",
          cogs: "300.00",
          grossProfit: "700.00",
          expenses: "200.00",
          netIncome: "500.00",
        },
        balanceSheet: {
          assets: "0.00",
          liabilities: "0.00",
          equity: "0.00",
          retainedEarningsCurrent: "0.00",
          check: "0.00",
        },
      },
      "2026-05-31"
    );

    expect(csv).toContain('"2026-05-31","Net income","500.00"');
  });

  it("exports balance sheet statement rows", () => {
    const csv = balanceSheetToCsv(
      {
        profitAndLoss: {
          revenue: "0.00",
          cogs: "0.00",
          grossProfit: "0.00",
          expenses: "0.00",
          netIncome: "0.00",
        },
        balanceSheet: {
          assets: "1000.00",
          liabilities: "250.00",
          equity: "750.00",
          retainedEarningsCurrent: "0.00",
          check: "0.00",
        },
      },
      "2026-05-31"
    );

    expect(csv).toContain('"2026-05-31","Balance check","0.00"');
  });
});
