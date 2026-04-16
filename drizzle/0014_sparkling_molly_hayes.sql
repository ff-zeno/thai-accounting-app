CREATE TYPE "public"."consensus_status" AS ENUM('candidate', 'shadow_pending', 'promoted', 'retired');--> statement-breakpoint
CREATE TABLE "exemplar_consensus" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vendor_key" varchar(13) NOT NULL,
	"field_name" text NOT NULL,
	"normalized_value" text NOT NULL,
	"normalized_value_hash" text NOT NULL,
	"field_criticality" "field_criticality" NOT NULL,
	"weighted_org_count" numeric(8, 4) DEFAULT '0' NOT NULL,
	"agreeing_org_count" integer DEFAULT 0 NOT NULL,
	"contradicting_count" integer DEFAULT 0 NOT NULL,
	"status" "consensus_status" DEFAULT 'candidate' NOT NULL,
	"promoted_at" timestamp with time zone,
	"retired_at" timestamp with time zone,
	"recomputed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "global_exemplar_pool" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vendor_key" varchar(13) NOT NULL,
	"field_name" text NOT NULL,
	"canonical_value" text NOT NULL,
	"field_criticality" "field_criticality" NOT NULL,
	"consensus_id" uuid NOT NULL,
	"promoted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"retired_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "org_reputation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"score" numeric(5, 4) DEFAULT '1.0' NOT NULL,
	"corrections_total" integer DEFAULT 0 NOT NULL,
	"corrections_agreed" integer DEFAULT 0 NOT NULL,
	"corrections_disputed" integer DEFAULT 0 NOT NULL,
	"first_doc_at" timestamp with time zone,
	"docs_processed" integer DEFAULT 0 NOT NULL,
	"eligible" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone,
	CONSTRAINT "org_reputation_org_id_unique" UNIQUE("org_id"),
	CONSTRAINT "org_reputation_score_range" CHECK ("score" >= 0 AND "score" <= 5)
);
--> statement-breakpoint
ALTER TABLE "extraction_exemplars" ADD COLUMN "vendor_tax_id" varchar(13);--> statement-breakpoint
ALTER TABLE "global_exemplar_pool" ADD CONSTRAINT "global_exemplar_pool_consensus_id_exemplar_consensus_id_fk" FOREIGN KEY ("consensus_id") REFERENCES "public"."exemplar_consensus"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_reputation" ADD CONSTRAINT "org_reputation_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_consensus_unique_value" ON "exemplar_consensus" USING btree ("vendor_key","field_name","normalized_value_hash");--> statement-breakpoint
CREATE INDEX "idx_consensus_promotion_lookup" ON "exemplar_consensus" USING btree ("status","vendor_key","field_name");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_global_pool_active_field" ON "global_exemplar_pool" USING btree ("vendor_key","field_name") WHERE "global_exemplar_pool"."retired_at" IS NULL;--> statement-breakpoint
CREATE INDEX "idx_global_pool_vendor_active" ON "global_exemplar_pool" USING btree ("vendor_key") WHERE "global_exemplar_pool"."retired_at" IS NULL;--> statement-breakpoint
CREATE INDEX "idx_exemplars_by_vendor_tax_id" ON "extraction_exemplars" USING btree ("vendor_tax_id","field_name") WHERE "extraction_exemplars"."was_corrected" = true AND "extraction_exemplars"."deleted_at" IS NULL AND "extraction_exemplars"."vendor_tax_id" IS NOT NULL;