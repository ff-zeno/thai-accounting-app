import { describe, expect, it } from "vitest";
import {
  renderFiftyTawiBilingualPdf,
  shouldRenderBilingualFiftyTawiPayee,
} from "./fifty-tawi-bilingual";
import type { FiftyTawiData } from "./fifty-tawi";

const sampleCertificate: FiftyTawiData = {
  certificateNo: "PND54/2026/001",
  formType: "pnd54",
  paymentDate: "2026-05-15",
  issuedDate: "2026-05-15",
  totalBaseAmount: "10000.00",
  totalWht: "1500.00",
  payer: {
    name: "Lumera Co., Ltd.",
    nameTh: "บริษัท ลูเมร่า จำกัด",
    taxId: "1234567890123",
    branchNumber: "00000",
    address: "Bangkok, Thailand",
    addressTh: "กรุงเทพมหานคร",
  },
  payee: {
    name: "Foreign Service Pte. Ltd.",
    nameTh: null,
    taxId: null,
    branchNumber: null,
    address: "Singapore",
    addressTh: null,
  },
  items: [
    {
      whtType: "Service fee",
      rdPaymentTypeCode: "40(8)",
      baseAmount: "10000.00",
      whtRate: "0.1500",
      whtAmount: "1500.00",
    },
  ],
};

describe("bilingual 50 Tawi PDF", () => {
  it("routes foreign or non-TH payees to bilingual output", () => {
    expect(shouldRenderBilingualFiftyTawiPayee({ entityType: "foreign", country: "TH" })).toBe(true);
    expect(shouldRenderBilingualFiftyTawiPayee({ entityType: "company", country: "SG" })).toBe(true);
    expect(shouldRenderBilingualFiftyTawiPayee({ entityType: "company", country: "TH" })).toBe(false);
    expect(shouldRenderBilingualFiftyTawiPayee({ entityType: "company", country: null })).toBe(false);
  });

  it("renders a PDF buffer for foreign payee certificates", async () => {
    const buffer = await renderFiftyTawiBilingualPdf(sampleCertificate);

    expect(buffer.subarray(0, 5).toString()).toBe("%PDF-");
    expect(buffer.length).toBeGreaterThan(1000);
  });
});
