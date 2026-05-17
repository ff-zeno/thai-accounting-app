import { describe, expect, it } from "vitest";
import { outputTaxReportToCsv } from "./output-tax-report-export";
import type { OutputTaxReport } from "./output-tax-report";

describe("outputTaxReportToCsv", () => {
  it("serializes report rows and totals with CSV escaping", () => {
    const report: OutputTaxReport = {
      orgId: "org_1",
      establishmentId: "est_1",
      periodYear: 2026,
      periodMonth: 5,
      rows: [
        {
          saleId: "sale_1",
          taxDate: "2026-05-01",
          branchNumber: "00000",
          source: "manual",
          externalId: "external-1",
          channel: "card",
          taxInvoiceType: "full_ti",
          taxInvoiceNumber: 'TI-"001"',
          taxBaseExVat: "1000.00",
          vatAmount: "70.00",
          amountIncludingVat: "1070.00",
        },
      ],
      dailySummary: [],
      totals: {
        saleCount: 1,
        taxBaseExVat: "1000.00",
        vatAmount: "70.00",
        amountIncludingVat: "1070.00",
      },
      sourceUrls: [] as unknown as OutputTaxReport["sourceUrls"],
    };

    expect(outputTaxReportToCsv(report)).toBe(
      `\uFEFF${[
        '"Tax date","Branch","Invoice type","Invoice no.","Channel","Tax base ex VAT","Output VAT","Gross amount"',
        '"2026-05-01","00000","full_ti","TI-""001""","card","1000.00","70.00","1070.00"',
        '"TOTAL","","","","","1000.00","70.00","1070.00"',
        "",
      ].join("\n")}`
    );
  });
});
