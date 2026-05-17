CREATE OR REPLACE FUNCTION guard_vat_input_items_period_lock()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  row_data record;
  lock_year integer;
  lock_month integer;
BEGIN
  row_data := CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  lock_year := row_data.claim_period_year;
  lock_month := row_data.claim_period_month;
  IF lock_year IS NOT NULL AND lock_month IS NOT NULL THEN
    PERFORM check_period_lock(row_data.org_id, row_data.establishment_id, 'vat', lock_year, lock_month);
    PERFORM check_period_lock(row_data.org_id, row_data.establishment_id, 'vat_pp30', lock_year, lock_month);
  END IF;

  IF TG_OP = 'UPDATE' THEN
    lock_year := OLD.claim_period_year;
    lock_month := OLD.claim_period_month;
    IF lock_year IS NOT NULL AND lock_month IS NOT NULL THEN
      PERFORM check_period_lock(OLD.org_id, OLD.establishment_id, 'vat', lock_year, lock_month);
      PERFORM check_period_lock(OLD.org_id, OLD.establishment_id, 'vat_pp30', lock_year, lock_month);
    END IF;
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION guard_vat_output_items_period_lock()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  row_data record;
BEGIN
  row_data := CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  PERFORM check_period_lock(row_data.org_id, row_data.establishment_id, 'vat', row_data.output_period_year, row_data.output_period_month);
  PERFORM check_period_lock(row_data.org_id, row_data.establishment_id, 'vat_pp30', row_data.output_period_year, row_data.output_period_month);

  IF TG_OP = 'UPDATE' THEN
    PERFORM check_period_lock(OLD.org_id, OLD.establishment_id, 'vat', OLD.output_period_year, OLD.output_period_month);
    PERFORM check_period_lock(OLD.org_id, OLD.establishment_id, 'vat_pp30', OLD.output_period_year, OLD.output_period_month);
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION guard_pp36_obligations_period_lock()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  row_data record;
BEGIN
  row_data := CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  IF TG_OP IN ('INSERT', 'DELETE') THEN
    PERFORM check_period_lock(row_data.org_id, row_data.establishment_id, 'vat', row_data.pp36_period_year, row_data.pp36_period_month);
    PERFORM check_period_lock(row_data.org_id, row_data.establishment_id, 'vat_pp36', row_data.pp36_period_year, row_data.pp36_period_month);
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.org_id IS DISTINCT FROM OLD.org_id
      OR NEW.establishment_id IS DISTINCT FROM OLD.establishment_id
      OR NEW.tax_treatment_decision_id IS DISTINCT FROM OLD.tax_treatment_decision_id
      OR NEW.source_document_id IS DISTINCT FROM OLD.source_document_id
      OR NEW.source_document_line_id IS DISTINCT FROM OLD.source_document_line_id
      OR NEW.source_payment_transaction_id IS DISTINCT FROM OLD.source_payment_transaction_id
      OR NEW.source_reconciliation_match_id IS DISTINCT FROM OLD.source_reconciliation_match_id
      OR NEW.vendor_id IS DISTINCT FROM OLD.vendor_id
      OR NEW.vendor_country_code IS DISTINCT FROM OLD.vendor_country_code
      OR NEW.service_description IS DISTINCT FROM OLD.service_description
      OR NEW.base_amount_thb IS DISTINCT FROM OLD.base_amount_thb
      OR NEW.source_currency IS DISTINCT FROM OLD.source_currency
      OR NEW.source_amount IS DISTINCT FROM OLD.source_amount
      OR NEW.fx_rate IS DISTINCT FROM OLD.fx_rate
      OR NEW.fx_rate_source IS DISTINCT FROM OLD.fx_rate_source
      OR NEW.fx_rate_date IS DISTINCT FROM OLD.fx_rate_date
      OR NEW.vat_amount IS DISTINCT FROM OLD.vat_amount
      OR NEW.vat_rate IS DISTINCT FROM OLD.vat_rate
      OR NEW.occurred_on IS DISTINCT FROM OLD.occurred_on
      OR NEW.payment_date IS DISTINCT FROM OLD.payment_date
      OR NEW.tax_point_date IS DISTINCT FROM OLD.tax_point_date
      OR NEW.period_basis IS DISTINCT FROM OLD.period_basis
      OR NEW.period_rule_version_id IS DISTINCT FROM OLD.period_rule_version_id
      OR NEW.pp36_period_year IS DISTINCT FROM OLD.pp36_period_year
      OR NEW.pp36_period_month IS DISTINCT FROM OLD.pp36_period_month
      OR NEW.pp36_filing_id IS DISTINCT FROM OLD.pp36_filing_id
      OR NEW.pp36_filing_line_id IS DISTINCT FROM OLD.pp36_filing_line_id
      OR NEW.source_snapshot IS DISTINCT FROM OLD.source_snapshot
      OR NEW.source_snapshot_hash IS DISTINCT FROM OLD.source_snapshot_hash
      OR NEW.snapshot_version IS DISTINCT FROM OLD.snapshot_version
      OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at THEN
      PERFORM check_period_lock(OLD.org_id, OLD.establishment_id, 'vat', OLD.pp36_period_year, OLD.pp36_period_month);
      PERFORM check_period_lock(OLD.org_id, OLD.establishment_id, 'vat_pp36', OLD.pp36_period_year, OLD.pp36_period_month);
      PERFORM check_period_lock(NEW.org_id, NEW.establishment_id, 'vat', NEW.pp36_period_year, NEW.pp36_period_month);
      PERFORM check_period_lock(NEW.org_id, NEW.establishment_id, 'vat_pp36', NEW.pp36_period_year, NEW.pp36_period_month);
    END IF;
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION guard_vat_filings_period_lock()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  row_data record;
  subdomain text;
