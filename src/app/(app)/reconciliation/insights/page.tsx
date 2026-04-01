import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getVerifiedOrgId } from "@/lib/utils/org-context";
import { getReconciliationStats } from "@/lib/db/queries/reconciliation";
import {
  getMatchRateByLayer,
  getMatchRateTrend,
  getAliasGrowthMetrics,
  getRuleEffectiveness,
  getAiSuggestionMetrics,
  getRejectionAnalysis,
  getFalsePositiveRate,
  getAliasConflictRate,
} from "@/lib/db/queries/reconciliation-metrics";
import { MetricsCards } from "./metrics-cards";
import { LayerDistribution } from "./layer-distribution";
import { MatchTrendTable } from "./match-trend-table";
import { RuleEffectivenessTable } from "./rule-effectiveness-table";
import { AiMetrics } from "./ai-metrics";
import { RejectionAnalysis } from "./rejection-analysis";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function InsightsPage() {
  const orgId = await getVerifiedOrgId();

  if (!orgId) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">
          Select an organization to view reconciliation insights.
        </p>
      </div>
    );
  }

  // 12-week trend window
  const now = new Date();
  const trendEnd = now.toISOString();
  const twelveWeeksAgo = new Date(now);
  twelveWeeksAgo.setDate(twelveWeeksAgo.getDate() - 84);
  const trendStart = twelveWeeksAgo.toISOString();

  const [
    stats,
    layerData,
    trendData,
    aliasMetrics,
    ruleData,
    aiData,
    rejectionData,
    falsePositive,
    aliasConflicts,
  ] = await Promise.all([
    getReconciliationStats(orgId),
    getMatchRateByLayer(orgId),
    getMatchRateTrend(orgId, trendStart, trendEnd, "week"),
    getAliasGrowthMetrics(orgId),
    getRuleEffectiveness(orgId),
    getAiSuggestionMetrics(orgId),
    getRejectionAnalysis(orgId),
    getFalsePositiveRate(orgId),
    getAliasConflictRate(orgId),
  ]);

  const activeRules = ruleData.filter((r) => r.isActive).length;
  const autoSuggestedRules = ruleData.filter((r) => r.isAutoSuggested).length;
  const totalMatches = layerData.reduce((sum, l) => sum + l.matchCount, 0);

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href="/reconciliation"
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="size-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Reconciliation Insights
          </h1>
          <p className="text-sm text-muted-foreground">
            Match quality metrics and learning feedback
          </p>
        </div>
      </div>

      {/* Summary cards */}
      <MetricsCards
        overallMatchRate={stats.matchRate}
        totalMatches={totalMatches}
        aliasCount={aliasMetrics.totalAliases}
        confirmedAliases={aliasMetrics.confirmedAliases}
        aiApprovalRate={aiData.approvalRate}
        aiTotal={aiData.totalSuggestions}
        activeRules={activeRules}
        autoSuggestedRules={autoSuggestedRules}
      />

      {/* Two-column layout */}
      <div className="grid gap-6 lg:grid-cols-2">
        <LayerDistribution data={layerData} />
        <AiMetrics data={aiData} />
      </div>

      {/* Trend table */}
      <MatchTrendTable data={trendData} />

      {/* Rule effectiveness + Rejection analysis */}
      <div className="grid gap-6 lg:grid-cols-2">
        <RuleEffectivenessTable data={ruleData} />
        <RejectionAnalysis data={rejectionData} />
      </div>

      {/* Bottom metrics row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* False-positive rate */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Auto-Match False Positive Rate
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums">
              {falsePositive.falsePositivePct.toFixed(1)}%
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {falsePositive.softDeleted} rejected of {falsePositive.total} auto-matches
            </p>
          </CardContent>
        </Card>

        {/* Alias conflicts */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Alias Conflicts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums">
              {aliasConflicts.length}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Alias texts mapped to multiple vendors
            </p>
          </CardContent>
        </Card>

        {/* Aliases this month */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Aliases This Month
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums">
              {aliasMetrics.createdThisMonth}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              New aliases learned
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
