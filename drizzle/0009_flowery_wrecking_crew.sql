CREATE TABLE "ai_match_suggestions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"transaction_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"payment_id" uuid,
	"suggested_amount" numeric(14, 2),
	"confidence" numeric(3, 2) NOT NULL,
	"explanation" text,
	"ai_model_used" text,
	"ai_cost_usd" numeric(8, 6),
	"status" text DEFAULT 'pending' NOT NULL,
	"reviewed_at" timestamp with time zone,
	"reviewed_by" uuid,
	"rejection_reason" text,
	"batch_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "ai_suggestion_txn_doc" UNIQUE("transaction_id","document_id")
);
--> statement-breakpoint
ALTER TABLE "org_ai_settings" ADD COLUMN "reconciliation_budget_usd" numeric(8, 2);--> statement-breakpoint
ALTER TABLE "org_ai_settings" ADD COLUMN "reconciliation_model" text;--> statement-breakpoint
ALTER TABLE "ai_match_suggestions" ADD CONSTRAINT "ai_match_suggestions_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_match_suggestions" ADD CONSTRAINT "ai_match_suggestions_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_match_suggestions" ADD CONSTRAINT "ai_match_suggestions_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_match_suggestions" ADD CONSTRAINT "ai_match_suggestions_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_match_suggestions" ADD CONSTRAINT "ai_match_suggestions_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_suggestions_org_status" ON "ai_match_suggestions" USING btree ("org_id","status");