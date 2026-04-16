import { and, eq, sql, count } from "drizzle-orm";
import { db } from "../index";
import { exemplarConsensus } from "../schema";
import type { FieldCriticality } from "@/lib/ai/field-criticality";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UpsertConsensusInput {
  vendorKey: string;
  fieldName: string;
  normalizedValue: string;
  normalizedValueHash: string;
  fieldCriticality: FieldCriticality;
  weightedOrgCount: string;
  agreeingOrgCount: number;
  contradictingCount: number;
}

export interface ConsensusRow {
  id: string;
  vendorKey: string;
  fieldName: string;
  normalizedValue: string;
  normalizedValueHash: string;
  fieldCriticality: FieldCriticality;
  weightedOrgCount: string;
  agreeingOrgCount: number;
  contradictingCount: number;
  status: "candidate" | "shadow_pending" | "promoted" | "retired";
  promotedAt: Date | null;
  retiredAt: Date | null;
  recomputedAt: Date;
  createdAt: Date;
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

export async function getConsensusForVendor(
  vendorKey: string,
  fieldName: string
): Promise<ConsensusRow[]> {
  return db
    .select()
    .from(exemplarConsensus)
    .where(
      and(
        eq(exemplarConsensus.vendorKey, vendorKey),
        eq(exemplarConsensus.fieldName, fieldName)
      )
    );
}

/**
 * Get consensus entries that meet promotion thresholds but aren't yet promoted.
 * Cross-org query — no org_id scoping (intentional).
 */
export async function getPromotionCandidates(): Promise<ConsensusRow[]> {
  return db
    .select()
    .from(exemplarConsensus)
    .where(eq(exemplarConsensus.status, "candidate"));
}

/**
 * Aggregate stats for the admin dashboard.
 */
export async function getConsensusStats(): Promise<{
  total: number;
  candidates: number;
  promoted: number;
  retired: number;
}> {
  const [total] = await db
    .select({ count: count() })
    .from(exemplarConsensus);

  const [candidates] = await db
    .select({ count: count() })
    .from(exemplarConsensus)
    .where(eq(exemplarConsensus.status, "candidate"));

  const [promoted] = await db
    .select({ count: count() })
    .from(exemplarConsensus)
    .where(eq(exemplarConsensus.status, "promoted"));

  const [retired] = await db
    .select({ count: count() })
    .from(exemplarConsensus)
    .where(eq(exemplarConsensus.status, "retired"));

  return {
    total: total.count,
    candidates: candidates.count,
    promoted: promoted.count,
    retired: retired.count,
  };
}

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

export async function upsertConsensusEntry(
  input: UpsertConsensusInput
): Promise<{ id: string }> {
  const [result] = await db
    .insert(exemplarConsensus)
    .values({
      vendorKey: input.vendorKey,
      fieldName: input.fieldName,
      normalizedValue: input.normalizedValue,
      normalizedValueHash: input.normalizedValueHash,
      fieldCriticality: input.fieldCriticality,
      weightedOrgCount: input.weightedOrgCount,
      agreeingOrgCount: input.agreeingOrgCount,
      contradictingCount: input.contradictingCount,
    })
    .onConflictDoUpdate({
      target: [
        exemplarConsensus.vendorKey,
        exemplarConsensus.fieldName,
        exemplarConsensus.normalizedValueHash,
      ],
      set: {
        weightedOrgCount: sql`EXCLUDED.weighted_org_count`,
        agreeingOrgCount: sql`EXCLUDED.agreeing_org_count`,
        contradictingCount: sql`EXCLUDED.contradicting_count`,
        recomputedAt: sql`now()`,
      },
    })
    .returning({ id: exemplarConsensus.id });

  return result;
}

export async function markPromoted(consensusId: string): Promise<void> {
  await db
    .update(exemplarConsensus)
    .set({
      status: "promoted",
      promotedAt: sql`now()`,
    })
    .where(eq(exemplarConsensus.id, consensusId));
}

export async function markRetired(consensusId: string): Promise<void> {
  await db
    .update(exemplarConsensus)
    .set({
      status: "retired",
      retiredAt: sql`now()`,
    })
    .where(eq(exemplarConsensus.id, consensusId));
}
