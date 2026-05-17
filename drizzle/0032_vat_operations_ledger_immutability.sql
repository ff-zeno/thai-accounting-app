CREATE OR REPLACE FUNCTION is_vat_document_bound(p_org_id uuid, p_document_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM vat_input_items
    WHERE org_id = p_org_id
      AND source_document_id = p_document_id
      AND deleted_at IS NULL
      AND status IN ('allocated_to_draft', 'filed')
  )
  OR EXISTS (
    SELECT 1 FROM vat_output_items
    WHERE org_id = p_org_id
      AND source_document_id = p_document_id
      AND deleted_at IS NULL
      AND status IN ('allocated_to_draft', 'filed')
  )
  OR EXISTS (
    SELECT 1 FROM pp36_obligations
    WHERE org_id = p_org_id
      AND source_document_id = p_document_id
      AND deleted_at IS NULL
      AND status IN ('allocated_to_draft_pp36', 'pp36_filed', 'pp36_paid', 'eligible_for_pp30_reclaim', 'reclaimed_in_pp30')
  )
  OR EXISTS (
    SELECT 1 FROM tax_payment_events
    WHERE org_id = p_org_id
      AND evidence_document_id = p_document_id
      AND event_status <> 'voided'
  );
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION is_vat_document_line_bound(p_org_id uuid, p_line_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM vat_input_items
    WHERE org_id = p_org_id
      AND source_document_line_id = p_line_id
      AND deleted_at IS NULL
      AND status IN ('allocated_to_draft', 'filed')
  )
  OR EXISTS (
    SELECT 1 FROM vat_output_items
    WHERE org_id = p_org_id
      AND source_document_line_id = p_line_id
      AND deleted_at IS NULL
      AND status IN ('allocated_to_draft', 'filed')
  )
  OR EXISTS (
    SELECT 1 FROM pp36_obligations
    WHERE org_id = p_org_id
      AND source_document_line_id = p_line_id
      AND deleted_at IS NULL
      AND status IN ('allocated_to_draft_pp36', 'pp36_filed', 'pp36_paid', 'eligible_for_pp30_reclaim', 'reclaimed_in_pp30')
  );
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION is_vat_transaction_bound(p_org_id uuid, p_transaction_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM vat_input_items
    WHERE org_id = p_org_id
      AND source_transaction_id = p_transaction_id
      AND deleted_at IS NULL
      AND status IN ('allocated_to_draft', 'filed')
  )
  OR EXISTS (
    SELECT 1 FROM vat_output_items
    WHERE org_id = p_org_id
      AND source_transaction_id = p_transaction_id
      AND deleted_at IS NULL
      AND status IN ('allocated_to_draft', 'filed')
  )
  OR EXISTS (
    SELECT 1 FROM pp36_obligations
    WHERE org_id = p_org_id
      AND (source_payment_transaction_id = p_transaction_id OR pp36_payment_transaction_id = p_transaction_id)
      AND deleted_at IS NULL
      AND status IN ('allocated_to_draft_pp36', 'pp36_filed', 'pp36_paid', 'eligible_for_pp30_reclaim', 'reclaimed_in_pp30')
  )
  OR EXISTS (
    SELECT 1 FROM tax_payment_events
    WHERE org_id = p_org_id
      AND payment_transaction_id = p_transaction_id
      AND event_status <> 'voided'
  )
  OR EXISTS (
    SELECT 1 FROM vat_filings
    WHERE org_id = p_org_id
      AND payment_transaction_id = p_transaction_id
      AND deleted_at IS NULL
      AND status IN ('filed', 'amended', 'voided')
  );
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION is_vat_reconciliation_match_bound(p_org_id uuid, p_match_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM vat_input_items
    WHERE org_id = p_org_id
      AND source_reconciliation_match_id = p_match_id
      AND deleted_at IS NULL
      AND status IN ('allocated_to_draft', 'filed')
  )
  OR EXISTS (
    SELECT 1 FROM pp36_obligations
    WHERE org_id = p_org_id
      AND source_reconciliation_match_id = p_match_id
      AND deleted_at IS NULL
      AND status IN ('allocated_to_draft_pp36', 'pp36_filed', 'pp36_paid', 'eligible_for_pp30_reclaim', 'reclaimed_in_pp30')
  );
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION guard_vat_filing_lines_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  filing_status text;
  override_user_id text;
  override_reason text;
