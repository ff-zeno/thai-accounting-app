import type { ParsedTransaction, ParseResult } from "./csv-parser";
import {
  THAI_DESCRIPTION_MAP,
  THAI_CHANNEL_MAP,
  generateRef,
  parseKBankStatementDate,
} from "./kbank-parser";

// ---------------------------------------------------------------------------
// KBank PDF Statement (Thai, from K-BIZ "ขอ Statement" → PDF)
// ---------------------------------------------------------------------------
// Produced by the "KBPDF" generator. Each page has a header block, then
// transaction rows as raw text lines extracted via pdf-parse.
//
// Transaction line format (single-line):
//   DD-MM-YY HH:mm CHANNEL\tBALANCE DETAILS\tTHAI_TYPE AMOUNT
// Multi-line wraps details; type+amount is always on the last line.
// Carry-forward lines (ยอดยกมา) have no time/channel.

// ---------------------------------------------------------------------------
// PDF-specific Thai description map (extends CSV map)
// ---------------------------------------------------------------------------

const PDF_THAI_TYPE_MAP: Record<string, { english: string; type: "debit" | "credit" }> = {
  รับโอนเงิน: { english: "Transfer Deposit", type: "credit" },
  โอนเงิน: { english: "Transfer Withdrawal", type: "debit" },
  ชำระเงิน: { english: "Payment", type: "debit" },
  "หักเงินธุรกรรม ตปท.": { english: "International Transaction Debit", type: "debit" },
  ฝากเงินสด: { english: "Cash Deposit", type: "credit" },
  ถอนเงินสด: { english: "Cash Withdrawal", type: "debit" },
  "รับชำระเงิน": { english: "Payment Received", type: "credit" },
  "หักค่าธรรมเนียม": { english: "Fee Deduction", type: "debit" },
  "ดอกเบี้ยรับ": { english: "Interest Income", type: "credit" },
};

// All known Thai type keywords for regex matching (longest first to avoid partial matches)
const THAI_TYPE_KEYS = Object.keys(PDF_THAI_TYPE_MAP).sort((a, b) => b.length - a.length);
const THAI_TYPE_PATTERN = new RegExp(
  `(${THAI_TYPE_KEYS.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\s+([\\d,]+\\.\\d{2})\\s*$`
);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface KBankPdfMeta {
  bankCode: string;
  accountNumber: string;
  accountName: string;
  branch: string;
  period: { start: string; end: string };
  totals: {
    withdrawalCount: number;
    depositCount: number;
    withdrawalAmount: string;
    depositAmount: string;
    closingBalance: string;
  };
}

export interface KBankPdfParseResult {
  result: ParseResult;
  meta: KBankPdfMeta;
  thaiDescriptions: Record<string, { type: string; details: string }>;
}

// ---------------------------------------------------------------------------
// Header / Summary extraction
// ---------------------------------------------------------------------------

function formatAmount(n: number): string {
  return n.toFixed(2);
}

function extractHeader(pageText: string): Partial<KBankPdfMeta> {
  const meta: Partial<KBankPdfMeta> = { bankCode: "KBANK" };

  // Account number: 210-8-48789-8
  const acctMatch = pageText.match(/(\d{3}-\d-\d{5}-\d)/);
  if (acctMatch) meta.accountNumber = acctMatch[1];

  // Account name: line starting with "ชื่อบัญชี" or containing บจก./บริษัท
  const nameMatch = pageText.match(/ชื่อบัญชี\s+(.+)/);
  if (nameMatch) meta.accountName = nameMatch[1].trim();

  // Branch: สาขา...
  const branchMatch = pageText.match(/^(สาขา.+)$/m);
  if (branchMatch) meta.branch = branchMatch[1].trim();

  // Period: DD/MM/YYYY - DD/MM/YYYY
  const periodMatch = pageText.match(
    /(\d{2}\/\d{2}\/\d{4})\s*-\s*(\d{2}\/\d{2}\/\d{4})/
  );
  if (periodMatch) {
    meta.period = {
      start: convertThaiDate(periodMatch[1]),
      end: convertThaiDate(periodMatch[2]),
    };
  }

  return meta;
}

