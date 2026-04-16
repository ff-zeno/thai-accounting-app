CREATE TYPE "public"."field_criticality" AS ENUM('low', 'medium', 'high');--> statement-breakpoint
CREATE TYPE "public"."vendor_tier_scope_kind" AS ENUM('org', 'global');--> statement-breakpoint
CREATE TABLE "extraction_exemplars" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"vendor_id" uuid NOT NULL,
	"field_name" text NOT NULL,
	"field_criticality" "field_criticality" NOT NULL,
	"ai_value" text,
	"user_value" text,
	"was_corrected" boolean NOT NULL,
	"document_id" uuid NOT NULL,
	"source_region" jsonb,
	"model_used" text,
	"confidence_at_time" numeric(5, 4),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "extraction_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"vendor_id" uuid,
	"tier_used" smallint NOT NULL,
	"exemplar_ids" uuid[],
	"model_used" text,
	"input_tokens" integer,
	"output_tokens" integer,
	"cost_usd" numeric(12, 8),
	"latency_ms" integer,
	"inngest_idempotency_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "extraction_review_outcome" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"extraction_log_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"user_corrected" boolean NOT NULL,
	"correction_count" integer DEFAULT 0 NOT NULL,
	"reviewed_by_user_id" text NOT NULL,
	"reviewed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "extraction_review_outcome_extraction_log_id_unique" UNIQUE("extraction_log_id")
);
--> statement-breakpoint
CREATE TABLE "vendor_tier" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vendor_id" uuid NOT NULL,
	"scope_kind" "vendor_tier_scope_kind" NOT NULL,
	"org_id" uuid,
	"tier" smallint DEFAULT 0 NOT NULL,
	"docs_processed_total" integer DEFAULT 0 NOT NULL,
	"last_doc_at" timestamp with time zone,
	"last_promoted_at" timestamp with time zone,
	"last_demoted_at" timestamp with time zone,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "extraction_exemplars" ADD CONSTRAINT "extraction_exemplars_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extraction_exemplars" ADD CONSTRAINT "extraction_exemplars_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extraction_exemplars" ADD CONSTRAINT "extraction_exemplars_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extraction_log" ADD CONSTRAINT "extraction_log_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extraction_log" ADD CONSTRAINT "extraction_log_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extraction_log" ADD CONSTRAINT "extraction_log_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extraction_review_outcome" ADD CONSTRAINT "extraction_review_outcome_extraction_log_id_extraction_log_id_fk" FOREIGN KEY ("extraction_log_id") REFERENCES "public"."extraction_log"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extraction_review_outcome" ADD CONSTRAINT "extraction_review_outcome_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extraction_review_outcome" ADD CONSTRAINT "extraction_review_outcome_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_tier" ADD CONSTRAINT "vendor_tier_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_tier" ADD CONSTRAINT "vendor_tier_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_exemplars_unique_active" ON "extraction_exemplars" USING btree ("org_id","vendor_id","field_name","document_id") WHERE "extraction_exemplars"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "idx_exemplars_top_recent" ON "extraction_exemplars" USING btree ("org_id","vendor_id","field_name","created_at") WHERE "extraction_exemplars"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_extraction_log_idempotency" ON "extraction_log" USING btree ("inngest_idempotency_key");--> statement-breakpoint
CREATE INDEX "idx_extraction_log_document" ON "extraction_log" USING btree ("document_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_extraction_log_vendor" ON "extraction_log" USING btree ("vendor_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_vendor_tier_unique_org" ON "vendor_tier" USING btree ("vendor_id","org_id") WHERE "vendor_tier"."scope_kind" = 'org';--> statement-breakpoint
CREATE UNIQUE INDEX "idx_vendor_tier_unique_global" ON "vendor_tier" USING btree ("vendor_id") WHERE "vendor_tier"."scope_kind" = 'global';--> statement-breakpoint
-- HAND-EDITED: CHECK constraint ensuring was_corrected flag is consistent with ai_value vs user_value.
-- If regenerating this migration, this constraint MUST be preserved.
ALTER TABLE "extraction_exemplars" ADD CONSTRAINT "chk_exemplars_was_corrected"
  CHECK (
    (was_corrected = true AND ai_value IS DISTINCT FROM user_value)
    OR (was_corrected = false AND ai_value IS NOT DISTINCT FROM user_value)
  );