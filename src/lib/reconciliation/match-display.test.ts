import { describe, it, expect } from "vitest";
import {
  getSimplifiedExplanation,
  getLayerLabel,
  getConfidenceLevel,
  getConfidenceColor,
  getWeightedContribution,
} from "./match-display";
import type { MatchMetadata } from "./matcher";

function makeMetadata(
  layer: MatchMetadata["layer"],
  signals: Record<string, { score: number; detail: string }> = {},
  candidateCount = 1,
): MatchMetadata {
  return { layer, signals, candidateCount, selectedRank: 1 };
}

describe("getLayerLabel", () => {
  it("returns readable labels for known layers", () => {
    expect(getLayerLabel("reference")).toBe("Reference Match");
    expect(getLayerLabel("alias")).toBe("Alias Lookup");
    expect(getLayerLabel("exact")).toBe("Exact Match");
    expect(getLayerLabel("rule")).toBe("Rule-Based");
    expect(getLayerLabel("multi_signal")).toBe("Multi-Signal");
    expect(getLayerLabel("split")).toBe("Split Payment");
    expect(getLayerLabel("ai")).toBe("AI Suggested");
  });

  it("returns raw layer name for unknown layers", () => {
    expect(getLayerLabel("something_new")).toBe("something_new");
  });
});

describe("getSimplifiedExplanation", () => {
  it("reference layer with invoice detail", () => {
    const meta = makeMetadata("reference", {
      referenceFound: { score: 1, detail: "Found invoice number INV-001 in text" },
    });
    expect(getSimplifiedExplanation(meta)).toBe("Matched by invoice number");
  });

  it("reference layer with tax detail", () => {
    const meta = makeMetadata("reference", {
      referenceFound: { score: 1, detail: "tax ID match" },
    });
    expect(getSimplifiedExplanation(meta)).toBe("Matched by tax ID");
  });

  it("reference layer with vendor detail", () => {
    const meta = makeMetadata("reference", {
      referenceFound: { score: 1, detail: "vendor name found" },
    });
    expect(getSimplifiedExplanation(meta)).toBe("Matched by vendor name");
  });

  it("reference layer with generic detail", () => {
    const meta = makeMetadata("reference", {
      referenceFound: { score: 1, detail: "some other ref" },
    });
    expect(getSimplifiedExplanation(meta)).toBe("Matched by reference: some other ref");
  });

  it("reference layer without signal", () => {
    const meta = makeMetadata("reference");
    expect(getSimplifiedExplanation(meta)).toBe("Matched by reference data");
  });

  it("alias layer", () => {
    const meta = makeMetadata("alias");
    expect(getSimplifiedExplanation(meta)).toBe("Matched by known counterparty alias");
  });

  it("exact layer with date proximity", () => {
    const meta = makeMetadata("exact", {
      dateProximity: { score: 0.9, detail: "3 days apart" },
    });
    expect(getSimplifiedExplanation(meta)).toBe("Exact amount match within 3 days");
  });

  it("exact layer without date signal", () => {
    const meta = makeMetadata("exact");
    expect(getSimplifiedExplanation(meta)).toBe("Exact amount match within 7 days");
  });

  it("rule layer with rule name", () => {
    const meta = makeMetadata("rule", {
      ruleMatch: { score: 1, detail: "Monthly rent payment" },
    });
    expect(getSimplifiedExplanation(meta)).toBe("Matched by rule: Monthly rent payment");
  });

  it("multi_signal layer", () => {
    const meta = makeMetadata("multi_signal");
    expect(getSimplifiedExplanation(meta)).toBe("Matched by amount and vendor similarity");
  });

  it("split layer shows transaction count", () => {
    const meta = makeMetadata("split", {}, 3);
    expect(getSimplifiedExplanation(meta)).toBe("Split payment: 3 transactions");
  });

  it("ai layer", () => {
    const meta = makeMetadata("ai");
    expect(getSimplifiedExplanation(meta)).toBe("AI-suggested match");
  });

  it("unknown layer shows fallback", () => {
    const meta = makeMetadata("fuzzy" as MatchMetadata["layer"]);
    expect(getSimplifiedExplanation(meta)).toBe("Matched (fuzzy)");
  });
});

describe("getConfidenceLevel", () => {
  it("returns high for >= 0.9", () => {
    expect(getConfidenceLevel(0.9)).toBe("high");
    expect(getConfidenceLevel(1.0)).toBe("high");
    expect(getConfidenceLevel("0.95")).toBe("high");
  });

  it("returns medium for >= 0.7 and < 0.9", () => {
    expect(getConfidenceLevel(0.7)).toBe("medium");
    expect(getConfidenceLevel(0.89)).toBe("medium");
    expect(getConfidenceLevel("0.75")).toBe("medium");
  });

  it("returns low for < 0.7", () => {
    expect(getConfidenceLevel(0.69)).toBe("low");
    expect(getConfidenceLevel(0.3)).toBe("low");
    expect(getConfidenceLevel("0.50")).toBe("low");
  });
});

describe("getConfidenceColor", () => {
  it("returns green classes for high", () => {
    expect(getConfidenceColor("high")).toContain("green");
  });

  it("returns amber classes for medium", () => {
    expect(getConfidenceColor("medium")).toContain("amber");
  });

  it("returns red classes for low", () => {
    expect(getConfidenceColor("low")).toContain("red");
  });
});

describe("getWeightedContribution", () => {
  it("returns weight and contribution for known signals", () => {
    const result = getWeightedContribution("amountMatch", 0.8);
    expect(result).not.toBeNull();
    expect(result!.weight).toBe(0.35);
    expect(result!.contribution).toBeCloseTo(0.28);
  });

  it("returns null for unknown signals", () => {
    expect(getWeightedContribution("unknownSignal", 0.5)).toBeNull();
  });

  it("calculates correctly for zero score", () => {
    const result = getWeightedContribution("dateProximity", 0);
    expect(result).not.toBeNull();
    expect(result!.contribution).toBe(0);
  });
});
