ALTER TABLE "org_ai_settings"
  ADD COLUMN IF NOT EXISTS "copilot_provider" text,
  ADD COLUMN IF NOT EXISTS "copilot_model" text,
  ADD COLUMN IF NOT EXISTS "copilot_api_key_secret_ref" text,
  ADD COLUMN IF NOT EXISTS "copilot_api_key_last4" text,
  ADD COLUMN IF NOT EXISTS "copilot_monthly_budget_usd" numeric(8, 2),
  ADD COLUMN IF NOT EXISTS "copilot_live_model_enabled" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "copilot_write_tools_enabled" boolean NOT NULL DEFAULT false;
