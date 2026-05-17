import type { OutputTaxReport } from "./output-tax-report";

const OUTPUT_TAX_CSV_HEADERS = [
  "Tax date",
  "Branch",
  "Invoice type",
  "Invoice no.",
  "Channel",
  "Tax base ex VAT",
  "Output VAT",
  "Gross amount",
] as const;

function csvCell(value: string | number | null | undefined) {
  const text = value === null || value === undefined ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

export function outputTaxReportToCsv(report: OutputTaxReport) {
  const rows = [
    OUTPUT_TAX_CSV_HEADERS.map(csvCell).join(","),
    ...report.rows.map((row) =>
      [
        row.taxDate,
        row.branchNumber,
        row.taxInvoiceType,
        row.taxInvoiceNumber,
        row.channel,
        row.taxBaseExVat,
        row.vatAmount,
        row.amountIncludingVat,
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
      report.totals.taxBaseExVat,
      report.totals.vatAmount,
      report.totals.amountIncludingVat,
    ]
      .map(csvCell)
      .join(","),
  ];

  return `\uFEFF${rows.join("\n")}\n`;
}
