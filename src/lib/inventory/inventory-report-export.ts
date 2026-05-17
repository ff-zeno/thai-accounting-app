import type {
  AgedInventoryRow,
  InventoryRollForwardRow,
} from "@/lib/db/queries/inventory";

function csvCell(value: string | number | Date | null | undefined) {
  const text = value instanceof Date
    ? value.toISOString()
    : value === null || value === undefined
      ? ""
      : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

export function inventoryRollForwardToCsv(rows: InventoryRollForwardRow[]) {
  const headers = [
    "SKU",
    "SKU name",
    "Unit",
    "Opening quantity",
    "Opening value",
    "Inbound quantity",
    "Inbound value",
    "Outbound quantity",
    "Outbound value",
    "Adjustment quantity",
    "Adjustment value",
    "Closing quantity",
    "Closing value",
    "Last movement",
  ];

  const body = rows.map((row) =>
    [
      row.skuCode,
      row.skuName,
      row.unitOfMeasure,
      row.openingQuantity,
      row.openingValue,
      row.inboundQuantity,
      row.inboundValue,
      row.outboundQuantity,
      row.outboundValue,
      row.adjustmentQuantity,
      row.adjustmentValue,
      row.closingQuantity,
      row.closingValue,
      row.lastMovementAt,
    ]
      .map(csvCell)
      .join(",")
  );

  return `\uFEFF${[headers.map(csvCell).join(","), ...body].join("\n")}\n`;
}

export function agedInventoryToCsv(rows: AgedInventoryRow[]) {
  const headers = [
    "SKU",
    "SKU name",
    "Unit",
    "Quantity on hand",
    "Inventory value",
    "Average cost",
    "Last sale",
    "Last movement",
    "Days since last sale",
    "Age bucket",
  ];

  const body = rows.map((row) =>
    [
      row.skuCode,
      row.skuName,
      row.unitOfMeasure,
      row.currentQuantity,
      row.currentValue,
      row.currentAvgCost,
      row.lastSaleAt,
      row.lastMovementAt,
      row.daysSinceLastSale,
      row.ageBucket,
    ]
      .map(csvCell)
      .join(",")
  );

  return `\uFEFF${[headers.map(csvCell).join(","), ...body].join("\n")}\n`;
}
