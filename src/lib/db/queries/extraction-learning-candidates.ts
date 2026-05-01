import { and, eq, inArray, isNull, notInArray, sql } from "drizzle-orm";
import { db } from "../index";
import { extractionLearningCandidates } from "../schema";
import { orgScope } from "../helpers/org-scope";
import { auditMutation } from "../helpers/audit-log";
import type { FieldCriticality } from "@/lib/ai/field-criticality";

export type LearningCandidateType =
  | "field_exemplar"
  | "field_rule"
  | "document_family_rule"
  | "vendor_rule";

export type LearningCandidateScope =
  | "document"
  | "vendor"
  | "vendor_document_family"
  | "global_candidate";

export type LearningCandidateStatus =
  | "candidate"
  | "shadow"
  | "active"
  | "retired"
  | "rejected";

export interface UpsertLearningCandidateInput {
  orgId: string;
  documentId: string;
  correctionSessionId: string;
  vendorId: string | null;
  vendorKey?: string | null;
  documentFamily?: string | null;
  fieldName: string;
  fieldCriticality: FieldCriticality;
  candidateType: LearningCandidateType;
  aiValue: string | null;
  confirmedValue: string | null;
  rationale?: string | null;
  selectorHint?: string | null;
  rejectHint?: string | null;
  appliesWhen?: unknown[];
  scope: LearningCandidateScope;
  status?: LearningCandidateStatus;
  confidence?: string | null;
  promotionEvidence?: Record<string, unknown> | null;
}

export interface LearningCandidateRow {
  id: string;
  orgId: string;
  documentId: string;
  correctionSessionId: string;
  vendorId: string | null;
  vendorKey: string | null;
  documentFamily: string | null;
  fieldName: string;
  fieldCriticality: FieldCriticality;
  candidateType: LearningCandidateType;
  aiValue: string | null;
  confirmedValue: string | null;
  rationale: string | null;
  selectorHint: string | null;
  rejectHint: string | null;
  appliesWhen: unknown;
  scope: LearningCandidateScope;
  status: LearningCandidateStatus;
  confidence: string | null;
  promotionEvidence: unknown;
  retirementReason: string | null;
  createdAt: Date;
  updatedAt: Date | null;
  deletedAt: Date | null;
}

export async function upsertLearningCandidate(
  input: UpsertLearningCandidateInput
): Promise<LearningCandidateRow> {
  const [row] = await db
    .insert(extractionLearningCandidates)
    .values({
      orgId: input.orgId,
      documentId: input.documentId,
      correctionSessionId: input.correctionSessionId,
      vendorId: input.vendorId,
      vendorKey: input.vendorKey ?? null,
      documentFamily: input.documentFamily ?? null,
      fieldName: input.fieldName,
      fieldCriticality: input.fieldCriticality,
      candidateType: input.candidateType,
      aiValue: input.aiValue,
      confirmedValue: input.confirmedValue,
      rationale: input.rationale ?? null,
      selectorHint: input.selectorHint ?? null,
      rejectHint: input.rejectHint ?? null,
      appliesWhen: input.appliesWhen ?? [],
      scope: input.scope,
      status: input.status ?? "candidate",
      confidence: input.confidence ?? null,
      promotionEvidence: input.promotionEvidence ?? null,
    })
    .onConflictDoUpdate({
      target: [
        extractionLearningCandidates.correctionSessionId,
        extractionLearningCandidates.fieldName,
        extractionLearningCandidates.candidateType,
      ],
      targetWhere: isNull(extractionLearningCandidates.deletedAt),
      set: {
        vendorId: sql`EXCLUDED.vendor_id`,
        vendorKey: sql`EXCLUDED.vendor_key`,
        documentFamily: sql`EXCLUDED.document_family`,
        fieldCriticality: sql`EXCLUDED.field_criticality`,
        aiValue: sql`EXCLUDED.ai_value`,
        confirmedValue: sql`EXCLUDED.confirmed_value`,
        rationale: sql`EXCLUDED.rationale`,
        selectorHint: sql`EXCLUDED.selector_hint`,
        rejectHint: sql`EXCLUDED.reject_hint`,
        appliesWhen: sql`EXCLUDED.applies_when`,
        scope: sql`EXCLUDED.scope`,
        status: sql`CASE WHEN ${extractionLearningCandidates.status} IN ('active', 'shadow') THEN ${extractionLearningCandidates.status} ELSE EXCLUDED.status END`,
        confidence: sql`EXCLUDED.confidence`,
        promotionEvidence: sql`EXCLUDED.promotion_evidence`,
        updatedAt: sql`now()`,
      },
    })
    .returning();

  await auditMutation({
    orgId: input.orgId,
    entityType: "extraction_learning_candidate",
    entityId: row.id,
    action: "create",
    newValue: {
      documentId: input.documentId,
      correctionSessionId: input.correctionSessionId,
      vendorId: input.vendorId,
      fieldName: input.fieldName,
      candidateType: input.candidateType,
      status: input.status ?? "candidate",
    },
  });

  return row;
}

