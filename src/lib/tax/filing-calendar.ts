import {
  whtEfilingDeadline,
  whtPaperDeadline,
  DEFAULT_TAX_CONFIG,
  type TaxConfigValues,
} from "./filing-deadlines";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FilingFormType = "pnd3" | "pnd53" | "pnd54";

export type FilingStatus = "upcoming" | "due_soon" | "overdue" | "filed" | "paid";

export interface MonthlyDeadline {
  year: number;
  month: number;
  formType: FilingFormType;
  deadline: Date;
  isEfiling: boolean;
}

export interface CalendarEntry {
  year: number;
  month: number;
  formType: FilingFormType;
  deadline: Date;
  status: FilingStatus;
  filingId: string | null;
  totalBaseAmount: string | null;
  totalWhtAmount: string | null;
}

// ---------------------------------------------------------------------------
// Deadline calculation
// ---------------------------------------------------------------------------

const FORM_TYPES: FilingFormType[] = ["pnd3", "pnd53", "pnd54"];

/**
 * Get WHT filing deadline for a given period.
 * Uses e-filing deadline by default (most common for this app).
 */
export function getWhtFilingDeadline(
  year: number,
  month: number,
  isEfiling = true,
  config: TaxConfigValues = DEFAULT_TAX_CONFIG
): Date {
  // All WHT form types (PND 3/53/54) share the same deadline
  const result = isEfiling
    ? whtEfilingDeadline(year, month, config)
    : whtPaperDeadline(year, month, config);
  return result.deadline;
}

/**
 * Generate all monthly deadlines for a year across all form types.
 */
export function getYearlyDeadlines(
  year: number,
  config: TaxConfigValues = DEFAULT_TAX_CONFIG
): MonthlyDeadline[] {
  const deadlines: MonthlyDeadline[] = [];

  for (let month = 1; month <= 12; month++) {
    for (const formType of FORM_TYPES) {
      const { deadline } = whtEfilingDeadline(year, month, config);
      deadlines.push({
        year,
        month,
        formType,
        deadline,
        isEfiling: true,
      });
    }
  }

  return deadlines;
}

/**
 * Determine the display status for a filing based on its DB status and deadline.
 */
export function computeFilingStatus(
  dbStatus: "draft" | "filed" | "paid" | null,
  deadline: Date,
  now: Date = new Date()
): FilingStatus {
  if (dbStatus === "paid") return "paid";
  if (dbStatus === "filed") return "filed";

  const msPerDay = 24 * 60 * 60 * 1000;
  const daysUntilDeadline = (deadline.getTime() - now.getTime()) / msPerDay;

  if (daysUntilDeadline < 0) return "overdue";
  if (daysUntilDeadline <= 7) return "due_soon";
  return "upcoming";
}

const MONTH_NAMES_TH = [
  "\u0E21.\u0E04.",     // ม.ค.
  "\u0E01.\u0E1E.",     // ก.พ.
  "\u0E21\u0E35.\u0E04.", // มี.ค.
  "\u0E40\u0E21.\u0E22.", // เม.ย.
  "\u0E1E.\u0E04.",     // พ.ค.
  "\u0E21\u0E34.\u0E22.", // มิ.ย.
  "\u0E01.\u0E04.",     // ก.ค.
  "\u0E2A.\u0E04.",     // ส.ค.
  "\u0E01.\u0E22.",     // ก.ย.
  "\u0E15.\u0E04.",     // ต.ค.
  "\u0E1E.\u0E22.",     // พ.ย.
  "\u0E18.\u0E04.",     // ธ.ค.
] as const;

const MONTH_NAMES_EN = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

/** Get short month name */
export function getMonthName(month: number, locale: "en" | "th" = "en"): string {
  const idx = month - 1;
  if (idx < 0 || idx > 11) return "";
  return locale === "th" ? MONTH_NAMES_TH[idx] : MONTH_NAMES_EN[idx];
}

/** Format form type for display */
export function formatFormType(formType: FilingFormType): string {
  switch (formType) {
    case "pnd3":
      return "PND 3";
    case "pnd53":
      return "PND 53";
    case "pnd54":
      return "PND 54";
  }
}