function extractSummary(
  pageText: string
): KBankPdfMeta["totals"] | null {
  const withdrawCountMatch = pageText.match(/รวมถอนเงิน\s+(\d+)\s+รายการ/);
  const depositCountMatch = pageText.match(/รวมฝากเงิน\s+(\d+)\s+รายการ/);

  if (!withdrawCountMatch && !depositCountMatch) return null;

  // The summary section has amounts on separate lines due to PDF column extraction.
  // Layout order in extracted text:
  //   withdrawalAmount
  //   closingBalance (ยอดยกไป)
  //   "รวมถอนเงิน N รายการ"
  //   "รวมฝากเงิน N รายการ"
  //   "ยอดยกไป"
  //   depositAmount

  // Find the summary block: amounts between header labels and table header
  const summaryRegion = pageText.split(/หน้าที่\s*\(PAGE\/OF\)/)[0] ?? "";

  let closingBalance = "0.00";
  const withdrawalCount = parseInt(withdrawCountMatch?.[1] ?? "0");
  const depositCount = parseInt(depositCountMatch?.[1] ?? "0");

  // Find amounts in the summary region (after period labels, before PAGE/OF)
  const afterLabels = summaryRegion.split(/รอบระหว่างวันที่/)[1] ?? summaryRegion;
  const summaryAmounts = [...afterLabels.matchAll(/([\d,]+\.\d{2})/g)].map(
    (m) => m[1].replace(/,/g, "")
  );

  // Typically: [withdrawalAmount, closingBalance, depositAmount]
  let withdrawalAmount = "0.00";
  let depositAmount = "0.00";

  if (summaryAmounts.length >= 3) {
    withdrawalAmount = summaryAmounts[0];
    closingBalance = summaryAmounts[1];
    depositAmount = summaryAmounts[2];
  }

  return {
    withdrawalCount,
    depositCount,
    withdrawalAmount,
    depositAmount,
    closingBalance,
  };
}

/** Convert DD/MM/YYYY → YYYY-MM-DD */
function convertThaiDate(raw: string): string {
  const match = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return raw;
  const [, day, month, year] = match;
  return `${year}-${month}-${day}`;
}

// ---------------------------------------------------------------------------
// Transaction line parsing
// ---------------------------------------------------------------------------

const DATE_LINE_RE = /^(\d{2}-\d{2}-\d{2})\s/;
const CARRY_FWD_RE = /ยอดยกมา/;
const FOOTER_RE = /^KBPDF\b|^ออกโดย K BIZ|^สอบถามข้อมูล/;
const TABLE_HEADER_RE = /^วันที่\s+เวลา|^\(บาท\)\s+รายละเอียด/;

interface RawTxn {
  date: string;
  time: string;
  channel: string;
  balance: string;
  details: string;
  thaiType: string;
  amount: string;
  txnType: "debit" | "credit";
}

function parseTransactionLines(lines: string[]): {
  transactions: RawTxn[];
  openingBalance: string | null;
} {
  const transactions: RawTxn[] = [];
  let openingBalance: string | null = null;

  // Find where transactions start (after table header)
  let startIdx = 0;
  for (let i = 0; i < lines.length; i++) {
    if (TABLE_HEADER_RE.test(lines[i]) || lines[i].includes("ยอดคงเหลือ")) {
      startIdx = i + 1;
    }
  }

  // Group lines by date-start
  const groups: string[][] = [];
  let current: string[] = [];

  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    if (FOOTER_RE.test(line)) break;

    if (DATE_LINE_RE.test(line)) {
      if (current.length > 0) groups.push(current);
      current = [line];
    } else if (current.length > 0) {
      current.push(line);
    }
  }
  if (current.length > 0) groups.push(current);

  for (const group of groups) {
    const joined = group.join("\n");

    // Skip carry-forward lines (ยอดยกมา)
    if (CARRY_FWD_RE.test(joined)) {
      // Extract opening balance from carry-forward
      const balMatch = joined.match(/^(\d{2}-\d{2}-\d{2})\s+([\d,]+\.\d{2})/);
      if (balMatch) {
        openingBalance = balMatch[2].replace(/,/g, "");
      }
      continue;
    }

    const txn = parseTransactionGroup(group);
    if (txn) transactions.push(txn);
  }

  return { transactions, openingBalance };
}

