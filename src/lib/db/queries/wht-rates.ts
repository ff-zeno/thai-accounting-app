import { and, eq, isNull, lte, or, sql } from "drizzle-orm";
import { db } from "../index";
import { whtRates } from "../schema";

export interface WhtRateLookupResult {
  standardRate: string;
  ewhtRate: string | null;
  rdPaymentTypeCode: string | null;
}

/**
 * Look up the WHT rate for a given payment type and entity type.
 *
 * wht_rates is a global reference table (no org_id) managed via effective dates.
 * e-WHT rates only apply when isEwht=true AND entityType='company' AND
 * the date falls within ewht_valid_from/ewht_valid_to.
 */
export async function lookupWhtRate(
  paymentType: string,
  entityType: "individual" | "company" | "foreign",
  isEwht = false,
  date?: string
): Promise<WhtRateLookupResult | null> {
  const referenceDate = date ?? new Date().toISOString().slice(0, 10);

  const conditions = [
    eq(whtRates.paymentType, paymentType),
    eq(whtRates.entityType, entityType),
    // Must be within effective dates (nulls mean open-ended)
    or(
      isNull(whtRates.effectiveFrom),
      lte(whtRates.effectiveFrom, referenceDate)
    ),
    or(
      isNull(whtRates.effectiveTo),
      sql`${whtRates.effectiveTo} >= ${referenceDate}`
    ),
  ];

  const rows = await db
    .select({
      standardRate: whtRates.standardRate,
      ewhtRate: whtRates.ewhtRate,
      ewhtValidFrom: whtRates.ewhtValidFrom,
      ewhtValidTo: whtRates.ewhtValidTo,
      rdPaymentTypeCode: whtRates.rdPaymentTypeCode,
    })
    .from(whtRates)
    .where(and(...conditions))
    .limit(1);

  if (rows.length === 0) return null;

  const row = rows[0];

  // e-WHT rate only applies for companies with valid date range
  let effectiveEwhtRate: string | null = null;
  if (isEwht && entityType === "company" && row.ewhtRate) {
    const ewhtFrom = row.ewhtValidFrom;
    const ewhtTo = row.ewhtValidTo;
    const inRange =
      (!ewhtFrom || ewhtFrom <= referenceDate) &&
      (!ewhtTo || ewhtTo >= referenceDate);
    if (inRange) {
      effectiveEwhtRate = row.ewhtRate;
    }
  }

  return {
    standardRate: row.standardRate,
    ewhtRate: effectiveEwhtRate,
    rdPaymentTypeCode: row.rdPaymentTypeCode,
  };
}

export async function lookupForeignWhtDefaultRate(
  rdPaymentTypeCode: string,
  date?: string
): Promise<string | null> {
  const referenceDate = date ?? new Date().toISOString().slice(0, 10);

  const rows = await db
    .select({ standardRate: whtRates.standardRate })
    .from(whtRates)
    .where(
      and(
        eq(whtRates.entityType, "foreign"),
        eq(whtRates.rdPaymentTypeCode, rdPaymentTypeCode),
        or(
          isNull(whtRates.effectiveFrom),
          lte(whtRates.effectiveFrom, referenceDate)
        ),
        or(
          isNull(whtRates.effectiveTo),
          sql`${whtRates.effectiveTo} >= ${referenceDate}`
        )
      )
    )
    .limit(1);

  return rows[0]?.standardRate ?? null;
}
