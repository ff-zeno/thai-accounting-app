import { requireOrgAdmin } from "@/lib/utils/admin-guard";
import {
  getGlobalPoolStats,
  getConsensusStats,
  getOrgReputation,
  getPromotionTimeline,
  getVendorTierDistribution,
  getRecentHighCriticalityPromotions,
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
  ] = await Promise.all([
    getGlobalPoolStats(),
    getConsensusStats(),
    getOrgReputation(orgId),
    getPromotionTimeline(20),
    getVendorTierDistribution(orgId),
    getRecentHighCriticalityPromotions(10),
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
      />
    </div>
  );
}
