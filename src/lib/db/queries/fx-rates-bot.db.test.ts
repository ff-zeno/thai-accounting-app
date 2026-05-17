import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import * as schema from "@/lib/db/schema";
import {
  createTestDb,
  createTestOrg,
  migrateTestDb,
  resetTestDb,
} from "@/tests/db-test-utils";

const { db: testDb, pool } = createTestDb();
let recordBotFxRate: typeof import("./fx-rates-bot").recordBotFxRate;
let upsertBotFxRateFromSource: typeof import("./fx-rates-bot").upsertBotFxRateFromSource;
let getRecentBotFxRates: typeof import("./fx-rates-bot").getRecentBotFxRates;
let getBotFxRateForValuationDate: typeof import("./fx-rates-bot").getBotFxRateForValuationDate;
let getBotFxRateCoverage: typeof import("./fx-rates-bot").getBotFxRateCoverage;

beforeAll(async () => {
  await resetTestDb(pool);
  await migrateTestDb(pool);
  vi.doMock("../index", () => ({ db: testDb }));
  ({
    recordBotFxRate,
    upsertBotFxRateFromSource,
    getRecentBotFxRates,
    getBotFxRateForValuationDate,
    getBotFxRateCoverage,
  } = await import("./fx-rates-bot"));
});

afterAll(async () => {
  await resetTestDb(pool);
  await pool.end();
});

beforeEach(async () => {
  await testDb.execute(sql`
    TRUNCATE TABLE
      audit_log,
      fx_rates_bot,
      organizations
    CASCADE
  `);
});

describe("BOT FX rates", () => {
  it("upserts daily rates by date and currency", async () => {
    const org = await createTestOrg(testDb);
    await recordBotFxRate({
      auditOrgId: org.id,
      rateDate: "2026-05-15",
      currency: "usd",
      buyingRate: "36.10000000",
      sellingRate: "36.30000000",
      midRate: "36.20000000",
      sourceUrl: "https://portal.api.bot.or.th/portal/catalogue-products/exchange-rates-1",
      fetchedAt: new Date("2026-05-16T00:00:00.000Z"),
    });
    await recordBotFxRate({
      auditOrgId: org.id,
      rateDate: "2026-05-15",
      currency: "USD",
      buyingRate: "36.15000000",
      sellingRate: "36.35000000",
      midRate: "36.25000000",
      sourceUrl: "https://portal.api.bot.or.th/portal/catalogue-products/exchange-rates-1",
      fetchedAt: new Date("2026-05-16T01:00:00.000Z"),
    });

    const rows = await getRecentBotFxRates();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      rateDate: "2026-05-15",
      currency: "USD",
      midRate: "36.25000000",
      buyingRate: "36.15000000",
      sellingRate: "36.35000000",
    });
    const auditRows = await testDb.select().from(schema.auditLog);
    expect(auditRows).toHaveLength(2);
    expect(auditRows.map((row) => row.action)).toEqual(["create", "update"]);
  });

  it("returns the latest available rate on or before valuation date", async () => {
    const org = await createTestOrg(testDb);
    await recordBotFxRate({
      auditOrgId: org.id,
      rateDate: "2026-05-14",
      currency: "JPY",
      midRate: "0.24000000",
      sourceUrl: "https://portal.api.bot.or.th/portal/catalogue-products/exchange-rates-1",
    });
    await recordBotFxRate({
      auditOrgId: org.id,
      rateDate: "2026-05-16",
      currency: "JPY",
      midRate: "0.25000000",
      sourceUrl: "https://portal.api.bot.or.th/portal/catalogue-products/exchange-rates-1",
    });

    const rate = await getBotFxRateForValuationDate({
      currency: "JPY",
      valuationDate: "2026-05-15",
    });

    expect(rate?.rateDate).toBe("2026-05-14");
    expect(rate?.midRate).toBe("0.24000000");
  });

  it("summarizes rate coverage", async () => {
    const org = await createTestOrg(testDb);
    await recordBotFxRate({
      auditOrgId: org.id,
      rateDate: "2026-05-14",
      currency: "USD",
      midRate: "36.20000000",
      sourceUrl: "https://portal.api.bot.or.th/portal/catalogue-products/exchange-rates-1",
    });
    await recordBotFxRate({
      auditOrgId: org.id,
      rateDate: "2026-05-15",
      currency: "EUR",
      midRate: "39.20000000",
      sourceUrl: "https://portal.api.bot.or.th/portal/catalogue-products/exchange-rates-1",
    });

    expect(await getBotFxRateCoverage()).toMatchObject({
      rateCount: 2,
      currencyCount: 2,
      earliestRateDate: "2026-05-14",
      latestRateDate: "2026-05-15",
    });
  });

  it("does not wipe buying or selling rates on partial mid-rate correction", async () => {
    const org = await createTestOrg(testDb);
    await recordBotFxRate({
      auditOrgId: org.id,
      rateDate: "2026-05-15",
      currency: "USD",
      buyingRate: "36.10000000",
      sellingRate: "36.30000000",
      midRate: "36.20000000",
      sourceUrl: "https://portal.api.bot.or.th/portal/catalogue-products/exchange-rates-1",
    });
    await recordBotFxRate({
      auditOrgId: org.id,
      rateDate: "2026-05-15",
      currency: "USD",
      midRate: "36.22000000",
      sourceUrl: "https://portal.api.bot.or.th/portal/catalogue-products/exchange-rates-1",
    });

    const [row] = await getRecentBotFxRates();
    expect(row).toMatchObject({
      buyingRate: "36.10000000",
      sellingRate: "36.30000000",
      midRate: "36.22000000",
    });
  });

  it("upserts source-fetched rates with audit rows", async () => {
    const org = await createTestOrg(testDb);
    await upsertBotFxRateFromSource({
      auditOrgId: org.id,
      rateDate: "2026-05-15",
      currency: "sgd",
      buyingRate: "26.65000000",
      midRate: "26.70000000",
      sourceUrl: "https://portal.api.bot.or.th/portal/catalogue-products/exchange-rates-1",
    });
    await upsertBotFxRateFromSource({
      auditOrgId: org.id,
      rateDate: "2026-05-15",
      currency: "SGD",
      sellingRate: "26.76000000",
      midRate: "26.71000000",
      sourceUrl: "https://portal.api.bot.or.th/portal/catalogue-products/exchange-rates-1",
    });

    const rows = await getRecentBotFxRates();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      currency: "SGD",
      buyingRate: "26.65000000",
      sellingRate: "26.76000000",
      midRate: "26.71000000",
    });
    const auditRows = await testDb.select().from(schema.auditLog);
    expect(auditRows).toHaveLength(2);
    expect(auditRows.map((row) => row.action)).toEqual(["create", "update"]);
  });

  it("does not return stale rates for valuation", async () => {
    const org = await createTestOrg(testDb);
    await recordBotFxRate({
      auditOrgId: org.id,
      rateDate: "2026-05-01",
      currency: "USD",
      midRate: "36.20000000",
      sourceUrl: "https://portal.api.bot.or.th/portal/catalogue-products/exchange-rates-1",
    });

    await expect(getBotFxRateForValuationDate({
      currency: "USD",
      valuationDate: "2026-05-31",
    })).resolves.toBeNull();
  });
});
