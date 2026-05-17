export type PitBracket = {
  lowerBound: string | number;
  upperBound: string | number | null;
  marginalRate: string | number;
  cumulativeTaxAtLowerBound?: string | number | null;
};

export type PitStandardDeduction = {
  employmentExpensePct: string | number;
  employmentExpenseCap: string | number;
  personalAllowance: string | number;
  spouseAllowance: string | number;
  childPre2018Allowance: string | number;
  childPost2018SecondPlusAllowance: string | number;
  parentAllowancePer: string | number;
};

export type PayrollAllowanceInput = {
  personalAllowance?: string | number | null;
  spouseAllowance?: string | number | null;
  childCountPre2018?: number | null;
  childCountPost2018SecondPlus?: number | null;
  parentAllowance?: string | number | null;
  disabledDependentAllowance?: string | number | null;
  healthInsurancePremium?: string | number | null;
  lifeInsurancePremium?: string | number | null;
  parentsHealthInsurance?: string | number | null;
  pensionInsurance?: string | number | null;
  ltfRmfSsfAmount?: string | number | null;
  mortgageInterest?: string | number | null;
  socialSecurityContribution?: string | number | null;
};

export type PitCalculationInput = {
  brackets: PitBracket[];
  standardDeduction: PitStandardDeduction;
  allowances?: PayrollAllowanceInput | null;
  ytdGrossPaid: string | number;
  ytdPitWithheld: string | number;
  currentPeriodGross: string | number;
  currentPeriodNumber: number;
  payPeriodsPerYear: number;
};

function numeric(value: string | number | null | undefined) {
  return Number(value ?? 0);
}

function money(value: number) {
  return Number(value.toFixed(2));
}

export function calculateAnnualPit(
  taxableIncome: number,
  brackets: PitBracket[]
) {
  const sorted = [...brackets].sort(
    (a, b) => numeric(a.lowerBound) - numeric(b.lowerBound)
  );

  const hits: Array<{
    lowerBound: number;
    upperBound: number | null;
    taxableAmount: number;
    marginalRate: number;
    tax: number;
  }> = [];
  let tax = 0;
  for (const bracket of sorted) {
    const lowerBound = numeric(bracket.lowerBound);
    const upperBound = bracket.upperBound === null ? null : numeric(bracket.upperBound);
    if (taxableIncome <= lowerBound) continue;

    const bracketCeiling = upperBound ?? taxableIncome;
    const taxableAmount = Math.max(
      0,
      Math.min(taxableIncome, bracketCeiling) - lowerBound
    );
    const marginalRate = numeric(bracket.marginalRate);
    const bracketTax = taxableAmount * marginalRate;
    tax += bracketTax;
    hits.push({
      lowerBound,
      upperBound,
      taxableAmount: money(taxableAmount),
      marginalRate,
      tax: money(bracketTax),
    });
  }

  const activeBracket = [...sorted]
    .reverse()
    .find((bracket) => taxableIncome > numeric(bracket.lowerBound));
  if (activeBracket?.cumulativeTaxAtLowerBound != null) {
    const lowerBound = numeric(activeBracket.lowerBound);
    const bracketTax = Math.max(0, taxableIncome - lowerBound) *
      numeric(activeBracket.marginalRate);
    return {
      annualPit: money(numeric(activeBracket.cumulativeTaxAtLowerBound) + bracketTax),
      hits,
    };
  }

  return { annualPit: money(tax), hits };
}

export function calculateMonthlyPit(input: PitCalculationInput) {
  const currentPeriodNumber = Math.max(1, input.currentPeriodNumber);
  const payPeriodsRemainingIncludingCurrent = Math.max(
    1,
    input.payPeriodsPerYear - currentPeriodNumber + 1
  );
  const currentGross = numeric(input.currentPeriodGross);
  const ytdGrossPaid = numeric(input.ytdGrossPaid);
  const ytdPitWithheld = numeric(input.ytdPitWithheld);
  const projectedRemainingGross =
    currentGross * (payPeriodsRemainingIncludingCurrent - 1);
  const estimatedAnnualGross =
    ytdGrossPaid + currentGross + projectedRemainingGross;

  const employmentExpenseDeduction = Math.min(
    estimatedAnnualGross * numeric(input.standardDeduction.employmentExpensePct),
    numeric(input.standardDeduction.employmentExpenseCap)
  );

  const allowances = input.allowances;
  const allowanceTotal =
    numeric(allowances?.personalAllowance ?? input.standardDeduction.personalAllowance) +
    numeric(allowances?.spouseAllowance) +
    numeric(allowances?.childCountPre2018) *
      numeric(input.standardDeduction.childPre2018Allowance) +
    numeric(allowances?.childCountPost2018SecondPlus) *
      numeric(input.standardDeduction.childPost2018SecondPlusAllowance) +
    numeric(allowances?.parentAllowance) +
    numeric(allowances?.disabledDependentAllowance) +
    numeric(allowances?.healthInsurancePremium) +
    numeric(allowances?.lifeInsurancePremium) +
    numeric(allowances?.parentsHealthInsurance) +
    numeric(allowances?.pensionInsurance) +
    numeric(allowances?.ltfRmfSsfAmount) +
    numeric(allowances?.mortgageInterest) +
    numeric(allowances?.socialSecurityContribution);

  const taxableIncome = Math.max(
    0,
    estimatedAnnualGross - employmentExpenseDeduction - allowanceTotal
  );
  const annual = calculateAnnualPit(taxableIncome, input.brackets);
  const monthlyWht = Math.max(
    0,
    (annual.annualPit - ytdPitWithheld) / payPeriodsRemainingIncludingCurrent
  );

  return {
    estimatedAnnualGross: money(estimatedAnnualGross),
    employmentExpenseDeduction: money(employmentExpenseDeduction),
    allowanceTotal: money(allowanceTotal),
    taxableIncome: money(taxableIncome),
    estimatedAnnualPit: annual.annualPit,
    monthlyWht: money(monthlyWht),
    payPeriodsRemainingIncludingCurrent,
    bracketHits: annual.hits,
  };
}
