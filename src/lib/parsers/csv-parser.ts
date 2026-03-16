import Papa from "papaparse";
import { createHash } from "crypto";

export interface ParsedTransaction {
  date: string;
  description: string;
  amount: string;
  type: "debit" | "credit";
  runningBalance?: string;
  referenceNo?: string;
  channel?: string;
  counterparty?: string;
  externalRef: string;
}

export interface ColumnMapping {
  date: string;
  description?: string;
  amount: string;
  type?: string; // column name for debit/credit type
  debitAmount?: string; // separate debit column
  creditAmount?: string; // separate credit column
  runningBalance?: string;
  referenceNo?: string;
  channel?: string;
  counterparty?: string;
}

export interface ParseResult {
  transactions: ParsedTransaction[];
  periodStart: string;
  periodEnd: string;
  openingBalance?: string;
  closingBalance?: string;
  errors: string[];
}

function generateExternalRef(row: {
  date: string;
  description?: string;
  amount: string;
  runningBalance?: string;
  referenceNo?: string;
}): string {
  if (row.referenceNo) return row.referenceNo;
  const data = `${row.date}|${row.description ?? ""}|${row.amount}|${row.runningBalance ?? ""}`;
  return createHash("sha256").update(data).digest("hex").slice(0, 16);
}

function normalizeAmount(value: string): string {
  // Remove commas and whitespace, handle parentheses for negatives
  let cleaned = value.replace(/,/g, "").replace(/\s/g, "");
  if (cleaned.startsWith("(") && cleaned.endsWith(")")) {
    cleaned = "-" + cleaned.slice(1, -1);
  }
  return cleaned;
}

function normalizeDate(value: string): string {
  // Try common formats: DD/MM/YYYY, MM/DD/YYYY, YYYY-MM-DD
  const trimmed = value.trim();

  // Already ISO format
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

  // DD/MM/YYYY (Thai convention)
  const ddmmyyyy = trimmed.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (ddmmyyyy) {
    const [, day, month, year] = ddmmyyyy;
    // If year > 2500, it's Buddhist Era
    const gregYear =
      parseInt(year) > 2500 ? parseInt(year) - 543 : parseInt(year);
    return `${gregYear}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  return trimmed;
}

export function parseCSV(
  csvText: string,
  mapping: ColumnMapping
): ParseResult {
  const errors: string[] = [];
  const transactions: ParsedTransaction[] = [];

  const parsed = Papa.parse(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h: string) => h.trim(),
  });

  if (parsed.errors.length > 0) {
    for (const err of parsed.errors) {
      errors.push(`Row ${err.row}: ${err.message}`);
    }
  }

  const rows = parsed.data as Record<string, string>[];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];

    const dateRaw = row[mapping.date];
    if (!dateRaw) {
      errors.push(`Row ${i + 1}: missing date`);
      continue;
    }

    const date = normalizeDate(dateRaw);
    const description = mapping.description ? row[mapping.description] ?? "" : "";

    let amount: string;
    let type: "debit" | "credit";

    if (mapping.debitAmount && mapping.creditAmount) {
      // Separate debit/credit columns
      const debit = row[mapping.debitAmount]?.trim();
      const credit = row[mapping.creditAmount]?.trim();
      if (debit && debit !== "0" && debit !== "0.00" && debit !== "") {
        amount = normalizeAmount(debit);
        type = "debit";
      } else if (credit && credit !== "0" && credit !== "0.00" && credit !== "") {
        amount = normalizeAmount(credit);
        type = "credit";
      } else {
        errors.push(`Row ${i + 1}: no debit or credit amount`);
        continue;
      }
    } else {
      // Single amount column
      const rawAmount = row[mapping.amount];
      if (!rawAmount) {
        errors.push(`Row ${i + 1}: missing amount`);
        continue;
      }
      amount = normalizeAmount(rawAmount);

      if (mapping.type) {
        const typeVal = row[mapping.type]?.toLowerCase().trim();
        type = typeVal === "credit" || typeVal === "cr" ? "credit" : "debit";
      } else {
        // Infer from sign
        type = amount.startsWith("-") ? "debit" : "credit";
        if (amount.startsWith("-")) amount = amount.slice(1);
      }
    }

    const runningBalance = mapping.runningBalance
      ? normalizeAmount(row[mapping.runningBalance] ?? "")
      : undefined;
    const referenceNo = mapping.referenceNo
      ? row[mapping.referenceNo]?.trim()
      : undefined;
    const channel = mapping.channel ? row[mapping.channel]?.trim() : undefined;
    const counterparty = mapping.counterparty
      ? row[mapping.counterparty]?.trim()
      : undefined;

    const txn: ParsedTransaction = {
      date,
      description,
      amount,
      type,
      runningBalance: runningBalance || undefined,
      referenceNo: referenceNo || undefined,
      channel: channel || undefined,
      counterparty: counterparty || undefined,
      externalRef: generateExternalRef({
        date,
        description,
        amount,
        runningBalance,
        referenceNo,
      }),
    };

    transactions.push(txn);
  }

  // Determine period from transaction dates
  const dates = transactions.map((t) => t.date).sort();
  const periodStart = dates[0] ?? "";
  const periodEnd = dates[dates.length - 1] ?? "";

  // Opening/closing from first/last running balances
  const firstWithBalance = transactions.find((t) => t.runningBalance);
  const lastWithBalance = [...transactions].reverse().find((t) => t.runningBalance);

  return {
    transactions,
    periodStart,
    periodEnd,
    openingBalance: firstWithBalance?.runningBalance,
    closingBalance: lastWithBalance?.runningBalance,
    errors,
  };
}

/** Detect column headers from a CSV and return them for mapping UI */
export function detectColumns(csvText: string): string[] {
  const parsed = Papa.parse(csvText, {
    header: true,
    preview: 1,
  });
  return parsed.meta.fields ?? [];
}
