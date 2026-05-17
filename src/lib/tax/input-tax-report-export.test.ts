import { describe, expect, it } from "vitest";
import { inputTaxReportToCsv } from "./input-tax-report-export";
import type { InputTaxReport } from "./input-tax-report";

describe("inputTaxReportToCsv", () => {
  it("serializes input rows and totals with a UTF-8 BOM", () => {
    const report: InputTaxReport = {
      orgId: "org_1",
      periodYear: 2026,
      periodMonth: 5,
      rows: [
        {
          inputItemId: "input_1",
          taxInvoiceDate: "2026-05-03",
          taxInvoiceNo: 'SUP-"001"',
          vendorName: "Supplier",
          vendorTaxId: "3333333333333",
          taxInvoiceSubtype: "full_ti",
          status: "claimable",
          baseAmount: "1000.00",
          vatAmount: "70.00",
        },
      ],
      dailySummary: [],
      totals: {
        rowCount: 1,
        baseAmount: "1000.00",
        vatAmount: "70.00",
      },
      sourceUrls: [] as unknown as InputTaxReport["sourceUrls"],
    };

    expect(inputTaxReportToCsv(report)).toBe(
      `\uFEFF${[
        '"Tax invoice date","Supplier","Supplier tax ID","Tax invoice type","Tax invoice no.","Status","Tax base","Input VAT"',
        '"2026-05-03","Supplier","3333333333333","full_ti","SUP-""001""","claimable","1000.00","70.00"',
        '"TOTAL","","","","","","1000.00","70.00"',
        "",
      ].join("\n")}`
    );
  });
});
