CREATE TABLE "period_locks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"establishment_id" uuid,
	"domain" text NOT NULL,
	"period_year" integer NOT NULL,
	"period_month" integer,
	"locked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_by_user_id" text NOT NULL,
	"lock_reason" text NOT NULL,
	"unlocked_at" timestamp with time zone,
	"unlocked_by_user_id" text,
	"unlock_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "period_locks" ADD CONSTRAINT "period_locks_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "period_locks" ADD CONSTRAINT "period_locks_period_month_check" CHECK ("period_month" IS NULL OR ("period_month" >= 1 AND "period_month" <= 12));
--> statement-breakpoint
CREATE UNIQUE INDEX "period_locks_active_uniq" ON "period_locks" USING btree (
	"org_id",
	COALESCE("establishment_id", '00000000-0000-0000-0000-000000000000'::uuid),
	"domain",
	"period_year",
	COALESCE("period_month", 0)
) WHERE "period_locks"."unlocked_at" IS NULL;
--> statement-breakpoint
CREATE INDEX "period_locks_lookup" ON "period_locks" USING btree ("org_id","domain","period_year","period_month") WHERE "unlocked_at" IS NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "vendors_id_org_uniq" ON "vendors" USING btree ("id","org_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "documents_id_org_uniq" ON "documents" USING btree ("id","org_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "transactions_id_org_uniq" ON "transactions" USING btree ("id","org_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "payments_id_org_uniq" ON "payments" USING btree ("id","org_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "bank_accounts_id_org_uniq" ON "bank_accounts" USING btree ("id","org_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "bank_statements_id_org_uniq" ON "bank_statements" USING btree ("id","org_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "wht_certificates_id_org_uniq" ON "wht_certificates" USING btree ("id","org_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "wht_monthly_filings_id_org_uniq" ON "wht_monthly_filings" USING btree ("id","org_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "document_line_items_id_org_uniq" ON "document_line_items" USING btree ("id","org_id");
--> statement-breakpoint
CREATE OR REPLACE FUNCTION enforce_same_org_reference()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  referenced_org_id uuid;
  referenced_id uuid;
BEGIN
  referenced_id := (to_jsonb(NEW) ->> TG_ARGV[1])::uuid;

  IF referenced_id IS NULL THEN
    RETURN NEW;
  END IF;

  EXECUTE format('SELECT org_id FROM %I WHERE id = $1', TG_ARGV[0])
    INTO referenced_org_id
    USING referenced_id;

  IF referenced_org_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF referenced_org_id <> NEW.org_id THEN
    RAISE EXCEPTION 'cross-org reference rejected: %.% references % % from another org',
      TG_TABLE_NAME, TG_ARGV[1], TG_ARGV[0], referenced_id
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION check_period_lock(
  p_org_id uuid,
  p_establishment_id uuid,
  p_domain text,
  p_period_year integer,
  p_period_month integer
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  override_user_id text;
  locked boolean;
BEGIN
  IF p_org_id IS NULL OR p_domain IS NULL OR p_period_year IS NULL THEN
    RETURN;
  END IF;

  override_user_id := NULLIF(current_setting('app.lock_override_user_id', true), '');
  IF override_user_id IS NOT NULL THEN
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM period_locks
    WHERE org_id = p_org_id
      AND COALESCE(establishment_id, '00000000-0000-0000-0000-000000000000'::uuid)
        = COALESCE(p_establishment_id, '00000000-0000-0000-0000-000000000000'::uuid)
      AND domain = p_domain
      AND period_year = p_period_year
      AND COALESCE(period_month, 0) = COALESCE(p_period_month, 0)
      AND unlocked_at IS NULL
  ) INTO locked;

  IF locked THEN
    RAISE EXCEPTION 'period is locked: org %, domain %, period %-%',
      p_org_id, p_domain, p_period_year, COALESCE(p_period_month::text, 'annual')
      USING ERRCODE = '23514';
  END IF;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION guard_documents_vat_period_lock()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  row_data record;
  lock_year integer;
  lock_month integer;
BEGIN
  row_data := CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  lock_year := COALESCE(row_data.vat_period_year, EXTRACT(YEAR FROM row_data.issue_date)::integer);
  lock_month := COALESCE(row_data.vat_period_month, EXTRACT(MONTH FROM row_data.issue_date)::integer);
  PERFORM check_period_lock(row_data.org_id, NULL, 'vat', lock_year, lock_month);

  IF TG_OP = 'UPDATE' THEN
    lock_year := COALESCE(OLD.vat_period_year, EXTRACT(YEAR FROM OLD.issue_date)::integer);
    lock_month := COALESCE(OLD.vat_period_month, EXTRACT(MONTH FROM OLD.issue_date)::integer);
    PERFORM check_period_lock(OLD.org_id, NULL, 'vat', lock_year, lock_month);
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION guard_vat_records_period_lock()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  row_data record;
BEGIN
  row_data := CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  PERFORM check_period_lock(row_data.org_id, NULL, 'vat', row_data.period_year, row_data.period_month);
  IF TG_OP = 'UPDATE' THEN
    PERFORM check_period_lock(OLD.org_id, NULL, 'vat', OLD.period_year, OLD.period_month);
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION guard_wht_certificates_period_lock()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  row_data record;
  lock_year integer;
  lock_month integer;
BEGIN
  row_data := CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  lock_year := EXTRACT(YEAR FROM row_data.payment_date)::integer;
  lock_month := EXTRACT(MONTH FROM row_data.payment_date)::integer;
  PERFORM check_period_lock(row_data.org_id, NULL, 'wht', lock_year, lock_month);

  IF TG_OP = 'UPDATE' THEN
    lock_year := EXTRACT(YEAR FROM OLD.payment_date)::integer;
    lock_month := EXTRACT(MONTH FROM OLD.payment_date)::integer;
    PERFORM check_period_lock(OLD.org_id, NULL, 'wht', lock_year, lock_month);
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION guard_wht_monthly_filings_period_lock()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  row_data record;
BEGIN
  row_data := CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  PERFORM check_period_lock(row_data.org_id, NULL, 'wht', row_data.period_year, row_data.period_month);
  IF TG_OP = 'UPDATE' THEN
    PERFORM check_period_lock(OLD.org_id, NULL, 'wht', OLD.period_year, OLD.period_month);
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "documents_vendor_same_org" BEFORE INSERT OR UPDATE OF "vendor_id","org_id" ON "documents" FOR EACH ROW EXECUTE FUNCTION enforce_same_org_reference('vendors', 'vendor_id');
--> statement-breakpoint
CREATE TRIGGER "documents_related_document_same_org" BEFORE INSERT OR UPDATE OF "related_document_id","org_id" ON "documents" FOR EACH ROW EXECUTE FUNCTION enforce_same_org_reference('documents', 'related_document_id');
--> statement-breakpoint
CREATE TRIGGER "document_line_items_document_same_org" BEFORE INSERT OR UPDATE OF "document_id","org_id" ON "document_line_items" FOR EACH ROW EXECUTE FUNCTION enforce_same_org_reference('documents', 'document_id');
--> statement-breakpoint
CREATE TRIGGER "document_files_document_same_org" BEFORE INSERT OR UPDATE OF "document_id","org_id" ON "document_files" FOR EACH ROW EXECUTE FUNCTION enforce_same_org_reference('documents', 'document_id');
--> statement-breakpoint
CREATE TRIGGER "payments_document_same_org" BEFORE INSERT OR UPDATE OF "document_id","org_id" ON "payments" FOR EACH ROW EXECUTE FUNCTION enforce_same_org_reference('documents', 'document_id');
--> statement-breakpoint
CREATE TRIGGER "reconciliation_matches_transaction_same_org" BEFORE INSERT OR UPDATE OF "transaction_id","org_id" ON "reconciliation_matches" FOR EACH ROW EXECUTE FUNCTION enforce_same_org_reference('transactions', 'transaction_id');
--> statement-breakpoint
CREATE TRIGGER "reconciliation_matches_document_same_org" BEFORE INSERT OR UPDATE OF "document_id","org_id" ON "reconciliation_matches" FOR EACH ROW EXECUTE FUNCTION enforce_same_org_reference('documents', 'document_id');
--> statement-breakpoint
CREATE TRIGGER "reconciliation_matches_payment_same_org" BEFORE INSERT OR UPDATE OF "payment_id","org_id" ON "reconciliation_matches" FOR EACH ROW EXECUTE FUNCTION enforce_same_org_reference('payments', 'payment_id');
--> statement-breakpoint
CREATE TRIGGER "wht_certificates_vendor_same_org" BEFORE INSERT OR UPDATE OF "payee_vendor_id","org_id" ON "wht_certificates" FOR EACH ROW EXECUTE FUNCTION enforce_same_org_reference('vendors', 'payee_vendor_id');
--> statement-breakpoint
CREATE TRIGGER "wht_certificates_filing_same_org" BEFORE INSERT OR UPDATE OF "filing_id","org_id" ON "wht_certificates" FOR EACH ROW EXECUTE FUNCTION enforce_same_org_reference('wht_monthly_filings', 'filing_id');
--> statement-breakpoint
CREATE TRIGGER "wht_certificate_items_certificate_same_org" BEFORE INSERT OR UPDATE OF "certificate_id","org_id" ON "wht_certificate_items" FOR EACH ROW EXECUTE FUNCTION enforce_same_org_reference('wht_certificates', 'certificate_id');
--> statement-breakpoint
CREATE TRIGGER "wht_certificate_items_document_same_org" BEFORE INSERT OR UPDATE OF "document_id","org_id" ON "wht_certificate_items" FOR EACH ROW EXECUTE FUNCTION enforce_same_org_reference('documents', 'document_id');
--> statement-breakpoint
CREATE TRIGGER "wht_certificate_items_line_item_same_org" BEFORE INSERT OR UPDATE OF "line_item_id","org_id" ON "wht_certificate_items" FOR EACH ROW EXECUTE FUNCTION enforce_same_org_reference('document_line_items', 'line_item_id');
--> statement-breakpoint
CREATE TRIGGER "bank_statements_bank_account_same_org" BEFORE INSERT OR UPDATE OF "bank_account_id","org_id" ON "bank_statements" FOR EACH ROW EXECUTE FUNCTION enforce_same_org_reference('bank_accounts', 'bank_account_id');
--> statement-breakpoint
CREATE TRIGGER "transactions_bank_account_same_org" BEFORE INSERT OR UPDATE OF "bank_account_id","org_id" ON "transactions" FOR EACH ROW EXECUTE FUNCTION enforce_same_org_reference('bank_accounts', 'bank_account_id');
--> statement-breakpoint
CREATE TRIGGER "transactions_statement_same_org" BEFORE INSERT OR UPDATE OF "statement_id","org_id" ON "transactions" FOR EACH ROW EXECUTE FUNCTION enforce_same_org_reference('bank_statements', 'statement_id');
--> statement-breakpoint
CREATE TRIGGER "ai_match_suggestions_transaction_same_org" BEFORE INSERT OR UPDATE OF "transaction_id","org_id" ON "ai_match_suggestions" FOR EACH ROW EXECUTE FUNCTION enforce_same_org_reference('transactions', 'transaction_id');
--> statement-breakpoint
CREATE TRIGGER "ai_match_suggestions_document_same_org" BEFORE INSERT OR UPDATE OF "document_id","org_id" ON "ai_match_suggestions" FOR EACH ROW EXECUTE FUNCTION enforce_same_org_reference('documents', 'document_id');
--> statement-breakpoint
CREATE TRIGGER "ai_match_suggestions_payment_same_org" BEFORE INSERT OR UPDATE OF "payment_id","org_id" ON "ai_match_suggestions" FOR EACH ROW EXECUTE FUNCTION enforce_same_org_reference('payments', 'payment_id');
--> statement-breakpoint
CREATE TRIGGER "vendor_bank_aliases_vendor_same_org" BEFORE INSERT OR UPDATE OF "vendor_id","org_id" ON "vendor_bank_aliases" FOR EACH ROW EXECUTE FUNCTION enforce_same_org_reference('vendors', 'vendor_id');
--> statement-breakpoint
CREATE TRIGGER "recurring_payment_patterns_vendor_same_org" BEFORE INSERT OR UPDATE OF "vendor_id","org_id" ON "recurring_payment_patterns" FOR EACH ROW EXECUTE FUNCTION enforce_same_org_reference('vendors', 'vendor_id');
--> statement-breakpoint
CREATE TRIGGER "extraction_exemplars_vendor_same_org" BEFORE INSERT OR UPDATE OF "vendor_id","org_id" ON "extraction_exemplars" FOR EACH ROW EXECUTE FUNCTION enforce_same_org_reference('vendors', 'vendor_id');
--> statement-breakpoint
CREATE TRIGGER "extraction_exemplars_document_same_org" BEFORE INSERT OR UPDATE OF "document_id","org_id" ON "extraction_exemplars" FOR EACH ROW EXECUTE FUNCTION enforce_same_org_reference('documents', 'document_id');
--> statement-breakpoint
CREATE TRIGGER "extraction_log_document_same_org" BEFORE INSERT OR UPDATE OF "document_id","org_id" ON "extraction_log" FOR EACH ROW EXECUTE FUNCTION enforce_same_org_reference('documents', 'document_id');
--> statement-breakpoint
CREATE TRIGGER "extraction_log_vendor_same_org" BEFORE INSERT OR UPDATE OF "vendor_id","org_id" ON "extraction_log" FOR EACH ROW EXECUTE FUNCTION enforce_same_org_reference('vendors', 'vendor_id');
--> statement-breakpoint
CREATE TRIGGER "extraction_review_outcome_document_same_org" BEFORE INSERT OR UPDATE OF "document_id","org_id" ON "extraction_review_outcome" FOR EACH ROW EXECUTE FUNCTION enforce_same_org_reference('documents', 'document_id');
--> statement-breakpoint
CREATE TRIGGER "documents_vat_period_lock" BEFORE INSERT OR UPDATE OR DELETE ON "documents" FOR EACH ROW EXECUTE FUNCTION guard_documents_vat_period_lock();
--> statement-breakpoint
CREATE TRIGGER "vat_records_period_lock" BEFORE INSERT OR UPDATE OR DELETE ON "vat_records" FOR EACH ROW EXECUTE FUNCTION guard_vat_records_period_lock();
--> statement-breakpoint
CREATE TRIGGER "wht_certificates_period_lock" BEFORE INSERT OR UPDATE OR DELETE ON "wht_certificates" FOR EACH ROW EXECUTE FUNCTION guard_wht_certificates_period_lock();
--> statement-breakpoint
CREATE TRIGGER "wht_monthly_filings_period_lock" BEFORE INSERT OR UPDATE OR DELETE ON "wht_monthly_filings" FOR EACH ROW EXECUTE FUNCTION guard_wht_monthly_filings_period_lock();
