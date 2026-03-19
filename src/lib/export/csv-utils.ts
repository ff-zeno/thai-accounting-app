/**
 * Shared CSV utilities for export functions.
 *
 * All CSV exports use UTF-8 with BOM for Thai Excel compatibility,
 * CRLF line endings per CSV spec.
 */

/** UTF-8 BOM character for Excel Thai text compatibility */
export const UTF8_BOM = "\uFEFF";

/** Escape a CSV field: wrap in quotes if it contains commas, quotes, or newlines */
export function escapeCsvField(value: string): string {
  if (
    value.includes(",") ||
    value.includes('"') ||
    value.includes("\n") ||
    value.includes("\r")
  ) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** Format amount for CSV: 2 decimal places, no commas */
export function formatAmount(amount: string | null | undefined): string {
  if (!amount) return "0.00";
  return parseFloat(amount).toFixed(2);
}

/** Build a CSV string from headers and rows of string values. Includes BOM and CRLF. */
export function buildCsv(
  headers: readonly string[],
  rows: string[][]
): string {
  const headerLine = headers.map(escapeCsvField).join(",");
  const dataLines = rows.map((row) => row.map(escapeCsvField).join(","));
  return UTF8_BOM + [headerLine, ...dataLines].join("\r\n") + "\r\n";
}

/** Convert record array to CSV. Uses keys from the first record as headers. */
export function recordsToCsv<T extends Record<string, unknown>>(
  headers: readonly string[],
  keys: readonly string[],
  records: T[]
): string {
  const rows = records.map((record) =>
    keys.map((key) => {
      const val = record[key];
      if (val === null || val === undefined) return "";
      if (val instanceof Date) return val.toISOString();
      return String(val);
    })
  );
  return buildCsv(headers, rows);
}
