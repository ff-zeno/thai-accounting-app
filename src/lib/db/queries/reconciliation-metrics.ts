import { sql } from "drizzle-orm";
import { db } from "../index";

// ---------------------------------------------------------------------------
// Match rate by layer
// ---------------------------------------------------------------------------

export interface LayerMatchRate {
  layer: string;
  matchCount: number;
  pct: number;
}

export async function getMatchRateByLayer(
  orgId: string,
  periodStart?: string,
  periodEnd?: string,
): Promise<LayerMatchRate[]> {
  const rows = await db.execute<{
    layer: string;
    match_count: string;
    pct: string;
  }>(sql`
    SELECT
      COALESCE((match_metadata->>'layer')::text, 'unknown') AS layer,
      COUNT(*)::text AS match_count,
      ROUND(COUNT(*)::numeric / NULLIF(SUM(COUNT(*)) OVER (), 0) * 100, 2)::text AS pct
    FROM reconciliation_matches m
    WHERE m.org_id = ${orgId}
      AND m.deleted_at IS NULL
      AND (${periodStart}::timestamptz IS NULL OR m.matched_at >= ${periodStart}::timestamptz)
      AND (${periodEnd}::timestamptz IS NULL OR m.matched_at < ${periodEnd}::timestamptz)
    GROUP BY match_metadata->>'layer'
    ORDER BY COUNT(*) DESC
  `);

  return rows.rows.map((r) => ({
    layer: r.layer,
    matchCount: parseInt(r.match_count, 10),
    pct: parseFloat(r.pct),
  }));
}

// ---------------------------------------------------------------------------
// Match rate trend (weekly/monthly)
// ---------------------------------------------------------------------------

export interface MatchRateTrendRow {
  period: string;
  matches: number;
  exactMatches: number;
}

export async function getMatchRateTrend(
  orgId: string,
  periodStart: string,
  periodEnd: string,
  granularity: "week" | "month" = "week",
): Promise<MatchRateTrendRow[]> {
  const rows = await db.execute<{
    period: string;
    matches: string;
    exact_matches: string;
  }>(sql`
    SELECT
      date_trunc(${granularity}, matched_at)::text AS period,
      COUNT(*)::text AS matches,
      COUNT(*) FILTER (WHERE match_metadata->>'layer' = 'exact')::text AS exact_matches
    FROM reconciliation_matches
    WHERE org_id = ${orgId}
      AND deleted_at IS NULL
      AND matched_at >= ${periodStart}::timestamptz
      AND matched_at < ${periodEnd}::timestamptz
    GROUP BY date_trunc(${granularity}, matched_at)
    ORDER BY period
  `);

  return rows.rows.map((r) => ({
    period: r.period,
    matches: parseInt(r.matches, 10),
    exactMatches: parseInt(r.exact_matches, 10),
  }));
}

// ---------------------------------------------------------------------------
// Time-to-match by type
// ---------------------------------------------------------------------------

export interface TimeToMatchRow {
  matchType: string;
  avgTimeHours: number;
  sampleSize: number;
}

export async function getTimeToMatchByType(
  orgId: string,
): Promise<TimeToMatchRow[]> {
  const rows = await db.execute<{
    match_type: string;
    avg_time_hours: string;
    sample_size: string;
  }>(sql`
    SELECT
      COALESCE((m.match_metadata->>'layer')::text, m.match_type::text) AS match_type,
      ROUND(EXTRACT(EPOCH FROM AVG(m.matched_at - d.created_at)) / 3600, 2)::text AS avg_time_hours,
      COUNT(*)::text AS sample_size
    FROM reconciliation_matches m
    JOIN documents d ON d.id = m.document_id
    WHERE m.org_id = ${orgId} AND m.deleted_at IS NULL
    GROUP BY match_type
  `);

  return rows.rows.map((r) => ({
    matchType: r.match_type,
    avgTimeHours: parseFloat(r.avg_time_hours),
    sampleSize: parseInt(r.sample_size, 10),
  }));
}

// ---------------------------------------------------------------------------
// Alias growth metrics
// ---------------------------------------------------------------------------