function parseTransactionGroup(lines: string[]): RawTxn | null {
  const firstLine = lines[0];

  // Extract date, time, channel from first line
  // Format: DD-MM-YY HH:mm CHANNEL\tBALANCE ...
  const headerMatch = firstLine.match(
    /^(\d{2}-\d{2}-\d{2})\s+(\d{2}:\d{2})\s+(.+?)\t(.+)$/
  );
  if (!headerMatch) return null;

  const [, dateRaw, time, channel, afterTab] = headerMatch;
  const date = parseKBankStatementDate(dateRaw);

  // After first tab: BALANCE DETAILS\tTYPE AMOUNT (single line)
  // Or: BALANCE DETAILS (first line) + continuation + TYPE AMOUNT (last line)
  let fullText: string;
  if (lines.length === 1) {
    fullText = afterTab;
  } else {
    fullText = afterTab + "\n" + lines.slice(1).join("\n");
  }

  // Extract balance (first number in the text after tab)
  const balanceMatch = fullText.match(/^([\d,]+\.\d{2})/);
  if (!balanceMatch) return null;
  const balance = balanceMatch[1].replace(/,/g, "");

  // Extract Thai type + amount from end of text
  const typeMatch = fullText.match(THAI_TYPE_PATTERN);
  if (!typeMatch) return null;

  const thaiType = typeMatch[1];
  const amount = typeMatch[2].replace(/,/g, "");
  const typeInfo = PDF_THAI_TYPE_MAP[thaiType];
  const txnType = typeInfo?.type ?? "debit";

  // Extract details: everything between balance and the type+amount
  // Remove balance from start and type+amount from end
  const details = fullText
    .replace(/^[\d,]+\.\d{2}\s*/, "") // remove leading balance
    .replace(THAI_TYPE_PATTERN, "")     // remove trailing type+amount
    .replace(/\t/g, " ")               // normalize tabs
    .replace(/\n/g, " ")               // normalize newlines
    .trim();

  return {
    date,
    time,
    channel: channel.trim(),
    balance,
    details,
    thaiType,
    amount,
    txnType,
  };
}

// ---------------------------------------------------------------------------
// Translation helpers
// ---------------------------------------------------------------------------

function translateThaiType(thaiType: string): string {
  // Check PDF-specific map first, then fall back to CSV description map
  const pdfEntry = PDF_THAI_TYPE_MAP[thaiType];
  if (pdfEntry) return pdfEntry.english;

  const csvTranslation = THAI_DESCRIPTION_MAP[thaiType];
  if (csvTranslation) return csvTranslation;

  return thaiType;
}

