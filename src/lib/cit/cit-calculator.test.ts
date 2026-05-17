import { describe, expect, it } from "vitest";
import {
  computeLossCarryForwardConsumption,
  computeProgressiveCit,
  computeProjectedPnd51,
} from "./cit-calculator";

describe("CIT calculator", () => {
  it("computes standard 20 percent CIT", () => {
    expect(
      computeProgressiveCit("1000000.00", [
        { lowerBound: "0.00", upperBound: null, marginalRate: "0.2000" },
      ])
    ).toBe("200000.00");
  });

  it("computes SME tiered CIT", () => {
    expect(
      computeProgressiveCit("4000000.00", [
        { lowerBound: "0.00", upperBound: "300000.00", marginalRate: "0.0000" },
        { lowerBound: "300000.00", upperBound: "3000000.00", marginalRate: "0.1500" },
        { lowerBound: "3000000.00", upperBound: null, marginalRate: "0.2000" },
      ])
    ).toBe("605000.00");
  });

  it("computes projected PND.51 as half of annual CIT", () => {
    expect(
      computeProjectedPnd51({
        projectedFullYearProfit: "1000000.00",
        annualCit: "200000.00",
      })
    ).toEqual({
      projectedFullYearProfit: "1000000.00",
      annualCit: "200000.00",
      prepaymentDue: "100000.00",
    });
  });

  it("consumes loss carry-forward layers oldest first", () => {
    expect(
      computeLossCarryForwardConsumption({
        taxableIncome: "600000.00",
        layers: [
          { id: "newer", originatedTaxYear: 2025, remainingAmount: "500000.00" },
          { id: "older", originatedTaxYear: 2024, remainingAmount: "200000.00" },
        ],
      })
    ).toEqual({
      taxableIncomeBeforeLosses: "600000.00",
      totalLossesConsumed: "600000.00",
      taxableIncomeAfterLosses: "0.00",
      consumption: [
        {
          layerId: "older",
          originatedTaxYear: 2024,
          consumedAmount: "200000.00",
          remainingAmountAfter: "0.00",
        },
        {
          layerId: "newer",
          originatedTaxYear: 2025,
          consumedAmount: "400000.00",
          remainingAmountAfter: "100000.00",
        },
      ],
    });
  });
});
