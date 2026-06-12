import { describe, expect, it } from "vitest";
import {
  amountsEqual,
  formatAmount,
  formatAmountThb,
  fromSatang,
  isZeroAmount,
  percentageDiff,
  sumAmounts,
  sumSatang,
  toSatang,
  toSatangOrZero,
} from "./money";

describe("toSatang", () => {
  it("parses canonical NUMERIC(14,2) strings", () => {
    expect(toSatang("1234.50")).toBe(123450);
    expect(toSatang("0.00")).toBe(0);
    expect(toSatang("-1070.00")).toBe(-107000);
  });

  it("parses integers and single-decimal strings", () => {
    expect(toSatang("1000")).toBe(100000);
    expect(toSatang("10.5")).toBe(1050);
    expect(toSatang("-3")).toBe(-300);
  });

  it("rounds past 2dp half-away-from-zero", () => {
    expect(toSatang("1.005")).toBe(101);
    expect(toSatang("1.004")).toBe(100);
    expect(toSatang("-1.005")).toBe(-101);
    expect(toSatang("-1.0049")).toBe(-100);
    expect(toSatang("0.999")).toBe(100);
  });

  it("is immune to float representation traps", () => {
    // parseFloat("0.1")*100 = 10.000000000000002; string math is exact.
    expect(toSatang("0.1")).toBe(10);
    expect(toSatang("0.29")).toBe(29);
    expect(toSatang("1.13")).toBe(113);
    expect(toSatang("239256.01")).toBe(23925601);
  });

  it("trims surrounding whitespace", () => {
    expect(toSatang("  42.00 ")).toBe(4200);
  });

  it("returns null on malformed input", () => {
    expect(toSatang(null)).toBeNull();
    expect(toSatang(undefined)).toBeNull();
    expect(toSatang("")).toBeNull();
    expect(toSatang("abc")).toBeNull();
    expect(toSatang("1,234.00")).toBeNull();
    expect(toSatang("1.2.3")).toBeNull();
    expect(toSatang("1e3")).toBeNull();
    expect(toSatang(".5")).toBeNull();
    expect(toSatang("-")).toBeNull();
    expect(toSatang("+5")).toBeNull();
    expect(toSatang("NaN")).toBeNull();
    expect(toSatang("Infinity")).toBeNull();
  });

  it("handles the NUMERIC(14,2) extremes", () => {
    expect(toSatang("999999999999.99")).toBe(99999999999999);
    expect(toSatang("-999999999999.99")).toBe(-99999999999999);
  });

  it("throws past the safe-integer boundary", () => {
    expect(() => toSatang("99999999999999999")).toThrow(RangeError);
  });
});

describe("toSatangOrZero", () => {
  it("falls back to 0 on malformed input", () => {
    expect(toSatangOrZero(null)).toBe(0);
    expect(toSatangOrZero("garbage")).toBe(0);
    expect(toSatangOrZero("5.00")).toBe(500);
  });
});

describe("fromSatang", () => {
  it("renders canonical strings", () => {
    expect(fromSatang(123450)).toBe("1234.50");
    expect(fromSatang(0)).toBe("0.00");
    expect(fromSatang(1)).toBe("0.01");
    expect(fromSatang(-107000)).toBe("-1070.00");
    expect(fromSatang(-1)).toBe("-0.01");
  });

  it("normalizes negative zero", () => {
    expect(fromSatang(-0)).toBe("0.00");
  });

  it("throws on non-integers and unsafe values", () => {
    expect(() => fromSatang(1.5)).toThrow(RangeError);
    expect(() => fromSatang(NaN)).toThrow(RangeError);
    expect(() => fromSatang(Number.MAX_SAFE_INTEGER + 1)).toThrow(RangeError);
  });

  it("round-trips with toSatang", () => {
    for (const amount of ["0.00", "0.01", "-0.01", "1234.56", "999999999999.99"]) {
      expect(fromSatang(toSatang(amount)!)).toBe(amount);
    }
  });
});