BEGIN
  row_data := CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  subdomain := CASE row_data.filing_type WHEN 'pp36' THEN 'vat_pp36' ELSE 'vat_pp30' END;
  PERFORM check_period_lock(row_data.org_id, row_data.establishment_id, 'vat', row_data.period_year, row_data.period_month);
  PERFORM check_period_lock(row_data.org_id, row_data.establishment_id, subdomain, row_data.period_year, row_data.period_month);

  IF TG_OP = 'UPDATE' THEN
    subdomain := CASE OLD.filing_type WHEN 'pp36' THEN 'vat_pp36' ELSE 'vat_pp30' END;
    PERFORM check_period_lock(OLD.org_id, OLD.establishment_id, 'vat', OLD.period_year, OLD.period_month);
    PERFORM check_period_lock(OLD.org_id, OLD.establishment_id, subdomain, OLD.period_year, OLD.period_month);
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION guard_vat_filing_lines_period_lock()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  row_data record;
  filing record;
  subdomain text;
BEGIN
  row_data := CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  SELECT org_id, establishment_id, filing_type, period_year, period_month
    INTO filing
    FROM vat_filings
    WHERE id = row_data.filing_id;

  IF filing.org_id IS NULL THEN
    RAISE EXCEPTION 'vat_filing_lines references missing filing %', row_data.filing_id USING ERRCODE = '23514';
  END IF;

  subdomain := CASE filing.filing_type WHEN 'pp36' THEN 'vat_pp36' ELSE 'vat_pp30' END;
  PERFORM check_period_lock(filing.org_id, filing.establishment_id, 'vat', filing.period_year, filing.period_month);
  PERFORM check_period_lock(filing.org_id, filing.establishment_id, subdomain, filing.period_year, filing.period_month);

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION guard_vat_credit_carryforwards_period_lock()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  row_data record;
  applied_filing record;
