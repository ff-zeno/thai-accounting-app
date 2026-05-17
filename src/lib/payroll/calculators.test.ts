import { describe, expect, it } from "vitest";
import { calculateAnnualPit, calculateMonthlyPit } from "./pit-calculator";
import { calculateSso } from "./sso-calculator";

const brackets = [
  { lowerBound: "0.00", upperBound: "150000.00", marginalRate: "0.0000" },
  { lowerBound: "150000.00", upperBound: "300000.00", marginalRate: "0.0500" },
  { lowerBound: "300000.00", upperBound: "500000.00", marginalRate: "0.1000" },
  { lowerBound: "500000.00", upperBound: "750000.00", marginalRate: "0.1500" },
  { lowerBound: "750000.00", upperBound: "1000000.00", marginalRate: "0.2000" },
  { lowerBound: "1000000.00", upperBound: "2000000.00", marginalRate: "0.2500" },
  { lowerBound: "2000000.00", upperBound: "5000000.00", marginalRate: "0.3000" },
  { lowerBound: "5000000.00", upperBound: null, marginalRate: "0.3500" },
];

const cumulativeBrackets = [
  { ...brackets[0], cumulativeTaxAtLowerBound: "0.00" },
  { ...brackets[1], cumulativeTaxAtLowerBound: "0.00" },
  { ...brackets[2], cumulativeTaxAtLowerBound: "7500.00" },
  { ...brackets[3], cumulativeTaxAtLowerBound: "27500.00" },
  { ...brackets[4], cumulativeTaxAtLowerBound: "65000.00" },
  { ...brackets[5], cumulativeTaxAtLowerBound: "115000.00" },
  { ...brackets[6], cumulativeTaxAtLowerBound: "365000.00" },
  { ...brackets[7], cumulativeTaxAtLowerBound: "1265000.00" },
];

const standardDeduction = {
  employmentExpensePct: "0.5000",
  employmentExpenseCap: "100000.00",
  personalAllowance: "60000.00",
  spouseAllowance: "60000.00",
  childPre2018Allowance: "30000.00",
  childPost2018SecondPlusAllowance: "60000.00",
  parentAllowancePer: "30000.00",
};

describe("payroll calculators", () => {
  it("annualizes salary and smooths PIT over remaining pay periods including current", () => {
    const result = calculateMonthlyPit({
      brackets,
      standardDeduction,
      allowances: { personalAllowance: "60000.00" },
      ytdGrossPaid: "0.00",
      ytdPitWithheld: "0.00",
      currentPeriodGross: "50000.00",
      currentPeriodNumber: 1,
      payPeriodsPerYear: 12,
    });

    expect(result.estimatedAnnualGross).toBe(600000);
    expect(result.taxableIncome).toBe(440000);
    expect(result.estimatedAnnualPit).toBe(21500);
    expect(result.monthlyWht).toBe(1791.67);
    expect(result.payPeriodsRemainingIncludingCurrent).toBe(12);
  });

  it("true-ups against YTD withholding in a later pay period", () => {
    const result = calculateMonthlyPit({
      brackets,
      standardDeduction,
      allowances: { personalAllowance: "60000.00" },
      ytdGrossPaid: "200000.00",
      ytdPitWithheld: "7166.68",
      currentPeriodGross: "50000.00",
      currentPeriodNumber: 5,
      payPeriodsPerYear: 12,
    });

    expect(result.estimatedAnnualPit).toBe(21500);
    expect(result.monthlyWht).toBe(1791.66);
    expect(result.payPeriodsRemainingIncludingCurrent).toBe(8);
  });

  it("uses cumulative PIT bracket base tax when configured", () => {
    const result = calculateMonthlyPit({
      brackets: cumulativeBrackets,
      standardDeduction,
      allowances: { personalAllowance: "60000.00" },
      ytdGrossPaid: "0.00",
      ytdPitWithheld: "0.00",
      currentPeriodGross: "50000.00",
      currentPeriodNumber: 1,
      payPeriodsPerYear: 12,
    });

    expect(result.estimatedAnnualPit).toBe(21500);
    expect(result.bracketHits).toEqual([
      {
        lowerBound: 0,
        upperBound: 150000,
        taxableAmount: 150000,
        marginalRate: 0,
        tax: 0,
      },
      {
        lowerBound: 150000,
        upperBound: 300000,
        taxableAmount: 150000,
        marginalRate: 0.05,
        tax: 7500,
      },
      {
        lowerBound: 300000,
        upperBound: 500000,
        taxableAmount: 140000,
        marginalRate: 0.1,
        tax: 14000,
      },
    ]);
  });

  it.each([100000, 150000, 300000, 500000, 1500000, 5500000])(
    "matches summed-band PIT at taxable income %i",
    (taxableIncome) => {
      const summed = calculateAnnualPit(taxableIncome, brackets);
      const cumulative = calculateAnnualPit(taxableIncome, cumulativeBrackets);

      expect(cumulative.annualPit).toBe(summed.annualPit);
      expect(cumulative.hits).toEqual(summed.hits);
    },
  );

  it("uses cumulative PIT bracket base tax with mid-year true-up", () => {
    const result = calculateMonthlyPit({
      brackets: cumulativeBrackets,
      standardDeduction,
      allowances: { personalAllowance: "60000.00" },
      ytdGrossPaid: "200000.00",
      ytdPitWithheld: "7166.68",
      currentPeriodGross: "50000.00",
      currentPeriodNumber: 5,
      payPeriodsPerYear: 12,
    });

    expect(result.estimatedAnnualPit).toBe(21500);
    expect(result.monthlyWht).toBe(1791.66);
    expect(result.payPeriodsRemainingIncludingCurrent).toBe(8);
  });

  it("caps SSO at configured insurable wage and max contribution", () => {
    const result = calculateSso({
      grossMonthly: "50000.00",
      config: {
        employeeRate: "0.0500",
        employerRate: "0.0500",
        insurableWageFloor: "1650.00",
        insurableWageCap: "15000.00",
        monthlyMaxPerSide: "750.00",
      },
    });

    expect(result).toMatchObject({
      employee: "750.00",
      employer: "750.00",
      insurableWage: "15000.00",
      contributionExempt: false,
    });
  });
});
