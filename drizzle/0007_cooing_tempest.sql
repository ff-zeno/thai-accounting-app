ALTER TYPE "public"."match_type" ADD VALUE 'reference';--> statement-breakpoint
ALTER TYPE "public"."match_type" ADD VALUE 'multi_signal';--> statement-breakpoint
ALTER TYPE "public"."match_type" ADD VALUE 'pattern';--> statement-breakpoint
ALTER TYPE "public"."match_type" ADD VALUE 'rule';--> statement-breakpoint
ALTER TYPE "public"."matched_by" ADD VALUE 'rule';--> statement-breakpoint
ALTER TYPE "public"."matched_by" ADD VALUE 'pattern';--> statement-breakpoint
ALTER TABLE "reconciliation_matches" ADD COLUMN "match_metadata" jsonb;--> statement-breakpoint
CREATE INDEX "txn_org_counterparty" ON "transactions" USING btree ("org_id","counterparty");--> statement-breakpoint
CREATE INDEX "txn_org_reference" ON "transactions" USING btree ("org_id","reference_no");