BEGIN
  row_data := CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;

  IF TG_OP IN ('INSERT', 'DELETE') THEN
    PERFORM check_period_lock(row_data.org_id, row_data.establishment_id, 'vat', row_data.credit_origin_period_year, row_data.credit_origin_period_month);
    PERFORM check_period_lock(row_data.org_id, row_data.establishment_id, 'vat_pp30', row_data.credit_origin_period_year, row_data.credit_origin_period_month);
  END IF;

  IF TG_OP = 'UPDATE' AND (
    NEW.org_id IS DISTINCT FROM OLD.org_id
    OR NEW.establishment_id IS DISTINCT FROM OLD.establishment_id
    OR NEW.source_pp30_filing_id IS DISTINCT FROM OLD.source_pp30_filing_id
    OR NEW.source_pp30_filing_line_id IS DISTINCT FROM OLD.source_pp30_filing_line_id
    OR NEW.credit_origin_period_year IS DISTINCT FROM OLD.credit_origin_period_year
    OR NEW.credit_origin_period_month IS DISTINCT FROM OLD.credit_origin_period_month
    OR NEW.amount IS DISTINCT FROM OLD.amount
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  ) THEN
    PERFORM check_period_lock(NEW.org_id, NEW.establishment_id, 'vat', NEW.credit_origin_period_year, NEW.credit_origin_period_month);
    PERFORM check_period_lock(NEW.org_id, NEW.establishment_id, 'vat_pp30', NEW.credit_origin_period_year, NEW.credit_origin_period_month);
    PERFORM check_period_lock(OLD.org_id, OLD.establishment_id, 'vat', OLD.credit_origin_period_year, OLD.credit_origin_period_month);
    PERFORM check_period_lock(OLD.org_id, OLD.establishment_id, 'vat_pp30', OLD.credit_origin_period_year, OLD.credit_origin_period_month);
  END IF;

  IF TG_OP = 'UPDATE'
    AND NEW.applied_to_pp30_filing_id IS DISTINCT FROM OLD.applied_to_pp30_filing_id
    AND NEW.applied_to_pp30_filing_id IS NOT NULL THEN
    SELECT org_id, establishment_id, period_year, period_month
    INTO applied_filing
    FROM vat_filings
    WHERE id = NEW.applied_to_pp30_filing_id;

    IF applied_filing.org_id IS NULL THEN
      RAISE EXCEPTION 'vat_credit_carryforwards references missing applied PP30 filing %', NEW.applied_to_pp30_filing_id USING ERRCODE = '23514';
    END IF;

    PERFORM check_period_lock(applied_filing.org_id, applied_filing.establishment_id, 'vat', applied_filing.period_year, applied_filing.period_month);
    PERFORM check_period_lock(applied_filing.org_id, applied_filing.establishment_id, 'vat_pp30', applied_filing.period_year, applied_filing.period_month);
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION guard_tax_payment_events_period_lock()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  row_data record;
  filing record;
  subdomain text;
