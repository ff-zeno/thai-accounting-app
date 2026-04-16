import { describe, it, expect, vi, beforeEach } from "vitest";
import { createInngestHarness } from "@/tests/inngest-harness";

// Mock all DB query modules
vi.mock("@/lib/db/queries/vendor-tier", () => ({
  getVendorTier: vi.fn(),
  promoteVendorTier: vi.fn(),
  upsertVendorTier: vi.fn(),
}));

vi.mock("@/lib/db/queries/org-reputation", () => ({
  upsertOrgReputation: vi.fn(),
  incrementDocsProcessed: vi.fn(),
  incrementReputationAgreed: vi.fn(),
  incrementReputationDisputed: vi.fn(),
  recalculateEligibility: vi.fn(),
}));

vi.mock("@/lib/db/queries/exemplar-consensus", () => ({
  getConsensusForVendor: vi.fn(),
}));

vi.mock("@/lib/db/queries/extraction-exemplars", () => ({
  aggregateExemplarsByVendorKey: vi.fn(),
}));

vi.mock("@/lib/ai/field-normalization", () => ({
  normalizeFieldValue: vi.fn((_field: string, value: string) => value),
}));

const { getVendorTier, promoteVendorTier, upsertVendorTier } = await import(
  "@/lib/db/queries/vendor-tier"
);
const {
  upsertOrgReputation,
  incrementDocsProcessed,
  incrementReputationAgreed,
  incrementReputationDisputed,
  recalculateEligibility,
} = await import("@/lib/db/queries/org-reputation");
const { getConsensusForVendor } = await import(
  "@/lib/db/queries/exemplar-consensus"
);
const { aggregateExemplarsByVendorKey } = await import(
  "@/lib/db/queries/extraction-exemplars"
);

const { reviewSavedHandler } = await import("./review-saved-handler");

const harness = createInngestHarness();

beforeEach(() => {
  vi.clearAllMocks();

  // Default mock returns
  vi.mocked(getVendorTier).mockResolvedValue(null);
  vi.mocked(promoteVendorTier).mockResolvedValue(undefined as never);
  vi.mocked(upsertVendorTier).mockResolvedValue(undefined as never);
  vi.mocked(upsertOrgReputation).mockResolvedValue({
    id: "rep-1",
    orgId: "org-1",
    score: "1.0000",
    correctionsTotal: 0,
    correctionsAgreed: 0,
    correctionsDisputed: 0,
    firstDocAt: null,
    docsProcessed: 0,
    eligible: false,
    updatedAt: null,
  });
  vi.mocked(incrementDocsProcessed).mockResolvedValue();
  vi.mocked(incrementReputationAgreed).mockResolvedValue();
  vi.mocked(incrementReputationDisputed).mockResolvedValue();
  vi.mocked(recalculateEligibility).mockResolvedValue(false);
  vi.mocked(getConsensusForVendor).mockResolvedValue([]);
  vi.mocked(aggregateExemplarsByVendorKey).mockResolvedValue([]);
});

describe("reviewSavedHandler — vendor tier step", () => {
  it("promotes to Tier 1 on first correction", async () => {
    vi.mocked(getVendorTier).mockResolvedValue(null);

    await harness.invoke(reviewSavedHandler, {
      data: {
        orgId: "org-1",
        vendorId: "vendor-1",
        vendorTaxId: null,
        documentId: "doc-1",
        extractionLogId: "log-1",
        correctionCount: 3,
        userCorrected: true,
      },
    });

    expect(promoteVendorTier).toHaveBeenCalledWith("org-1", "vendor-1", 1);
  });

  it("does not promote if already Tier 1", async () => {
    vi.mocked(getVendorTier).mockResolvedValue({
      id: "vt-1",
      vendorId: "vendor-1",
      scopeKind: "org",
      orgId: "org-1",
      tier: 1,
      docsProcessedTotal: 5,
      lastDocAt: new Date(),
      lastPromotedAt: new Date(),
      lastDemotedAt: null,
      updatedAt: null,
    });

    await harness.invoke(reviewSavedHandler, {
      data: {
        orgId: "org-1",
        vendorId: "vendor-1",
        vendorTaxId: null,
        documentId: "doc-1",
        extractionLogId: "log-1",
        correctionCount: 1,
        userCorrected: true,
      },
    });

    expect(promoteVendorTier).not.toHaveBeenCalled();
    expect(upsertVendorTier).toHaveBeenCalledWith("org-1", "vendor-1");
  });

  it("just updates doc count when no corrections", async () => {
    await harness.invoke(reviewSavedHandler, {
      data: {
        orgId: "org-1",
        vendorId: "vendor-1",
        vendorTaxId: null,
        documentId: "doc-1",
        extractionLogId: "log-1",
        correctionCount: 0,
        userCorrected: false,
      },
    });

    expect(upsertVendorTier).toHaveBeenCalledWith("org-1", "vendor-1");
    expect(promoteVendorTier).not.toHaveBeenCalled();
  });
});

