import { describe, it, expect } from "vitest";
import {
  validateTaxId,
  sanitizeTaxId,
  validateBranchNumber,
  validateName,
  validateEmail,
  validateBankAccountNumber,
  sanitizeBankAccountNumber,
  formatBankAccountNumber,
  validatePhoneNumber,
  validateCurrencyCode,
  validatePositiveNumber,
  validateThaiCitizenId,
  classifyThaiTaxId,
} from "./validators";

/**
 * Vendor-focused validation tests.
 *
 * These validators are used by vendor CRUD actions (and other forms) to validate
 * user input before writing to the database. Testing here rather than through
 * server actions avoids DB dependencies.
 */

describe("validateTaxId", () => {
  it("accepts valid 13-digit tax ID", () => {
    expect(validateTaxId("0105548123456")).toEqual({ valid: true });
  });

  it("accepts tax ID with dashes", () => {
    expect(validateTaxId("0-1055-48123-456")).toEqual({ valid: true });
  });

  it("accepts tax ID with spaces", () => {
    expect(validateTaxId("0 1055 48123 456")).toEqual({ valid: true });
  });

  it("accepts empty (optional field)", () => {
    expect(validateTaxId("")).toEqual({ valid: true });
  });

  it("rejects too-short tax ID", () => {
    const result = validateTaxId("123456789");
    expect(result.valid).toBe(false);
    expect(result.message).toContain("13 digits");
  });

  it("rejects too-long tax ID", () => {
    const result = validateTaxId("01234567890123");
    expect(result.valid).toBe(false);
  });

  it("rejects alphabetic characters", () => {
    const result = validateTaxId("ABCDEFGHIJKLM");
    expect(result.valid).toBe(false);
  });
});

describe("sanitizeTaxId", () => {
  it("strips dashes", () => {
    expect(sanitizeTaxId("0-1055-48123-45-6")).toBe("0105548123456");
  });

  it("strips spaces", () => {
    expect(sanitizeTaxId("0 1055 48123 45 6")).toBe("0105548123456");
  });

  it("strips all non-digit characters", () => {
    expect(sanitizeTaxId("(01) 0554-8123/456")).toBe("0105548123456");
  });

  it("returns empty for all-alpha input", () => {
    expect(sanitizeTaxId("abcdefg")).toBe("");
  });
});

describe("validateBranchNumber", () => {
  it("accepts valid 5-digit branch", () => {
    expect(validateBranchNumber("00000")).toEqual({ valid: true });
  });

  it("accepts typical branch number", () => {
    expect(validateBranchNumber("00001")).toEqual({ valid: true });
  });

  it("accepts empty (optional)", () => {
    expect(validateBranchNumber("")).toEqual({ valid: true });
  });

  it("rejects too-short branch number", () => {
    expect(validateBranchNumber("0001").valid).toBe(false);
  });

  it("rejects too-long branch number", () => {
    expect(validateBranchNumber("000001").valid).toBe(false);
  });

  it("rejects non-numeric branch", () => {
    expect(validateBranchNumber("ABCDE").valid).toBe(false);
  });
});

describe("validateName", () => {
  it("accepts English name", () => {
    expect(validateName("Test Company Ltd.").valid).toBe(true);
  });

  it("accepts simple Thai name without combining marks", () => {
    // Note: Thai combining vowels/tone marks (\p{M} category) are not
    // currently supported by the NAME_RE regex. This tests basic Thai consonants.
    expect(validateName("ทดสอบ").valid).toBe(true);
  });

  it("accepts name with parentheses and ampersand", () => {
    expect(validateName("ABC (Thailand) & Co.").valid).toBe(true);
  });

  it("rejects empty name", () => {
    const result = validateName("");
    expect(result.valid).toBe(false);
    expect(result.message).toContain("required");
  });

  it("rejects whitespace-only name", () => {
    expect(validateName("   ").valid).toBe(false);
  });

  it("rejects name with invalid symbols", () => {
    expect(validateName("Company @#$%").valid).toBe(false);
  });

  it("rejects name exceeding 200 characters", () => {
    const longName = "A".repeat(201);
    const result = validateName(longName);
    expect(result.valid).toBe(false);
    expect(result.message).toContain("too long");
  });
});

describe("validateEmail", () => {
  it("accepts valid email", () => {
    expect(validateEmail("test@example.com").valid).toBe(true);
  });

  it("accepts empty (optional)", () => {
    expect(validateEmail("").valid).toBe(true);
  });

  it("rejects email without @", () => {
    expect(validateEmail("testexample.com").valid).toBe(false);
  });

  it("rejects email without domain", () => {
    expect(validateEmail("test@").valid).toBe(false);
  });
});

describe("validateBankAccountNumber", () => {
  it("accepts valid 10-digit KBank account", () => {
    expect(validateBankAccountNumber("1703269954").valid).toBe(true);
  });

  it("accepts account with dashes", () => {
    expect(validateBankAccountNumber("170-3-26995-4").valid).toBe(true);
  });

  it("rejects empty account number", () => {
    const result = validateBankAccountNumber("");
    expect(result.valid).toBe(false);
    expect(result.message).toContain("required");
  });

  it("rejects too-short account", () => {
    expect(validateBankAccountNumber("1234").valid).toBe(false);
  });

  it("rejects alphabetic characters", () => {
    expect(validateBankAccountNumber("ABCDEFGHIJ").valid).toBe(false);
  });
});

describe("sanitizeBankAccountNumber", () => {
  it("strips dashes", () => {
    expect(sanitizeBankAccountNumber("170-3-26995-4")).toBe("1703269954");
  });

  it("returns digits only", () => {
    expect(sanitizeBankAccountNumber("170 3 26995 4")).toBe("1703269954");
  });
});

