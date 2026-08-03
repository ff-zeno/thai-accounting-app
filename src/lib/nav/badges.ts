import { cache } from "react";
import type { TaxConfigValues } from "@/lib/tax/filing-deadlines";

/**
 * Sidebar badge payload. Counts mirror the Home cockpit's attention numbers
 * (same queries, so the two surfaces can never disagree); the tax chip is
 * pure calendar math — it does not know whether the filing is already done.
 * Badges are advisory and refresh per navigation, never by polling.
 */
export interface NavBadges {
  /** Documents needing review (= cockpit "Documents to review"). */
  documents: number;
  /** Unmatched bank transactions (= cockpit "Unmatched bank transactions"). */
  bank: number;
  /** Short next-filing-deadline chip, e.g. "7d". */
  tax: string;
}

export interface NextFilingDeadline {
  /** Whole days from today to the deadline; 0 = due today. */
  daysRemaining: number;
  /** Deadline date as YYYY-MM-DD. */
  dateIso: string;
}

function daysInMonth(year: number, month: number): number {
  // Day 0 of the next month is the last day of `month` (1-based).
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Next monthly filing deadline on or after `todayIso`, from day-of-month
 * config alone. Deadline days past the end of a short month clamp to its
 * last day. Pure — the caller supplies today (Asia/Bangkok pinned).
 */
export function computeNextFilingDeadline(
  config: TaxConfigValues,
  todayIso: string
): NextFilingDeadline {
  const [year, month, day] = todayIso.split("-").map(Number);
  if (!year || !month || !day) {
    throw new Error(`computeNextFilingDeadline: bad date "${todayIso}"`);
  }
  const today = Date.UTC(year, month - 1, day);

  const deadlineDays = [
    config.whtPaperDeadlineDay,
    config.whtEfilingDeadlineDay,
    config.pp30EfilingDeadlineDay,
    config.pp36DeadlineDay,
  ];

  let best: number | null = null;
  for (const deadlineDay of deadlineDays) {
    // This month's occurrence, else next month's.
    for (const offset of [0, 1]) {
      const y = month + offset > 12 ? year + 1 : year;
      const m = ((month - 1 + offset) % 12) + 1;
      const clamped = Math.min(deadlineDay, daysInMonth(y, m));
      const candidate = Date.UTC(y, m - 1, clamped);
      if (candidate >= today) {
        if (best === null || candidate < best) best = candidate;
        break;
      }
    }
  }

  // Unreachable with 1..31 config days, but keep the return type honest.
  if (best === null) {
    throw new Error("computeNextFilingDeadline: no candidate deadline");
  }

  const daysRemaining = Math.round((best - today) / 86_400_000);
  const bestDate = new Date(best);
  const dateIso = [
    bestDate.getUTCFullYear(),
    String(bestDate.getUTCMonth() + 1).padStart(2, "0"),
    String(bestDate.getUTCDate()).padStart(2, "0"),
  ].join("-");
  return { daysRemaining, dateIso };
}

/** Language-neutral chip text for the sidebar Tax entry. */
export function formatDeadlineChip(daysRemaining: number): string {
  return `${daysRemaining}d`;
}

function bangkokTodayIso(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/**
 * Badge counts for the app shell, deduped per request via React cache().
 * Lazy imports keep the pure date math above loadable without DATABASE_URL.
 */
export const getNavBadges = cache(async (orgId: string): Promise<NavBadges> => {
  const [{ getAttentionCounts }, { getFilingDeadlineConfig }] =
    await Promise.all([
      import("@/lib/db/queries/dashboard"),
      import("@/lib/db/queries/tax-config"),
    ]);

  const [attention, config] = await Promise.all([
    getAttentionCounts(orgId),
    getFilingDeadlineConfig(),
  ]);

  const next = computeNextFilingDeadline(config, bangkokTodayIso());
  return {
    documents: attention.documentsNeedingReview,
    bank: attention.unmatchedTransactions,
    tax: formatDeadlineChip(next.daysRemaining),
  };
});
