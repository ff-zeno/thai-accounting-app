import type { InputTaxReport } from "./input-tax-report";

const INPUT_TAX_CSV_HEADERS = [
  "Tax invoice date",
  "Supplier",
  "Supplier tax ID",
  "Tax invoice type",
  "Tax invoice no.",
  "Status",
  "Tax base",
  "Input VAT",
] as const;

function csvCell(value: string | number | null | undefined) {
  const text = value === null || value === undefined ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

export function inputTaxReportToCsv(report: InputTaxReport) {
  const rows = [
    INPUT_TAX_CSV_HEADERS.map(csvCell).join(","),
    ...report.rows.map((row) =>
      [
        row.taxInvoiceDate,
        row.vendorName,
        row.vendorTaxId,
        row.taxInvoiceSubtype,
        row.taxInvoiceNo,
        row.status,
        row.baseAmount,
        row.vatAmount,
      ]
        .map(csvCell)
        .join(",")
    ),
    [
      "TOTAL",
      "",
      "",
      "",
      "",
      "",
      report.totals.baseAmount,
      report.totals.vatAmount,
    ]
      .map(csvCell)
      .join(","),
  ];

  return `\uFEFF${rows.join("\n")}\n`;
}
