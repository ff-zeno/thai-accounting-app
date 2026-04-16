import { and, eq, isNull, desc, sql, count } from "drizzle-orm";
import { db } from "../index";
import {
  globalExemplarPool,
  exemplarConsensus,
  extractionLog,
} from "../schema";
import { getOrgReputation } from "./org-reputation";
import { getGlobalPoolStats } from "./global-exemplar-pool";
import { getConsensusStats } from "./exemplar-consensus";
import type { FieldCriticality } from "@/lib/ai/field-criticality";

// ---------------------------------------------------------------------------
// Re-export for convenience
// ---------------------------------------------------------------------------

export { getOrgReputation, getGlobalPoolStats, getConsensusStats };

// ---------------------------------------------------------------------------
// Promotion timeline
// ---------------------------------------------------------------------------

export interface PromotionTimelineEntry {
  id: string;
  vendorKey: string;
  fieldName: string;
  normalizedValue: string;
  fieldCriticality: FieldCriticality;
  status: "candidate" | "shadow_pending" | "promoted" | "retired";
  promotedAt: Date | null;
  retiredAt: Date | null;
  agreeingOrgCount: number;
}

export async function getPromotionTimeline(
  limit: number = 20
): Promise<PromotionTimelineEntry[]> {
  return db
    .select({
      id: exemplarConsensus.id,
      vendorKey: exemplarConsensus.vendorKey,
      fieldName: exemplarConsensus.fieldName,
      normalizedValue: exemplarConsensus.normalizedValue,
      fieldCriticality: exemplarConsensus.fieldCriticality,
      status: exemplarConsensus.status,
      promotedAt: exemplarConsensus.promotedAt,
      retiredAt: exemplarConsensus.retiredAt,
      agreeingOrgCount: exemplarConsensus.agreeingOrgCount,
    })
    .from(exemplarConsensus)
    .where(
      sql`${exemplarConsensus.promotedAt} IS NOT NULL OR ${exemplarConsensus.retiredAt} IS NOT NULL`
    )
    .orderBy(desc(exemplarConsensus.recomputedAt))
    .limit(limit);
}

// ---------------------------------------------------------------------------
// Vendor tier distribution
// ---------------------------------------------------------------------------

export interface VendorTierDistribution {
  tier: number;
  count: number;
}

export async function getVendorTierDistribution(
  orgId: string
): Promise<VendorTierDistribution[]> {
  const rows = await db
    .select({
      tier: extractionLog.tierUsed,
      count: count(),
    })
    .from(extractionLog)
    .where(eq(extractionLog.orgId, orgId))
    .groupBy(extractionLog.tierUsed)
    .orderBy(extractionLog.tierUsed);

  return rows.map((r) => ({ tier: r.tier, count: r.count }));
}

// ---------------------------------------------------------------------------
// Recent high-criticality promotions
// ---------------------------------------------------------------------------

export interface RecentHighCritPromotion {
  poolId: string;
  vendorKey: string;
  fieldName: string;
  canonicalValue: string;
  promotedAt: Date;
}

export async function getRecentHighCriticalityPromotions(
  limit: number = 10
): Promise<RecentHighCritPromotion[]> {
  return db
    .select({
      poolId: globalExemplarPool.id,
      vendorKey: globalExemplarPool.vendorKey,
      fieldName: globalExemplarPool.fieldName,
      canonicalValue: globalExemplarPool.canonicalValue,
      promotedAt: globalExemplarPool.promotedAt,
    })
    .from(globalExemplarPool)
    .where(
      and(
        eq(globalExemplarPool.fieldCriticality, "high"),
        isNull(globalExemplarPool.retiredAt)
      )
    )
    .orderBy(desc(globalExemplarPool.promotedAt))
    .limit(limit);
}