BEGIN
  row_data := CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  SELECT org_id, establishment_id, filing_type, period_year, period_month
    INTO filing
    FROM vat_filings
    WHERE id = row_data.filing_id;

  IF filing.org_id IS NULL THEN
    RAISE EXCEPTION 'tax_payment_events references missing filing %', row_data.filing_id USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'DELETE'
    OR NEW.org_id IS DISTINCT FROM OLD.org_id
    OR NEW.filing_id IS DISTINCT FROM OLD.filing_id
    OR NEW.event_type IS DISTINCT FROM OLD.event_type
    OR NEW.paid_at IS DISTINCT FROM OLD.paid_at
    OR NEW.amount IS DISTINCT FROM OLD.amount
    OR NEW.receipt_no IS DISTINCT FROM OLD.receipt_no
    OR NEW.evidence_document_id IS DISTINCT FROM OLD.evidence_document_id
    OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
    OR NEW.created_by_user_id IS DISTINCT FROM OLD.created_by_user_id
    OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    subdomain := CASE filing.filing_type WHEN 'pp36' THEN 'vat_pp36' ELSE 'vat_pp30' END;
    PERFORM check_period_lock(filing.org_id, filing.establishment_id, 'vat', filing.period_year, filing.period_month);
    PERFORM check_period_lock(filing.org_id, filing.establishment_id, subdomain, filing.period_year, filing.period_month);
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER "tax_treatment_document_same_org" BEFORE INSERT OR UPDATE OF "source_document_id","org_id" ON "tax_treatment_decisions" FOR EACH ROW EXECUTE FUNCTION enforce_same_org_reference('documents', 'source_document_id');
--> statement-breakpoint
CREATE TRIGGER "tax_treatment_line_same_org" BEFORE INSERT OR UPDATE OF "source_document_line_id","org_id" ON "tax_treatment_decisions" FOR EACH ROW EXECUTE FUNCTION enforce_same_org_reference('document_line_items', 'source_document_line_id');
--> statement-breakpoint
CREATE TRIGGER "tax_treatment_transaction_same_org" BEFORE INSERT OR UPDATE OF "source_transaction_id","org_id" ON "tax_treatment_decisions" FOR EACH ROW EXECUTE FUNCTION enforce_same_org_reference('transactions', 'source_transaction_id');
--> statement-breakpoint
CREATE TRIGGER "tax_treatment_payment_same_org" BEFORE INSERT OR UPDATE OF "source_payment_id","org_id" ON "tax_treatment_decisions" FOR EACH ROW EXECUTE FUNCTION enforce_same_org_reference('payments', 'source_payment_id');
--> statement-breakpoint
CREATE TRIGGER "tax_treatment_recon_same_org" BEFORE INSERT OR UPDATE OF "source_reconciliation_match_id","org_id" ON "tax_treatment_decisions" FOR EACH ROW EXECUTE FUNCTION enforce_same_org_reference('reconciliation_matches', 'source_reconciliation_match_id');
--> statement-breakpoint

CREATE TRIGGER "vat_input_decision_same_org" BEFORE INSERT OR UPDATE OF "tax_treatment_decision_id","org_id" ON "vat_input_items" FOR EACH ROW EXECUTE FUNCTION enforce_same_org_reference('tax_treatment_decisions', 'tax_treatment_decision_id');
--> statement-breakpoint
CREATE TRIGGER "vat_input_document_same_org" BEFORE INSERT OR UPDATE OF "source_document_id","org_id" ON "vat_input_items" FOR EACH ROW EXECUTE FUNCTION enforce_same_org_reference('documents', 'source_document_id');
--> statement-breakpoint
CREATE TRIGGER "vat_input_line_same_org" BEFORE INSERT OR UPDATE OF "source_document_line_id","org_id" ON "vat_input_items" FOR EACH ROW EXECUTE FUNCTION enforce_same_org_reference('document_line_items', 'source_document_line_id');
--> statement-breakpoint
CREATE TRIGGER "vat_input_transaction_same_org" BEFORE INSERT OR UPDATE OF "source_transaction_id","org_id" ON "vat_input_items" FOR EACH ROW EXECUTE FUNCTION enforce_same_org_reference('transactions', 'source_transaction_id');
--> statement-breakpoint
CREATE TRIGGER "vat_input_recon_same_org" BEFORE INSERT OR UPDATE OF "source_reconciliation_match_id","org_id" ON "vat_input_items" FOR EACH ROW EXECUTE FUNCTION enforce_same_org_reference('reconciliation_matches', 'source_reconciliation_match_id');
--> statement-breakpoint
CREATE TRIGGER "vat_input_vendor_same_org" BEFORE INSERT OR UPDATE OF "vendor_id","org_id" ON "vat_input_items" FOR EACH ROW EXECUTE FUNCTION enforce_same_org_reference('vendors', 'vendor_id');
--> statement-breakpoint
CREATE TRIGGER "vat_input_draft_filing_same_org" BEFORE INSERT OR UPDATE OF "draft_filing_id","org_id" ON "vat_input_items" FOR EACH ROW EXECUTE FUNCTION enforce_same_org_reference('vat_filings', 'draft_filing_id');
--> statement-breakpoint
CREATE TRIGGER "vat_input_filed_line_same_org" BEFORE INSERT OR UPDATE OF "filed_filing_line_id","org_id" ON "vat_input_items" FOR EACH ROW EXECUTE FUNCTION enforce_same_org_reference('vat_filing_lines', 'filed_filing_line_id');
--> statement-breakpoint
CREATE TRIGGER "vat_input_period_lock" BEFORE INSERT OR UPDATE OR DELETE ON "vat_input_items" FOR EACH ROW EXECUTE FUNCTION guard_vat_input_items_period_lock();
--> statement-breakpoint

