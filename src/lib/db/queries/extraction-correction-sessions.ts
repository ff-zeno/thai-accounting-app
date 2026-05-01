import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "../index";
import { extractionCorrectionSessions } from "../schema";
import { orgScope } from "../helpers/org-scope";
import { auditMutation } from "../helpers/audit-log";

export type CorrectionSessionStatus = "draft" | "confirmed" | "abandoned";

export interface UpsertDraftCorrectionSessionInput {
  orgId: string;
  documentId: string;
  extractionLogId: string;
  startedByUserId: string;
  userExplanation?: string | null;
  aiInterpretation?: Record<string, unknown> | null;
}

export interface CorrectionSessionRow {
  id: string;
  orgId: string;
  documentId: string;
  extractionLogId: string;
  startedByUserId: string;
  confirmedByUserId: string | null;
  status: CorrectionSessionStatus;
  userExplanation: string | null;
  aiInterpretation: unknown;
  confirmedAt: Date | null;
  createdAt: Date;
  updatedAt: Date | null;
  deletedAt: Date | null;
}

/**
 * Idempotently records the review save as a draft correction session.
 *
 * Direct field edits without chat still create a session. This is not the
 * trust boundary; `confirmLatestCorrectionSessionForDocument()` marks it
 * confirmed when the user confirms the document.
 */
export async function upsertDraftCorrectionSession(
  input: UpsertDraftCorrectionSessionInput
): Promise<CorrectionSessionRow> {
  const [row] = await db
    .insert(extractionCorrectionSessions)
    .values({
      orgId: input.orgId,
      documentId: input.documentId,
      extractionLogId: input.extractionLogId,
      startedByUserId: input.startedByUserId,
      confirmedByUserId: null,
      status: "draft",
      userExplanation: input.userExplanation ?? null,
      aiInterpretation: input.aiInterpretation ?? null,
      confirmedAt: null,
    })
    .onConflictDoUpdate({
      target: extractionCorrectionSessions.extractionLogId,
      targetWhere: isNull(extractionCorrectionSessions.deletedAt),
      set: {
        documentId: sql`EXCLUDED.document_id`,
        startedByUserId: sql`EXCLUDED.started_by_user_id`,
        confirmedByUserId: sql`CASE WHEN ${extractionCorrectionSessions.status} = 'confirmed' THEN ${extractionCorrectionSessions.confirmedByUserId} ELSE NULL END`,
        status: sql`CASE WHEN ${extractionCorrectionSessions.status} = 'confirmed' THEN ${extractionCorrectionSessions.status} ELSE 'draft' END`,
        userExplanation: sql`EXCLUDED.user_explanation`,
        aiInterpretation: sql`EXCLUDED.ai_interpretation`,
        confirmedAt: sql`CASE WHEN ${extractionCorrectionSessions.status} = 'confirmed' THEN ${extractionCorrectionSessions.confirmedAt} ELSE NULL END`,
        updatedAt: sql`now()`,
      },
    })
    .returning();

  await auditMutation({
    orgId: input.orgId,
    entityType: "extraction_correction_session",
    entityId: row.id,
    action: "create",
    newValue: {
      documentId: input.documentId,
      extractionLogId: input.extractionLogId,
      status: "draft",
      hasUserExplanation: Boolean(input.userExplanation?.trim()),
    },
  });

  return row;
}

export async function confirmLatestCorrectionSessionForDocument({
  orgId,
  documentId,
  confirmedByUserId,
}: {
  orgId: string;
  documentId: string;
  confirmedByUserId: string;
}): Promise<CorrectionSessionRow | null> {
  const latest = await getCorrectionSessionByDocument(orgId, documentId);
  if (!latest || latest.status === "confirmed") return latest;

  const [row] = await db
    .update(extractionCorrectionSessions)
    .set({
      status: "confirmed",
      confirmedByUserId,
      confirmedAt: sql`now()`,
      updatedAt: sql`now()`,
    })
    .where(
      and(
        ...orgScope(extractionCorrectionSessions, orgId),
        eq(extractionCorrectionSessions.id, latest.id)
      )
    )
    .returning();

  if (!row) return null;

  await auditMutation({
    orgId,
    entityType: "extraction_correction_session",
    entityId: row.id,
    action: "update",
    oldValue: { status: latest.status },
    newValue: {
      status: "confirmed",
      documentId,
      extractionLogId: row.extractionLogId,
    },
  });

  return row;
}

export async function getCorrectionSessionByExtractionLog(
  orgId: string,
  extractionLogId: string
): Promise<CorrectionSessionRow | null> {
  const [row] = await db
    .select()
    .from(extractionCorrectionSessions)
    .where(
      and(
        ...orgScope(extractionCorrectionSessions, orgId),
        eq(extractionCorrectionSessions.extractionLogId, extractionLogId)
      )
    )
    .limit(1);

  return row ?? null;
}

export async function getCorrectionSessionByDocument(
  orgId: string,
  documentId: string
): Promise<CorrectionSessionRow | null> {
  const [row] = await db
    .select()
    .from(extractionCorrectionSessions)
    .where(
      and(
        ...orgScope(extractionCorrectionSessions, orgId),
        eq(extractionCorrectionSessions.documentId, documentId)
      )
    )
    .orderBy(sql`${extractionCorrectionSessions.createdAt} DESC`)
    .limit(1);

  return row ?? null;
}
