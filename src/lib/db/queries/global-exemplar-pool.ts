import { and, eq, isNull, sql, count } from "drizzle-orm";
import { db } from "../index";
import { globalExemplarPool } from "../schema";
import type { FieldCriticality } from "@/lib/ai/field-criticality";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GlobalExemplarRow {
  id: string;
  vendorKey: string;
  fieldName: string;
  canonicalValue: string;
  fieldCriticality: FieldCriticality;
  consensusId: string;
  promotedAt: Date;
  retiredAt: Date | null;
}

export interface PromoteToPoolInput {
  vendorKey: string;
  fieldName: string;
  canonicalValue: string;
  fieldCriticality: FieldCriticality;
  consensusId: string;
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

/**
 * Get active (non-retired) global exemplars for a vendor.
 * This is the Tier 2 read query — no org_id scoping (intentional).
 * Global exemplars are available to all orgs.
 */
export async function getGlobalExemplars(
  vendorKey: string
): Promise<GlobalExemplarRow[]> {
  return db
    .select()
    .from(globalExemplarPool)
    .where(
      and(
        eq(globalExemplarPool.vendorKey, vendorKey),
        isNull(globalExemplarPool.retiredAt)
      )
    );
}

/**
 * Aggregate stats for admin dashboard.
 */
export async function getGlobalPoolStats(): Promise<{
  active: number;
  retired: number;
}> {
  const [active] = await db
    .select({ count: count() })
    .from(globalExemplarPool)
    .where(isNull(globalExemplarPool.retiredAt));

  const [retired] = await db
    .select({ count: count() })
    .from(globalExemplarPool)
    .where(sql`${globalExemplarPool.retiredAt} IS NOT NULL`);

  return {
    active: active.count,
    retired: retired.count,
  };
}

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

/**
 * Promote a consensus entry to the global pool.
 * Uses ON CONFLICT on the partial unique index (vendor_key, field_name)
 * WHERE retired_at IS NULL — so only one active entry per vendor+field.
 */
export async function promoteToGlobalPool(
  input: PromoteToPoolInput
): Promise<{ id: string }> {
  const [result] = await db
    .insert(globalExemplarPool)
    .values({
      vendorKey: input.vendorKey,
      fieldName: input.fieldName,
      canonicalValue: input.canonicalValue,
      fieldCriticality: input.fieldCriticality,
      consensusId: input.consensusId,
    })
    .onConflictDoUpdate({
      target: [globalExemplarPool.vendorKey, globalExemplarPool.fieldName],
      targetWhere: isNull(globalExemplarPool.retiredAt),
      set: {
        canonicalValue: sql`EXCLUDED.canonical_value`,
        fieldCriticality: sql`EXCLUDED.field_criticality`,
        consensusId: sql`EXCLUDED.consensus_id`,
        promotedAt: sql`now()`,
      },
    })
    .returning({ id: globalExemplarPool.id });

  return result;
}

/**
 * Retire a global exemplar — sets retired_at, making the unique index
 * slot available for a replacement.
 */
export async function retireGlobalExemplar(
  vendorKey: string,
  fieldName: string
): Promise<void> {
  await db
    .update(globalExemplarPool)
    .set({ retiredAt: sql`now()` })
    .where(
      and(
        eq(globalExemplarPool.vendorKey, vendorKey),
        eq(globalExemplarPool.fieldName, fieldName),
        isNull(globalExemplarPool.retiredAt)
      )
    );
}

/**
 * Retire a specific global pool entry by ID.
 */
export async function retireGlobalExemplarById(
  poolId: string
): Promise<void> {
  await db
    .update(globalExemplarPool)
    .set({ retiredAt: sql`now()` })
    .where(
      and(
        eq(globalExemplarPool.id, poolId),
        isNull(globalExemplarPool.retiredAt)
      )
    );
}
