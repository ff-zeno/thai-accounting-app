ALTER TABLE "close_checklists"
  ADD COLUMN IF NOT EXISTS "closed_at" timestamp with time zone;

UPDATE "close_checklists"
SET "closed_at" = "updated_at"
WHERE "status" = 'closed'
  AND "closed_at" IS NULL;
