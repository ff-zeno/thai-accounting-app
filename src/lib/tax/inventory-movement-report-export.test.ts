import { describe, expect, it } from "vitest";
import { inventoryMovementReportToCsv } from "./inventory-movement-report-export";
import type { InventoryMovementReport } from "./inventory-movement-report";

describe("inventoryMovementReportToCsv", () => {
  it("serializes movement rows and totals with a UTF-8 BOM", () => {
    const report: InventoryMovementReport = {
      orgId: "org_1",
      establishmentId: "est_1",
      periodYear: 2026,
      periodMonth: 5,
      rows: [
        {
          movementId: "movement_1",
          movementDate: "2026-05-01",
          branchNumber: "00000",
          skuCode: "SKU-001",
          skuName: 'Retail "Item"',
          unitOfMeasure: "pcs",
          movementType: "purchase_in",
          sourceEntityType: "documents",
          sourceEntityId: "doc_1",
          journalEntryId: "je_1",
          inboundQuantity: "10.0000",
          outboundQuantity: "0.0000",
          netQuantity: "10.0000",
          unitCost: "12.0000",
          totalCost: "120.00",
          runningQuantityAfter: "10.0000",
        },
      ],
      skuSummary: [],
      totals: {
        movementCount: 1,
        openingQuantity: "0.0000",
        inboundQuantity: "10.0000",
        outboundQuantity: "0.0000",
        netQuantity: "10.0000",
        closingQuantity: "10.0000",
        movementValue: "120.00",
      },
      sourceUrls: [] as unknown as InventoryMovementReport["sourceUrls"],
    };

    expect(inventoryMovementReportToCsv(report)).toBe(
      `\uFEFF${[
        '"Movement date","Branch","SKU","SKU name","Unit","Opening quantity","Movement type","Source type","Source ID","Journal entry ID","Inbound quantity","Outbound quantity","Net quantity","Closing quantity","Unit cost","Total cost","Running quantity after"',
        '"2026-05-01","00000","SKU-001","Retail ""Item""","pcs","","purchase_in","documents","doc_1","je_1","10.0000","0.0000","10.0000","","12.0000","120.00","10.0000"',
        '"TOTAL","","","","","0.0000","","","","","10.0000","0.0000","10.0000","10.0000","","120.00",""',
        "",
      ].join("\n")}`
    );
  });
});
