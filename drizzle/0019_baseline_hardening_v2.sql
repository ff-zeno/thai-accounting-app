ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "is_pp36_subject" boolean DEFAULT false;
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

  EXECUTE format('SELECT org_id FROM %I WHERE id = $1 AND deleted_at IS NULL', TG_ARGV[0])
    INTO referenced_org_id
    USING referenced_id;

  IF referenced_org_id IS NULL THEN
    RAISE EXCEPTION 'referenced row not found: %.% references % %',
      TG_TABLE_NAME, TG_ARGV[1], TG_ARGV[0], referenced_id
      USING ERRCODE = '23514';
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
  override_reason text;
  locked boolean;
BEGIN
  IF p_org_id IS NULL OR p_domain IS NULL OR p_period_year IS NULL THEN
    RETURN;
  END IF;

  override_user_id := NULLIF(current_setting('app.lock_override_user_id', true), '');
  override_reason := NULLIF(current_setting('app.lock_override_reason', true), '');
  IF override_user_id IS NOT NULL THEN
    IF override_reason IS NULL OR length(trim(override_reason)) < 8 THEN
      RAISE EXCEPTION 'period lock override requires app.lock_override_reason' USING ERRCODE = '23514';
    END IF;
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
  is_foreign boolean;
BEGIN
  row_data := CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  lock_year := COALESCE(row_data.vat_period_year, EXTRACT(YEAR FROM row_data.issue_date)::integer);
  lock_month := COALESCE(row_data.vat_period_month, EXTRACT(MONTH FROM row_data.issue_date)::integer);
  PERFORM check_period_lock(row_data.org_id, NULL, 'vat', lock_year, lock_month);
  PERFORM check_period_lock(row_data.org_id, NULL, 'vat_pp30', lock_year, lock_month);

  SELECT EXISTS (
    SELECT 1 FROM vendors
    WHERE vendors.id = row_data.vendor_id
      AND vendors.org_id = row_data.org_id
      AND (vendors.entity_type = 'foreign' OR COALESCE(vendors.country, 'TH') <> 'TH')
  ) INTO is_foreign;

  IF is_foreign AND COALESCE(row_data.is_pp36_subject, false) THEN
    PERFORM check_period_lock(row_data.org_id, NULL, 'vat_pp36', lock_year, lock_month);
  END IF;

  IF TG_OP = 'UPDATE' THEN
    lock_year := COALESCE(OLD.vat_period_year, EXTRACT(YEAR FROM OLD.issue_date)::integer);
    lock_month := COALESCE(OLD.vat_period_month, EXTRACT(MONTH FROM OLD.issue_date)::integer);
    PERFORM check_period_lock(OLD.org_id, NULL, 'vat', lock_year, lock_month);
    PERFORM check_period_lock(OLD.org_id, NULL, 'vat_pp30', lock_year, lock_month);
    SELECT EXISTS (
      SELECT 1 FROM vendors
      WHERE vendors.id = OLD.vendor_id
        AND vendors.org_id = OLD.org_id
        AND (vendors.entity_type = 'foreign' OR COALESCE(vendors.country, 'TH') <> 'TH')
    ) INTO is_foreign;
    IF is_foreign AND COALESCE(OLD.is_pp36_subject, false) THEN
      PERFORM check_period_lock(OLD.org_id, NULL, 'vat_pp36', lock_year, lock_month);
    END IF;
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
  PERFORM check_period_lock(row_data.org_id, NULL, 'vat_pp30', row_data.period_year, row_data.period_month);
  PERFORM check_period_lock(row_data.org_id, NULL, 'vat_pp36', row_data.period_year, row_data.period_month);
  IF TG_OP = 'UPDATE' THEN
    PERFORM check_period_lock(OLD.org_id, NULL, 'vat', OLD.period_year, OLD.period_month);
    PERFORM check_period_lock(OLD.org_id, NULL, 'vat_pp30', OLD.period_year, OLD.period_month);
    PERFORM check_period_lock(OLD.org_id, NULL, 'vat_pp36', OLD.period_year, OLD.period_month);
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
  PERFORM check_period_lock(row_data.org_id, NULL, 'wht_' || row_data.form_type, lock_year, lock_month);

  IF TG_OP = 'UPDATE' THEN
    lock_year := EXTRACT(YEAR FROM OLD.payment_date)::integer;
    lock_month := EXTRACT(MONTH FROM OLD.payment_date)::integer;
    PERFORM check_period_lock(OLD.org_id, NULL, 'wht', lock_year, lock_month);
    PERFORM check_period_lock(OLD.org_id, NULL, 'wht_' || OLD.form_type, lock_year, lock_month);
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
  PERFORM check_period_lock(row_data.org_id, NULL, 'wht_' || row_data.form_type, row_data.period_year, row_data.period_month);
  IF TG_OP = 'UPDATE' THEN
    PERFORM check_period_lock(OLD.org_id, NULL, 'wht', OLD.period_year, OLD.period_month);
    PERFORM check_period_lock(OLD.org_id, NULL, 'wht_' || OLD.form_type, OLD.period_year, OLD.period_month);
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION enforce_reconciliation_allocation_limits()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  txn_cap numeric;
  doc_cap numeric;
  payment_cap numeric;
  existing_txn_total numeric;
  existing_doc_total numeric;
  existing_payment_total numeric;
  new_amount numeric;
