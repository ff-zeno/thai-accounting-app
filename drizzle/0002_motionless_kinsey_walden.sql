CREATE TABLE "org_ai_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"extraction_model" text,
	"classification_model" text,
	"translation_model" text,
	"monthly_budget_usd" numeric(8, 2),
	"budget_alert_threshold" numeric(3, 2) DEFAULT '0.80',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	CONSTRAINT "org_ai_settings_org_id" UNIQUE("org_id")
);
--> statement-breakpoint
ALTER TABLE "document_files" ADD COLUMN "ai_purpose" text;--> statement-breakpoint
ALTER TABLE "document_files" ADD COLUMN "ai_input_tokens" integer;--> statement-breakpoint
ALTER TABLE "document_files" ADD COLUMN "ai_output_tokens" integer;--> statement-breakpoint
ALTER TABLE "org_ai_settings" ADD CONSTRAINT "org_ai_settings_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "doc_files_org_created" ON "document_files" USING btree ("org_id","created_at");