BEGIN
  override_user_id := NULLIF(current_setting('app.lock_override_user_id', true), '');
  override_reason := NULLIF(current_setting('app.lock_override_reason', true), '');
  IF override_user_id IS NOT NULL THEN
    IF override_reason IS NULL OR length(trim(override_reason)) < 8 THEN
      RAISE EXCEPTION 'VAT immutability override requires app.lock_override_reason' USING ERRCODE = '23514';
    END IF;
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  SELECT status INTO filing_status
  FROM vat_filings
  WHERE id = CASE WHEN TG_OP = 'INSERT' THEN NEW.filing_id ELSE OLD.filing_id END;

  IF filing_status IN ('filed', 'amended', 'voided') THEN
    RAISE EXCEPTION 'filed VAT filing lines are immutable: filing %', CASE WHEN TG_OP = 'INSERT' THEN NEW.filing_id ELSE OLD.filing_id END USING ERRCODE = '23514';
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION guard_vat_filings_immutable_status()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  override_user_id text;
  override_reason text;
BEGIN
  override_user_id := NULLIF(current_setting('app.lock_override_user_id', true), '');
  override_reason := NULLIF(current_setting('app.lock_override_reason', true), '');
  IF override_user_id IS NOT NULL THEN
    IF override_reason IS NULL OR length(trim(override_reason)) < 8 THEN
      RAISE EXCEPTION 'VAT filing immutability override requires app.lock_override_reason' USING ERRCODE = '23514';
    END IF;
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD.status IN ('filed', 'amended', 'voided') THEN
      RAISE EXCEPTION 'filed VAT filing cannot be hard-deleted: %', OLD.id USING ERRCODE = '23514';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.status IN ('filed', 'amended', 'voided') THEN
    IF OLD.status = 'voided' AND NEW.status IS DISTINCT FROM OLD.status THEN
      RAISE EXCEPTION 'voided VAT filing cannot change status without override: % -> %', OLD.status, NEW.status USING ERRCODE = '23514';
    END IF;

    IF NEW.status IN ('draft', 'ready_for_review') THEN
      RAISE EXCEPTION 'VAT filing status cannot move backward after filing: % -> %', OLD.status, NEW.status USING ERRCODE = '23514';
    END IF;

    IF NEW.filing_type IS DISTINCT FROM OLD.filing_type
      OR NEW.period_year IS DISTINCT FROM OLD.period_year
      OR NEW.period_month IS DISTINCT FROM OLD.period_month
      OR NEW.filing_kind IS DISTINCT FROM OLD.filing_kind
      OR NEW.version IS DISTINCT FROM OLD.version
      OR NEW.output_vat_total IS DISTINCT FROM OLD.output_vat_total
      OR NEW.input_vat_total IS DISTINCT FROM OLD.input_vat_total
      OR NEW.pp36_vat_total IS DISTINCT FROM OLD.pp36_vat_total
      OR NEW.pp36_reclaim_total IS DISTINCT FROM OLD.pp36_reclaim_total
      OR NEW.carryforward_in IS DISTINCT FROM OLD.carryforward_in
      OR NEW.carryforward_out IS DISTINCT FROM OLD.carryforward_out
      OR NEW.net_payable IS DISTINCT FROM OLD.net_payable
      OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at THEN
      RAISE EXCEPTION 'filed VAT filing totals and identity are immutable: %', OLD.id USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION guard_vat_filings_amendment_chain()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  amended_filing vat_filings%ROWTYPE;
