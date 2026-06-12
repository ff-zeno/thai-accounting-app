-- Effective-dated tax config: allow one row per (key, effective_from) window
-- so rate history survives changes (the 7% VAT window ends 2026-09-30) and
-- back-period filings can resolve the rate in force at the time.
ALTER TABLE "tax_config" DROP CONSTRAINT IF EXISTS "tax_config_key";
ALTER TABLE "tax_config"
  ADD CONSTRAINT "tax_config_key_effective_from" UNIQUE ("key", "effective_from");
