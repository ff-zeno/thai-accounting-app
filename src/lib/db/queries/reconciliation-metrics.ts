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
  const pStart = periodStart ?? null;
  const pEnd = periodEnd ?? null;
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
      AND (${pStart}::timestamptz IS NULL OR m.matched_at >= ${pStart}::timestamptz)
      AND (${pEnd}::timestamptz IS NULL OR m.matched_at < ${pEnd}::timestamptz)
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
  // date_trunc's first arg must be a SQL literal, not a bound parameter
  const gran = granularity === "month" ? sql.raw(`'month'`) : sql.raw(`'week'`);

  const rows = await db.execute<{
    period: string;
    matches: string;
    exact_matches: string;
  }>(sql`
    SELECT
      date_trunc(${gran}, matched_at)::text AS period,
      COUNT(*)::text AS matches,
      COUNT(*) FILTER (WHERE match_metadata->>'layer' = 'exact')::text AS exact_matches
    FROM reconciliation_matches
    WHERE org_id = ${orgId}
      AND deleted_at IS NULL
      AND matched_at >= ${periodStart}::timestamptz
      AND matched_at < ${periodEnd}::timestamptz
    GROUP BY date_trunc(${gran}, matched_at)
    ORDER BY period
  `);

  return rows.rows.map((r) => ({
    period: r.period,
    matches: parseInt(r.matches, 10),
    exactMatches: parseInt(r.exact_matches, 10),
  }));
}

// ---------------------------------------------------------------------------
// Confidence trend (avg confidence per period)
// ---------------------------------------------------------------------------

export interface ConfidenceTrendRow {
  period: string;
  avgConfidence: number;
  matchCount: number;
}

export async function getConfidenceTrend(
  orgId: string,
  periodStart: string,
  periodEnd: string,
  granularity: "week" | "month" = "week",
): Promise<ConfidenceTrendRow[]> {
  // date_trunc's first arg must be a SQL literal, not a bound parameter
  const gran = granularity === "month" ? sql.raw(`'month'`) : sql.raw(`'week'`);

  const rows = await db.execute<{
    period: string;
    avg_confidence: string;
    match_count: string;
  }>(sql`
    SELECT
      date_trunc(${gran}, matched_at)::text AS period,
      ROUND(AVG(confidence::numeric), 4)::text AS avg_confidence,
      COUNT(*)::text AS match_count
    FROM reconciliation_matches
    WHERE org_id = ${orgId}
      AND deleted_at IS NULL
      AND matched_at >= ${periodStart}::timestamptz
      AND matched_at < ${periodEnd}::timestamptz
    GROUP BY date_trunc(${gran}, matched_at)
    ORDER BY period
  `);

  return rows.rows.map((r) => ({
    period: r.period,
    avgConfidence: parseFloat(r.avg_confidence),
    matchCount: parseInt(r.match_count, 10),
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
// Quality score components (for composite dashboard score)
// ---------------------------------------------------------------------------

export interface QualityScoreData {
  matchRate: number;
  avgAutoConfidence: number | null;
  falsePositivePct: number;
  aiApprovalRate: number | null;
  score: number;
}

/**
 * Composite quality score (0-100):
 *   Match rate        × 40 (0-40 pts)
 *   Avg confidence    × 25 (0-25 pts)
 *   1-FP rate         × 20 (0-20 pts)
 *   AI approval rate  × 15 (0-15 pts)
 */
function computeQualityScore(
  matchRate: number,
  avgConfidence: number | null,
  falsePositivePct: number,
  aiApprovalRate: number | null,
): number {
  const matchPts = matchRate * 40;
  const confPts = (avgConfidence ?? 0.7) * 25; // default 0.7 when no data
  const fpPts = (1 - Math.min(falsePositivePct, 100) / 100) * 20;
  const aiPts = ((aiApprovalRate ?? 70) / 100) * 15; // default 70% when no data
  return Math.round(matchPts + confPts + fpPts + aiPts);
}

export async function getQualityScoreData(
  orgId: string,
  periodStart?: string,
  periodEnd?: string,
): Promise<QualityScoreData> {
  const pStart = periodStart ?? null;
  const pEnd = periodEnd ?? null;
  const rows = await db.execute<{
    match_rate: string;
    avg_auto_confidence: string | null;
    false_positive_pct: string;
    ai_approval_rate: string | null;
  }>(sql`
    WITH match_stats AS (
      SELECT
        COUNT(*) FILTER (WHERE t.reconciliation_status IN ('matched', 'partially_matched'))::numeric
          / NULLIF(COUNT(*), 0) AS match_rate
      FROM transactions t
      WHERE t.org_id = ${orgId} AND t.deleted_at IS NULL AND t.is_petty_cash = false
        AND (${pStart}::date IS NULL OR t.date >= ${pStart}::date)
        AND (${pEnd}::date IS NULL OR t.date <= ${pEnd}::date)
    ),
    confidence_stats AS (
      SELECT
        ROUND(AVG(confidence::numeric), 4) AS avg_auto_confidence
      FROM reconciliation_matches
      WHERE org_id = ${orgId} AND deleted_at IS NULL AND matched_by = 'auto'
        AND (${pStart}::timestamptz IS NULL OR matched_at >= ${pStart}::timestamptz)
        AND (${pEnd}::timestamptz IS NULL OR matched_at < ${pEnd}::timestamptz)
    ),
    fp_stats AS (
      SELECT
        ROUND(
          COUNT(*) FILTER (WHERE deleted_at IS NOT NULL)::numeric /
          NULLIF(COUNT(*), 0) * 100, 2
        ) AS false_positive_pct
      FROM reconciliation_matches
      WHERE org_id = ${orgId} AND matched_by = 'auto'
        AND (${pStart}::timestamptz IS NULL OR matched_at >= ${pStart}::timestamptz)
        AND (${pEnd}::timestamptz IS NULL OR matched_at < ${pEnd}::timestamptz)
    ),
    ai_stats AS (
      SELECT
        ROUND(
          COUNT(*) FILTER (WHERE status = 'approved')::numeric /
          NULLIF(COUNT(*) FILTER (WHERE status IN ('approved', 'rejected')), 0) * 100, 2
        ) AS ai_approval_rate
      FROM ai_match_suggestions
      WHERE org_id = ${orgId} AND deleted_at IS NULL
        AND (${pStart}::timestamptz IS NULL OR created_at >= ${pStart}::timestamptz)
        AND (${pEnd}::timestamptz IS NULL OR created_at < ${pEnd}::timestamptz)
    )
    SELECT
      COALESCE(ms.match_rate, 0)::text AS match_rate,
      cs.avg_auto_confidence::text AS avg_auto_confidence,
      COALESCE(fp.false_positive_pct, 0)::text AS false_positive_pct,
      ai.ai_approval_rate::text AS ai_approval_rate
    FROM match_stats ms, confidence_stats cs, fp_stats fp, ai_stats ai
  `);

  const r = rows.rows[0];
  const matchRate = parseFloat(r?.match_rate ?? "0");
  const avgAutoConfidence = r?.avg_auto_confidence ? parseFloat(r.avg_auto_confidence) : null;
  const falsePositivePct = parseFloat(r?.false_positive_pct ?? "0");
  const aiApprovalRate = r?.ai_approval_rate ? parseFloat(r.ai_approval_rate) : null;

  return {
    matchRate,
    avgAutoConfidence,
    falsePositivePct,
    aiApprovalRate,
    score: computeQualityScore(matchRate, avgAutoConfidence, falsePositivePct, aiApprovalRate),
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