BEGIN
  IF NEW.amends_filing_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO amended_filing
  FROM vat_filings
  WHERE id = NEW.amends_filing_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  IF NEW.filing_kind <> 'amendment' THEN
    RAISE EXCEPTION 'VAT filing with amends_filing_id must use amendment kind: %', NEW.id USING ERRCODE = '23514';
  END IF;

  IF amended_filing.status NOT IN ('filed', 'amended') THEN
    RAISE EXCEPTION 'VAT amendment must target a filed VAT filing: %', NEW.id USING ERRCODE = '23514';
  END IF;

  IF NEW.filing_type IS DISTINCT FROM amended_filing.filing_type
    OR NEW.period_year IS DISTINCT FROM amended_filing.period_year
    OR NEW.period_month IS DISTINCT FROM amended_filing.period_month
    OR NEW.establishment_id IS DISTINCT FROM amended_filing.establishment_id THEN
    RAISE EXCEPTION 'VAT amendment must target same filing type, establishment, and period: %', NEW.id USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION guard_vat_input_items_allocated_frozen()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NULLIF(current_setting('app.lock_override_user_id', true), '') IS NOT NULL THEN
    IF NULLIF(current_setting('app.lock_override_reason', true), '') IS NULL OR length(trim(current_setting('app.lock_override_reason', true))) < 8 THEN
      RAISE EXCEPTION 'VAT input item override requires app.lock_override_reason' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.status IN ('allocated_to_draft', 'filed')
    AND (
      NEW.org_id IS DISTINCT FROM OLD.org_id
      OR NEW.establishment_id IS DISTINCT FROM OLD.establishment_id
      OR NEW.tax_treatment_decision_id IS DISTINCT FROM OLD.tax_treatment_decision_id
      OR NEW.source_document_id IS DISTINCT FROM OLD.source_document_id
      OR NEW.source_document_line_id IS DISTINCT FROM OLD.source_document_line_id
      OR NEW.source_transaction_id IS DISTINCT FROM OLD.source_transaction_id
      OR NEW.source_reconciliation_match_id IS DISTINCT FROM OLD.source_reconciliation_match_id
      OR NEW.vendor_id IS DISTINCT FROM OLD.vendor_id
      OR NEW.tax_invoice_no IS DISTINCT FROM OLD.tax_invoice_no
      OR NEW.tax_invoice_date IS DISTINCT FROM OLD.tax_invoice_date
      OR NEW.tax_invoice_received_date IS DISTINCT FROM OLD.tax_invoice_received_date
      OR NEW.tax_invoice_subtype IS DISTINCT FROM OLD.tax_invoice_subtype
      OR NEW.document_date IS DISTINCT FROM OLD.document_date
      OR NEW.payment_date IS DISTINCT FROM OLD.payment_date
      OR NEW.base_amount IS DISTINCT FROM OLD.base_amount
      OR NEW.vat_amount IS DISTINCT FROM OLD.vat_amount
      OR NEW.vat_rate IS DISTINCT FROM OLD.vat_rate
      OR NEW.eligible_period_year IS DISTINCT FROM OLD.eligible_period_year
      OR NEW.eligible_period_month IS DISTINCT FROM OLD.eligible_period_month
      OR NEW.expiry_period_year IS DISTINCT FROM OLD.expiry_period_year
      OR NEW.expiry_period_month IS DISTINCT FROM OLD.expiry_period_month
      OR NEW.claim_period_year IS DISTINCT FROM OLD.claim_period_year
      OR NEW.claim_period_month IS DISTINCT FROM OLD.claim_period_month
      OR NEW.claim_basis_date IS DISTINCT FROM OLD.claim_basis_date
      OR NEW.claim_window_rule_version_id IS DISTINCT FROM OLD.claim_window_rule_version_id
      OR NEW.draft_filing_id IS DISTINCT FROM OLD.draft_filing_id
      OR NEW.source_snapshot IS DISTINCT FROM OLD.source_snapshot
      OR NEW.source_snapshot_hash IS DISTINCT FROM OLD.source_snapshot_hash
      OR NEW.snapshot_version IS DISTINCT FROM OLD.snapshot_version
      OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at
    ) THEN
    RAISE EXCEPTION 'allocated VAT input item financial/source fields are frozen: %', OLD.id USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION guard_tax_treatment_decisions_vat_bound_source()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  bound_exists boolean;