describe("formatBankAccountNumber", () => {
  it("formats 10-digit KBank-style: XXX-X-XXXXX-X", () => {
    expect(formatBankAccountNumber("1703269954")).toBe("170-3-26995-4");
  });

  it("formats 12-digit BBL-style", () => {
    expect(formatBankAccountNumber("123456789012")).toBe("1234-5-67890-1-2");
  });

  it("returns raw digits for unknown lengths", () => {
    expect(formatBankAccountNumber("12345678")).toBe("12345678");
  });
});

describe("validatePhoneNumber", () => {
  it("accepts Thai mobile number", () => {
    expect(validatePhoneNumber("0812345678").valid).toBe(true);
  });

  it("accepts international format", () => {
    expect(validatePhoneNumber("+66812345678").valid).toBe(true);
  });

  it("accepts number with formatting", () => {
    expect(validatePhoneNumber("081-234-5678").valid).toBe(true);
  });

  it("accepts empty (optional)", () => {
    expect(validatePhoneNumber("").valid).toBe(true);
  });

  it("rejects too-short number", () => {
    expect(validatePhoneNumber("1234567").valid).toBe(false);
  });
});

describe("validateCurrencyCode", () => {
  it("accepts THB", () => {
    expect(validateCurrencyCode("THB").valid).toBe(true);
  });

  it("accepts USD", () => {
    expect(validateCurrencyCode("USD").valid).toBe(true);
  });

  it("rejects empty", () => {
    expect(validateCurrencyCode("").valid).toBe(false);
  });

  it("rejects lowercase", () => {
    expect(validateCurrencyCode("thb").valid).toBe(false);
  });

  it("rejects wrong length", () => {
    expect(validateCurrencyCode("US").valid).toBe(false);
    expect(validateCurrencyCode("USDD").valid).toBe(false);
  });
});

describe("validateThaiCitizenId", () => {
  // Valid fake IDs computed using the checksum algorithm:
  // 1-1234-56789-01-4 → sum=315, check=(11-(315%11))%10=4
  // 3-1010-00523-45-8 → sum=135, check=(11-(135%11))%10=8

  it("accepts valid citizen ID with correct checksum", () => {
    expect(validateThaiCitizenId("1123456789014")).toEqual({ valid: true });
  });

  it("accepts another valid citizen ID", () => {
    expect(validateThaiCitizenId("3101000523458")).toEqual({ valid: true });
  });

  it("rejects citizen ID with invalid checksum", () => {
    const result = validateThaiCitizenId("1123456789010");
    expect(result.valid).toBe(false);
    expect(result.message).toContain("checksum");
  });

  it("rejects too-short ID (12 digits)", () => {
    const result = validateThaiCitizenId("112345678901");
    expect(result.valid).toBe(false);
    expect(result.message).toContain("13 digits");
  });

  it("rejects too-long ID (14 digits)", () => {
    const result = validateThaiCitizenId("11234567890145");
    expect(result.valid).toBe(false);
    expect(result.message).toContain("13 digits");
  });

  it("rejects non-digit characters", () => {
    const result = validateThaiCitizenId("1123456789ABC");
    expect(result.valid).toBe(false);
    expect(result.message).toContain("only digits");
  });

  it("accepts ID with dashes (strips them before validation)", () => {
    expect(validateThaiCitizenId("1-1234-56789-01-4")).toEqual({ valid: true });
  });

  it("accepts ID with spaces (strips them before validation)", () => {
    expect(validateThaiCitizenId("1 1234 56789 01 4")).toEqual({ valid: true });
  });

  it("accepts empty (optional field)", () => {
    expect(validateThaiCitizenId("")).toEqual({ valid: true });
  });
});

describe("classifyThaiTaxId", () => {
  it("returns 'company' for ID starting with 0", () => {
    expect(classifyThaiTaxId("0105548123458")).toBe("company");
  });

  it("returns 'citizen' for ID starting with 1", () => {
    expect(classifyThaiTaxId("1123456789014")).toBe("citizen");
  });

  it("returns 'citizen' for ID starting with 3", () => {
    expect(classifyThaiTaxId("3101000523458")).toBe("citizen");
  });

  it("returns 'citizen' for ID starting with 8", () => {
    // 8000000000000 — just checking first-digit classification, not checksum
    expect(classifyThaiTaxId("8000000000000")).toBe("citizen");
  });

  it("returns 'invalid' for ID starting with 9", () => {
    expect(classifyThaiTaxId("9000000000000")).toBe("invalid");
  });

  it("returns 'invalid' for empty string", () => {
    expect(classifyThaiTaxId("")).toBe("invalid");
  });

  it("returns 'invalid' for non-13-digit string", () => {
    expect(classifyThaiTaxId("12345")).toBe("invalid");
  });

  it("handles dashes in input", () => {
    expect(classifyThaiTaxId("0-1055-48123-45-8")).toBe("company");
  });
});

describe("validatePositiveNumber", () => {
  it("accepts positive number", () => {
    expect(validatePositiveNumber("100.50").valid).toBe(true);
  });

  it("accepts zero", () => {
    expect(validatePositiveNumber("0").valid).toBe(true);
  });

  it("accepts empty (optional)", () => {
    expect(validatePositiveNumber("").valid).toBe(true);
  });

  it("rejects negative number", () => {
    const result = validatePositiveNumber("-5");
    expect(result.valid).toBe(false);
    expect(result.message).toContain("positive");
  });

  it("rejects non-numeric string", () => {
    expect(validatePositiveNumber("abc").valid).toBe(false);
  });
});
