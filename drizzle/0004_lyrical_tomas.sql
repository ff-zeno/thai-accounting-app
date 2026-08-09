CREATE TABLE "settlement_import_mappings" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"processor" text NOT NULL,
	"mapping" json NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	CONSTRAINT "settlement_import_mappings_org_processor_uniq" UNIQUE("org_id","processor")
);
--> statement-breakpoint
ALTER TABLE "processor_settlements" ADD COLUMN "match_confidence" numeric(5, 4);--> statement-breakpoint
ALTER TABLE "processor_settlements" ADD COLUMN "match_metadata" json;--> statement-breakpoint
ALTER TABLE "processor_settlements" ADD COLUMN "matched_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "settlement_import_mappings" ADD CONSTRAINT "settlement_import_mappings_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;