import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "../index";
import { extractionExemplars } from "../schema";
import { orgScope } from "../helpers/org-scope";
import { auditMutation } from "../helpers/audit-log";
import type { FieldCriticality } from "@/lib/ai/field-criticality";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UpsertExemplarInput {
  orgId: string;
  vendorId: string;
  fieldName: string;
  fieldCriticality: FieldCriticality;
  aiValue: string | null;
  userValue: string | null;
  wasCorrected: boolean;
  documentId: string;
  modelUsed?: string;
  confidenceAtTime?: string;
  vendorTaxId?: string | null;
}

export interface Exemplar {
  id: string;
  fieldName: string;
  aiValue: string | null;
  userValue: string | null;
  wasCorrected: boolean;
  documentId: string;
  createdAt: Date;
}

// ---------------------------------------------------------------------------
// Upsert exemplar (one per field per document per vendor per org)
// ---------------------------------------------------------------------------

/**
 * Insert or update an extraction exemplar.
 *
 * Uses ON CONFLICT DO UPDATE on the partial unique index
 * (org_id, vendor_id, field_name, document_id) WHERE deleted_at IS NULL.
 * This handles re-saves of the same document gracefully.
 */
export async function upsertExemplar(
  input: UpsertExemplarInput
): Promise<{ id: string }> {
  const [result] = await db
    .insert(extractionExemplars)
    .values({
      orgId: input.orgId,
      vendorId: input.vendorId,
      fieldName: input.fieldName,
      fieldCriticality: input.fieldCriticality,
      aiValue: input.aiValue,
      userValue: input.userValue,
      wasCorrected: input.wasCorrected,
      documentId: input.documentId,
      modelUsed: input.modelUsed ?? null,
      confidenceAtTime: input.confidenceAtTime ?? null,
      vendorTaxId: input.vendorTaxId ?? null,
    })
    .onConflictDoUpdate({
      target: [
        extractionExemplars.orgId,
        extractionExemplars.vendorId,
        extractionExemplars.fieldName,
        extractionExemplars.documentId,
      ],
      targetWhere: isNull(extractionExemplars.deletedAt),
      set: {
        aiValue: sql`EXCLUDED.ai_value`,
        userValue: sql`EXCLUDED.user_value`,
        wasCorrected: sql`EXCLUDED.was_corrected`,
        fieldCriticality: sql`EXCLUDED.field_criticality`,
        modelUsed: sql`EXCLUDED.model_used`,
        confidenceAtTime: sql`EXCLUDED.confidence_at_time`,
        // Reset created_at on re-save so recency ordering stays correct
        createdAt: sql`now()`,
      },
    })
    .returning({ id: extractionExemplars.id });

  await auditMutation({
    orgId: input.orgId,
    entityType: "extraction_exemplar",
    entityId: result.id,
    action: "create",
    newValue: {
      vendorId: input.vendorId,
      fieldName: input.fieldName,
      wasCorrected: input.wasCorrected,
      documentId: input.documentId,
    },
  });

  return result;
}

// ---------------------------------------------------------------------------
// Get top-N recent exemplars for a vendor (used during extraction context)
// ---------------------------------------------------------------------------

/**
 * Returns the most recent exemplars for a vendor+org, grouped by field,
 * limited to `limit` per field. Only returns corrected exemplars (the ones
 * that teach the model something new).
 */
export async function getTopExemplars(
  orgId: string,
  vendorId: string,
  limit: number = 3
): Promise<Exemplar[]> {
  const rows = await db
    .select({
      id: extractionExemplars.id,
      fieldName: extractionExemplars.fieldName,
      aiValue: extractionExemplars.aiValue,
      userValue: extractionExemplars.userValue,
      wasCorrected: extractionExemplars.wasCorrected,
      documentId: extractionExemplars.documentId,
      createdAt: extractionExemplars.createdAt,
    })
    .from(extractionExemplars)
    .where(
      and(
        ...orgScope(extractionExemplars, orgId),
        eq(extractionExemplars.vendorId, vendorId),
        eq(extractionExemplars.wasCorrected, true)
      )
    )
    .orderBy(desc(extractionExemplars.createdAt))
    .limit(limit * 20); // Over-fetch, then trim per-field in JS

  // Group by field, take top N per field
  const byField = new Map<string, Exemplar[]>();
  for (const row of rows) {
    const arr = byField.get(row.fieldName) ?? [];
    if (arr.length < limit) {
      arr.push(row);
      byField.set(row.fieldName, arr);
    }
  }

  return Array.from(byField.values()).flat();
}

// ---------------------------------------------------------------------------
// Get exemplars for a specific document (used during review display)
// ---------------------------------------------------------------------------

export async function getExemplarsByDocument(
  orgId: string,
  documentId: string
): Promise<Exemplar[]> {
  return db
    .select({
      id: extractionExemplars.id,
      fieldName: extractionExemplars.fieldName,
      aiValue: extractionExemplars.aiValue,
      userValue: extractionExemplars.userValue,
      wasCorrected: extractionExemplars.wasCorrected,
      documentId: extractionExemplars.documentId,
      createdAt: extractionExemplars.createdAt,
    })
    .from(extractionExemplars)
    .where(
      and(
        ...orgScope(extractionExemplars, orgId),
        eq(extractionExemplars.documentId, documentId)
      )
    )
    .orderBy(extractionExemplars.fieldName);
}

// ---------------------------------------------------------------------------
// Cross-org aggregation for consensus cron (Phase 8 Phase 2)
// ---------------------------------------------------------------------------

export interface VendorFieldAggregation {
  vendorTaxId: string;
  fieldName: string;
  fieldCriticality: FieldCriticality;
  userValue: string;
  orgId: string;
}

/**
 * Aggregate corrected exemplars across eligible orgs, grouped by vendor_tax_id.
 * Cross-org query — no org_id scoping (intentional for consensus building).
 *
 * Returns all corrected exemplars from eligible orgs that have a vendor_tax_id,
 * so the consensus cron can group and count agreements.
 */
export async function aggregateExemplarsByVendorKey(
  eligibleOrgIds: string[]
): Promise<VendorFieldAggregation[]> {
  if (eligibleOrgIds.length === 0) return [];

  const rows = await db
    .select({
      vendorTaxId: extractionExemplars.vendorTaxId,
      fieldName: extractionExemplars.fieldName,
      fieldCriticality: extractionExemplars.fieldCriticality,
      userValue: extractionExemplars.userValue,
      orgId: extractionExemplars.orgId,
    })
    .from(extractionExemplars)
    .where(
      and(
        eq(extractionExemplars.wasCorrected, true),
        isNull(extractionExemplars.deletedAt),
        sql`${extractionExemplars.vendorTaxId} IS NOT NULL`,
        sql`${extractionExemplars.orgId} IN (${sql.join(
          eligibleOrgIds.map((id) => sql`${id}`),
          sql`, `
        )})`
      )
    );

  // Filter out nulls (TypeScript narrowing)
  return rows.filter(
    (r): r is VendorFieldAggregation =>
      r.vendorTaxId != null && r.userValue != null
  );
}
