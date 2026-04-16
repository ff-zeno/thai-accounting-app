/**
 * Hardcoded field criticality maps for the extraction learning loop.
 *
 * Criticality determines how much weight a field correction carries
 * when deciding vendor tier promotion/demotion and exemplar priority.
 *
 * - high: field is used in matching, tax compliance, or financial calculations
 * - medium: field has downstream impact but isn't directly in matching
 * - low: metadata, notes, or rarely-used fields
 */

export type FieldCriticality = "low" | "medium" | "high";

/** Invoice schema fields. */
export const INVOICE_FIELD_CRITICALITY: Record<string, FieldCriticality> = {
  // Critical for matching + financial accuracy
  totalAmount: "high",
  vendorTaxId: "high",
  vendorName: "high",
  vendorNameEn: "high",
  issueDate: "high",
  documentNumber: "high",
  documentType: "high",

  // Impacts tax calculations but not matching
  subtotal: "medium",
  vatRate: "medium",
  vatAmount: "medium",
  currency: "medium",
  vendorBranchNumber: "medium",

  // Stored but low downstream impact
  dueDate: "low",
  vendorAddress: "low",
  buyerName: "low",
  buyerTaxId: "low",
  detectedLanguage: "low",
  confidence: "low",
  notes: "low",
};

/** ID card schema fields. */
export const ID_CARD_FIELD_CRITICALITY: Record<string, FieldCriticality> = {
  citizenId: "high",
  nameTh: "high",
  nameEn: "high",
  dateOfBirth: "medium",
  address: "medium",
  expiryDate: "low",
  confidence: "low",
};

/**
 * Look up criticality for a field name across both schema types.
 * Returns "low" for unknown fields (safe default — won't over-weight).
 */
export function getFieldCriticality(fieldName: string): FieldCriticality {
  return (
    INVOICE_FIELD_CRITICALITY[fieldName] ??
    ID_CARD_FIELD_CRITICALITY[fieldName] ??
    "low"
  );
}

/**
 * All field names that are tracked for extraction learning.
 * Excludes `confidence`, `lineItems`, and `notes` — these aren't
 * meaningful correction targets.
 */
export const LEARNABLE_INVOICE_FIELDS = Object.keys(
  INVOICE_FIELD_CRITICALITY
).filter((f) => f !== "confidence" && f !== "notes");

export const LEARNABLE_ID_CARD_FIELDS = Object.keys(
  ID_CARD_FIELD_CRITICALITY
).filter((f) => f !== "confidence");
