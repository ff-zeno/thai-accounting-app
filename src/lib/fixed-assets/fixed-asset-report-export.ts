import type { getFixedAssetRollForward } from "@/lib/db/queries/fixed-assets";

type FixedAssetRollForwardRow = Awaited<
  ReturnType<typeof getFixedAssetRollForward>
>[number];

function csvCell(value: string | number | null | undefined) {
  const text = value === null || value === undefined ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

export function fixedAssetRollForwardToCsv(rows: FixedAssetRollForwardRow[]) {
  const headers = [
    "Category",
    "Opening cost",
    "Additions",
    "Disposals",
    "Depreciation in period",
    "Closing cost",
    "GL asset account",
    "GL closing cost",
    "GL variance",
  ];
  const body = rows.map((row) =>
    [
      row.category,
      row.openingCost,
      row.additions,
      row.disposals,
      row.depreciationInPeriod,
      row.closingCost,
      row.glAssetAccountCode,
      row.glClosingCost,
      row.glVariance,
    ]
      .map(csvCell)
      .join(",")
  );

  return `\uFEFF${[headers.map(csvCell).join(","), ...body].join("\n")}\n`;
}
