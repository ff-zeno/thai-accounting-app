export interface TaxConfigValues {
  whtPaperDeadlineDay: number;
  whtEfilingDeadlineDay: number;
  pp30EfilingDeadlineDay: number;
  pp36DeadlineDay: number;
}

interface DeadlineResult {
  deadline: Date;
  isExtended: boolean;
  extensionDays: number;
}

/**
 * Calculates the filing deadline in Asia/Bangkok timezone.
 * If the deadline falls on a weekend or holiday, NO adjustment is made (holiday calendar is V2).
 */
function deadlineForDay(
  periodYear: number,
  periodMonth: number,
  dayOfMonth: number
): Date {
  // Filing deadline is in the month AFTER the tax period
  const nextMonth = periodMonth + 1;
  const year = nextMonth > 12 ? periodYear + 1 : periodYear;
  const month = nextMonth > 12 ? 1 : nextMonth;

  // Build date string as Asia/Bangkok local date
  const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(dayOfMonth).padStart(2, "0")}T00:00:00+07:00`;
  return new Date(dateStr);
}

/** WHT filing deadline (PND 3/53/54) — paper filing */
export function whtPaperDeadline(
  periodYear: number,
  periodMonth: number,
  config: TaxConfigValues
): DeadlineResult {
  return {
    deadline: deadlineForDay(periodYear, periodMonth, config.whtPaperDeadlineDay),
    isExtended: false,
    extensionDays: 0,
  };
}

/** WHT filing deadline (PND 3/53/54) — e-filing with extension */
export function whtEfilingDeadline(
  periodYear: number,
  periodMonth: number,
  config: TaxConfigValues
): DeadlineResult {
  const extensionDays =
    config.whtEfilingDeadlineDay - config.whtPaperDeadlineDay;
  return {
    deadline: deadlineForDay(
      periodYear,
      periodMonth,
      config.whtEfilingDeadlineDay
    ),
    isExtended: true,
    extensionDays,
  };
}

/** VAT PP 30 e-filing deadline */
export function pp30EfilingDeadline(
  periodYear: number,
  periodMonth: number,
  config: TaxConfigValues
): DeadlineResult {
  const extensionDays =
    config.pp30EfilingDeadlineDay - config.whtPaperDeadlineDay;
  return {
    deadline: deadlineForDay(
      periodYear,
      periodMonth,
      config.pp30EfilingDeadlineDay
    ),
    isExtended: true,
    extensionDays,
  };
}

/** VAT PP 36 deadline — reverse charge, NO e-filing extension, separate from PP 30 */
export function pp36Deadline(
  periodYear: number,
  periodMonth: number,
  config: TaxConfigValues
): DeadlineResult {
  return {
    deadline: deadlineForDay(periodYear, periodMonth, config.pp36DeadlineDay),
    isExtended: false,
    extensionDays: 0,
  };
}

/** Default config values matching seed data */
export const DEFAULT_TAX_CONFIG: TaxConfigValues = {
  whtPaperDeadlineDay: 7,
  whtEfilingDeadlineDay: 15,
  pp30EfilingDeadlineDay: 23,
  pp36DeadlineDay: 15,
};
