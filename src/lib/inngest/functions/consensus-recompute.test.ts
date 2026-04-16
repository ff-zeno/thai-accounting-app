import { describe, it, expect, vi, beforeEach } from "vitest";
import { createInngestHarness } from "@/tests/inngest-harness";

// Mock all DB query modules
vi.mock("@/lib/db/queries/org-reputation", () => ({
  getEligibleOrgIds: vi.fn(),
}));

vi.mock("@/lib/db/queries/extraction-exemplars", () => ({
  aggregateExemplarsByVendorKey: vi.fn(),
}));

vi.mock("@/lib/db/queries/exemplar-consensus", () => ({
  upsertConsensusEntry: vi.fn(),
  getPromotionCandidates: vi.fn(),
  markPromoted: vi.fn(),
  markRetired: vi.fn(),
}));

vi.mock("@/lib/db/queries/global-exemplar-pool", () => ({
  promoteToGlobalPool: vi.fn(),
  retireGlobalExemplar: vi.fn(),
}));

vi.mock("@/lib/ai/field-normalization", () => ({
  normalizeFieldValue: vi.fn((_field: string, value: string) => value),
}));

// Import mocked modules
const { getEligibleOrgIds } = await import("@/lib/db/queries/org-reputation");
const { aggregateExemplarsByVendorKey } = await import(
  "@/lib/db/queries/extraction-exemplars"
);
const { upsertConsensusEntry, getPromotionCandidates, markPromoted, markRetired } =
  await import("@/lib/db/queries/exemplar-consensus");
const { promoteToGlobalPool, retireGlobalExemplar } = await import(
  "@/lib/db/queries/global-exemplar-pool"
);

// Import the function under test AFTER mocks
const { consensusRecompute } = await import("./consensus-recompute");

const harness = createInngestHarness();

beforeEach(() => {
  vi.clearAllMocks();
  // Default mock returns
  vi.mocked(upsertConsensusEntry).mockResolvedValue({ id: "consensus-1" });
  vi.mocked(markPromoted).mockResolvedValue();
  vi.mocked(markRetired).mockResolvedValue();
  vi.mocked(promoteToGlobalPool).mockResolvedValue({ id: "pool-1" });
  vi.mocked(retireGlobalExemplar).mockResolvedValue();
});

