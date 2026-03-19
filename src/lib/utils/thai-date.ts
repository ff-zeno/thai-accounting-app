const BUDDHIST_ERA_OFFSET = 543;

export function toBuddhistYear(gregorianYear: number): number {
  return gregorianYear + BUDDHIST_ERA_OFFSET;
}

export function fromBuddhistYear(buddhistYear: number): number {
  return buddhistYear - BUDDHIST_ERA_OFFSET;
}

const THAI_MONTHS = [
  "มกราคม",
  "กุมภาพันธ์",
  "มีนาคม",
  "เมษายน",
  "พฤษภาคม",
  "มิถุนายน",
  "กรกฎาคม",
  "สิงหาคม",
  "กันยายน",
  "ตุลาคม",
  "พฤศจิกายน",
  "ธันวาคม",
] as const;

/**
 * Format a date string (YYYY-MM-DD or ISO) as a Thai date.
 * Example: "2026-03-18" -> "18 มีนาคม 2569"
 */
export function formatThaiDate(dateStr: string): string {
  const d = new Date(dateStr);
  const day = d.getUTCDate();
  const month = THAI_MONTHS[d.getUTCMonth()];
  const beYear = toBuddhistYear(d.getUTCFullYear());
  return `${day} ${month} ${beYear}`;
}

/**
 * Format a date string as DD/MM/YYYY in Buddhist Era.
 * Example: "2026-03-18" -> "18/03/2569"
 */
export function formatThaiDateShort(dateStr: string): string {
  const d = new Date(dateStr);
  const day = String(d.getUTCDate()).padStart(2, "0");
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const beYear = toBuddhistYear(d.getUTCFullYear());
  return `${day}/${month}/${beYear}`;
}
