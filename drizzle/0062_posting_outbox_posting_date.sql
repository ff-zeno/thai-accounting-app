ALTER TABLE "posting_outbox"
  ADD COLUMN "posting_date" date;
--> statement-breakpoint
UPDATE "posting_outbox"
SET "posting_date" = NULLIF("payload"->>'paymentDate', '')::date
WHERE "payload" ? 'paymentDate'
  AND "payload"->>'paymentDate' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "posting_outbox_posting_date_idx"
  ON "posting_outbox" ("org_id", "posting_status", "posting_date");
