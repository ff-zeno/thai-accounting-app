import type { MatchMetadata } from "./matcher";

// ---------------------------------------------------------------------------
// Layer labels
// ---------------------------------------------------------------------------

const LAYER_LABELS: Record<string, string> = {
  reference: "Reference Match",
  alias: "Alias Lookup",
  exact: "Exact Match",
  fuzzy: "Fuzzy Match",
  rule: "Rule-Based",
  multi_signal: "Multi-Signal",
  split: "Split Payment",
  ai: "AI Suggested",
  pattern: "Pattern Match",
};

export function getLayerLabel(layer: string): string {
  return LAYER_LABELS[layer] ?? layer;
}

// ---------------------------------------------------------------------------
// Simplified explanation (human-readable, one line)
// ---------------------------------------------------------------------------

export function getSimplifiedExplanation(metadata: MatchMetadata): string {
  const { layer, signals } = metadata;

  switch (layer) {
    case "reference": {
      const ref = signals.referenceFound;
      if (ref) {
        if (ref.detail.includes("invoice")) return "Matched by invoice number";
        if (ref.detail.includes("tax")) return "Matched by tax ID";
        if (ref.detail.includes("vendor")) return "Matched by vendor name";
        return `Matched by reference: ${ref.detail}`;
      }
      return "Matched by reference data";
    }
    case "alias":
      return "Matched by known counterparty alias";
    case "exact": {
      const dateSignal = signals.dateProximity;
      const days = dateSignal?.detail?.match(/(\d+)/)?.[1] ?? "7";
      return `Exact amount match within ${days} days`;
    }
    case "rule": {
      const ruleSignal = signals.ruleMatch;
      const ruleName = ruleSignal?.detail ?? "custom rule";
      return `Matched by rule: ${ruleName}`;
    }
    case "multi_signal":
      return "Matched by amount and vendor similarity";
    case "split": {
      const count = metadata.candidateCount;
      return `Split payment: ${count} transactions`;
    }
    case "ai":
      return "AI-suggested match";
    default:
      return `Matched (${layer})`;
  }
}

// ---------------------------------------------------------------------------
// Confidence levels
// ---------------------------------------------------------------------------

export type ConfidenceLevel = "high" | "medium" | "low";

export function getConfidenceLevel(confidence: number | string): ConfidenceLevel {
  const c = typeof confidence === "string" ? parseFloat(confidence) : confidence;
  if (c >= 0.9) return "high";
  if (c >= 0.7) return "medium";
  return "low";
}

export function getConfidenceColor(level: ConfidenceLevel): string {
  switch (level) {
    case "high":
      return "text-green-700 bg-green-50 border-green-200";
    case "medium":
      return "text-amber-700 bg-amber-50 border-amber-200";
    case "low":
      return "text-red-700 bg-red-50 border-red-200";
  }
}

// ---------------------------------------------------------------------------
// Signal-to-weight key mapping (for admin debug mode)
// ---------------------------------------------------------------------------

export const SIGNAL_TO_WEIGHT_KEY: Record<string, { key: string; weight: number }> = {
  amountMatch: { key: "amount", weight: 0.35 },
  dateProximity: { key: "date", weight: 0.15 },
  counterpartyMatch: { key: "counterpartyVendor", weight: 0.25 },
  directionMatch: { key: "direction", weight: 0.10 },
  bankAffinity: { key: "bankAffinity", weight: 0.10 },
  channelMatch: { key: "channel", weight: 0.05 },
};

export function getWeightedContribution(
  signalKey: string,
  score: number,
): { weight: number; contribution: number } | null {
  const mapping = SIGNAL_TO_WEIGHT_KEY[signalKey];
  if (!mapping) return null;
  return { weight: mapping.weight, contribution: score * mapping.weight };
}