describe("sumSatang / sumAmounts", () => {
  it("sums satang exactly", () => {
    expect(sumSatang([10, 20, -5])).toBe(25);
    expect(sumSatang([])).toBe(0);
  });

  it("rejects unsafe inputs", () => {
    expect(() => sumSatang([0.5])).toThrow(RangeError);
  });

  it("sums amount strings without float drift", () => {
    // 0.1 + 0.2 === 0.30000000000000004 in float land.
    expect(sumAmounts(["0.10", "0.20"])).toBe("0.30");
    const cents = Array.from({ length: 1000 }, () => "0.01");
    expect(sumAmounts(cents)).toBe("10.00");
  });

  it("treats malformed entries as zero", () => {
    expect(sumAmounts(["5.00", null, undefined, "junk"])).toBe("5.00");
  });

  it("normalizes a negative-canceling sum to 0.00", () => {
    expect(sumAmounts(["-5.00", "5.00"])).toBe("0.00");
  });
});

describe("amountsEqual / isZeroAmount", () => {
  it("compares by satang value, not string identity", () => {
    expect(amountsEqual("1070", "1070.00")).toBe(true);
    expect(amountsEqual("1070.00", "1070.01")).toBe(false);
    expect(amountsEqual("-0.00", "0.00")).toBe(true);
  });

  it("never equates malformed input", () => {
    expect(amountsEqual(null, null)).toBe(false);
    expect(amountsEqual("abc", "abc")).toBe(false);
    expect(amountsEqual("5.00", null)).toBe(false);
  });

  it("detects zero amounts", () => {
    expect(isZeroAmount("0.00")).toBe(true);
    expect(isZeroAmount("-0.00")).toBe(true);
    expect(isZeroAmount("0.01")).toBe(false);
    expect(isZeroAmount(null)).toBe(false);
    expect(isZeroAmount("junk")).toBe(false);
  });
});

describe("percentageDiff", () => {
  it("computes the relative difference as a plain ratio", () => {
    expect(percentageDiff("100.00", "90.00")).toBeCloseTo(0.1, 10);
    expect(percentageDiff("90.00", "100.00")).toBeCloseTo(0.1, 10);
    expect(percentageDiff("100.00", "100.00")).toBe(0);
  });

  it("uses absolute values", () => {
    expect(percentageDiff("-100.00", "100.00")).toBe(0);
  });

  it("handles zero edges", () => {
    expect(percentageDiff("0.00", "0.00")).toBe(0);
    expect(percentageDiff("0.00", "50.00")).toBe(1);
    expect(percentageDiff(null, "50.00")).toBe(1);
  });
});

describe("formatAmount / formatAmountThb", () => {
  it("groups thousands en-US style", () => {
    expect(formatAmount("1234.50")).toBe("1,234.50");
    expect(formatAmount("1234567.89")).toBe("1,234,567.89");
    expect(formatAmount("999.99")).toBe("999.99");
  });

  it("formats negatives and zero", () => {
    expect(formatAmount("-1070.00")).toBe("-1,070.00");
    expect(formatAmount("0.00")).toBe("0.00");
    expect(formatAmount("-0.00")).toBe("0.00");
  });

  it("accepts numbers, guarding NaN and Infinity", () => {
    expect(formatAmount(1234.5)).toBe("1,234.50");
    expect(formatAmount(NaN)).toBe("0.00");
    expect(formatAmount(Infinity)).toBe("0.00");
  });

  it("renders 0.00 on null or malformed input", () => {
    expect(formatAmount(null)).toBe("0.00");
    expect(formatAmount(undefined)).toBe("0.00");
    expect(formatAmount("junk")).toBe("0.00");
  });

  it("prefixes THB symbol", () => {
    expect(formatAmountThb("1234.50")).toBe("฿1,234.50");
    expect(formatAmountThb(null)).toBe("฿0.00");
  });
});
