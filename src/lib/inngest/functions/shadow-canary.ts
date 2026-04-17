import { inngest } from "../client";
import { db } from "@/lib/db";
import { sql, eq, and, gte } from "drizzle-orm";
import {
  extractionCompiledPatterns,
  vendorTier,
  extractionLog,
} from "@/lib/db/schema";
import {
  retirePattern,
} from "@/lib/db/queries/compiled-patterns";
import { demoteVendorTier } from "@/lib/db/queries/vendor-tier";

const TIER_3_MIN_AGREEMENT = 0.98;
const TIER_4_MIN_AGREEMENT = 0.99;
const MIN_SHADOW_SAMPLE = 30;

/**
 * Phase 8 Phase 3: Nightly shadow canary cron.
 *
 * Runs at 02:30 UTC daily (after consensus recompute at 02:00).
 *
 * For each vendor with an active compiled pattern (Tier 3+):
 * 1. Check extraction_log for shadow runs in last 30 days
 * 2. If sample >=30 and agreement < threshold → demote
 */
export const shadowCanary = inngest.createFunction(
  {
    id: "shadow-canary",
    retries: 1,
  },
  { cron: "30 2 * * *" },
  async ({ step }) => {
    // Step 1: Find all active compiled patterns
    const activePatterns = await step.run("find-active-patterns", async () => {
      return db
        .select({
          id: extractionCompiledPatterns.id,
          vendorKey: extractionCompiledPatterns.vendorKey,
          scopeKind: extractionCompiledPatterns.scopeKind,
          orgId: extractionCompiledPatterns.orgId,
        })
        .from(extractionCompiledPatterns)
        .where(eq(extractionCompiledPatterns.status, "active"));
    });

    if (activePatterns.length === 0) {
      return { checked: 0, demoted: 0 };
    }

    // Step 2: Check shadow canary metrics for each
    const result = await step.run("check-canary-metrics", async () => {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      let demoted = 0;

      for (const pattern of activePatterns) {
        // Get vendor tier for this pattern's org
        // For global patterns, we check any org's tier that uses this vendor
        const [tierRow] = await db
          .select({ tier: vendorTier.tier, orgId: vendorTier.orgId, vendorId: vendorTier.vendorId })
          .from(vendorTier)
          .where(
            and(
              eq(vendorTier.scopeKind, "org"),
              sql`EXISTS (
                SELECT 1 FROM extraction_log el
                WHERE el.vendor_id = ${vendorTier.vendorId}
                  AND el.tier_used >= 3
                  AND el.created_at >= ${thirtyDaysAgo}
              )`
            )
          )
          .limit(1);

        if (!tierRow || tierRow.tier < 3 || !tierRow.orgId) continue;

        // Count shadow runs: extraction logs with tier_used >= 3 in last 30 days
        // In practice, shadow canary data would be stored separately.
        // For now, use extraction_log tier_used as proxy.
        const [shadowCount] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(extractionLog)
          .where(
            and(
              eq(extractionLog.vendorId, tierRow.vendorId),
              gte(extractionLog.tierUsed, 3),
              gte(extractionLog.createdAt, thirtyDaysAgo)
            )
          );

        if (!shadowCount || shadowCount.count < MIN_SHADOW_SAMPLE) continue;

        // For now, shadow accuracy comes from the pattern's stored metrics
        const patternAccuracy = pattern.orgId
          ? null // Would need per-org tracking
          : null; // Placeholder — real implementation tracks per-extraction agreement

        // Until real shadow tracking is implemented, skip demotion
        // This infrastructure is ready for when shadow runs log agreement data
        if (patternAccuracy !== null) {
          const threshold =
            tierRow.tier >= 4 ? TIER_4_MIN_AGREEMENT : TIER_3_MIN_AGREEMENT;

          if (patternAccuracy < threshold) {
            await retirePattern(
              pattern.id,
              `Shadow canary: agreement ${(patternAccuracy * 100).toFixed(1)}% below ${threshold * 100}% threshold`
            );
            await demoteVendorTier(tierRow.orgId, tierRow.vendorId, tierRow.tier - 1);
            demoted++;
          }
        }
      }

      return { demoted };
    });

    return {
      checked: activePatterns.length,
      demoted: result.demoted,
    };
  }
);
