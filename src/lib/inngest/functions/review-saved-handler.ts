import { inngest } from "../client";
import { getVendorTier, promoteVendorTier } from "@/lib/db/queries/vendor-tier";
import { upsertVendorTier } from "@/lib/db/queries/vendor-tier";
import {
  upsertOrgReputation,
  incrementDocsProcessed,
  incrementReputationAgreed,
  incrementReputationDisputed,
  recalculateEligibility,
} from "@/lib/db/queries/org-reputation";
import { getConsensusForVendor } from "@/lib/db/queries/exemplar-consensus";
import { normalizeFieldValue } from "@/lib/ai/field-normalization";
import { aggregateExemplarsByVendorKey } from "@/lib/db/queries/extraction-exemplars";

/**
 * Phase 8: Handle review-saved events.
 *
 * When a user saves corrections to an AI-extracted document, this function:
 * 1. Updates vendor tier (Tier 0→1 promotion on first correction)
 * 2. Updates org reputation (doc count, agreement/disagreement tracking, eligibility)
 */
export const reviewSavedHandler = inngest.createFunction(
  {
    id: "review-saved-handler",
    retries: 2,
  },
  { event: "learning/review-saved" },
  async ({ event, step }) => {
    const { orgId, vendorId, vendorTaxId, correctionCount, userCorrected } =
      event.data as {
        orgId: string;
        vendorId: string;
        vendorTaxId: string | null;
        documentId: string;
        extractionLogId: string;
        correctionCount: number;
        userCorrected: boolean;
      };

    // Step 1: Update vendor tier doc count + promote if corrections exist
    await step.run("update-vendor-tier", async () => {
      const currentTier = await getVendorTier(orgId, vendorId);

      if (userCorrected && (!currentTier || currentTier.tier === 0)) {
        // First correction for this vendor → promote to Tier 1.
        // Next time we see a doc from this vendor, we'll inject exemplars.
        await promoteVendorTier(orgId, vendorId, 1);
      } else {
        // Just update the doc count
        await upsertVendorTier(orgId, vendorId);
      }
    });

    // Step 2: Update org reputation for consensus tracking
    await step.run("update-org-reputation", async () => {
      // Ensure reputation row exists
      await upsertOrgReputation(orgId);

      // Increment doc count (also sets firstDocAt on first call)
      await incrementDocsProcessed(orgId);

      // If vendor has a tax ID and user made corrections, compare with consensus
      if (vendorTaxId && userCorrected) {
        // Get this org's most recent corrections for this vendor
        const orgExemplars = await aggregateExemplarsByVendorKey([orgId]);
        const orgCorrections = orgExemplars.filter(
          (e) => e.vendorTaxId === vendorTaxId
        );

        // Compare each correction with existing consensus
        for (const correction of orgCorrections) {
          const consensusEntries = await getConsensusForVendor(
            vendorTaxId,
            correction.fieldName
          );

          if (consensusEntries.length === 0) continue;

          // Find the dominant consensus value (highest agreeing count)
          const dominant = consensusEntries.reduce((a, b) =>
            a.agreeingOrgCount > b.agreeingOrgCount ? a : b
          );

          const normalizedUserValue = normalizeFieldValue(
            correction.fieldName,
            correction.userValue
          );

          if (normalizedUserValue === dominant.normalizedValue) {
            await incrementReputationAgreed(orgId);
          } else {
            await incrementReputationDisputed(orgId);
          }
        }
      }

      // Recalculate eligibility gate
      await recalculateEligibility(orgId);
    });

    return { processed: true, vendorId, correctionCount };
  }
);
