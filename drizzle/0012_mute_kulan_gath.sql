CREATE TABLE "ai_batch_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"trigger_type" text NOT NULL,
	"triggered_by" uuid,
	"triggered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" text DEFAULT 'triggered' NOT NULL,
	"completed_at" timestamp with time zone,
	"match_count" integer,
	"cost_usd" numeric(8, 6)
);
--> statement-breakpoint
ALTER TABLE "ai_batch_runs" ADD CONSTRAINT "ai_batch_runs_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_batch_runs" ADD CONSTRAINT "ai_batch_runs_triggered_by_users_id_fk" FOREIGN KEY ("triggered_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_batch_runs_org_trigger" ON "ai_batch_runs" USING btree ("org_id","trigger_type","triggered_at");