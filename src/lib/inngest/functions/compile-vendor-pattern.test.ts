import { describe, it, expect, vi, beforeEach } from "vitest";
import { createInngestHarness } from "@/tests/inngest-harness";

vi.mock("@/lib/db/queries/extraction-exemplars", () => ({
  aggregateExemplarsByVendorKey: vi.fn(),
}));

vi.mock("@/lib/db/queries/compiled-patterns", () => ({
  insertCompiledPattern: vi.fn(),
  countAutonomouslyPromoted: vi.fn(),
}));

vi.mock("@/lib/ai/compiled-patterns/ast-validator", () => ({
  validateExtractorSource: vi.fn(),
}));

vi.mock("@/lib/ai/compiled-patterns/ts-compiler", () => ({
  compileExtractor: vi.fn(),
}));

vi.mock("@/lib/ai/compiled-patterns/compile-prompt", () => ({
  buildCompilePrompt: vi.fn(),
}));

vi.mock("ai", () => ({
  generateText: vi.fn(),
}));

vi.mock("@/lib/ai/models", () => ({
  getModel: vi.fn().mockResolvedValue("mock-model"),
}));

const { aggregateExemplarsByVendorKey } = await import(
  "@/lib/db/queries/extraction-exemplars"
);
const { insertCompiledPattern, countAutonomouslyPromoted } = await import(
  "@/lib/db/queries/compiled-patterns"
);
const { validateExtractorSource } = await import(
  "@/lib/ai/compiled-patterns/ast-validator"
);
const { compileExtractor } = await import(
  "@/lib/ai/compiled-patterns/ts-compiler"
);
const { buildCompilePrompt } = await import(
  "@/lib/ai/compiled-patterns/compile-prompt"
);
const { generateText } = await import("ai");

const { compileVendorPattern } = await import("./compile-vendor-pattern");

const harness = createInngestHarness();

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(buildCompilePrompt).mockReturnValue("mock prompt");
  vi.mocked(countAutonomouslyPromoted).mockResolvedValue(0);
});

describe("compileVendorPattern", () => {
  it("skips when insufficient exemplars", async () => {
    vi.mocked(aggregateExemplarsByVendorKey).mockResolvedValue([
      {
        vendorTaxId: "1111111111111",
        fieldName: "totalAmount",
        fieldCriticality: "high",
        userValue: "1000.00",
        orgId: "org-1",
      },
    ]);

    const { result } = await harness.invoke(compileVendorPattern, {
      data: { vendorKey: "1111111111111", eligibleOrgIds: ["org-1"] },
    });

    expect(result).toMatchObject({ skipped: true });
  });

  it("fails when AST validation rejects", async () => {
    // Create 20+ exemplars
    const exemplars = Array.from({ length: 25 }, (_, i) => ({
      vendorTaxId: "1111111111111",
      fieldName: `field${i}`,
      fieldCriticality: "low" as const,
      userValue: `value${i}`,
      orgId: `org-${i % 3}`,
    }));
    vi.mocked(aggregateExemplarsByVendorKey).mockResolvedValue(exemplars);
    vi.mocked(generateText).mockResolvedValue({
      text: "function extract(text) { return eval('{}'); }",
    } as ReturnType<typeof generateText> extends Promise<infer T> ? T : never);
    vi.mocked(compileExtractor).mockReturnValue({
      compiledJs: "compiled code",
      astHash: "abc123",
      tsVersion: "5.0.0",
    });
    vi.mocked(validateExtractorSource).mockReturnValue({
      valid: false,
      errors: ["Disallowed identifier: eval"],
    });

    const { result } = await harness.invoke(compileVendorPattern, {
      data: { vendorKey: "1111111111111", eligibleOrgIds: ["org-1", "org-2"] },
    });

    expect(result).toMatchObject({
      error: "AST validation failed",
      errors: ["Disallowed identifier: eval"],
    });
  });

  it("completes full pipeline successfully", async () => {
    const exemplars = Array.from({ length: 25 }, (_, i) => ({
      vendorTaxId: "1111111111111",
      fieldName: `field${i}`,
      fieldCriticality: "low" as const,
      userValue: `value${i}`,
      orgId: `org-${i % 3}`,
    }));
    vi.mocked(aggregateExemplarsByVendorKey).mockResolvedValue(exemplars);
    vi.mocked(generateText).mockResolvedValue({
      text: "function extract(text: string): Record<string, string> { return {}; }",
    } as ReturnType<typeof generateText> extends Promise<infer T> ? T : never);
    vi.mocked(compileExtractor).mockReturnValue({
      compiledJs: "function extract(text) { return {}; }",
      astHash: "hash123",
      tsVersion: "5.0.0",
    });
    vi.mocked(validateExtractorSource).mockReturnValue({
      valid: true,
      errors: [],
    });
    vi.mocked(insertCompiledPattern).mockResolvedValue({ id: "pattern-1" });

    const { result, step } = await harness.invoke(compileVendorPattern, {
      data: { vendorKey: "1111111111111", eligibleOrgIds: ["org-1", "org-2"] },
    });

    expect(result).toMatchObject({
      vendorKey: "1111111111111",
      patternId: "pattern-1",
      status: "shadow",
    });

    // Should have emitted shadow validation event
    expect(step.sentEvents).toHaveLength(1);
    expect(step.sentEvents[0].events).toMatchObject({
      name: "learning/pattern-compiled",
      data: { patternId: "pattern-1" },
    });
  });
});
