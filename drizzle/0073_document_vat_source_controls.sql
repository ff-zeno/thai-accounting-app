ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "vat_treatment" text;
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "vat_rate" numeric(5, 4);
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "vat_establishment_id" uuid REFERENCES "establishments"("id");

ALTER TABLE "documents" ADD CONSTRAINT "documents_vat_treatment_check"
  CHECK (
    "vat_treatment" IS NULL
    OR "vat_treatment" IN ('no_vat', 'input_vat', 'output_vat', 'exempt', 'not_claimable', 'pp36')
  );

ALTER TABLE "documents" ADD CONSTRAINT "documents_vat_rate_range_check"
  CHECK ("vat_rate" IS NULL OR ("vat_rate" >= 0 AND "vat_rate" <= 1));

CREATE INDEX IF NOT EXISTS "doc_org_vat_branch"
  ON "documents" ("org_id", "vat_establishment_id", "vat_treatment");
