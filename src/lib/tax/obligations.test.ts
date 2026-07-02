import { describe, it, expect } from "vitest";
import { DEFAULT_TAX_CONFIG } from "./filing-deadlines";
import {
  deriveObligations,
  deriveNotApplicableObligations,
  type TaxProfile,
} from "./obligations";

const config = DEFAULT_TAX_CONFIG;
const period = { year: 2026, month: 1 };

const allOn: TaxProfile = {
  isVatRegistered: true,
  hasEmployees: true,
  hasImportedServices: true,
};

const vatOnly: TaxProfile = {
  isVatRegistered: true,
  hasEmployees: false,
  hasImportedServices: false,
};

const noneOn: TaxProfile = {
  isVatRegistered: false,
  hasEmployees: false,
  hasImportedServices: false,
};

describe("deriveObligations", () => {
  it("all flags on → all 5 obligations", () => {
    const keys = deriveObligations(allOn, period, config).map((o) => o.key);
    expect(keys).toEqual(["pp30", "pp36", "pnd3_53", "pnd1", "sso"]);
  });

  it("VAT-only profile → PP30 + always-on WHT, no PP36/PND1/SSO", () => {
    const keys = deriveObligations(vatOnly, period, config).map((o) => o.key);
    expect(keys).toEqual(["pp30", "pnd3_53"]);
  });

  it("no flags → only the always-on WHT remittance, marked conditional", () => {
    const obligations = deriveObligations(noneOn, period, config);
    expect(obligations.map((o) => o.key)).toEqual(["pnd3_53"]);
    expect(obligations[0].conditionalNote).toMatch(/only due if you withheld/i);
  });

  it("PP30 due date is the business-day adjusted e-filing deadline (2026-02-23)", () => {
    const pp30 = deriveObligations(allOn, period, config).find(
      (o) => o.key === "pp30"
    )!;
    // 23 Feb Bangkok = 22T17:00Z
    expect(pp30.dueDate.toISOString()).toContain("2026-02-22");
    expect(pp30.dueDateIsEfiling).toBe(true);
    expect(pp30.efilingDueDate).toBeUndefined();
  });

  it("PP36 rolls Sunday 2026-02-15 to Monday 2026-02-16, no e-filing extension", () => {
    const pp36 = deriveObligations(allOn, period, config).find(
      (o) => o.key === "pp36"
    )!;
    // 16 Feb Bangkok = 15T17:00Z
    expect(pp36.dueDate.toISOString()).toContain("2026-02-15");
    expect(pp36.efilingDueDate).toBeUndefined();
  });

  it("PND 3/53 paper deadline rolls Saturday 2026-02-07 to Monday, e-filing to the 16th", () => {
    const wht = deriveObligations(allOn, period, config).find(
      (o) => o.key === "pnd3_53"
    )!;
    // 9 Feb Bangkok = 08T17:00Z; 16 Feb Bangkok = 15T17:00Z
    expect(wht.dueDate.toISOString()).toContain("2026-02-08");
    expect(wht.efilingDueDate?.toISOString()).toContain("2026-02-15");
  });

  it("PND 1 shares the WHT paper/e-filing deadlines", () => {
    const pnd1 = deriveObligations(allOn, period, config).find(
      (o) => o.key === "pnd1"
    )!;
    expect(pnd1.dueDate.toISOString()).toContain("2026-02-08");
    expect(pnd1.efilingDueDate?.toISOString()).toContain("2026-02-15");
  });

  it("SSO due the 15th of the following month, rolled to the next business day", () => {
    const sso = deriveObligations(allOn, period, config).find(
      (o) => o.key === "sso"
    )!;
    // Sunday 15 Feb 2026 rolls to Monday 16 Feb Bangkok = 15T17:00Z
    expect(sso.dueDate.toISOString()).toContain("2026-02-15");
    expect(sso.efilingDueDate).toBeUndefined();
  });

  it("handles the year boundary: period 2026-12 is due in January 2027", () => {
    const sso = deriveObligations(allOn, { year: 2026, month: 12 }, config).find(
      (o) => o.key === "sso"
    )!;
    expect(sso.dueDate.toISOString()).toContain("2027-01-14"); // 15 Jan Bangkok
  });

  it("respects a custom deadline config", () => {
    const custom = { ...config, pp30EfilingDeadlineDay: 20 };
    const pp30 = deriveObligations(allOn, period, custom).find(
      (o) => o.key === "pp30"
    )!;
    expect(pp30.dueDate.toISOString()).toContain("2026-02-19"); // 20 Feb Bangkok
  });
});

describe("deriveNotApplicableObligations", () => {
  it("all flags on → nothing gated off", () => {
    expect(deriveNotApplicableObligations(allOn)).toEqual([]);
  });

  it("VAT-only profile → PP36, PND1 and SSO gated off with reasons", () => {
    const skipped = deriveNotApplicableObligations(vatOnly);
    expect(skipped.map((s) => s.key)).toEqual(["pp36", "pnd1", "sso"]);
    for (const entry of skipped) {
      expect(entry.reason.length).toBeGreaterThan(0);
    }
  });

  it("no flags → PP30 also gated off, PND 3/53 never listed", () => {
    const keys = deriveNotApplicableObligations(noneOn).map((s) => s.key);
    expect(keys).toEqual(["pp30", "pp36", "pnd1", "sso"]);
    expect(keys).not.toContain("pnd3_53");
  });
});
