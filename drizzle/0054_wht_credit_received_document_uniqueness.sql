CREATE UNIQUE INDEX IF NOT EXISTS "wht_credits_received_unique_doc"
  ON "wht_credits_received" ("org_id", "certificate_received_document_id")
  WHERE "deleted_at" IS NULL AND "certificate_received_document_id" IS NOT NULL;
