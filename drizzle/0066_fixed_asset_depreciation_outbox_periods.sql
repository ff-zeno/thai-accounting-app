CREATE TABLE IF NOT EXISTS "fixed_asset_depreciation_periods" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "period_year" integer NOT NULL,
  "period_month" integer NOT NULL,
  "schedule_rows_created" integer DEFAULT 0 NOT NULL,
  "posting_outbox_id" uuid REFERENCES "posting_outbox"("id"),
  "journal_entry_id" uuid REFERENCES "journal_entries"("id"),
  "created_by_user_id" text,
  "requested_at" timestamp with time zone DEFAULT now() NOT NULL,
  "posted_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "fixed_asset_depreciation_periods_org_period_uniq" UNIQUE("org_id", "period_year", "period_month"),
  CONSTRAINT "fixed_asset_depreciation_periods_month_check" CHECK ("period_month" BETWEEN 1 AND 12),
  CONSTRAINT "fixed_asset_depreciation_periods_schedule_rows_nonnegative_check" CHECK ("schedule_rows_created" >= 0)
);

CREATE INDEX IF NOT EXISTS "fixed_asset_depreciation_periods_org_period_idx"
  ON "fixed_asset_depreciation_periods" ("org_id", "period_year", "period_month");