BEGIN
  IF TG_OP = 'DELETE' OR NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  new_amount := COALESCE(NEW.matched_amount, 0);
  IF new_amount <= 0 THEN
    RAISE EXCEPTION 'matched_amount must be greater than zero' USING ERRCODE = '23514';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.org_id::text || ':txn:' || NEW.transaction_id::text, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.org_id::text || ':doc:' || NEW.document_id::text, 0));
  IF NEW.payment_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(NEW.org_id::text || ':payment:' || NEW.payment_id::text, 0));
  END IF;

  SELECT amount INTO txn_cap
  FROM transactions
  WHERE id = NEW.transaction_id
    AND org_id = NEW.org_id
    AND deleted_at IS NULL;

  IF txn_cap IS NULL THEN
    RAISE EXCEPTION 'transaction not found for reconciliation match' USING ERRCODE = '23514';
  END IF;

  SELECT total_amount INTO doc_cap
  FROM documents
  WHERE id = NEW.document_id
    AND org_id = NEW.org_id
    AND deleted_at IS NULL;

  IF doc_cap IS NULL THEN
    RAISE EXCEPTION 'document not found for reconciliation match' USING ERRCODE = '23514';
  END IF;

  SELECT COALESCE(SUM(matched_amount), 0) INTO existing_txn_total
  FROM reconciliation_matches
  WHERE org_id = NEW.org_id
    AND transaction_id = NEW.transaction_id
    AND deleted_at IS NULL
    AND id <> NEW.id;

  IF ROUND((existing_txn_total + new_amount)::numeric, 2) > ROUND(txn_cap::numeric, 2) THEN
    RAISE EXCEPTION 'matched amount exceeds transaction amount' USING ERRCODE = '23514';
  END IF;

  SELECT COALESCE(SUM(matched_amount), 0) INTO existing_doc_total
  FROM reconciliation_matches
  WHERE org_id = NEW.org_id
    AND document_id = NEW.document_id
    AND deleted_at IS NULL
    AND id <> NEW.id;

  IF ROUND((existing_doc_total + new_amount)::numeric, 2) > ROUND(doc_cap::numeric, 2) THEN
    RAISE EXCEPTION 'matched amount exceeds document total' USING ERRCODE = '23514';
  END IF;

  IF NEW.payment_id IS NOT NULL THEN
    SELECT net_amount_paid INTO payment_cap
    FROM payments
    WHERE id = NEW.payment_id
      AND org_id = NEW.org_id
      AND document_id = NEW.document_id
      AND deleted_at IS NULL;

    IF payment_cap IS NULL THEN
      RAISE EXCEPTION 'payment not found for reconciliation match document' USING ERRCODE = '23514';
    END IF;

    SELECT COALESCE(SUM(matched_amount), 0) INTO existing_payment_total
    FROM reconciliation_matches
    WHERE org_id = NEW.org_id
      AND payment_id = NEW.payment_id
      AND deleted_at IS NULL
      AND id <> NEW.id;

    IF ROUND((existing_payment_total + new_amount)::numeric, 2) > ROUND(payment_cap::numeric, 2) THEN
      RAISE EXCEPTION 'matched amount exceeds payment net amount' USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
