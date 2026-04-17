CREATE TYPE "public"."compiled_pattern_status" AS ENUM('shadow', 'active', 'retired');--> statement-breakpoint
CREATE TABLE "extraction_compiled_patterns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vendor_key" text NOT NULL,
	"scope_kind" "vendor_tier_scope_kind" NOT NULL,
	"org_id" uuid,
	"version" integer NOT NULL,
	"source_ts" text NOT NULL,
	"compiled_js" text NOT NULL,
	"ts_compiler_version" text NOT NULL,
	"ast_hash" text NOT NULL,
	"training_set_hash" text NOT NULL,
	"shadow_accuracy" numeric(5, 4),
	"shadow_sample_size" integer,
	"status" "compiled_pattern_status" DEFAULT 'shadow' NOT NULL,
	"requires_manual_review" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"activated_at" timestamp with time zone,
	"retired_at" timestamp with time zone,
	"retirement_reason" text
);
--> statement-breakpoint
ALTER TABLE "extraction_compiled_patterns" ADD CONSTRAINT "extraction_compiled_patterns_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extraction_compiled_patterns" ADD CONSTRAINT "chk_compiled_pattern_scope" CHECK (
  (scope_kind = 'org' AND org_id IS NOT NULL) OR (scope_kind = 'global' AND org_id IS NULL)
);--> statement-breakpoint
CREATE UNIQUE INDEX "idx_compiled_pattern_active" ON "extraction_compiled_patterns" USING btree ("vendor_key","scope_kind",COALESCE("org_id"::text, 'global')) WHERE "extraction_compiled_patterns"."status" = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "idx_compiled_pattern_version" ON "extraction_compiled_patterns" USING btree ("vendor_key","scope_kind",COALESCE("org_id"::text, 'global'),"version");