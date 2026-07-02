import { fromBuddhistYear } from "@/lib/utils/thai-date";

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Thai documents frequently carry Buddhist Era years (CE + 543). A year in
 * 2500-2600 BE maps to 1957-2057 CE — far outside any plausible CE invoice
 * year, so it is almost certainly an unconverted BE date.
 */
const BE_YEAR_MIN = 2500;
const BE_YEAR_MAX = 2600;

/** Documents older than this are implausible for an active accounting org. */
const MIN_PLAUSIBLE_YEAR = 2000;

export interface ExtractedDateCheck {
  /** Value to persist: the input when parseable, undefined when cleared. */
  value: string | undefined;
  warnings: string[];
  /** True when a reviewer must confirm or correct this date. */
  needsReview: boolean;
}

/**
 * Plausibility-check an AI-extracted date before it reaches a Postgres `date`
 * column. Flags, never throws — AI suggests, humans confirm:
 *
 * - Malformed / impossible calendar dates are CLEARED (they would throw at
 *   insert) with a warning naming the raw value.
 * - Suspect-but-valid dates (unconverted Buddhist Era years, implausibly old
 *   or far-future years) are KEPT so the reviewer sees and corrects them,
 *   with a warning and a forced needs-review flag.
 *
 * Pure: `today` is injected so Inngest step retries and tests are
 * deterministic — never read the clock in here.
 */
export function checkExtractedDate(
  field: "issueDate" | "dueDate",
  raw: string | undefined,
  today: Date
): ExtractedDateCheck {
  if (raw === undefined) {
    return { value: undefined, warnings: [], needsReview: false };
  }
  // Empty/whitespace-only means "no date found" — treat as absent (the
  // document writer already coerces "" to NULL); not worth a review flag.
  if (raw.trim() === "") {
    return { value: undefined, warnings: [], needsReview: false };
  }

  const match = ISO_DATE_PATTERN.exec(raw);
  if (!match) {
    return {
      value: undefined,
      warnings: [
        `${field} "${raw}" is not a valid YYYY-MM-DD date — cleared for manual review`,
      ],
      needsReview: true,
    };
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  const isRealDate =
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day;
  if (!isRealDate) {
    return {
      value: undefined,
      warnings: [
        `${field} "${raw}" is not a real calendar date — cleared for manual review`,
      ],
      needsReview: true,
    };
  }

  if (year >= BE_YEAR_MIN && year <= BE_YEAR_MAX) {
    const suggestedCe = `${fromBuddhistYear(year)}-${match[2]}-${match[3]}`;
    return {
      value: raw,
      warnings: [
        `${field} "${raw}" looks like an unconverted Buddhist Era year — suggested CE date: ${suggestedCe}. Kept as extracted for manual review`,
      ],
      needsReview: true,
    };
  }

  const maxPlausibleYear = today.getUTCFullYear() + 1;
  if (year < MIN_PLAUSIBLE_YEAR || year > maxPlausibleYear) {
    return {
      value: raw,
      warnings: [
        `${field} "${raw}" has an implausible year (${year}; expected ${MIN_PLAUSIBLE_YEAR}-${maxPlausibleYear}) — kept as extracted for manual review`,
      ],
      needsReview: true,
    };
  }

  return { value: raw, warnings: [], needsReview: false };
}
