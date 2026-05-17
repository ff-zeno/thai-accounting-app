import { and, desc, eq, lte, sql } from "drizzle-orm";
import { db } from "../index";
import { auditLog, fxRatesBot } from "../schema";
import { auditMutation } from "../helpers/audit-log";

function normalizeCurrency(currency: string) {
  const normalized = currency.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(normalized)) {
    throw new Error("Currency must be a 3-letter ISO code");
  }
  return normalized;
}

export async function recordBotFxRate(data: {
  auditOrgId: string;
  actorId?: string;
  rateDate: string;
  currency: string;
  buyingRate?: string | null;
  sellingRate?: string | null;
  midRate: string;
  sourceUrl: string;
  fetchedAt?: Date;
}) {
  const currency = normalizeCurrency(data.currency);
  const fetchedAt = data.fetchedAt ?? new Date();
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(fxRatesBot)
      .where(and(eq(fxRatesBot.rateDate, data.rateDate), eq(fxRatesBot.currency, currency)))
      .limit(1);

    const buyingRate = data.buyingRate || existing?.buyingRate || null;
    const sellingRate = data.sellingRate || existing?.sellingRate || null;
    const [row] = await tx
      .insert(fxRatesBot)
      .values({
        rateDate: data.rateDate,
        currency,
        buyingRate,
        sellingRate,
        midRate: data.midRate,
        sourceUrl: data.sourceUrl,
        fetchedAt,
      })
      .onConflictDoUpdate({
        target: [fxRatesBot.rateDate, fxRatesBot.currency],
        set: {
          buyingRate,
          sellingRate,
          midRate: data.midRate,
          sourceUrl: data.sourceUrl,
          fetchedAt,
          updatedAt: fetchedAt,
        },
      })
      .returning();

    await tx.insert(auditLog).values({
      orgId: data.auditOrgId,
      entityType: "fx_rate_bot",
      entityId: row.id,
      action: existing ? "update" : "create",
      oldValue: existing ?? null,
      newValue: {
        ...row,
        sourceUrl: data.sourceUrl,
      },
      actorId: data.actorId,
    });

    return row;
  });
}

export async function upsertBotFxRateFromSource(data: {
  auditOrgId: string;
  rateDate: string;
  currency: string;
  buyingRate?: string | null;
  sellingRate?: string | null;
  midRate: string;
  sourceUrl: string;
  fetchedAt?: Date;
}) {
  const currency = normalizeCurrency(data.currency);
  const fetchedAt = data.fetchedAt ?? new Date();
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(fxRatesBot)
      .where(and(eq(fxRatesBot.rateDate, data.rateDate), eq(fxRatesBot.currency, currency)))
      .limit(1);

    const buyingRate = data.buyingRate || existing?.buyingRate || null;
    const sellingRate = data.sellingRate || existing?.sellingRate || null;
    const [row] = await tx
      .insert(fxRatesBot)
      .values({
        rateDate: data.rateDate,
        currency,
        buyingRate,
        sellingRate,
        midRate: data.midRate,
        sourceUrl: data.sourceUrl,
        fetchedAt,
      })
      .onConflictDoUpdate({
        target: [fxRatesBot.rateDate, fxRatesBot.currency],
        set: {
          buyingRate,
          sellingRate,
          midRate: data.midRate,
          sourceUrl: data.sourceUrl,
          fetchedAt,
          updatedAt: fetchedAt,
        },
      })
      .returning();

    await auditMutation(
      {
        orgId: data.auditOrgId,
        entityType: "fx_rate_bot",
        entityId: row.id,
        action: existing ? "update" : "create",
        oldValue: existing ?? undefined,
        newValue: {
          ...row,
          auditContext: {
            source: "bot_fx_cron",
            sourceUrl: data.sourceUrl,
          },
        },
      },
      tx
    );

    return row;
  });
}

export async function getRecentBotFxRates(limit = 50) {
  return db
    .select()
    .from(fxRatesBot)
    .orderBy(desc(fxRatesBot.rateDate), desc(fxRatesBot.currency))
    .limit(limit);
}

export async function getBotFxRateForValuationDate(data: {
  currency: string;
  valuationDate: string;
  maxAgeDays?: number;
}) {
  const currency = normalizeCurrency(data.currency);
  const [row] = await db
    .select()
    .from(fxRatesBot)
    .where(
      and(
        eq(fxRatesBot.currency, currency),
        lte(fxRatesBot.rateDate, data.valuationDate)
      )
    )
    .orderBy(desc(fxRatesBot.rateDate))
    .limit(1);

  if (!row) return null;
  const maxAgeDays = data.maxAgeDays ?? 5;
  const valuationTime = Date.parse(`${data.valuationDate}T00:00:00.000Z`);
  const rateTime = Date.parse(`${row.rateDate}T00:00:00.000Z`);
  const ageDays = Math.floor((valuationTime - rateTime) / 86_400_000);
  if (!Number.isFinite(ageDays) || ageDays < 0 || ageDays > maxAgeDays) return null;
  return row;
}

export async function getBotFxRateCoverage() {
  const [summary] = await db
    .select({
      rateCount: sql<number>`COUNT(*)::int`,
      currencyCount: sql<number>`COUNT(DISTINCT ${fxRatesBot.currency})::int`,
      earliestRateDate: sql<string | null>`MIN(${fxRatesBot.rateDate})`,
      latestRateDate: sql<string | null>`MAX(${fxRatesBot.rateDate})`,
    })
    .from(fxRatesBot);

  return {
    rateCount: summary?.rateCount ?? 0,
    currencyCount: summary?.currencyCount ?? 0,
    earliestRateDate: summary?.earliestRateDate ?? null,
    latestRateDate: summary?.latestRateDate ?? null,
  };
}
