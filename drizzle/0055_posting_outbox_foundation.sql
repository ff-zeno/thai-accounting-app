CREATE TABLE IF NOT EXISTS "posting_outbox" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "source_entity_type" text NOT NULL,
  "source_entity_id" uuid NOT NULL,
  "event_type" text NOT NULL,
  "payload" jsonb,
  "posting_status" text NOT NULL DEFAULT 'pending',
  "posting_attempts" integer NOT NULL DEFAULT 0,
  "last_attempt_at" timestamptz,
  "last_error" text,
  "journal_entry_id" uuid REFERENCES "journal_entries"("id"),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "posting_outbox_source_event_uniq"
  ON "posting_outbox" ("org_id", "source_entity_type", "source_entity_id", "event_type");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "posting_outbox_pending_idx"
  ON "posting_outbox" ("org_id", "posting_status", "created_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "posting_exceptions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "posting_outbox_id" uuid NOT NULL REFERENCES "posting_outbox"("id"),
  "source_entity_type" text NOT NULL,
  "source_entity_id" uuid NOT NULL,
  "failure_class" text NOT NULL DEFAULT 'unknown',
  "message" text NOT NULL,
  "resolved_at" timestamptz,
  "resolution" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "posting_exceptions_open_outbox_uniq"
  ON "posting_exceptions" ("org_id", "posting_outbox_id")
  WHERE "resolved_at" IS NULL;