BEGIN
  IF NULLIF(current_setting('app.lock_override_user_id', true), '') IS NOT NULL THEN
    IF NULLIF(current_setting('app.lock_override_reason', true), '') IS NULL OR length(trim(current_setting('app.lock_override_reason', true))) < 8 THEN
      RAISE EXCEPTION 'VAT source override requires app.lock_override_reason' USING ERRCODE = '23514';
    END IF;
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM vat_input_items
    WHERE tax_treatment_decision_id = OLD.id
      AND org_id = OLD.org_id
      AND deleted_at IS NULL
      AND status IN ('allocated_to_draft', 'filed')
  )
  OR EXISTS (
    SELECT 1 FROM vat_output_items
    WHERE tax_treatment_decision_id = OLD.id
      AND org_id = OLD.org_id
      AND deleted_at IS NULL
      AND status IN ('allocated_to_draft', 'filed')
  )
  OR EXISTS (
    SELECT 1 FROM pp36_obligations
    WHERE tax_treatment_decision_id = OLD.id
      AND org_id = OLD.org_id
      AND deleted_at IS NULL
      AND status IN ('allocated_to_draft_pp36', 'pp36_filed', 'pp36_paid', 'eligible_for_pp30_reclaim', 'reclaimed_in_pp30')
  )
  INTO bound_exists;

  IF bound_exists
    AND (
      TG_OP = 'DELETE'
      OR NEW.org_id IS DISTINCT FROM OLD.org_id
      OR NEW.source_document_id IS DISTINCT FROM OLD.source_document_id
      OR NEW.source_document_line_id IS DISTINCT FROM OLD.source_document_line_id
      OR NEW.source_transaction_id IS DISTINCT FROM OLD.source_transaction_id
      OR NEW.source_payment_id IS DISTINCT FROM OLD.source_payment_id
      OR NEW.source_reconciliation_match_id IS DISTINCT FROM OLD.source_reconciliation_match_id
      OR NEW.treatment_type IS DISTINCT FROM OLD.treatment_type
      OR NEW.review_status IS DISTINCT FROM OLD.review_status
      OR NEW.rule_version_id IS DISTINCT FROM OLD.rule_version_id
      OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at
    ) THEN
    RAISE EXCEPTION 'VAT-bound tax treatment decision cannot be mutated or deleted without amendment: %', OLD.id USING ERRCODE = '23514';
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION guard_tax_payment_events_append_only()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NULLIF(current_setting('app.lock_override_user_id', true), '') IS NOT NULL THEN
    IF NULLIF(current_setting('app.lock_override_reason', true), '') IS NULL OR length(trim(current_setting('app.lock_override_reason', true))) < 8 THEN
      RAISE EXCEPTION 'tax payment event override requires app.lock_override_reason' USING ERRCODE = '23514';
    END IF;
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'tax payment events are append-only: %', OLD.id USING ERRCODE = '23514';
  END IF;

  IF NEW.org_id IS DISTINCT FROM OLD.org_id
    OR NEW.filing_id IS DISTINCT FROM OLD.filing_id
    OR NEW.event_type IS DISTINCT FROM OLD.event_type
    OR NEW.paid_at IS DISTINCT FROM OLD.paid_at
    OR NEW.amount IS DISTINCT FROM OLD.amount
    OR NEW.receipt_no IS DISTINCT FROM OLD.receipt_no
    OR NEW.evidence_document_id IS DISTINCT FROM OLD.evidence_document_id
    OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
    OR NEW.created_by_user_id IS DISTINCT FROM OLD.created_by_user_id
    OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'tax payment event immutable fields cannot change: %', OLD.id USING ERRCODE = '23514';
  END IF;

  IF OLD.payment_transaction_id IS NOT NULL
    AND NEW.payment_transaction_id IS DISTINCT FROM OLD.payment_transaction_id THEN
    RAISE EXCEPTION 'tax payment event payment transaction cannot change once matched: %', OLD.id USING ERRCODE = '23514';
  END IF;

  IF OLD.event_status = 'voided' AND NEW.event_status <> 'voided' THEN
    RAISE EXCEPTION 'voided tax payment event cannot be unvoided: %', OLD.id USING ERRCODE = '23514';
  END IF;

  IF OLD.event_status = 'posted_to_gl' AND NEW.event_status NOT IN ('posted_to_gl', 'voided') THEN
    RAISE EXCEPTION 'posted tax payment event cannot move backward: %', OLD.id USING ERRCODE = '23514';
  END IF;

  IF OLD.event_status = 'matched_to_bank' AND NEW.event_status = 'recorded' THEN
    RAISE EXCEPTION 'matched tax payment event cannot move backward: %', OLD.id USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION guard_documents_vat_bound_source()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NULLIF(current_setting('app.lock_override_user_id', true), '') IS NOT NULL THEN
    IF NULLIF(current_setting('app.lock_override_reason', true), '') IS NULL OR length(trim(current_setting('app.lock_override_reason', true))) < 8 THEN
      RAISE EXCEPTION 'VAT source override requires app.lock_override_reason' USING ERRCODE = '23514';
    END IF;
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;
  IF is_vat_document_bound(OLD.org_id, OLD.id)
    AND (
      TG_OP = 'DELETE'
      OR NEW.org_id IS DISTINCT FROM OLD.org_id
      OR NEW.vendor_id IS DISTINCT FROM OLD.vendor_id
      OR NEW.related_document_id IS DISTINCT FROM OLD.related_document_id
      OR NEW.type IS DISTINCT FROM OLD.type
      OR NEW.tax_invoice_subtype IS DISTINCT FROM OLD.tax_invoice_subtype
      OR NEW.is_pp36_subject IS DISTINCT FROM OLD.is_pp36_subject
      OR NEW.document_number IS DISTINCT FROM OLD.document_number
      OR NEW.issue_date IS DISTINCT FROM OLD.issue_date
      OR NEW.due_date IS DISTINCT FROM OLD.due_date
      OR NEW.subtotal IS DISTINCT FROM OLD.subtotal
      OR NEW.vat_amount IS DISTINCT FROM OLD.vat_amount
      OR NEW.total_amount IS DISTINCT FROM OLD.total_amount
      OR NEW.currency IS DISTINCT FROM OLD.currency
      OR NEW.exchange_rate IS DISTINCT FROM OLD.exchange_rate
      OR NEW.total_amount_thb IS DISTINCT FROM OLD.total_amount_thb
      OR NEW.direction IS DISTINCT FROM OLD.direction
      OR NEW.status IS DISTINCT FROM OLD.status
      OR NEW.vat_period_year IS DISTINCT FROM OLD.vat_period_year
      OR NEW.vat_period_month IS DISTINCT FROM OLD.vat_period_month
      OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at
    ) THEN
    RAISE EXCEPTION 'VAT-bound document cannot be mutated or deleted without amendment: %', OLD.id USING ERRCODE = '23514';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION guard_document_line_items_vat_bound_source()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NULLIF(current_setting('app.lock_override_user_id', true), '') IS NOT NULL THEN
    IF NULLIF(current_setting('app.lock_override_reason', true), '') IS NULL OR length(trim(current_setting('app.lock_override_reason', true))) < 8 THEN
      RAISE EXCEPTION 'VAT source override requires app.lock_override_reason' USING ERRCODE = '23514';
    END IF;
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;
  IF is_vat_document_line_bound(OLD.org_id, OLD.id)
    AND (
      TG_OP = 'DELETE'
      OR NEW.org_id IS DISTINCT FROM OLD.org_id
      OR NEW.document_id IS DISTINCT FROM OLD.document_id
      OR NEW.quantity IS DISTINCT FROM OLD.quantity
      OR NEW.unit_price IS DISTINCT FROM OLD.unit_price
      OR NEW.amount IS DISTINCT FROM OLD.amount
      OR NEW.vat_amount IS DISTINCT FROM OLD.vat_amount
      OR NEW.wht_rate IS DISTINCT FROM OLD.wht_rate
      OR NEW.wht_amount IS DISTINCT FROM OLD.wht_amount
      OR NEW.wht_type IS DISTINCT FROM OLD.wht_type
      OR NEW.rd_payment_type_code IS DISTINCT FROM OLD.rd_payment_type_code
      OR NEW.account_code IS DISTINCT FROM OLD.account_code
      OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at
    ) THEN
    RAISE EXCEPTION 'VAT-bound document line cannot be mutated or deleted without amendment: %', OLD.id USING ERRCODE = '23514';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION guard_document_files_vat_bound_source()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NULLIF(current_setting('app.lock_override_user_id', true), '') IS NOT NULL THEN
    IF NULLIF(current_setting('app.lock_override_reason', true), '') IS NULL OR length(trim(current_setting('app.lock_override_reason', true))) < 8 THEN
      RAISE EXCEPTION 'VAT source override requires app.lock_override_reason' USING ERRCODE = '23514';
    END IF;
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;
  IF is_vat_document_bound(OLD.org_id, OLD.document_id)
    AND (
      TG_OP = 'DELETE'
      OR NEW.org_id IS DISTINCT FROM OLD.org_id
      OR NEW.document_id IS DISTINCT FROM OLD.document_id
      OR NEW.file_url IS DISTINCT FROM OLD.file_url
      OR NEW.file_type IS DISTINCT FROM OLD.file_type
      OR NEW.page_number IS DISTINCT FROM OLD.page_number
      OR NEW.original_filename IS DISTINCT FROM OLD.original_filename
      OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at
    ) THEN
    RAISE EXCEPTION 'VAT-bound evidence file cannot be mutated or deleted without amendment: %', OLD.id USING ERRCODE = '23514';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION guard_transactions_vat_bound_source()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NULLIF(current_setting('app.lock_override_user_id', true), '') IS NOT NULL THEN
    IF NULLIF(current_setting('app.lock_override_reason', true), '') IS NULL OR length(trim(current_setting('app.lock_override_reason', true))) < 8 THEN
      RAISE EXCEPTION 'VAT source override requires app.lock_override_reason' USING ERRCODE = '23514';
    END IF;
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;
  IF is_vat_transaction_bound(OLD.org_id, OLD.id)
    AND (
      TG_OP = 'DELETE'
      OR NEW.org_id IS DISTINCT FROM OLD.org_id
      OR NEW.bank_account_id IS DISTINCT FROM OLD.bank_account_id
      OR NEW.statement_id IS DISTINCT FROM OLD.statement_id
      OR NEW.date IS DISTINCT FROM OLD.date
      OR NEW.description IS DISTINCT FROM OLD.description
      OR NEW.amount IS DISTINCT FROM OLD.amount
      OR NEW.type IS DISTINCT FROM OLD.type
      OR NEW.reference_no IS DISTINCT FROM OLD.reference_no
      OR NEW.counterparty IS DISTINCT FROM OLD.counterparty
      OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at
    ) THEN
    RAISE EXCEPTION 'VAT-bound transaction cannot be mutated or deleted without amendment: %', OLD.id USING ERRCODE = '23514';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION guard_payments_vat_bound_source()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NULLIF(current_setting('app.lock_override_user_id', true), '') IS NOT NULL THEN
    IF NULLIF(current_setting('app.lock_override_reason', true), '') IS NULL OR length(trim(current_setting('app.lock_override_reason', true))) < 8 THEN
      RAISE EXCEPTION 'VAT source override requires app.lock_override_reason' USING ERRCODE = '23514';
    END IF;
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;
  IF is_vat_document_bound(OLD.org_id, OLD.document_id)
    AND (
      TG_OP = 'DELETE'
      OR NEW.org_id IS DISTINCT FROM OLD.org_id
      OR NEW.document_id IS DISTINCT FROM OLD.document_id
      OR NEW.payment_date IS DISTINCT FROM OLD.payment_date
      OR NEW.gross_amount IS DISTINCT FROM OLD.gross_amount
      OR NEW.wht_amount_withheld IS DISTINCT FROM OLD.wht_amount_withheld
      OR NEW.net_amount_paid IS DISTINCT FROM OLD.net_amount_paid
      OR NEW.payment_method IS DISTINCT FROM OLD.payment_method
      OR NEW.is_ewht IS DISTINCT FROM OLD.is_ewht
      OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at
    ) THEN
    RAISE EXCEPTION 'VAT-bound payment cannot be mutated or deleted without amendment: %', OLD.id USING ERRCODE = '23514';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION guard_reconciliation_matches_vat_bound_source()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NULLIF(current_setting('app.lock_override_user_id', true), '') IS NOT NULL THEN
    IF NULLIF(current_setting('app.lock_override_reason', true), '') IS NULL OR length(trim(current_setting('app.lock_override_reason', true))) < 8 THEN
      RAISE EXCEPTION 'VAT source override requires app.lock_override_reason' USING ERRCODE = '23514';
    END IF;
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;
  IF is_vat_reconciliation_match_bound(OLD.org_id, OLD.id)
    AND (
      TG_OP = 'DELETE'
      OR NEW.org_id IS DISTINCT FROM OLD.org_id
      OR NEW.transaction_id IS DISTINCT FROM OLD.transaction_id
      OR NEW.document_id IS DISTINCT FROM OLD.document_id
      OR NEW.payment_id IS DISTINCT FROM OLD.payment_id
      OR NEW.matched_amount IS DISTINCT FROM OLD.matched_amount
      OR NEW.match_type IS DISTINCT FROM OLD.match_type
      OR NEW.confidence IS DISTINCT FROM OLD.confidence
      OR NEW.matched_by IS DISTINCT FROM OLD.matched_by
      OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at
    ) THEN
    RAISE EXCEPTION 'VAT-bound reconciliation match cannot be mutated or deleted without amendment: %', OLD.id USING ERRCODE = '23514';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER "vat_filing_lines_immutable" BEFORE INSERT OR UPDATE OR DELETE ON "vat_filing_lines" FOR EACH ROW EXECUTE FUNCTION guard_vat_filing_lines_immutable();
