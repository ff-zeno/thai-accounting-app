/**
 * Pure balance validation for bank statement imports.
 *
 * Verifies that opening balance + sum of transactions = closing balance.
 * Returns null if valid, or a warning message if mismatched.
 */

interface BalanceTransaction {
  amount: string;
  type: "debit" | "credit";
}

export function validateStatementBalance(
  openingBalance: string,
  closingBalance: string,
  transactions: BalanceTransaction[]
): string | null {
  const opening = parseFloat(openingBalance);
  let runningTotal = opening;

  for (const txn of transactions) {
    const amt = parseFloat(txn.amount);
    runningTotal += txn.type === "credit" ? amt : -amt;
  }

  const closing = parseFloat(closingBalance);

  // Allow rounding tolerance of 0.01 (1 satang)
  if (Math.abs(runningTotal - closing) > 0.01) {
    return `Balance mismatch: expected ${closing.toFixed(2)}, calculated ${runningTotal.toFixed(2)}`;
  }

  return null;
}
