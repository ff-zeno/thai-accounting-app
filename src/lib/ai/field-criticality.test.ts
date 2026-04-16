import { describe, it, expect } from "vitest";
import {
  INVOICE_FIELD_CRITICALITY,
  ID_CARD_FIELD_CRITICALITY,
  getFieldCriticality,
  LEARNABLE_INVOICE_FIELDS,
  LEARNABLE_ID_CARD_FIELDS,
} from "./field-criticality";

describe("INVOICE_FIELD_CRITICALITY", () => {
  it("has high criticality for matching fields", () => {
    expect(INVOICE_FIELD_CRITICALITY.totalAmount).toBe("high");
    expect(INVOICE_FIELD_CRITICALITY.vendorTaxId).toBe("high");
    expect(INVOICE_FIELD_CRITICALITY.vendorName).toBe("high");
    expect(INVOICE_FIELD_CRITICALITY.issueDate).toBe("high");
    expect(INVOICE_FIELD_CRITICALITY.documentNumber).toBe("high");
  });

  it("has medium criticality for tax fields", () => {
    expect(INVOICE_FIELD_CRITICALITY.subtotal).toBe("medium");
    expect(INVOICE_FIELD_CRITICALITY.vatRate).toBe("medium");
    expect(INVOICE_FIELD_CRITICALITY.vatAmount).toBe("medium");
  });

  it("has low criticality for metadata", () => {
    expect(INVOICE_FIELD_CRITICALITY.notes).toBe("low");
    expect(INVOICE_FIELD_CRITICALITY.confidence).toBe("low");
    expect(INVOICE_FIELD_CRITICALITY.vendorAddress).toBe("low");
  });
});

describe("ID_CARD_FIELD_CRITICALITY", () => {
  it("has high criticality for identity fields", () => {
    expect(ID_CARD_FIELD_CRITICALITY.citizenId).toBe("high");
    expect(ID_CARD_FIELD_CRITICALITY.nameTh).toBe("high");
  });
});

describe("getFieldCriticality", () => {
  it("returns criticality for known invoice fields", () => {
    expect(getFieldCriticality("totalAmount")).toBe("high");
  });

  it("returns criticality for known ID card fields", () => {
    expect(getFieldCriticality("citizenId")).toBe("high");
  });

  it("returns low for unknown fields", () => {
    expect(getFieldCriticality("unknownField")).toBe("low");
  });
});

describe("LEARNABLE_INVOICE_FIELDS", () => {
  it("excludes confidence and notes", () => {
    expect(LEARNABLE_INVOICE_FIELDS).not.toContain("confidence");
    expect(LEARNABLE_INVOICE_FIELDS).not.toContain("notes");
  });

  it("includes key extraction fields", () => {
    expect(LEARNABLE_INVOICE_FIELDS).toContain("totalAmount");
    expect(LEARNABLE_INVOICE_FIELDS).toContain("vendorTaxId");
    expect(LEARNABLE_INVOICE_FIELDS).toContain("issueDate");
  });
});

describe("LEARNABLE_ID_CARD_FIELDS", () => {
  it("excludes confidence", () => {
    expect(LEARNABLE_ID_CARD_FIELDS).not.toContain("confidence");
  });

  it("includes identity fields", () => {
    expect(LEARNABLE_ID_CARD_FIELDS).toContain("citizenId");
    expect(LEARNABLE_ID_CARD_FIELDS).toContain("nameTh");
  });
});
