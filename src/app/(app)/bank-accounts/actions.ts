"use server";

import { revalidatePath } from "next/cache";
import { getActiveOrgId } from "@/lib/utils/org-context";
import {
  createBankAccount,
  updateBankAccount,
} from "@/lib/db/queries/bank-accounts";
import {
  createStatement,
  importTransactions,
  updateStatementStatus,
} from "@/lib/db/queries/transactions";
import { parseCSV } from "@/lib/parsers/csv-parser";
import type { ColumnMapping } from "@/lib/parsers/csv-parser";

export async function createBankAccountAction(formData: FormData) {
  const orgId = await getActiveOrgId();
  if (!orgId) return { error: "No organization selected" };

  const bankCode = formData.get("bankCode") as string;
  const accountNumber = formData.get("accountNumber") as string;
  const accountName = (formData.get("accountName") as string) || null;
  const currency = (formData.get("currency") as string) || "THB";

  if (!bankCode || !accountNumber) {
    return { error: "Bank and account number are required" };
  }

  const account = await createBankAccount({
    orgId,
    bankCode,
    accountNumber,
    accountName,
    currency,
  });

  revalidatePath("/bank-accounts");
  return { success: true, accountId: account.id };
}

export async function updateBankAccountAction(
  accountId: string,
  formData: FormData
) {
  const orgId = await getActiveOrgId();
  if (!orgId) return { error: "No organization selected" };

  const bankCode = formData.get("bankCode") as string;
  const accountNumber = formData.get("accountNumber") as string;
  const accountName = (formData.get("accountName") as string) || null;
  const currency = (formData.get("currency") as string) || "THB";

  await updateBankAccount(orgId, accountId, {
    bankCode,
    accountNumber,
    accountName,
    currency,
  });

  revalidatePath("/bank-accounts");
  return { success: true };
}

export async function uploadStatementAction(
  bankAccountId: string,
  csvText: string,
  mapping: ColumnMapping
) {
  const orgId = await getActiveOrgId();
  if (!orgId) return { error: "No organization selected" };

  const result = parseCSV(csvText, mapping);

  if (result.transactions.length === 0) {
    return {
      error: "No transactions found in file",
      parseErrors: result.errors,
    };
  }

  // Create statement record
  const statement = await createStatement({
    orgId,
    bankAccountId,
    periodStart: result.periodStart,
    periodEnd: result.periodEnd,
    openingBalance: result.openingBalance,
    closingBalance: result.closingBalance,
    parserUsed: "csv_generic",
    importStatus: "processing",
  });

  if (!statement) {
    return { error: "Statement for this period already exists" };
  }

  // Import transactions with dedup
  const importResult = await importTransactions(
    orgId,
    bankAccountId,
    statement.id,
    result.transactions
  );

  // Validate running balance
  let balanceWarning: string | null = null;
  if (result.openingBalance && result.closingBalance) {
    const opening = parseFloat(result.openingBalance);
    let runningTotal = opening;
    for (const txn of result.transactions) {
      const amt = parseFloat(txn.amount);
      runningTotal += txn.type === "credit" ? amt : -amt;
    }
    const closing = parseFloat(result.closingBalance);
    if (Math.abs(runningTotal - closing) > 0.01) {
      balanceWarning = `Balance mismatch: expected ${closing.toFixed(2)}, calculated ${runningTotal.toFixed(2)}`;
    }
  }

  await updateStatementStatus(
    statement.id,
    balanceWarning ? "completed_with_warning" : "completed"
  );

  revalidatePath(`/bank-accounts/${bankAccountId}`);
  revalidatePath("/bank-accounts");

  return {
    success: true,
    statementId: statement.id,
    inserted: importResult.inserted,
    skipped: importResult.skipped,
    parseErrors: result.errors,
    balanceWarning,
  };
}
