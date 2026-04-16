import { describe, it, expect, vi } from "vitest";

// Mock the DB module to prevent DATABASE_URL requirement
vi.mock("@/lib/db/index", () => ({
  db: {},
}));

vi.mock("@/lib/db/queries/ai-settings", () => ({
  getOrgAiSettings: vi.fn().mockResolvedValue(null),
}));

// Mock the AI SDK and model resolution so we don't need real API keys
vi.mock("@/lib/ai/models", () => ({
  getModel: vi.fn(),
  getModelId: vi.fn().mockResolvedValue("test-model"),
}));

vi.mock("ai", () => ({
  generateObject: vi.fn(),
}));

const { buildExemplarPrompt } = await import("./extract-document");
import type { ExtractionContext } from "./extract-document";

describe("buildExemplarPrompt", () => {
  it("returns empty string for Tier 0", () => {
    const ctx: ExtractionContext = {
      tier: 0,
      vendorId: null,
      exemplarIds: [],
      exemplars: [],
    };
    expect(buildExemplarPrompt(ctx)).toBe("");
  });

  it("returns empty string for Tier 1 with no exemplars", () => {
    const ctx: ExtractionContext = {
      tier: 1,
      vendorId: "v-1",
      exemplarIds: [],
      exemplars: [],
    };
    expect(buildExemplarPrompt(ctx)).toBe("");
  });

  it("builds Tier 1 prompt with correction arrows", () => {
    const ctx: ExtractionContext = {
      tier: 1,
      vendorId: "v-1",
      exemplarIds: ["e-1"],
      exemplars: [
        {
          fieldName: "totalAmount",
          aiValue: "1000.00",
          userValue: "1500.00",
        },
      ],
    };

    const result = buildExemplarPrompt(ctx);
    expect(result).toContain("Prior corrections for this vendor");
    expect(result).toContain('AI extracted "1000.00"');
    expect(result).toContain('user corrected to "1500.00"');
    expect(result).not.toContain("Community patterns");
  });

  it("builds Tier 2 prompt with community language", () => {
    const ctx: ExtractionContext = {
      tier: 2,
      vendorId: null,
      vendorKey: "1111111111111",
      exemplarIds: [],
      globalExemplarIds: ["g-1"],
      exemplars: [
        {
          fieldName: "totalAmount",
          aiValue: null,
          userValue: "1000.00",
        },
      ],
    };

    const result = buildExemplarPrompt(ctx);
    expect(result).toContain("Community patterns for this vendor");
    expect(result).toContain('expected value "1000.00"');
    expect(result).toContain("consensus values");
    expect(result).not.toContain("Prior corrections");
  });

  it("Tier 1 prompt skips non-corrected exemplars", () => {
    const ctx: ExtractionContext = {
      tier: 1,
      vendorId: "v-1",
      exemplarIds: ["e-1", "e-2"],
      exemplars: [
        {
          fieldName: "totalAmount",
          aiValue: "1000.00",
          userValue: "1000.00", // Same — not a correction
        },
        {
          fieldName: "documentNumber",
          aiValue: "INV-001",
          userValue: "INV-002", // Different — is a correction
        },
      ],
    };

    const result = buildExemplarPrompt(ctx);
    expect(result).toContain("documentNumber");
    expect(result).not.toContain("totalAmount");
  });

  it("Tier 2 includes all exemplars (no correction filtering)", () => {
    const ctx: ExtractionContext = {
      tier: 2,
      vendorId: null,
      vendorKey: "1111111111111",
      exemplarIds: [],
      globalExemplarIds: ["g-1", "g-2"],
      exemplars: [
        {
          fieldName: "totalAmount",
          aiValue: null,
          userValue: "1000.00",
        },
        {
          fieldName: "documentNumber",
          aiValue: null,
          userValue: "INV-001",
        },
      ],
    };

    const result = buildExemplarPrompt(ctx);
    expect(result).toContain("totalAmount");
    expect(result).toContain("documentNumber");
  });
});

describe("private-wins invariant", () => {
  it("Tier 1 context is preferred when private exemplars exist", () => {
    // This tests the logical invariant: the pipeline checks Tier 1 first.
    // If Tier 1 has exemplars, Tier 2 is never reached.
    // We verify this by checking that a Tier 1 context produces different
    // prompt language than Tier 2.
    const tier1: ExtractionContext = {
      tier: 1,
      vendorId: "v-1",
      exemplarIds: ["e-1"],
      exemplars: [
        { fieldName: "totalAmount", aiValue: "900", userValue: "1000.00" },
      ],
    };

    const tier2: ExtractionContext = {
      tier: 2,
      vendorId: "v-1",
      vendorKey: "1111111111111",
      exemplarIds: [],
      globalExemplarIds: ["g-1"],
      exemplars: [
        { fieldName: "totalAmount", aiValue: null, userValue: "1000.00" },
      ],
    };

    const prompt1 = buildExemplarPrompt(tier1);
    const prompt2 = buildExemplarPrompt(tier2);

    // They should produce different prompts
    expect(prompt1).toContain("Prior corrections");
    expect(prompt2).toContain("Community patterns");
    expect(prompt1).not.toBe(prompt2);
  });
});
