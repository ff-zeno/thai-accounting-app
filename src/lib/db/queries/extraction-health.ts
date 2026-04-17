import { and, eq, isNull, desc, sql, count, gte } from "drizzle-orm";
import { db } from "../index";
import {
  globalExemplarPool,
  exemplarConsensus,
  extractionLog,
  vendorTier,
  extractionReviewOutcome,
  orgReputation as orgReputationTable,
  vendors,
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

// ---------------------------------------------------------------------------
// Per-vendor cards (Phase 8 Phase 3)
// ---------------------------------------------------------------------------

export interface PerVendorCard {
  vendorId: string;
  vendorName: string;
  vendorTaxId: string | null;
  currentTier: number;
  docsProcessed: number;
  correctionRate30d: number;
}

export async function getPerVendorCards(
  orgId: string,
  limit: number = 20
): Promise<PerVendorCard[]> {
  const rows = await db
    .select({
      vendorId: vendors.id,
      vendorName: vendors.name,
      vendorTaxId: vendors.taxId,
      currentTier: vendorTier.tier,
      docsProcessed: vendorTier.docsProcessedTotal,
    })
    .from(vendorTier)
    .innerJoin(vendors, eq(vendors.id, vendorTier.vendorId))
    .where(
      and(
        eq(vendorTier.orgId, orgId),
        eq(vendorTier.scopeKind, "org")
      )
    )
    .orderBy(desc(vendorTier.docsProcessedTotal))
    .limit(limit);

  // Correction rates from review outcomes in last 30 days
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  return Promise.all(
    rows.map(async (r) => {
      const [correctionRow] = await db
        .select({
          total: count(),
          corrected: sql<number>`count(*) FILTER (WHERE ${extractionReviewOutcome.userCorrected} = true)`,
        })
        .from(extractionReviewOutcome)
        .innerJoin(extractionLog, eq(extractionLog.id, extractionReviewOutcome.extractionLogId))
        .where(
          and(
            eq(extractionReviewOutcome.orgId, orgId),
            eq(extractionLog.vendorId, sql`(SELECT id FROM vendors WHERE name = ${r.vendorName} AND org_id = ${orgId} LIMIT 1)`),
            gte(extractionReviewOutcome.reviewedAt, thirtyDaysAgo)
          )
        );

      const total = correctionRow?.total ?? 0;
      const corrected = correctionRow?.corrected ?? 0;
      const rate = total > 0 ? corrected / total : 0;

      return {
        vendorId: r.vendorId,
        vendorName: r.vendorName,
        vendorTaxId: r.vendorTaxId,
        currentTier: r.currentTier,
        docsProcessed: r.docsProcessed,
        correctionRate30d: rate,
      };
    })
  );
}

// ---------------------------------------------------------------------------
// Global extraction health (Phase 8 Phase 3)
// ---------------------------------------------------------------------------

export interface GlobalExtractionHealth {
  avgTier: number;
  costPerDocTrend: number;
  correctionRate: number;
}

export async function getGlobalExtractionHealth(): Promise<GlobalExtractionHealth> {
  const [tierRow] = await db
    .select({
      avgTier: sql<number>`coalesce(avg(${extractionLog.tierUsed})::numeric(5,2), 0)`,
    })
    .from(extractionLog);

  const [costRow] = await db
    .select({
      avgCost: sql<number>`coalesce(avg(${extractionLog.costUsd}::numeric), 0)`,
    })
    .from(extractionLog)
    .where(sql`${extractionLog.costUsd} IS NOT NULL`);

  const [correctionRow] = await db
    .select({
      total: count(),
      corrected: sql<number>`count(*) FILTER (WHERE ${extractionReviewOutcome.userCorrected} = true)`,
    })
    .from(extractionReviewOutcome);

  const total = correctionRow?.total ?? 0;
  const corrected = correctionRow?.corrected ?? 0;

  return {
    avgTier: Number(tierRow?.avgTier ?? 0),
    costPerDocTrend: Number(costRow?.avgCost ?? 0),
    correctionRate: total > 0 ? corrected / total : 0,
  };
}

// ---------------------------------------------------------------------------
// Consensus health (Phase 8 Phase 3)
// ---------------------------------------------------------------------------

export interface ConsensusHealth {
  candidatesInShadow: number;
  promotedThisWeek: number;
  demotedThisWeek: number;
  avgTimeToPromote: number;
}

export async function getConsensusHealth(): Promise<ConsensusHealth> {
  const [shadowRow] = await db
    .select({ count: count() })
    .from(exemplarConsensus)
    .where(eq(exemplarConsensus.status, "shadow_pending"));

  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

  const [promotedRow] = await db
    .select({ count: count() })
    .from(exemplarConsensus)
    .where(
      and(
        eq(exemplarConsensus.status, "promoted"),
        gte(exemplarConsensus.promotedAt, oneWeekAgo)
      )
    );

  const [retiredRow] = await db
    .select({ count: count() })
    .from(exemplarConsensus)
    .where(
      and(
        eq(exemplarConsensus.status, "retired"),
        gte(exemplarConsensus.retiredAt, oneWeekAgo)
      )
    );

  // Average time from creation to promotion (in days)
  const [avgRow] = await db
    .select({
      avgDays: sql<number>`coalesce(avg(extract(epoch from (${exemplarConsensus.promotedAt} - ${exemplarConsensus.createdAt})) / 86400)::numeric(8,1), 0)`,
    })
    .from(exemplarConsensus)
    .where(
      and(
        eq(exemplarConsensus.status, "promoted"),
        sql`${exemplarConsensus.promotedAt} IS NOT NULL`
      )
    );

  return {
    candidatesInShadow: shadowRow?.count ?? 0,
    promotedThisWeek: promotedRow?.count ?? 0,
    demotedThisWeek: retiredRow?.count ?? 0,
    avgTimeToPromote: Number(avgRow?.avgDays ?? 0),
  };
}

// ---------------------------------------------------------------------------
// Reputation distribution (Phase 8 Phase 3)
// ---------------------------------------------------------------------------

export interface ReputationBucket {
  bucket: string;
  count: number;
}

export async function getReputationDistribution(): Promise<ReputationBucket[]> {
  const rows = await db
    .select({
      bucket: sql<string>`(floor(${orgReputationTable.score}::numeric * 2) / 2)::text`,
      count: count(),
    })
    .from(orgReputationTable)
    .groupBy(sql`floor(${orgReputationTable.score}::numeric * 2) / 2`)
    .orderBy(sql`floor(${orgReputationTable.score}::numeric * 2) / 2`);

  return rows.map((r) => ({ bucket: r.bucket, count: r.count }));
}

// ---------------------------------------------------------------------------
// Idempotency health (Phase 8 Phase 3)
// ---------------------------------------------------------------------------

export interface IdempotencyHealth {
  duplicatesPrevented: number;
}

export async function getIdempotencyHealth(): Promise<IdempotencyHealth> {
  // Count idempotency key prefixes that appear more than once
  // (indicates duplicate prevention was exercised)
  const [row] = await db
    .select({
      count: sql<number>`count(*)::int`,
    })
    .from(
      db
        .select({
          prefix: sql`split_part(${extractionLog.inngestIdempotencyKey}, ':', 1)`,
          cnt: count(),
        })
        .from(extractionLog)
        .groupBy(sql`split_part(${extractionLog.inngestIdempotencyKey}, ':', 1)`)
        .having(sql`count(*) > 1`)
        .as("dupes")
    );

  return { duplicatesPrevented: row?.count ?? 0 };
}

// ---------------------------------------------------------------------------
// Placeholder stubs for Week 4-5 metrics (Phase 8 Phase 3)
// ---------------------------------------------------------------------------

export interface ShadowCanaryHealth {
  activeCanaries: number;
  agreementRate: number;
  demotionsTriggered: number;
}

export async function getShadowCanaryHealth(): Promise<ShadowCanaryHealth> {
  return { activeCanaries: 0, agreementRate: 0, demotionsTriggered: 0 };
}

export interface CompiledPatternHealth {
  active: number;
  shadow: number;
  retired: number;
  awaitingReview: number;
}

export async function getCompiledPatternHealth(): Promise<CompiledPatternHealth> {
  return { active: 0, shadow: 0, retired: 0, awaitingReview: 0 };
}
