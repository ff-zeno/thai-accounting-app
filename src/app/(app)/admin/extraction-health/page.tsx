import { requireOrgAdmin } from "@/lib/utils/admin-guard";
import {
  getGlobalPoolStats,
  getConsensusStats,
  getOrgReputation,
  getPromotionTimeline,
  getVendorTierDistribution,
  getRecentHighCriticalityPromotions,
  getPerVendorCards,
  getGlobalExtractionHealth,
  getConsensusHealth,
  getReputationDistribution,
  getIdempotencyHealth,
  getShadowCanaryHealth,
  getCompiledPatternHealth,
} from "@/lib/db/queries/extraction-health";
import { HealthDashboard } from "./health-dashboard";

export default async function ExtractionHealthPage() {
  const { orgId } = await requireOrgAdmin();

  const [
    poolStats,
    consensusStats,
    orgReputation,
    promotionTimeline,
    tierDistribution,
    highCritPromotions,
    perVendorCards,
    globalHealth,
    consensusHealth,
    reputationDistribution,
    idempotencyHealth,
    shadowCanaryHealth,
    compiledPatternHealth,
  ] = await Promise.all([
    getGlobalPoolStats(),
    getConsensusStats(),
    getOrgReputation(orgId),
    getPromotionTimeline(20),
    getVendorTierDistribution(orgId),
    getRecentHighCriticalityPromotions(10),
    getPerVendorCards(orgId, 20),
    getGlobalExtractionHealth(),
    getConsensusHealth(),
    getReputationDistribution(),
    getIdempotencyHealth(),
    getShadowCanaryHealth(),
    getCompiledPatternHealth(),
  ]);

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Extraction Health
        </h1>
        <p className="text-sm text-muted-foreground">
          Global consensus pool, org reputation, and tier distribution
        </p>
      </div>

      <HealthDashboard
        poolStats={poolStats}
        consensusStats={consensusStats}
        orgReputation={orgReputation}
        promotionTimeline={promotionTimeline}
        tierDistribution={tierDistribution}
        highCritPromotions={highCritPromotions}
        perVendorCards={perVendorCards}
        globalHealth={globalHealth}
        consensusHealth={consensusHealth}
        reputationDistribution={reputationDistribution}
        idempotencyHealth={idempotencyHealth}
        shadowCanaryHealth={shadowCanaryHealth}
        compiledPatternHealth={compiledPatternHealth}
      />
    </div>
  );
}
