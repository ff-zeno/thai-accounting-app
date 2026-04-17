import { describe, it, expect, vi, beforeEach } from "vitest";

// Force disabled mode for tests (no isolated-vm dependency needed)
vi.stubEnv("SANDBOX_MODE", "disabled");

const { runCompiledPattern } = await import("./sandbox-runner");

describe("runCompiledPattern (disabled mode)", () => {
  it("extracts fields from document text", async () => {
    const compiledJs = `
      function extract(text) {
        var match = text.match(/Invoice #(\\d+)/);
        var amountMatch = text.match(/Total: ([\\d.]+)/);
        return {
          invoiceNumber: match ? match[1] : "",
          totalAmount: amountMatch ? amountMatch[1] : "",
        };
      }
    `;
    const text = "Invoice #12345\nTotal: 1500.00\nDate: 2024-01-15";

    const result = await runCompiledPattern(compiledJs, text);

    expect(result).toEqual({
      invoiceNumber: "12345",
      totalAmount: "1500.00",
    });
  });

  it("returns empty object for no matches", async () => {
    const compiledJs = `
      function extract(text) {
        return {};
      }
    `;

    const result = await runCompiledPattern(compiledJs, "some text");
    expect(result).toEqual({});
  });

  it("converts non-string values to strings", async () => {
    const compiledJs = `
      function extract(text) {
        return { count: 42, flag: true };
      }
    `;

    const result = await runCompiledPattern(compiledJs, "test");
    expect(result).toEqual({ count: "42", flag: "true" });
  });

  it("throws on non-object return", async () => {
    const compiledJs = `
      function extract(text) {
        return "not an object";
      }
    `;

    await expect(runCompiledPattern(compiledJs, "test")).rejects.toThrow(
      "must return an object"
    );
  });

  it("throws on null return", async () => {
    const compiledJs = `
      function extract(text) {
        return null;
      }
    `;

    await expect(runCompiledPattern(compiledJs, "test")).rejects.toThrow();
  });

  it("handles runtime errors in extraction", async () => {
    const compiledJs = `
      function extract(text) {
        throw new Error("extraction failed");
      }
    `;

    await expect(runCompiledPattern(compiledJs, "test")).rejects.toThrow(
      "extraction failed"
    );
  });

  it("handles complex regex extraction", async () => {
    const compiledJs = `
      function extract(text) {
        var taxIdMatch = text.match(/(\\d{13})/);
        var dateMatch = text.match(/(\\d{4}-\\d{2}-\\d{2})/);
        var result = {};
        if (taxIdMatch) result.taxId = taxIdMatch[1];
        if (dateMatch) result.date = dateMatch[1];
        return result;
      }
    `;
    const text = "Vendor: ABC Co. Tax ID: 1234567890123 Date: 2024-03-15";

    const result = await runCompiledPattern(compiledJs, text);
    expect(result).toEqual({
      taxId: "1234567890123",
      date: "2024-03-15",
    });
  });
});
