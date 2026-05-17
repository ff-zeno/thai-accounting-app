import { describe, expect, it } from "vitest";
import { selectSeedDocsByVendor } from "../../../benchmarks/dogfood/seed-selection";
import type { GroundTruthDoc } from "../../../benchmarks/dogfood/parse-review";

function doc(input: {
  docId: string;
  vendorGroup: string;
  vendorAddress: string;
  aiVendorAddress?: string;
}): GroundTruthDoc {
  return {
    docId: input.docId,
    vendorGroup: input.vendorGroup,
    samplePath: `${input.docId}.pdf`,
    aiExtraction: {
      vendorAddress: input.aiVendorAddress ?? input.vendorAddress,
      totalAmount: "100.00",
    },
    groundTruth: {
      vendorAddress: input.vendorAddress,
      totalAmount: "100.00",
    },
  } as unknown as GroundTruthDoc;
}

describe("selectSeedDocsByVendor", () => {
  it("prefers a representative Thai-address seed when most vendor samples use Thai address text", () => {
    const seeds = selectSeedDocsByVendor([
      doc({
        docId: "ksher-01",
        vendorGroup: "Ksher",
        vendorAddress: "591 United Business Center II Building Bangkok",
      }),
      doc({
        docId: "ksher-02",
        vendorGroup: "Ksher",
        vendorAddress: "591 ถนนสุขุมวิท แขวงคลองตันเหนือ เขตวัฒนา กรุงเทพฯ 10110",
        aiVendorAddress: "591 United Business Center II Building Bangkok",
      }),
      doc({
        docId: "ksher-03",
        vendorGroup: "Ksher",
        vendorAddress: "591 ถนนสุขุมวิท แขวงคลองตันเหนือ เขตวัฒนา กรุงเทพฯ 10110",
      }),
    ]);

    expect(seeds.map((seed) => seed.docId)).toEqual(["ksher-02"]);
  });

  it("keeps first sample for one-off vendors without a representative-language signal", () => {
    const seeds = selectSeedDocsByVendor([
      doc({
        docId: "fedex",
        vendorGroup: "Fedex",
        vendorAddress: "FedEx Bangkok",
      }),
    ]);

    expect(seeds.map((seed) => seed.docId)).toEqual(["fedex"]);
  });
});
