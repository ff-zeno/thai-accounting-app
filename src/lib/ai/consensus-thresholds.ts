import type { FieldCriticality } from "./field-criticality";
import { INVOICE_FIELD_CRITICALITY } from "./field-criticality";

/**
 * Minimum number of agreeing orgs required to promote a consensus entry
 * to the global exemplar pool, by field criticality.
 *
 * Higher-criticality fields (amounts, tax IDs) require more orgs to agree
 * before the value is trusted globally.
 */
export const CONSENSUS_THRESHOLDS: Record<FieldCriticality, number> = {
  high: 5,
  medium: 3,
  low: 2,
};

/**
 * Check if a consensus entry meets the promotion threshold for its field.
 */
export function meetsPromotionThreshold(
  fieldName: string,
  agreeingOrgCount: number
): boolean {
  const criticality =
    INVOICE_FIELD_CRITICALITY[fieldName] ?? ("medium" as FieldCriticality);
  return agreeingOrgCount >= CONSENSUS_THRESHOLDS[criticality];
}
