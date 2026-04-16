/**
 * Field-level value normalization for extraction diff comparison.
 *
 * Used by the extraction learning loop to compare AI output vs user
 * corrections. Normalization removes cosmetic differences (whitespace,
 * commas, BE dates) so only semantic changes count as corrections.
 */

/**
 * Normalize a field value for comparison purposes.
 * Returns a canonical string form. null/undefined → empty string.
 */
export function normalizeFieldValue(
  fieldName: string,
  value: string | number | null | undefined
): string {
  if (value == null) return "";
  const str = String(value).trim();
  if (str === "") return "";

  const normalizer = FIELD_NORMALIZERS[fieldName];
  if (normalizer) return normalizer(str);

  // Default: collapse whitespace + lowercase
  return normalizeText(str);
}

/**
 * Compare two field values after normalization.
 * Returns true if values are semantically equivalent.
 */
export function fieldValuesEqual(
  fieldName: string,
  a: string | number | null | undefined,
  b: string | number | null | undefined
): boolean {
  return normalizeFieldValue(fieldName, a) === normalizeFieldValue(fieldName, b);
}

// --- Normalizer functions per field type ---

/** Amounts: strip commas/spaces, normalize to plain decimal. "1,234.56" → "1234.56" */
function normalizeAmount(value: string): string {
  // Strip commas, spaces, currency symbols
  const cleaned = value.replace(/[,\s฿$€¥£]/g, "");
  const num = parseFloat(cleaned);
  if (isNaN(num)) return cleaned.toLowerCase();
  // Normalize to 2 decimal places for amounts
  return num.toFixed(2);
}

/** Rates/percentages: normalize to plain decimal. "7" → "7.0000", "7%" → "7.0000" */
function normalizeRate(value: string): string {
  const cleaned = value.replace(/[%\s]/g, "");
  const num = parseFloat(cleaned);
  if (isNaN(num)) return cleaned.toLowerCase();
  return num.toFixed(4);
}

/** Dates: normalize to YYYY-MM-DD, converting Buddhist Era if detected. */
function normalizeDate(value: string): string {
  // Already YYYY-MM-DD
  const isoMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    const year = parseInt(isoMatch[1], 10);
    // Buddhist Era: year > 2400 is likely BE
    const ceYear = year > 2400 ? year - 543 : year;
    return `${ceYear}-${isoMatch[2]}-${isoMatch[3]}`;
  }

  // DD/MM/YYYY or DD-MM-YYYY (common Thai format)
  const dmyMatch = value.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (dmyMatch) {
    const day = dmyMatch[1].padStart(2, "0");
    const month = dmyMatch[2].padStart(2, "0");
    let year = parseInt(dmyMatch[3], 10);
    if (year > 2400) year -= 543;
    return `${year}-${month}-${day}`;
  }

  // Fallback: trim and lowercase
  return value.trim().toLowerCase();
}

/** Tax IDs: strip all non-digits. "010-5-53712127-1" → "0105537121271" */
function normalizeTaxId(value: string): string {
  return value.replace(/\D/g, "");
}

/** Company names: strip suffixes, collapse whitespace, lowercase. */
function normalizeCompanyName(value: string): string {
  let name = value;

  // Remove Thai company suffixes
  const thaiSuffixes = [
    "บริษัท",
    "บจก.",
    "บจก",
    "จำกัด",
    "จํากัด",
    "มหาชน",
    "(มหาชน)",
    "ห้างหุ้นส่วน",
    "หจก.",
    "หจก",
    "ห้างหุ้นส่วนจำกัด",
  ];
  for (const s of thaiSuffixes) {
    name = name.replace(new RegExp(escapeRegex(s), "gi"), "");
  }

  // Remove English company suffixes
  name = name.replace(
    /\b(?:co\.?,?\s*ltd\.?|company\s+limited|inc\.?|corp\.?|corporation|limited|plc|llc)\b\.?/gi,
    ""
  );
  // Remove country parenthetical
  name = name.replace(/\((thailand|ประเทศไทย)\)/gi, "");
  // Remove empty parens
  name = name.replace(/\(\s*\)/g, "");

  return name.replace(/\s+/g, " ").trim().toLowerCase();
}

/** General text: collapse whitespace, lowercase, trim. */
function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

/** Enum values: lowercase, trim. */
function normalizeEnum(value: string): string {
  return value.trim().toLowerCase();
}

/** Currency codes: uppercase, trim. */
function normalizeCurrency(value: string): string {
  return value.trim().toUpperCase();
}

/** Branch numbers: strip non-digits, pad to 5 digits. "สำนักงานใหญ่" → "00000" */
function normalizeBranchNumber(value: string): string {
  const lower = value.trim().toLowerCase();
  // "head office" variants → "00000"
  if (
    lower === "สำนักงานใหญ่" ||
    lower === "สํานักงานใหญ" ||
    lower.includes("head office") ||
    lower === "00000" ||
    lower === "0"
  ) {
    return "00000";
  }
  const digits = value.replace(/\D/g, "");
  return digits.padStart(5, "0");
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// --- Field → normalizer mapping ---

const FIELD_NORMALIZERS: Record<string, (value: string) => string> = {
  // Invoice fields
  documentType: normalizeEnum,
  documentNumber: normalizeText,
  issueDate: normalizeDate,
  dueDate: normalizeDate,
  vendorName: normalizeCompanyName,
  vendorNameEn: normalizeCompanyName,
  vendorTaxId: normalizeTaxId,
  vendorBranchNumber: normalizeBranchNumber,
  vendorAddress: normalizeText,
  buyerName: normalizeCompanyName,
  buyerTaxId: normalizeTaxId,
  subtotal: normalizeAmount,
  vatRate: normalizeRate,
  vatAmount: normalizeAmount,
  totalAmount: normalizeAmount,
  currency: normalizeCurrency,
  detectedLanguage: normalizeEnum,
  notes: normalizeText,

  // ID card fields
  nameTh: normalizeText,
  nameEn: normalizeText,
  citizenId: normalizeTaxId,
  dateOfBirth: normalizeDate,
  address: normalizeText,
  expiryDate: normalizeDate,
};

/** All field names that have dedicated normalizers. */
export const NORMALIZED_FIELD_NAMES = Object.keys(FIELD_NORMALIZERS);
