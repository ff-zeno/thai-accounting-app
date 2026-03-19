-- ⚠️  DEV ONLY: Steps 2-3 hard-delete soft-deleted data for a clean slate.
-- Review before running in production — financial records should remain soft-deleted.

-- Step 1: Drop the old txn_dedup constraint (non-partial — blocks re-import after soft-delete)
ALTER TABLE "transactions" DROP CONSTRAINT "txn_dedup";--> statement-breakpoint

-- Step 2: Hard-delete all soft-deleted data. These rows are invisible to users
-- but still occupy unique constraints and FK references. Clean slate.
DELETE FROM "reconciliation_matches" WHERE "deleted_at" IS NOT NULL;--> statement-breakpoint
DELETE FROM "transactions" WHERE "deleted_at" IS NOT NULL;--> statement-breakpoint
DELETE FROM "bank_statements" WHERE "deleted_at" IS NOT NULL;--> statement-breakpoint

-- Step 3: Also hard-delete orphan active statements (no live transactions linked)
DELETE FROM "bank_statements"
WHERE "deleted_at" IS NULL
  AND "id" NOT IN (
    SELECT DISTINCT "statement_id" FROM "transactions"
    WHERE "statement_id" IS NOT NULL AND "deleted_at" IS NULL
  );--> statement-breakpoint

-- Step 4: Create partial unique index — only non-deleted rows participate in dedup
CREATE UNIQUE INDEX "txn_dedup" ON "transactions" ("org_id", "bank_account_id", "external_ref", "date", "amount") WHERE "deleted_at" IS NULL;
