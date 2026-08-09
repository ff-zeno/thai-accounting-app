import Papa from "papaparse";

import { normalizeAmount, normalizeDate } from "@/lib/parsers/csv-parser";
import { fromSatang, toSatang } from "@/lib/utils/money";

/**
 * A merchant settlement row as the processor reports it.
 *
 * `netPayout` is what the bank deposit should equal on the nose — the fee
 * haircut is already resolved inside the row, so payout matching compares an
 * exact figure rather than tolerating a 2-3% MDR difference.
 *
 * `grossAmount` is the VAT base. Never `netPayout`. See the docblock on
 * `processorSettlements` in src/lib/db/schema.ts.
 */
export interface ParsedSettlement {
  externalId: string;
  periodStart?: string;
  periodEnd?: string;
  grossAmount: string;
  feeAmount: string;
  feeVatAmount?: string;
  netPayout: string;
}

export interface SettlementColumnMapping {
  externalId: string;
  grossAmount: string;
  feeAmount: string;
  netPayout: string;
  feeVatAmount?: string;
  periodStart?: string;
  periodEnd?: string;
}

export interface SettlementRowError {
  /** 1-based row number as the owner sees it in a spreadsheet; 0 = whole file. */
  row: number;
  message: string;
}

export interface SettlementParseResult {
  settlements: ParsedSettlement[];
  errors: SettlementRowError[];
}

/** Amount columns are required to be present and parseable; fee VAT is optional. */
const AMOUNT_FIELDS = ["grossAmount", "feeAmount", "netPayout"] as const;

function readAmount(
  row: Record<string, string>,
  column: string | undefined
): { ok: true; value: string | undefined } | { ok: false; raw: string } {
  if (!column) return { ok: true, value: undefined };
  const raw = row[column];
  if (raw == null || raw.trim() === "") return { ok: true, value: undefined };
  const normalized = normalizeAmount(raw);
  if (toSatang(normalized) === null) return { ok: false, raw: raw.trim() };
  return { ok: true, value: normalized };
}

/**
 * Parse a settlement CSV under an owner-supplied column mapping.
 *
 * Every row is checked against `gross - fee - feeVat = net` in integer satang
 * before it is accepted. A row that fails is rejected with the discrepancy
 * shown rather than stored: a settlement whose own arithmetic does not close
 * cannot be trusted to explain a bank deposit, and storing it would put a
 * wrong number in front of the owner with no signal that it is wrong.
 */
export function parseSettlementCSV(
  csvText: string,
  mapping: SettlementColumnMapping
): SettlementParseResult {
  const errors: SettlementRowError[] = [];
  const settlements: ParsedSettlement[] = [];

  const parsed = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h: string) => h.trim(),
  });

  // Papa reports row-level problems with a row index and file-level ones
  // (undetectable delimiter, for instance) without. Keep both, but do not
  // attribute a file-level complaint to row 1 — that sends the owner looking
  // at a row that is fine.
  for (const err of parsed.errors) {
    errors.push({
      row: err.row == null ? 0 : err.row + 1,
      message: err.message,
    });
  }

  const rows = parsed.data;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNumber = i + 1;

    const externalId = row[mapping.externalId]?.trim();
    if (!externalId) {
      errors.push({ row: rowNumber, message: "missing settlement ID" });
      continue;
    }

    const amounts: Partial<Record<(typeof AMOUNT_FIELDS)[number], string>> = {};
    let amountFailed = false;

    for (const field of AMOUNT_FIELDS) {
      const result = readAmount(row, mapping[field]);
      if (!result.ok) {
        errors.push({
          row: rowNumber,
          message: `${externalId}: ${field} is not a valid amount ("${result.raw}")`,
        });
        amountFailed = true;
        continue;
      }
      if (result.value === undefined) {
        errors.push({ row: rowNumber, message: `${externalId}: missing ${field}` });
        amountFailed = true;
        continue;
      }
      amounts[field] = result.value;
    }

    const feeVat = readAmount(row, mapping.feeVatAmount);
    if (!feeVat.ok) {
      errors.push({
        row: rowNumber,
        message: `${externalId}: feeVatAmount is not a valid amount ("${feeVat.raw}")`,
      });
      amountFailed = true;
    }

    if (amountFailed) continue;

    const grossAmount = amounts.grossAmount!;
    const feeAmount = amounts.feeAmount!;
    const netPayout = amounts.netPayout!;
    const feeVatAmount = feeVat.ok ? feeVat.value : undefined;

    // Integer satang throughout — never float. A 0.01 drift here becomes an
    // unexplainable deposit later.
    const grossSatang = toSatang(grossAmount)!;
    const feeSatang = toSatang(feeAmount)!;
    const feeVatSatang = feeVatAmount === undefined ? 0 : toSatang(feeVatAmount)!;
    const netSatang = toSatang(netPayout)!;

    const discrepancy = grossSatang - feeSatang - feeVatSatang - netSatang;
    if (discrepancy !== 0) {
      errors.push({
        row: rowNumber,
        message:
          `${externalId}: gross ${grossAmount} - fee ${feeAmount} - fee VAT ` +
          `${feeVatAmount ?? "0.00"} = ${fromSatang(grossSatang - feeSatang - feeVatSatang)}, ` +
          `but net is ${netPayout} (off by ${fromSatang(discrepancy)})`,
      });
      continue;
    }

    const periodStart = mapping.periodStart
      ? row[mapping.periodStart]?.trim()
      : undefined;
    const periodEnd = mapping.periodEnd ? row[mapping.periodEnd]?.trim() : undefined;

    settlements.push({
      externalId,
      periodStart: periodStart ? normalizeDate(periodStart) : undefined,
      periodEnd: periodEnd ? normalizeDate(periodEnd) : undefined,
      grossAmount,
      feeAmount,
      feeVatAmount,
      netPayout,
    });
  }

  return { settlements, errors };
}

/**
 * Detect column headers from a settlement CSV, for the mapping UI.
 *
 * The `transformHeader` here must stay identical to the one in
 * `parseSettlementCSV`. Without it a padded header reaches the mapping UI as
 * `" Gross "`, the owner picks it, and the parser then looks that name up
 * against trimmed row keys, misses, and rejects every row as "missing
 * grossAmount" — a mapping the owner can see is correct, failing silently.
 */
export function detectSettlementColumns(csvText: string): string[] {
  const parsed = Papa.parse(csvText, {
    header: true,
    preview: 1,
    transformHeader: (h: string) => h.trim(),
  });
  return parsed.meta.fields ?? [];
}
