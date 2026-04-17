import { describe, it, expect, vi, beforeEach } from "vitest";
import { createInngestHarness } from "@/tests/inngest-harness";

vi.mock("@/lib/db/queries/compiled-patterns", () => ({
  getPatternById: vi.fn(),
  updateShadowResults: vi.fn(),
  retirePattern: vi.fn(),
}));

vi.mock("@/lib/ai/compiled-patterns/shadow-validator", () => ({
  validateAgainstTestSet: vi.fn(),
}));

const { getPatternById, updateShadowResults, retirePattern } = await import(
  "@/lib/db/queries/compiled-patterns"
);
const { validateAgainstTestSet } = await import(
  "@/lib/ai/compiled-patterns/shadow-validator"
);

const { shadowValidatePattern } = await import("./shadow-validate-pattern");

const harness = createInngestHarness();

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(updateShadowResults).mockResolvedValue();
  vi.mocked(retirePattern).mockResolvedValue();
});

describe("shadowValidatePattern", () => {
  const testExemplars = [
    { fieldName: "invoiceNumber", userValue: "12345", documentText: "Invoice #12345" },
  ];

  it("returns error when pattern not found", async () => {
    vi.mocked(getPatternById).mockResolvedValue(null);

    const { result } = await harness.invoke(shadowValidatePattern, {
      data: { patternId: "nonexistent", testExemplars },
    });

    expect(result).toEqual({ error: "Pattern not found", patternId: "nonexistent" });
  });

  it("passes pattern when accuracy >= 95%", async () => {
    vi.mocked(getPatternById).mockResolvedValue({
      id: "p-1",
      compiledJs: "function extract(text) { return {}; }",
      vendorKey: "1234567890123",
      scopeKind: "global",
      orgId: null,
      version: 1,
      sourceTs: "",
      tsCompilerVersion: "5.0",
      astHash: "abc",
      trainingSetHash: "def",
      shadowAccuracy: null,
      shadowSampleSize: null,
      status: "shadow",
      requiresManualReview: true,
      createdAt: new Date(),
      activatedAt: null,
      retiredAt: null,
      retirementReason: null,
    });

    vi.mocked(validateAgainstTestSet).mockResolvedValue({
      accuracy: 0.96,
      agreements: 24,
      disagreements: 1,
      total: 25,
      details: [],
    });

    const { result } = await harness.invoke(shadowValidatePattern, {
      data: { patternId: "p-1", testExemplars },
    });

    expect(result).toMatchObject({ passed: true, accuracy: 0.96 });
    expect(updateShadowResults).toHaveBeenCalledWith("p-1", 0.96, 25);
    expect(retirePattern).not.toHaveBeenCalled();
  });

  it("retires pattern when accuracy < 95%", async () => {
    vi.mocked(getPatternById).mockResolvedValue({
      id: "p-2",
      compiledJs: "function extract(text) { return {}; }",
      vendorKey: "1234567890123",
      scopeKind: "global",
      orgId: null,
      version: 1,
      sourceTs: "",
      tsCompilerVersion: "5.0",
      astHash: "abc",
      trainingSetHash: "def",
      shadowAccuracy: null,
      shadowSampleSize: null,
      status: "shadow",
      requiresManualReview: true,
      createdAt: new Date(),
      activatedAt: null,
      retiredAt: null,
      retirementReason: null,
    });

    vi.mocked(validateAgainstTestSet).mockResolvedValue({
      accuracy: 0.80,
      agreements: 16,
      disagreements: 4,
      total: 20,
      details: [],
    });

    const { result } = await harness.invoke(shadowValidatePattern, {
      data: { patternId: "p-2", testExemplars },
    });

    expect(result).toMatchObject({ passed: false, accuracy: 0.80 });
    expect(retirePattern).toHaveBeenCalledWith(
      "p-2",
      expect.stringContaining("80.0%")
    );
  });
});
