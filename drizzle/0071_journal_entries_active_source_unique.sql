DROP INDEX IF EXISTS "journal_entries_auto_source_uniq";

CREATE UNIQUE INDEX "journal_entries_auto_source_uniq"
  ON "journal_entries" ("org_id", "source_entity_type", "source_entity_id", "posting_kind")
  WHERE "source_entity_type" IS NOT NULL
    AND "source_entity_id" IS NOT NULL
    AND "posting_kind" IS NOT NULL
    AND "reversed_by_entry_id" IS NULL;
