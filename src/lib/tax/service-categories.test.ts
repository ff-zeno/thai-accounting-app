import { describe, expect, it } from "vitest";
import { SERVICE_CATEGORIES, getServiceCategory } from "./service-categories";
import { whtRateSeedData } from "../db/seeds/wht-rates";

/**
 * Drift guard: SERVICE_CATEGORIES is a UI constant; the runtime source of
 * truth for WHT rates is the wht_rates table (seeded from whtRateSeedData).
 * If a rate changes in the seed, this test forces the UI constant to follow.
 *
 * Categories without a seed counterpart (entertainment, contract_work) carry
 * statutory rates that have no wht_rates row yet — asserted as literals so a
 * future seed addition shows up as a failing expectation to reconcile.
 */
const CATEGORY_TO_SEED_PAYMENT_TYPE: Record<string, string> = {
  general_service: "service",
  professional_fee: "professional_fees",
  advertising: "advertising",
  transport: "transport",
  rental: "rent_immovable",
};

function seedRate(paymentType: string): string | undefined {
  return whtRateSeedData.find(
    (row) => row.paymentType === paymentType && row.entityType === "individual"
  )?.standardRate;
}

describe("service categories ↔ wht-rates seed drift", () => {
  it.each(Object.entries(CATEGORY_TO_SEED_PAYMENT_TYPE))(
    "category %s matches seed payment type %s",
    (categoryValue, paymentType) => {
      const category = getServiceCategory(categoryValue);
      expect(category, `unknown category ${categoryValue}`).toBeDefined();
      expect(seedRate(paymentType), `no individual seed row for ${paymentType}`).toBe(
        category!.rate
      );
    }
  );

  it("pins the categories that have no seed counterpart", () => {
    expect(getServiceCategory("entertainment")?.rate).toBe("0.0500");
    expect(getServiceCategory("contract_work")?.rate).toBe("0.0300");
    for (const value of ["entertainment", "contract_work"]) {
      expect(
        whtRateSeedData.some(
          (row) => row.paymentType === value && row.entityType === "individual"
        ),
        `${value} gained a wht_rates seed row — move it into CATEGORY_TO_SEED_PAYMENT_TYPE`
      ).toBe(false);
    }
  });

  it("keeps every category in NUMERIC(5,4) rate format", () => {
    for (const category of SERVICE_CATEGORIES) {
      expect(category.rate).toMatch(/^0\.\d{4}$/);
    }
  });
});
