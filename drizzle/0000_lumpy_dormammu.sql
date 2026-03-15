CREATE TYPE "public"."audit_action" AS ENUM('create', 'update', 'delete', 'void');--> statement-breakpoint
CREATE TYPE "public"."document_direction" AS ENUM('expense', 'income');--> statement-breakpoint
CREATE TYPE "public"."document_status" AS ENUM('draft', 'confirmed', 'partially_paid', 'paid', 'voided');--> statement-breakpoint
CREATE TYPE "public"."document_type" AS ENUM('invoice', 'receipt', 'debit_note', 'credit_note');--> statement-breakpoint
CREATE TYPE "public"."entity_type" AS ENUM('individual', 'company', 'foreign');--> statement-breakpoint
CREATE TYPE "public"."filing_status" AS ENUM('draft', 'filed', 'paid');--> statement-breakpoint
CREATE TYPE "public"."match_type" AS ENUM('exact', 'fuzzy', 'manual', 'ai_suggested');--> statement-breakpoint
CREATE TYPE "public"."matched_by" AS ENUM('auto', 'manual');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('bank_transfer', 'promptpay', 'cheque', 'cash');--> statement-breakpoint
CREATE TYPE "public"."pipeline_status" AS ENUM('uploaded', 'extracting', 'validating', 'validated', 'completed', 'failed_extraction', 'failed_validation');--> statement-breakpoint
CREATE TYPE "public"."reconciliation_status" AS ENUM('unmatched', 'matched', 'partially_matched');--> statement-breakpoint
CREATE TYPE "public"."transaction_type" AS ENUM('debit', 'credit');--> statement-breakpoint
CREATE TYPE "public"."wht_cert_status" AS ENUM('draft', 'issued', 'voided', 'replaced');--> statement-breakpoint
CREATE TYPE "public"."wht_form_type" AS ENUM('pnd3', 'pnd53', 'pnd54');--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"action" "audit_action" NOT NULL,
	"old_value" jsonb,
	"new_value" jsonb,
	"actor_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bank_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"bank_code" text NOT NULL,
	"account_number" text NOT NULL,
	"account_name" text,
	"currency" varchar(3) DEFAULT 'THB',
	"current_balance" numeric(14, 2),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "bank_statements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"bank_account_id" uuid NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"opening_balance" numeric(14, 2),
	"closing_balance" numeric(14, 2),
	"file_url" text,
	"parser_used" text,
	"import_status" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "statements_org_account_period" UNIQUE("org_id","bank_account_id","period_start","period_end")
);
--> statement-breakpoint
CREATE TABLE "document_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"file_url" text NOT NULL,
	"file_type" text,
	"page_number" integer,
	"original_filename" text,
	"pipeline_status" "pipeline_status" DEFAULT 'uploaded' NOT NULL,
	"ai_raw_response" jsonb,
	"ai_model_used" text,
	"ai_cost_tokens" integer,
	"ai_cost_usd" numeric(8, 6),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "document_line_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"description" text,
	"quantity" numeric(10, 4),
	"unit_price" numeric(14, 2),
	"amount" numeric(14, 2),
	"vat_amount" numeric(14, 2),
	"wht_rate" numeric(5, 4),
	"wht_amount" numeric(14, 2),
	"wht_type" text,
	"rd_payment_type_code" text,
	"account_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"vendor_id" uuid,
	"related_document_id" uuid,
	"type" "document_type" NOT NULL,
	"document_number" text,
	"issue_date" date,
	"due_date" date,
	"subtotal" numeric(14, 2),
	"vat_amount" numeric(14, 2),
	"total_amount" numeric(14, 2),
	"currency" varchar(3) DEFAULT 'THB',
	"exchange_rate" numeric(12, 6),
	"total_amount_thb" numeric(14, 2),
	"direction" "document_direction" NOT NULL,
	"status" "document_status" DEFAULT 'draft' NOT NULL,
	"vat_period_year" integer,
	"vat_period_month" integer,
	"ai_confidence" numeric(3, 2),
	"needs_review" boolean DEFAULT true,
	"review_notes" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"name_th" text,
	"tax_id" varchar(13) NOT NULL,
	"branch_number" varchar(5) DEFAULT '00000' NOT NULL,
	"registration_no" text,
	"address" text,
	"address_th" text,
	"is_vat_registered" boolean DEFAULT false,
	"fiscal_year_end_month" integer DEFAULT 12,
	"fiscal_year_end_day" integer DEFAULT 31,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"payment_date" date NOT NULL,
	"gross_amount" numeric(14, 2) NOT NULL,
	"wht_amount_withheld" numeric(14, 2),
	"net_amount_paid" numeric(14, 2) NOT NULL,
	"payment_method" "payment_method",
	"is_ewht" boolean DEFAULT false,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "reconciliation_matches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"transaction_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"payment_id" uuid,
	"matched_amount" numeric(14, 2),
	"match_type" "match_type" NOT NULL,
	"confidence" numeric(3, 2),
	"matched_by" "matched_by" NOT NULL,
	"matched_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "recon_txn_doc" UNIQUE("transaction_id","document_id")
);
--> statement-breakpoint
CREATE TABLE "tax_config" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"value" text NOT NULL,
	"description" text,
	"effective_from" date,
	"effective_to" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	CONSTRAINT "tax_config_key" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"bank_account_id" uuid NOT NULL,
	"statement_id" uuid,
	"date" date NOT NULL,
	"description" text,
	"amount" numeric(14, 2) NOT NULL,
	"type" "transaction_type" NOT NULL,
	"running_balance" numeric(14, 2),
	"reference_no" text,
	"channel" text,
	"counterparty" text,
	"reconciliation_status" "reconciliation_status" DEFAULT 'unmatched',
	"is_petty_cash" boolean DEFAULT false,
	"external_ref" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "txn_dedup" UNIQUE("org_id","bank_account_id","external_ref","date","amount")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"role" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "vat_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"period_year" integer NOT NULL,
	"period_month" integer NOT NULL,
	"output_vat" numeric(14, 2),
	"input_vat_pp30" numeric(14, 2),
	"pp36_reverse_charge" numeric(14, 2),
	"net_vat_payable" numeric(14, 2),
	"pp30_status" "filing_status" DEFAULT 'draft',
	"pp30_deadline" date,
	"pp36_status" "filing_status" DEFAULT 'draft',
	"pp36_deadline" date,
	"nil_filing_required" boolean DEFAULT false,
	"period_locked" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "vat_org_period" UNIQUE("org_id","period_year","period_month")
);
--> statement-breakpoint
CREATE TABLE "vendors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"name_th" text,
	"tax_id" varchar(13),
	"registration_no" text,
	"branch_number" varchar(5),
	"address" text,
	"address_th" text,
	"email" text,
	"payment_terms_days" integer,
	"is_vat_registered" boolean,
	"entity_type" "entity_type" NOT NULL,
	"country" text DEFAULT 'TH',
	"dbd_verified" boolean DEFAULT false,
	"dbd_data" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "vendors_org_tax_branch" UNIQUE("org_id","tax_id","branch_number")
);
--> statement-breakpoint
CREATE TABLE "wht_certificate_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"certificate_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"line_item_id" uuid,
	"base_amount" numeric(14, 2),
	"wht_rate" numeric(5, 4),
	"wht_amount" numeric(14, 2),
	"rd_payment_type_code" text,
	"wht_type" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "wht_certificates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"certificate_no" text NOT NULL,
	"payee_vendor_id" uuid NOT NULL,
	"payment_date" date,
	"total_base_amount" numeric(14, 2),
	"total_wht" numeric(14, 2),
	"form_type" "wht_form_type" NOT NULL,
	"filing_id" uuid,
	"pdf_url" text,
	"status" "wht_cert_status" DEFAULT 'draft' NOT NULL,
	"voided_at" timestamp with time zone,
	"void_reason" text,
	"replacement_cert_id" uuid,
	"issued_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "wht_cert_org_no" UNIQUE("org_id","certificate_no")
);
--> statement-breakpoint
CREATE TABLE "wht_monthly_filings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"period_year" integer NOT NULL,
	"period_month" integer NOT NULL,
	"form_type" "wht_form_type" NOT NULL,
	"total_base_amount" numeric(14, 2),
	"total_wht_amount" numeric(14, 2),
	"status" "filing_status" DEFAULT 'draft' NOT NULL,
	"filing_date" date,
	"deadline" date,
	"period_locked" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "wht_filing_org_period" UNIQUE("org_id","period_year","period_month","form_type")
);
--> statement-breakpoint
CREATE TABLE "wht_rates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_type" text NOT NULL,
	"entity_type" "entity_type" NOT NULL,
	"rd_payment_type_code" text,
	"standard_rate" numeric(5, 4) NOT NULL,
	"ewht_rate" numeric(5, 4),
	"ewht_valid_from" date,
	"ewht_valid_to" date,
	"effective_from" date,
	"effective_to" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "wht_sequence_counters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"form_type" "wht_form_type" NOT NULL,
	"year" integer NOT NULL,
	"next_sequence" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	CONSTRAINT "wht_seq_org_form_year" UNIQUE("org_id","form_type","year")
);
--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_statements" ADD CONSTRAINT "bank_statements_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_statements" ADD CONSTRAINT "bank_statements_bank_account_id_bank_accounts_id_fk" FOREIGN KEY ("bank_account_id") REFERENCES "public"."bank_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_files" ADD CONSTRAINT "document_files_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_files" ADD CONSTRAINT "document_files_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_line_items" ADD CONSTRAINT "document_line_items_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_line_items" ADD CONSTRAINT "document_line_items_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliation_matches" ADD CONSTRAINT "reconciliation_matches_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliation_matches" ADD CONSTRAINT "reconciliation_matches_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliation_matches" ADD CONSTRAINT "reconciliation_matches_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliation_matches" ADD CONSTRAINT "reconciliation_matches_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_bank_account_id_bank_accounts_id_fk" FOREIGN KEY ("bank_account_id") REFERENCES "public"."bank_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_statement_id_bank_statements_id_fk" FOREIGN KEY ("statement_id") REFERENCES "public"."bank_statements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vat_records" ADD CONSTRAINT "vat_records_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wht_certificate_items" ADD CONSTRAINT "wht_certificate_items_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wht_certificate_items" ADD CONSTRAINT "wht_certificate_items_certificate_id_wht_certificates_id_fk" FOREIGN KEY ("certificate_id") REFERENCES "public"."wht_certificates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wht_certificate_items" ADD CONSTRAINT "wht_certificate_items_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wht_certificate_items" ADD CONSTRAINT "wht_certificate_items_line_item_id_document_line_items_id_fk" FOREIGN KEY ("line_item_id") REFERENCES "public"."document_line_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wht_certificates" ADD CONSTRAINT "wht_certificates_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wht_certificates" ADD CONSTRAINT "wht_certificates_payee_vendor_id_vendors_id_fk" FOREIGN KEY ("payee_vendor_id") REFERENCES "public"."vendors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wht_monthly_filings" ADD CONSTRAINT "wht_monthly_filings_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wht_sequence_counters" ADD CONSTRAINT "wht_sequence_counters_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "doc_org_vendor_date" ON "documents" USING btree ("org_id","vendor_id","issue_date");--> statement-breakpoint
CREATE INDEX "doc_org_status" ON "documents" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX "txn_org_date" ON "transactions" USING btree ("org_id","date");--> statement-breakpoint
CREATE INDEX "txn_org_recon_status" ON "transactions" USING btree ("org_id","reconciliation_status");--> statement-breakpoint
CREATE INDEX "txn_org_amount_date" ON "transactions" USING btree ("org_id","amount","date");