--> statement-breakpoint
CREATE TRIGGER "vat_filings_immutable_status" BEFORE UPDATE OR DELETE ON "vat_filings" FOR EACH ROW EXECUTE FUNCTION guard_vat_filings_immutable_status();
--> statement-breakpoint
CREATE TRIGGER "vat_filings_amendment_chain" BEFORE INSERT OR UPDATE OF "amends_filing_id","filing_type","period_year","period_month","establishment_id","filing_kind" ON "vat_filings" FOR EACH ROW EXECUTE FUNCTION guard_vat_filings_amendment_chain();
--> statement-breakpoint
CREATE TRIGGER "vat_input_items_allocated_frozen" BEFORE UPDATE ON "vat_input_items" FOR EACH ROW EXECUTE FUNCTION guard_vat_input_items_allocated_frozen();
--> statement-breakpoint
CREATE TRIGGER "tax_treatment_decisions_vat_bound_source" BEFORE UPDATE OR DELETE ON "tax_treatment_decisions" FOR EACH ROW EXECUTE FUNCTION guard_tax_treatment_decisions_vat_bound_source();
--> statement-breakpoint
CREATE TRIGGER "tax_payment_events_append_only" BEFORE UPDATE OR DELETE ON "tax_payment_events" FOR EACH ROW EXECUTE FUNCTION guard_tax_payment_events_append_only();
--> statement-breakpoint
CREATE TRIGGER "documents_vat_bound_source" BEFORE UPDATE OR DELETE ON "documents" FOR EACH ROW EXECUTE FUNCTION guard_documents_vat_bound_source();
--> statement-breakpoint
CREATE TRIGGER "document_line_items_vat_bound_source" BEFORE UPDATE OR DELETE ON "document_line_items" FOR EACH ROW EXECUTE FUNCTION guard_document_line_items_vat_bound_source();
--> statement-breakpoint
CREATE TRIGGER "document_files_vat_bound_source" BEFORE UPDATE OR DELETE ON "document_files" FOR EACH ROW EXECUTE FUNCTION guard_document_files_vat_bound_source();
--> statement-breakpoint
CREATE TRIGGER "transactions_vat_bound_source" BEFORE UPDATE OR DELETE ON "transactions" FOR EACH ROW EXECUTE FUNCTION guard_transactions_vat_bound_source();
--> statement-breakpoint
CREATE TRIGGER "payments_vat_bound_source" BEFORE UPDATE OR DELETE ON "payments" FOR EACH ROW EXECUTE FUNCTION guard_payments_vat_bound_source();
--> statement-breakpoint
CREATE TRIGGER "reconciliation_matches_vat_bound_source" BEFORE UPDATE OR DELETE ON "reconciliation_matches" FOR EACH ROW EXECUTE FUNCTION guard_reconciliation_matches_vat_bound_source();
