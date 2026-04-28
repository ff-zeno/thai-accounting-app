ALTER TABLE "organizations"
  ADD COLUMN IF NOT EXISTS "has_pos_sales" boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE "documents"
  ADD COLUMN IF NOT EXISTS "vat_period_override_reason" text,
  ADD COLUMN IF NOT EXISTS "vat_period_overridden_by_user_id" text,
  ADD COLUMN IF NOT EXISTS "vat_period_overridden_at" timestamptz;
--> statement-breakpoint
ALTER TABLE "wht_certificates"
  ADD COLUMN IF NOT EXISTS "payer_tax_id_snapshot" text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "payer_address_snapshot" text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "payee_address_snapshot" text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "payee_id_number_snapshot" text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "payment_type_description" text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "signatory_name_snapshot" text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "signatory_position_snapshot" text NOT NULL DEFAULT '';
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'wht_certificates_filing_id_wht_monthly_filings_id_fk'
  ) THEN
    ALTER TABLE "wht_certificates"
      ADD CONSTRAINT "wht_certificates_filing_id_wht_monthly_filings_id_fk"
      FOREIGN KEY ("filing_id") REFERENCES "wht_monthly_filings"("id");
  END IF;
END;
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'documents_vat_period_matches_issue_date'
  ) THEN
    ALTER TABLE "documents"
      ADD CONSTRAINT "documents_vat_period_matches_issue_date"
      CHECK (
        "issue_date" IS NULL
        OR "vat_period_year" IS NULL
        OR "vat_period_month" IS NULL
        OR "vat_period_override_reason" IS NOT NULL
        OR (
          "vat_period_year" = EXTRACT(YEAR FROM "issue_date")::integer
          AND "vat_period_month" = EXTRACT(MONTH FROM "issue_date")::integer
        )
      ) NOT VALID;
  END IF;
END;
$$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "exception_queue" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "entity_type" text NOT NULL,
  "entity_id" uuid NOT NULL,
  "exception_type" text NOT NULL,
  "severity" text NOT NULL,
  "summary" text NOT NULL,
  "payload" jsonb,
  "resolved_at" timestamptz,
  "resolution" text,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "exception_queue_org_created"
  ON "exception_queue" ("org_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "exception_queue_org_type"
  ON "exception_queue" ("org_id", "exception_type");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "exception_queue_open_unique"
  ON "exception_queue" ("org_id", "entity_type", "entity_id", "exception_type")
  WHERE "resolved_at" IS NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "wht_annual_threshold_decisions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "payee_vendor_id" uuid NOT NULL REFERENCES "vendors"("id"),
  "document_id" uuid NOT NULL REFERENCES "documents"("id"),
  "line_item_id" uuid REFERENCES "document_line_items"("id"),
  "certificate_id" uuid REFERENCES "wht_certificates"("id"),
  "payment_id" uuid REFERENCES "payments"("id"),
  "tax_year" integer NOT NULL,
  "eligible_base_amount" numeric(14,2) NOT NULL,
  "wht_rate" numeric(5,4) NOT NULL,
  "wht_amount" numeric(14,2) NOT NULL,
  "threshold_status" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "wht_threshold_org_payee_year"
  ON "wht_annual_threshold_decisions" ("org_id", "payee_vendor_id", "tax_year");
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'wht_threshold_line_payment_unique'
  ) THEN
    ALTER TABLE "wht_annual_threshold_decisions"
      ADD CONSTRAINT "wht_threshold_line_payment_unique"
      UNIQUE ("org_id", "line_item_id", "payment_id");
  END IF;
END;
$$;
