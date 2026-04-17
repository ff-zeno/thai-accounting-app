import { describe, it, expect, vi } from "vitest";

// Force disabled sandbox mode for tests
vi.stubEnv("SANDBOX_MODE", "disabled");

const { validateAgainstTestSet } = await import("./shadow-validator");

describe("validateAgainstTestSet", () => {
  const compiledJs = `
    function extract(text) {
      var match = text.match(/Invoice #(\\d+)/);
      var amountMatch = text.match(/Total: ([\\d.]+)/);
      var result = {};
      if (match) result.invoiceNumber = match[1];
      if (amountMatch) result.totalAmount = amountMatch[1];
      return result;
    }
  `;

  it("returns 100% accuracy when all fields match", async () => {
    const result = await validateAgainstTestSet(compiledJs, [
      {
        fieldName: "invoiceNumber",
        userValue: "12345",
        documentText: "Invoice #12345\nTotal: 1500.00",
      },
      {
        fieldName: "totalAmount",
        userValue: "1500.00",
        documentText: "Invoice #12345\nTotal: 1500.00",
      },
    ]);

    expect(result.accuracy).toBe(1.0);
    expect(result.agreements).toBe(2);
    expect(result.disagreements).toBe(0);
    expect(result.total).toBe(2);
  });

  it("returns 0% accuracy when no fields match", async () => {
    const result = await validateAgainstTestSet(compiledJs, [
      {
        fieldName: "invoiceNumber",
        userValue: "99999",
        documentText: "Invoice #12345\nTotal: 1500.00",
      },
    ]);

    expect(result.accuracy).toBe(0);
    expect(result.agreements).toBe(0);
    expect(result.disagreements).toBe(1);
  });

  it("returns partial accuracy for mixed results", async () => {
    const result = await validateAgainstTestSet(compiledJs, [
      {
        fieldName: "invoiceNumber",
        userValue: "12345",
        documentText: "Invoice #12345\nTotal: 1500.00",
      },
      {
        fieldName: "totalAmount",
        userValue: "2000.00", // Wrong value
        documentText: "Invoice #12345\nTotal: 1500.00",
      },
    ]);

    expect(result.accuracy).toBe(0.5);
    expect(result.agreements).toBe(1);
    expect(result.disagreements).toBe(1);
  });

  it("handles extraction failure gracefully", async () => {
    const badJs = `
      function extract(text) {
        throw new Error("broken");
      }
    `;

    const result = await validateAgainstTestSet(badJs, [
      {
        fieldName: "invoiceNumber",
        userValue: "12345",
        documentText: "Invoice #12345",
      },
    ]);

    expect(result.accuracy).toBe(0);
    expect(result.disagreements).toBe(1);
    expect(result.details[0].actual).toBeNull();
  });

  it("normalizes whitespace and case for comparison", async () => {
    const result = await validateAgainstTestSet(compiledJs, [
      {
        fieldName: "invoiceNumber",
        userValue: " 12345 ", // Extra whitespace
        documentText: "Invoice #12345\nTotal: 1500.00",
      },
    ]);

    expect(result.accuracy).toBe(1.0);
  });

  it("returns 0 accuracy for empty test set", async () => {
    const result = await validateAgainstTestSet(compiledJs, []);

    expect(result.accuracy).toBe(0);
    expect(result.total).toBe(0);
  });

  it("includes detail entries for each comparison", async () => {
    const result = await validateAgainstTestSet(compiledJs, [
      {
        fieldName: "invoiceNumber",
        userValue: "12345",
        documentText: "Invoice #12345\nTotal: 1500.00",
      },
    ]);

    expect(result.details).toHaveLength(1);
    expect(result.details[0]).toEqual({
      fieldName: "invoiceNumber",
      expected: "12345",
      actual: "12345",
      match: true,
    });
  });
});
