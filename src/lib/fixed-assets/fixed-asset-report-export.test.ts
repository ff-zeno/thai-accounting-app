import { describe, expect, it } from "vitest";
import { fixedAssetRollForwardToCsv } from "./fixed-asset-report-export";

describe("fixed asset report exports", () => {
  it("exports roll-forward rows with UTF-8 BOM", () => {
    const csv = fixedAssetRollForwardToCsv([
      {
        category: "equipment",
        openingCost: "100000.00",
        additions: "20000.00",
        disposals: "10000.00",
        closingCost: "110000.00",
        depreciationInPeriod: "12000.00",
        glAssetAccountCode: "1330",
        glClosingCost: "110000.00",
        glVariance: "0.00",
      },
      {
        category: "leasehold_improvement",
        openingCost: "0.00",
        additions: "50000.00",
        disposals: "0.00",
        closingCost: "50000.00",
        depreciationInPeriod: "0.00",
        glAssetAccountCode: "1330",
        glClosingCost: null,
        glVariance: null,
      },
    ]);

    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain('"Category"');
    expect(csv).toContain('"equipment"');
    expect(csv).toContain('"110000.00"');
    expect(csv).toContain('"GL variance"');
    expect(csv).toContain('"leasehold_improvement","0.00","50000.00","0.00","0.00","50000.00","1330","",""');
  });
});
