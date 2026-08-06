import { describe, expect, it, vi } from "vitest";
import {
  computeNextFilingDeadline,
  formatDeadlineChip,
  getNavBadges,
} from "./badges";
import type { TaxConfigValues } from "@/lib/tax/filing-deadlines";

const getAttentionCounts = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/queries/dashboard", () => ({ getAttentionCounts }));
vi.mock("@/lib/db/queries/tax-config", () => ({
  getFilingDeadlineConfig: async () => ({
    whtPaperDeadlineDay: 7,
    whtEfilingDeadlineDay: 15,
    pp30EfilingDeadlineDay: 23,
    pp36DeadlineDay: 15,
  }),
}));

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

describe("getNavBadges", () => {
  // Income and Expenses became separate nav entries on 2026-08-05, each with
  // its own badge. Both read the same getAttentionCounts the Home cockpit
  // reads — DESIGN.md forbids the two surfaces disagreeing — so what is
  // pinned here is that each badge takes its OWN side's count, not the total
  // and not the other side's.
  it("maps each direction's review count to its own badge", async () => {
    getAttentionCounts.mockResolvedValue({
      documentsNeedingReview: 11,
      incomeNeedingReview: 4,
      expensesNeedingReview: 7,
      unmatchedTransactions: 3,
      pendingAiSuggestions: 2,
    });

    const badges = await getNavBadges("org-1");

    expect(badges.income).toBe(4);
    expect(badges.expenses).toBe(7);
    expect(badges.bank).toBe(3);
    expect(badges.income + badges.expenses).toBe(11);
  });

  it("keeps a zero side at zero rather than falling back to the total", async () => {
    getAttentionCounts.mockResolvedValue({
      documentsNeedingReview: 5,
      incomeNeedingReview: 0,
      expensesNeedingReview: 5,
      unmatchedTransactions: 0,
      pendingAiSuggestions: 0,
    });

    const badges = await getNavBadges("org-2");

    expect(badges.income).toBe(0);
    expect(badges.expenses).toBe(5);
  });
});