export interface AliasGrowthMetrics {
  totalAliases: number;
  confirmedAliases: number;
  createdThisMonth: number;
}

export async function getAliasGrowthMetrics(
  orgId: string,
): Promise<AliasGrowthMetrics> {
  const rows = await db.execute<{
    total_aliases: string;
    confirmed_aliases: string;
    created_this_month: string;
  }>(sql`
    SELECT
      COUNT(*)::text AS total_aliases,
      COUNT(*) FILTER (WHERE is_confirmed = true)::text AS confirmed_aliases,
      COUNT(*) FILTER (WHERE created_at >= date_trunc('month', now()))::text AS created_this_month
    FROM vendor_bank_aliases
    WHERE org_id = ${orgId} AND deleted_at IS NULL
  `);

  const r = rows.rows[0];
  return {
    totalAliases: parseInt(r?.total_aliases ?? "0", 10),
    confirmedAliases: parseInt(r?.confirmed_aliases ?? "0", 10),
    createdThisMonth: parseInt(r?.created_this_month ?? "0", 10),
  };
}

// ---------------------------------------------------------------------------
// Rule effectiveness
// ---------------------------------------------------------------------------

export interface RuleEffectivenessRow {
  id: string;
  name: string;
  matchCount: number;
  isActive: boolean;
  isAutoSuggested: boolean;
  lastMatchedAt: string | null;
}

export async function getRuleEffectiveness(
  orgId: string,
): Promise<RuleEffectivenessRow[]> {
  const rows = await db.execute<{
    id: string;
    name: string;
    match_count: string;
    is_active: boolean;
    is_auto_suggested: boolean;
    last_matched_at: string | null;
  }>(sql`
    SELECT
      id, name, match_count::text, is_active, is_auto_suggested,
      last_matched_at::text
    FROM reconciliation_rules
    WHERE org_id = ${orgId} AND deleted_at IS NULL
    ORDER BY match_count DESC
  `);

  return rows.rows.map((r) => ({
    id: r.id,
    name: r.name,
    matchCount: parseInt(r.match_count, 10),
    isActive: r.is_active,
    isAutoSuggested: r.is_auto_suggested,
    lastMatchedAt: r.last_matched_at,
  }));
}

// ---------------------------------------------------------------------------
// AI suggestion metrics
// ---------------------------------------------------------------------------

export interface AiSuggestionMetrics {
  totalSuggestions: number;
  approved: number;
  rejected: number;
  pending: number;
  approvalRate: number | null;
  avgApprovedConfidence: number | null;
  avgRejectedConfidence: number | null;
}

export async function getAiSuggestionMetrics(
  orgId: string,
): Promise<AiSuggestionMetrics> {
  const rows = await db.execute<{
    total_suggestions: string;
    approved: string;
    rejected: string;
    pending: string;
    approval_rate: string | null;
    avg_approved_confidence: string | null;
    avg_rejected_confidence: string | null;
  }>(sql`
    SELECT
      COUNT(*)::text AS total_suggestions,
      COUNT(*) FILTER (WHERE status = 'approved')::text AS approved,
      COUNT(*) FILTER (WHERE status = 'rejected')::text AS rejected,
      COUNT(*) FILTER (WHERE status = 'pending')::text AS pending,
      ROUND(
        COUNT(*) FILTER (WHERE status = 'approved')::numeric /
        NULLIF(COUNT(*) FILTER (WHERE status IN ('approved', 'rejected')), 0) * 100, 2
      )::text AS approval_rate,
      ROUND(AVG(confidence::numeric) FILTER (WHERE status = 'approved'), 4)::text AS avg_approved_confidence,
      ROUND(AVG(confidence::numeric) FILTER (WHERE status = 'rejected'), 4)::text AS avg_rejected_confidence
    FROM ai_match_suggestions
    WHERE org_id = ${orgId} AND deleted_at IS NULL
  `);

  const r = rows.rows[0];
  return {
    totalSuggestions: parseInt(r?.total_suggestions ?? "0", 10),
    approved: parseInt(r?.approved ?? "0", 10),
    rejected: parseInt(r?.rejected ?? "0", 10),
    pending: parseInt(r?.pending ?? "0", 10),
    approvalRate: r?.approval_rate ? parseFloat(r.approval_rate) : null,
    avgApprovedConfidence: r?.avg_approved_confidence ? parseFloat(r.avg_approved_confidence) : null,
    avgRejectedConfidence: r?.avg_rejected_confidence ? parseFloat(r.avg_rejected_confidence) : null,
  };
}

