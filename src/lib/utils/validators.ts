// ---------------------------------------------------------------------------
// Reusable input validation helpers
// ---------------------------------------------------------------------------
// Each returns { valid: true } or { valid: false, message: string }

export interface ValidationResult {
  valid: boolean;
  message?: string;
}

const ok: ValidationResult = { valid: true };
const fail = (message: string): ValidationResult => ({ valid: false, message });

// ---------------------------------------------------------------------------
// Thai Tax ID — exactly 13 digits
// ---------------------------------------------------------------------------

export function validateTaxId(value: string): ValidationResult {
  if (!value) return ok; // optional unless marked required elsewhere
  const digits = value.replace(/[\s-]/g, "");
  if (!/^\d{13}$/.test(digits)) {
    return fail("Tax ID must be exactly 13 digits");
  }
  return ok;
}

/** Strip non-digits for storage */
export function sanitizeTaxId(value: string): string {
  return value.replace(/\D/g, "");
}

// ---------------------------------------------------------------------------
// Branch Number — exactly 5 digits
// ---------------------------------------------------------------------------

export function validateBranchNumber(value: string): ValidationResult {
  if (!value) return ok;
  if (!/^\d{5}$/.test(value)) {
    return fail("Branch number must be exactly 5 digits");
  }
  return ok;
}

// ---------------------------------------------------------------------------
// Name — letters, Thai chars, spaces, hyphens, dots, parentheses, ampersands
// No symbols like *@#$%^!~ etc.
// ---------------------------------------------------------------------------

const NAME_RE = /^[\p{L}\p{N}\s.\-(),&/']+$/u;

export function validateName(value: string): ValidationResult {
  if (!value.trim()) return fail("Name is required");
  if (value.length > 200) return fail("Name is too long (max 200 characters)");
  if (!NAME_RE.test(value)) {
    return fail("Name contains invalid characters");
  }
  return ok;
}

// ---------------------------------------------------------------------------
// Email
// ---------------------------------------------------------------------------

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateEmail(value: string): ValidationResult {
  if (!value) return ok;
  if (!EMAIL_RE.test(value)) {
    return fail("Invalid email address");
  }
  return ok;
}

// ---------------------------------------------------------------------------
// Address — letters, Thai, digits, spaces, common punctuation
// ---------------------------------------------------------------------------

const ADDRESS_RE = /^[\p{L}\p{N}\s.,\-/()#&'"+:;]+$/u;

export function validateAddress(value: string): ValidationResult {
  if (!value) return ok;
  if (value.length > 500) return fail("Address is too long (max 500 characters)");
  if (!ADDRESS_RE.test(value)) {
    return fail("Address contains invalid characters");
  }
  return ok;
}

// ---------------------------------------------------------------------------
// Bank Account Number — digits only, with optional dashes/spaces for display
// ---------------------------------------------------------------------------

export function validateBankAccountNumber(value: string): ValidationResult {
  if (!value) return fail("Account number is required");
  const digits = value.replace(/[\s-]/g, "");
  if (!/^\d+$/.test(digits)) {
    return fail("Account number must contain only digits");
  }
  if (digits.length < 5 || digits.length > 20) {
    return fail("Account number must be 5–20 digits");
  }
  return ok;
}

/** Strip non-digits for storage */
export function sanitizeBankAccountNumber(value: string): string {
  return value.replace(/\D/g, "");
}

/**
 * Format account number with dashes (KBank-style: XXX-X-XXXXX-X)
 * Falls back to raw digits if length doesn't match a known pattern.
 */
export function formatBankAccountNumber(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 10) {
    // KBank / SCB pattern: XXX-X-XXXXX-X
    return `${digits.slice(0, 3)}-${digits[3]}-${digits.slice(4, 9)}-${digits[9]}`;
  }
  if (digits.length === 12) {
    // BBL pattern: XXXX-X-XXXXX-X-X
    return `${digits.slice(0, 4)}-${digits[4]}-${digits.slice(5, 10)}-${digits[10]}-${digits[11]}`;
  }
  return digits;
}

// ---------------------------------------------------------------------------
// Phone Number — digits, optional leading +, spaces/dashes for formatting
// ---------------------------------------------------------------------------

export function validatePhoneNumber(value: string): ValidationResult {
  if (!value) return ok;
  const cleaned = value.replace(/[\s\-().]/g, "");
  if (!/^\+?\d{8,15}$/.test(cleaned)) {
    return fail("Phone number must be 8–15 digits");
  }
  return ok;
}

// ---------------------------------------------------------------------------
// Currency Code — ISO 4217, 3 uppercase letters
// ---------------------------------------------------------------------------

const COMMON_CURRENCIES = [
  "THB", "USD", "EUR", "GBP", "JPY", "CNY", "SGD", "MYR",
  "AUD", "HKD", "KRW", "TWD", "INR", "CHF", "CAD", "NZD",
] as const;

export type CurrencyCode = (typeof COMMON_CURRENCIES)[number];

export function validateCurrencyCode(value: string): ValidationResult {
  if (!value) return fail("Currency is required");
  if (!/^[A-Z]{3}$/.test(value)) {
    return fail("Currency must be a 3-letter code (e.g., THB)");
  }
  return ok;
}

export { COMMON_CURRENCIES };

// ---------------------------------------------------------------------------
// Thai Citizen ID — 13 digits with checksum (natural persons only)
// ---------------------------------------------------------------------------

/**
 * Validate a Thai 13-digit citizen ID with checksum verification.
 * Used for natural persons (individuals), NOT for company tax IDs.
 */
export function validateThaiCitizenId(id: string): ValidationResult {
  if (!id) return ok;
  const digits = id.replace(/[\s-]/g, "");
  if (!/^\d+$/.test(digits)) {
    return fail("Citizen ID must contain only digits");
  }
  if (digits.length !== 13) {
    return fail("Citizen ID must be exactly 13 digits");
  }

  // Checksum: multiply digits 1-12 by descending weights 13..2, sum, then
  // check digit = (11 - (sum % 11)) % 10
  const weights = [13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2];
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += Number(digits[i]) * weights[i];
  }
  const checkDigit = (11 - (sum % 11)) % 10;
  if (checkDigit !== Number(digits[12])) {
    return fail("Citizen ID checksum is invalid");
  }

  return ok;
}

/**
 * Thai company tax IDs start with 0, citizen IDs start with 1-8.
 * Both are 13 digits. This helper indicates which type.
 */
export function classifyThaiTaxId(id: string): "citizen" | "company" | "invalid" {
  if (!id) return "invalid";
  const digits = id.replace(/[\s-]/g, "");
  if (!/^\d{13}$/.test(digits)) return "invalid";
  if (digits[0] === "0") return "company";
  if (digits[0] >= "1" && digits[0] <= "8") return "citizen";
  return "invalid";
}

// ---------------------------------------------------------------------------
// Numeric amount — for budget / monetary inputs
// ---------------------------------------------------------------------------

export function validatePositiveNumber(value: string): ValidationResult {
  if (!value) return ok;
  const num = parseFloat(value);
  if (isNaN(num)) return fail("Must be a number");
  if (num < 0) return fail("Must be a positive number");
  return ok;
}
