/**
 * Format a numeric string as Thai Baht with commas and 2 decimal places.
 */
export function formatThb(value: string): string {
  const num = parseFloat(value);
  if (isNaN(num)) return "0.00 THB";
  return `${num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} THB`;
}

/**
 * Compute percentage change between two numeric strings.
 * Returns null if previous is zero (no meaningful comparison).
 */
export function percentChange(
  current: string,
  previous: string
): { delta: number; direction: "up" | "down" | "flat" } | null {
  const curr = parseFloat(current);
  const prev = parseFloat(previous);

  if (prev === 0) return null;

  const change = ((curr - prev) / prev) * 100;
  const direction = change > 0.01 ? "up" : change < -0.01 ? "down" : "flat";

  return {
    delta: Math.abs(Math.round(change * 10) / 10),
    direction,
  };
}
