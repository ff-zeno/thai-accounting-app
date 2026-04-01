CREATE TABLE "reconciliation_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"priority" integer DEFAULT 100 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_auto_suggested" boolean DEFAULT false NOT NULL,
	"conditions" jsonb NOT NULL,
	"actions" jsonb NOT NULL,
	"match_count" integer DEFAULT 0 NOT NULL,
	"last_matched_at" timestamp with time zone,
	"template_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "recurring_payment_patterns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"vendor_id" uuid,
	"expected_amount" numeric(14, 2),
	"amount_tolerance" numeric(5, 4) DEFAULT '0.0500',
	"expected_day_of_month" integer,
	"day_tolerance" integer DEFAULT 5,
	"counterparty_pattern" text,
	"occurrence_count" integer DEFAULT 0 NOT NULL,
	"last_occurred_at" timestamp with time zone,
	"is_confirmed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "vendor_bank_aliases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"vendor_id" uuid NOT NULL,
	"alias_text" text NOT NULL,
	"alias_type" text DEFAULT 'counterparty' NOT NULL,
	"match_count" integer DEFAULT 1 NOT NULL,
	"is_confirmed" boolean DEFAULT false NOT NULL,
	"source" text DEFAULT 'auto_learn' NOT NULL,
	"last_matched_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "vendor_alias_org_text" UNIQUE("org_id","alias_text","alias_type")
);
--> statement-breakpoint
ALTER TABLE "reconciliation_rules" ADD CONSTRAINT "reconciliation_rules_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_payment_patterns" ADD CONSTRAINT "recurring_payment_patterns_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_payment_patterns" ADD CONSTRAINT "recurring_payment_patterns_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_bank_aliases" ADD CONSTRAINT "vendor_bank_aliases_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_bank_aliases" ADD CONSTRAINT "vendor_bank_aliases_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recon_rules_org_active" ON "reconciliation_rules" USING btree ("org_id","priority");--> statement-breakpoint
CREATE INDEX "vendor_alias_lookup" ON "vendor_bank_aliases" USING btree ("org_id","alias_text");