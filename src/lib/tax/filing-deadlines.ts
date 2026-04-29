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

export interface ThaiBusinessHoliday {
  date: string;
  holidayNameTh: string;
  holidayNameEn: string;
  sourceAnnouncement: string;
}

const BANGKOK_TZ_OFFSET = "+07:00";

export const THAI_BUSINESS_HOLIDAYS_2026: ThaiBusinessHoliday[] = [
  {
    date: "2026-01-01",
    holidayNameTh: "วันขึ้นปีใหม่",
    holidayNameEn: "New Year's Day",
    sourceAnnouncement: "Bank of Thailand financial institutions holidays 2026",
  },
  {
    date: "2026-01-02",
    holidayNameTh: "วันหยุดพิเศษเพิ่มเติม",
    holidayNameEn: "Additional special holiday",
    sourceAnnouncement: "Bank of Thailand financial institutions holidays 2026",
  },
  {
    date: "2026-03-03",
    holidayNameTh: "วันมาฆบูชา",
    holidayNameEn: "Makha Bucha Day",
    sourceAnnouncement: "Bank of Thailand financial institutions holidays 2026",
  },
  {
    date: "2026-04-06",
    holidayNameTh: "วันจักรี",
    holidayNameEn: "Chakri Memorial Day",
    sourceAnnouncement: "Bank of Thailand financial institutions holidays 2026",
  },
  {
    date: "2026-04-13",
    holidayNameTh: "วันสงกรานต์",
    holidayNameEn: "Songkran Festival",
    sourceAnnouncement: "Bank of Thailand financial institutions holidays 2026",
  },
  {
    date: "2026-04-14",
    holidayNameTh: "วันสงกรานต์",
    holidayNameEn: "Songkran Festival",
    sourceAnnouncement: "Bank of Thailand financial institutions holidays 2026",
  },
  {
    date: "2026-04-15",
    holidayNameTh: "วันสงกรานต์",
    holidayNameEn: "Songkran Festival",
    sourceAnnouncement: "Bank of Thailand financial institutions holidays 2026",
  },
  {
    date: "2026-05-01",
    holidayNameTh: "วันแรงงานแห่งชาติ",
    holidayNameEn: "National Labour Day",
    sourceAnnouncement: "Bank of Thailand financial institutions holidays 2026",
  },
  {
    date: "2026-05-04",
    holidayNameTh: "วันฉัตรมงคล",
    holidayNameEn: "Coronation Day",
    sourceAnnouncement: "Bank of Thailand financial institutions holidays 2026",
  },
  {
    date: "2026-06-01",
    holidayNameTh: "ชดเชยวันวิสาขบูชา",
    holidayNameEn: "Substitution for Visakha Bucha Day",
    sourceAnnouncement: "Bank of Thailand financial institutions holidays 2026",
  },
  {
    date: "2026-06-03",
    holidayNameTh: "วันเฉลิมพระชนมพรรษาสมเด็จพระนางเจ้าฯ พระบรมราชินี",
    holidayNameEn: "H.M. Queen Suthida Bajrasudhabimalalakshana's Birthday",
    sourceAnnouncement: "Bank of Thailand financial institutions holidays 2026",
  },
  {
    date: "2026-07-28",
    holidayNameTh: "วันเฉลิมพระชนมพรรษาพระบาทสมเด็จพระเจ้าอยู่หัว",
    holidayNameEn: "H.M. King Maha Vajiralongkorn Phra Vajiraklaochaoyuhua's Birthday",
    sourceAnnouncement: "Bank of Thailand financial institutions holidays 2026",
  },
  {
    date: "2026-07-29",
    holidayNameTh: "วันอาสาฬหบูชา",
    holidayNameEn: "Asarnha Bucha Day",
    sourceAnnouncement: "Bank of Thailand financial institutions holidays 2026",
  },
  {
    date: "2026-08-12",
    holidayNameTh: "วันแม่แห่งชาติ",
    holidayNameEn: "H.M. Queen Sirikit The Queen Mother's Birthday / Mother's Day",
    sourceAnnouncement: "Bank of Thailand financial institutions holidays 2026",
  },
  {
    date: "2026-10-13",
    holidayNameTh: "วันนวมินทรมหาราช",
    holidayNameEn: "H.M. King Bhumibol Adulyadej The Great Memorial Day",
    sourceAnnouncement: "Bank of Thailand financial institutions holidays 2026",
  },
  {
    date: "2026-10-23",
    holidayNameTh: "วันปิยมหาราช",
    holidayNameEn: "H.M. King Chulalongkorn the Great Memorial Day",
    sourceAnnouncement: "Bank of Thailand financial institutions holidays 2026",
  },
  {
    date: "2026-12-07",
    holidayNameTh: "ชดเชยวันคล้ายวันพระบรมราชสมภพ รัชกาลที่ 9 วันชาติ และวันพ่อแห่งชาติ",
    holidayNameEn: "Substitution for H.M. King Bhumibol Adulyadej the Great's Birthday, National Day and Father's Day",
    sourceAnnouncement: "Bank of Thailand financial institutions holidays 2026",
  },
  {
    date: "2026-12-10",
    holidayNameTh: "วันรัฐธรรมนูญ",
    holidayNameEn: "Constitution Day",
    sourceAnnouncement: "Bank of Thailand financial institutions holidays 2026",
  },
  {
    date: "2026-12-31",
    holidayNameTh: "วันสิ้นปี",
    holidayNameEn: "New Year's Eve",
    sourceAnnouncement: "Bank of Thailand financial institutions holidays 2026",
  },
] as const;

function bangkokDateString(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function formatBangkokDate(date: Date): string {
  return bangkokDateString(date);
}

function bangkokDate(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00${BANGKOK_TZ_OFFSET}`);
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

export function isThaiBusinessDay(
  date: Date,
  holidays: readonly ThaiBusinessHoliday[] = THAI_BUSINESS_HOLIDAYS_2026
): boolean {
  const localDate = bangkokDateString(date);
  const day = new Date(`${localDate}T12:00:00Z`).getUTCDay();
  if (day === 0 || day === 6) return false;
  return !holidays.some((holiday) => holiday.date === localDate);
}

export function adjustToNextThaiBusinessDay(
  date: Date,
  holidays: readonly ThaiBusinessHoliday[] = THAI_BUSINESS_HOLIDAYS_2026
): Date {
  let adjusted = date;
  while (!isThaiBusinessDay(adjusted, holidays)) {
    adjusted = addDays(adjusted, 1);
  }
  return adjusted;
}

/**
 * Calculates the filing deadline in Asia/Bangkok timezone.
 * If the deadline falls on a weekend or configured Thai holiday, it rolls to
 * the next business day.
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
  const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(dayOfMonth).padStart(2, "0")}`;
  return adjustToNextThaiBusinessDay(bangkokDate(dateStr));
}

/** WHT filing deadline (PND 2/3/53/54) — paper filing */
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

/** WHT filing deadline (PND 2/3/53/54) — e-filing with extension */
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
