import { describe, it, expect } from "vitest";
import { validateExtractorSource } from "./ast-validator";

describe("validateExtractorSource", () => {
  it("accepts a simple valid extractor function", () => {
    const source = `
      function extract(text) {
        var match = text.match(/Invoice: (\\d+)/);
        if (match) {
          return { invoiceNumber: match[1] };
        }
        return {};
      }
    `;
    const result = validateExtractorSource(source);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("accepts string and array methods", () => {
    const source = `
      function extract(text) {
        var lines = text.split("\\n");
        var trimmed = lines.map(function(l) { return l.trim(); });
        var result = {};
        for (var i = 0; i < trimmed.length; i++) {
          if (trimmed[i].indexOf("Total:") >= 0) {
            result.total = trimmed[i].replace("Total:", "").trim();
          }
        }
        return result;
      }
    `;
    const result = validateExtractorSource(source);
    expect(result.valid).toBe(true);
  });

  it("rejects eval", () => {
    const source = `
      function extract(text) {
        return eval("({})");
      }
    `;
    const result = validateExtractorSource(source);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("eval"))).toBe(true);
  });

  it("rejects Function constructor", () => {
    const source = `
      function extract(text) {
        var fn = Function("return {}");
        return fn();
      }
    `;
    const result = validateExtractorSource(source);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("Function"))).toBe(true);
  });

  it("rejects constructor access", () => {
    const source = `
      function extract(text) {
        return text.constructor("test");
      }
    `;
    const result = validateExtractorSource(source);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("constructor"))).toBe(true);
  });

  it("rejects prototype access", () => {
    const source = `
      function extract(text) {
        var x = text.prototype;
        return {};
      }
    `;
    const result = validateExtractorSource(source);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("prototype"))).toBe(true);
  });

  it("rejects computed member access with denied string", () => {
    const source = `
      function extract(text) {
        return text["constructor"]("test");
      }
    `;
    const result = validateExtractorSource(source);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("constructor"))).toBe(true);
  });

  it("rejects process access", () => {
    const source = `
      function extract(text) {
        process.exit(1);
        return {};
      }
    `;
    const result = validateExtractorSource(source);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("process"))).toBe(true);
  });

  it("rejects require", () => {
    const source = `
      function extract(text) {
        var fs = require("fs");
        return {};
      }
    `;
    const result = validateExtractorSource(source);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("require"))).toBe(true);
  });

  it("rejects import expressions", () => {
    const source = `
      function extract(text) {
        var x = import("fs");
        return {};
      }
    `;
    const result = validateExtractorSource(source);
    expect(result.valid).toBe(false);
    // Import expression node type is not in allowlist
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("rejects unsafe regex with nested quantifiers", () => {
    const source = `
      function extract(text) {
        var match = text.match(/(a+)+b/);
        return {};
      }
    `;
    const result = validateExtractorSource(source);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("unsafe regex"))).toBe(true);
  });

  it("accepts safe regex patterns", () => {
    const source = `
      function extract(text) {
        var match = text.match(/Invoice\\s*#?\\s*(\\d+)/);
        return match ? { invoiceNumber: match[1] } : {};
      }
    `;
    const result = validateExtractorSource(source);
    expect(result.valid).toBe(true);
  });

  it("rejects globalThis", () => {
    const source = `
      function extract(text) {
        return globalThis;
      }
    `;
    const result = validateExtractorSource(source);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("globalThis"))).toBe(true);
  });

  it("rejects __proto__", () => {
    const source = `
      function extract(text) {
        var x = text.__proto__;
        return {};
      }
    `;
    const result = validateExtractorSource(source);
    expect(result.valid).toBe(false);
  });

  it("handles parse errors gracefully", () => {
    const source = "function {{{ invalid syntax";
    const result = validateExtractorSource(source);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("Parse error"))).toBe(true);
  });
});
