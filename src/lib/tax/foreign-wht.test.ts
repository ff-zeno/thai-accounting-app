import { describe, expect, it } from "vitest";
import {
  getForeignWhtStatutoryDefault,
  resolveForeignWhtRate,
} from "./foreign-wht";

describe("foreign WHT rate resolution", () => {
  it("defaults foreign service payments to PND54 and 15%", () => {
    const resolved = resolveForeignWhtRate({
      vendorCountry: "SG",
      vendorEntityType: "company",
      incomeType: "services",
    });

    expect(resolved).toMatchObject({
      isForeignPayee: true,
      formType: "pnd54",
      statutoryDefaultRate: "0.1500",
      selectedRate: "0.1500",
      rateSource: "system_default",
      belowDefault: false,
      rdPaymentTypeCode: "40(8)",
    });
    expect(resolved.sourceUrl).toContain("rd.go.th");
  });

  it("defaults dividends to 10%", () => {
    expect(getForeignWhtStatutoryDefault("dividends")).toMatchObject({
      rate: "0.1000",
      rdPaymentTypeCode: "40(4)(b)",
    });
  });

  it("honors owner overrides above default without acknowledgment", () => {
    const resolved = resolveForeignWhtRate({
      vendorCountry: "JP",
      vendorEntityType: "foreign",
      incomeType: "royalties",
      selectedRate: "0.2000",
    });

    expect(resolved).toMatchObject({
      selectedRate: "0.2000",
      rateSource: "user_override",
      belowDefault: false,
      acknowledgmentRequired: false,
      blockingReasons: [],
    });
  });

  it("blocks below-default rates until acknowledgment and accountant note exist", () => {
    const blocked = resolveForeignWhtRate({
      vendorCountry: "HK",
      vendorEntityType: "foreign",
      incomeType: "services",
      selectedRate: "0.0000",
    });

    expect(blocked).toMatchObject({
      selectedRate: "0.0000",
      belowDefault: true,
      acknowledgmentRequired: true,
    });
    expect(blocked.blockingReasons).toContain(
      "Below-default foreign WHT requires accountant advice and an owner acknowledgment"
    );

    const allowed = resolveForeignWhtRate({
      vendorCountry: "HK",
      vendorEntityType: "foreign",
      incomeType: "services",
      selectedRate: "0.0000",
      acknowledgmentText: "Treaty treatment confirmed by CPA.",
      accountantNote: "CPA note retained outside app.",
    });

    expect(allowed.blockingReasons).toEqual([]);
  });

  it("routes domestic payees to domestic forms without foreign defaults", () => {
    expect(
      resolveForeignWhtRate({
        vendorCountry: "TH",
        vendorEntityType: "individual",
        incomeType: "services",
      })
    ).toMatchObject({
      isForeignPayee: false,
      formType: "pnd3",
      statutoryDefaultRate: null,
      selectedRate: null,
    });
  });
});
