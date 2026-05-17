ALTER TABLE "allocation_rules"
  ADD COLUMN IF NOT EXISTS "source_key" text;

CREATE INDEX IF NOT EXISTS "allocation_rules_org_source_key_idx"
  ON "allocation_rules" ("org_id", "source_type", "source_key")
  WHERE "deleted_at" IS NULL;
