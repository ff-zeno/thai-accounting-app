ALTER TABLE "bank_statements" DROP CONSTRAINT "statements_org_account_period";--> statement-breakpoint
CREATE INDEX "stmt_org_account" ON "bank_statements" USING btree ("org_id","bank_account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "stmt_org_account_period_active" ON "bank_statements" ("org_id","bank_account_id","period_start","period_end") WHERE "deleted_at" IS NULL;