CREATE TRIGGER "vat_output_decision_same_org" BEFORE INSERT OR UPDATE OF "tax_treatment_decision_id","org_id" ON "vat_output_items" FOR EACH ROW EXECUTE FUNCTION enforce_same_org_reference('tax_treatment_decisions', 'tax_treatment_decision_id');
--> statement-breakpoint
CREATE TRIGGER "vat_output_document_same_org" BEFORE INSERT OR UPDATE OF "source_document_id","org_id" ON "vat_output_items" FOR EACH ROW EXECUTE FUNCTION enforce_same_org_reference('documents', 'source_document_id');
--> statement-breakpoint
CREATE TRIGGER "vat_output_line_same_org" BEFORE INSERT OR UPDATE OF "source_document_line_id","org_id" ON "vat_output_items" FOR EACH ROW EXECUTE FUNCTION enforce_same_org_reference('document_line_items', 'source_document_line_id');
--> statement-breakpoint
CREATE TRIGGER "vat_output_transaction_same_org" BEFORE INSERT OR UPDATE OF "source_transaction_id","org_id" ON "vat_output_items" FOR EACH ROW EXECUTE FUNCTION enforce_same_org_reference('transactions', 'source_transaction_id');
--> statement-breakpoint
CREATE TRIGGER "vat_output_customer_same_org" BEFORE INSERT OR UPDATE OF "customer_id","org_id" ON "vat_output_items" FOR EACH ROW EXECUTE FUNCTION enforce_same_org_reference('vendors', 'customer_id');
--> statement-breakpoint
CREATE TRIGGER "vat_output_period_lock" BEFORE INSERT OR UPDATE OR DELETE ON "vat_output_items" FOR EACH ROW EXECUTE FUNCTION guard_vat_output_items_period_lock();
--> statement-breakpoint

