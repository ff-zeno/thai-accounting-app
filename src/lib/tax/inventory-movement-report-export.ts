import type { InventoryMovementReport } from "./inventory-movement-report";

const INVENTORY_MOVEMENT_CSV_HEADERS = [
  "Movement date",
  "Branch",
  "SKU",
  "SKU name",
  "Unit",
  "Opening quantity",
  "Movement type",
  "Source type",
  "Source ID",
  "Journal entry ID",
  "Inbound quantity",
  "Outbound quantity",
  "Net quantity",
  "Closing quantity",
  "Unit cost",
  "Total cost",
  "Running quantity after",
] as const;

function csvCell(value: string | number | null | undefined) {
  const text = value === null || value === undefined ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

export function inventoryMovementReportToCsv(report: InventoryMovementReport) {
  const rows = [
    INVENTORY_MOVEMENT_CSV_HEADERS.map(csvCell).join(","),
    ...report.rows.map((row) =>
      [
        row.movementDate,
        row.branchNumber,
        row.skuCode,
        row.skuName,
        row.unitOfMeasure,
        "",
        row.movementType,
        row.sourceEntityType,
        row.sourceEntityId,
        row.journalEntryId,
        row.inboundQuantity,
        row.outboundQuantity,
        row.netQuantity,
        "",
        row.unitCost,
        row.totalCost,
        row.runningQuantityAfter,
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
      report.totals.openingQuantity,
      "",
      "",
      "",
      "",
      report.totals.inboundQuantity,
      report.totals.outboundQuantity,
      report.totals.netQuantity,
      report.totals.closingQuantity,
      "",
      report.totals.movementValue,
      "",
    ]
      .map(csvCell)
      .join(","),
  ];

  return `\uFEFF${rows.join("\n")}\n`;
}
