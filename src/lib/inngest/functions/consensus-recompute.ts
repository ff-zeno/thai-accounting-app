import { inngest } from "../client";
import { getEligibleOrgIds } from "@/lib/db/queries/org-reputation";
import { aggregateExemplarsByVendorKey } from "@/lib/db/queries/extraction-exemplars";
import {
  upsertConsensusEntry,
  getPromotionCandidates,
  markPromoted,
  markRetired,
} from "@/lib/db/queries/exemplar-consensus";
import {
  promoteToGlobalPool,
  retireGlobalExemplar,
} from "@/lib/db/queries/global-exemplar-pool";
import { meetsPromotionThreshold } from "@/lib/ai/consensus-thresholds";
import { normalizeFieldValue } from "@/lib/ai/field-normalization";
import { createHash } from "crypto";
import type { FieldCriticality } from "@/lib/ai/field-criticality";

function hashValue(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/**
 * Phase 8 Phase 2: Nightly consensus recompute cron.
 *
 * Runs at 02:00 UTC daily (09:00 ICT).
 *
 * 1. Get eligible orgs (30+ days, 50+ docs, score ≥1.0)
 * 2. Aggregate corrected exemplars across eligible orgs by vendor_tax_id
 * 3. Group by (vendor_key, field_name, normalized_value) → upsert consensus entries
 * 4. Promote candidates meeting threshold to global pool
 * 5. Retire entries where contradicting > agreeing
 */
export const consensusRecompute = inngest.createFunction(
  {
    id: "consensus-recompute",
    retries: 1,
  },
  { cron: "0 2 * * *" },
  async ({ step }) => {
    // Step 1: Get eligible orgs
    const eligibleOrgIds = await step.run("get-eligible-orgs", async () => {
      return getEligibleOrgIds();
    });

    if (eligibleOrgIds.length === 0) {
      return { eligible: 0, promoted: 0, retired: 0 };
    }

    // Step 2: Aggregate exemplars across eligible orgs
    const aggregations = await step.run("aggregate-exemplars", async () => {
      return aggregateExemplarsByVendorKey(eligibleOrgIds);
    });

    if (aggregations.length === 0) {
      return { eligible: eligibleOrgIds.length, promoted: 0, retired: 0 };
    }

    // Step 3: Group by (vendor_key, field_name, normalized_value) and upsert consensus
    await step.run("upsert-consensus", async () => {
      // Group: key = "vendorTaxId|fieldName|normalizedValue"
      const groups = new Map<
        string,
        {
          vendorKey: string;
          fieldName: string;
          normalizedValue: string;
          fieldCriticality: FieldCriticality;
          orgIds: Set<string>;
        }
      >();

      for (const row of aggregations) {
        const normalized = normalizeFieldValue(row.fieldName, row.userValue);
        const key = `${row.vendorTaxId}|${row.fieldName}|${normalized}`;

        let group = groups.get(key);
        if (!group) {
          group = {
            vendorKey: row.vendorTaxId,
            fieldName: row.fieldName,
            normalizedValue: normalized,
            fieldCriticality: row.fieldCriticality,
            orgIds: new Set(),
          };
          groups.set(key, group);
        }
        group.orgIds.add(row.orgId);
      }

      // For each group, count contradictions (other groups for same vendor+field
      // with different values)
      const vendorFieldValues = new Map<string, Set<string>>();
      for (const group of groups.values()) {
        const vfKey = `${group.vendorKey}|${group.fieldName}`;
        let values = vendorFieldValues.get(vfKey);
        if (!values) {
          values = new Set();
          vendorFieldValues.set(vfKey, values);
        }
        values.add(group.normalizedValue);
      }

      for (const group of groups.values()) {
        const vfKey = `${group.vendorKey}|${group.fieldName}`;
        const allValues = vendorFieldValues.get(vfKey)!;
        // Contradicting = total org count for other values of the same field
        let contradicting = 0;
        for (const otherGroup of groups.values()) {
          if (
            otherGroup.vendorKey === group.vendorKey &&
            otherGroup.fieldName === group.fieldName &&
            otherGroup.normalizedValue !== group.normalizedValue
          ) {
            contradicting += otherGroup.orgIds.size;
          }
        }

        await upsertConsensusEntry({
          vendorKey: group.vendorKey,
          fieldName: group.fieldName,
          normalizedValue: group.normalizedValue,
          normalizedValueHash: hashValue(group.normalizedValue),
          fieldCriticality: group.fieldCriticality,
          weightedOrgCount: group.orgIds.size.toFixed(4),
          agreeingOrgCount: group.orgIds.size,
          contradictingCount: contradicting,
        });
      }
    });

    // Step 4: Promote candidates meeting threshold
    const promoted = await step.run("promote-candidates", async () => {
      const candidates = await getPromotionCandidates();
      let promotedCount = 0;

      for (const candidate of candidates) {
        if (
          meetsPromotionThreshold(
            candidate.fieldName,
            candidate.agreeingOrgCount
          )
        ) {
          await markPromoted(candidate.id);
          await promoteToGlobalPool({
            vendorKey: candidate.vendorKey,
            fieldName: candidate.fieldName,
            canonicalValue: candidate.normalizedValue,
            fieldCriticality: candidate.fieldCriticality,
            consensusId: candidate.id,
          });
          promotedCount++;
        }
      }

      return promotedCount;
    });

    // Step 5: Retire contradicted entries
    const retired = await step.run("retire-contradicted", async () => {
      const candidates = await getPromotionCandidates();
      let retiredCount = 0;

      for (const candidate of candidates) {
        if (candidate.contradictingCount > candidate.agreeingOrgCount) {
          await markRetired(candidate.id);
          // Also retire from global pool if it was somehow promoted
          await retireGlobalExemplar(candidate.vendorKey, candidate.fieldName);
          retiredCount++;
        }
      }

      return retiredCount;
    });

    // Step 6: Check for vendors eligible for compilation (Phase 8 Phase 3)
    const compilationEmitted = await step.run("check-compilation-eligibility", async () => {
      // Find vendors with >=20 Tier 2 exemplars
      // Group the aggregation by vendor key and count unique fields
      const vendorCounts = new Map<string, { orgIds: Set<string>; total: number }>();

      for (const row of aggregations) {
        let entry = vendorCounts.get(row.vendorTaxId);
        if (!entry) {
          entry = { orgIds: new Set(), total: 0 };
          vendorCounts.set(row.vendorTaxId, entry);
        }
        entry.orgIds.add(row.orgId);
        entry.total++;
      }

      const eligibleVendors: string[] = [];
      for (const [vendorKey, data] of vendorCounts) {
        if (data.total >= 20) {
          eligibleVendors.push(vendorKey);
        }
      }

      return eligibleVendors;
    });

    // Emit compilation events for eligible vendors
    if (compilationEmitted.length > 0) {
      await step.sendEvent(
        "emit-compilation-events",
        compilationEmitted.map((vendorKey) => ({
          name: "learning/vendor-ready-for-compilation" as const,
          data: {
            vendorKey,
            eligibleOrgIds,
          },
        }))
      );
    }

    return {
      eligible: eligibleOrgIds.length,
      promoted,
      retired,
      compilationCandidates: compilationEmitted.length,
    };
  }
);
