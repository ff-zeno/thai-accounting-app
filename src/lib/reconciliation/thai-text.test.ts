import { describe, it, expect } from "vitest";
import {
  normalizeCompanyName,
  stripHonorifics,
  tokenOverlap,
  normalizeCounterparty,
} from "./thai-text";

// ---------------------------------------------------------------------------
// normalizeCompanyName
// ---------------------------------------------------------------------------

describe("normalizeCompanyName", () => {
  it("strips บริษัท ... จำกัด", () => {
    expect(normalizeCompanyName("บริษัท ทดสอบ จำกัด")).toBe("ทดสอบ");
  });

  it("strips บจก.", () => {
    expect(normalizeCompanyName("บจก. ทดสอบ")).toBe("ทดสอบ");
  });

  it("strips มหาชน", () => {
    expect(normalizeCompanyName("บริษัท ปตท. จำกัด (มหาชน)")).toBe("ปตท.");
  });

  it("strips English Co., Ltd.", () => {
    expect(normalizeCompanyName("LUMERA CO., LTD.")).toBe("lumera");
  });

  it("strips Company Limited", () => {
    expect(normalizeCompanyName("Lumera Company Limited")).toBe("lumera");
  });

  it("strips Inc.", () => {
    expect(normalizeCompanyName("Acme Inc.")).toBe("acme");
  });

  it("strips (Thailand)", () => {
    expect(normalizeCompanyName("Google (Thailand) Co., Ltd.")).toBe("google");
  });

  it("strips (ประเทศไทย)", () => {
    expect(normalizeCompanyName("กูเกิล (ประเทศไทย) จำกัด")).toBe("กูเกิล");
  });

  it("strips ห้างหุ้นส่วนจำกัด", () => {
    expect(normalizeCompanyName("ห้างหุ้นส่วนจำกัด ทดสอบ")).toBe("ทดสอบ");
  });

  it("collapses whitespace", () => {
    expect(normalizeCompanyName("  บจก.   ทดสอบ   จำกัด  ")).toBe("ทดสอบ");
  });

  it("handles mixed Thai/English", () => {
    expect(normalizeCompanyName("บริษัท ABC Trading จำกัด")).toBe("abc trading");
  });
});

// ---------------------------------------------------------------------------
// stripHonorifics
// ---------------------------------------------------------------------------

describe("stripHonorifics", () => {
  it("strips นาย", () => {
    expect(stripHonorifics("นายสมชาย")).toBe("สมชาย");
  });

  it("strips น.ส.", () => {
    expect(stripHonorifics("น.ส.สมหญิง")).toBe("สมหญิง");
  });

  it("strips นาง", () => {
    expect(stripHonorifics("นางสมศรี")).toBe("สมศรี");
  });

  it("strips นางสาว", () => {
    expect(stripHonorifics("นางสาวสมหญิง")).toBe("สมหญิง");
  });

  it("strips ดร.", () => {
    expect(stripHonorifics("ดร.สมศักดิ์")).toBe("สมศักดิ์");
  });

  it("does not strip from middle of text", () => {
    expect(stripHonorifics("สมชาย นายดี")).toBe("สมชาย นายดี");
  });

  it("returns unchanged text without honorific", () => {
    expect(stripHonorifics("สมชาย ดี")).toBe("สมชาย ดี");
  });
});

// ---------------------------------------------------------------------------
// tokenOverlap (Jaccard similarity)
// ---------------------------------------------------------------------------

describe("tokenOverlap", () => {
  it("returns 1.0 for identical text", () => {
    expect(tokenOverlap("ทดสอบ", "ทดสอบ")).toBe(1.0);
  });

  it("returns 1.0 for same words different suffixes", () => {
    // After normalization, both become "ทดสอบ"
    expect(tokenOverlap("บจก. ทดสอบ", "บริษัท ทดสอบ จำกัด")).toBe(1.0);
  });

  it("returns partial overlap for shared tokens", () => {
    const score = tokenOverlap("abc trading thailand", "abc trading group");
    // Shared: "abc", "trading". Union: "abc", "trading", "thailand", "group"
    // Jaccard: 2/4 = 0.5
    expect(score).toBeCloseTo(0.5, 2);
  });

  it("returns 0 for completely different text", () => {
    expect(tokenOverlap("abc", "xyz")).toBe(0);
  });

  it("returns 0 for empty strings", () => {
    expect(tokenOverlap("", "test")).toBe(0);
    expect(tokenOverlap("test", "")).toBe(0);
  });

  it("handles mixed Thai/English", () => {
    const score = tokenOverlap(
      "LUMERA CO LTD",
      "Lumera Company Limited"
    );
    // Both normalize to "lumera" → 1.0
    expect(score).toBe(1.0);
  });

  it("matches Thai company names with different suffixes", () => {
    const score = tokenOverlap(
      "บจก. ทดสอบ เทรดดิ้ง",
      "บริษัท ทดสอบ เทรดดิ้ง จำกัด"
    );
    expect(score).toBe(1.0);
  });
});

// ---------------------------------------------------------------------------
// normalizeCounterparty
// ---------------------------------------------------------------------------

describe("normalizeCounterparty", () => {
  it("strips bank prefixes", () => {
    expect(normalizeCounterparty("From Acct บจก. ทดสอบ")).toBe("ทดสอบ");
  });

  it("strips transfer prefix", () => {
    expect(normalizeCounterparty("Transfer to LUMERA CO LTD")).toBe("lumera");
  });

  it("strips Thai transfer prefix", () => {
    expect(normalizeCounterparty("โอนเงินให้ บจก.ทดสอบ")).toBe("ทดสอบ");
  });

  it("strips reference codes", () => {
    expect(normalizeCounterparty("บจก.ทดสอบ REF: ABC123")).toBe("ทดสอบ");
  });

  it("handles complex counterparty with multiple patterns", () => {
    const result = normalizeCounterparty("Transfer to LUMERA CO., LTD. ref: TH20260301");
    expect(result).toBe("lumera");
  });
});
