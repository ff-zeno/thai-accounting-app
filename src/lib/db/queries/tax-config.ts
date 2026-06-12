import { and, desc, eq, gte, isNull, lte, or, sql } from "drizzle-orm";
import type { DbConnection } from "../index";
import { taxConfig } from "../schema";
import {
  DEFAULT_TAX_CONFIG,
  formatBangkokDate,
  type TaxConfigValues,
} from "@/lib/tax/filing-deadlines";

/**
 * Runtime reads for the effective-dated `tax_config` system table.
 *
 * Intentionally NOT org-scoped: tax_config holds Thai statutory values (VAT
 * rate, filing deadline days) that apply to every tenant identically — there
 * is no org_id column. The CLAUDE.md org-scoping rule covers tenant data.
 *
 * Resolution order per key:
 *   1. row whose [effective_from, effective_to] window contains `onDate`
 *      (open-ended bounds count as ±infinity)
 *   2. latest row for the key regardless of window (warn once — the seed
 *      window has lapsed and needs a royal-decree update)
 *   3. hard-coded defaults (DEFAULT_TAX_CONFIG / 7% VAT) as last resort
 */

const CACHE_TTL_MS = 5 * 60 * 1000;

type CacheEntry = { value: string | null; expiresAt: number };
const cache = new Map<string, CacheEntry>();
const warnedKeys = new Set<string>();

export function clearTaxConfigCache() {
  cache.clear();
  warnedKeys.clear();
}

function bangkokToday(): string {
  return formatBangkokDate(new Date());
}

async function readConfigRow(
  key: string,
  onDate: string,
  tx?: DbConnection
): Promise<string | null> {
  // Lazy import keeps this module loadable without DATABASE_URL (the db
  // integration tests run against their own pool and pass tx) — same pattern
  // as the other query modules that are imported transitively in tests.
  const conn = tx ?? (await import("../index")).db;
  const [inWindow] = await conn
    .select({ value: taxConfig.value })
    .from(taxConfig)
    .where(
      and(
        eq(taxConfig.key, key),
        or(isNull(taxConfig.effectiveFrom), lte(taxConfig.effectiveFrom, onDate)),
        or(isNull(taxConfig.effectiveTo), gte(taxConfig.effectiveTo, onDate))
      )
    )
    .orderBy(desc(sql`COALESCE(${taxConfig.effectiveFrom}, '0001-01-01')`))
    .limit(1);
  if (inWindow) return inWindow.value;

  const [latest] = await conn
    .select({ value: taxConfig.value })
    .from(taxConfig)
    .where(eq(taxConfig.key, key))
    .orderBy(desc(sql`COALESCE(${taxConfig.effectiveFrom}, '0001-01-01')`))
    .limit(1);
  if (latest) {
    if (!warnedKeys.has(key)) {
      warnedKeys.add(key);
      console.warn(
        `[tax-config] No effective window covers ${onDate} for "${key}" — ` +
          `falling back to the latest row. The seed likely needs a new ` +
          `effective-dated entry (royal decree update).`
      );
    }
    return latest.value;
  }
  return null;
}

/**
 * Raw config value for a key as of `onDate` (Bangkok today by default).
 * Returns null when the key has no rows at all.
 */
export async function getTaxConfigValue(
  key: string,
  onDate?: string,
  tx?: DbConnection
): Promise<string | null> {
  const date = onDate ?? bangkokToday();
  const cacheKey = `${key}@${date}`;
  const hit = cache.get(cacheKey);
  if (hit && hit.expiresAt > Date.now()) return hit.value;

  const value = await readConfigRow(key, date, tx);
  cache.set(cacheKey, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  return value;
}

/**
 * VAT rate as a NUMERIC(5,4) string ("0.0700") effective on `onDate`.
 * Falls back to the statutory 7% when the table is empty.
 */
export async function getVatRate(
  onDate?: string,
  tx?: DbConnection
): Promise<string> {
  const raw = await getTaxConfigValue("vat_rate", onDate, tx);
  if (raw === null) return "0.0700";
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    console.warn(`[tax-config] Malformed vat_rate "${raw}" — using 0.0700`);
    return "0.0700";
  }
  return parsed.toFixed(4);
}

const DEADLINE_KEYS: Record<keyof TaxConfigValues, string> = {
  whtPaperDeadlineDay: "wht_paper_deadline_day",
  whtEfilingDeadlineDay: "wht_efiling_deadline_day",
  pp30EfilingDeadlineDay: "pp30_efiling_deadline_day",
  pp36DeadlineDay: "pp36_deadline_day",
};

/**
 * Filing-deadline day-of-month config effective on `onDate`. Any key the
 * table cannot resolve falls back to DEFAULT_TAX_CONFIG.
 */
export async function getFilingDeadlineConfig(
  onDate?: string,
  tx?: DbConnection
): Promise<TaxConfigValues> {
  const resolved = { ...DEFAULT_TAX_CONFIG };
  for (const field of Object.keys(DEADLINE_KEYS) as Array<keyof TaxConfigValues>) {
    const raw = await getTaxConfigValue(DEADLINE_KEYS[field], onDate, tx);
    if (raw === null) continue;
    const day = Number(raw);
    if (Number.isInteger(day) && day >= 1 && day <= 31) {
      resolved[field] = day;
    } else {
      console.warn(
        `[tax-config] Malformed ${DEADLINE_KEYS[field]} "${raw}" — using default ${resolved[field]}`
      );
    }
  }
  return resolved;
}
