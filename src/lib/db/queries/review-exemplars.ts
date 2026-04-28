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
 *   3. Upsert the review outcome (idempotent across re-saves).
 *   4. Emit `learning/review-saved` so the downstream Inngest handler can
 *      adjust vendor tier + org reputation.
 */

import { getCurrentUser } from "@/lib/utils/auth";
import { inngest } from "@/lib/inngest/client";
import { getLatestExtractionLog } from "./extraction-log";
import { getDocumentWithDetails } from "./documents";
import { upsertExemplar } from "./extraction-exemplars";
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

/**
 * User-edited values keyed by extraction schema field name
 * (e.g. `vendorName`, `documentNumber`, `totalAmount`). Use `undefined` for
 * fields the UI did not touch so they skip exemplar writes. Use `null` to
 * record an explicit clear.
 */
export type UserReviewValues = Partial<Record<string, string | null>>;

export interface WriteReviewExemplarsResult {
  skipped:
    | "no-extraction-log"
    | "no-document"
    | "no-ai-response"
    | "no-vendor"
    | null;
  fieldsConsidered: number;
  correctionCount: number;
}

export async function writeReviewExemplars({
  orgId,
  docId,
  userValues,
}: {
  orgId: string;
  docId: string;
  userValues: UserReviewValues;
}): Promise<WriteReviewExemplarsResult> {
  const extractionLog = await getLatestExtractionLog(orgId, docId);
  if (!extractionLog) {
    return {
      skipped: "no-extraction-log",
      fieldsConsidered: 0,
      correctionCount: 0,
    };
  }

  const doc = await getDocumentWithDetails(orgId, docId);
  if (!doc) {
    return { skipped: "no-document", fieldsConsidered: 0, correctionCount: 0 };
  }

  const aiRaw = doc.files?.find(
    (f: { aiRawResponse: unknown }) => f.aiRawResponse
  )?.aiRawResponse as Record<string, unknown> | null;
  if (!aiRaw) {
    return {
      skipped: "no-ai-response",
      fieldsConsidered: 0,
      correctionCount: 0,
    };
  }

  const vendorId = extractionLog.vendorId ?? doc.vendorId;
  if (!vendorId) {
    return { skipped: "no-vendor", fieldsConsidered: 0, correctionCount: 0 };
  }

  const vendor = await getVendorById(orgId, vendorId);
  const vendorTaxId = vendor?.taxId ?? null;

  const user = await getCurrentUser();
  const userId = user?.id ?? "unknown";

  let fieldsConsidered = 0;
  let correctionCount = 0;

  for (const field of LEARNABLE_INVOICE_FIELDS) {
    if (!(field in userValues)) continue; // UI did not touch this field
    fieldsConsidered++;

    const userRaw = userValues[field];
    const userStr = userRaw ?? null;
    const aiValue = aiRaw[field];
    const aiStr = aiValue != null ? String(aiValue) : null;

    const wasCorrected = !fieldValuesEqual(field, aiStr, userStr);
    if (wasCorrected) correctionCount++;

    await upsertExemplar({
      orgId,
      vendorId,
      fieldName: field,
      fieldCriticality: getFieldCriticality(field) as FieldCriticality,
      aiValue: aiStr ? normalizeFieldValue(field, aiStr) : null,
      userValue: userStr ? normalizeFieldValue(field, userStr) : null,
      wasCorrected,
      documentId: docId,
      modelUsed: extractionLog.modelUsed ?? undefined,
      confidenceAtTime: undefined,
      vendorTaxId,
    });
  }

  await insertReviewOutcome({
    extractionLogId: extractionLog.id,
    documentId: docId,
    orgId,
    userCorrected: correctionCount > 0,
    correctionCount,
    reviewedByUserId: userId,
  });

  void inngest.send({
    name: "learning/review-saved",
    data: {
      orgId,
      documentId: docId,
      vendorId,
      vendorTaxId,
      extractionLogId: extractionLog.id,
      correctionCount,
      userCorrected: correctionCount > 0,
    },
  });

  return { skipped: null, fieldsConsidered, correctionCount };
}
