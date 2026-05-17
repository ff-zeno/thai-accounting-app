import { describe, expect, it } from "vitest";
import {
  agedInventoryToCsv,
  inventoryRollForwardToCsv,
} from "./inventory-report-export";

describe("inventory report CSV exports", () => {
  it("exports inventory roll-forward with UTF-8 BOM", () => {
    const csv = inventoryRollForwardToCsv([
      {
        skuId: "sku-1",
        skuCode: "JP-001",
        skuName: "Imported item",
        unitOfMeasure: "pcs",
        openingQuantity: "10.0000",
        openingValue: "100.00",
        inboundQuantity: "5.0000",
        inboundValue: "60.00",
        outboundQuantity: "3.0000",
        outboundValue: "32.00",
        adjustmentQuantity: "0.0000",
        adjustmentValue: "0.00",
        closingQuantity: "12.0000",
        closingValue: "128.00",
        lastMovementAt: new Date("2026-05-10T05:00:00.000Z"),
      },
    ]);

    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain('"Closing value"');
    expect(csv).toContain('"JP-001"');
    expect(csv).toContain('"128.00"');
  });

  it("exports aged inventory rows", () => {
    const csv = agedInventoryToCsv([
      {
        skuId: "sku-1",
        skuCode: "AGED-001",
        skuName: "Slow item",
        unitOfMeasure: "pcs",
        currentQuantity: "9.0000",
        currentValue: "90.00",
        currentAvgCost: "10.0000",
        lastSaleAt: new Date("2026-02-01T05:00:00.000Z"),
        lastMovementAt: new Date("2026-05-10T05:00:00.000Z"),
        daysSinceLastSale: 103,
        ageBucket: "90_179",
      },
    ]);

    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain('"AGED-001"');
    expect(csv).toContain('"103"');
    expect(csv).toContain('"90_179"');
  });
});
