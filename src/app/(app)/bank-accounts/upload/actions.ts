"use server";

import { revalidatePath } from "next/cache";
import { getActiveOrgId } from "@/lib/utils/org-context";
import {
  getBankAccountsByOrg,
  findBankAccountByNumber,
  createBankAccount,
} from "@/lib/db/queries/bank-accounts";
import {
  findOrCreateStatement,
  importTransactions,
  updateStatementStatus,
  getTransactionsByDateRange,
  getOverlappingStatements,
} from "@/lib/db/queries/transactions";
import { db } from "@/lib/db";
import { knockoutMatch } from "@/lib/parsers/transaction-matcher";
import { validateStatementBalance } from "@/lib/parsers/balance-validation";
import { parseKBankPdf } from "@/lib/parsers/kbank-pdf-parser";
import type { KBankPdfMeta } from "@/lib/parsers/kbank-pdf-parser";
import { detectKBankFormat, parseKBank } from "@/lib/parsers/kbank-parser";
import { parseCSV, detectColumns } from "@/lib/parsers/csv-parser";
import type { ColumnMapping, ParseResult } from "@/lib/parsers/csv-parser";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ParseFileSuccess {
  success: true;
  format: "kbank_pdf" | "kbank_csv" | "generic_csv";
  result: ParseResult;
  meta?: KBankPdfMeta;
  thaiDescriptions?: Record<string, { type: string; details: string }>;
  matchedAccount?: { id: string; accountNumber: string; accountName: string | null; bankCode: string };
  needsColumnMapping?: false;
  columns?: undefined;
}

interface ParseFileNeedsMapping {
  success: true;
  format: "generic_csv";
  needsColumnMapping: true;
  columns: string[];
}

interface ParseFileError {
  success: false;
  error: string;
  parseErrors?: string[];
}

export type ParseFileResult = ParseFileSuccess | ParseFileNeedsMapping | ParseFileError;

// ---------------------------------------------------------------------------
// Step 1: Parse file (no DB writes)
// ---------------------------------------------------------------------------

