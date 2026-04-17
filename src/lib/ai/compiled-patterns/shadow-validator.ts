import { runCompiledPattern } from "./sandbox-runner";

export interface TestExemplar {
  fieldName: string;
  userValue: string | null;
  documentText: string;
}

export interface ShadowValidationResult {
  accuracy: number;
  agreements: number;
  disagreements: number;
  total: number;
  details: Array<{
    fieldName: string;
    expected: string | null;
    actual: string | null;
    match: boolean;
  }>;
}

/**
 * Validate a compiled pattern against a set of test exemplars.
 *
 * For each exemplar, runs the compiled pattern against the document text
 * and compares the output for the relevant field with the known user value.
 *
 * Returns accuracy as a percentage (0-1).
 */
export async function validateAgainstTestSet(
  compiledJs: string,
  testExemplars: TestExemplar[]
): Promise<ShadowValidationResult> {
  const details: ShadowValidationResult["details"] = [];
  let agreements = 0;
  let disagreements = 0;

  // Group exemplars by document text to avoid re-running the same extraction
  const byDocument = new Map<string, TestExemplar[]>();
  for (const exemplar of testExemplars) {
    const existing = byDocument.get(exemplar.documentText) ?? [];
    existing.push(exemplar);
    byDocument.set(exemplar.documentText, existing);
  }

  for (const [documentText, exemplars] of byDocument) {
    let result: Record<string, string>;
    try {
      result = await runCompiledPattern(compiledJs, documentText);
    } catch {
      // If extraction fails, all fields for this document disagree
      for (const exemplar of exemplars) {
        details.push({
          fieldName: exemplar.fieldName,
          expected: exemplar.userValue,
          actual: null,
          match: false,
        });
        disagreements++;
      }
      continue;
    }

    for (const exemplar of exemplars) {
      const actual = result[exemplar.fieldName] ?? null;
      const expected = exemplar.userValue;

      // Normalize comparison: trim whitespace, case-insensitive for non-numeric
      const normalizedActual = actual?.trim().toLowerCase() ?? null;
      const normalizedExpected = expected?.trim().toLowerCase() ?? null;

      const match = normalizedActual === normalizedExpected;

      details.push({
        fieldName: exemplar.fieldName,
        expected,
        actual,
        match,
      });

      if (match) {
        agreements++;
      } else {
        disagreements++;
      }
    }
  }

  const total = agreements + disagreements;
  const accuracy = total > 0 ? agreements / total : 0;

  return { accuracy, agreements, disagreements, total, details };
}
