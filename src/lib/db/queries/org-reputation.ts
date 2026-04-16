import { eq, sql } from "drizzle-orm";
import { db } from "../index";
import { orgReputation } from "../schema";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OrgReputationRow {
  id: string;
  orgId: string;
  score: string;
  correctionsTotal: number;
  correctionsAgreed: number;
  correctionsDisputed: number;
  firstDocAt: Date | null;
  docsProcessed: number;
  eligible: boolean;
  updatedAt: Date | null;
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

export async function getOrgReputation(
  orgId: string
): Promise<OrgReputationRow | null> {
  const [row] = await db
    .select()
    .from(orgReputation)
    .where(eq(orgReputation.orgId, orgId))
    .limit(1);
  return row ?? null;
}

/**
 * Get all org IDs that meet the eligibility gate:
 * ≥30 days since first doc, ≥50 docs processed, score ≥1.0.
 *
 * NOTE: This is intentionally cross-org (no org_id scoping).
 * The consensus system needs to aggregate across all eligible orgs.
 */
export async function getEligibleOrgIds(): Promise<string[]> {
  const rows = await db
    .select({ orgId: orgReputation.orgId })
    .from(orgReputation)
    .where(eq(orgReputation.eligible, true));
  return rows.map((r) => r.orgId);
}

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

export async function upsertOrgReputation(
  orgId: string,
  updates?: Partial<{
    score: string;
    correctionsTotal: number;
    correctionsAgreed: number;
    correctionsDisputed: number;
    firstDocAt: Date;
    docsProcessed: number;
    eligible: boolean;
  }>
): Promise<OrgReputationRow> {
  const [row] = await db
    .insert(orgReputation)
    .values({
      orgId,
      ...updates,
    })
    .onConflictDoUpdate({
      target: [orgReputation.orgId],
      set: {
        ...(updates?.score != null ? { score: updates.score } : {}),
        ...(updates?.correctionsTotal != null
          ? { correctionsTotal: updates.correctionsTotal }
          : {}),
        ...(updates?.correctionsAgreed != null
          ? { correctionsAgreed: updates.correctionsAgreed }
          : {}),
        ...(updates?.correctionsDisputed != null
          ? { correctionsDisputed: updates.correctionsDisputed }
          : {}),
        ...(updates?.firstDocAt != null
          ? { firstDocAt: updates.firstDocAt }
          : {}),
        ...(updates?.docsProcessed != null
          ? { docsProcessed: updates.docsProcessed }
          : {}),
        ...(updates?.eligible != null ? { eligible: updates.eligible } : {}),
      },
    })
    .returning();
  return row;
}

/**
 * Atomically increment corrections_agreed using SQL.
 */
export async function incrementReputationAgreed(orgId: string): Promise<void> {
  await db
    .update(orgReputation)
    .set({
      correctionsAgreed: sql`${orgReputation.correctionsAgreed} + 1`,
      correctionsTotal: sql`${orgReputation.correctionsTotal} + 1`,
    })
    .where(eq(orgReputation.orgId, orgId));
}

/**
 * Atomically increment corrections_disputed using SQL.
 */
export async function incrementReputationDisputed(
  orgId: string
): Promise<void> {
  await db
    .update(orgReputation)
    .set({
      correctionsDisputed: sql`${orgReputation.correctionsDisputed} + 1`,
      correctionsTotal: sql`${orgReputation.correctionsTotal} + 1`,
    })
    .where(eq(orgReputation.orgId, orgId));
}

/**
 * Atomically increment docs_processed and set first_doc_at if null.
 */
export async function incrementDocsProcessed(orgId: string): Promise<void> {
  await db
    .update(orgReputation)
    .set({
      docsProcessed: sql`${orgReputation.docsProcessed} + 1`,
      firstDocAt: sql`COALESCE(${orgReputation.firstDocAt}, now())`,
    })
    .where(eq(orgReputation.orgId, orgId));
}

/**
 * Recalculate eligibility for an org based on current reputation state.
 * Eligible = ≥30 days since first doc AND ≥50 docs AND score ≥1.0
 *
 * Returns the new eligibility state.
 */
export async function recalculateEligibility(orgId: string): Promise<boolean> {
  const rep = await getOrgReputation(orgId);
  if (!rep) return false;

  const hasEnoughDocs = rep.docsProcessed >= 50;
  const hasEnoughTime =
    rep.firstDocAt != null &&
    Date.now() - rep.firstDocAt.getTime() >= 30 * 24 * 60 * 60 * 1000;
  const hasGoodScore = parseFloat(rep.score) >= 1.0;

  const eligible = hasEnoughDocs && hasEnoughTime && hasGoodScore;

  await db
    .update(orgReputation)
    .set({ eligible })
    .where(eq(orgReputation.orgId, orgId));

  return eligible;
}
