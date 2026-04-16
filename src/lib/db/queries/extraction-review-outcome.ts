import { and, eq } from "drizzle-orm";
import { db } from "../index";
import { extractionReviewOutcome } from "../schema";
import { orgScopeAlive } from "../helpers/org-scope";
import { auditMutation } from "../helpers/audit-log";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface InsertReviewOutcomeInput {
  extractionLogId: string;
  documentId: string;
  orgId: string;
  userCorrected: boolean;
  correctionCount: number;
  reviewedByUserId: string;
}

export interface ReviewOutcomeRow {
  id: string;
  extractionLogId: string;
  documentId: string;
  orgId: string;
  userCorrected: boolean;
  correctionCount: number;
  reviewedByUserId: string;
  reviewedAt: Date;
}

// ---------------------------------------------------------------------------
// Insert review outcome (one per extraction log, enforced by unique constraint)
// ---------------------------------------------------------------------------

/**
 * Record the outcome of a user reviewing an extraction.
 * One outcome per extraction log — the unique constraint on
 * extraction_log_id prevents duplicates.
 */
export async function insertReviewOutcome(
  input: InsertReviewOutcomeInput
): Promise<ReviewOutcomeRow> {
  const [result] = await db
    .insert(extractionReviewOutcome)
    .values({
      extractionLogId: input.extractionLogId,
      documentId: input.documentId,
      orgId: input.orgId,
      userCorrected: input.userCorrected,
      correctionCount: input.correctionCount,
      reviewedByUserId: input.reviewedByUserId,
    })
    .returning();

  await auditMutation({
    orgId: input.orgId,
    entityType: "extraction_review_outcome",
    entityId: result.id,
    action: "create",
    newValue: {
      documentId: input.documentId,
      userCorrected: input.userCorrected,
      correctionCount: input.correctionCount,
    },
  });

  return result;
}

// ---------------------------------------------------------------------------
// Get review outcome for a document
// ---------------------------------------------------------------------------

export async function getReviewOutcomeByDocument(
  orgId: string,
  documentId: string
): Promise<ReviewOutcomeRow | null> {
  const [row] = await db
    .select()
    .from(extractionReviewOutcome)
    .where(
      and(
        ...orgScopeAlive(extractionReviewOutcome, orgId),
        eq(extractionReviewOutcome.documentId, documentId)
      )
    )
    .limit(1);

  return row ?? null;
}

// ---------------------------------------------------------------------------
// Get review outcome for an extraction log
// ---------------------------------------------------------------------------

export async function getReviewOutcomeByLog(
  orgId: string,
  extractionLogId: string
): Promise<ReviewOutcomeRow | null> {
  const [row] = await db
    .select()
    .from(extractionReviewOutcome)
    .where(
      and(
        ...orgScopeAlive(extractionReviewOutcome, orgId),
        eq(extractionReviewOutcome.extractionLogId, extractionLogId)
      )
    )
    .limit(1);

  return row ?? null;
}
