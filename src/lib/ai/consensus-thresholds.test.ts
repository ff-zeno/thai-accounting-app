import { describe, it, expect } from "vitest";
import { meetsPromotionThreshold, CONSENSUS_THRESHOLDS } from "./consensus-thresholds";

describe("CONSENSUS_THRESHOLDS", () => {
  it("requires 5 orgs for high-criticality fields", () => {
    expect(CONSENSUS_THRESHOLDS.high).toBe(5);
  });

  it("requires 3 orgs for medium-criticality fields", () => {
    expect(CONSENSUS_THRESHOLDS.medium).toBe(3);
  });

  it("requires 2 orgs for low-criticality fields", () => {
    expect(CONSENSUS_THRESHOLDS.low).toBe(2);
  });
});

describe("meetsPromotionThreshold", () => {
  // High-criticality fields (totalAmount, vendorTaxId, vendorName, etc.)
  it("returns false for high-criticality field with 4 orgs", () => {
    expect(meetsPromotionThreshold("totalAmount", 4)).toBe(false);
  });

  it("returns true for high-criticality field with 5 orgs", () => {
    expect(meetsPromotionThreshold("totalAmount", 5)).toBe(true);
  });

  it("returns true for high-criticality field with 6 orgs", () => {
    expect(meetsPromotionThreshold("vendorTaxId", 6)).toBe(true);
  });

  // Medium-criticality fields (subtotal, vatAmount, currency, etc.)
  it("returns false for medium-criticality field with 2 orgs", () => {
    expect(meetsPromotionThreshold("subtotal", 2)).toBe(false);
  });

  it("returns true for medium-criticality field with 3 orgs", () => {
    expect(meetsPromotionThreshold("vatAmount", 3)).toBe(true);
  });

  // Low-criticality fields (dueDate, vendorAddress, etc.)
  it("returns false for low-criticality field with 1 org", () => {
    expect(meetsPromotionThreshold("dueDate", 1)).toBe(false);
  });

  it("returns true for low-criticality field with 2 orgs", () => {
    expect(meetsPromotionThreshold("vendorAddress", 2)).toBe(true);
  });

  // Unknown field defaults to medium
  it("defaults to medium threshold for unknown fields", () => {
    expect(meetsPromotionThreshold("unknownField", 2)).toBe(false);
    expect(meetsPromotionThreshold("unknownField", 3)).toBe(true);
  });

  // Edge cases
  it("returns false for 0 orgs", () => {
    expect(meetsPromotionThreshold("dueDate", 0)).toBe(false);
  });

  it("handles documentNumber as high-criticality", () => {
    expect(meetsPromotionThreshold("documentNumber", 4)).toBe(false);
    expect(meetsPromotionThreshold("documentNumber", 5)).toBe(true);
  });
});
