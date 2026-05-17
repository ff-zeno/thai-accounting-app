type TrialBalanceRow = {
  accountCode: string;
  accountNameEn: string;
  accountType: string;
  debitTotal: string;
  creditTotal: string;
  netBalance: string;
};

type GeneralLedgerDetailRow = {
  entryDate: string;
  entryNumber: string;
  accountCode: string;
  accountNameEn: string;
  description: string | null;
  debitAmount: string;
  creditAmount: string;
  subledgerEntityType: string | null;
  subledgerEntityId: string | null;
  sourceEntityType: string | null;
  sourceEntityId: string | null;
  postingKind: string | null;
};

type FinancialStatementSummary = {
  profitAndLoss: {
    revenue: string;
    cogs: string;
    grossProfit: string;
    expenses: string;
    netIncome: string;
  };
  balanceSheet: {
    assets: string;
    liabilities: string;
    equity: string;
    retainedEarningsCurrent: string;
    check: string;
  };
};

function csvCell(value: string | number | null | undefined) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

export function trialBalanceToCsv(rows: TrialBalanceRow[], asOfDate: string) {
  const header = ["As of", "Account code", "Account", "Type", "Debit", "Credit", "Net"];
  const lines = rows.map((row) =>
    [
      asOfDate,
      row.accountCode,
      row.accountNameEn,
      row.accountType,
      row.debitTotal,
      row.creditTotal,
      row.netBalance,
    ]
      .map(csvCell)
      .join(",")
  );
  return `\uFEFF${[header.map(csvCell).join(","), ...lines].join("\r\n")}\r\n`;
}

export function generalLedgerDetailToCsv(rows: GeneralLedgerDetailRow[]) {
  const header = [
    "Date",
    "Journal",
    "Account code",
    "Account",
    "Description",
    "Debit",
    "Credit",
    "Source",
  ];
  const lines = rows.map((row) =>
    [
      row.entryDate,
      row.entryNumber,
      row.accountCode,
      row.accountNameEn,
      row.description ?? "",
      row.debitAmount,
      row.creditAmount,
      row.subledgerEntityType
        ? `${row.subledgerEntityType}:${row.subledgerEntityId ?? ""}`
        : row.sourceEntityType
          ? `${row.sourceEntityType}:${row.sourceEntityId ?? ""}`
          : row.postingKind ?? "manual",
    ]
      .map(csvCell)
      .join(",")
  );
  return `\uFEFF${[header.map(csvCell).join(","), ...lines].join("\r\n")}\r\n`;
}

export function profitLossToCsv(summary: FinancialStatementSummary, asOfDate: string) {
  const header = ["As of", "Line", "Amount"];
  const rows = [
    ["Revenue", summary.profitAndLoss.revenue],
    ["Cost of goods sold", summary.profitAndLoss.cogs],
    ["Gross profit", summary.profitAndLoss.grossProfit],
    ["Expenses", summary.profitAndLoss.expenses],
    ["Net income", summary.profitAndLoss.netIncome],
  ];
  const lines = rows.map(([label, value]) =>
    [asOfDate, label, value].map(csvCell).join(",")
  );
  return `\uFEFF${[header.map(csvCell).join(","), ...lines].join("\r\n")}\r\n`;
}

export function balanceSheetToCsv(summary: FinancialStatementSummary, asOfDate: string) {
  const header = ["As of", "Line", "Amount"];
  const rows = [
    ["Assets", summary.balanceSheet.assets],
    ["Liabilities", summary.balanceSheet.liabilities],
    ["Equity", summary.balanceSheet.equity],
    ["Current year profit/loss", summary.balanceSheet.retainedEarningsCurrent],
    ["Balance check", summary.balanceSheet.check],
  ];
  const lines = rows.map(([label, value]) =>
    [asOfDate, label, value].map(csvCell).join(",")
  );
  return `\uFEFF${[header.map(csvCell).join(","), ...lines].join("\r\n")}\r\n`;
}