CREATE TRIGGER "pp36_decision_same_org" BEFORE INSERT OR UPDATE OF "tax_treatment_decision_id","org_id" ON "pp36_obligations" FOR EACH ROW EXECUTE FUNCTION enforce_same_org_reference('tax_treatment_decisions', 'tax_treatment_decision_id');
--> statement-breakpoint
CREATE TRIGGER "pp36_document_same_org" BEFORE INSERT OR UPDATE OF "source_document_id","org_id" ON "pp36_obligations" FOR EACH ROW EXECUTE FUNCTION enforce_same_org_reference('documents', 'source_document_id');
--> statement-breakpoint
CREATE TRIGGER "pp36_line_same_org" BEFORE INSERT OR UPDATE OF "source_document_line_id","org_id" ON "pp36_obligations" FOR EACH ROW EXECUTE FUNCTION enforce_same_org_reference('document_line_items', 'source_document_line_id');
--> statement-breakpoint
CREATE TRIGGER "pp36_source_payment_txn_same_org" BEFORE INSERT OR UPDATE OF "source_payment_transaction_id","org_id" ON "pp36_obligations" FOR EACH ROW EXECUTE FUNCTION enforce_same_org_reference('transactions', 'source_payment_transaction_id');
--> statement-breakpoint
CREATE TRIGGER "pp36_recon_same_org" BEFORE INSERT OR UPDATE OF "source_reconciliation_match_id","org_id" ON "pp36_obligations" FOR EACH ROW EXECUTE FUNCTION enforce_same_org_reference('reconciliation_matches', 'source_reconciliation_match_id');
--> statement-breakpoint
CREATE TRIGGER "pp36_vendor_same_org" BEFORE INSERT OR UPDATE OF "vendor_id","org_id" ON "pp36_obligations" FOR EACH ROW EXECUTE FUNCTION enforce_same_org_reference('vendors', 'vendor_id');
--> statement-breakpoint
CREATE TRIGGER "pp36_filing_same_org" BEFORE INSERT OR UPDATE OF "pp36_filing_id","org_id" ON "pp36_obligations" FOR EACH ROW EXECUTE FUNCTION enforce_same_org_reference('vat_filings', 'pp36_filing_id');
--> statement-breakpoint
CREATE TRIGGER "pp36_filing_line_same_org" BEFORE INSERT OR UPDATE OF "pp36_filing_line_id","org_id" ON "pp36_obligations" FOR EACH ROW EXECUTE FUNCTION enforce_same_org_reference('vat_filing_lines', 'pp36_filing_line_id');
--> statement-breakpoint
CREATE TRIGGER "pp36_payment_txn_same_org" BEFORE INSERT OR UPDATE OF "pp36_payment_transaction_id","org_id" ON "pp36_obligations" FOR EACH ROW EXECUTE FUNCTION enforce_same_org_reference('transactions', 'pp36_payment_transaction_id');
--> statement-breakpoint
CREATE TRIGGER "pp36_reclaim_filing_same_org" BEFORE INSERT OR UPDATE OF "pp30_reclaim_filing_id","org_id" ON "pp36_obligations" FOR EACH ROW EXECUTE FUNCTION enforce_same_org_reference('vat_filings', 'pp30_reclaim_filing_id');
--> statement-breakpoint
CREATE TRIGGER "pp36_reclaim_filing_line_same_org" BEFORE INSERT OR UPDATE OF "pp30_reclaim_filing_line_id","org_id" ON "pp36_obligations" FOR EACH ROW EXECUTE FUNCTION enforce_same_org_reference('vat_filing_lines', 'pp30_reclaim_filing_line_id');
--> statement-breakpoint
CREATE TRIGGER "pp36_period_lock" BEFORE INSERT OR UPDATE OR DELETE ON "pp36_obligations" FOR EACH ROW EXECUTE FUNCTION guard_pp36_obligations_period_lock();
--> statement-breakpoint

CREATE TRIGGER "vat_filings_amends_same_org" BEFORE INSERT OR UPDATE OF "amends_filing_id","org_id" ON "vat_filings" FOR EACH ROW EXECUTE FUNCTION enforce_same_org_reference('vat_filings', 'amends_filing_id');
--> statement-breakpoint
CREATE TRIGGER "vat_filings_payment_txn_same_org" BEFORE INSERT OR UPDATE OF "payment_transaction_id","org_id" ON "vat_filings" FOR EACH ROW EXECUTE FUNCTION enforce_same_org_reference('transactions', 'payment_transaction_id');
--> statement-breakpoint
CREATE TRIGGER "vat_filings_period_lock" BEFORE INSERT OR UPDATE OF "establishment_id","filing_type","period_year","period_month","filing_kind","version","output_vat_total","input_vat_total","pp36_vat_total","pp36_reclaim_total","carryforward_in","carryforward_out","net_payable","deleted_at" OR DELETE ON "vat_filings" FOR EACH ROW EXECUTE FUNCTION guard_vat_filings_period_lock();
--> statement-breakpoint

