ALTER TABLE "cit_filings"
  DROP CONSTRAINT IF EXISTS "cit_filings_org_year_type_amendment_uniq";

CREATE UNIQUE INDEX IF NOT EXISTS "cit_filings_non_amendment_uniq"
ON "cit_filings" ("org_id", "tax_year", "filing_type")
WHERE "is_amendment" = false AND "amends_filing_id" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "cit_filings_amendment_uniq"
ON "cit_filings" ("org_id", "tax_year", "filing_type", "amends_filing_id")
WHERE "is_amendment" = true AND "amends_filing_id" IS NOT NULL;
