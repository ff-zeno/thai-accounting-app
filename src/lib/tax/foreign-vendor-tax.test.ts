import { describe, expect, it } from "vitest";
import { invoiceExtractionSchema } from "@/lib/ai/schemas/invoice-extraction";
import { classifyForeignVendorTax } from "./foreign-vendor-tax";

describe("foreign vendor tax classification", () => {
  it("accepts valid ISO-2 vendorCountry and ignores malformed country hints", () => {
    expect(
      invoiceExtractionSchema.safeParse({
        documentType: "invoice",
        totalAmount: "100.00",
        detectedLanguage: "en",
        confidence: 0.9,
        vendorCountry: "SG",
      }).success
    ).toBe(true);

    const lower = invoiceExtractionSchema.safeParse({
      documentType: "invoice",
      totalAmount: "100.00",
      detectedLanguage: "en",
      confidence: 0.9,
      vendorCountry: "sg",
    });
    expect(lower.success && lower.data.vendorCountry).toBe("SG");

    const malformed = invoiceExtractionSchema.safeParse({
        documentType: "invoice",
        totalAmount: "100.00",
        detectedLanguage: "en",
        confidence: 0.9,
        vendorCountry: "Singapore",
      });
    expect(malformed.success && malformed.data.vendorCountry).toBeUndefined();
  });

  it("accepts full tax invoice evidence fields from extraction", () => {
    const result = invoiceExtractionSchema.safeParse({
      documentType: "invoice",
      documentNumber: "TI-001",
      taxInvoiceSubtype: "full_ti",
      taxInvoiceSerialNumber: "TI-001",
      taxInvoiceWords: "Tax Invoice / ใบกำกับภาษี",
      vendorTaxId: "0105566000002",
      vendorBranchNumber: "00000",
      buyerTaxId: "0105566000001",
      buyerBranchNumber: "00000",
      totalAmount: "1070.00",
      detectedLanguage: "mixed",
      confidence: 0.93,
    });

    expect(result.success).toBe(true);
    expect(result.success && result.data).toMatchObject({
      taxInvoiceSubtype: "full_ti",
      taxInvoiceSerialNumber: "TI-001",
      taxInvoiceWords: "Tax Invoice / ใบกำกับภาษี",
      buyerBranchNumber: "00000",
    });
  });

  it("accepts incoming 50 Tawi certificate extraction fields", () => {
    const result = invoiceExtractionSchema.safeParse({
      documentType: "wht_certificate_received",
      documentNumber: "50T-001",
      issueDate: "2026-04-15",
      vendorName: "Customer Co",
      vendorTaxId: "0105566000003",
      totalAmount: "10000.00",
      lineItems: [
        {
          description: "Service fee withholding certificate",
          amount: "10000.00",
          whtRate: "0.0300",
          whtAmount: "300.00",
        },
      ],
      detectedLanguage: "mixed",
      confidence: 0.91,
    });

    expect(result.success).toBe(true);
    expect(result.success && result.data.documentType).toBe(
      "wht_certificate_received"
    );
    expect(result.success && result.data.lineItems?.[0]?.whtAmount).toBe("300.00");
  });

  it("requires PP36 for reviewed foreign services", () => {
    const result = classifyForeignVendorTax({
      direction: "expense",
      vendorCountry: "SG",
      vendorEntityType: "foreign",
      category: "professional_fee",
      subtotal: "1000.00",
      totalAmount: "1000.00",
      totalAmountThb: "36500.00",
      currency: "USD",
      paymentDate: "2026-03-20",
    });

    expect(result.pp36Required).toBe(true);
    expect(result.whtFormRoute).toBe("pnd54");
    expect(result.blockingReasons).toEqual([]);
  });

  it("excludes foreign goods imports from PP36", () => {
    const result = classifyForeignVendorTax({
      direction: "expense",
      vendorCountry: "CN",
      vendorEntityType: "foreign",
      category: "goods_import",
      subtotal: "1000.00",
      currency: "USD",
      totalAmountThb: "36000.00",
      issueDate: "2026-03-15",
    });

    expect(result.pp36Required).toBe(false);
    expect(result.pp36ExcludedReason).toBe("goods_import");
    expect(result.blockingReasons).toEqual([]);
  });

  it("blocks ambiguous foreign expenses until classified", () => {
    const result = classifyForeignVendorTax({
      direction: "expense",
      vendorCountry: "US",
      vendorEntityType: "company",
      category: "marketing",
      subtotal: "1000.00",
      currency: "USD",
      totalAmountThb: "36000.00",
      issueDate: "2026-03-15",
    });

    expect(result.pp36Required).toBe(false);
    expect(result.whtFormRoute).toBe("pnd54");
    expect(result.blockingReasons[0]).toMatch(/foreign expense must be marked/);
  });
});
