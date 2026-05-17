import { LEARNABLE_INVOICE_FIELDS } from "../../src/lib/ai/field-criticality";
import { fieldValuesEqual } from "../../src/lib/ai/field-normalization";
import type { GroundTruthDoc } from "./parse-review";

function hasThai(value: unknown) {
  return typeof value === "string" && /[\u0E00-\u0E7F]/.test(value);
}

function toValue(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value.length === 0 ? null : value;
  if (typeof value === "number") return String(value);
  return null;
}

function correctedFieldCount(doc: GroundTruthDoc) {
  const ai = doc.aiExtraction as unknown as Record<string, unknown>;
  const truth = doc.groundTruth;
  return LEARNABLE_INVOICE_FIELDS.reduce((count, fieldName) => {
    const aiValue = toValue(ai[fieldName]);
    const truthValue = toValue(truth[fieldName]);
    return fieldValuesEqual(fieldName, aiValue, truthValue) ? count : count + 1;
  }, 0);
}

function representativeLanguageScore(doc: GroundTruthDoc, docs: GroundTruthDoc[]) {
  const thaiAddressCount = docs.filter((candidate) =>
    hasThai(candidate.groundTruth.vendorAddress)
  ).length;
  const thaiAddressMajority = thaiAddressCount > docs.length / 2;
  if (!thaiAddressMajority) return 0;
  return hasThai(doc.groundTruth.vendorAddress) ? 10 : -10;
}

function seedScore(doc: GroundTruthDoc, docs: GroundTruthDoc[]) {
  return representativeLanguageScore(doc, docs) + correctedFieldCount(doc);
}

export function selectSeedDocsByVendor(docs: GroundTruthDoc[]) {
  const byVendor = new Map<string, GroundTruthDoc[]>();
  for (const doc of docs) {
    const group = byVendor.get(doc.vendorGroup) ?? [];
    group.push(doc);
    byVendor.set(doc.vendorGroup, group);
  }

  return Array.from(byVendor.values()).map((vendorDocs) => {
    let best = vendorDocs[0];
    let bestScore = seedScore(best, vendorDocs);
    for (const doc of vendorDocs.slice(1)) {
      const score = seedScore(doc, vendorDocs);
      if (score > bestScore) {
        best = doc;
        bestScore = score;
      }
    }
    return best;
  });
}

export function inferDocumentFamily(doc: GroundTruthDoc): string {
  const category = String(doc.groundTruth.category ?? "").toLowerCase();
  const currency = String(doc.groundTruth.currency ?? "THB").toUpperCase();
  const docType = String(doc.groundTruth.documentType ?? "invoice");
  if (
    category.includes("payment_processor") ||
    category.includes("settlement") ||
    doc.vendorGroup.toLowerCase().includes("ksher")
  ) {
    return "payment_processor_settlement_receipt";
  }
  if (currency !== "THB" || doc.vendorGroup.toLowerCase().includes("tiktok")) {
    return "foreign_vendor_invoice";
  }
  return `expense_${docType}`;
}
