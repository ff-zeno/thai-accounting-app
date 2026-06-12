import { describe, it, expect } from "vitest";
import {
  whtPaperDeadline,
  whtEfilingDeadline,
  pp30EfilingDeadline,
  pp36Deadline,
  DEFAULT_TAX_CONFIG,
  adjustToNextThaiBusinessDay,
  isThaiBusinessDay,
  THAI_BUSINESS_HOLIDAYS,
} from "./filing-deadlines";

const config = DEFAULT_TAX_CONFIG;

describe("filing deadlines", () => {
  it("WHT paper filing: period 2026-01 rolls Saturday 2026-02-07 to Monday 2026-02-09", () => {
    const result = whtPaperDeadline(2026, 1, config);
    expect(result.deadline.toISOString()).toContain("2026-02-08"); // 09 in +07:00 = 08T17:00Z
    expect(result.isExtended).toBe(false);
    expect(result.extensionDays).toBe(0);
  });

  it("WHT e-filing: period 2026-01 rolls Sunday 2026-02-15 to Monday 2026-02-16", () => {
    const result = whtEfilingDeadline(2026, 1, config);
    expect(result.deadline.toISOString()).toContain("2026-02-15"); // 16 in +07:00 = 15T17:00Z
    expect(result.isExtended).toBe(true);
    expect(result.extensionDays).toBe(8);
  });

  it("PP 30 e-filing: period 2026-01 returns 2026-02-23", () => {
    const result = pp30EfilingDeadline(2026, 1, config);
    expect(result.deadline.toISOString()).toContain("2026-02-22"); // 23 in +07:00 = 22T17:00Z
    expect(result.isExtended).toBe(true);
  });

  it("PP 36: period 2026-01 rolls Sunday 2026-02-15 to Monday 2026-02-16 (no extension)", () => {
    const result = pp36Deadline(2026, 1, config);
    expect(result.deadline.toISOString()).toContain("2026-02-15");
    expect(result.isExtended).toBe(false);
    expect(result.extensionDays).toBe(0);
  });

  it("handles year boundary: period 2026-12 rolls to 2027-01", () => {
    const result = whtPaperDeadline(2026, 12, config);
    expect(result.deadline.toISOString()).toContain("2027-01-06");
  });

  it("configurable: changing efiling deadline day changes the result", () => {
    const customConfig = { ...config, whtEfilingDeadlineDay: 20 };
    const result = whtEfilingDeadline(2026, 1, customConfig);
    expect(result.deadline.toISOString()).toContain("2026-02-19");
    expect(result.extensionDays).toBe(13);
  });

  it("rolls Thai holidays to the next business day", () => {
    const result = whtEfilingDeadline(2026, 3, config);
    expect(result.deadline.toISOString()).toContain("2026-04-15"); // 16 in +07:00 = 15T17:00Z
  });

  it("detects seeded holidays and regular business days", () => {
    expect(isThaiBusinessDay(new Date("2026-04-13T00:00:00+07:00"))).toBe(false);
    expect(isThaiBusinessDay(new Date("2026-04-16T00:00:00+07:00"))).toBe(true);
  });

  it("adjustToNextThaiBusinessDay handles a long holiday run", () => {
    const adjusted = adjustToNextThaiBusinessDay(
      new Date("2026-04-13T00:00:00+07:00")
    );
    expect(adjusted.toISOString()).toContain("2026-04-15"); // 16 in +07:00 = 15T17:00Z
  });
});

describe("holiday coverage", () => {
  // Forcing function: this STARTS FAILING every January 1st until the
  // next year's Bank of Thailand holiday list is added. Do not delete the
  // assertion — add THAI_BUSINESS_HOLIDAYS_<year> and extend the combined
  // export instead.
  it("covers at least the year after the current year", () => {
    const maxYear = Math.max(
      ...THAI_BUSINESS_HOLIDAYS.map((h) => Number(h.date.slice(0, 4)))
    );
    const currentYear = new Date().getFullYear();
    expect(
      maxYear,
      `THAI_BUSINESS_HOLIDAYS only covers up to ${maxYear} — add the ${currentYear + 1} Bank of Thailand list`
    ).toBeGreaterThanOrEqual(currentYear + 1);
  });

  it("rolls a 2027 Songkran deadline to the next business day", () => {
    // PP36 for period 2027-03 lands on Songkran (Thu 2027-04-15) and must
    // roll through it to Friday 2027-04-16.
    const result = pp36Deadline(2027, 3, config);
    expect(result.deadline.toISOString()).toContain("2027-04-15"); // 16 in +07:00 = 15T17:00Z
  });

  it("treats provisional 2027 substitution holidays as non-business days", () => {
    expect(isThaiBusinessDay(new Date("2027-05-03T00:00:00+07:00"))).toBe(false);
    expect(isThaiBusinessDay(new Date("2027-05-05T00:00:00+07:00"))).toBe(true);
  });
});
