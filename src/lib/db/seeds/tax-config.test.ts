import { describe, expect, it } from "vitest";
import { taxConfigSeedData } from "./tax-config";

/**
 * Seed-freshness forcing function.
 *
 * Every tax_config key must have seed coverage extending at least 60 days
 * past today. The 7% VAT window ends 2026-09-30 (royal decree), so this test
 * STARTS FAILING around early August 2026 — that is intentional. Do NOT fix
 * it by deleting the assertion or the row: extend coverage by ADDING a new
 * effective-dated row for the post-decree rate (keep the old row — history
 * must survive for back-period filings).
 */
describe("tax config seed freshness", () => {
  const horizon = new Date();
  horizon.setDate(horizon.getDate() + 60);
  const horizonIso = horizon.toISOString().split("T")[0];

  const keys = [...new Set(taxConfigSeedData.map((row) => row.key))];

  it("covers every key at least 60 days out", () => {
    for (const key of keys) {
      const rows = taxConfigSeedData.filter((row) => row.key === key);
      const coversHorizon = rows.some(
        (row) => row.effectiveTo === null || row.effectiveTo >= horizonIso
      );
      expect(
        coversHorizon,
        `tax_config key "${key}" has no seed row covering ${horizonIso} — ` +
          `add a new effective-dated row (see test docblock; do not delete history)`
      ).toBe(true);
    }
  });

  it("keeps one row per (key, effectiveFrom) — matches the unique constraint", () => {
    const seen = new Set<string>();
    for (const row of taxConfigSeedData) {
      const id = `${row.key}@${row.effectiveFrom}`;
      expect(seen.has(id), `duplicate seed row ${id}`).toBe(false);
      seen.add(id);
    }
  });
});
