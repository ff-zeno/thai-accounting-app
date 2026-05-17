ALTER TABLE "posting_outbox"
  ADD CONSTRAINT "posting_outbox_status_check"
  CHECK ("posting_status" IN ('pending', 'posted', 'failed', 'retrying'));
--> statement-breakpoint
ALTER TABLE "posting_exceptions"
  ADD CONSTRAINT "posting_exceptions_failure_class_check"
  CHECK ("failure_class" IN ('unknown', 'unmapped_account', 'invalid_source', 'db_error'));
--> statement-breakpoint
DROP INDEX IF EXISTS "posting_outbox_pending_idx";
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "posting_outbox_pending_idx"
  ON "posting_outbox" ("org_id", "posting_status", "created_at")
  WHERE "posting_status" IN ('pending', 'failed', 'retrying');
