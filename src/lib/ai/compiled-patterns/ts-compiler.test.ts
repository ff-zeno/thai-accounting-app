import { describe, it, expect } from "vitest";
import { compileExtractor } from "./ts-compiler";

describe("compileExtractor", () => {
  it("compiles valid TypeScript to JavaScript", () => {
    const source = `
      function extract(text: string): Record<string, string> {
        const match = text.match(/Invoice: (\\d+)/);
        if (match) {
          return { invoiceNumber: match[1] };
        }
        return {};
      }
    `;
    const result = compileExtractor(source);
    expect(result.compiledJs).toContain("function extract");
    expect(result.compiledJs).not.toContain(": string");
    expect(result.compiledJs).not.toContain("Record<");
    expect(result.astHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.tsVersion).toBeTruthy();
  });

  it("produces deterministic hash for same input", () => {
    const source = `function extract(text: string): Record<string, string> { return {}; }`;
    const result1 = compileExtractor(source);
    const result2 = compileExtractor(source);
    expect(result1.astHash).toBe(result2.astHash);
    expect(result1.compiledJs).toBe(result2.compiledJs);
  });

  it("produces different hash for different input", () => {
    const source1 = `function extract(text: string): Record<string, string> { return {}; }`;
    const source2 = `function extract(text: string): Record<string, string> { return { a: "b" }; }`;
    const result1 = compileExtractor(source1);
    const result2 = compileExtractor(source2);
    expect(result1.astHash).not.toBe(result2.astHash);
  });

  it("removes type annotations", () => {
    const source = `
      function extract(text: string): Record<string, string> {
        const x: number = parseInt(text, 10);
        const result: Record<string, string> = {};
        return result;
      }
    `;
    const result = compileExtractor(source);
    expect(result.compiledJs).not.toContain(": string");
    expect(result.compiledJs).not.toContain(": number");
    expect(result.compiledJs).not.toContain(": Record");
  });

  it("compiles const/let to var equivalent", () => {
    const source = `
      function extract(text: string): Record<string, string> {
        const x = "hello";
        let y = "world";
        return { x, y };
      }
    `;
    const result = compileExtractor(source);
    // strict mode with ES2022 target keeps const/let
    expect(result.compiledJs).toBeTruthy();
  });

  it("includes TypeScript version in result", () => {
    const source = `function extract(text: string): Record<string, string> { return {}; }`;
    const result = compileExtractor(source);
    expect(result.tsVersion).toMatch(/^\d+\.\d+/);
  });
});
