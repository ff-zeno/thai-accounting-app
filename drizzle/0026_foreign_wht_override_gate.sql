ALTER TABLE "wht_certificates"
  ADD COLUMN IF NOT EXISTS "rate_below_default_acknowledged_by_user_id" text,
  ADD COLUMN IF NOT EXISTS "rate_below_default_acknowledged_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "rate_below_default_statutory_rate" numeric(5,4),
  ADD COLUMN IF NOT EXISTS "rate_below_default_selected_rate" numeric(5,4),
  ADD COLUMN IF NOT EXISTS "rate_below_default_rationale" text,
  ADD COLUMN IF NOT EXISTS "rate_below_default_accountant_note" text;
