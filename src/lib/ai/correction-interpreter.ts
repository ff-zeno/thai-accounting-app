import type { FieldCriticality } from "./field-criticality";

export interface CorrectedFieldDiff {
  fieldName: string;
  fieldCriticality: FieldCriticality;
  aiValue: string | null;
  confirmedValue: string | null;
}

export interface InterpretedCorrectionRule {
  fieldName: string;
  fieldCriticality: FieldCriticality;
  rationale: string;
  selectorHint: string | null;
  rejectHint: string | null;
  appliesWhen: string[];
  confidence: string;
}

export interface CorrectionInterpretation {
  summary: string | null;
  rules: InterpretedCorrectionRule[];
}

const FIELD_SYNONYMS: Record<string, string[]> = {
  totalAmount: ["total", "grand total", "grandtotal", "amount", "ยอดรวม"],
  subtotal: ["subtotal", "before vat", "net before vat", "ก่อน vat", "ก่อนภาษี"],
  vatAmount: ["vat", "tax", "ภาษี", "ภาษีมูลค่าเพิ่ม"],
  documentNumber: ["invoice number", "document number", "เลขที่"],
  vendorName: ["vendor", "supplier", "seller", "ผู้ขาย"],
  vendorAddress: ["vendor address", "supplier address", "seller address", "ที่อยู่ผู้ขาย"],
  vendorTaxId: ["tax id", "tax number", "เลขประจำตัวผู้เสียภาษี"],
  buyerTaxId: ["buyer tax id", "customer tax id", "เลขประจำตัวผู้เสียภาษีลูกค้า"],
  detectedLanguage: ["language", "detected language", "ภาษา"],
};

/**
 * Converts a user's optional natural-language correction note into structured,
 * scoped rule candidates. This intentionally does not preserve the raw text as
 * reusable prompt guidance; callers store the raw explanation for audit, while
 * only these structured hints may later be promoted into extraction context.
 */
export function interpretCorrectionExplanation({
  explanation,
  correctedFields,
}: {
  explanation?: string | null;
  correctedFields: CorrectedFieldDiff[];
}): CorrectionInterpretation {
  const cleaned = explanation?.trim() ?? "";
  if (!cleaned || correctedFields.length === 0) {
    return { summary: cleaned || null, rules: [] };
  }

  const targetFields = correctedFields.filter((field) =>
    explanationMentionsField(cleaned, field.fieldName)
  );
  const fields = targetFields.length > 0 ? targetFields : correctedFields;
  return {
    summary: summarize(cleaned),
    rules: fields.map((field) => {
      const fieldText = findFieldClause(cleaned, field.fieldName) ?? cleaned;
      const { selectorHint, rejectHint } = extractSelectorRejectHints(fieldText);
      return {
        fieldName: field.fieldName,
        fieldCriticality: field.fieldCriticality,
        rationale: buildRationale(fieldText, field),
        selectorHint,
        rejectHint,
        appliesWhen: extractAppliesWhen(cleaned),
        confidence: selectorHint || rejectHint ? "0.7000" : "0.5000",
      };
    }),
  };
}

function explanationMentionsField(explanation: string, fieldName: string) {
  const lower = explanation.toLowerCase();
  const synonyms = FIELD_SYNONYMS[fieldName] ?? [fieldName];
  return synonyms.some((synonym) => phraseAppears(lower, synonym));
}

function phraseAppears(haystack: string, phrase: string) {
  const escaped = phrase.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}([^\\p{L}\\p{N}]|$)`, "u").test(
    haystack
  );
}

function findFieldClause(explanation: string, fieldName: string) {
  const synonyms = FIELD_SYNONYMS[fieldName] ?? [fieldName];
  const clauses = explanation
    .split(/[;\n]+/)
    .map((clause) => clause.trim())
    .filter(Boolean);
  return (
    clauses.find((clause) => {
      const lower = clause.toLowerCase();
      return synonyms.some((synonym) => phraseAppears(lower, synonym));
    }) ?? null
  );
}

function extractSelectorRejectHints(explanation: string) {
  const quoted = [...explanation.matchAll(/["'“”‘’`]([^"'“”‘’`]{2,80})["'“”‘’`]/g)]
    .map((match) => match[1].trim())
    .filter(Boolean);

  const useMatch = /\b(?:use|เลือก|ใช้)\s+([A-Za-z0-9 ._/\-ก-๙]{2,80}?)(?:,|\.|;|\bnot\b|\binstead\b|$)/i.exec(
    explanation
  );
  const notMatch = /\b(?:not|don't use|do not use|ไม่ใช้|ไม่ใช่)\s+([A-Za-z0-9 ._/\-ก-๙]{2,80}?)(?:,|\.|;|$)/i.exec(
    explanation
  );
  const insteadOfMatch = /\binstead of\s+([A-Za-z0-9 ._/\-ก-๙]{2,80}?)(?:,|\.|;|$)/i.exec(
    explanation
  );

  return {
    selectorHint: cleanHint(quoted[0] ?? useMatch?.[1] ?? null),
    rejectHint: cleanHint(
      notMatch?.[1] ??
        insteadOfMatch?.[1] ??
        (quoted.length > 1 ? quoted[quoted.length - 1] : null)
    ),
  };
}

function extractAppliesWhen(explanation: string): string[] {
  const conditions = new Set<string>();
  for (const match of explanation.matchAll(/\bcontains\s+["'“”‘’`]?([^"'“”‘’`,.;]{2,50})/gi)) {
    conditions.add(`contains ${match[1].trim()}`);
  }
  for (const keyword of ["commission", "withholding tax", "credit amount", "grandtotal"]) {
    if (explanation.toLowerCase().includes(keyword)) {
      conditions.add(`contains ${keyword}`);
    }
  }
  return [...conditions].slice(0, 6);
}

function buildRationale(explanation: string, field: CorrectedFieldDiff) {
  const summary = summarize(explanation) ?? "User explained correction during review.";
  return `${summary} Confirmed ${field.fieldName}: ${field.confirmedValue ?? "blank"}; AI had ${field.aiValue ?? "blank"}.`;
}

function summarize(explanation: string) {
  const singleLine = explanation.replace(/\s+/g, " ").trim();
  if (!singleLine) return null;
  if (hasInstructionLikeText(singleLine)) return null;
  return singleLine.length <= 240 ? singleLine : `${singleLine.slice(0, 237)}...`;
}

function hasInstructionLikeText(value: string) {
  return /\b(ignore|system|assistant|developer|instruction|prompt|override)\b/i.test(
    value
  );
}

function cleanHint(value: string | null) {
  if (!value) return null;
  const cleaned = value
    .replace(/\s+/g, " ")
    .replace(/\b(?:instead|rather than|instead of)$/i, "")
    .trim()
    .replace(/[.。;,]+$/, "")
    .trim();
  if (hasInstructionLikeText(cleaned)) {
    return null;
  }
  return cleaned || null;
}