// ---------------------------------------------------------------------------
// Rejection analysis
// ---------------------------------------------------------------------------

export interface RejectionByLayerRow {
  layer: string;
  rejectionCount: number;
}

export interface RejectionReasonRow {
  reason: string;
  count: number;
}

export interface RejectionAnalysis {
  byLayer: RejectionByLayerRow[];
  byReason: RejectionReasonRow[];
}

export async function getRejectionAnalysis(
  orgId: string,
): Promise<RejectionAnalysis> {
  const [layerRows, reasonRows] = await Promise.all([
    db.execute<{ layer: string; rejection_count: string }>(sql`
      SELECT
        COALESCE((m.match_metadata->>'layer')::text, 'unknown') AS layer,
        COUNT(*)::text AS rejection_count
      FROM reconciliation_matches m
      WHERE m.org_id = ${orgId} AND m.deleted_at IS NOT NULL
      GROUP BY m.match_metadata->>'layer'
      ORDER BY COUNT(*) DESC
    `),
    db.execute<{ reason: string; count: string }>(sql`
      SELECT
        COALESCE(rejection_reason, 'No reason given') AS reason,
        COUNT(*)::text AS count
      FROM ai_match_suggestions
      WHERE org_id = ${orgId} AND status = 'rejected' AND deleted_at IS NULL
      GROUP BY rejection_reason
      ORDER BY COUNT(*) DESC
    `),
  ]);

  return {
    byLayer: layerRows.rows.map((r) => ({
      layer: r.layer,
      rejectionCount: parseInt(r.rejection_count, 10),
    })),
    byReason: reasonRows.rows.map((r) => ({
      reason: r.reason,
      count: parseInt(r.count, 10),
    })),
  };
}

// ---------------------------------------------------------------------------
// Alias conflict rate
// ---------------------------------------------------------------------------

export interface AliasConflict {
  aliasText: string;
  vendorCount: number;
}

export async function getAliasConflictRate(
  orgId: string,
): Promise<AliasConflict[]> {
  const rows = await db.execute<{
    alias_text: string;
    vendor_count: string;
  }>(sql`
    SELECT
      alias_text,
      COUNT(DISTINCT vendor_id)::text AS vendor_count
    FROM vendor_bank_aliases
    WHERE org_id = ${orgId} AND deleted_at IS NULL
    GROUP BY alias_text
    HAVING COUNT(DISTINCT vendor_id) > 1
  `);

  return rows.rows.map((r) => ({
    aliasText: r.alias_text,
    vendorCount: parseInt(r.vendor_count, 10),
  }));
}

// ---------------------------------------------------------------------------
// False-positive rate (auto-matches later soft-deleted)
// ---------------------------------------------------------------------------

export interface FalsePositiveRate {
  softDeleted: number;
  total: number;
  falsePositivePct: number;
}

export async function getFalsePositiveRate(
  orgId: string,
): Promise<FalsePositiveRate> {
  const rows = await db.execute<{
    soft_deleted: string;
    total: string;
    false_positive_pct: string;
  }>(sql`
    SELECT
      COUNT(*) FILTER (WHERE deleted_at IS NOT NULL)::text AS soft_deleted,
      COUNT(*)::text AS total,
      ROUND(
        COUNT(*) FILTER (WHERE deleted_at IS NOT NULL)::numeric /
        NULLIF(COUNT(*), 0) * 100, 2
      )::text AS false_positive_pct
    FROM reconciliation_matches
    WHERE org_id = ${orgId} AND matched_by = 'auto'
  `);

  const r = rows.rows[0];
  return {
    softDeleted: parseInt(r?.soft_deleted ?? "0", 10),
    total: parseInt(r?.total ?? "0", 10),
    falsePositivePct: parseFloat(r?.false_positive_pct ?? "0"),
  };
}