describe("reviewSavedHandler — reputation step", () => {
  it("creates reputation row and increments docs", async () => {
    await harness.invoke(reviewSavedHandler, {
      data: {
        orgId: "org-1",
        vendorId: "vendor-1",
        vendorTaxId: null,
        documentId: "doc-1",
        extractionLogId: "log-1",
        correctionCount: 0,
        userCorrected: false,
      },
    });

    expect(upsertOrgReputation).toHaveBeenCalledWith("org-1");
    expect(incrementDocsProcessed).toHaveBeenCalledWith("org-1");
    expect(recalculateEligibility).toHaveBeenCalledWith("org-1");
  });

  it("skips consensus comparison when no vendorTaxId", async () => {
    await harness.invoke(reviewSavedHandler, {
      data: {
        orgId: "org-1",
        vendorId: "vendor-1",
        vendorTaxId: null,
        documentId: "doc-1",
        extractionLogId: "log-1",
        correctionCount: 1,
        userCorrected: true,
      },
    });

    expect(aggregateExemplarsByVendorKey).not.toHaveBeenCalled();
    expect(incrementReputationAgreed).not.toHaveBeenCalled();
    expect(incrementReputationDisputed).not.toHaveBeenCalled();
  });

  it("increments agreed when correction matches consensus", async () => {
    vi.mocked(aggregateExemplarsByVendorKey).mockResolvedValue([
      {
        vendorTaxId: "1111111111111",
        fieldName: "totalAmount",
        fieldCriticality: "high",
        userValue: "1000.00",
        orgId: "org-1",
      },
    ]);
    vi.mocked(getConsensusForVendor).mockResolvedValue([
      {
        id: "c-1",
        vendorKey: "1111111111111",
        fieldName: "totalAmount",
        normalizedValue: "1000.00",
        normalizedValueHash: "hash",
        fieldCriticality: "high",
        weightedOrgCount: "3.0000",
        agreeingOrgCount: 3,
        contradictingCount: 0,
        status: "promoted",
        promotedAt: new Date(),
        retiredAt: null,
        recomputedAt: new Date(),
        createdAt: new Date(),
      },
    ]);

    await harness.invoke(reviewSavedHandler, {
      data: {
        orgId: "org-1",
        vendorId: "vendor-1",
        vendorTaxId: "1111111111111",
        documentId: "doc-1",
        extractionLogId: "log-1",
        correctionCount: 1,
        userCorrected: true,
      },
    });

    expect(incrementReputationAgreed).toHaveBeenCalledWith("org-1");
    expect(incrementReputationDisputed).not.toHaveBeenCalled();
  });

  it("increments disputed when correction disagrees with consensus", async () => {
    vi.mocked(aggregateExemplarsByVendorKey).mockResolvedValue([
      {
        vendorTaxId: "1111111111111",
        fieldName: "totalAmount",
        fieldCriticality: "high",
        userValue: "2000.00",
        orgId: "org-1",
      },
    ]);
    vi.mocked(getConsensusForVendor).mockResolvedValue([
      {
        id: "c-1",
        vendorKey: "1111111111111",
        fieldName: "totalAmount",
        normalizedValue: "1000.00",
        normalizedValueHash: "hash",
        fieldCriticality: "high",
        weightedOrgCount: "3.0000",
        agreeingOrgCount: 3,
        contradictingCount: 0,
        status: "promoted",
        promotedAt: new Date(),
        retiredAt: null,
        recomputedAt: new Date(),
        createdAt: new Date(),
      },
    ]);

    await harness.invoke(reviewSavedHandler, {
      data: {
        orgId: "org-1",
        vendorId: "vendor-1",
        vendorTaxId: "1111111111111",
        documentId: "doc-1",
        extractionLogId: "log-1",
        correctionCount: 1,
        userCorrected: true,
      },
    });

    expect(incrementReputationDisputed).toHaveBeenCalledWith("org-1");
    expect(incrementReputationAgreed).not.toHaveBeenCalled();
  });
});
