import { describe, it, expect } from "vitest";
import {
  getWhtFilingDeadline,
  getYearlyDeadlines,
  computeFilingStatus,
  getMonthName,
  formatFormType,
} from "./filing-calendar";

describe("getWhtFilingDeadline", () => {
  it("returns 15th of next month for e-filing (default)", () => {
    const deadline = getWhtFilingDeadline(2026, 3);
    // March 2026 period -> deadline April 15, 2026
    expect(deadline.getFullYear()).toBe(2026);
    expect(deadline.getMonth()).toBe(3); // April (0-indexed)
    expect(deadline.getDate()).toBe(15);
  });

  it("handles December period rolling to January of next year", () => {
    const deadline = getWhtFilingDeadline(2026, 12);
    // December 2026 period -> deadline January 15, 2027
    expect(deadline.getFullYear()).toBe(2027);
    expect(deadline.getMonth()).toBe(0); // January
    expect(deadline.getDate()).toBe(15);
  });

  it("handles January period", () => {
    const deadline = getWhtFilingDeadline(2026, 1);
    // January 2026 period -> deadline February 15, 2026
    expect(deadline.getFullYear()).toBe(2026);
    expect(deadline.getMonth()).toBe(1); // February
    expect(deadline.getDate()).toBe(15);
  });
});

describe("getYearlyDeadlines", () => {
  it("returns 36 entries (12 months x 3 form types)", () => {
    const deadlines = getYearlyDeadlines(2026);
    expect(deadlines).toHaveLength(36);
  });

  it("includes all form types for each month", () => {
    const deadlines = getYearlyDeadlines(2026);
    const marchDeadlines = deadlines.filter((d) => d.month === 3);
    expect(marchDeadlines).toHaveLength(3);
    expect(marchDeadlines.map((d) => d.formType).sort()).toEqual([
      "pnd3",
      "pnd53",
      "pnd54",
    ]);
  });

  it("all deadlines are e-filing by default", () => {
    const deadlines = getYearlyDeadlines(2026);
    expect(deadlines.every((d) => d.isEfiling)).toBe(true);
  });
});

describe("computeFilingStatus", () => {
  it("returns 'filed' when DB status is filed", () => {
    const deadline = new Date("2026-04-15");
    expect(computeFilingStatus("filed", deadline)).toBe("filed");
  });

  it("returns 'paid' when DB status is paid", () => {
    const deadline = new Date("2026-04-15");
    expect(computeFilingStatus("paid", deadline)).toBe("paid");
  });

  it("returns 'overdue' when deadline has passed and not filed", () => {
    const pastDeadline = new Date("2020-01-01");
    const now = new Date("2026-03-18");
    expect(computeFilingStatus("draft", pastDeadline, now)).toBe("overdue");
  });

  it("returns 'due_soon' when within 7 days of deadline", () => {
    const deadline = new Date("2026-03-22");
    const now = new Date("2026-03-18");
    expect(computeFilingStatus("draft", deadline, now)).toBe("due_soon");
  });

  it("returns 'upcoming' when more than 7 days away", () => {
    const deadline = new Date("2026-04-15");
    const now = new Date("2026-03-18");
    expect(computeFilingStatus("draft", deadline, now)).toBe("upcoming");
  });

  it("returns 'upcoming' when no DB filing exists yet (null status)", () => {
    const deadline = new Date("2026-12-15");
    const now = new Date("2026-03-18");
    expect(computeFilingStatus(null, deadline, now)).toBe("upcoming");
  });

  it("returns 'overdue' for null status when past deadline", () => {
    const deadline = new Date("2026-02-15");
    const now = new Date("2026-03-18");
    expect(computeFilingStatus(null, deadline, now)).toBe("overdue");
  });
});

describe("getMonthName", () => {
  it("returns English month abbreviation by default", () => {
    expect(getMonthName(1)).toBe("Jan");
    expect(getMonthName(12)).toBe("Dec");
  });

  it("returns empty string for invalid month", () => {
    expect(getMonthName(0)).toBe("");
    expect(getMonthName(13)).toBe("");
  });
});

describe("formatFormType", () => {
  it("formats pnd3", () => {
    expect(formatFormType("pnd3")).toBe("PND 3");
  });
  it("formats pnd53", () => {
    expect(formatFormType("pnd53")).toBe("PND 53");
  });
  it("formats pnd54", () => {
    expect(formatFormType("pnd54")).toBe("PND 54");
  });
});
