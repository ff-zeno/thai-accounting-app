export type SsoConfigInput = {
  employeeRate: string | number;
  employerRate: string | number;
  insurableWageFloor: string | number;
  insurableWageCap: string | number;
  monthlyMaxPerSide: string | number;
};

function numeric(value: string | number | null | undefined) {
  return Number(value ?? 0);
}

function money(value: number) {
  return value.toFixed(2);
}

export function calculateSso(input: {
  grossMonthly: string | number;
  config: SsoConfigInput;
}) {
  const grossMonthly = numeric(input.grossMonthly);
  const floor = numeric(input.config.insurableWageFloor);
  const cap = numeric(input.config.insurableWageCap);

  if (grossMonthly < floor) {
    return {
      employee: "0.00",
      employer: "0.00",
      insurableWage: "0.00",
      contributionExempt: true,
      exemptionReason: "below_insurable_wage_floor",
    };
  }

  const insurableWage = Math.min(Math.max(grossMonthly, floor), cap);
  const employee = Math.min(
    insurableWage * numeric(input.config.employeeRate),
    numeric(input.config.monthlyMaxPerSide)
  );
  const employer = Math.min(
    insurableWage * numeric(input.config.employerRate),
    numeric(input.config.monthlyMaxPerSide)
  );

  return {
    employee: money(employee),
    employer: money(employer),
    insurableWage: money(insurableWage),
    contributionExempt: false,
    exemptionReason: null,
  };
}
