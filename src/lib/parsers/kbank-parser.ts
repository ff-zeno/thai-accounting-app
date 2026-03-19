import Papa from "papaparse";
import { createHash } from "crypto";
import type { ParsedTransaction, ParseResult } from "./csv-parser";

// ---------------------------------------------------------------------------
// KBank Statement CSV (English, 13 columns with padding)
// Downloaded via K-BIZ "Request Statement" → English
// ---------------------------------------------------------------------------
// Column layout (0-indexed):
//   0: empty | 1: Date (DD-MM-YY) | 2: Time (HH:mm) | 3: Description
//   4: Withdrawal | 5: empty | 6: Deposit | 7: empty | 8: Balance
//   9: empty | 10: Channel | 11: empty | 12: Details

interface KBankStatementMeta {
  accountNumber: string | null;
  accountName: string | null;
  period: string | null;
}

export function parseKBankAmount(raw: string | undefined): string {
  if (!raw) return "0.00";
  const cleaned = raw.replace(/[",\s]/g, "");
  if (cleaned === "" || cleaned === "-") return "0.00";

  // Strip leading minus — amounts are always absolute (sign determined by column)
  const absolute = cleaned.startsWith("-") ? cleaned.slice(1) : cleaned;

  // Extract the leading decimal number (CSV double-quoting can leave trailing garbage)
  const match = absolute.match(/^(\d+(?:\.\d+)?)/);
  if (!match) return "0.00";
  const number = match[1];

  // Ensure exactly 2 decimal places
  const dotIdx = number.indexOf(".");
  if (dotIdx === -1) return number + ".00";
  const decimals = number.length - dotIdx - 1;
  if (decimals === 2) return number;
  if (decimals < 2) return number + "0".repeat(2 - decimals);
  // More than 2 decimals: truncate to 2
  return number.slice(0, dotIdx + 3);
}

export function parseKBankStatementDate(raw: string): string {
  // DD-MM-YY → YYYY-MM-DD
  const match = raw.trim().match(/^(\d{2})-(\d{2})-(\d{2})$/);
  if (match) {
    const [, day, month, year] = match;
    const fullYear = 2000 + parseInt(year);
    return `${fullYear}-${month}-${day}`;
  }
  return raw.trim();
}

export function formatKBankAccountNumber(raw: string): string {
  // 1703269954 → 170-3-26995-4
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits[3]}-${digits.slice(4, 9)}-${digits[9]}`;
  }
  return raw;
}

function extractStatementMeta(lines: string[]): KBankStatementMeta {
  let accountNumber: string | null = null;
  let accountName: string | null = null;
  let period: string | null = null;

  for (const line of lines.slice(0, 15)) {
    const accountMatch = line.match(/(\d{3}-\d-\d{5}-\d)/);
    if (accountMatch) accountNumber = accountMatch[1];

    const periodMatch = line.match(
      /(\d{2}\/\d{2}\/\d{4}\s*-\s*\d{2}\/\d{2}\/\d{4})/
    );
    if (periodMatch) period = periodMatch[1];

    // Account name is typically after account number line
    if (!accountName && (line.includes("CO.,LTD") || line.includes("Co.,Ltd"))) {
      accountName = line.replace(/"/g, "").trim();
    }
  }

  return { accountNumber, accountName, period };
}

export function generateRef(
  date: string,
  time: string,
  description: string,
  amount: string
): string {
  const data = `${date}|${time}|${description}|${amount}`;
  return createHash("sha256").update(data).digest("hex").slice(0, 16);
}

export function parseKBankStatement(csvText: string): ParseResult {
  const errors: string[] = [];
  const transactions: ParsedTransaction[] = [];
  const lines = csvText.split("\n");

  // Metadata available for future use (account name display, etc.)
  extractStatementMeta(lines);

  // Find data start: line containing "Beginning Balance"
  let dataStartIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes("Beginning Balance")) {
      dataStartIdx = i;
      break;
    }
  }

  if (dataStartIdx === -1) {
    return {
      transactions: [],
      periodStart: "",
      periodEnd: "",
      errors: ["Could not find 'Beginning Balance' marker in KBank statement"],
    };
  }

  const dataSection = lines.slice(dataStartIdx).join("\n");
  const parsed = Papa.parse(dataSection, {
    header: false,
    skipEmptyLines: true,
  });

  const rows = parsed.data as string[][];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (row.length < 9) continue;

    // Skip the Beginning Balance row itself
    if (row.some((cell) => cell.includes("Beginning Balance"))) continue;
    // Skip Ending Balance row
    if (row.some((cell) => cell.includes("Ending Balance"))) continue;

    const dateRaw = row[1]?.trim();
    if (!dateRaw || !/^\d{2}-\d{2}-\d{2}$/.test(dateRaw)) continue;

    const date = parseKBankStatementDate(dateRaw);
    const time = row[2]?.trim() ?? "";
    const description = row[3]?.trim() ?? "";
    const withdrawal = parseKBankAmount(row[4]);
    const deposit = parseKBankAmount(row[6]);
    const balance = parseKBankAmount(row[8]);
    const channel = row[10]?.trim() ?? "";
    const details = row[12]?.trim() ?? "";

    const isDebit = withdrawal !== "0.00";
    const amount = isDebit ? withdrawal : deposit;

    if (amount === "0.00") continue;

    const txn: ParsedTransaction = {
      date,
      description: details ? `${description} — ${details}` : description,
      amount,
      type: isDebit ? "debit" : "credit",
      runningBalance: balance !== "0.00" ? balance : undefined,
      referenceNo: undefined,
      channel: channel || undefined,
      counterparty: details || undefined,
      externalRef: generateRef(date, time, description, amount),
    };

    transactions.push(txn);
  }

  const dates = transactions.map((t) => t.date).sort();
  const periodStart = dates[0] ?? "";
  const periodEnd = dates[dates.length - 1] ?? "";

  // Extract opening/closing balance from Beginning/Ending Balance rows
  let openingBalance: string | undefined;
  let closingBalance: string | undefined;

  for (const row of rows) {
    if (row.some((c) => c.includes("Beginning Balance"))) {
      const bal = parseKBankAmount(row[8]);
      if (bal !== "0.00") openingBalance = bal;
    }
    if (row.some((c) => c.includes("Ending Balance"))) {
      const bal = parseKBankAmount(row[8]);
      if (bal !== "0.00") closingBalance = bal;
    }
  }

  return {
    transactions,
    periodStart,
    periodEnd,
    openingBalance,
    closingBalance,
    errors,
  };
}

// ---------------------------------------------------------------------------
// KBank Intraday CSV (Thai, 6 columns)
// Downloaded via K-BIZ account details → Search → Download
// ---------------------------------------------------------------------------
// Column layout:
//   0: Transaction Date (YYYY-MM-DD HH:mm:ss)
//   1: Transaction (Thai)
//   2: Withdrawal (Baht) — may be negative
//   3: Deposit (Baht)
//   4: Account/PromptPay or Biller
//   5: Channel

export const THAI_DESCRIPTION_MAP: Record<string, string> = {
  รับโอนเงิน: "Transfer Deposit",
  โอนเงิน: "Transfer Withdrawal",
  ชำระเงิน: "Transfer Withdrawal",
  ฝากเงินสด: "Cash Deposit",
  ถอนเงินสด: "Cash Withdrawal",
  "รับเงินธุรกรรม ตปท.": "International Transaction Received",
  "รับชำระเงิน: FullPay/Install/Redemp":
    "Payment Received: FullPay/Install/Redemp",
  "รับชำระเงิน: Alipay/WeChat": "Payment Received: Alipay/WeChat",
  "รับเงินจากการขายด้วย Alipay/WeChat": "Payment Received: Alipay/WeChat",
};

export const THAI_CHANNEL_MAP: Record<string, string> = {
  "Internet/Mobile ต่างธนาคาร": "Internet/Mobile Across Banks",
  ธุรกรรมต่างประเทศ: "International Transaction",
  "โอนเข้า/หักบัญชีอัตโนมัติ": "Automatic Transfer",
};

export function translateDescription(thai: string): string {
  const trimmed = thai.trim();
  return THAI_DESCRIPTION_MAP[trimmed] ?? trimmed;
}

export function translateChannel(thai: string): string {
  const trimmed = thai.trim();
  return THAI_CHANNEL_MAP[trimmed] ?? trimmed;
}

export function parseKBankIntraday(csvText: string): ParseResult {
  const errors: string[] = [];
  const transactions: ParsedTransaction[] = [];
  const lines = csvText.split("\n");

  // Extract account number from header (available for future use)
  for (const line of lines.slice(0, 5)) {
    if (line.match(/Account\s*number\s*:\s*(\d+)/i)) break;
  }

  // Find header row (contains "Transaction Date")
  let headerIdx = -1;
  for (let i = 0; i < Math.min(10, lines.length); i++) {
    if (lines[i].includes("Transaction Date")) {
      headerIdx = i;
      break;
    }
  }

  if (headerIdx === -1) {
    return {
      transactions: [],
      periodStart: "",
      periodEnd: "",
      errors: [
        "Could not find header row in KBank intraday CSV. Expected 'Transaction Date' header.",
      ],
    };
  }

  const dataSection = lines.slice(headerIdx + 1).join("\n");
  const parsed = Papa.parse(dataSection, {
    header: false,
    skipEmptyLines: true,
  });

  const rows = parsed.data as string[][];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (row.length < 4) continue;

    const datetimeRaw = row[0]?.trim();
    if (!datetimeRaw) continue;

    // Parse YYYY-MM-DD HH:mm:ss
    const dtMatch = datetimeRaw.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})/);
    if (!dtMatch) {
      errors.push(`Row ${i + 1}: invalid datetime format: ${datetimeRaw}`);
      continue;
    }

    const date = dtMatch[1];
    const time = dtMatch[2];
    const thaiDesc = row[1]?.trim() ?? "";
    const description = translateDescription(thaiDesc);
    const withdrawal = parseKBankAmount(row[2]);
    const deposit = parseKBankAmount(row[3]);
    const counterpartyRaw = row[4]?.trim() ?? "";
    const channelRaw = row[5]?.trim() ?? "";

    const isDebit = withdrawal !== "0.00";
    const amount = isDebit ? withdrawal : deposit;

    if (amount === "0.00") continue;

    const txn: ParsedTransaction = {
      date,
      description,
      amount,
      type: isDebit ? "debit" : "credit",
      channel: translateChannel(channelRaw) || undefined,
      counterparty: counterpartyRaw || undefined,
      externalRef: generateRef(date, time, description, amount),
    };

    transactions.push(txn);
  }

  const dates = transactions.map((t) => t.date).sort();

  return {
    transactions,
    periodStart: dates[0] ?? "",
    periodEnd: dates[dates.length - 1] ?? "",
    errors,
  };
}

/** Auto-detect which KBank format a CSV file is */
export function detectKBankFormat(
  csvText: string
): "statement" | "intraday" | null {
  const head = csvText.slice(0, 500);
  if (head.includes("Beginning Balance") || head.includes("Statement")) {
    return "statement";
  }
  if (head.includes("Transaction Date")) {
    return "intraday";
  }
  return null;
}

/** Unified KBank parser — auto-detects format */
export function parseKBank(csvText: string): ParseResult {
  const format = detectKBankFormat(csvText);
  if (format === "statement") return parseKBankStatement(csvText);
  if (format === "intraday") return parseKBankIntraday(csvText);
  return {
    transactions: [],
    periodStart: "",
    periodEnd: "",
    errors: [
      "Could not detect KBank CSV format. Expected Statement or Intraday format.",
    ],
  };
}
