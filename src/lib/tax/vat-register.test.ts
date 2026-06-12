import { describe, expect, it, vi } from "vitest";

// vat-register.ts opens the db connection at module load; the totals
// function under test is pure, so stub the connection out.
vi.mock("../db/index", () => ({ db: {} }));

import { computeRegisterTotals } from "./vat-register";

const entry = (vatAmount: string) => ({ vatAmount });

describe("computeRegisterTotals", () => {
  it("sums input and output VAT independently", () => {
    const totals = computeRegisterTotals(
      [entry("70.00"), entry("140.00")],
      [entry("35.00")]
    );
    expect(totals).toEqual({ inputTotal: "210.00", outputTotal: "35.00" });
  });

  it("subtracts credit-note negatives", () => {
    const totals = computeRegisterTotals(
      [entry("100.00"), entry("-30.00")],
      [entry("-10.00"), entry("10.00")]
    );
    expect(totals.inputTotal).toBe("70.00");
    // A register netting to zero renders 0.00, never -0.00.
    expect(totals.outputTotal).toBe("0.00");
  });

  it("accumulates satang-exact where float math drifts", () => {
    // 0.07 × 1000 = 70.00000000000004 with parseFloat accumulation.
    const totals = computeRegisterTotals(
      Array.from({ length: 1000 }, () => entry("0.07")),
      []
    );
    expect(totals).toEqual({ inputTotal: "70.00", outputTotal: "0.00" });
  });

  it("renders empty registers as 0.00", () => {
    expect(computeRegisterTotals([], [])).toEqual({
      inputTotal: "0.00",
      outputTotal: "0.00",
    });
  });
});
