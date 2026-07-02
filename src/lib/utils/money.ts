/**
 * Integer-satang money arithmetic.
 *
 * All ledger amounts are NUMERIC(14, 2) strings. Floating-point math on them
 * accumulates representation error (0.1 + 0.2 !== 0.3), so this module keeps
 * every intermediate value in integer satang (1 THB = 100 satang).
 *
 * Satang values are plain `number`s: NUMERIC(14, 2) maxes out at 10^12 THB,
 * i.e. 10^14 satang — far below Number.MAX_SAFE_INTEGER (~9e15). Every
 * operation guards with Number.isSafeInteger and throws on violation rather
 * than silently losing precision.
 *
 * Parsing is string-based (regex + integer math) — never parseFloat — and
 * rounds digits past 2dp half-away-from-zero.
 */

const AMOUNT_PATTERN = /^(-?)(\d+)(?:\.(\d+))?$/;

function assertSafe(satang: number, context: string): number {
  if (!Number.isSafeInteger(satang)) {
    throw new RangeError(`money: unsafe integer in ${context}: ${satang}`);
  }
  return satang;
}

/**
 * Parse a decimal string into integer satang. Returns null on malformed
 * input (empty, non-numeric, multiple dots, scientific notation, etc.).
 * Digits beyond 2dp are rounded half-away-from-zero.
 */
export function toSatang(value: string | null | undefined): number | null {
  if (value == null) return null;
  const trimmed = value.trim();
  const match = AMOUNT_PATTERN.exec(trimmed);
  if (!match) return null;

  const [, sign, whole, fraction = ""] = match;
  const cents = (fraction + "00").slice(0, 2);
  let satang = Number(whole) * 100 + Number(cents);
  // Round half-away-from-zero on the third fractional digit.
  if (fraction.length > 2 && Number(fraction[2]) >= 5) {
    satang += 1;
  }
  assertSafe(satang, `toSatang("${trimmed}")`);
  return sign === "-" ? -satang : satang;
}

/** Like toSatang, but malformed/missing input becomes 0. */
export function toSatangOrZero(value: string | null | undefined): number {
  return toSatang(value) ?? 0;
}

/**
 * Render integer satang as a canonical NUMERIC(14, 2) string: "1234.50".
 * Negative zero normalizes to "0.00".
 */
export function fromSatang(satang: number): string {
  assertSafe(satang, `fromSatang(${satang})`);
  const abs = Math.abs(satang);
  const whole = Math.floor(abs / 100);
  const cents = String(abs % 100).padStart(2, "0");
  const sign = satang < 0 && abs !== 0 ? "-" : "";
  return `${sign}${whole}.${cents}`;
}

/** Sum satang values with safe-integer guard at each step. */
export function sumSatang(values: Iterable<number>): number {
  let total = 0;
  for (const value of values) {
    assertSafe(value, "sumSatang input");
    total = assertSafe(total + value, "sumSatang accumulation");
  }
  return total;
}

/** Sum decimal-string amounts (malformed inputs count as 0) into a canonical string. */
export function sumAmounts(values: Iterable<string | null | undefined>): string {
  let total = 0;
  for (const value of values) {
    total = assertSafe(total + toSatangOrZero(value), "sumAmounts accumulation");
  }
  return fromSatang(total);
}

/** Exact equality of two decimal-string amounts (malformed → never equal). */
export function amountsEqual(
  a: string | null | undefined,
  b: string | null | undefined
): boolean {
  const satangA = toSatang(a);
  const satangB = toSatang(b);
  return satangA !== null && satangB !== null && satangA === satangB;
}

/** True when the amount parses to exactly zero satang. */
export function isZeroAmount(value: string | null | undefined): boolean {
  return toSatang(value) === 0;
}

/**
 * |a - b| / max(|a|, |b|) as a plain number — ratios aren't money.
 * Returns 0 when both are zero, 1 when exactly one is zero/malformed.
 */
export function percentageDiff(
  a: string | null | undefined,
  b: string | null | undefined
): number {
  const satangA = Math.abs(toSatangOrZero(a));
  const satangB = Math.abs(toSatangOrZero(b));
  const max = Math.max(satangA, satangB);
  if (max === 0) return 0;
  return Math.abs(satangA - satangB) / max;
}

/**
 * Display formatting: "1,234.50" (en-US grouping). Null/undefined/malformed
 * input renders "0.00" — display helpers never throw on dirty data.
 */
export function formatAmount(value: string | number | null | undefined): string {
  let satang: number | null;
  if (typeof value === "number") {
    satang = Number.isFinite(value) ? Math.round(value * 100) : null;
    if (satang !== null && !Number.isSafeInteger(satang)) satang = null;
  } else {
    satang = toSatang(value);
  }
  if (satang === null) return "0.00";

  const canonical = fromSatang(satang);
  const [whole, cents] = canonical.replace("-", "").split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${satang < 0 ? "-" : ""}${grouped}.${cents}`;
}

/** Display formatting with THB prefix: "฿1,234.50". */
export function formatAmountThb(value: string | number | null | undefined): string {
  return `฿${formatAmount(value)}`;
}
