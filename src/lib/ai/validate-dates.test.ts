import { describe, expect, it } from "vitest";
import { checkExtractedDate } from "./validate-dates";

// Fixed "today" injected everywhere — the function must never read the clock.
const TODAY = new Date("2026-07-02T00:00:00Z");

describe("checkExtractedDate", () => {
  it("passes a valid ISO date clean", () => {
    const result = checkExtractedDate("issueDate", "2026-02-07", TODAY);
    expect(result).toEqual({
      value: "2026-02-07",
      warnings: [],
      needsReview: false,
    });
  });

  it("treats an absent value as clean", () => {
    const result = checkExtractedDate("dueDate", undefined, TODAY);
    expect(result).toEqual({
      value: undefined,
      warnings: [],
      needsReview: false,
    });
  });

  it("treats an empty string as absent (existing '' -> NULL convention)", () => {
    const result = checkExtractedDate("issueDate", "", TODAY);
    expect(result).toEqual({
      value: undefined,
      warnings: [],
      needsReview: false,
    });
  });

  it("clears a malformed string and warns with the raw value", () => {
    const result = checkExtractedDate("issueDate", "15/05/2026", TODAY);
    expect(result.value).toBeUndefined();
    expect(result.needsReview).toBe(true);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('"15/05/2026"');
    expect(result.warnings[0]).toContain("issueDate");
  });

  it("clears an impossible calendar date", () => {
    const result = checkExtractedDate("issueDate", "2026-02-30", TODAY);
    expect(result.value).toBeUndefined();
    expect(result.needsReview).toBe(true);
    expect(result.warnings[0]).toContain('"2026-02-30"');
  });

  it("keeps a BE-year date but warns with the CE suggestion and forces review", () => {
    const result = checkExtractedDate("issueDate", "2568-05-15", TODAY);
    expect(result.value).toBe("2568-05-15");
    expect(result.needsReview).toBe(true);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain("Buddhist Era");
    expect(result.warnings[0]).toContain("2025-05-15");
  });

  it("keeps a far-future year (2048) with a plausibility warning and forces review", () => {
    const result = checkExtractedDate("issueDate", "2048-01-10", TODAY);
    expect(result.value).toBe("2048-01-10");
    expect(result.needsReview).toBe(true);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain("2048");
    expect(result.warnings[0]).toContain("implausible");
  });

  it("keeps a pre-2000 year (1999) with a plausibility warning and forces review", () => {
    const result = checkExtractedDate("dueDate", "1999-12-31", TODAY);
    expect(result.value).toBe("1999-12-31");
    expect(result.needsReview).toBe(true);
    expect(result.warnings[0]).toContain("1999");
  });

  it("passes the currentYear+1 boundary clean", () => {
    const result = checkExtractedDate("issueDate", "2027-12-31", TODAY);
    expect(result).toEqual({
      value: "2027-12-31",
      warnings: [],
      needsReview: false,
    });
  });
});