describe("consensusRecompute", () => {
  it("short-circuits when no eligible orgs", async () => {
    vi.mocked(getEligibleOrgIds).mockResolvedValue([]);

    const { result } = await harness.invoke(consensusRecompute, {
      data: {},
    });

    expect(result).toEqual({ eligible: 0, promoted: 0, retired: 0 });
    expect(aggregateExemplarsByVendorKey).not.toHaveBeenCalled();
  });

  it("short-circuits when no aggregations found", async () => {
    vi.mocked(getEligibleOrgIds).mockResolvedValue(["org-1", "org-2"]);
    vi.mocked(aggregateExemplarsByVendorKey).mockResolvedValue([]);

    const { result } = await harness.invoke(consensusRecompute, {
      data: {},
    });

    expect(result).toEqual({ eligible: 2, promoted: 0, retired: 0 });
    expect(upsertConsensusEntry).not.toHaveBeenCalled();
  });

  it("groups exemplars by vendor+field+value and upserts consensus", async () => {
    vi.mocked(getEligibleOrgIds).mockResolvedValue(["org-1", "org-2", "org-3"]);
    vi.mocked(aggregateExemplarsByVendorKey).mockResolvedValue([
      {
        vendorTaxId: "1111111111111",
        fieldName: "totalAmount",
        fieldCriticality: "high",
        userValue: "1000.00",
        orgId: "org-1",
      },
      {
        vendorTaxId: "1111111111111",
        fieldName: "totalAmount",
        fieldCriticality: "high",
        userValue: "1000.00",
        orgId: "org-2",
      },
      {
        vendorTaxId: "1111111111111",
        fieldName: "totalAmount",
        fieldCriticality: "high",
        userValue: "2000.00",
        orgId: "org-3",
      },
    ]);
    vi.mocked(getPromotionCandidates).mockResolvedValue([]);

    const { result } = await harness.invoke(consensusRecompute, {
      data: {},
    });

    // Should upsert 2 consensus entries (1000.00 and 2000.00)
    expect(upsertConsensusEntry).toHaveBeenCalledTimes(2);

    // The 1000.00 entry: 2 agreeing, 1 contradicting
    expect(upsertConsensusEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        vendorKey: "1111111111111",
        fieldName: "totalAmount",
        normalizedValue: "1000.00",
        agreeingOrgCount: 2,
        contradictingCount: 1,
      })
    );

    // The 2000.00 entry: 1 agreeing, 2 contradicting
    expect(upsertConsensusEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        vendorKey: "1111111111111",
        fieldName: "totalAmount",
        normalizedValue: "2000.00",
        agreeingOrgCount: 1,
        contradictingCount: 2,
      })
    );

    expect(result).toEqual({ eligible: 3, promoted: 0, retired: 0 });
  });

  it("promotes candidates that meet threshold", async () => {
    vi.mocked(getEligibleOrgIds).mockResolvedValue(["org-1"]);
    vi.mocked(aggregateExemplarsByVendorKey).mockResolvedValue([
      {
        vendorTaxId: "1111111111111",
        fieldName: "dueDate",
        fieldCriticality: "low",
        userValue: "2024-01-15",
        orgId: "org-1",
      },
    ]);

    // First call (promote step): return a candidate that meets low threshold (2)
    // Second call (retire step): return empty
    vi.mocked(getPromotionCandidates)
      .mockResolvedValueOnce([
        {
          id: "c-1",
          vendorKey: "1111111111111",
          fieldName: "dueDate",
          normalizedValue: "2024-01-15",
          normalizedValueHash: "hash",
          fieldCriticality: "low",
          weightedOrgCount: "3.0000",
          agreeingOrgCount: 3,
          contradictingCount: 0,
          status: "candidate",
          promotedAt: null,
          retiredAt: null,
          recomputedAt: new Date(),
          createdAt: new Date(),
        },
      ])
      .mockResolvedValueOnce([]);

    const { result } = await harness.invoke(consensusRecompute, {
      data: {},
    });

    expect(markPromoted).toHaveBeenCalledWith("c-1");
    expect(promoteToGlobalPool).toHaveBeenCalledWith(
      expect.objectContaining({
        vendorKey: "1111111111111",
        fieldName: "dueDate",
        canonicalValue: "2024-01-15",
        consensusId: "c-1",
      })
    );
    expect(result).toEqual({ eligible: 1, promoted: 1, retired: 0 });
  });

  it("retires contradicted candidates", async () => {
    vi.mocked(getEligibleOrgIds).mockResolvedValue(["org-1"]);
    vi.mocked(aggregateExemplarsByVendorKey).mockResolvedValue([
      {
        vendorTaxId: "1111111111111",
        fieldName: "dueDate",
        fieldCriticality: "low",
        userValue: "2024-01-15",
        orgId: "org-1",
      },
    ]);

    // First call (promote step): empty
    // Second call (retire step): return a contradicted candidate
    vi.mocked(getPromotionCandidates)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: "c-2",
          vendorKey: "1111111111111",
          fieldName: "dueDate",
          normalizedValue: "2024-01-15",
          normalizedValueHash: "hash",
          fieldCriticality: "low",
          weightedOrgCount: "1.0000",
          agreeingOrgCount: 1,
          contradictingCount: 3,
          status: "candidate",
          promotedAt: null,
          retiredAt: null,
          recomputedAt: new Date(),
          createdAt: new Date(),
        },
      ]);

    const { result } = await harness.invoke(consensusRecompute, {
      data: {},
    });

    expect(markRetired).toHaveBeenCalledWith("c-2");
    expect(retireGlobalExemplar).toHaveBeenCalledWith("1111111111111", "dueDate");
    expect(result).toEqual({ eligible: 1, promoted: 0, retired: 1 });
  });
});
