/**
 * Phase 8 — shared exemplar + review-outcome writer.
 *
 * Both the full review page (`updateDocumentAction`) and the document list
 * sidebar (`updateDocumentSidebarAction`) share this writer so that every
 * user-initiated save participates in the learning loop.
 *
 * Responsibilities:
 *   1. Diff user-provided values against the AI raw response.
 *   2. Upsert an exemplar per learnable field.
 *   3. Upsert a draft correction session and learning candidates.
 *   4. Upsert the review outcome (idempotent across re-saves).
 */

import { getCurrentUser } from "@/lib/utils/auth";
import { getLatestExtractionLog } from "./extraction-log";
import { getDocumentWithDetails } from "./documents";
import { upsertExemplar } from "./extraction-exemplars";
import { upsertDraftCorrectionSession } from "./extraction-correction-sessions";
import {
  rejectStaleRuleCandidates,
  upsertLearningCandidates,
} from "./extraction-learning-candidates";
import { insertReviewOutcome } from "./extraction-review-outcome";
import { getVendorById } from "./vendors";
import {
  normalizeFieldValue,
  fieldValuesEqual,
} from "@/lib/ai/field-normalization";
import {
  getFieldCriticality,
  LEARNABLE_INVOICE_FIELDS,
} from "@/lib/ai/field-criticality";
import type { FieldCriticality } from "@/lib/ai/field-criticality";
import { interpretCorrectionExplanation } from "@/lib/ai/correction-interpreter";
import type { CorrectedFieldDiff } from "@/lib/ai/correction-interpreter";

/**
 * User-edited values keyed by extraction schema field name
 * (e.g. `vendorName`, `documentNumber`, `totalAmount`). Use `undefined` for
 * fields the UI did not touch so they skip exemplar writes. Use `null` to
 * record an explicit clear.
 */
export type UserReviewValues = Partial<Record<string, string | null>>;

const MAX_CORRECTION_EXPLANATION_CHARS = 2000;

export interface WriteReviewExemplarsResult {
  skipped:
    | "no-extraction-log"
    | "no-document"
    | "no-ai-response"
    | "no-vendor"
    | null;
  fieldsConsidered: number;
  correctionCount: number;
  correctionSessionId: string | null;
  candidateCount: number;
}

