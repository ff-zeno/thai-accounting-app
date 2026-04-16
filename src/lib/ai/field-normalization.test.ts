import { describe, it, expect } from "vitest";
import {
  normalizeFieldValue,
  fieldValuesEqual,
} from "./field-normalization";

describe("normalizeFieldValue", () => {
  // --- null/undefined/empty ---
  it("returns empty string for null/undefined", () => {
    expect(normalizeFieldValue("totalAmount", null)).toBe("");
    expect(normalizeFieldValue("totalAmount", undefined)).toBe("");
  });

  it("returns empty string for empty/whitespace string", () => {
    expect(normalizeFieldValue("totalAmount", "")).toBe("");
    expect(normalizeFieldValue("totalAmount", "   ")).toBe("");
  });

  // --- Amounts ---
  describe("amounts", () => {
    it("strips commas and normalizes decimals", () => {
      expect(normalizeFieldValue("totalAmount", "1,234.56")).toBe("1234.56");
      expect(normalizeFieldValue("subtotal", "1234")).toBe("1234.00");
      expect(normalizeFieldValue("vatAmount", "82.5")).toBe("82.50");
    });

    it("strips currency symbols", () => {
      expect(normalizeFieldValue("totalAmount", "฿1,234.56")).toBe("1234.56");
      expect(normalizeFieldValue("totalAmount", "$99.99")).toBe("99.99");
    });

    it("strips spaces in amounts", () => {
      expect(normalizeFieldValue("totalAmount", "1 234.56")).toBe("1234.56");
    });

    it("handles number type input", () => {
      expect(normalizeFieldValue("totalAmount", 1234.5)).toBe("1234.50");
    });
  });

  // --- Rates ---
  describe("rates", () => {
    it("normalizes rate to 4 decimals", () => {
      expect(normalizeFieldValue("vatRate", "7")).toBe("7.0000");
      expect(normalizeFieldValue("vatRate", "7%")).toBe("7.0000");
      expect(normalizeFieldValue("vatRate", "7.00")).toBe("7.0000");
    });
  });

  // --- Dates ---
  describe("dates", () => {
    it("passes through valid ISO dates", () => {
      expect(normalizeFieldValue("issueDate", "2026-03-13")).toBe("2026-03-13");
    });

    it("converts Buddhist Era dates", () => {
      expect(normalizeFieldValue("issueDate", "2569-03-13")).toBe("2026-03-13");
    });

    it("converts DD/MM/YYYY format", () => {
      expect(normalizeFieldValue("issueDate", "13/03/2026")).toBe("2026-03-13");
    });

    it("converts DD/MM/YYYY with BE year", () => {
      expect(normalizeFieldValue("issueDate", "13/03/2569")).toBe("2026-03-13");
    });

    it("handles single-digit day/month", () => {
      expect(normalizeFieldValue("issueDate", "3/1/2026")).toBe("2026-01-03");
    });

    it("normalizes dueDate the same way", () => {
      expect(normalizeFieldValue("dueDate", "2569-01-15")).toBe("2026-01-15");
    });
  });

  // --- Tax IDs ---
  describe("tax IDs", () => {
    it("strips dashes from tax ID", () => {
      expect(normalizeFieldValue("vendorTaxId", "010-5-53712127-1")).toBe("0105537121271");
    });

    it("strips spaces from tax ID", () => {
      expect(normalizeFieldValue("vendorTaxId", "0 105 560199507")).toBe("0105560199507");
    });

    it("passes through clean 13-digit ID", () => {
      expect(normalizeFieldValue("vendorTaxId", "0105560199507")).toBe("0105560199507");
    });

    it("normalizes buyerTaxId too", () => {
      expect(normalizeFieldValue("buyerTaxId", "0-1055-68102-52-9")).toBe("0105568102529");
    });

    it("normalizes citizenId", () => {
      expect(normalizeFieldValue("citizenId", "1-1234-56789-01-2")).toBe("1123456789012");
    });
  });

  // --- Company names ---
  describe("company names", () => {
    it("strips Thai company suffixes", () => {
      expect(normalizeFieldValue("vendorName", "บริษัท เคเชอร์ เพย์เมนท์ จำกัด")).toBe("เคเชอร์ เพย์เมนท์");
    });

    it("strips English company suffixes", () => {
      expect(normalizeFieldValue("vendorNameEn", "Ksher Payment Co., Ltd.")).toBe("ksher payment");
    });

    it("strips country parenthetical", () => {
      expect(normalizeFieldValue("vendorNameEn", "LUMERA (THAILAND) CO.,LTD")).toBe("lumera");
    });

    it("collapses whitespace", () => {
      expect(normalizeFieldValue("vendorName", "  บริษัท   ทดสอบ   จำกัด  ")).toBe("ทดสอบ");
    });
  });

  // --- Branch numbers ---
  describe("branch numbers", () => {
    it("normalizes head office variants to 00000", () => {
      expect(normalizeFieldValue("vendorBranchNumber", "สำนักงานใหญ่")).toBe("00000");
      expect(normalizeFieldValue("vendorBranchNumber", "Head Office")).toBe("00000");
      expect(normalizeFieldValue("vendorBranchNumber", "0")).toBe("00000");
      expect(normalizeFieldValue("vendorBranchNumber", "00000")).toBe("00000");
    });

    it("pads branch numbers to 5 digits", () => {
      expect(normalizeFieldValue("vendorBranchNumber", "9")).toBe("00009");
      expect(normalizeFieldValue("vendorBranchNumber", "Branch 00009")).toBe("00009");
    });
  });

  // --- Enums ---
  describe("enums", () => {
    it("lowercases document type", () => {
      expect(normalizeFieldValue("documentType", "Invoice")).toBe("invoice");
    });

    it("lowercases language", () => {
      expect(normalizeFieldValue("detectedLanguage", "TH")).toBe("th");
    });
  });

  // --- Currency ---
  describe("currency", () => {
    it("uppercases currency codes", () => {
      expect(normalizeFieldValue("currency", "thb")).toBe("THB");
      expect(normalizeFieldValue("currency", "usd")).toBe("USD");
    });
  });

  // --- Unknown fields ---
  describe("unknown fields", () => {
    it("falls back to text normalization", () => {
      expect(normalizeFieldValue("unknownField", "  Hello   World  ")).toBe("hello world");
    });
  });
});

describe("fieldValuesEqual", () => {
  it("treats null and empty string as equal", () => {
    expect(fieldValuesEqual("totalAmount", null, "")).toBe(true);
    expect(fieldValuesEqual("totalAmount", undefined, null)).toBe(true);
  });

  it("treats cosmetically different amounts as equal", () => {
    expect(fieldValuesEqual("totalAmount", "1,234.56", "1234.56")).toBe(true);
    expect(fieldValuesEqual("totalAmount", "1234.5", "1234.50")).toBe(true);
  });

  it("detects semantic amount difference", () => {
    expect(fieldValuesEqual("totalAmount", "1234.56", "1234.57")).toBe(false);
  });

  it("treats BE and CE dates as equal", () => {
    expect(fieldValuesEqual("issueDate", "2569-03-13", "2026-03-13")).toBe(true);
  });

  it("treats dashed and clean tax IDs as equal", () => {
    expect(fieldValuesEqual("vendorTaxId", "010-5-53712127-1", "0105537121271")).toBe(true);
  });
});
