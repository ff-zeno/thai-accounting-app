import { describe, it, expect } from "vitest";
import {
  whtPaperDeadline,
  whtEfilingDeadline,
  pp30EfilingDeadline,
  pp36Deadline,
  DEFAULT_TAX_CONFIG,
} from "./filing-deadlines";

const config = DEFAULT_TAX_CONFIG;

describe("filing deadlines", () => {
  it("WHT paper filing: period 2026-01 returns 2026-02-07", () => {
    const result = whtPaperDeadline(2026, 1, config);
    expect(result.deadline.toISOString()).toContain("2026-02-06"); // 07 in +07:00 = 06T17:00Z
    expect(result.isExtended).toBe(false);
    expect(result.extensionDays).toBe(0);
  });

  it("WHT e-filing: period 2026-01 returns 2026-02-15", () => {
    const result = whtEfilingDeadline(2026, 1, config);
    expect(result.deadline.toISOString()).toContain("2026-02-14"); // 15 in +07:00 = 14T17:00Z
    expect(result.isExtended).toBe(true);
    expect(result.extensionDays).toBe(8);
  });

  it("PP 30 e-filing: period 2026-01 returns 2026-02-23", () => {
    const result = pp30EfilingDeadline(2026, 1, config);
    expect(result.deadline.toISOString()).toContain("2026-02-22"); // 23 in +07:00 = 22T17:00Z
    expect(result.isExtended).toBe(true);
  });

  it("PP 36: period 2026-01 returns 2026-02-15 (no extension)", () => {
    const result = pp36Deadline(2026, 1, config);
    expect(result.deadline.toISOString()).toContain("2026-02-14");
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
});
