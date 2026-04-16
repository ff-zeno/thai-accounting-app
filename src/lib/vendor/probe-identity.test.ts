import { describe, it, expect, vi } from "vitest";

// Mock the DB module so we can import the regex function without a DATABASE_URL
vi.mock("@/lib/db/index", () => ({ db: {} }));

const { extractTaxIdCandidates } = await import("./probe-identity");

describe("extractTaxIdCandidates", () => {
  it("extracts bare 13-digit tax ID", () => {
    const candidates = extractTaxIdCandidates("Tax ID: 0105560199507");
    expect(candidates).toHaveLength(1);
    expect(candidates[0].normalized).toBe("0105560199507");
  });

  it("extracts dashed tax ID", () => {
    const candidates = extractTaxIdCandidates("TAX ID : 010-5-53712127-1 Branch 00009");
    expect(candidates).toHaveLength(1);
    expect(candidates[0].normalized).toBe("0105537121271");
  });

  it("extracts multiple candidates and scores them", () => {
    const text = `
      บริษัท เคเชอร เพยเมนท จำกัด Ksher Payment Co., Ltd.
      เลขประจําตัวผูเสียภาษีอากร/Tax ID: 0105560199507
      ชื่อลูกค้า / Customer: บริษัท ลูเมรา จำกัด
      Tax ID: 0105568102529
    `;
    const candidates = extractTaxIdCandidates(text);
    expect(candidates.length).toBeGreaterThanOrEqual(2);

    // Vendor ID should score higher (near "Co., Ltd.")
    // Customer ID should score lower (near "Customer")
    const vendorCandidate = candidates.find((c) => c.normalized === "0105560199507");
    const customerCandidate = candidates.find((c) => c.normalized === "0105568102529");
    expect(vendorCandidate).toBeDefined();
    expect(customerCandidate).toBeDefined();
    expect(vendorCandidate!.score).toBeGreaterThan(customerCandidate!.score);
  });

  it("returns empty for no tax IDs", () => {
    const candidates = extractTaxIdCandidates("No tax IDs here, just text.");
    expect(candidates).toHaveLength(0);
  });

  it("ignores sequences near bank account keywords", () => {
    const text = "Bank Account No. 1234567890123";
    const candidates = extractTaxIdCandidates(text);
    // The sequence exists but should have negative score
    if (candidates.length > 0) {
      expect(candidates[0].score).toBeLessThan(0);
    }
  });

  it("handles empty/whitespace input", () => {
    expect(extractTaxIdCandidates("")).toHaveLength(0);
    expect(extractTaxIdCandidates("   ")).toHaveLength(0);
  });

  it("deduplicates same ID at same position", () => {
    const text = "Tax ID: 0105560199507. Again: 0105560199507";
    const candidates = extractTaxIdCandidates(text);
    // Same normalized ID at different positions = separate candidates
    const matching = candidates.filter((c) => c.normalized === "0105560199507");
    expect(matching.length).toBe(2);
  });
});
