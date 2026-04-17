import { inngest } from "../client";
import {
  countMissingVendorTaxId,
  backfillVendorTaxIdBatch,
} from "@/lib/db/queries/extraction-exemplars";

const BATCH_SIZE = 500;

/**
 * Phase 8 Phase 3: One-shot backfill of vendor_tax_id on extraction_exemplars.
 *
 * Joins against vendors.tax_id to populate the missing vendor_tax_id column.
 * Triggered manually via Inngest dashboard or API:
 *   inngest.send({ name: "learning/backfill-vendor-tax-id" })
 */
export const backfillVendorTaxId = inngest.createFunction(
  {
    id: "backfill-vendor-tax-id",
    retries: 1,
  },
  { event: "learning/backfill-vendor-tax-id" },
  async ({ step }) => {
    const missing = await step.run("count-missing", async () => {
      return countMissingVendorTaxId();
    });

    if (missing === 0) {
      return { updated: 0, skipped: 0, batches: 0 };
    }

    const result = await step.run("backfill-batch", async () => {
      let totalUpdated = 0;
      let batches = 0;

      // Loop until no more rows to update
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const updated = await backfillVendorTaxIdBatch(BATCH_SIZE);
        totalUpdated += updated;
        batches++;

        if (updated < BATCH_SIZE) break;
      }

      return { totalUpdated, batches };
    });

    return {
      updated: result.totalUpdated,
      skipped: missing - result.totalUpdated,
      batches: result.batches,
    };
  }
);
