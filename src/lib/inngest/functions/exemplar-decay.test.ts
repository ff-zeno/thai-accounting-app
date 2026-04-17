import { describe, it, expect, vi, beforeEach } from "vitest";
import { createInngestHarness } from "@/tests/inngest-harness";

vi.mock("@/lib/db/queries/extraction-exemplars", () => ({
  findStaleVendorExemplars: vi.fn(),
  softDeleteExemplarsByVendor: vi.fn(),
}));

vi.mock("@/lib/db/queries/extraction-log", () => ({
  hasRecentExtractionForVendor: vi.fn(),
}));

vi.mock("@/lib/db/queries/vendor-tier", () => ({
  demoteVendorTier: vi.fn(),
}));

const { findStaleVendorExemplars, softDeleteExemplarsByVendor } = await import(
  "@/lib/db/queries/extraction-exemplars"
);
const { hasRecentExtractionForVendor } = await import(
  "@/lib/db/queries/extraction-log"
);
const { demoteVendorTier } = await import("@/lib/db/queries/vendor-tier");

const { exemplarDecay } = await import("./exemplar-decay");

const harness = createInngestHarness();

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(softDeleteExemplarsByVendor).mockResolvedValue(0);
  vi.mocked(demoteVendorTier).mockResolvedValue(null);
});

describe("exemplarDecay", () => {
  it("short-circuits when no stale vendors found", async () => {
    vi.mocked(findStaleVendorExemplars).mockResolvedValue([]);

    const { result } = await harness.invoke(exemplarDecay, { data: {} });

    expect(result).toEqual({ vendorsDecayed: 0, exemplarsDeleted: 0 });
    expect(softDeleteExemplarsByVendor).not.toHaveBeenCalled();
  });

  it("decays stale vendors without recent extractions", async () => {
    vi.mocked(findStaleVendorExemplars).mockResolvedValue([
      { orgId: "org-1", vendorId: "vendor-1", count: 5 },
      { orgId: "org-1", vendorId: "vendor-2", count: 3 },
    ]);
    vi.mocked(hasRecentExtractionForVendor).mockResolvedValue(false);
    vi.mocked(softDeleteExemplarsByVendor)
      .mockResolvedValueOnce(5)
      .mockResolvedValueOnce(3);

    const { result } = await harness.invoke(exemplarDecay, { data: {} });

    expect(result).toEqual({ vendorsDecayed: 2, exemplarsDeleted: 8 });
    expect(demoteVendorTier).toHaveBeenCalledTimes(2);
    expect(demoteVendorTier).toHaveBeenCalledWith("org-1", "vendor-1", 0);
    expect(demoteVendorTier).toHaveBeenCalledWith("org-1", "vendor-2", 0);
  });

  it("skips vendors with recent extractions", async () => {
    vi.mocked(findStaleVendorExemplars).mockResolvedValue([
      { orgId: "org-1", vendorId: "vendor-1", count: 5 },
      { orgId: "org-1", vendorId: "vendor-2", count: 3 },
    ]);
    // vendor-1 has recent extractions, vendor-2 doesn't
    vi.mocked(hasRecentExtractionForVendor)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    vi.mocked(softDeleteExemplarsByVendor).mockResolvedValue(3);

    const { result } = await harness.invoke(exemplarDecay, { data: {} });

    expect(result).toEqual({ vendorsDecayed: 1, exemplarsDeleted: 3 });
    // Only vendor-2 should be decayed
    expect(softDeleteExemplarsByVendor).toHaveBeenCalledTimes(1);
    expect(softDeleteExemplarsByVendor).toHaveBeenCalledWith("org-1", "vendor-2");
    expect(demoteVendorTier).toHaveBeenCalledTimes(1);
    expect(demoteVendorTier).toHaveBeenCalledWith("org-1", "vendor-2", 0);
  });

  it("passes correct maxAge (12 months ago)", async () => {
    vi.mocked(findStaleVendorExemplars).mockResolvedValue([]);

    await harness.invoke(exemplarDecay, { data: {} });

    const callArg = vi.mocked(findStaleVendorExemplars).mock.calls[0][0];
    const now = new Date();
    const expectedAge = new Date();
    expectedAge.setMonth(expectedAge.getMonth() - 12);

    // Allow 5 seconds tolerance
    expect(Math.abs(callArg.getTime() - expectedAge.getTime())).toBeLessThan(5000);
  });
});