CREATE TRIGGER "vat_filing_lines_filing_same_org" BEFORE INSERT OR UPDATE OF "filing_id","org_id" ON "vat_filing_lines" FOR EACH ROW EXECUTE FUNCTION enforce_same_org_reference('vat_filings', 'filing_id');
--> statement-breakpoint
CREATE TRIGGER "vat_filing_lines_input_same_org" BEFORE INSERT OR UPDATE OF "vat_input_item_id","org_id" ON "vat_filing_lines" FOR EACH ROW EXECUTE FUNCTION enforce_same_org_reference('vat_input_items', 'vat_input_item_id');
--> statement-breakpoint
CREATE TRIGGER "vat_filing_lines_output_same_org" BEFORE INSERT OR UPDATE OF "vat_output_item_id","org_id" ON "vat_filing_lines" FOR EACH ROW EXECUTE FUNCTION enforce_same_org_reference('vat_output_items', 'vat_output_item_id');
--> statement-breakpoint
CREATE TRIGGER "vat_filing_lines_pp36_same_org" BEFORE INSERT OR UPDATE OF "pp36_obligation_id","org_id" ON "vat_filing_lines" FOR EACH ROW EXECUTE FUNCTION enforce_same_org_reference('pp36_obligations', 'pp36_obligation_id');
--> statement-breakpoint
CREATE TRIGGER "vat_filing_lines_period_lock" BEFORE INSERT OR UPDATE OR DELETE ON "vat_filing_lines" FOR EACH ROW EXECUTE FUNCTION guard_vat_filing_lines_period_lock();
--> statement-breakpoint

CREATE TRIGGER "vat_credit_source_filing_same_org" BEFORE INSERT OR UPDATE OF "source_pp30_filing_id","org_id" ON "vat_credit_carryforwards" FOR EACH ROW EXECUTE FUNCTION enforce_same_org_reference('vat_filings', 'source_pp30_filing_id');
--> statement-breakpoint
CREATE TRIGGER "vat_credit_source_line_same_org" BEFORE INSERT OR UPDATE OF "source_pp30_filing_line_id","org_id" ON "vat_credit_carryforwards" FOR EACH ROW EXECUTE FUNCTION enforce_same_org_reference('vat_filing_lines', 'source_pp30_filing_line_id');
--> statement-breakpoint
CREATE TRIGGER "vat_credit_applied_filing_same_org" BEFORE INSERT OR UPDATE OF "applied_to_pp30_filing_id","org_id" ON "vat_credit_carryforwards" FOR EACH ROW EXECUTE FUNCTION enforce_same_org_reference('vat_filings', 'applied_to_pp30_filing_id');
--> statement-breakpoint
CREATE TRIGGER "vat_credit_period_lock" BEFORE INSERT OR UPDATE OR DELETE ON "vat_credit_carryforwards" FOR EACH ROW EXECUTE FUNCTION guard_vat_credit_carryforwards_period_lock();
--> statement-breakpoint

CREATE TRIGGER "tax_payment_filing_same_org" BEFORE INSERT OR UPDATE OF "filing_id","org_id" ON "tax_payment_events" FOR EACH ROW EXECUTE FUNCTION enforce_same_org_reference('vat_filings', 'filing_id');
--> statement-breakpoint
CREATE TRIGGER "tax_payment_transaction_same_org" BEFORE INSERT OR UPDATE OF "payment_transaction_id","org_id" ON "tax_payment_events" FOR EACH ROW EXECUTE FUNCTION enforce_same_org_reference('transactions', 'payment_transaction_id');
--> statement-breakpoint
CREATE TRIGGER "tax_payment_evidence_document_same_org" BEFORE INSERT OR UPDATE OF "evidence_document_id","org_id" ON "tax_payment_events" FOR EACH ROW EXECUTE FUNCTION enforce_same_org_reference('documents', 'evidence_document_id');
--> statement-breakpoint
-- INSERT intentionally remains allowed after VAT period lock so owners can record
-- post-filing RD payment/refund events; UPDATE/DELETE stay locked and append-only.
CREATE TRIGGER "tax_payment_events_period_lock" BEFORE UPDATE OR DELETE ON "tax_payment_events" FOR EACH ROW EXECUTE FUNCTION guard_tax_payment_events_period_lock();