export async function upsertLearningCandidates(
  inputs: UpsertLearningCandidateInput[]
): Promise<LearningCandidateRow[]> {
  const rows: LearningCandidateRow[] = [];
  for (const input of inputs) {
    rows.push(await upsertLearningCandidate(input));
  }
  return rows;
}

export async function getCandidatesByCorrectionSession(
  orgId: string,
  correctionSessionId: string
): Promise<LearningCandidateRow[]> {
  return db
    .select()
    .from(extractionLearningCandidates)
    .where(
      and(
        ...orgScope(extractionLearningCandidates, orgId),
        eq(extractionLearningCandidates.correctionSessionId, correctionSessionId)
      )
    )
    .orderBy(extractionLearningCandidates.fieldName);
}

export async function getActiveLearningCandidates({
  orgId,
  vendorId,
  documentFamily,
  fieldNames,
  includeShadow = false,
}: {
  orgId: string;
  vendorId: string;
  documentFamily?: string | null;
  fieldNames?: string[];
  includeShadow?: boolean;
}): Promise<LearningCandidateRow[]> {
  const conditions = [
    ...orgScope(extractionLearningCandidates, orgId),
    eq(extractionLearningCandidates.vendorId, vendorId),
    inArray(
      extractionLearningCandidates.status,
      includeShadow ? ["shadow", "active"] : ["active"]
    ),
  ];

  if (documentFamily) {
    conditions.push(eq(extractionLearningCandidates.documentFamily, documentFamily));
  }
  if (fieldNames && fieldNames.length > 0) {
    conditions.push(inArray(extractionLearningCandidates.fieldName, fieldNames));
  }

  return db
    .select()
    .from(extractionLearningCandidates)
    .where(and(...conditions))
    .orderBy(sql`${extractionLearningCandidates.createdAt} DESC`);
}

export async function rejectStaleRuleCandidates({
  orgId,
  correctionSessionId,
  keepFieldNames,
}: {
  orgId: string;
  correctionSessionId: string;
  keepFieldNames: string[];
}): Promise<number> {
  const conditions = [
    ...orgScope(extractionLearningCandidates, orgId),
    eq(extractionLearningCandidates.correctionSessionId, correctionSessionId),
    eq(extractionLearningCandidates.candidateType, "field_rule" as const),
    eq(extractionLearningCandidates.status, "candidate" as const),
  ];

  if (keepFieldNames.length > 0) {
    conditions.push(notInArray(extractionLearningCandidates.fieldName, keepFieldNames));
  }

  const rows = await db
    .update(extractionLearningCandidates)
    .set({
      status: "rejected",
      retirementReason: "superseded_by_latest_correction_explanation",
      updatedAt: sql`now()`,
    })
    .where(and(...conditions))
    .returning({ id: extractionLearningCandidates.id });

  for (const row of rows) {
    await auditMutation({
      orgId,
      entityType: "extraction_learning_candidate",
      entityId: row.id,
      action: "update",
      newValue: {
        status: "rejected",
        correctionSessionId,
        reason: "superseded_by_latest_correction_explanation",
      },
    });
  }

  return rows.length;
}

export async function promoteCandidatesForConfirmedSession({
  orgId,
  correctionSessionId,
}: {
  orgId: string;
  correctionSessionId: string;
}): Promise<{ active: number; shadow: number }> {
  const candidates = await getCandidatesByCorrectionSession(orgId, correctionSessionId);
  const active = 0;
  let shadow = 0;

  for (const candidate of candidates) {
    if (candidate.status !== "candidate") continue;
    const nextStatus = "shadow";

    const [updated] = await db
      .update(extractionLearningCandidates)
      .set({
        status: nextStatus,
        promotionEvidence: {
          correctionSessionId,
          reason: "confirmed_candidate_requires_scoped_validation",
        },
        updatedAt: sql`now()`,
      })
      .where(
        and(
          ...orgScope(extractionLearningCandidates, orgId),
          eq(extractionLearningCandidates.id, candidate.id)
        )
      )
      .returning({ id: extractionLearningCandidates.id });

    if (!updated) continue;
    shadow++;

    await auditMutation({
      orgId,
      entityType: "extraction_learning_candidate",
      entityId: candidate.id,
      action: "update",
      oldValue: { status: candidate.status },
      newValue: { status: nextStatus, correctionSessionId },
    });
  }

  return { active, shadow };
}