export async function writeReviewExemplars({
  orgId,
  docId,
  userValues,
  correctionExplanation,
}: {
  orgId: string;
  docId: string;
  userValues: UserReviewValues;
  correctionExplanation?: string | null;
}): Promise<WriteReviewExemplarsResult> {
  const extractionLog = await getLatestExtractionLog(orgId, docId);
  if (!extractionLog) {
    return {
      skipped: "no-extraction-log",
      fieldsConsidered: 0,
      correctionCount: 0,
      correctionSessionId: null,
      candidateCount: 0,
    };
  }

  const doc = await getDocumentWithDetails(orgId, docId);
  if (!doc) {
    return {
      skipped: "no-document",
      fieldsConsidered: 0,
      correctionCount: 0,
      correctionSessionId: null,
      candidateCount: 0,
    };
  }

  const aiRaw = doc.files?.find(
    (f: { aiRawResponse: unknown }) => f.aiRawResponse
  )?.aiRawResponse as Record<string, unknown> | null;
  if (!aiRaw) {
    return {
      skipped: "no-ai-response",
      fieldsConsidered: 0,
      correctionCount: 0,
      correctionSessionId: null,
      candidateCount: 0,
    };
  }

  const vendorId = extractionLog.vendorId ?? doc.vendorId;
  if (!vendorId) {
    return {
      skipped: "no-vendor",
      fieldsConsidered: 0,
      correctionCount: 0,
      correctionSessionId: null,
      candidateCount: 0,
    };
  }

  const vendor = await getVendorById(orgId, vendorId);
  const vendorTaxId = vendor?.taxId ?? null;
  const storedCorrectionExplanation =
    correctionExplanation?.trim().slice(0, MAX_CORRECTION_EXPLANATION_CHARS) || null;

  const user = await getCurrentUser();
  const userId = user?.id ?? "unknown";

  let fieldsConsidered = 0;
  let correctionCount = 0;
  const candidateInputs: Parameters<typeof upsertLearningCandidates>[0] = [];
  const correctedFields: CorrectedFieldDiff[] = [];
  const exemplarInputs: Parameters<typeof upsertExemplar>[0][] = [];
  const documentFamily = inferDocumentFamily(doc);

  for (const field of LEARNABLE_INVOICE_FIELDS) {
    if (!(field in userValues)) continue; // UI did not touch this field
    fieldsConsidered++;

    const userRaw = userValues[field];
    const userStr = userRaw ?? null;
    const aiValue = aiRaw[field];
    const aiStr = aiValue != null ? String(aiValue) : null;

    const wasCorrected = !fieldValuesEqual(field, aiStr, userStr);
    if (wasCorrected) correctionCount++;

    const normalizedAi = aiStr ? normalizeFieldValue(field, aiStr) : null;
    const normalizedUser = userStr ? normalizeFieldValue(field, userStr) : null;
    const fieldCriticality = getFieldCriticality(field) as FieldCriticality;

    exemplarInputs.push({
      orgId,
      vendorId,
      fieldName: field,
      fieldCriticality,
      aiValue: normalizedAi,
      userValue: normalizedUser,
      wasCorrected,
      documentId: docId,
      modelUsed: extractionLog.modelUsed ?? undefined,
      confidenceAtTime: undefined,
      vendorTaxId,
    });

    if (wasCorrected) {
      correctedFields.push({
        fieldName: field,
        fieldCriticality,
        aiValue: normalizedAi,
        confirmedValue: normalizedUser,
      });
      candidateInputs.push({
        orgId,
        documentId: docId,
        correctionSessionId: "", // filled after session upsert
        vendorId,
        vendorKey: vendorTaxId,
        documentFamily,
        fieldName: field,
        fieldCriticality,
        candidateType: "field_exemplar",
        aiValue: normalizedAi,
        confirmedValue: normalizedUser,
        rationale: `User confirmed ${field} value after review save.`,
        appliesWhen: [],
        scope: "vendor_document_family",
        status: "candidate",
      });
    }
  }

  const interpretation = interpretCorrectionExplanation({
    explanation: storedCorrectionExplanation,
    correctedFields,
  });

  const correctionSession = await upsertDraftCorrectionSession({
    orgId,
    documentId: docId,
    extractionLogId: extractionLog.id,
    startedByUserId: userId,
    userExplanation: storedCorrectionExplanation,
    aiInterpretation: interpretation.summary || interpretation.rules.length > 0
      ? {
          summary: interpretation.summary,
          rules: interpretation.rules.map((rule) => ({
            fieldName: rule.fieldName,
            selectorHint: rule.selectorHint,
            rejectHint: rule.rejectHint,
            appliesWhen: rule.appliesWhen,
            confidence: rule.confidence,
          })),
        }
      : null,
  });

  for (const rule of interpretation.rules) {
    candidateInputs.push({
      orgId,
      documentId: docId,
      correctionSessionId: correctionSession.id,
      vendorId,
      vendorKey: vendorTaxId,
      documentFamily,
      fieldName: rule.fieldName,
      fieldCriticality: rule.fieldCriticality,
      candidateType: "field_rule",
      aiValue: correctedFields.find((field) => field.fieldName === rule.fieldName)
        ?.aiValue ?? null,
      confirmedValue:
        correctedFields.find((field) => field.fieldName === rule.fieldName)
          ?.confirmedValue ?? null,
      rationale: rule.rationale,
      selectorHint: rule.selectorHint,
      rejectHint: rule.rejectHint,
      appliesWhen: rule.appliesWhen,
      scope: "vendor_document_family",
      status: "candidate",
      confidence: rule.confidence,
    });
  }

  await rejectStaleRuleCandidates({
    orgId,
    correctionSessionId: correctionSession.id,
    keepFieldNames: interpretation.rules.map((rule) => rule.fieldName),
  });

  const learningCandidates =
    candidateInputs.length > 0
      ? await upsertLearningCandidates(
          candidateInputs.map((candidate) => ({
            ...candidate,
            correctionSessionId: correctionSession.id,
          }))
        )
      : [];

  for (const exemplar of exemplarInputs) {
    await upsertExemplar({
      ...exemplar,
      correctionSessionId: correctionSession.id,
    });
  }

  await insertReviewOutcome({
    extractionLogId: extractionLog.id,
    documentId: docId,
    orgId,
    correctionSessionId: correctionSession.id,
    userCorrected: correctionCount > 0,
    correctionCount,
    reviewedByUserId: userId,
  });

  return {
    skipped: null,
    fieldsConsidered,
    correctionCount,
    correctionSessionId: correctionSession.id,
    candidateCount: learningCandidates.length,
  };
}

function inferDocumentFamily(doc: {
  category: string | null;
  direction: string;
  type: string;
  isPp36Subject: boolean | null;
  currency: string | null;
}): string {
  const category = doc.category?.toLowerCase() ?? "";
  if (
    category.includes("payment_processor") ||
    category.includes("settlement") ||
    category.includes("marketplace")
  ) {
    return "payment_processor_settlement_receipt";
  }
  if (doc.isPp36Subject || doc.currency === "USD" || doc.currency === "EUR") {
    return "foreign_vendor_invoice";
  }
  return `${doc.direction}_${doc.type}`;
}
