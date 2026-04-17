import { describe, it, expect, vi, beforeEach } from "vitest";
import { createInngestHarness } from "@/tests/inngest-harness";

vi.mock("@/lib/db/queries/extraction-exemplars", () => ({
  countMissingVendorTaxId: vi.fn(),
  backfillVendorTaxIdBatch: vi.fn(),
}));

const { countMissingVendorTaxId, backfillVendorTaxIdBatch } = await import(
  "@/lib/db/queries/extraction-exemplars"
);

const { backfillVendorTaxId } = await import("./backfill-vendor-tax-id");

const harness = createInngestHarness();

beforeEach(() => {
  vi.clearAllMocks();
});

describe("backfillVendorTaxId", () => {
  it("short-circuits when no missing vendor_tax_ids", async () => {
    vi.mocked(countMissingVendorTaxId).mockResolvedValue(0);

    const { result } = await harness.invoke(backfillVendorTaxId, {
      data: {},
    });

    expect(result).toEqual({ updated: 0, skipped: 0, batches: 0 });
    expect(backfillVendorTaxIdBatch).not.toHaveBeenCalled();
  });

  it("processes a single batch when fewer than batch size", async () => {
    vi.mocked(countMissingVendorTaxId).mockResolvedValue(100);
    vi.mocked(backfillVendorTaxIdBatch).mockResolvedValue(80);

    const { result } = await harness.invoke(backfillVendorTaxId, {
      data: {},
    });

    expect(result).toEqual({ updated: 80, skipped: 20, batches: 1 });
    expect(backfillVendorTaxIdBatch).toHaveBeenCalledTimes(1);
    expect(backfillVendorTaxIdBatch).toHaveBeenCalledWith(500);
  });

  it("loops through multiple batches", async () => {
    vi.mocked(countMissingVendorTaxId).mockResolvedValue(1200);
    vi.mocked(backfillVendorTaxIdBatch)
      .mockResolvedValueOnce(500)
      .mockResolvedValueOnce(500)
      .mockResolvedValueOnce(150);

    const { result } = await harness.invoke(backfillVendorTaxId, {
      data: {},
    });

    expect(result).toEqual({ updated: 1150, skipped: 50, batches: 3 });
    expect(backfillVendorTaxIdBatch).toHaveBeenCalledTimes(3);
  });

  it("handles case where all rows lack a vendor with tax_id", async () => {
    vi.mocked(countMissingVendorTaxId).mockResolvedValue(50);
    vi.mocked(backfillVendorTaxIdBatch).mockResolvedValue(0);

    const { result } = await harness.invoke(backfillVendorTaxId, {
      data: {},
    });

    expect(result).toEqual({ updated: 0, skipped: 50, batches: 1 });
  });
});
