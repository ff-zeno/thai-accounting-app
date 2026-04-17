import { inngest } from "../client";
import {
  findStaleVendorExemplars,
  softDeleteExemplarsByVendor,
} from "@/lib/db/queries/extraction-exemplars";
import { hasRecentExtractionForVendor } from "@/lib/db/queries/extraction-log";
import { demoteVendorTier } from "@/lib/db/queries/vendor-tier";

const DECAY_MONTHS = 12;

/**
 * Phase 8 Phase 3: Weekly exemplar decay cron.
 *
 * Runs at 03:00 UTC every Sunday.
 *
 * 1. Find (org_id, vendor_id) pairs where ALL exemplars are older than 12 months
 * 2. For each, check if the vendor has had any recent extractions
 * 3. If truly stale: soft-delete all exemplars, demote vendor tier 1→0
 */
export const exemplarDecay = inngest.createFunction(
  {
    id: "exemplar-decay",
    retries: 1,
  },
  { cron: "0 3 * * 0" },
  async ({ step }) => {
    const maxAge = new Date();
    maxAge.setMonth(maxAge.getMonth() - DECAY_MONTHS);

    const staleGroups = await step.run("find-stale-vendors", async () => {
      return findStaleVendorExemplars(maxAge);
    });

    if (staleGroups.length === 0) {
      return { vendorsDecayed: 0, exemplarsDeleted: 0 };
    }

    const result = await step.run("soft-delete-stale", async () => {
      let vendorsDecayed = 0;
      let exemplarsDeleted = 0;

      for (const group of staleGroups) {
        // Double-check: skip if vendor has had recent extractions
        const hasRecent = await hasRecentExtractionForVendor(
          group.vendorId,
          maxAge
        );
        if (hasRecent) continue;

        // Soft-delete all exemplars for this vendor+org
        const deleted = await softDeleteExemplarsByVendor(
          group.orgId,
          group.vendorId
        );
        exemplarsDeleted += deleted;

        // Demote vendor tier to 0
        await demoteVendorTier(group.orgId, group.vendorId, 0);

        vendorsDecayed++;
      }

      return { vendorsDecayed, exemplarsDeleted };
    });

    return result;
  }
);