export async function parseFileAction(
  formData: FormData
): Promise<ParseFileResult> {
  const orgId = await getActiveOrgId();
  if (!orgId) return { success: false, error: "No organization selected" };

  const file = formData.get("file") as File | null;
  if (!file) return { success: false, error: "No file provided" };

  const isPdf = file.name.toLowerCase().endsWith(".pdf") || file.type === "application/pdf";

  if (isPdf) {
    const buffer = await file.arrayBuffer();
    const data = new Uint8Array(buffer);

    let parsed;
    try {
      parsed = await parseKBankPdf(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[parseFileAction] PDF parse error:", message);
      return { success: false, error: `Failed to parse PDF: ${message}` };
    }

    if (parsed.result.transactions.length === 0 && !parsed.meta.accountNumber) {
      return { success: false, error: "PDF does not appear to be a KBank statement" };
    }

    if (parsed.result.transactions.length === 0) {
      return {
        success: false,
        error: "No transactions found in PDF",
        parseErrors: parsed.result.errors,
      };
    }

    // Auto-match bank account
    const matchedAccount = parsed.meta.accountNumber
      ? await findBankAccountByNumber(orgId, "KBANK", parsed.meta.accountNumber)
      : null;

    return {
      success: true,
      format: "kbank_pdf",
      result: parsed.result,
      meta: parsed.meta,
      thaiDescriptions: parsed.thaiDescriptions,
      matchedAccount: matchedAccount
        ? {
            id: matchedAccount.id,
            accountNumber: matchedAccount.accountNumber,
            accountName: matchedAccount.accountName,
            bankCode: matchedAccount.bankCode,
          }
        : undefined,
    };
  }

  // CSV handling
  const csvText = await file.text();

  const kbankFormat = detectKBankFormat(csvText);
  if (kbankFormat) {
    const result = parseKBank(csvText);
    if (result.transactions.length === 0) {
      return {
        success: false,
        error: "No transactions found in CSV",
        parseErrors: result.errors,
      };
    }
    return {
      success: true,
      format: "kbank_csv",
      result,
    };
  }

  // Generic CSV — needs column mapping
  const columns = detectColumns(csvText);
  if (columns.length === 0) {
    return { success: false, error: "Could not detect CSV columns" };
  }

  return {
    success: true,
    format: "generic_csv",
    needsColumnMapping: true,
    columns,
  };
}

// ---------------------------------------------------------------------------
// Step 2: Parse CSV with mapping (for generic CSVs)
// ---------------------------------------------------------------------------

export async function parseWithMappingAction(
  csvText: string,
  mapping: ColumnMapping
): Promise<ParseFileResult> {
  const result = parseCSV(csvText, mapping);
  if (result.transactions.length === 0) {
    return {
      success: false,
      error: "No transactions found with the given column mapping",
      parseErrors: result.errors,
    };
  }
  return {
    success: true,
    format: "generic_csv",
    result,
  };
}

// ---------------------------------------------------------------------------
// Step 3: Check for overlaps (called before import to show preview)
// ---------------------------------------------------------------------------

export interface OverlapInfo {
  hasOverlap: boolean;
  existingTxnCount: number;
  newTxnCount: number;
  matchedCount: number;
  /** The transactions to actually import (after knockout) */
  transactionsToImport: ParseResult["transactions"];
}

export async function checkOverlapAction(
  bankAccountId: string,
  result: ParseResult
): Promise<OverlapInfo> {
  const orgId = await getActiveOrgId();
  if (!orgId) {
    return {
      hasOverlap: false,
      existingTxnCount: 0,
      newTxnCount: result.transactions.length,
      matchedCount: 0,
      transactionsToImport: result.transactions,
    };
  }

  const overlapping = await getOverlappingStatements(
    orgId,
    bankAccountId,
    result.periodStart,
    result.periodEnd
  );

  // Get existing transactions in the overlapping date range
  const existingTxns = overlapping.length > 0
    ? await getTransactionsByDateRange(
        orgId,
        bankAccountId,
        result.periodStart,
        result.periodEnd
      )
    : [];

  // Only report overlap when there are actual existing transactions to compare against.
  // An orphan statement record with no transactions is not a meaningful overlap.
  if (existingTxns.length === 0) {
    return {
      hasOverlap: false,
      existingTxnCount: 0,
      newTxnCount: result.transactions.length,
      matchedCount: 0,
      transactionsToImport: result.transactions,
    };
  }

  // Run knockout matching
  const knockout = knockoutMatch(existingTxns, result.transactions);

  return {
    hasOverlap: true,
    existingTxnCount: existingTxns.length,
    newTxnCount: knockout.newOnly.length,
    matchedCount: knockout.matched.length,
    transactionsToImport: knockout.newOnly,
  };
}

// ---------------------------------------------------------------------------
// Step 4: Confirm import (writes to DB — with smart merge)
// ---------------------------------------------------------------------------

interface ConfirmImportInput {
  bankAccountId: string;
  format: string;
  result: ParseResult;
  /** If provided, only these transactions are imported (post-knockout) */
  transactionsToImport?: ParseResult["transactions"];
}

export async function confirmImportAction(input: ConfirmImportInput) {
  const orgId = await getActiveOrgId();
  if (!orgId) return { error: "No organization selected" };

  const { bankAccountId, format, result } = input;
  const txnsToImport = input.transactionsToImport ?? result.transactions;

  // Validate running balance (pure computation — no DB, so do it outside the transaction)
  let balanceWarning: string | null = null;
  if (!input.transactionsToImport && result.openingBalance && result.closingBalance) {
    balanceWarning = validateStatementBalance(
      result.openingBalance,
      result.closingBalance,
      result.transactions
    );
  }

  // All DB writes in a single transaction — if any step fails, everything rolls back.
  // No orphan statements or partial imports.
  const importResult = await db.transaction(async (tx) => {
    const statement = await findOrCreateStatement({
      orgId,
      bankAccountId,
      periodStart: result.periodStart,
      periodEnd: result.periodEnd,
      openingBalance: result.openingBalance,
      closingBalance: result.closingBalance,
      parserUsed: format,
      importStatus: "processing",
    }, tx);

    if (txnsToImport.length === 0) {
      await updateStatementStatus(orgId, statement.id, "completed", tx);
      return { statementId: statement.id, inserted: 0, skipped: result.transactions.length };
    }

    const { inserted, skipped } = await importTransactions(
      orgId, bankAccountId, statement.id, txnsToImport, tx
    );

    const finalStatus = balanceWarning ? "completed_with_warning" : "completed";
    await updateStatementStatus(orgId, statement.id, finalStatus, tx);

    const totalSkipped = (input.transactionsToImport
      ? result.transactions.length - txnsToImport.length
      : 0) + skipped;

    return { statementId: statement.id, inserted, skipped: totalSkipped };
  });

  revalidatePath("/bank-accounts");
  revalidatePath(`/bank-accounts/${bankAccountId}`);

  return {
    success: true,
    ...importResult,
    parseErrors: result.errors,
    balanceWarning,
  };
}

// ---------------------------------------------------------------------------
// Step 4: Create account + import in one step
// ---------------------------------------------------------------------------

interface CreateAccountAndImportInput {
  bankCode: string;
  accountNumber: string;
  accountName?: string;
  format: string;
  result: ParseResult;
}

export async function createAccountAndImportAction(
  input: CreateAccountAndImportInput
) {
  const orgId = await getActiveOrgId();
  if (!orgId) return { error: "No organization selected" };

  const account = await createBankAccount({
    orgId,
    bankCode: input.bankCode,
    accountNumber: input.accountNumber,
    accountName: input.accountName,
  });

  return confirmImportAction({
    bankAccountId: account.id,
    format: input.format,
    result: input.result,
  });
}

// ---------------------------------------------------------------------------
// Helper: Get accounts for picker
// ---------------------------------------------------------------------------

export async function getAccountsForMatchAction() {
  const orgId = await getActiveOrgId();
  if (!orgId) return [];

  const accounts = await getBankAccountsByOrg(orgId);
  return accounts.map((a) => ({
    id: a.id,
    bankCode: a.bankCode,
    accountNumber: a.accountNumber,
    accountName: a.accountName,
  }));
}

