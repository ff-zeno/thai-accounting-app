ALTER TABLE "vat_input_items" DROP CONSTRAINT IF EXISTS "vat_input_establishment_null_check";
ALTER TABLE "vat_output_items" DROP CONSTRAINT IF EXISTS "vat_output_establishment_null_check";
ALTER TABLE "vat_filings" DROP CONSTRAINT IF EXISTS "vat_filings_establishment_null_check";
ALTER TABLE "vat_credit_carryforwards" DROP CONSTRAINT IF EXISTS "vat_credit_carryforward_establishment_null_check";

ALTER TABLE "vat_input_items"
  ADD CONSTRAINT "vat_input_claimable_establishment_check"
  CHECK (
    "status" NOT IN ('claimable', 'allocated_to_draft', 'filed')
    OR "establishment_id" IS NOT NULL
  );

ALTER TABLE "vat_output_items"
  ADD CONSTRAINT "vat_output_reportable_establishment_check"
  CHECK (
    "status" NOT IN ('reportable', 'allocated_to_draft', 'filed')
    OR "establishment_id" IS NOT NULL
  );

ALTER TABLE "vat_filings"
  ADD CONSTRAINT "vat_filings_pp30_establishment_check"
  CHECK (
    "filing_type" <> 'pp30'
    OR "filing_kind" <> 'ordinary'
    OR "establishment_id" IS NOT NULL
  );

ALTER TABLE "vat_credit_carryforwards"
  ADD CONSTRAINT "vat_credit_carryforward_establishment_check"
  CHECK ("establishment_id" IS NOT NULL);

CREATE INDEX IF NOT EXISTS "vat_input_items_org_establishment_period"
  ON "vat_input_items" ("org_id", "establishment_id", "eligible_period_year", "eligible_period_month", "status")
  WHERE "deleted_at" IS NULL;

CREATE INDEX IF NOT EXISTS "vat_output_items_org_establishment_period"
  ON "vat_output_items" ("org_id", "establishment_id", "output_period_year", "output_period_month", "status")
  WHERE "deleted_at" IS NULL;

CREATE INDEX IF NOT EXISTS "vat_carryforwards_org_establishment_available"
  ON "vat_credit_carryforwards" ("org_id", "establishment_id", "status");
