import { inngest } from "../client";
import { getVendorTier, promoteVendorTier } from "@/lib/db/queries/vendor-tier";
import { upsertVendorTier } from "@/lib/db/queries/vendor-tier";

/**
 * Phase 8: Handle review-saved events.
 *
 * When a user saves corrections to an AI-extracted document, this function:
 * 1. Checks if this is the org's first correction for this vendor
 * 2. If so, promotes the vendor to Tier 1 (exemplars will be injected on next extraction)
 * 3. Updates the vendor_tier doc count
 *
 * Phase 1: only 0 ↔ 1 transitions. Higher tiers and demotions come in Phase 2+.
 */
export const reviewSavedHandler = inngest.createFunction(
  {
    id: "review-saved-handler",
    retries: 2,
  },
  { event: "learning/review-saved" },
  async ({ event, step }) => {
    const { orgId, vendorId, correctionCount, userCorrected } = event.data as {
      orgId: string;
      vendorId: string;
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

    return { processed: true, vendorId, correctionCount };
  }
);
