import { describe, expect, it } from "vitest";
import { computeNextFilingDeadline, formatDeadlineChip } from "./badges";
import type { TaxConfigValues } from "@/lib/tax/filing-deadlines";

const CONFIG: TaxConfigValues = {
  whtPaperDeadlineDay: 7,
  whtEfilingDeadlineDay: 15,
  pp30EfilingDeadlineDay: 23,
  pp36DeadlineDay: 15,
};

describe("computeNextFilingDeadline", () => {
  it("picks the earliest deadline still ahead this month", () => {
    expect(computeNextFilingDeadline(CONFIG, "2026-08-02")).toEqual({
      daysRemaining: 5,
      dateIso: "2026-08-07",
    });
  });

  it("returns 0 days when a deadline is today", () => {
    expect(computeNextFilingDeadline(CONFIG, "2026-08-07")).toEqual({
      daysRemaining: 0,
      dateIso: "2026-08-07",
    });
  });

  it("skips passed deadlines and moves to the next one in the month", () => {
    expect(computeNextFilingDeadline(CONFIG, "2026-08-16")).toEqual({
      daysRemaining: 7,
      dateIso: "2026-08-23",
    });
  });

  it("rolls into next month after the last deadline of the month", () => {
    expect(computeNextFilingDeadline(CONFIG, "2026-08-24")).toEqual({
      daysRemaining: 14,
      dateIso: "2026-09-07",
    });
  });

  it("rolls across the year boundary", () => {
    expect(computeNextFilingDeadline(CONFIG, "2026-12-24")).toEqual({
      daysRemaining: 14,
      dateIso: "2027-01-07",
    });
  });

  it("clamps a deadline day past the end of a short month", () => {
    const config: TaxConfigValues = { ...CONFIG, pp30EfilingDeadlineDay: 31 };
    // Non-leap February: day 31 clamps to Feb 28.
    expect(computeNextFilingDeadline(config, "2027-02-25")).toEqual({
      daysRemaining: 3,
      dateIso: "2027-02-28",
    });
  });

  it("throws on a malformed date", () => {
    expect(() => computeNextFilingDeadline(CONFIG, "not-a-date")).toThrow(
      /bad date/
    );
  });
});

describe("formatDeadlineChip", () => {
  it("formats days as a compact chip", () => {
    expect(formatDeadlineChip(0)).toBe("0d");
    expect(formatDeadlineChip(7)).toBe("7d");
    expect(formatDeadlineChip(21)).toBe("21d");
  });
});
