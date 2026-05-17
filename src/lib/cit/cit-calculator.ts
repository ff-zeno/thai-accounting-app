import type { InferSelectModel } from "drizzle-orm";
import type { citBrackets } from "@/lib/db/schema";

export type CitBracket = Pick<
  InferSelectModel<typeof citBrackets>,
  "lowerBound" | "upperBound" | "marginalRate"
>;

function cents(value: string | number | null | undefined) {
  return Math.round(Number(value ?? 0) * 100);
}

function money(valueCents: number) {
  return (valueCents / 100).toFixed(2);
}

export function computeProgressiveCit(
  taxableIncome: string | number,
  brackets: CitBracket[]
) {
  const incomeCents = Math.max(0, cents(taxableIncome));
  let taxCents = 0;

  for (const bracket of brackets) {
    const lowerCents = cents(bracket.lowerBound);
    const upperCents = bracket.upperBound == null ? incomeCents : cents(bracket.upperBound);
    if (incomeCents <= lowerCents) continue;

    const taxableSliceCents = Math.min(incomeCents, upperCents) - lowerCents;
    taxCents += Math.round(taxableSliceCents * Number(bracket.marginalRate));
  }

  return money(taxCents);
}

export function computeProjectedPnd51(data: {
  projectedFullYearProfit: string | number;
  annualCit: string | number;
}) {
  const annualCitCents = cents(data.annualCit);
  return {
    projectedFullYearProfit: money(cents(data.projectedFullYearProfit)),
    annualCit: money(annualCitCents),
    prepaymentDue: money(Math.round(annualCitCents / 2)),
  };
}

export function computeLossCarryForwardConsumption(data: {
  taxableIncome: string | number;
  layers: Array<{
    id: string;
    originatedTaxYear: number;
    remainingAmount: string | number;
  }>;
}) {
  let remainingTaxableIncomeCents = Math.max(0, cents(data.taxableIncome));
  const consumption: Array<{
    layerId: string;
    originatedTaxYear: number;
    consumedAmount: string;
    remainingAmountAfter: string;
  }> = [];

  for (const layer of [...data.layers].sort(
    (a, b) => a.originatedTaxYear - b.originatedTaxYear
  )) {
    if (remainingTaxableIncomeCents <= 0) break;

    const layerRemainingCents = cents(layer.remainingAmount);
    const consumedCents = Math.min(layerRemainingCents, remainingTaxableIncomeCents);
    remainingTaxableIncomeCents -= consumedCents;

    consumption.push({
      layerId: layer.id,
      originatedTaxYear: layer.originatedTaxYear,
      consumedAmount: money(consumedCents),
      remainingAmountAfter: money(layerRemainingCents - consumedCents),
    });
  }

  const totalConsumedCents = consumption.reduce(
    (sum, item) => sum + cents(item.consumedAmount),
    0
  );

  return {
    taxableIncomeBeforeLosses: money(cents(data.taxableIncome)),
    totalLossesConsumed: money(totalConsumedCents),
    taxableIncomeAfterLosses: money(remainingTaxableIncomeCents),
    consumption,
  };
}
