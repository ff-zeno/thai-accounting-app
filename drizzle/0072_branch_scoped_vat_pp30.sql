ALTER TABLE "vat_input_items" DROP CONSTRAINT IF EXISTS "vat_input_establishment_null_check";
ALTER TABLE "vat_output_items" DROP CONSTRAINT IF EXISTS "vat_output_establishment_null_check";
ALTER TABLE "vat_filings" DROP CONSTRAINT IF EXISTS "vat_filings_establishment_null_check";
ALTER TABLE "vat_credit_carryforwards" DROP CONSTRAINT IF EXISTS "vat_credit_carryforward_establishment_null_check";

-- Backfill: every pre-existing row has establishment_id NULL (the dropped
-- checks above enforced exactly that), so the NOT NULL checks below would
-- fail on any database with live VAT data. Resolve each org's establishment
-- (vat-registered head office first); create a head office for orgs that
-- have affected rows but no establishments yet. Soft-deleted rows are
-- included on purpose — CHECK constraints apply to them too.
INSERT INTO "establishments" ("org_id", "branch_number", "is_head_office", "vat_registered")
SELECT o."id", '00000', true, true
FROM "organizations" o
WHERE NOT EXISTS (SELECT 1 FROM "establishments" e WHERE e."org_id" = o."id")
  AND (
    EXISTS (
      SELECT 1 FROM "vat_input_items" v
      WHERE v."org_id" = o."id" AND v."establishment_id" IS NULL
        AND v."status" IN ('claimable', 'allocated_to_draft', 'filed')
    )
    OR EXISTS (
      SELECT 1 FROM "vat_output_items" v
      WHERE v."org_id" = o."id" AND v."establishment_id" IS NULL
        AND v."status" IN ('reportable', 'allocated_to_draft', 'filed')
    )
    OR EXISTS (
      SELECT 1 FROM "vat_filings" v
      WHERE v."org_id" = o."id" AND v."establishment_id" IS NULL
        AND v."filing_type" = 'pp30' AND v."filing_kind" = 'ordinary'
    )
    OR EXISTS (
      SELECT 1 FROM "vat_credit_carryforwards" v
      WHERE v."org_id" = o."id" AND v."establishment_id" IS NULL
    )
  );

UPDATE "vat_input_items" t
SET "establishment_id" = (
  SELECT e."id" FROM "establishments" e
  WHERE e."org_id" = t."org_id"
  ORDER BY (e."deleted_at" IS NULL) DESC, e."vat_registered" DESC,
    e."is_head_office" DESC, e."created_at" ASC
  LIMIT 1
)
WHERE t."establishment_id" IS NULL
  AND t."status" IN ('claimable', 'allocated_to_draft', 'filed');

UPDATE "vat_output_items" t
SET "establishment_id" = (
  SELECT e."id" FROM "establishments" e
  WHERE e."org_id" = t."org_id"
  ORDER BY (e."deleted_at" IS NULL) DESC, e."vat_registered" DESC,
    e."is_head_office" DESC, e."created_at" ASC
  LIMIT 1
)
WHERE t."establishment_id" IS NULL
  AND t."status" IN ('reportable', 'allocated_to_draft', 'filed');

UPDATE "vat_filings" t
SET "establishment_id" = (
  SELECT e."id" FROM "establishments" e
  WHERE e."org_id" = t."org_id"
  ORDER BY (e."deleted_at" IS NULL) DESC, e."vat_registered" DESC,
    e."is_head_office" DESC, e."created_at" ASC
  LIMIT 1
)
WHERE t."establishment_id" IS NULL
  AND t."filing_type" = 'pp30' AND t."filing_kind" = 'ordinary';

UPDATE "vat_credit_carryforwards" t
SET "establishment_id" = (
  SELECT e."id" FROM "establishments" e
  WHERE e."org_id" = t."org_id"
  ORDER BY (e."deleted_at" IS NULL) DESC, e."vat_registered" DESC,
    e."is_head_office" DESC, e."created_at" ASC
  LIMIT 1
)
WHERE t."establishment_id" IS NULL;

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
