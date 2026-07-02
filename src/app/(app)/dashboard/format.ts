import { formatAmountThb, toSatangOrZero } from "@/lib/utils/money";

/**
 * Format a numeric string as Thai Baht with commas and 2 decimal places.
 */
export function formatThb(value: string): string {
  return formatAmountThb(value);
}

/**
 * Compute percentage change between two numeric strings.
 * Returns null if previous is zero (no meaningful comparison).
 */
export function percentChange(
  current: string,
  previous: string
): { delta: number; direction: "up" | "down" | "flat" } | null {
  // Parse via integer satang; the change itself is a ratio, not money.
  const curr = toSatangOrZero(current);
  const prev = toSatangOrZero(previous);

  if (prev === 0) return null;

  const change = ((curr - prev) / prev) * 100;
  const direction = change > 0.01 ? "up" : change < -0.01 ? "down" : "flat";

  return {
    delta: Math.abs(Math.round(change * 10) / 10),
    direction,
  };
}