function translateChannelName(channel: string): string {
  const mapped = THAI_CHANNEL_MAP[channel];
  if (mapped) return mapped;
  return channel;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Detect if text is from a KBank PDF statement */
export function detectKBankPdf(text: string): boolean {
  const hasKBPDF = text.includes("KBPDF");
  const hasKBIZ = text.includes("ออกโดย K BIZ");
  const hasAccountPattern = /\d{3}-\d-\d{5}-\d/.test(text);
  return (hasKBPDF || hasKBIZ) && hasAccountPattern;
}

/**
 * Pure synchronous parser — testable with inline page strings.
 * @param pages Array of page text strings (one per PDF page)
 */
export function parseKBankPdfText(pages: string[]): KBankPdfParseResult {
  const errors: string[] = [];
  const allTransactions: ParsedTransaction[] = [];
  const thaiDescriptions: Record<string, { type: string; details: string }> = {};

  // Extract header from first page
  const headerMeta = extractHeader(pages[0] ?? "");
  const summary = extractSummary(pages[0] ?? "");

  // Parse transactions from all pages
  let firstOpeningBalance: string | null = null;
  let lastBalance: string | null = null;

  for (let pageIdx = 0; pageIdx < pages.length; pageIdx++) {
    const pageText = pages[pageIdx];
    const lines = pageText.split("\n");
    const { transactions, openingBalance } = parseTransactionLines(lines);

    // Use the very first page's carry-forward as the statement opening balance
    if (pageIdx === 0 && openingBalance !== null) {
      firstOpeningBalance = openingBalance;
    }

    for (const raw of transactions) {
      const englishType = translateThaiType(raw.thaiType);
      const englishChannel = translateChannelName(raw.channel);

      // Build description: "English Type — details" or just "English Type"
      const description = raw.details
        ? `${englishType} — ${raw.details}`
        : englishType;

      const externalRef = generateRef(raw.date, raw.time, raw.thaiType, raw.amount);

      const txn: ParsedTransaction = {
        date: raw.date,
        description,
        amount: raw.amount,
        type: raw.txnType,
        runningBalance: raw.balance,
        channel: englishChannel || undefined,
        counterparty: raw.details || undefined,
        externalRef,
      };

      allTransactions.push(txn);

      // Store Thai descriptions keyed by externalRef
      thaiDescriptions[externalRef] = {
        type: raw.thaiType,
        details: raw.details,
      };

      lastBalance = raw.balance;
    }
  }

  // Determine period from parsed dates
  const dates = allTransactions.map((t) => t.date).sort();
  const periodStart = headerMeta.period?.start ?? dates[0] ?? "";
  const periodEnd = headerMeta.period?.end ?? dates[dates.length - 1] ?? "";

  // Determine opening/closing balance
  const openingBalance = firstOpeningBalance ?? undefined;
  const closingBalance = summary?.closingBalance ?? lastBalance ?? undefined;

  // Validate totals against summary if available
  if (summary) {
    const expectedTotal = summary.withdrawalCount + summary.depositCount;
    if (allTransactions.length !== expectedTotal) {
      errors.push(
        `Transaction count mismatch: parsed ${allTransactions.length}, expected ${expectedTotal} (${summary.withdrawalCount} withdrawals + ${summary.depositCount} deposits)`
      );
    }
  }

  const result: ParseResult = {
    transactions: allTransactions,
    periodStart,
    periodEnd,
    openingBalance,
    closingBalance,
    errors,
  };

  const meta: KBankPdfMeta = {
    bankCode: headerMeta.bankCode ?? "KBANK",
    accountNumber: headerMeta.accountNumber ?? "",
    accountName: headerMeta.accountName ?? "",
    branch: headerMeta.branch ?? "",
    period: headerMeta.period ?? { start: periodStart, end: periodEnd },
    totals: summary ?? {
      withdrawalCount: allTransactions.filter((t) => t.type === "debit").length,
      depositCount: allTransactions.filter((t) => t.type === "credit").length,
      withdrawalAmount: formatAmount(
        allTransactions
          .filter((t) => t.type === "debit")
          .reduce((sum, t) => sum + parseFloat(t.amount), 0)
      ),
      depositAmount: formatAmount(
        allTransactions
          .filter((t) => t.type === "credit")
          .reduce((sum, t) => sum + parseFloat(t.amount), 0)
      ),
      closingBalance: closingBalance ?? "0.00",
    },
  };

  return { result, meta, thaiDescriptions };
}

/**
 * Async wrapper — reads PDF binary data via pdf-parse, then delegates to parseKBankPdfText.
 */
export async function parseKBankPdf(
  data: Uint8Array
): Promise<KBankPdfParseResult> {
  const { PDFParse } = await import("pdf-parse");
  const pdf = new PDFParse({ data });
  const textResult = await pdf.getText();
  const pages = textResult.pages.map(
    (p: { text: string; num: number }) => p.text
  );
  await pdf.destroy();
  return parseKBankPdfText(pages);
}
