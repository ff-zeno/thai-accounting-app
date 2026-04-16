import { and, eq, sql } from "drizzle-orm";
import { db } from "../index";
import { vendorTier } from "../schema";
import { auditMutation } from "../helpers/audit-log";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface VendorTierRow {
  id: string;
  vendorId: string;
  orgId: string | null;
  tier: number;
  docsProcessedTotal: number;
  lastDocAt: Date | null;
  lastPromotedAt: Date | null;
  lastDemotedAt: Date | null;
}

// ---------------------------------------------------------------------------
// Get vendor tier for an org (scope_kind = 'org')
// ---------------------------------------------------------------------------

export async function getVendorTier(
  orgId: string,
  vendorId: string
): Promise<VendorTierRow | null> {
  const [row] = await db
    .select({
      id: vendorTier.id,
      vendorId: vendorTier.vendorId,
      orgId: vendorTier.orgId,
      tier: vendorTier.tier,
      docsProcessedTotal: vendorTier.docsProcessedTotal,
      lastDocAt: vendorTier.lastDocAt,
      lastPromotedAt: vendorTier.lastPromotedAt,
      lastDemotedAt: vendorTier.lastDemotedAt,
    })
    .from(vendorTier)
    .where(
      and(
        eq(vendorTier.vendorId, vendorId),
        eq(vendorTier.orgId, orgId),
        eq(vendorTier.scopeKind, "org")
      )
    )
    .limit(1);

  return row ?? null;
}

// ---------------------------------------------------------------------------
// Upsert vendor tier (org-scoped)
// ---------------------------------------------------------------------------

/**
 * Create or update the org-scoped tier for a vendor.
 * Increments docs_processed_total and updates last_doc_at on every call.
 * Tier changes only happen on explicit promote/demote.
 */
export async function upsertVendorTier(
  orgId: string,
  vendorId: string,
  updates?: { tier?: number }
): Promise<VendorTierRow> {
  const now = new Date();

  const [result] = await db
    .insert(vendorTier)
    .values({
      vendorId,
      scopeKind: "org",
      orgId,
      tier: updates?.tier ?? 0,
      docsProcessedTotal: 1,
      lastDocAt: now,
      lastPromotedAt: updates?.tier && updates.tier > 0 ? now : null,
    })
    .onConflictDoUpdate({
      target: [vendorTier.vendorId, vendorTier.orgId],
      targetWhere: sql`${vendorTier.scopeKind} = 'org'`,
      set: {
        docsProcessedTotal: sql`${vendorTier.docsProcessedTotal} + 1`,
        lastDocAt: now,
        ...(updates?.tier !== undefined
          ? {
              tier: updates.tier,
              lastPromotedAt:
                updates.tier > 0 ? now : sql`${vendorTier.lastPromotedAt}`,
            }
          : {}),
      },
    })
    .returning({
      id: vendorTier.id,
      vendorId: vendorTier.vendorId,
      orgId: vendorTier.orgId,
      tier: vendorTier.tier,
      docsProcessedTotal: vendorTier.docsProcessedTotal,
      lastDocAt: vendorTier.lastDocAt,
      lastPromotedAt: vendorTier.lastPromotedAt,
      lastDemotedAt: vendorTier.lastDemotedAt,
    });

  await auditMutation({
    orgId,
    entityType: "vendor_tier",
    entityId: result.id,
    action: "update",
    newValue: {
      vendorId,
      tier: result.tier,
      docsProcessedTotal: result.docsProcessedTotal,
    },
  });

  return result;
}

// ---------------------------------------------------------------------------
// Promote vendor tier
// ---------------------------------------------------------------------------

export async function promoteVendorTier(
  orgId: string,
  vendorId: string,
  newTier: number
): Promise<VendorTierRow> {
  return upsertVendorTier(orgId, vendorId, { tier: newTier });
}

// ---------------------------------------------------------------------------
// Demote vendor tier
// ---------------------------------------------------------------------------

export async function demoteVendorTier(
  orgId: string,
  vendorId: string,
  newTier: number
): Promise<VendorTierRow | null> {
  const [result] = await db
    .update(vendorTier)
    .set({
      tier: newTier,
      lastDemotedAt: new Date(),
    })
    .where(
      and(
        eq(vendorTier.vendorId, vendorId),
        eq(vendorTier.orgId, orgId),
        eq(vendorTier.scopeKind, "org")
      )
    )
    .returning({
      id: vendorTier.id,
      vendorId: vendorTier.vendorId,
      orgId: vendorTier.orgId,
      tier: vendorTier.tier,
      docsProcessedTotal: vendorTier.docsProcessedTotal,
      lastDocAt: vendorTier.lastDocAt,
      lastPromotedAt: vendorTier.lastPromotedAt,
      lastDemotedAt: vendorTier.lastDemotedAt,
    });

  if (result) {
    await auditMutation({
      orgId,
      entityType: "vendor_tier",
      entityId: result.id,
      action: "update",
      newValue: { vendorId, tier: newTier, demoted: true },
    });
  }

  return result ?? null;
}
