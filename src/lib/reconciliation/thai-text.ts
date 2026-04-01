/**
 * Thai/English text normalization utilities for reconciliation matching.
 *
 * Handles the messy reality of Thai bank statement counterparty names:
 * - Mixed Thai/English company names
 * - Inconsistent use of บริษัท vs บจก. vs Co., Ltd.
 * - Bank prefixes like "From Acct", "To Acct"
 * - Reference codes embedded in descriptions
 * - Thai honorifics (นาย, น.ส., นาง)
 */

// ---------------------------------------------------------------------------
// Thai company suffixes and prefixes
// ---------------------------------------------------------------------------

const THAI_COMPANY_SUFFIXES = [
  "บริษัท",
  "บจก.",
  "บจก",
  "จำกัด",
  "มหาชน",
  "(มหาชน)",
  "ห้างหุ้นส่วน",
  "หจก.",
  "หจก",
  "ห้างหุ้นส่วนจำกัด",
  "สมาคม",
  "มูลนิธิ",
];

const ENGLISH_COMPANY_SUFFIXES = [
  /co\.?\s*,?\s*ltd\.?/gi,
  /company\s+limited/gi,
  /inc\.?/gi,
  /corp\.?/gi,
  /corporation/gi,
  /limited/gi,
  /plc\.?/gi,
  /llc\.?/gi,
  /\(thailand\)/gi,
  /\(ประเทศไทย\)/gi,
];

// Ordered longest-first to prevent partial matches (นาง before นางสาว)
const THAI_HONORIFICS = [
  "นางสาว",
  "พ.ต.อ.",
  "พ.ต.ท.",
  "พ.ต.ต.",
  "น.ส.",
  "นาย",
  "นาง",
  "ดร.",
  "ศ.",
  "รศ.",
  "ผศ.",
  "พล.",
];

const BANK_PREFIXES = [
  /^from\s+acct\.?\s*/i,
  /^to\s+acct\.?\s*/i,
  /^transfer\s+to\s*/i,
  /^transfer\s+from\s*/i,
  /^payment\s+to\s*/i,
  /^payment\s+from\s*/i,
  /^โอนเงินให้\s*/,
  /^โอนเงินจาก\s*/,
  /^รับโอนจาก\s*/,
  /^จ่ายเงินให้\s*/,
];

// Reference code patterns often found in bank descriptions
const REFERENCE_CODE_PATTERNS = [
  /\bref\.?\s*:?\s*\S+/gi,
  /\b[A-Z]{2,4}\d{6,}/g, // e.g., TH20260301123456
  /\d{3}-\d{1}-\d{5}-\d{1}/g, // e.g., 000-0-00000-0 (account number)
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Normalize a company name for matching: strip suffixes, lowercase, trim.
 * Works for both Thai and English company names.
 */
export function normalizeCompanyName(text: string): string {
  let normalized = text.toLowerCase();

  // Strip Thai company suffixes
  for (const suffix of THAI_COMPANY_SUFFIXES) {
    normalized = normalized.replaceAll(suffix.toLowerCase(), "");
  }

  // Strip English company suffixes
  for (const pattern of ENGLISH_COMPANY_SUFFIXES) {
    normalized = normalized.replace(pattern, "");
  }

  // Strip empty parens left after suffix removal
  normalized = normalized.replace(/\(\s*\)/g, "");

  // Collapse whitespace
  return normalized.replace(/\s+/g, " ").trim();
}

/**
 * Strip Thai honorifics from a person's name.
 */
export function stripHonorifics(text: string): string {
  let stripped = text;
  for (const h of THAI_HONORIFICS) {
    if (stripped.startsWith(h)) {
      stripped = stripped.slice(h.length).trim();
      break; // Only strip one honorific
    }
  }
  return stripped;
}

/**
 * Compute Jaccard similarity on word tokens.
 * Handles mixed Thai/English text by splitting on whitespace.
 * Returns 0.0 - 1.0.
 */
export function tokenOverlap(a: string, b: string): number {
  const tokensA = new Set(
    normalizeCompanyName(a)
      .split(/\s+/)
      .filter((t) => t.length > 0)
  );
  const tokensB = new Set(
    normalizeCompanyName(b)
      .split(/\s+/)
      .filter((t) => t.length > 0)
  );

  if (tokensA.size === 0 || tokensB.size === 0) return 0;

  let intersection = 0;
  for (const token of tokensA) {
    if (tokensB.has(token)) intersection++;
  }

  const union = new Set([...tokensA, ...tokensB]).size;
  return intersection / union;
}

/**
 * Full normalization pipeline for bank transaction counterparty text.
 * Strips bank prefixes, reference codes, normalizes company name.
 */
export function normalizeCounterparty(text: string): string {
  let normalized = text;

  // Strip bank prefixes
  for (const pattern of BANK_PREFIXES) {
    normalized = normalized.replace(pattern, "");
  }

  // Strip reference codes
  for (const pattern of REFERENCE_CODE_PATTERNS) {
    normalized = normalized.replace(pattern, "");
  }

  // Normalize as company name
  return normalizeCompanyName(normalized);
}
