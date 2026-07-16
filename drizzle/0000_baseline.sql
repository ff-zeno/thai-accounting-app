--
-- PostgreSQL database dump
--


-- Dumped from database version 16.14
-- Dumped by pg_dump version 16.14

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--



--
-- Name: audit_action; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.audit_action AS ENUM (
    'create',
    'update',
    'delete',
    'void',
    'read_pii'
);


--
-- Name: compiled_pattern_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.compiled_pattern_status AS ENUM (
    'shadow',
    'active',
    'retired'
);


--
-- Name: consensus_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.consensus_status AS ENUM (
    'candidate',
    'shadow_pending',
    'promoted',
    'retired'
);


--
-- Name: document_direction; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.document_direction AS ENUM (
    'expense',
    'income'
);


--
-- Name: document_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.document_status AS ENUM (
    'draft',
    'confirmed',
    'partially_paid',
    'paid',
    'voided'
);


--
-- Name: document_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.document_type AS ENUM (
    'invoice',
    'receipt',
    'debit_note',
    'credit_note',
    'wht_certificate_received'
);


--
-- Name: entity_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.entity_type AS ENUM (
    'individual',
    'company',
    'foreign'
);


--
-- Name: extraction_correction_session_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.extraction_correction_session_status AS ENUM (
    'draft',
    'confirmed',
    'abandoned'
);


--
-- Name: extraction_learning_candidate_scope; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.extraction_learning_candidate_scope AS ENUM (
    'document',
    'vendor',
    'vendor_document_family',
    'global_candidate'
);


--
-- Name: extraction_learning_candidate_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.extraction_learning_candidate_status AS ENUM (
    'candidate',
    'shadow',
    'active',
    'retired',
    'rejected'
);


--
-- Name: extraction_learning_candidate_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.extraction_learning_candidate_type AS ENUM (
    'field_exemplar',
    'field_rule',
    'document_family_rule',
    'vendor_rule'
);


--
-- Name: field_criticality; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.field_criticality AS ENUM (
    'low',
    'medium',
    'high'
);


--
-- Name: filing_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.filing_status AS ENUM (
    'draft',
    'filed',
    'paid'
);


--
-- Name: gl_account_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.gl_account_type AS ENUM (
    'asset',
    'liability',
    'equity',
    'revenue',
    'expense',
    'cogs',
    'contra_asset',
    'contra_liability'
);


--
-- Name: gl_entry_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.gl_entry_type AS ENUM (
    'manual',
    'opening_balance',
    'memo',
    'auto_document',
    'auto_sales',
    'auto_payment',
    'auto_payroll',
    'auto_fx_revaluation',
    'auto_depreciation',
    'auto_accrual',
    'auto_year_end_close',
    'auto_pp30_settlement',
    'auto_fixed_asset_disposal'
);


--
-- Name: gl_tax_treatment; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.gl_tax_treatment AS ENUM (
    'taxable_revenue',
    'vat_exempt_revenue',
    'zero_rated_revenue',
    'non_deductible_expense',
    'vat_recoverable_input',
    'non_recoverable_input',
    'n_a'
);


--
-- Name: gl_vat_register_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.gl_vat_register_role AS ENUM (
    'output_tax_payable',
    'input_tax_recoverable',
    'pp36_payable',
    'pp36_reclaim',
    'n_a'
);


--
-- Name: gl_wht_register_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.gl_wht_register_role AS ENUM (
    'wht_payable_pnd1',
    'wht_payable_pnd3',
    'wht_payable_pnd53',
    'wht_payable_pnd54',
    'wht_credits_receivable',
    'n_a'
);


--
-- Name: match_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.match_type AS ENUM (
    'exact',
    'fuzzy',
    'manual',
    'ai_suggested',
    'reference',
    'multi_signal',
    'pattern',
    'rule'
);


--
-- Name: matched_by; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.matched_by AS ENUM (
    'auto',
    'manual',
    'rule',
    'pattern'
);


--
-- Name: payment_method; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.payment_method AS ENUM (
    'bank_transfer',
    'promptpay',
    'cheque',
    'cash'
);


--
-- Name: pipeline_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.pipeline_status AS ENUM (
    'uploaded',
    'extracting',
    'validating',
    'validated',
    'completed',
    'failed_extraction',
    'failed_validation'
);


--
-- Name: posting_kind; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.posting_kind AS ENUM (
    'processor_settlement',
    'cash_deposit',
    'fx_revaluation',
    'year_end_close_revenue_summary',
    'year_end_close_to_retained_earnings',
    'cit_accrual',
    'cit_payment',
    'manual_pair',
    'manual_reversal',
    'opening_balance_pair',
    'pos_primary_sale',
    'tax_payment_pp30',
    'tax_payment_pp36',
    'vat_pp36_self_assessment',
    'vat_pp36_reclaim_transfer',
    'wht_credit_received',
    'import_broker_invoice',
    'import_payment_clearing',
    'inventory_cogs',
    'inventory_sale_cogs',
    'inventory_count_variance',
    'inventory_purchase',
    'payroll_accrual',
    'payroll_net_payment',
    'payroll_pnd1_remittance',
    'payroll_sso_remittance',
    'depreciation',
    'fixed_asset_disposal'
);


--
-- Name: pp36_obligation_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.pp36_obligation_status AS ENUM (
    'needs_review',
    'pp36_required',
    'allocated_to_draft_pp36',
    'pp36_filed',
    'pp36_paid',
    'eligible_for_pp30_reclaim',
    'reclaimed_in_pp30',
    'voided_by_amendment'
);


--
-- Name: pp36_period_basis; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.pp36_period_basis AS ENUM (
    'payment_date',
    'invoice_date',
    'occurred_on',
    'cpa_reviewed_override'
);


--
-- Name: reconciliation_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.reconciliation_status AS ENUM (
    'unmatched',
    'matched',
    'partially_matched'
);


--
-- Name: tax_invoice_subtype; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.tax_invoice_subtype AS ENUM (
    'full_ti',
    'abb',
    'e_tax_invoice',
    'not_a_ti'
);


--
-- Name: tax_payment_event_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.tax_payment_event_status AS ENUM (
    'recorded',
    'matched_to_bank',
    'posted_to_gl',
    'voided'
);


--
-- Name: tax_payment_event_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.tax_payment_event_type AS ENUM (
    'payment',
    'refund_received',
    'credit_applied',
    'adjustment'
);


--
-- Name: tax_posting_outbox_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.tax_posting_outbox_status AS ENUM (
    'pending',
    'queued',
    'posted',
    'failed',
    'skipped'
);


--
-- Name: tax_rule_scope; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.tax_rule_scope AS ENUM (
    'pp30_input_claim_window',
    'pp36_period_basis',
    'pp36_reclaim_timing',
    'output_tax_point',
    'tax_invoice_claimability'
);


--
-- Name: tax_treatment_review_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.tax_treatment_review_status AS ENUM (
    'ai_suggested',
    'needs_review',
    'confirmed',
    'rejected',
    'voided'
);


--
-- Name: tax_treatment_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.tax_treatment_type AS ENUM (
    'local_vat_input',
    'local_vat_output',
    'not_vatable',
    'pp36_foreign_service',
    'wht_only',
    'mixed'
);


--
-- Name: transaction_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.transaction_type AS ENUM (
    'debit',
    'credit'
);


--
-- Name: vat_credit_carryforward_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.vat_credit_carryforward_status AS ENUM (
    'available',
    'applied',
    'refunded',
    'adjusted'
);


--
-- Name: vat_filing_kind; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.vat_filing_kind AS ENUM (
    'ordinary',
    'additional',
    'amendment'
);


--
-- Name: vat_filing_line_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.vat_filing_line_type AS ENUM (
    'input',
    'output',
    'pp36_obligation',
    'pp36_reclaim',
    'credit_note_adjustment',
    'carryforward'
);


--
-- Name: vat_filing_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.vat_filing_status AS ENUM (
    'draft',
    'ready_for_review',
    'filed',
    'amended',
    'voided'
);


--
-- Name: vat_filing_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.vat_filing_type AS ENUM (
    'pp30',
    'pp36'
);


--
-- Name: vat_input_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.vat_input_status AS ENUM (
    'needs_review',
    'awaiting_tax_invoice',
    'claimable',
    'held',
    'do_not_claim',
    'allocated_to_draft',
    'filed',
    'expired',
    'voided_by_amendment'
);


--
-- Name: vat_output_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.vat_output_status AS ENUM (
    'needs_review',
    'reportable',
    'allocated_to_draft',
    'filed'
);


--
-- Name: vat_output_tax_point_basis; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.vat_output_tax_point_basis AS ENUM (
    'issue_date',
    'payment_date',
    'delivery_date',
    'cpa_reviewed_override'
);


--
-- Name: vat_payment_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.vat_payment_status AS ENUM (
    'not_required',
    'waiting_to_pay_tax',
    'tax_paid',
    'refund_or_credit'
);


--
-- Name: vat_refund_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.vat_refund_status AS ENUM (
    'not_requested',
    'requested',
    'approved',
    'received',
    'rejected'
);


--
-- Name: vendor_tier_scope_kind; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.vendor_tier_scope_kind AS ENUM (
    'org',
    'global'
);


--
-- Name: wht_cert_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.wht_cert_status AS ENUM (
    'draft',
    'issued',
    'voided',
    'replaced'
);


--
-- Name: wht_form_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.wht_form_type AS ENUM (
    'pnd3',
    'pnd53',
    'pnd54',
    'pnd2'
);


--
-- Name: check_period_lock(uuid, uuid, text, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_period_lock(p_org_id uuid, p_establishment_id uuid, p_domain text, p_period_year integer, p_period_month integer) RETURNS void
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


--
-- Name: enforce_extraction_log_exemplars_same_org(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enforce_extraction_log_exemplars_same_org() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  bad_exemplar_id uuid;
BEGIN
  IF NEW.exemplar_ids IS NULL OR array_length(NEW.exemplar_ids, 1) IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT exemplar_id INTO bad_exemplar_id
  FROM unnest(NEW.exemplar_ids) AS exemplar_id
  LEFT JOIN extraction_exemplars
    ON extraction_exemplars.id = exemplar_id
    AND extraction_exemplars.org_id = NEW.org_id
    AND extraction_exemplars.deleted_at IS NULL
  WHERE extraction_exemplars.id IS NULL
  LIMIT 1;

  IF bad_exemplar_id IS NOT NULL THEN
    RAISE EXCEPTION 'cross-org or missing extraction exemplar rejected: %', bad_exemplar_id USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: enforce_journal_entry_header_balance(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enforce_journal_entry_header_balance() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  line_debit numeric(14, 2);
  line_credit numeric(14, 2);
BEGIN
  SELECT COALESCE(SUM(debit_amount), 0), COALESCE(SUM(credit_amount), 0)
    INTO line_debit, line_credit
  FROM journal_lines
  WHERE journal_entry_id = NEW.id;

  IF line_debit <> NEW.total_debit OR line_credit <> NEW.total_credit THEN
    RAISE EXCEPTION 'Journal entry header totals do not match line totals';
  END IF;

  RETURN NULL;
END;
$$;


--
-- Name: enforce_journal_entry_line_balance(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enforce_journal_entry_line_balance() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  target_entry_id uuid;
  line_debit numeric(14, 2);
  line_credit numeric(14, 2);
  header_debit numeric(14, 2);
  header_credit numeric(14, 2);
BEGIN
  target_entry_id := COALESCE(NEW.journal_entry_id, OLD.journal_entry_id);

  SELECT COALESCE(SUM(debit_amount), 0), COALESCE(SUM(credit_amount), 0)
    INTO line_debit, line_credit
  FROM journal_lines
  WHERE journal_entry_id = target_entry_id;

  SELECT total_debit, total_credit INTO header_debit, header_credit
  FROM journal_entries
  WHERE id = target_entry_id;

  IF header_debit IS NULL THEN
    RETURN NULL;
  END IF;

  IF line_debit <> header_debit OR line_credit <> header_credit THEN
    RAISE EXCEPTION 'Journal entry line totals do not match header totals';
  END IF;

  RETURN NULL;
END;
$$;


--
-- Name: enforce_reconciliation_allocation_limits(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enforce_reconciliation_allocation_limits() RETURNS trigger
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


--
-- Name: enforce_same_org_reference(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enforce_same_org_reference() RETURNS trigger
    LANGUAGE plpgsql
    AS $_$
DECLARE
  referenced_org_id uuid;
  referenced_id uuid;
  has_deleted_at boolean;
BEGIN
  referenced_id := (to_jsonb(NEW) ->> TG_ARGV[1])::uuid;

  IF referenced_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = TG_ARGV[0]
      AND column_name = 'deleted_at'
  ) INTO has_deleted_at;

  IF has_deleted_at THEN
    EXECUTE format('SELECT org_id FROM %I WHERE id = $1 AND deleted_at IS NULL', TG_ARGV[0])
      INTO referenced_org_id
      USING referenced_id;
  ELSE
    EXECUTE format('SELECT org_id FROM %I WHERE id = $1', TG_ARGV[0])
      INTO referenced_org_id
      USING referenced_id;
  END IF;

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
$_$;


--
-- Name: enforce_vendor_tier_org_scope(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enforce_vendor_tier_org_scope() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  vendor_org_id uuid;
BEGIN
  IF NEW.scope_kind = 'global' THEN
    IF NEW.org_id IS NOT NULL THEN
      RAISE EXCEPTION 'global vendor_tier rows must not carry org_id' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.org_id IS NULL THEN
    RAISE EXCEPTION 'org-scoped vendor_tier rows require org_id' USING ERRCODE = '23514';
  END IF;

  SELECT org_id INTO vendor_org_id
  FROM vendors
  WHERE id = NEW.vendor_id
    AND deleted_at IS NULL;

  IF vendor_org_id IS NULL THEN
    RAISE EXCEPTION 'vendor_tier references missing vendor %', NEW.vendor_id USING ERRCODE = '23514';
  END IF;

  IF vendor_org_id <> NEW.org_id THEN
    RAISE EXCEPTION 'cross-org vendor_tier rejected: vendor % belongs to another org', NEW.vendor_id USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: ensure_audit_log_monthly_partitions(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ensure_audit_log_monthly_partitions(months_ahead integer DEFAULT 12) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
  cursor_month date;
  end_month date;
BEGIN
  cursor_month := date_trunc('month', CURRENT_DATE - INTERVAL '1 month')::date;
  end_month := date_trunc('month', CURRENT_DATE + make_interval(months => months_ahead))::date;

  WHILE cursor_month <= end_month LOOP
    PERFORM ensure_audit_log_partition_for_month(cursor_month);
    cursor_month := (cursor_month + INTERVAL '1 month')::date;
  END LOOP;
END;
$$;


--
-- Name: ensure_audit_log_partition_for_month(date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ensure_audit_log_partition_for_month(target_month date) RETURNS void
    LANGUAGE plpgsql
    AS $_$
DECLARE
  month_start date;
  month_end date;
  partition_name text;
  default_rows bigint;
BEGIN
  month_start := date_trunc('month', target_month)::date;
  month_end := (month_start + INTERVAL '1 month')::date;
  partition_name := 'audit_log_' || to_char(month_start, 'YYYY_MM');

  IF to_regclass(partition_name) IS NOT NULL THEN
    RETURN;
  END IF;

  SELECT COUNT(*) INTO default_rows
  FROM audit_log_default
  WHERE created_at >= month_start::timestamp with time zone
    AND created_at < month_end::timestamp with time zone;

  IF default_rows = 0 THEN
    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS %I PARTITION OF audit_log FOR VALUES FROM (%L) TO (%L)',
      partition_name,
      month_start::timestamp with time zone,
      month_end::timestamp with time zone
    );
    RETURN;
  END IF;

  EXECUTE format('CREATE TABLE %I (LIKE audit_log INCLUDING DEFAULTS INCLUDING CONSTRAINTS)', partition_name);
  EXECUTE format(
    'INSERT INTO %I (id, org_id, entity_type, entity_id, action, old_value, new_value, actor_id, created_at)
     SELECT id, org_id, entity_type, entity_id, action, old_value, new_value, actor_id, created_at
     FROM audit_log_default
     WHERE created_at >= $1 AND created_at < $2',
    partition_name
  )
  USING month_start::timestamp with time zone, month_end::timestamp with time zone;

  DELETE FROM audit_log_default
  WHERE created_at >= month_start::timestamp with time zone
    AND created_at < month_end::timestamp with time zone;

  EXECUTE format(
    'ALTER TABLE audit_log ATTACH PARTITION %I FOR VALUES FROM (%L) TO (%L)',
    partition_name,
    month_start::timestamp with time zone,
    month_end::timestamp with time zone
  );
END;
$_$;


--
-- Name: guard_allocation_rule_target_same_org(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guard_allocation_rule_target_same_org() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  rule_org_id uuid;
  cost_center_org_id uuid;
  project_org_id uuid;
BEGIN
  SELECT org_id INTO rule_org_id FROM allocation_rules WHERE id = NEW.allocation_rule_id;
  IF rule_org_id IS NULL OR rule_org_id <> NEW.org_id THEN
    RAISE EXCEPTION 'Allocation target must belong to the same organization as allocation rule';
  END IF;

  IF NEW.cost_center_id IS NOT NULL THEN
    SELECT org_id INTO cost_center_org_id FROM cost_centers WHERE id = NEW.cost_center_id;
    IF cost_center_org_id IS NULL OR cost_center_org_id <> NEW.org_id THEN
      RAISE EXCEPTION 'Allocation target cost center must belong to the same organization';
    END IF;
  END IF;

  IF NEW.project_id IS NOT NULL THEN
    SELECT org_id INTO project_org_id FROM projects WHERE id = NEW.project_id;
    IF project_org_id IS NULL OR project_org_id <> NEW.org_id THEN
      RAISE EXCEPTION 'Allocation target project must belong to the same organization';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: guard_book_tax_adjustment_same_org(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guard_book_tax_adjustment_same_org() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  account_org_id uuid;
BEGIN
  IF NEW.gl_account_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT org_id INTO account_org_id FROM gl_accounts WHERE id = NEW.gl_account_id;
  IF account_org_id IS NULL OR account_org_id <> NEW.org_id THEN
    RAISE EXCEPTION 'Book-tax adjustment GL account must belong to the same organization';
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: guard_cit_filing_refs_same_org(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guard_cit_filing_refs_same_org() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  ref_org_id uuid;
BEGIN
  IF NEW.bank_transaction_id IS NOT NULL THEN
    SELECT org_id INTO ref_org_id FROM transactions WHERE id = NEW.bank_transaction_id;
    IF ref_org_id IS NULL OR ref_org_id <> NEW.org_id THEN
      RAISE EXCEPTION 'CIT filing bank transaction must belong to the same organization';
    END IF;
  END IF;
  IF NEW.confirmation_document_id IS NOT NULL THEN
    SELECT org_id INTO ref_org_id FROM documents WHERE id = NEW.confirmation_document_id;
    IF ref_org_id IS NULL OR ref_org_id <> NEW.org_id THEN
      RAISE EXCEPTION 'CIT filing confirmation document must belong to the same organization';
    END IF;
  END IF;
  IF NEW.working_paper_document_id IS NOT NULL THEN
    SELECT org_id INTO ref_org_id FROM documents WHERE id = NEW.working_paper_document_id;
    IF ref_org_id IS NULL OR ref_org_id <> NEW.org_id THEN
      RAISE EXCEPTION 'CIT filing working paper document must belong to the same organization';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: guard_close_checklist_establishment_same_org(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guard_close_checklist_establishment_same_org() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  establishment_org_id uuid;
BEGIN
  IF NEW.establishment_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT org_id INTO establishment_org_id FROM establishments WHERE id = NEW.establishment_id;
  IF establishment_org_id IS NULL OR establishment_org_id <> NEW.org_id THEN
    RAISE EXCEPTION 'Close checklist establishment must belong to the same organization';
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: guard_close_checklist_item_same_org(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guard_close_checklist_item_same_org() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  checklist_org_id uuid;
BEGIN
  SELECT org_id INTO checklist_org_id FROM close_checklists WHERE id = NEW.checklist_id;
  IF checklist_org_id IS NULL OR checklist_org_id <> NEW.org_id THEN
    RAISE EXCEPTION 'Close checklist item must belong to the same organization as checklist';
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: guard_copilot_session_same_org(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guard_copilot_session_same_org() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  session_org_id uuid;
BEGIN
  IF NEW.session_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT org_id INTO session_org_id FROM copilot_sessions WHERE id = NEW.session_id;
  IF session_org_id IS NULL OR session_org_id <> NEW.org_id THEN
    RAISE EXCEPTION 'Copilot session must belong to the same organization';
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: guard_cost_center_parent_same_org(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guard_cost_center_parent_same_org() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  parent_org_id uuid;
BEGIN
  IF NEW.parent_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT org_id INTO parent_org_id FROM cost_centers WHERE id = NEW.parent_id;
  IF parent_org_id IS NULL OR parent_org_id <> NEW.org_id THEN
    RAISE EXCEPTION 'Cost center parent must belong to the same organization';
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: guard_depreciation_schedule_same_org(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guard_depreciation_schedule_same_org() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  asset_org_id uuid;
  journal_org_id uuid;
BEGIN
  SELECT org_id INTO asset_org_id FROM fixed_assets WHERE id = NEW.fixed_asset_id;
  IF asset_org_id IS NULL OR asset_org_id <> NEW.org_id THEN
    RAISE EXCEPTION 'Depreciation schedule must belong to the same organization as fixed asset';
  END IF;

  IF NEW.journal_entry_id IS NOT NULL THEN
    SELECT org_id INTO journal_org_id FROM journal_entries WHERE id = NEW.journal_entry_id;
    IF journal_org_id IS NULL OR journal_org_id <> NEW.org_id THEN
      RAISE EXCEPTION 'Depreciation schedule journal entry must belong to the same organization';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: guard_document_files_vat_bound_source(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guard_document_files_vat_bound_source() RETURNS trigger
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


--
-- Name: guard_document_line_items_vat_bound_source(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guard_document_line_items_vat_bound_source() RETURNS trigger
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


--
-- Name: guard_documents_vat_bound_source(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guard_documents_vat_bound_source() RETURNS trigger
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


--
-- Name: guard_documents_vat_period_lock(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guard_documents_vat_period_lock() RETURNS trigger
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


--
-- Name: guard_employee_allowance_same_org(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guard_employee_allowance_same_org() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  employee_org_id uuid;
BEGIN
  SELECT org_id INTO employee_org_id FROM employees WHERE id = NEW.employee_id;
  IF employee_org_id IS NULL OR employee_org_id <> NEW.org_id THEN
    RAISE EXCEPTION 'Employee allowance must belong to the same organization as employee';
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: guard_establishment_same_org(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guard_establishment_same_org() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  establishment_org_id uuid;
BEGIN
  SELECT org_id INTO establishment_org_id
  FROM establishments
  WHERE id = NEW.establishment_id;

  IF establishment_org_id IS NULL OR establishment_org_id <> NEW.org_id THEN
    RAISE EXCEPTION 'Establishment must belong to the same organization';
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: guard_finalized_import_child_immutability(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guard_finalized_import_child_immutability() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  parent_finalized boolean;
BEGIN
  SELECT is_finalized INTO parent_finalized FROM imports WHERE id = OLD.import_id;
  IF parent_finalized THEN
    RAISE EXCEPTION 'Finalized import packets are immutable';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    RETURN NEW;
  END IF;

  RETURN OLD;
END;
$$;


--
-- Name: guard_fixed_asset_establishment_same_org(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guard_fixed_asset_establishment_same_org() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  establishment_org_id uuid;
BEGIN
  IF NEW.establishment_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT org_id INTO establishment_org_id FROM establishments WHERE id = NEW.establishment_id;
  IF establishment_org_id IS NULL OR establishment_org_id <> NEW.org_id THEN
    RAISE EXCEPTION 'Fixed asset establishment must belong to the same organization';
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: guard_fixed_asset_refs_same_org(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guard_fixed_asset_refs_same_org() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  ref_org_id uuid;
BEGIN
  IF NEW.gl_account_id IS NOT NULL THEN
    SELECT org_id INTO ref_org_id FROM gl_accounts WHERE id = NEW.gl_account_id;
    IF ref_org_id IS NULL OR ref_org_id <> NEW.org_id THEN
      RAISE EXCEPTION 'Fixed asset GL account must belong to the same organization';
    END IF;
  END IF;

  IF NEW.accumulated_depreciation_account_id IS NOT NULL THEN
    SELECT org_id INTO ref_org_id FROM gl_accounts WHERE id = NEW.accumulated_depreciation_account_id;
    IF ref_org_id IS NULL OR ref_org_id <> NEW.org_id THEN
      RAISE EXCEPTION 'Fixed asset accumulated depreciation account must belong to the same organization';
    END IF;
  END IF;

  IF NEW.depreciation_expense_account_id IS NOT NULL THEN
    SELECT org_id INTO ref_org_id FROM gl_accounts WHERE id = NEW.depreciation_expense_account_id;
    IF ref_org_id IS NULL OR ref_org_id <> NEW.org_id THEN
      RAISE EXCEPTION 'Fixed asset depreciation expense account must belong to the same organization';
    END IF;
  END IF;

  IF NEW.acquisition_document_id IS NOT NULL THEN
    SELECT org_id INTO ref_org_id FROM documents WHERE id = NEW.acquisition_document_id;
    IF ref_org_id IS NULL OR ref_org_id <> NEW.org_id THEN
      RAISE EXCEPTION 'Fixed asset acquisition document must belong to the same organization';
    END IF;
  END IF;

  IF NEW.disposal_document_id IS NOT NULL THEN
    SELECT org_id INTO ref_org_id FROM documents WHERE id = NEW.disposal_document_id;
    IF ref_org_id IS NULL OR ref_org_id <> NEW.org_id THEN
      RAISE EXCEPTION 'Fixed asset disposal document must belong to the same organization';
    END IF;
  END IF;

  IF NEW.assigned_to_employee_id IS NOT NULL THEN
    SELECT org_id INTO ref_org_id FROM employees WHERE id = NEW.assigned_to_employee_id;
    IF ref_org_id IS NULL OR ref_org_id <> NEW.org_id THEN
      RAISE EXCEPTION 'Fixed asset assignee must belong to the same organization';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: guard_fx_valuation_layer_same_org(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guard_fx_valuation_layer_same_org() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  journal_org_id uuid;
BEGIN
  IF NEW.journal_entry_id IS NOT NULL THEN
    SELECT org_id INTO journal_org_id FROM journal_entries WHERE id = NEW.journal_entry_id;
    IF journal_org_id IS NULL OR journal_org_id <> NEW.org_id THEN
      RAISE EXCEPTION 'FX valuation journal entry must belong to the same organization';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: guard_gl_account_parent_org(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guard_gl_account_parent_org() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  parent_org_id uuid;
BEGIN
  IF NEW.parent_account_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT org_id INTO parent_org_id
  FROM gl_accounts
  WHERE id = NEW.parent_account_id;

  IF parent_org_id IS NULL OR parent_org_id <> NEW.org_id THEN
    RAISE EXCEPTION 'GL account parent must belong to the same organization';
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: guard_gl_entry_period_lock(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guard_gl_entry_period_lock() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  row_data record;
BEGIN
  row_data := COALESCE(NEW, OLD);
  PERFORM check_period_lock(row_data.org_id, row_data.establishment_id, 'gl', row_data.period_year, row_data.period_month);
  RETURN COALESCE(NEW, OLD);
END;
$$;


--
-- Name: guard_gl_opening_balance_scope(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guard_gl_opening_balance_scope() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  account_org_id uuid;
BEGIN
  SELECT org_id INTO account_org_id FROM gl_accounts WHERE id = NEW.account_id;
  IF account_org_id IS NULL OR account_org_id <> NEW.org_id THEN
    RAISE EXCEPTION 'Opening balance account must belong to the same organization';
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: guard_import_child_same_org(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guard_import_child_same_org() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  import_org_id uuid;
  import_finalized boolean;
  document_org_id uuid;
  transaction_org_id uuid;
  account_org_id uuid;
BEGIN
  SELECT org_id, is_finalized INTO import_org_id, import_finalized
  FROM imports
  WHERE id = NEW.import_id;

  IF import_org_id IS NULL OR import_org_id <> NEW.org_id THEN
    RAISE EXCEPTION 'Import child row must belong to the same organization as the import';
  END IF;

  IF import_finalized THEN
    RAISE EXCEPTION 'Finalized import packets are immutable';
  END IF;

  IF TG_TABLE_NAME = 'import_documents' THEN
    SELECT org_id INTO document_org_id FROM documents WHERE id = NEW.document_id;
    IF document_org_id IS NULL OR document_org_id <> NEW.org_id THEN
      RAISE EXCEPTION 'Import document must belong to the same organization';
    END IF;
  ELSIF TG_TABLE_NAME = 'import_charge_lines' THEN
    SELECT org_id INTO document_org_id FROM documents WHERE id = NEW.source_document_id;
    IF document_org_id IS NULL OR document_org_id <> NEW.org_id THEN
      RAISE EXCEPTION 'Import charge source document must belong to the same organization';
    END IF;

    IF NEW.expense_account_id IS NOT NULL THEN
      SELECT org_id INTO account_org_id FROM gl_accounts WHERE id = NEW.expense_account_id;
      IF account_org_id IS NULL OR account_org_id <> NEW.org_id THEN
        RAISE EXCEPTION 'Import charge expense account must belong to the same organization';
      END IF;
    END IF;
  ELSIF TG_TABLE_NAME = 'import_payments' THEN
    SELECT org_id INTO transaction_org_id FROM transactions WHERE id = NEW.bank_transaction_id;
    IF transaction_org_id IS NULL OR transaction_org_id <> NEW.org_id THEN
      RAISE EXCEPTION 'Import payment transaction must belong to the same organization';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: guard_import_finalize(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guard_import_finalize() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  import_vat_total numeric(14, 2);
  goods_line_count integer;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.is_finalized THEN
      RAISE EXCEPTION 'Finalized import packets are immutable';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.is_finalized THEN
    RAISE EXCEPTION 'Finalized import packets are immutable';
  END IF;

  IF NEW.is_finalized THEN
    SELECT COUNT(*) INTO goods_line_count
    FROM import_goods_lines
    WHERE import_id = NEW.id;

    IF goods_line_count = 0 THEN
      RAISE EXCEPTION 'Cannot finalize import without goods lines';
    END IF;

    SELECT COALESCE(SUM(amount_thb), 0) INTO import_vat_total
    FROM import_charge_lines
    WHERE import_id = NEW.id
      AND vat_treatment = 'is_import_vat';

    IF import_vat_total <> NEW.customs_assessed_import_vat_thb THEN
      RAISE EXCEPTION 'Import VAT charge total % does not match customs assessed import VAT %',
        import_vat_total, NEW.customs_assessed_import_vat_thb;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: guard_import_packet_same_org(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guard_import_packet_same_org() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  establishment_org_id uuid;
  vendor_org_id uuid;
BEGIN
  SELECT org_id INTO establishment_org_id FROM establishments WHERE id = NEW.establishment_id;
  IF establishment_org_id IS NULL OR establishment_org_id <> NEW.org_id THEN
    RAISE EXCEPTION 'Import establishment must belong to the same organization';
  END IF;

  IF NEW.supplier_vendor_id IS NOT NULL THEN
    SELECT org_id INTO vendor_org_id FROM vendors WHERE id = NEW.supplier_vendor_id;
    IF vendor_org_id IS NULL OR vendor_org_id <> NEW.org_id THEN
      RAISE EXCEPTION 'Import supplier vendor must belong to the same organization';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: guard_inventory_count_item_same_org(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guard_inventory_count_item_same_org() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  count_org_id uuid;
  sku_org_id uuid;
BEGIN
  SELECT org_id INTO count_org_id FROM inventory_counts WHERE id = NEW.count_id;
  IF count_org_id IS NULL OR count_org_id <> NEW.org_id THEN
    RAISE EXCEPTION 'Inventory count item must belong to the same organization as the count';
  END IF;

  SELECT org_id INTO sku_org_id FROM skus WHERE id = NEW.sku_id;
  IF sku_org_id IS NULL OR sku_org_id <> NEW.org_id THEN
    RAISE EXCEPTION 'Inventory count item SKU must belong to the same organization';
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: guard_inventory_count_same_org(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guard_inventory_count_same_org() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  establishment_org_id uuid;
BEGIN
  SELECT org_id INTO establishment_org_id FROM establishments WHERE id = NEW.establishment_id;
  IF establishment_org_id IS NULL OR establishment_org_id <> NEW.org_id THEN
    RAISE EXCEPTION 'Inventory count establishment must belong to the same organization';
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: guard_inventory_movement_immutable(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guard_inventory_movement_immutable() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  RAISE EXCEPTION 'Inventory movements are immutable; post a reversing movement instead';
END;
$$;


--
-- Name: guard_inventory_movement_same_org(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guard_inventory_movement_same_org() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  establishment_org_id uuid;
  sku_org_id uuid;
  journal_org_id uuid;
BEGIN
  SELECT org_id INTO establishment_org_id FROM establishments WHERE id = NEW.establishment_id;
  IF establishment_org_id IS NULL OR establishment_org_id <> NEW.org_id THEN
    RAISE EXCEPTION 'Inventory movement establishment must belong to the same organization';
  END IF;

  SELECT org_id INTO sku_org_id FROM skus WHERE id = NEW.sku_id;
  IF sku_org_id IS NULL OR sku_org_id <> NEW.org_id THEN
    RAISE EXCEPTION 'Inventory movement SKU must belong to the same organization';
  END IF;

  IF NEW.journal_entry_id IS NOT NULL THEN
    SELECT org_id INTO journal_org_id FROM journal_entries WHERE id = NEW.journal_entry_id;
    IF journal_org_id IS NULL OR journal_org_id <> NEW.org_id THEN
      RAISE EXCEPTION 'Inventory movement journal entry must belong to the same organization';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: guard_inventory_overhead_component_same_org(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guard_inventory_overhead_component_same_org() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  import_org_id uuid;
  import_goods_line_org_id uuid;
  import_charge_line_org_id uuid;
  sku_org_id uuid;
BEGIN
  SELECT org_id INTO import_org_id FROM imports WHERE id = NEW.import_id;
  IF import_org_id IS NULL OR import_org_id <> NEW.org_id THEN
    RAISE EXCEPTION 'Inventory overhead import must belong to the same organization';
  END IF;

  IF NEW.import_goods_line_id IS NOT NULL THEN
    SELECT org_id INTO import_goods_line_org_id FROM import_goods_lines WHERE id = NEW.import_goods_line_id;
    IF import_goods_line_org_id IS NULL OR import_goods_line_org_id <> NEW.org_id THEN
      RAISE EXCEPTION 'Inventory overhead import goods line must belong to the same organization';
    END IF;
  END IF;

  IF NEW.import_charge_line_id IS NOT NULL THEN
    SELECT org_id INTO import_charge_line_org_id FROM import_charge_lines WHERE id = NEW.import_charge_line_id;
    IF import_charge_line_org_id IS NULL OR import_charge_line_org_id <> NEW.org_id THEN
      RAISE EXCEPTION 'Inventory overhead import charge line must belong to the same organization';
    END IF;
  END IF;

  SELECT org_id INTO sku_org_id FROM skus WHERE id = NEW.sku_id;
  IF sku_org_id IS NULL OR sku_org_id <> NEW.org_id THEN
    RAISE EXCEPTION 'Inventory overhead SKU must belong to the same organization';
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: guard_journal_line_scope_and_lock(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guard_journal_line_scope_and_lock() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  row_data record;
  parent_entry record;
  account_org_id uuid;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    SELECT org_id, establishment_id, period_year, period_month INTO parent_entry
    FROM journal_entries WHERE id = OLD.journal_entry_id;
    IF parent_entry.org_id IS NOT NULL THEN
      PERFORM check_period_lock(parent_entry.org_id, parent_entry.establishment_id, 'gl', parent_entry.period_year, parent_entry.period_month);
    END IF;
  END IF;

  row_data := COALESCE(NEW, OLD);

  SELECT org_id, establishment_id, period_year, period_month INTO parent_entry
  FROM journal_entries
  WHERE id = row_data.journal_entry_id;

  IF parent_entry.org_id IS NULL THEN
    RAISE EXCEPTION 'Journal line parent entry not found';
  END IF;

  IF parent_entry.org_id <> row_data.org_id THEN
    RAISE EXCEPTION 'Journal line organization must match parent journal entry';
  END IF;

  SELECT org_id INTO account_org_id
  FROM gl_accounts
  WHERE id = row_data.account_id;

  IF account_org_id IS NULL OR account_org_id <> row_data.org_id THEN
    RAISE EXCEPTION 'Journal line account must belong to the same organization';
  END IF;

  PERFORM check_period_lock(parent_entry.org_id, parent_entry.establishment_id, 'gl', parent_entry.period_year, parent_entry.period_month);
  RETURN COALESCE(NEW, OLD);
END;
$$;


--
-- Name: guard_pay_slip_same_org(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guard_pay_slip_same_org() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  pay_run_org_id uuid;
  employee_org_id uuid;
BEGIN
  SELECT org_id INTO pay_run_org_id FROM pay_runs WHERE id = NEW.pay_run_id;
  IF pay_run_org_id IS NULL OR pay_run_org_id <> NEW.org_id THEN
    RAISE EXCEPTION 'Pay slip must belong to the same organization as pay run';
  END IF;

  SELECT org_id INTO employee_org_id FROM employees WHERE id = NEW.employee_id;
  IF employee_org_id IS NULL OR employee_org_id <> NEW.org_id THEN
    RAISE EXCEPTION 'Pay slip must belong to the same organization as employee';
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: guard_payments_vat_bound_source(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guard_payments_vat_bound_source() RETURNS trigger
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


--
-- Name: guard_payroll_establishment_same_org(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guard_payroll_establishment_same_org() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  establishment_org_id uuid;
BEGIN
  SELECT org_id INTO establishment_org_id FROM establishments WHERE id = NEW.establishment_id;
  IF establishment_org_id IS NULL OR establishment_org_id <> NEW.org_id THEN
    RAISE EXCEPTION 'Payroll establishment must belong to the same organization';
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: guard_pp36_obligations_period_lock(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guard_pp36_obligations_period_lock() RETURNS trigger
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


--
-- Name: guard_processor_settlement_establishment_org(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guard_processor_settlement_establishment_org() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  establishment_org_id uuid;
BEGIN
  IF NEW.establishment_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT org_id INTO establishment_org_id
  FROM establishments
  WHERE id = NEW.establishment_id;

  IF establishment_org_id IS NULL OR establishment_org_id <> NEW.org_id THEN
    RAISE EXCEPTION 'Establishment must belong to the same organization';
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: guard_project_vendor_same_org(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guard_project_vendor_same_org() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  vendor_org_id uuid;
BEGIN
  IF NEW.customer_vendor_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT org_id INTO vendor_org_id FROM vendors WHERE id = NEW.customer_vendor_id;
  IF vendor_org_id IS NULL OR vendor_org_id <> NEW.org_id THEN
    RAISE EXCEPTION 'Project customer/vendor must belong to the same organization';
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: guard_reconciliation_matches_vat_bound_source(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guard_reconciliation_matches_vat_bound_source() RETURNS trigger
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


--
-- Name: guard_sku_same_org(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guard_sku_same_org() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  establishment_org_id uuid;
  inventory_account_org_id uuid;
  cogs_account_org_id uuid;
  revenue_account_org_id uuid;
BEGIN
  IF NEW.establishment_id IS NOT NULL THEN
    SELECT org_id INTO establishment_org_id FROM establishments WHERE id = NEW.establishment_id;
    IF establishment_org_id IS NULL OR establishment_org_id <> NEW.org_id THEN
      RAISE EXCEPTION 'SKU establishment must belong to the same organization';
    END IF;
  END IF;

  IF NEW.gl_inventory_account_id IS NOT NULL THEN
    SELECT org_id INTO inventory_account_org_id FROM gl_accounts WHERE id = NEW.gl_inventory_account_id;
    IF inventory_account_org_id IS NULL OR inventory_account_org_id <> NEW.org_id THEN
      RAISE EXCEPTION 'SKU inventory account must belong to the same organization';
    END IF;
  END IF;

  IF NEW.gl_cogs_account_id IS NOT NULL THEN
    SELECT org_id INTO cogs_account_org_id FROM gl_accounts WHERE id = NEW.gl_cogs_account_id;
    IF cogs_account_org_id IS NULL OR cogs_account_org_id <> NEW.org_id THEN
      RAISE EXCEPTION 'SKU COGS account must belong to the same organization';
    END IF;
  END IF;

  IF NEW.gl_revenue_account_id IS NOT NULL THEN
    SELECT org_id INTO revenue_account_org_id FROM gl_accounts WHERE id = NEW.gl_revenue_account_id;
    IF revenue_account_org_id IS NULL OR revenue_account_org_id <> NEW.org_id THEN
      RAISE EXCEPTION 'SKU revenue account must belong to the same organization';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: guard_tax_payment_events_append_only(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guard_tax_payment_events_append_only() RETURNS trigger
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


--
-- Name: guard_tax_payment_events_period_lock(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guard_tax_payment_events_period_lock() RETURNS trigger
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


--
-- Name: guard_tax_treatment_decisions_vat_bound_source(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guard_tax_treatment_decisions_vat_bound_source() RETURNS trigger
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


--
-- Name: guard_transactions_vat_bound_source(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guard_transactions_vat_bound_source() RETURNS trigger
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


--
-- Name: guard_vat_credit_carryforwards_period_lock(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guard_vat_credit_carryforwards_period_lock() RETURNS trigger
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


--
-- Name: guard_vat_filing_lines_immutable(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guard_vat_filing_lines_immutable() RETURNS trigger
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


--
-- Name: guard_vat_filing_lines_period_lock(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guard_vat_filing_lines_period_lock() RETURNS trigger
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


--
-- Name: guard_vat_filings_amendment_chain(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guard_vat_filings_amendment_chain() RETURNS trigger
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


--
-- Name: guard_vat_filings_immutable_status(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guard_vat_filings_immutable_status() RETURNS trigger
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


--
-- Name: guard_vat_filings_period_lock(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guard_vat_filings_period_lock() RETURNS trigger
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


--
-- Name: guard_vat_input_items_allocated_frozen(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guard_vat_input_items_allocated_frozen() RETURNS trigger
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


--
-- Name: guard_vat_input_items_period_lock(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guard_vat_input_items_period_lock() RETURNS trigger
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


--
-- Name: guard_vat_output_items_period_lock(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guard_vat_output_items_period_lock() RETURNS trigger
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


--
-- Name: guard_wht_certificates_period_lock(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guard_wht_certificates_period_lock() RETURNS trigger
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


--
-- Name: guard_wht_monthly_filings_period_lock(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guard_wht_monthly_filings_period_lock() RETURNS trigger
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


--
-- Name: is_vat_document_bound(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_vat_document_bound(p_org_id uuid, p_document_id uuid) RETURNS boolean
    LANGUAGE sql STABLE
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


--
-- Name: is_vat_document_line_bound(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_vat_document_line_bound(p_org_id uuid, p_line_id uuid) RETURNS boolean
    LANGUAGE sql STABLE
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


--
-- Name: is_vat_reconciliation_match_bound(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_vat_reconciliation_match_bound(p_org_id uuid, p_match_id uuid) RETURNS boolean
    LANGUAGE sql STABLE
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


--
-- Name: is_vat_transaction_bound(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_vat_transaction_bound(p_org_id uuid, p_transaction_id uuid) RETURNS boolean
    LANGUAGE sql STABLE
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


--
-- Name: prevent_wht_certificate_snapshot_update(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.prevent_wht_certificate_snapshot_update() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF OLD.payer_tax_id_snapshot IS DISTINCT FROM NEW.payer_tax_id_snapshot
    OR OLD.payer_address_snapshot IS DISTINCT FROM NEW.payer_address_snapshot
    OR OLD.payee_address_snapshot IS DISTINCT FROM NEW.payee_address_snapshot
    OR OLD.payee_id_number_snapshot IS DISTINCT FROM NEW.payee_id_number_snapshot
    OR OLD.payment_type_description IS DISTINCT FROM NEW.payment_type_description
    OR OLD.signatory_name_snapshot IS DISTINCT FROM NEW.signatory_name_snapshot
    OR OLD.signatory_position_snapshot IS DISTINCT FROM NEW.signatory_position_snapshot
  THEN
    RAISE EXCEPTION 'wht_certificate_snapshot_immutable';
  END IF;

  RETURN NEW;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: ai_batch_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_batch_runs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    trigger_type text NOT NULL,
    triggered_by uuid,
    triggered_at timestamp with time zone DEFAULT now() NOT NULL,
    status text DEFAULT 'triggered'::text NOT NULL,
    completed_at timestamp with time zone,
    match_count integer,
    cost_usd numeric(8,6)
);


--
-- Name: ai_match_suggestions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_match_suggestions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    transaction_id uuid NOT NULL,
    document_id uuid NOT NULL,
    payment_id uuid,
    suggested_amount numeric(14,2),
    confidence numeric(3,2) NOT NULL,
    explanation text,
    ai_model_used text,
    ai_cost_usd numeric(8,6),
    status text DEFAULT 'pending'::text NOT NULL,
    reviewed_at timestamp with time zone,
    reviewed_by uuid,
    rejection_reason text,
    batch_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: allocation_rule_targets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.allocation_rule_targets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    allocation_rule_id uuid NOT NULL,
    cost_center_id uuid,
    project_id uuid,
    percentage numeric(5,4) NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone,
    deleted_at timestamp with time zone,
    CONSTRAINT allocation_rule_targets_has_dimension_check CHECK (((cost_center_id IS NOT NULL) OR (project_id IS NOT NULL))),
    CONSTRAINT allocation_rule_targets_percentage_check CHECK (((percentage > (0)::numeric) AND (percentage <= (1)::numeric)))
);


--
-- Name: allocation_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.allocation_rules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    rule_name text NOT NULL,
    source_type text NOT NULL,
    source_id uuid,
    is_active boolean DEFAULT true NOT NULL,
    effective_from date,
    effective_to date,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone,
    deleted_at timestamp with time zone,
    source_key text,
    CONSTRAINT allocation_rules_effective_range_check CHECK (((effective_to IS NULL) OR (effective_from IS NULL) OR (effective_to >= effective_from))),
    CONSTRAINT allocation_rules_source_type_check CHECK ((source_type = ANY (ARRAY['gl_account'::text, 'vendor'::text, 'category'::text])))
);


--
-- Name: audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    entity_type text NOT NULL,
    entity_id uuid NOT NULL,
    action public.audit_action NOT NULL,
    old_value jsonb,
    new_value jsonb,
    actor_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
)
PARTITION BY RANGE (created_at);


--
-- Name: audit_log_2026_06; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_log_2026_06 (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    entity_type text NOT NULL,
    entity_id uuid NOT NULL,
    action public.audit_action NOT NULL,
    old_value jsonb,
    new_value jsonb,
    actor_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: audit_log_2026_07; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_log_2026_07 (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    entity_type text NOT NULL,
    entity_id uuid NOT NULL,
    action public.audit_action NOT NULL,
    old_value jsonb,
    new_value jsonb,
    actor_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: audit_log_2026_08; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_log_2026_08 (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    entity_type text NOT NULL,
    entity_id uuid NOT NULL,
    action public.audit_action NOT NULL,
    old_value jsonb,
    new_value jsonb,
    actor_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: audit_log_2026_09; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_log_2026_09 (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    entity_type text NOT NULL,
    entity_id uuid NOT NULL,
    action public.audit_action NOT NULL,
    old_value jsonb,
    new_value jsonb,
    actor_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: audit_log_2026_10; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_log_2026_10 (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    entity_type text NOT NULL,
    entity_id uuid NOT NULL,
    action public.audit_action NOT NULL,
    old_value jsonb,
    new_value jsonb,
    actor_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: audit_log_2026_11; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_log_2026_11 (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    entity_type text NOT NULL,
    entity_id uuid NOT NULL,
    action public.audit_action NOT NULL,
    old_value jsonb,
    new_value jsonb,
    actor_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: audit_log_2026_12; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_log_2026_12 (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    entity_type text NOT NULL,
    entity_id uuid NOT NULL,
    action public.audit_action NOT NULL,
    old_value jsonb,
    new_value jsonb,
    actor_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: audit_log_2027_01; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_log_2027_01 (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    entity_type text NOT NULL,
    entity_id uuid NOT NULL,
    action public.audit_action NOT NULL,
    old_value jsonb,
    new_value jsonb,
    actor_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: audit_log_2027_02; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_log_2027_02 (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    entity_type text NOT NULL,
    entity_id uuid NOT NULL,
    action public.audit_action NOT NULL,
    old_value jsonb,
    new_value jsonb,
    actor_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: audit_log_2027_03; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_log_2027_03 (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    entity_type text NOT NULL,
    entity_id uuid NOT NULL,
    action public.audit_action NOT NULL,
    old_value jsonb,
    new_value jsonb,
    actor_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: audit_log_2027_04; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_log_2027_04 (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    entity_type text NOT NULL,
    entity_id uuid NOT NULL,
    action public.audit_action NOT NULL,
    old_value jsonb,
    new_value jsonb,
    actor_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: audit_log_2027_05; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_log_2027_05 (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    entity_type text NOT NULL,
    entity_id uuid NOT NULL,
    action public.audit_action NOT NULL,
    old_value jsonb,
    new_value jsonb,
    actor_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: audit_log_2027_06; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_log_2027_06 (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    entity_type text NOT NULL,
    entity_id uuid NOT NULL,
    action public.audit_action NOT NULL,
    old_value jsonb,
    new_value jsonb,
    actor_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: audit_log_2027_07; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_log_2027_07 (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    entity_type text NOT NULL,
    entity_id uuid NOT NULL,
    action public.audit_action NOT NULL,
    old_value jsonb,
    new_value jsonb,
    actor_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: audit_log_default; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_log_default (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    entity_type text NOT NULL,
    entity_id uuid NOT NULL,
    action public.audit_action NOT NULL,
    old_value jsonb,
    new_value jsonb,
    actor_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: audit_log_old; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_log_old (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    entity_type text NOT NULL,
    entity_id uuid NOT NULL,
    action public.audit_action NOT NULL,
    old_value jsonb,
    new_value jsonb,
    actor_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: bank_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bank_accounts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    bank_code text NOT NULL,
    account_number text NOT NULL,
    account_name text,
    currency character varying(3) DEFAULT 'THB'::character varying,
    current_balance numeric(14,2),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone,
    deleted_at timestamp with time zone
);


--
-- Name: bank_statements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bank_statements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    bank_account_id uuid NOT NULL,
    period_start date NOT NULL,
    period_end date NOT NULL,
    opening_balance numeric(14,2),
    closing_balance numeric(14,2),
    file_url text,
    parser_used text,
    import_status text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone,
    deleted_at timestamp with time zone
);


--
-- Name: book_tax_adjustments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.book_tax_adjustments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    tax_year integer NOT NULL,
    description text NOT NULL,
    gl_account_id uuid,
    amount numeric(14,2) NOT NULL,
    direction text NOT NULL,
    category text NOT NULL,
    notes text,
    audit_log_ref uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone,
    CONSTRAINT book_tax_adjustments_amount_check CHECK ((amount >= (0)::numeric)),
    CONSTRAINT book_tax_adjustments_direction_check CHECK ((direction = ANY (ARRAY['add_back'::text, 'deduct'::text])))
);


--
-- Name: cash_deposits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cash_deposits (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    establishment_id uuid NOT NULL,
    deposit_slip_document_id uuid,
    deposited_at date NOT NULL,
    deposited_by text,
    bank_account_id uuid,
    amount numeric(14,2) NOT NULL,
    slip_reference text,
    bank_transaction_id uuid,
    pos_cash_period_start date,
    pos_cash_period_end date,
    cash_variance numeric(14,2),
    variance_resolution_status text DEFAULT 'open'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone,
    CONSTRAINT cash_deposits_amount_nonnegative_check CHECK ((amount >= (0)::numeric))
);


--
-- Name: cit_brackets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cit_brackets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    effective_from date NOT NULL,
    effective_to date,
    entity_type text NOT NULL,
    lower_bound numeric(14,2) NOT NULL,
    upper_bound numeric(14,2),
    marginal_rate numeric(5,4) NOT NULL,
    source_citation text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone,
    CONSTRAINT cit_brackets_bounds_check CHECK (((lower_bound >= (0)::numeric) AND ((upper_bound IS NULL) OR (upper_bound > lower_bound)))),
    CONSTRAINT cit_brackets_entity_type_check CHECK ((entity_type = ANY (ARRAY['sme_qualifying'::text, 'standard'::text]))),
    CONSTRAINT cit_brackets_rate_check CHECK (((marginal_rate >= (0)::numeric) AND (marginal_rate <= (1)::numeric)))
);


--
-- Name: cit_filings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cit_filings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    tax_year integer NOT NULL,
    filing_type text NOT NULL,
    period_start date NOT NULL,
    period_end date NOT NULL,
    filing_status text DEFAULT 'draft'::text NOT NULL,
    submitted_at timestamp with time zone,
    accepted_at timestamp with time zone,
    revenue_total numeric(14,2),
    cogs_total numeric(14,2),
    expense_total numeric(14,2),
    accounting_profit numeric(14,2),
    book_tax_adjustments_payload jsonb,
    taxable_income numeric(14,2),
    taxable_loss numeric(14,2),
    losses_consumed_this_year numeric(14,2),
    cit_rate numeric(5,4),
    cit_calculated numeric(14,2),
    wht_credits_used numeric(14,2),
    prepayment_credits_used numeric(14,2),
    pnd51_method text,
    pnd51_projected_full_year_profit numeric(14,2),
    pnd51_h1_actual_profit numeric(14,2),
    pnd51_estimate_rationale text,
    cit_payable numeric(14,2),
    paid_at timestamp with time zone,
    bank_transaction_id uuid,
    is_amendment boolean DEFAULT false NOT NULL,
    amends_filing_id uuid,
    rd_reference_number text,
    confirmation_document_id uuid,
    working_paper_document_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone,
    loss_carry_forward_consumption_payload jsonb,
    CONSTRAINT cit_filings_pnd51_method_check CHECK (((pnd51_method IS NULL) OR (pnd51_method = ANY (ARRAY['projected_full_year'::text, 'actual_h1_books'::text])))),
    CONSTRAINT cit_filings_status_check CHECK ((filing_status = ANY (ARRAY['draft'::text, 'submitted'::text, 'accepted'::text]))),
    CONSTRAINT cit_filings_type_check CHECK ((filing_type = ANY (ARRAY['pnd51'::text, 'pnd50'::text])))
);


--
-- Name: close_checklist_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.close_checklist_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    checklist_id uuid NOT NULL,
    sequence integer NOT NULL,
    item_key text NOT NULL,
    description text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    assigned_to_user_id text,
    completed_by_user_id text,
    completed_at timestamp with time zone,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone,
    CONSTRAINT close_checklist_items_completed_check CHECK (((status <> 'done'::text) OR (completed_at IS NOT NULL))),
    CONSTRAINT close_checklist_items_sequence_positive_check CHECK ((sequence > 0)),
    CONSTRAINT close_checklist_items_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'done'::text, 'skipped'::text, 'blocked'::text])))
);


--
-- Name: close_checklists; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.close_checklists (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    establishment_id uuid,
    period_year integer NOT NULL,
    period_month integer NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone,
    closed_at timestamp with time zone,
    CONSTRAINT close_checklists_period_month_check CHECK (((period_month >= 1) AND (period_month <= 12))),
    CONSTRAINT close_checklists_status_check CHECK ((status = ANY (ARRAY['open'::text, 'in_progress'::text, 'closed'::text])))
);


--
-- Name: copilot_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.copilot_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    session_id uuid NOT NULL,
    role text NOT NULL,
    content text NOT NULL,
    tool_name text,
    payload jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT copilot_messages_role_check CHECK ((role = ANY (ARRAY['user'::text, 'assistant'::text, 'tool'::text])))
);


--
-- Name: copilot_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.copilot_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    user_id text NOT NULL,
    title text DEFAULT 'Copilot session'::text NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone,
    deleted_at timestamp with time zone,
    CONSTRAINT copilot_sessions_status_check CHECK ((status = ANY (ARRAY['open'::text, 'archived'::text])))
);


--
-- Name: copilot_tool_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.copilot_tool_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    session_id uuid,
    tool_name text NOT NULL,
    risk text NOT NULL,
    preview_required boolean NOT NULL,
    status text DEFAULT 'succeeded'::text NOT NULL,
    input jsonb NOT NULL,
    output jsonb,
    error text,
    created_by_user_id text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT copilot_tool_events_risk_check CHECK ((risk = ANY (ARRAY['read'::text, 'draft'::text, 'write'::text, 'bulk_write'::text, 'filing_impact'::text]))),
    CONSTRAINT copilot_tool_events_status_check CHECK ((status = ANY (ARRAY['succeeded'::text, 'failed'::text, 'blocked'::text])))
);


--
-- Name: cost_centers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cost_centers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    code text NOT NULL,
    name_th text,
    name_en text NOT NULL,
    parent_id uuid,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone,
    deleted_at timestamp with time zone
);


--
-- Name: depreciation_schedule; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.depreciation_schedule (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    fixed_asset_id uuid NOT NULL,
    period_year integer NOT NULL,
    period_month integer NOT NULL,
    depreciation_amount numeric(14,2) NOT NULL,
    tax_depreciation_capped_amount numeric(14,2) NOT NULL,
    book_tax_difference numeric(14,2) NOT NULL,
    accumulated_depreciation_after numeric(14,2) NOT NULL,
    book_value_after numeric(14,2) NOT NULL,
    journal_entry_id uuid,
    posted_at timestamp with time zone,
    is_partial_month boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone,
    CONSTRAINT depreciation_schedule_amounts_nonnegative_check CHECK (((depreciation_amount >= (0)::numeric) AND (tax_depreciation_capped_amount >= (0)::numeric) AND (accumulated_depreciation_after >= (0)::numeric) AND (book_value_after >= (0)::numeric))),
    CONSTRAINT depreciation_schedule_period_month_check CHECK (((period_month >= 1) AND (period_month <= 12)))
);


--
-- Name: document_files; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.document_files (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    document_id uuid NOT NULL,
    file_url text NOT NULL,
    file_type text,
    page_number integer,
    original_filename text,
    pipeline_status public.pipeline_status DEFAULT 'uploaded'::public.pipeline_status NOT NULL,
    ai_raw_response jsonb,
    ai_model_used text,
    ai_cost_tokens integer,
    ai_cost_usd numeric(8,6),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone,
    deleted_at timestamp with time zone,
    ai_purpose text,
    ai_input_tokens integer,
    ai_output_tokens integer
);


--
-- Name: document_line_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.document_line_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    document_id uuid NOT NULL,
    description text,
    quantity numeric(10,4),
    unit_price numeric(14,2),
    amount numeric(14,2),
    vat_amount numeric(14,2),
    wht_rate numeric(5,4),
    wht_amount numeric(14,2),
    wht_type text,
    rd_payment_type_code text,
    account_code text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone,
    deleted_at timestamp with time zone,
    CONSTRAINT document_line_items_amounts_nonnegative_check CHECK ((((quantity IS NULL) OR (quantity >= (0)::numeric)) AND ((unit_price IS NULL) OR (unit_price >= (0)::numeric)) AND ((amount IS NULL) OR (amount >= (0)::numeric)) AND ((vat_amount IS NULL) OR (vat_amount >= (0)::numeric)) AND ((wht_amount IS NULL) OR (wht_amount >= (0)::numeric)) AND ((wht_rate IS NULL) OR ((wht_rate >= (0)::numeric) AND (wht_rate <= (1)::numeric)))))
);


--
-- Name: documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.documents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    vendor_id uuid,
    related_document_id uuid,
    type public.document_type NOT NULL,
    document_number text,
    issue_date date,
    due_date date,
    subtotal numeric(14,2),
    vat_amount numeric(14,2),
    total_amount numeric(14,2),
    currency character varying(3) DEFAULT 'THB'::character varying,
    exchange_rate numeric(12,6),
    total_amount_thb numeric(14,2),
    direction public.document_direction NOT NULL,
    status public.document_status DEFAULT 'draft'::public.document_status NOT NULL,
    vat_period_year integer,
    vat_period_month integer,
    ai_confidence numeric(3,2),
    needs_review boolean DEFAULT true,
    review_notes text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone,
    deleted_at timestamp with time zone,
    detected_language character varying(5),
    category text,
    tax_invoice_subtype public.tax_invoice_subtype,
    is_pp36_subject boolean DEFAULT false,
    vat_period_override_reason text,
    vat_period_overridden_by_user_id text,
    vat_period_overridden_at timestamp with time zone,
    supplier_tax_id_snapshot text,
    supplier_branch_number_snapshot text,
    buyer_tax_id_snapshot text,
    buyer_branch_number_snapshot text,
    tax_invoice_serial_number text,
    tax_invoice_words text,
    vat_treatment text,
    vat_rate numeric(5,4),
    vat_establishment_id uuid,
    CONSTRAINT documents_money_nonnegative_check CHECK ((((subtotal IS NULL) OR (subtotal >= (0)::numeric)) AND ((vat_amount IS NULL) OR (vat_amount >= (0)::numeric)) AND ((total_amount IS NULL) OR (total_amount >= (0)::numeric)) AND ((total_amount_thb IS NULL) OR (total_amount_thb >= (0)::numeric)))),
    CONSTRAINT documents_vat_period_month_check CHECK (((vat_period_month IS NULL) OR ((vat_period_month >= 1) AND (vat_period_month <= 12)))),
    CONSTRAINT documents_vat_rate_range_check CHECK (((vat_rate IS NULL) OR ((vat_rate >= (0)::numeric) AND (vat_rate <= (1)::numeric)))),
    CONSTRAINT documents_vat_treatment_check CHECK (((vat_treatment IS NULL) OR (vat_treatment = ANY (ARRAY['no_vat'::text, 'input_vat'::text, 'output_vat'::text, 'exempt'::text, 'not_claimable'::text, 'pp36'::text]))))
);


--
-- Name: employee_allowances; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.employee_allowances (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    employee_id uuid NOT NULL,
    tax_year integer NOT NULL,
    personal_allowance numeric(14,2) DEFAULT '60000'::numeric NOT NULL,
    spouse_allowance numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    child_count_pre_2018 integer DEFAULT 0 NOT NULL,
    child_count_post_2018_second_plus integer DEFAULT 0 NOT NULL,
    parent_allowance numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    disabled_dependent_allowance numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    health_insurance_premium numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    life_insurance_premium numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    parents_health_insurance numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    pension_insurance numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    provident_fund_contribution_pct numeric(5,4) DEFAULT '0'::numeric NOT NULL,
    ltf_rmf_ssf_amount numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    mortgage_interest numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    social_security_contribution numeric(14,2),
    submitted_by_employee_at timestamp with time zone,
    recorded_by_employer_at timestamp with time zone,
    recorded_by_user_id text,
    effective_from_month date NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone,
    CONSTRAINT employee_allowances_counts_nonnegative_check CHECK (((child_count_pre_2018 >= 0) AND (child_count_post_2018_second_plus >= 0)))
);


--
-- Name: employees; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.employees (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    establishment_id uuid NOT NULL,
    national_id text,
    passport_number text,
    tax_id text,
    full_name_th text,
    full_name_en text,
    dob date,
    start_date date NOT NULL,
    end_date date,
    "position" text,
    pay_frequency text DEFAULT 'monthly'::text NOT NULL,
    pay_periods_per_year integer DEFAULT 12 NOT NULL,
    bank_account_number text,
    bank_account_name text,
    bank_code text,
    provident_fund_eligible boolean DEFAULT false NOT NULL,
    social_security_eligible boolean DEFAULT true NOT NULL,
    social_security_first_registered_at date,
    is_director boolean DEFAULT false NOT NULL,
    prior_employer_ytd_gross numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    prior_employer_ytd_pit numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    prior_employer_ytd_as_of_month integer,
    prior_employer_ynot_certificate_document_id uuid,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone,
    deleted_at timestamp with time zone,
    base_monthly_salary numeric(14,2) DEFAULT 0 NOT NULL,
    salary_effective_from date,
    CONSTRAINT employees_base_salary_nonnegative_check CHECK ((base_monthly_salary >= (0)::numeric)),
    CONSTRAINT employees_pay_frequency_check CHECK ((pay_frequency = ANY (ARRAY['monthly'::text, 'bi_weekly'::text, 'weekly'::text, 'daily'::text]))),
    CONSTRAINT employees_pay_periods_positive_check CHECK ((pay_periods_per_year > 0)),
    CONSTRAINT employees_prior_ytd_nonnegative_check CHECK (((prior_employer_ytd_gross >= (0)::numeric) AND (prior_employer_ytd_pit >= (0)::numeric)))
);


--
-- Name: establishments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.establishments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    branch_number character varying(7) NOT NULL,
    name_th text,
    name_en text,
    address_line1 text,
    address_line2 text,
    subdistrict text,
    district text,
    province text,
    postcode text,
    is_head_office boolean DEFAULT false NOT NULL,
    requires_manual_mapping boolean DEFAULT false NOT NULL,
    consolidated_filing_approved boolean DEFAULT false NOT NULL,
    consolidated_under_branch_id uuid,
    vat_registered boolean DEFAULT true NOT NULL,
    tax_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone,
    deleted_at timestamp with time zone,
    CONSTRAINT establishments_branch_number_check CHECK (((branch_number)::text ~ '^(00000|[0-9]{5}|UNKNOWN)$'::text))
);


--
-- Name: exception_queue; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.exception_queue (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    entity_type text NOT NULL,
    entity_id uuid NOT NULL,
    exception_type text NOT NULL,
    severity text NOT NULL,
    summary text NOT NULL,
    payload jsonb,
    resolved_at timestamp with time zone,
    resolution text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: exemplar_consensus; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.exemplar_consensus (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    vendor_key character varying(13) NOT NULL,
    field_name text NOT NULL,
    normalized_value text NOT NULL,
    normalized_value_hash text NOT NULL,
    field_criticality public.field_criticality NOT NULL,
    weighted_org_count numeric(8,4) DEFAULT '0'::numeric NOT NULL,
    agreeing_org_count integer DEFAULT 0 NOT NULL,
    contradicting_count integer DEFAULT 0 NOT NULL,
    status public.consensus_status DEFAULT 'candidate'::public.consensus_status NOT NULL,
    promoted_at timestamp with time zone,
    retired_at timestamp with time zone,
    recomputed_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: extraction_compiled_patterns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.extraction_compiled_patterns (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    vendor_key text NOT NULL,
    scope_kind public.vendor_tier_scope_kind NOT NULL,
    org_id uuid,
    version integer NOT NULL,
    source_ts text NOT NULL,
    compiled_js text NOT NULL,
    ts_compiler_version text NOT NULL,
    ast_hash text NOT NULL,
    training_set_hash text NOT NULL,
    shadow_accuracy numeric(5,4),
    shadow_sample_size integer,
    status public.compiled_pattern_status DEFAULT 'shadow'::public.compiled_pattern_status NOT NULL,
    requires_manual_review boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    activated_at timestamp with time zone,
    retired_at timestamp with time zone,
    retirement_reason text,
    CONSTRAINT chk_compiled_pattern_scope CHECK ((((scope_kind = 'org'::public.vendor_tier_scope_kind) AND (org_id IS NOT NULL)) OR ((scope_kind = 'global'::public.vendor_tier_scope_kind) AND (org_id IS NULL))))
);


--
-- Name: extraction_correction_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.extraction_correction_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    document_id uuid NOT NULL,
    extraction_log_id uuid NOT NULL,
    started_by_user_id text NOT NULL,
    confirmed_by_user_id text,
    status public.extraction_correction_session_status DEFAULT 'draft'::public.extraction_correction_session_status NOT NULL,
    user_explanation text,
    ai_interpretation jsonb,
    confirmed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone,
    deleted_at timestamp with time zone
);


--
-- Name: extraction_exemplars; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.extraction_exemplars (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    vendor_id uuid NOT NULL,
    field_name text NOT NULL,
    field_criticality public.field_criticality NOT NULL,
    ai_value text,
    user_value text,
    was_corrected boolean NOT NULL,
    document_id uuid NOT NULL,
    source_region jsonb,
    model_used text,
    confidence_at_time numeric(5,4),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    vendor_tax_id character varying(13),
    correction_session_id uuid,
    CONSTRAINT chk_exemplars_was_corrected CHECK ((((was_corrected = true) AND (ai_value IS DISTINCT FROM user_value)) OR ((was_corrected = false) AND (NOT (ai_value IS DISTINCT FROM user_value)))))
);


--
-- Name: extraction_learning_candidates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.extraction_learning_candidates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    document_id uuid NOT NULL,
    correction_session_id uuid NOT NULL,
    vendor_id uuid,
    vendor_key text,
    document_family text,
    field_name text NOT NULL,
    field_criticality public.field_criticality NOT NULL,
    candidate_type public.extraction_learning_candidate_type NOT NULL,
    ai_value text,
    confirmed_value text,
    rationale text,
    selector_hint text,
    reject_hint text,
    applies_when jsonb DEFAULT '[]'::jsonb NOT NULL,
    scope public.extraction_learning_candidate_scope NOT NULL,
    status public.extraction_learning_candidate_status DEFAULT 'candidate'::public.extraction_learning_candidate_status NOT NULL,
    confidence numeric(5,4),
    promotion_evidence jsonb,
    retirement_reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone,
    deleted_at timestamp with time zone
);


--
-- Name: extraction_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.extraction_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    document_id uuid NOT NULL,
    org_id uuid NOT NULL,
    vendor_id uuid,
    tier_used smallint NOT NULL,
    exemplar_ids uuid[],
    model_used text,
    input_tokens integer,
    output_tokens integer,
    cost_usd numeric(12,8),
    latency_ms integer,
    inngest_idempotency_key text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: extraction_review_outcome; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.extraction_review_outcome (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    extraction_log_id uuid NOT NULL,
    document_id uuid NOT NULL,
    org_id uuid NOT NULL,
    user_corrected boolean NOT NULL,
    correction_count integer DEFAULT 0 NOT NULL,
    reviewed_by_user_id text NOT NULL,
    reviewed_at timestamp with time zone DEFAULT now() NOT NULL,
    correction_session_id uuid
);


--
-- Name: fixed_asset_depreciation_periods; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fixed_asset_depreciation_periods (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    period_year integer NOT NULL,
    period_month integer NOT NULL,
    schedule_rows_created integer DEFAULT 0 NOT NULL,
    posting_outbox_id uuid,
    journal_entry_id uuid,
    created_by_user_id text,
    requested_at timestamp with time zone DEFAULT now() NOT NULL,
    posted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT fixed_asset_depreciation_periods_month_check CHECK (((period_month >= 1) AND (period_month <= 12))),
    CONSTRAINT fixed_asset_depreciation_periods_schedule_rows_nonnegative_chec CHECK ((schedule_rows_created >= 0))
);


--
-- Name: fixed_assets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fixed_assets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    establishment_id uuid,
    asset_code text NOT NULL,
    name_th text,
    name_en text NOT NULL,
    category text NOT NULL,
    gl_account_id uuid,
    accumulated_depreciation_account_id uuid,
    depreciation_expense_account_id uuid,
    acquisition_date date NOT NULL,
    acquisition_document_id uuid,
    original_cost numeric(14,2) NOT NULL,
    salvage_value numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    useful_life_months integer NOT NULL,
    tax_useful_life_months_minimum integer NOT NULL,
    depreciation_method text DEFAULT 'straight_line'::text NOT NULL,
    depreciation_start_date date NOT NULL,
    disposed_at date,
    disposal_proceeds numeric(14,2),
    disposal_document_id uuid,
    gain_loss_on_disposal numeric(14,2),
    boi_segment text DEFAULT 'n_a'::text NOT NULL,
    serial_number text,
    location text,
    assigned_to_employee_id uuid,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone,
    deleted_at timestamp with time zone,
    CONSTRAINT fixed_assets_amounts_nonnegative_check CHECK (((original_cost >= (0)::numeric) AND (salvage_value >= (0)::numeric))),
    CONSTRAINT fixed_assets_category_check CHECK ((category = ANY (ARRAY['building'::text, 'temporary_building'::text, 'equipment'::text, 'vehicle'::text, 'furniture_fixtures'::text, 'computer_hardware'::text, 'computer_software'::text, 'leasehold_improvement'::text, 'intangible_other'::text, 'natural_resource_right'::text, 'land'::text]))),
    CONSTRAINT fixed_assets_disposal_check CHECK (((disposed_at IS NULL) OR (disposal_proceeds IS NOT NULL))),
    CONSTRAINT fixed_assets_life_check CHECK ((((depreciation_method = 'not_depreciable'::text) AND (useful_life_months = 0)) OR ((depreciation_method = 'straight_line'::text) AND (useful_life_months > 0)))),
    CONSTRAINT fixed_assets_method_check CHECK ((depreciation_method = ANY (ARRAY['straight_line'::text, 'not_depreciable'::text]))),
    CONSTRAINT fixed_assets_tax_life_nonnegative_check CHECK ((tax_useful_life_months_minimum >= 0))
);


--
-- Name: fx_rates_bot; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fx_rates_bot (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    rate_date date NOT NULL,
    currency character varying(3) NOT NULL,
    buying_rate numeric(18,8),
    selling_rate numeric(18,8),
    mid_rate numeric(18,8) NOT NULL,
    source_url text NOT NULL,
    fetched_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone,
    CONSTRAINT fx_rates_bot_mid_positive_check CHECK ((mid_rate > (0)::numeric))
);


--
-- Name: fx_valuation_layers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fx_valuation_layers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    monetary_item_type text NOT NULL,
    monetary_item_id uuid NOT NULL,
    original_amount numeric(14,2) NOT NULL,
    original_currency character varying(3) NOT NULL,
    valuation_date date NOT NULL,
    valuation_rate numeric(18,8) NOT NULL,
    valued_thb_amount numeric(14,2) NOT NULL,
    prior_valuation_id uuid,
    journal_entry_id uuid,
    realized boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone,
    CONSTRAINT fx_valuation_layers_positive_check CHECK (((valuation_rate > (0)::numeric) AND (valued_thb_amount >= (0)::numeric))),
    CONSTRAINT fx_valuation_layers_type_check CHECK ((monetary_item_type = ANY (ARRAY['bank_account'::text, 'ar_invoice'::text, 'ap_invoice'::text, 'loan'::text, 'wht_credit_received'::text])))
);


--
-- Name: gl_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gl_accounts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    establishment_id uuid,
    account_code text NOT NULL,
    name_th text NOT NULL,
    name_en text NOT NULL,
    account_type public.gl_account_type NOT NULL,
    account_subtype text,
    parent_account_id uuid,
    is_clearing boolean DEFAULT false NOT NULL,
    is_control_account boolean DEFAULT false NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    is_system boolean DEFAULT false NOT NULL,
    is_automated boolean DEFAULT false NOT NULL,
    is_postable boolean DEFAULT true NOT NULL,
    description_override_en text,
    description_override_th text,
    visibility_condition text,
    dbd_taxonomy_hint text,
    tenant_added_by uuid,
    tenant_added_at timestamp with time zone,
    tax_treatment public.gl_tax_treatment DEFAULT 'n_a'::public.gl_tax_treatment NOT NULL,
    boi_segment text DEFAULT 'n_a'::text NOT NULL,
    vat_register_role public.gl_vat_register_role DEFAULT 'n_a'::public.gl_vat_register_role NOT NULL,
    wht_register_role public.gl_wht_register_role DEFAULT 'n_a'::public.gl_wht_register_role NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone,
    deleted_at timestamp with time zone,
    CONSTRAINT gl_accounts_code_format_check CHECK ((account_code ~ '^[1-9][0-9]{3}$'::text))
);


--
-- Name: gl_opening_balances; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gl_opening_balances (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    establishment_id uuid,
    as_of_date date NOT NULL,
    account_id uuid NOT NULL,
    debit_amount numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    credit_amount numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    entered_by_user_id text,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone,
    CONSTRAINT gl_opening_balances_debit_or_credit_check CHECK ((((debit_amount > (0)::numeric) AND (credit_amount = (0)::numeric)) OR ((debit_amount = (0)::numeric) AND (credit_amount > (0)::numeric)) OR ((debit_amount = (0)::numeric) AND (credit_amount = (0)::numeric))))
);


--
-- Name: global_exemplar_pool; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.global_exemplar_pool (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    vendor_key character varying(13) NOT NULL,
    field_name text NOT NULL,
    canonical_value text NOT NULL,
    field_criticality public.field_criticality NOT NULL,
    consensus_id uuid NOT NULL,
    promoted_at timestamp with time zone DEFAULT now() NOT NULL,
    retired_at timestamp with time zone
);


--
-- Name: import_charge_lines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.import_charge_lines (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    import_id uuid NOT NULL,
    source_document_id uuid NOT NULL,
    line_description text NOT NULL,
    amount_thb numeric(14,2) NOT NULL,
    original_currency text DEFAULT 'THB'::text NOT NULL,
    original_amount numeric(14,2) NOT NULL,
    fx_rate_applied numeric(18,8),
    fx_source text,
    fx_date date,
    vat_treatment text NOT NULL,
    vat_amount_thb numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    expense_account_id uuid,
    vat_period_override text,
    late_claim_reason text,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone,
    CONSTRAINT import_charge_lines_amount_nonnegative_check CHECK (((amount_thb >= (0)::numeric) AND (original_amount >= (0)::numeric) AND (vat_amount_thb >= (0)::numeric))),
    CONSTRAINT import_charge_lines_fx_positive_check CHECK (((fx_rate_applied IS NULL) OR (fx_rate_applied > (0)::numeric))),
    CONSTRAINT import_charge_lines_import_vat_override_check CHECK (((vat_treatment <> 'is_import_vat'::text) OR ((vat_period_override IS NOT NULL) AND (vat_period_override ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'::text) AND (expense_account_id IS NULL)))),
    CONSTRAINT import_charge_lines_treatment_check CHECK ((vat_treatment = ANY (ARRAY['service_with_vat_pct'::text, 'service_with_vat_zero'::text, 'service_vat_exempt'::text, 'is_import_vat'::text, 'is_pass_through'::text, 'excise_pass_through'::text])))
);


--
-- Name: import_documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.import_documents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    import_id uuid NOT NULL,
    document_id uuid NOT NULL,
    document_role text NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT import_documents_role_check CHECK ((document_role = ANY (ARRAY['foreign_supplier_invoice'::text, 'customs_declaration'::text, 'broker_invoice'::text, 'shipping_invoice'::text, 'insurance_invoice'::text, 'bank_remittance_advice'::text, 'other'::text])))
);


--
-- Name: import_goods_lines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.import_goods_lines (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    import_id uuid NOT NULL,
    sku_id uuid,
    sku_code text NOT NULL,
    description text,
    quantity numeric(14,4) NOT NULL,
    unit_price_original numeric(14,4) NOT NULL,
    goods_value_original numeric(14,2),
    goods_value_thb numeric(14,2),
    weight_kg numeric(14,4),
    lot_sequence integer DEFAULT 1 NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone,
    CONSTRAINT import_goods_lines_amounts_nonnegative_check CHECK (((unit_price_original >= (0)::numeric) AND ((goods_value_original IS NULL) OR (goods_value_original >= (0)::numeric)) AND ((goods_value_thb IS NULL) OR (goods_value_thb >= (0)::numeric)) AND ((weight_kg IS NULL) OR (weight_kg >= (0)::numeric)))),
    CONSTRAINT import_goods_lines_positive_qty_check CHECK ((quantity > (0)::numeric))
);


--
-- Name: import_payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.import_payments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    import_id uuid NOT NULL,
    bank_transaction_id uuid NOT NULL,
    payment_role text NOT NULL,
    amount_thb numeric(14,2) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT import_payments_amount_nonnegative_check CHECK ((amount_thb >= (0)::numeric)),
    CONSTRAINT import_payments_role_check CHECK ((payment_role = ANY (ARRAY['foreign_supplier_payment'::text, 'broker_settlement'::text, 'shipper_settlement'::text, 'customs_direct_payment'::text])))
);


--
-- Name: imports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.imports (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    establishment_id uuid NOT NULL,
    import_reference text,
    supplier_vendor_id uuid,
    customs_declaration_number text,
    arrival_port text,
    arrival_date date NOT NULL,
    customs_clearance_date date NOT NULL,
    original_currency text NOT NULL,
    fx_rate_at_clearance numeric(18,8) NOT NULL,
    cif_original numeric(14,2),
    cif_thb numeric(14,2),
    customs_assessed_duty_thb numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    customs_assessed_excise_thb numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    customs_assessed_import_vat_thb numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    is_finalized boolean DEFAULT false NOT NULL,
    finalized_at timestamp with time zone,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone,
    deleted_at timestamp with time zone,
    CONSTRAINT imports_assessed_amounts_nonnegative_check CHECK (((customs_assessed_duty_thb >= (0)::numeric) AND (customs_assessed_excise_thb >= (0)::numeric) AND (customs_assessed_import_vat_thb >= (0)::numeric))),
    CONSTRAINT imports_finalized_at_check CHECK (((is_finalized = false) OR (finalized_at IS NOT NULL))),
    CONSTRAINT imports_fx_positive_check CHECK ((fx_rate_at_clearance > (0)::numeric))
);


--
-- Name: inventory_count_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inventory_count_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    count_id uuid NOT NULL,
    sku_id uuid NOT NULL,
    system_quantity numeric(14,4) NOT NULL,
    counted_quantity numeric(14,4) NOT NULL,
    variance numeric(14,4) NOT NULL,
    variance_value_thb numeric(14,2) NOT NULL,
    variance_reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone,
    CONSTRAINT inventory_count_items_reason_check CHECK (((variance_reason IS NULL) OR (variance_reason = ANY (ARRAY['shrinkage'::text, 'damage'::text, 'count_error'::text, 'unrecorded_sale'::text, 'other'::text]))))
);


--
-- Name: inventory_counts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inventory_counts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    establishment_id uuid NOT NULL,
    count_date date NOT NULL,
    count_type text DEFAULT 'cycle'::text NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    submitted_at timestamp with time zone,
    reconciled_at timestamp with time zone,
    reconciled_by_user_id text,
    total_variance_value_thb numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone,
    CONSTRAINT inventory_counts_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'submitted'::text, 'reconciled'::text]))),
    CONSTRAINT inventory_counts_type_check CHECK ((count_type = ANY (ARRAY['full'::text, 'cycle'::text, 'spot'::text])))
);


--
-- Name: inventory_movements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inventory_movements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    establishment_id uuid NOT NULL,
    sku_id uuid NOT NULL,
    movement_at timestamp with time zone NOT NULL,
    movement_type text NOT NULL,
    quantity numeric(14,4) NOT NULL,
    unit_cost numeric(14,4),
    total_cost numeric(14,2) NOT NULL,
    running_quantity_after numeric(14,4),
    running_avg_cost_after numeric(14,4),
    running_value_after numeric(14,2),
    source_entity_type text,
    source_entity_id uuid,
    journal_entry_id uuid,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    CONSTRAINT inventory_movements_costs_nonnegative_check CHECK ((((unit_cost IS NULL) OR (unit_cost >= (0)::numeric)) AND (total_cost >= (0)::numeric))),
    CONSTRAINT inventory_movements_sign_check CHECK ((((movement_type = ANY (ARRAY['purchase_in'::text, 'import_in'::text, 'return_in'::text, 'adjustment_in'::text, 'transfer_in'::text, 'count_variance_in'::text])) AND (quantity > (0)::numeric)) OR ((movement_type = ANY (ARRAY['sale_out'::text, 'return_out'::text, 'adjustment_out'::text, 'transfer_out'::text, 'count_variance_out'::text, 'shrinkage'::text])) AND (quantity < (0)::numeric)) OR ((movement_type = 'revaluation'::text) AND (quantity = (0)::numeric)))),
    CONSTRAINT inventory_movements_type_check CHECK ((movement_type = ANY (ARRAY['purchase_in'::text, 'import_in'::text, 'sale_out'::text, 'return_in'::text, 'return_out'::text, 'adjustment_in'::text, 'adjustment_out'::text, 'transfer_in'::text, 'transfer_out'::text, 'count_variance_in'::text, 'count_variance_out'::text, 'shrinkage'::text, 'revaluation'::text])))
);


--
-- Name: inventory_statutory_overhead_components; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inventory_statutory_overhead_components (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    import_id uuid NOT NULL,
    import_goods_line_id uuid,
    import_charge_line_id uuid,
    sku_id uuid NOT NULL,
    component_type text NOT NULL,
    component_amount_thb numeric(14,2) NOT NULL,
    remaining_amount_thb numeric(14,2) NOT NULL,
    fiscal_year integer NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone,
    CONSTRAINT inventory_overhead_components_amount_check CHECK (((component_amount_thb >= (0)::numeric) AND (remaining_amount_thb >= (0)::numeric) AND (remaining_amount_thb <= component_amount_thb))),
    CONSTRAINT inventory_overhead_components_type_check CHECK ((component_type = ANY (ARRAY['customs_duty'::text, 'excise'::text, 'freight'::text, 'insurance'::text, 'brokerage'::text, 'non_recoverable_tax'::text, 'other'::text])))
);


--
-- Name: journal_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.journal_entries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    establishment_id uuid,
    entry_number text NOT NULL,
    entry_date date NOT NULL,
    posting_date date NOT NULL,
    period_year integer NOT NULL,
    period_month integer NOT NULL,
    entry_type public.gl_entry_type NOT NULL,
    posting_kind public.posting_kind,
    source_entity_type text,
    source_entity_id uuid,
    source_event_id text,
    description text NOT NULL,
    description_th text,
    currency text DEFAULT 'THB'::text NOT NULL,
    fx_rate numeric(18,8),
    total_debit numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    total_credit numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    created_by_user_id text,
    approved_by_user_id text,
    approved_at timestamp with time zone,
    posted_at timestamp with time zone DEFAULT now() NOT NULL,
    is_reversal boolean DEFAULT false NOT NULL,
    reverses_entry_id uuid,
    reversed_by_entry_id uuid,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone,
    CONSTRAINT journal_entries_balanced_check CHECK ((total_debit = total_credit)),
    CONSTRAINT journal_entries_nonzero_or_documented_check CHECK (((total_debit > (0)::numeric) OR (is_reversal = true) OR (entry_type = ANY (ARRAY['opening_balance'::public.gl_entry_type, 'memo'::public.gl_entry_type])) OR (notes IS NOT NULL))),
    CONSTRAINT journal_entries_period_month_check CHECK (((period_month >= 1) AND (period_month <= 12)))
);


--
-- Name: journal_lines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.journal_lines (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    journal_entry_id uuid NOT NULL,
    line_number integer NOT NULL,
    account_id uuid NOT NULL,
    description text,
    debit_amount numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    credit_amount numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    subledger_entity_type text,
    subledger_entity_id uuid,
    channel_key text,
    processor_key text,
    cash_deposit_key text,
    cost_center_id uuid,
    project_id uuid,
    boi_segment text DEFAULT 'n_a'::text NOT NULL,
    original_currency text,
    original_amount_debit numeric(18,2),
    original_amount_credit numeric(18,2),
    fx_rate_applied numeric(18,8),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone,
    CONSTRAINT journal_lines_debit_or_credit_check CHECK ((((debit_amount > (0)::numeric) AND (credit_amount = (0)::numeric)) OR ((debit_amount = (0)::numeric) AND (credit_amount > (0)::numeric))))
);


--
-- Name: loss_carry_forward_layers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.loss_carry_forward_layers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    originated_tax_year integer NOT NULL,
    expiry_tax_year integer NOT NULL,
    original_amount numeric(14,2) NOT NULL,
    remaining_amount numeric(14,2) NOT NULL,
    expired_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone,
    CONSTRAINT loss_carry_forward_layers_amount_check CHECK (((original_amount >= (0)::numeric) AND (remaining_amount >= (0)::numeric) AND (remaining_amount <= original_amount))),
    CONSTRAINT loss_carry_forward_layers_year_check CHECK ((expiry_tax_year = (originated_tax_year + 5)))
);


--
-- Name: org_ai_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_ai_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    extraction_model text,
    classification_model text,
    translation_model text,
    monthly_budget_usd numeric(8,2),
    budget_alert_threshold numeric(3,2) DEFAULT 0.80,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone,
    reconciliation_budget_usd numeric(8,2),
    reconciliation_model text,
    copilot_provider text,
    copilot_model text,
    copilot_api_key_secret_ref text,
    copilot_api_key_last4 text,
    copilot_monthly_budget_usd numeric(8,2),
    copilot_live_model_enabled boolean DEFAULT false NOT NULL,
    copilot_write_tools_enabled boolean DEFAULT false NOT NULL
);


--
-- Name: org_memberships; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_memberships (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role text DEFAULT 'member'::text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: org_reputation; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_reputation (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    score numeric(5,4) DEFAULT 1.0 NOT NULL,
    corrections_total integer DEFAULT 0 NOT NULL,
    corrections_agreed integer DEFAULT 0 NOT NULL,
    corrections_disputed integer DEFAULT 0 NOT NULL,
    first_doc_at timestamp with time zone,
    docs_processed integer DEFAULT 0 NOT NULL,
    eligible boolean DEFAULT false NOT NULL,
    updated_at timestamp with time zone,
    CONSTRAINT org_reputation_score_range CHECK (((score >= (0)::numeric) AND (score <= (5)::numeric)))
);


--
-- Name: organizations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organizations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    name_th text,
    tax_id character varying(13) NOT NULL,
    branch_number character varying(5) DEFAULT '00000'::character varying NOT NULL,
    registration_no text,
    address text,
    address_th text,
    is_vat_registered boolean DEFAULT false,
    fiscal_year_end_month integer DEFAULT 12,
    fiscal_year_end_day integer DEFAULT 31,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone,
    deleted_at timestamp with time zone,
    has_pos_sales boolean DEFAULT false NOT NULL,
    transfer_pricing_required boolean DEFAULT false NOT NULL,
    has_employees boolean DEFAULT false NOT NULL,
    has_imported_services boolean DEFAULT false NOT NULL
);


--
-- Name: pay_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pay_runs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    establishment_id uuid NOT NULL,
    period_start date NOT NULL,
    period_end date NOT NULL,
    pay_date date NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    approved_by text,
    approved_at timestamp with time zone,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone,
    CONSTRAINT pay_runs_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'approved'::text, 'paid'::text, 'voided'::text])))
);


--
-- Name: pay_slips; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pay_slips (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    establishment_id uuid NOT NULL,
    pay_run_id uuid NOT NULL,
    employee_id uuid NOT NULL,
    pnd1_income_type text DEFAULT '40_1'::text NOT NULL,
    gross_salary numeric(14,2) NOT NULL,
    bonus numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    bonus_treatment text DEFAULT 'rolled_in'::text NOT NULL,
    overtime numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    other_taxable_income numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    non_taxable_allowances numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    pit_wht numeric(14,2) NOT NULL,
    sso_employee numeric(14,2) NOT NULL,
    sso_employer numeric(14,2) NOT NULL,
    provident_fund_employee numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    provident_fund_employer numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    other_deductions numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    severance_payment numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    accrued_leave_payout numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    inlieu_of_notice numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    special_treatment_override boolean DEFAULT false NOT NULL,
    special_treatment_note text,
    net_pay numeric(14,2) NOT NULL,
    payment_method text,
    bank_transaction_id uuid,
    wht_certificate_id uuid,
    pnd_filing_id uuid,
    payload jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone,
    CONSTRAINT pay_slips_amounts_nonnegative_check CHECK (((gross_salary >= (0)::numeric) AND (bonus >= (0)::numeric) AND (overtime >= (0)::numeric) AND (pit_wht >= (0)::numeric) AND (sso_employee >= (0)::numeric) AND (sso_employer >= (0)::numeric) AND (net_pay >= (0)::numeric))),
    CONSTRAINT pay_slips_bonus_treatment_check CHECK ((bonus_treatment = ANY (ARRAY['rolled_in'::text, 'separate_event'::text]))),
    CONSTRAINT pay_slips_income_type_check CHECK ((pnd1_income_type = ANY (ARRAY['40_1'::text, '40_2'::text]))),
    CONSTRAINT pay_slips_override_note_check CHECK (((special_treatment_override = false) OR (special_treatment_note IS NOT NULL)))
);


--
-- Name: payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    document_id uuid NOT NULL,
    payment_date date NOT NULL,
    gross_amount numeric(14,2) NOT NULL,
    wht_amount_withheld numeric(14,2),
    net_amount_paid numeric(14,2) NOT NULL,
    payment_method public.payment_method,
    is_ewht boolean DEFAULT false,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone,
    deleted_at timestamp with time zone,
    CONSTRAINT payments_amounts_nonnegative_check CHECK (((gross_amount >= (0)::numeric) AND ((wht_amount_withheld IS NULL) OR (wht_amount_withheld >= (0)::numeric)) AND (net_amount_paid >= (0)::numeric))),
    CONSTRAINT payments_gross_minus_wht_equals_net_check CHECK ((round((gross_amount - COALESCE(wht_amount_withheld, (0)::numeric)), 2) = round((net_amount_paid)::numeric, 2)))
);


--
-- Name: period_locks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.period_locks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    establishment_id uuid,
    domain text NOT NULL,
    period_year integer NOT NULL,
    period_month integer,
    locked_at timestamp with time zone DEFAULT now() NOT NULL,
    locked_by_user_id text NOT NULL,
    lock_reason text NOT NULL,
    unlocked_at timestamp with time zone,
    unlocked_by_user_id text,
    unlock_reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone,
    CONSTRAINT period_locks_period_month_check CHECK (((period_month IS NULL) OR ((period_month >= 1) AND (period_month <= 12))))
);


--
-- Name: pit_brackets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pit_brackets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    effective_from date NOT NULL,
    effective_to date,
    lower_bound numeric(14,2) NOT NULL,
    upper_bound numeric(14,2),
    marginal_rate numeric(5,4) NOT NULL,
    cumulative_tax_at_lower_bound numeric(14,2) NOT NULL,
    source_citation text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone
);


--
-- Name: pit_standard_deductions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pit_standard_deductions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    effective_from date NOT NULL,
    effective_to date,
    employment_expense_pct numeric(5,4) NOT NULL,
    employment_expense_cap numeric(14,2) NOT NULL,
    personal_allowance numeric(14,2) NOT NULL,
    spouse_allowance numeric(14,2) NOT NULL,
    child_pre_2018_allowance numeric(14,2) NOT NULL,
    child_post_2018_second_plus_allowance numeric(14,2) NOT NULL,
    parent_allowance_per numeric(14,2) NOT NULL,
    source_citation text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone
);


--
-- Name: pnd_filings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pnd_filings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    establishment_id uuid NOT NULL,
    form_type text NOT NULL,
    tax_period text NOT NULL,
    filing_status text DEFAULT 'draft'::text NOT NULL,
    submitted_at timestamp with time zone,
    accepted_at timestamp with time zone,
    total_payees integer,
    total_gross_amount numeric(14,2),
    total_wht_amount numeric(14,2),
    paid_at timestamp with time zone,
    bank_transaction_id uuid,
    is_amendment boolean DEFAULT false NOT NULL,
    amends_filing_id uuid,
    amendment_reason text,
    voluntary_amendment_penalty_pct numeric(5,4),
    surcharge_amount numeric(14,2),
    rd_reference_number text,
    confirmation_document_id uuid,
    payload jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone,
    CONSTRAINT pnd_filings_form_type_check CHECK ((form_type = ANY (ARRAY['PND1'::text, 'PND1KOR'::text, 'PND2'::text, 'PND3'::text, 'PND53'::text, 'PND54'::text]))),
    CONSTRAINT pnd_filings_status_check CHECK ((filing_status = ANY (ARRAY['draft'::text, 'submitted'::text, 'accepted'::text, 'rejected'::text])))
);


--
-- Name: posting_exceptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.posting_exceptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    posting_outbox_id uuid NOT NULL,
    source_entity_type text NOT NULL,
    source_entity_id uuid NOT NULL,
    failure_class text DEFAULT 'unknown'::text NOT NULL,
    message text NOT NULL,
    resolved_at timestamp with time zone,
    resolution text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT posting_exceptions_failure_class_check CHECK ((failure_class = ANY (ARRAY['unknown'::text, 'unmapped_account'::text, 'invalid_source'::text, 'db_error'::text])))
);


--
-- Name: posting_outbox; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.posting_outbox (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    source_entity_type text NOT NULL,
    source_entity_id uuid NOT NULL,
    event_type text NOT NULL,
    payload jsonb,
    posting_status text DEFAULT 'pending'::text NOT NULL,
    posting_attempts integer DEFAULT 0 NOT NULL,
    last_attempt_at timestamp with time zone,
    last_error text,
    journal_entry_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    posting_date date,
    CONSTRAINT posting_outbox_status_check CHECK ((posting_status = ANY (ARRAY['pending'::text, 'posted'::text, 'failed'::text, 'retrying'::text])))
);


--
-- Name: pp36_obligations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pp36_obligations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    establishment_id uuid,
    tax_treatment_decision_id uuid,
    source_document_id uuid,
    source_document_line_id uuid,
    source_payment_transaction_id uuid,
    source_reconciliation_match_id uuid,
    vendor_id uuid NOT NULL,
    vendor_country_code text NOT NULL,
    service_description text,
    base_amount_thb numeric(14,2) NOT NULL,
    source_currency character varying(3),
    source_amount numeric(14,2),
    fx_rate numeric(12,6),
    fx_rate_source text,
    fx_rate_date date,
    vat_amount numeric(14,2) NOT NULL,
    vat_rate numeric(5,4) NOT NULL,
    occurred_on date NOT NULL,
    payment_date date NOT NULL,
    tax_point_date date NOT NULL,
    period_basis public.pp36_period_basis NOT NULL,
    period_rule_version_id uuid,
    pp36_period_year integer NOT NULL,
    pp36_period_month integer NOT NULL,
    pp36_filing_id uuid,
    pp36_filing_line_id uuid,
    pp36_paid_at timestamp with time zone,
    pp36_payment_transaction_id uuid,
    pp30_reclaim_eligible_period_year integer,
    pp30_reclaim_eligible_period_month integer,
    pp30_reclaim_expiry_period_year integer,
    pp30_reclaim_expiry_period_month integer,
    pp30_reclaim_filing_id uuid,
    pp30_reclaim_filing_line_id uuid,
    reclaim_rule_version_id uuid,
    status public.pp36_obligation_status DEFAULT 'needs_review'::public.pp36_obligation_status NOT NULL,
    source_snapshot jsonb NOT NULL,
    source_snapshot_hash text NOT NULL,
    snapshot_version text DEFAULT 'vat_snapshot_v1'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone,
    deleted_at timestamp with time zone,
    CONSTRAINT pp36_amounts_nonnegative_check CHECK (((base_amount_thb >= (0)::numeric) AND (vat_amount >= (0)::numeric) AND ((source_amount IS NULL) OR (source_amount >= (0)::numeric)))),
    CONSTRAINT pp36_establishment_null_check CHECK ((establishment_id IS NULL)),
    CONSTRAINT pp36_period_matches_tax_point_check CHECK (((pp36_period_year = (EXTRACT(year FROM tax_point_date))::integer) AND (pp36_period_month = (EXTRACT(month FROM tax_point_date))::integer))),
    CONSTRAINT pp36_period_month_check CHECK (((pp36_period_month >= 1) AND (pp36_period_month <= 12) AND ((pp30_reclaim_eligible_period_month IS NULL) OR ((pp30_reclaim_eligible_period_month >= 1) AND (pp30_reclaim_eligible_period_month <= 12))) AND ((pp30_reclaim_expiry_period_month IS NULL) OR ((pp30_reclaim_expiry_period_month >= 1) AND (pp30_reclaim_expiry_period_month <= 12))))),
    CONSTRAINT pp36_rate_range_check CHECK (((vat_rate >= (0)::numeric) AND (vat_rate <= (1)::numeric))),
    CONSTRAINT pp36_reclaim_requires_paid_check CHECK ((((status <> ALL (ARRAY['eligible_for_pp30_reclaim'::public.pp36_obligation_status, 'reclaimed_in_pp30'::public.pp36_obligation_status])) AND (pp30_reclaim_filing_id IS NULL) AND (pp30_reclaim_filing_line_id IS NULL)) OR ((status = 'eligible_for_pp30_reclaim'::public.pp36_obligation_status) AND (pp36_paid_at IS NOT NULL) AND (pp36_filing_id IS NOT NULL) AND (pp36_filing_line_id IS NOT NULL) AND (pp30_reclaim_filing_id IS NULL) AND (pp30_reclaim_filing_line_id IS NULL)) OR ((status = 'reclaimed_in_pp30'::public.pp36_obligation_status) AND (pp36_paid_at IS NOT NULL) AND (pp36_filing_id IS NOT NULL) AND (pp36_filing_line_id IS NOT NULL) AND (pp30_reclaim_filing_id IS NOT NULL) AND (pp30_reclaim_filing_line_id IS NOT NULL)))),
    CONSTRAINT pp36_snapshot_hash_check CHECK ((source_snapshot_hash ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT pp36_status_links_check CHECK ((((status <> ALL (ARRAY['allocated_to_draft_pp36'::public.pp36_obligation_status, 'pp36_filed'::public.pp36_obligation_status, 'pp36_paid'::public.pp36_obligation_status, 'eligible_for_pp30_reclaim'::public.pp36_obligation_status, 'reclaimed_in_pp30'::public.pp36_obligation_status])) OR ((pp36_filing_id IS NOT NULL) AND (pp36_filing_line_id IS NOT NULL))) AND ((status <> ALL (ARRAY['pp36_paid'::public.pp36_obligation_status, 'eligible_for_pp30_reclaim'::public.pp36_obligation_status, 'reclaimed_in_pp30'::public.pp36_obligation_status])) OR (pp36_paid_at IS NOT NULL)))),
    CONSTRAINT pp36_vendor_country_code_check CHECK ((vendor_country_code ~ '^[A-Z]{2}$'::text))
);


--
-- Name: processor_settlements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.processor_settlements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    establishment_id uuid,
    processor text NOT NULL,
    external_id text NOT NULL,
    period_start timestamp with time zone,
    period_end timestamp with time zone,
    gross_amount numeric(14,2) NOT NULL,
    fee_amount numeric(14,2) NOT NULL,
    fee_vat_amount numeric(14,2),
    net_payout numeric(14,2) NOT NULL,
    processor_tax_invoice_document_id uuid,
    processor_ti_received_at timestamp with time zone,
    processor_ti_number text,
    bank_transaction_id uuid,
    payload jsonb,
    reconciliation_status text DEFAULT 'unreconciled'::text NOT NULL,
    reconciliation_discrepancy numeric(14,2),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone,
    CONSTRAINT processor_settlements_fee_vat_document_check CHECK (((fee_vat_amount IS NULL) OR (fee_vat_amount = (0)::numeric) OR (processor_tax_invoice_document_id IS NOT NULL)))
);


--
-- Name: projects; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.projects (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    code text NOT NULL,
    name_th text,
    name_en text NOT NULL,
    customer_vendor_id uuid,
    start_date date,
    end_date date,
    status text DEFAULT 'active'::text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone,
    deleted_at timestamp with time zone,
    CONSTRAINT projects_status_check CHECK ((status = ANY (ARRAY['planned'::text, 'active'::text, 'paused'::text, 'completed'::text, 'cancelled'::text])))
);


--
-- Name: reconciliation_matches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reconciliation_matches (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    transaction_id uuid NOT NULL,
    document_id uuid NOT NULL,
    payment_id uuid,
    matched_amount numeric(14,2),
    match_type public.match_type NOT NULL,
    confidence numeric(3,2),
    matched_by public.matched_by NOT NULL,
    matched_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone,
    deleted_at timestamp with time zone,
    match_metadata jsonb,
    CONSTRAINT reconciliation_matches_amount_positive_check CHECK (((matched_amount IS NOT NULL) AND (matched_amount > (0)::numeric))),
    CONSTRAINT reconciliation_matches_confidence_range_check CHECK (((confidence IS NULL) OR ((confidence >= (0)::numeric) AND (confidence <= (1)::numeric))))
);


--
-- Name: reconciliation_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reconciliation_rules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    priority integer DEFAULT 100 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    is_auto_suggested boolean DEFAULT false NOT NULL,
    conditions jsonb NOT NULL,
    actions jsonb NOT NULL,
    match_count integer DEFAULT 0 NOT NULL,
    last_matched_at timestamp with time zone,
    template_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone,
    deleted_at timestamp with time zone
);


--
-- Name: recurring_payment_patterns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.recurring_payment_patterns (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    vendor_id uuid,
    expected_amount numeric(14,2),
    amount_tolerance numeric(5,4) DEFAULT 0.0500,
    expected_day_of_month integer,
    day_tolerance integer DEFAULT 5,
    counterparty_pattern text,
    occurrence_count integer DEFAULT 0 NOT NULL,
    last_occurred_at timestamp with time zone,
    is_confirmed boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone,
    deleted_at timestamp with time zone
);


--
-- Name: sales_transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sales_transactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    establishment_id uuid NOT NULL,
    event_role text NOT NULL,
    source text NOT NULL,
    external_id text NOT NULL,
    sold_at timestamp with time zone NOT NULL,
    channel text NOT NULL,
    pricing_mode text NOT NULL,
    amount_including_vat numeric(14,2) NOT NULL,
    tax_base_ex_vat numeric(14,2) NOT NULL,
    vat_amount numeric(14,2) NOT NULL,
    vat_rate numeric(5,4) DEFAULT 0.0700 NOT NULL,
    discount_amount numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    discount_funded_by text,
    tip_amount numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    tax_invoice_type text,
    tax_invoice_number text,
    terminal_id text,
    superseded_by_id uuid,
    is_deemed_supply boolean DEFAULT false NOT NULL,
    deemed_supply_basis text,
    original_currency text,
    fx_rate numeric(18,8),
    fx_source text,
    payload jsonb,
    clearing_account_key text NOT NULL,
    settlement_status text DEFAULT 'pending'::text NOT NULL,
    settlement_aged_at timestamp with time zone,
    settled_transaction_id uuid,
    settled_at timestamp with time zone,
    voided_at timestamp with time zone,
    voided_by_terminal_user text,
    void_reason text,
    credit_note_for_id uuid,
    credit_note_reason text,
    is_voucher_redemption boolean DEFAULT false NOT NULL,
    voucher_sales_id uuid,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone,
    deleted_at timestamp with time zone,
    CONSTRAINT sales_transactions_amounts_nonnegative_check CHECK (((amount_including_vat >= (0)::numeric) AND (tax_base_ex_vat >= (0)::numeric) AND (vat_amount >= (0)::numeric))),
    CONSTRAINT sales_transactions_event_role_check CHECK ((event_role = ANY (ARRAY['pos_primary'::text, 'processor_shadow'::text]))),
    CONSTRAINT sales_transactions_pos_primary_invoice_check CHECK (((event_role <> 'pos_primary'::text) OR (tax_invoice_type IS NOT NULL))),
    CONSTRAINT sales_transactions_pricing_mode_check CHECK ((pricing_mode = ANY (ARRAY['vat_inclusive'::text, 'vat_exclusive'::text])))
);


--
-- Name: skus; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.skus (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    establishment_id uuid,
    sku_code text NOT NULL,
    barcode_ean13 text,
    name_th text,
    name_en text,
    description text,
    category text,
    valuation_method text DEFAULT 'weighted_average'::text NOT NULL,
    unit_of_measure text DEFAULT 'pcs'::text NOT NULL,
    current_quantity numeric(14,4) DEFAULT '0'::numeric NOT NULL,
    current_avg_cost numeric(14,4) DEFAULT '0'::numeric NOT NULL,
    last_known_avg_cost numeric(14,4),
    standard_cost numeric(14,4),
    current_value numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    last_movement_at timestamp with time zone,
    is_inventoriable boolean DEFAULT true NOT NULL,
    gl_inventory_account_id uuid,
    gl_cogs_account_id uuid,
    gl_revenue_account_id uuid,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone,
    deleted_at timestamp with time zone,
    reorder_point_quantity numeric(14,4) DEFAULT '0'::numeric NOT NULL,
    CONSTRAINT skus_costs_nonnegative_check CHECK (((current_avg_cost >= (0)::numeric) AND ((last_known_avg_cost IS NULL) OR (last_known_avg_cost >= (0)::numeric)) AND ((standard_cost IS NULL) OR (standard_cost >= (0)::numeric)))),
    CONSTRAINT skus_reorder_point_nonnegative_check CHECK ((reorder_point_quantity >= (0)::numeric)),
    CONSTRAINT skus_valuation_method_check CHECK ((valuation_method = ANY (ARRAY['weighted_average'::text, 'fifo'::text, 'specific_identification'::text])))
);


--
-- Name: sso_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sso_config (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    effective_from date NOT NULL,
    effective_to date,
    employee_rate numeric(5,4) NOT NULL,
    employer_rate numeric(5,4) NOT NULL,
    insurable_wage_floor numeric(14,2) NOT NULL,
    insurable_wage_cap numeric(14,2) NOT NULL,
    monthly_max_per_side numeric(14,2) NOT NULL,
    source_citation text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone
);


--
-- Name: sso_filings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sso_filings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    establishment_id uuid NOT NULL,
    tax_month text NOT NULL,
    filing_status text DEFAULT 'draft'::text NOT NULL,
    total_employees integer,
    total_employee_contribution numeric(14,2),
    total_employer_contribution numeric(14,2),
    submitted_at timestamp with time zone,
    accepted_at timestamp with time zone,
    bank_transaction_id uuid,
    is_amendment boolean DEFAULT false NOT NULL,
    amends_filing_id uuid,
    amendment_reason text,
    sso_reference_number text,
    confirmation_document_id uuid,
    payload jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone,
    paid_at timestamp with time zone,
    CONSTRAINT sso_filings_status_check CHECK ((filing_status = ANY (ARRAY['draft'::text, 'submitted'::text, 'accepted'::text])))
);


--
-- Name: tax_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tax_config (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    key text NOT NULL,
    value text NOT NULL,
    description text,
    effective_from date,
    effective_to date,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone
);


--
-- Name: tax_min_life_by_category; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tax_min_life_by_category (
    category text NOT NULL,
    tax_useful_life_months_minimum integer NOT NULL,
    source_citation text NOT NULL,
    effective_from date NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone,
    CONSTRAINT tax_min_life_months_nonnegative_check CHECK ((tax_useful_life_months_minimum >= 0))
);


--
-- Name: tax_payment_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tax_payment_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    filing_id uuid NOT NULL,
    event_type public.tax_payment_event_type NOT NULL,
    event_status public.tax_payment_event_status DEFAULT 'recorded'::public.tax_payment_event_status NOT NULL,
    payment_transaction_id uuid,
    paid_at timestamp with time zone NOT NULL,
    amount numeric(14,2) NOT NULL,
    receipt_no text,
    evidence_document_id uuid,
    idempotency_key text NOT NULL,
    posting_outbox_status public.tax_posting_outbox_status DEFAULT 'pending'::public.tax_posting_outbox_status NOT NULL,
    created_by_user_id text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT tax_payment_events_amount_nonnegative_check CHECK ((amount >= (0)::numeric))
);


--
-- Name: tax_rule_versions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tax_rule_versions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid,
    rule_scope public.tax_rule_scope NOT NULL,
    version text NOT NULL,
    effective_from date NOT NULL,
    effective_to date,
    rule_body jsonb NOT NULL,
    source_url text,
    source_checked_at timestamp with time zone,
    cpa_reviewed_by_user_id text,
    cpa_reviewed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone,
    deleted_at timestamp with time zone
);


--
-- Name: tax_treatment_decisions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tax_treatment_decisions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    source_document_id uuid,
    source_document_line_id uuid,
    source_transaction_id uuid,
    source_payment_id uuid,
    source_reconciliation_match_id uuid,
    treatment_type public.tax_treatment_type NOT NULL,
    review_status public.tax_treatment_review_status DEFAULT 'needs_review'::public.tax_treatment_review_status NOT NULL,
    confidence numeric(5,4),
    evidence jsonb DEFAULT '{}'::jsonb NOT NULL,
    rule_version_id uuid,
    suggested_by text,
    confirmed_by_user_id text,
    confirmed_at timestamp with time zone,
    review_reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone,
    deleted_at timestamp with time zone,
    CONSTRAINT tax_treatment_confidence_range_check CHECK (((confidence IS NULL) OR ((confidence >= (0)::numeric) AND (confidence <= (1)::numeric)))),
    CONSTRAINT tax_treatment_has_source_check CHECK ((num_nonnulls(source_document_id, source_document_line_id, source_transaction_id, source_payment_id, source_reconciliation_match_id) >= 1))
);


--
-- Name: thai_business_calendar; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.thai_business_calendar (
    date date NOT NULL,
    holiday_name_th text NOT NULL,
    holiday_name_en text NOT NULL,
    source_announcement text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.transactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    bank_account_id uuid NOT NULL,
    statement_id uuid,
    date date NOT NULL,
    description text,
    amount numeric(14,2) NOT NULL,
    type public.transaction_type NOT NULL,
    running_balance numeric(14,2),
    reference_no text,
    channel text,
    counterparty text,
    reconciliation_status public.reconciliation_status DEFAULT 'unmatched'::public.reconciliation_status,
    is_petty_cash boolean DEFAULT false,
    external_ref text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone,
    deleted_at timestamp with time zone
);


--
-- Name: transfer_pricing_disclosures; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.transfer_pricing_disclosures (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    tax_year integer NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    revenue_total numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    disclosure_required boolean DEFAULT false NOT NULL,
    related_party_transactions_payload jsonb,
    notes text,
    prepared_by_user_id text,
    submitted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT transfer_pricing_disclosures_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'submitted'::text])))
);


--
-- Name: user_nav_pins; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_nav_pins (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    user_id text NOT NULL,
    href text NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid,
    name text NOT NULL,
    email text NOT NULL,
    role text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone,
    deleted_at timestamp with time zone,
    clerk_id text
);


--
-- Name: vat_credit_carryforwards; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vat_credit_carryforwards (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    establishment_id uuid,
    source_pp30_filing_id uuid NOT NULL,
    source_pp30_filing_line_id uuid,
    credit_origin_period_year integer NOT NULL,
    credit_origin_period_month integer NOT NULL,
    amount numeric(14,2) NOT NULL,
    remaining_amount numeric(14,2) NOT NULL,
    applied_to_pp30_filing_id uuid,
    status public.vat_credit_carryforward_status DEFAULT 'available'::public.vat_credit_carryforward_status NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone,
    CONSTRAINT vat_credit_carryforward_amount_check CHECK (((amount >= (0)::numeric) AND (remaining_amount >= (0)::numeric) AND (remaining_amount <= amount))),
    CONSTRAINT vat_credit_carryforward_establishment_check CHECK ((establishment_id IS NOT NULL)),
    CONSTRAINT vat_credit_carryforward_period_month_check CHECK (((credit_origin_period_month >= 1) AND (credit_origin_period_month <= 12)))
);


--
-- Name: vat_filing_lines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vat_filing_lines (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    filing_id uuid NOT NULL,
    line_type public.vat_filing_line_type NOT NULL,
    vat_input_item_id uuid,
    vat_output_item_id uuid,
    pp36_obligation_id uuid,
    amount numeric(14,2) NOT NULL,
    vat_amount numeric(14,2) NOT NULL,
    frozen_snapshot_hash text NOT NULL,
    frozen_snapshot jsonb NOT NULL,
    snapshot_version text DEFAULT 'vat_snapshot_v1'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT vat_filing_lines_amounts_nonnegative_check CHECK (((amount >= (0)::numeric) AND (vat_amount >= (0)::numeric))),
    CONSTRAINT vat_filing_lines_snapshot_hash_check CHECK ((frozen_snapshot_hash ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT vat_filing_lines_type_source_check CHECK ((((line_type = 'input'::public.vat_filing_line_type) AND (vat_input_item_id IS NOT NULL) AND (vat_output_item_id IS NULL) AND (pp36_obligation_id IS NULL)) OR ((line_type = 'output'::public.vat_filing_line_type) AND (vat_input_item_id IS NULL) AND (vat_output_item_id IS NOT NULL) AND (pp36_obligation_id IS NULL)) OR ((line_type = ANY (ARRAY['pp36_obligation'::public.vat_filing_line_type, 'pp36_reclaim'::public.vat_filing_line_type])) AND (vat_input_item_id IS NULL) AND (vat_output_item_id IS NULL) AND (pp36_obligation_id IS NOT NULL)) OR ((line_type = ANY (ARRAY['carryforward'::public.vat_filing_line_type, 'credit_note_adjustment'::public.vat_filing_line_type])) AND (vat_input_item_id IS NULL) AND (vat_output_item_id IS NULL) AND (pp36_obligation_id IS NULL))))
);


--
-- Name: vat_filings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vat_filings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    establishment_id uuid,
    filing_type public.vat_filing_type NOT NULL,
    period_year integer NOT NULL,
    period_month integer NOT NULL,
    filing_kind public.vat_filing_kind NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    amends_filing_id uuid,
    status public.vat_filing_status DEFAULT 'draft'::public.vat_filing_status NOT NULL,
    output_vat_total numeric(14,2),
    input_vat_total numeric(14,2),
    pp36_vat_total numeric(14,2),
    pp36_reclaim_total numeric(14,2),
    carryforward_in numeric(14,2),
    carryforward_out numeric(14,2),
    net_payable numeric(14,2),
    filed_at timestamp with time zone,
    filed_by_user_id text,
    payment_status public.vat_payment_status DEFAULT 'not_required'::public.vat_payment_status NOT NULL,
    deadline date,
    refund_requested boolean DEFAULT false NOT NULL,
    refund_amount numeric(14,2),
    refund_status public.vat_refund_status,
    penalty_amount numeric(14,2),
    surcharge_amount numeric(14,2),
    paid_at timestamp with time zone,
    payment_transaction_id uuid,
    rd_receipt_no text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone,
    deleted_at timestamp with time zone,
    CONSTRAINT vat_filings_amounts_nonnegative_check CHECK ((((output_vat_total IS NULL) OR (output_vat_total >= (0)::numeric)) AND ((input_vat_total IS NULL) OR (input_vat_total >= (0)::numeric)) AND ((pp36_vat_total IS NULL) OR (pp36_vat_total >= (0)::numeric)) AND ((pp36_reclaim_total IS NULL) OR (pp36_reclaim_total >= (0)::numeric)) AND ((carryforward_in IS NULL) OR (carryforward_in >= (0)::numeric)) AND ((carryforward_out IS NULL) OR (carryforward_out >= (0)::numeric)) AND ((refund_amount IS NULL) OR (refund_amount >= (0)::numeric)) AND ((penalty_amount IS NULL) OR (penalty_amount >= (0)::numeric)) AND ((surcharge_amount IS NULL) OR (surcharge_amount >= (0)::numeric)))),
    CONSTRAINT vat_filings_period_month_check CHECK (((period_month >= 1) AND (period_month <= 12))),
    CONSTRAINT vat_filings_pp30_establishment_check CHECK (((filing_type <> 'pp30'::public.vat_filing_type) OR (filing_kind <> 'ordinary'::public.vat_filing_kind) OR (establishment_id IS NOT NULL))),
    CONSTRAINT vat_filings_refund_requested_amount_check CHECK (((refund_requested = false) OR (refund_amount > (0)::numeric))),
    CONSTRAINT vat_filings_version_positive_check CHECK ((version >= 1))
);


--
-- Name: vat_input_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vat_input_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    establishment_id uuid,
    tax_treatment_decision_id uuid,
    source_document_id uuid NOT NULL,
    source_document_line_id uuid,
    source_transaction_id uuid,
    source_reconciliation_match_id uuid,
    vendor_id uuid NOT NULL,
    tax_invoice_no text,
    tax_invoice_date date,
    tax_invoice_received_date date,
    tax_invoice_subtype public.tax_invoice_subtype NOT NULL,
    document_date date,
    payment_date date,
    base_amount numeric(14,2) NOT NULL,
    vat_amount numeric(14,2) NOT NULL,
    vat_rate numeric(5,4) NOT NULL,
    eligible_period_year integer,
    eligible_period_month integer,
    expiry_period_year integer,
    expiry_period_month integer,
    claim_period_year integer,
    claim_period_month integer,
    claim_basis_date date,
    claim_window_rule_version_id uuid,
    status public.vat_input_status DEFAULT 'needs_review'::public.vat_input_status NOT NULL,
    status_reason text,
    draft_filing_id uuid,
    filed_filing_line_id uuid,
    source_snapshot jsonb NOT NULL,
    source_snapshot_hash text NOT NULL,
    snapshot_version text DEFAULT 'vat_snapshot_v1'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone,
    deleted_at timestamp with time zone,
    CONSTRAINT vat_input_amounts_nonnegative_check CHECK (((base_amount >= (0)::numeric) AND (vat_amount >= (0)::numeric))),
    CONSTRAINT vat_input_claimable_establishment_check CHECK (((status <> ALL (ARRAY['claimable'::public.vat_input_status, 'allocated_to_draft'::public.vat_input_status, 'filed'::public.vat_input_status])) OR (establishment_id IS NOT NULL))),
    CONSTRAINT vat_input_claimable_requires_full_tax_invoice_check CHECK (((status <> ALL (ARRAY['claimable'::public.vat_input_status, 'allocated_to_draft'::public.vat_input_status, 'filed'::public.vat_input_status])) OR ((tax_invoice_subtype = ANY (ARRAY['full_ti'::public.tax_invoice_subtype, 'e_tax_invoice'::public.tax_invoice_subtype])) AND (tax_invoice_no IS NOT NULL) AND (tax_invoice_date IS NOT NULL)))),
    CONSTRAINT vat_input_period_month_check CHECK ((((eligible_period_month IS NULL) OR ((eligible_period_month >= 1) AND (eligible_period_month <= 12))) AND ((expiry_period_month IS NULL) OR ((expiry_period_month >= 1) AND (expiry_period_month <= 12))) AND ((claim_period_month IS NULL) OR ((claim_period_month >= 1) AND (claim_period_month <= 12))))),
    CONSTRAINT vat_input_rate_range_check CHECK (((vat_rate >= (0)::numeric) AND (vat_rate <= (1)::numeric))),
    CONSTRAINT vat_input_snapshot_hash_check CHECK ((source_snapshot_hash ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT vat_input_status_links_check CHECK ((((status <> 'allocated_to_draft'::public.vat_input_status) OR (draft_filing_id IS NOT NULL)) AND ((status <> 'filed'::public.vat_input_status) OR (filed_filing_line_id IS NOT NULL))))
);


--
-- Name: vat_output_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vat_output_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    establishment_id uuid,
    tax_treatment_decision_id uuid,
    source_document_id uuid,
    source_document_line_id uuid,
    source_pos_sale_id uuid,
    source_transaction_id uuid,
    customer_id uuid,
    tax_invoice_no text,
    tax_invoice_date date NOT NULL,
    document_date date NOT NULL,
    tax_point_date date NOT NULL,
    tax_point_basis public.vat_output_tax_point_basis NOT NULL,
    tax_point_rule_version_id uuid,
    base_amount numeric(14,2) NOT NULL,
    vat_amount numeric(14,2) NOT NULL,
    vat_rate numeric(5,4) NOT NULL,
    output_period_year integer NOT NULL,
    output_period_month integer NOT NULL,
    status public.vat_output_status DEFAULT 'needs_review'::public.vat_output_status NOT NULL,
    source_snapshot jsonb NOT NULL,
    source_snapshot_hash text NOT NULL,
    snapshot_version text DEFAULT 'vat_snapshot_v1'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone,
    deleted_at timestamp with time zone,
    draft_filing_id uuid,
    filed_filing_line_id uuid,
    CONSTRAINT vat_output_amounts_nonnegative_check CHECK (((base_amount >= (0)::numeric) AND (vat_amount >= (0)::numeric))),
    CONSTRAINT vat_output_has_source_check CHECK ((num_nonnulls(source_document_id, source_document_line_id, source_pos_sale_id, source_transaction_id) >= 1)),
    CONSTRAINT vat_output_period_month_check CHECK (((output_period_month >= 1) AND (output_period_month <= 12))),
    CONSTRAINT vat_output_rate_range_check CHECK (((vat_rate >= (0)::numeric) AND (vat_rate <= (1)::numeric))),
    CONSTRAINT vat_output_reportable_establishment_check CHECK (((status <> ALL (ARRAY['reportable'::public.vat_output_status, 'allocated_to_draft'::public.vat_output_status, 'filed'::public.vat_output_status])) OR (establishment_id IS NOT NULL))),
    CONSTRAINT vat_output_snapshot_hash_check CHECK ((source_snapshot_hash ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT vat_output_status_links_check CHECK ((((status <> 'allocated_to_draft'::public.vat_output_status) OR (draft_filing_id IS NOT NULL)) AND ((status <> 'filed'::public.vat_output_status) OR (filed_filing_line_id IS NOT NULL))))
);


--
-- Name: vendor_bank_aliases; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vendor_bank_aliases (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    vendor_id uuid NOT NULL,
    alias_text text NOT NULL,
    alias_type text DEFAULT 'counterparty'::text NOT NULL,
    match_count integer DEFAULT 1 NOT NULL,
    is_confirmed boolean DEFAULT false NOT NULL,
    source text DEFAULT 'auto_learn'::text NOT NULL,
    last_matched_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone,
    deleted_at timestamp with time zone
);


--
-- Name: vendor_tier; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vendor_tier (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    vendor_id uuid NOT NULL,
    scope_kind public.vendor_tier_scope_kind NOT NULL,
    org_id uuid,
    tier smallint DEFAULT 0 NOT NULL,
    docs_processed_total integer DEFAULT 0 NOT NULL,
    last_doc_at timestamp with time zone,
    last_promoted_at timestamp with time zone,
    last_demoted_at timestamp with time zone,
    updated_at timestamp with time zone,
    CONSTRAINT vendor_tier_scope_org_consistency_check CHECK ((((scope_kind = 'org'::public.vendor_tier_scope_kind) AND (org_id IS NOT NULL)) OR ((scope_kind = 'global'::public.vendor_tier_scope_kind) AND (org_id IS NULL))))
);


--
-- Name: vendors; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vendors (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    name text NOT NULL,
    name_th text,
    tax_id character varying(13),
    registration_no text,
    branch_number character varying(5),
    address text,
    address_th text,
    email text,
    payment_terms_days integer,
    is_vat_registered boolean,
    entity_type public.entity_type NOT NULL,
    country text DEFAULT 'TH'::text,
    dbd_verified boolean DEFAULT false,
    dbd_data jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone,
    deleted_at timestamp with time zone,
    display_alias text
);


--
-- Name: voucher_sales; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.voucher_sales (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    establishment_id uuid NOT NULL,
    sold_at timestamp with time zone NOT NULL,
    voucher_code text NOT NULL,
    face_value numeric(14,2) NOT NULL,
    payment_received numeric(14,2) NOT NULL,
    expires_at date,
    redeemed_at timestamp with time zone,
    redemption_sales_transaction_id uuid,
    payload jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone,
    deleted_at timestamp with time zone,
    CONSTRAINT voucher_sales_amounts_nonnegative_check CHECK (((face_value >= (0)::numeric) AND (payment_received >= (0)::numeric)))
);


--
-- Name: wht_annual_threshold_decisions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wht_annual_threshold_decisions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    payee_vendor_id uuid NOT NULL,
    document_id uuid NOT NULL,
    line_item_id uuid,
    certificate_id uuid,
    payment_id uuid,
    tax_year integer NOT NULL,
    eligible_base_amount numeric(14,2) NOT NULL,
    wht_rate numeric(5,4) NOT NULL,
    wht_amount numeric(14,2) NOT NULL,
    threshold_status text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: wht_certificate_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wht_certificate_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    certificate_id uuid NOT NULL,
    document_id uuid NOT NULL,
    line_item_id uuid,
    base_amount numeric(14,2),
    wht_rate numeric(5,4),
    wht_amount numeric(14,2),
    rd_payment_type_code text,
    wht_type text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone,
    deleted_at timestamp with time zone,
    CONSTRAINT wht_certificate_items_amounts_nonnegative_check CHECK ((((base_amount IS NULL) OR (base_amount >= (0)::numeric)) AND ((wht_amount IS NULL) OR (wht_amount >= (0)::numeric)) AND ((wht_rate IS NULL) OR ((wht_rate >= (0)::numeric) AND (wht_rate <= (1)::numeric)))))
);


--
-- Name: wht_certificates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wht_certificates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    certificate_no text NOT NULL,
    payee_vendor_id uuid NOT NULL,
    payment_date date,
    total_base_amount numeric(14,2),
    total_wht numeric(14,2),
    form_type public.wht_form_type NOT NULL,
    filing_id uuid,
    pdf_url text,
    status public.wht_cert_status DEFAULT 'draft'::public.wht_cert_status NOT NULL,
    voided_at timestamp with time zone,
    void_reason text,
    replacement_cert_id uuid,
    issued_date date,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone,
    deleted_at timestamp with time zone,
    payer_tax_id_snapshot text DEFAULT ''::text NOT NULL,
    payer_address_snapshot text DEFAULT ''::text NOT NULL,
    payee_address_snapshot text DEFAULT ''::text NOT NULL,
    payee_id_number_snapshot text DEFAULT ''::text NOT NULL,
    payment_type_description text DEFAULT ''::text NOT NULL,
    signatory_name_snapshot text DEFAULT ''::text NOT NULL,
    signatory_position_snapshot text DEFAULT ''::text NOT NULL,
    rate_below_default_acknowledged_by_user_id text,
    rate_below_default_acknowledged_at timestamp with time zone,
    rate_below_default_statutory_rate numeric(5,4),
    rate_below_default_selected_rate numeric(5,4),
    rate_below_default_rationale text,
    rate_below_default_accountant_note text,
    CONSTRAINT wht_certificates_amounts_nonnegative_check CHECK ((((total_base_amount IS NULL) OR (total_base_amount >= (0)::numeric)) AND ((total_wht IS NULL) OR (total_wht >= (0)::numeric))))
);


--
-- Name: wht_credits_received; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wht_credits_received (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    customer_vendor_id uuid NOT NULL,
    certificate_received_document_id uuid,
    payment_date date NOT NULL,
    gross_amount numeric(14,2) NOT NULL,
    wht_amount numeric(14,2) NOT NULL,
    form_type text NOT NULL,
    tax_year integer NOT NULL,
    certificate_no text,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone,
    deleted_at timestamp with time zone,
    CONSTRAINT wht_credits_received_amounts_nonnegative_check CHECK (((gross_amount >= (0)::numeric) AND (wht_amount >= (0)::numeric))),
    CONSTRAINT wht_credits_received_wht_not_above_gross_check CHECK ((wht_amount <= gross_amount))
);


--
-- Name: wht_monthly_filings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wht_monthly_filings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    period_year integer NOT NULL,
    period_month integer NOT NULL,
    form_type public.wht_form_type NOT NULL,
    total_base_amount numeric(14,2),
    total_wht_amount numeric(14,2),
    status public.filing_status DEFAULT 'draft'::public.filing_status NOT NULL,
    filing_date date,
    deadline date,
    period_locked boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone,
    deleted_at timestamp with time zone,
    CONSTRAINT wht_monthly_filings_amounts_nonnegative_check CHECK ((((total_base_amount IS NULL) OR (total_base_amount >= (0)::numeric)) AND ((total_wht_amount IS NULL) OR (total_wht_amount >= (0)::numeric)))),
    CONSTRAINT wht_monthly_filings_period_month_check CHECK (((period_month >= 1) AND (period_month <= 12)))
);


--
-- Name: wht_rates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wht_rates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    payment_type text NOT NULL,
    entity_type public.entity_type NOT NULL,
    rd_payment_type_code text,
    standard_rate numeric(5,4) NOT NULL,
    ewht_rate numeric(5,4),
    ewht_valid_from date,
    ewht_valid_to date,
    effective_from date,
    effective_to date,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone,
    CONSTRAINT wht_rates_rate_range_check CHECK (((standard_rate >= (0)::numeric) AND (standard_rate <= (1)::numeric) AND ((ewht_rate IS NULL) OR ((ewht_rate >= (0)::numeric) AND (ewht_rate <= (1)::numeric)))))
);


--
-- Name: wht_sequence_counters; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wht_sequence_counters (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    form_type public.wht_form_type NOT NULL,
    year integer NOT NULL,
    next_sequence integer DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone
);


--
-- Name: audit_log_2026_06; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log ATTACH PARTITION public.audit_log_2026_06 FOR VALUES FROM ('2026-06-01 00:00:00+00') TO ('2026-07-01 00:00:00+00');


--
-- Name: audit_log_2026_07; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log ATTACH PARTITION public.audit_log_2026_07 FOR VALUES FROM ('2026-07-01 00:00:00+00') TO ('2026-08-01 00:00:00+00');


--
-- Name: audit_log_2026_08; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log ATTACH PARTITION public.audit_log_2026_08 FOR VALUES FROM ('2026-08-01 00:00:00+00') TO ('2026-09-01 00:00:00+00');


--
-- Name: audit_log_2026_09; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log ATTACH PARTITION public.audit_log_2026_09 FOR VALUES FROM ('2026-09-01 00:00:00+00') TO ('2026-10-01 00:00:00+00');


--
-- Name: audit_log_2026_10; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log ATTACH PARTITION public.audit_log_2026_10 FOR VALUES FROM ('2026-10-01 00:00:00+00') TO ('2026-11-01 00:00:00+00');


--
-- Name: audit_log_2026_11; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log ATTACH PARTITION public.audit_log_2026_11 FOR VALUES FROM ('2026-11-01 00:00:00+00') TO ('2026-12-01 00:00:00+00');


--
-- Name: audit_log_2026_12; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log ATTACH PARTITION public.audit_log_2026_12 FOR VALUES FROM ('2026-12-01 00:00:00+00') TO ('2027-01-01 00:00:00+00');


--
-- Name: audit_log_2027_01; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log ATTACH PARTITION public.audit_log_2027_01 FOR VALUES FROM ('2027-01-01 00:00:00+00') TO ('2027-02-01 00:00:00+00');


--
-- Name: audit_log_2027_02; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log ATTACH PARTITION public.audit_log_2027_02 FOR VALUES FROM ('2027-02-01 00:00:00+00') TO ('2027-03-01 00:00:00+00');


--
-- Name: audit_log_2027_03; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log ATTACH PARTITION public.audit_log_2027_03 FOR VALUES FROM ('2027-03-01 00:00:00+00') TO ('2027-04-01 00:00:00+00');


--
-- Name: audit_log_2027_04; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log ATTACH PARTITION public.audit_log_2027_04 FOR VALUES FROM ('2027-04-01 00:00:00+00') TO ('2027-05-01 00:00:00+00');


--
-- Name: audit_log_2027_05; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log ATTACH PARTITION public.audit_log_2027_05 FOR VALUES FROM ('2027-05-01 00:00:00+00') TO ('2027-06-01 00:00:00+00');


--
-- Name: audit_log_2027_06; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log ATTACH PARTITION public.audit_log_2027_06 FOR VALUES FROM ('2027-06-01 00:00:00+00') TO ('2027-07-01 00:00:00+00');


--
-- Name: audit_log_2027_07; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log ATTACH PARTITION public.audit_log_2027_07 FOR VALUES FROM ('2027-07-01 00:00:00+00') TO ('2027-08-01 00:00:00+00');


--
-- Name: audit_log_default; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log ATTACH PARTITION public.audit_log_default DEFAULT;


--
-- Name: ai_batch_runs ai_batch_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_batch_runs
    ADD CONSTRAINT ai_batch_runs_pkey PRIMARY KEY (id);


--
-- Name: ai_match_suggestions ai_match_suggestions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_match_suggestions
    ADD CONSTRAINT ai_match_suggestions_pkey PRIMARY KEY (id);


--
-- Name: ai_match_suggestions ai_suggestion_txn_doc; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_match_suggestions
    ADD CONSTRAINT ai_suggestion_txn_doc UNIQUE (transaction_id, document_id);


--
-- Name: allocation_rule_targets allocation_rule_targets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.allocation_rule_targets
    ADD CONSTRAINT allocation_rule_targets_pkey PRIMARY KEY (id);


--
-- Name: allocation_rules allocation_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.allocation_rules
    ADD CONSTRAINT allocation_rules_pkey PRIMARY KEY (id);


--
-- Name: audit_log audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_pkey PRIMARY KEY (id, created_at);


--
-- Name: audit_log_2026_06 audit_log_2026_06_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log_2026_06
    ADD CONSTRAINT audit_log_2026_06_pkey PRIMARY KEY (id, created_at);


--
-- Name: audit_log_2026_07 audit_log_2026_07_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log_2026_07
    ADD CONSTRAINT audit_log_2026_07_pkey PRIMARY KEY (id, created_at);


--
-- Name: audit_log_2026_08 audit_log_2026_08_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log_2026_08
    ADD CONSTRAINT audit_log_2026_08_pkey PRIMARY KEY (id, created_at);


--
-- Name: audit_log_2026_09 audit_log_2026_09_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log_2026_09
    ADD CONSTRAINT audit_log_2026_09_pkey PRIMARY KEY (id, created_at);


--
-- Name: audit_log_2026_10 audit_log_2026_10_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log_2026_10
    ADD CONSTRAINT audit_log_2026_10_pkey PRIMARY KEY (id, created_at);


--
-- Name: audit_log_2026_11 audit_log_2026_11_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log_2026_11
    ADD CONSTRAINT audit_log_2026_11_pkey PRIMARY KEY (id, created_at);


--
-- Name: audit_log_2026_12 audit_log_2026_12_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log_2026_12
    ADD CONSTRAINT audit_log_2026_12_pkey PRIMARY KEY (id, created_at);


--
-- Name: audit_log_2027_01 audit_log_2027_01_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log_2027_01
    ADD CONSTRAINT audit_log_2027_01_pkey PRIMARY KEY (id, created_at);


--
-- Name: audit_log_2027_02 audit_log_2027_02_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log_2027_02
    ADD CONSTRAINT audit_log_2027_02_pkey PRIMARY KEY (id, created_at);


--
-- Name: audit_log_2027_03 audit_log_2027_03_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log_2027_03
    ADD CONSTRAINT audit_log_2027_03_pkey PRIMARY KEY (id, created_at);


--
-- Name: audit_log_2027_04 audit_log_2027_04_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log_2027_04
    ADD CONSTRAINT audit_log_2027_04_pkey PRIMARY KEY (id, created_at);


--
-- Name: audit_log_2027_05 audit_log_2027_05_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log_2027_05
    ADD CONSTRAINT audit_log_2027_05_pkey PRIMARY KEY (id, created_at);


--
-- Name: audit_log_2027_06 audit_log_2027_06_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log_2027_06
    ADD CONSTRAINT audit_log_2027_06_pkey PRIMARY KEY (id, created_at);


--
-- Name: audit_log_2027_07 audit_log_2027_07_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log_2027_07
    ADD CONSTRAINT audit_log_2027_07_pkey PRIMARY KEY (id, created_at);


--
-- Name: audit_log_default audit_log_default_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log_default
    ADD CONSTRAINT audit_log_default_pkey PRIMARY KEY (id, created_at);


--
-- Name: audit_log_old audit_log_old_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log_old
    ADD CONSTRAINT audit_log_old_pkey PRIMARY KEY (id);


--
-- Name: bank_accounts bank_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_accounts
    ADD CONSTRAINT bank_accounts_pkey PRIMARY KEY (id);


--
-- Name: bank_statements bank_statements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_statements
    ADD CONSTRAINT bank_statements_pkey PRIMARY KEY (id);


--
-- Name: book_tax_adjustments book_tax_adjustments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.book_tax_adjustments
    ADD CONSTRAINT book_tax_adjustments_pkey PRIMARY KEY (id);


--
-- Name: cash_deposits cash_deposits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cash_deposits
    ADD CONSTRAINT cash_deposits_pkey PRIMARY KEY (id);


--
-- Name: cit_brackets cit_brackets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cit_brackets
    ADD CONSTRAINT cit_brackets_pkey PRIMARY KEY (id);


--
-- Name: cit_filings cit_filings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cit_filings
    ADD CONSTRAINT cit_filings_pkey PRIMARY KEY (id);


--
-- Name: close_checklist_items close_checklist_items_key_uniq; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.close_checklist_items
    ADD CONSTRAINT close_checklist_items_key_uniq UNIQUE (checklist_id, item_key);


--
-- Name: close_checklist_items close_checklist_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.close_checklist_items
    ADD CONSTRAINT close_checklist_items_pkey PRIMARY KEY (id);


--
-- Name: close_checklist_items close_checklist_items_sequence_uniq; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.close_checklist_items
    ADD CONSTRAINT close_checklist_items_sequence_uniq UNIQUE (checklist_id, sequence);


--
-- Name: close_checklists close_checklists_org_period_uniq; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.close_checklists
    ADD CONSTRAINT close_checklists_org_period_uniq UNIQUE (org_id, establishment_id, period_year, period_month);


--
-- Name: close_checklists close_checklists_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.close_checklists
    ADD CONSTRAINT close_checklists_pkey PRIMARY KEY (id);


--
-- Name: copilot_messages copilot_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.copilot_messages
    ADD CONSTRAINT copilot_messages_pkey PRIMARY KEY (id);


--
-- Name: copilot_sessions copilot_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.copilot_sessions
    ADD CONSTRAINT copilot_sessions_pkey PRIMARY KEY (id);


--
-- Name: copilot_tool_events copilot_tool_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.copilot_tool_events
    ADD CONSTRAINT copilot_tool_events_pkey PRIMARY KEY (id);


--
-- Name: cost_centers cost_centers_org_code_uniq; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cost_centers
    ADD CONSTRAINT cost_centers_org_code_uniq UNIQUE (org_id, code);


--
-- Name: cost_centers cost_centers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cost_centers
    ADD CONSTRAINT cost_centers_pkey PRIMARY KEY (id);


--
-- Name: depreciation_schedule depreciation_schedule_asset_period_uniq; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.depreciation_schedule
    ADD CONSTRAINT depreciation_schedule_asset_period_uniq UNIQUE (org_id, fixed_asset_id, period_year, period_month);


--
-- Name: depreciation_schedule depreciation_schedule_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.depreciation_schedule
    ADD CONSTRAINT depreciation_schedule_pkey PRIMARY KEY (id);


--
-- Name: document_files document_files_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_files
    ADD CONSTRAINT document_files_pkey PRIMARY KEY (id);


--
-- Name: document_line_items document_line_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_line_items
    ADD CONSTRAINT document_line_items_pkey PRIMARY KEY (id);


--
-- Name: documents documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_pkey PRIMARY KEY (id);


--
-- Name: documents documents_vat_period_matches_issue_date; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.documents
    ADD CONSTRAINT documents_vat_period_matches_issue_date CHECK (((issue_date IS NULL) OR (vat_period_year IS NULL) OR (vat_period_month IS NULL) OR (vat_period_override_reason IS NOT NULL) OR ((vat_period_year = (EXTRACT(year FROM issue_date))::integer) AND (vat_period_month = (EXTRACT(month FROM issue_date))::integer)))) NOT VALID;


--
-- Name: employee_allowances employee_allowances_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_allowances
    ADD CONSTRAINT employee_allowances_pkey PRIMARY KEY (id);


--
-- Name: employee_allowances employee_allowances_unique_effective; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_allowances
    ADD CONSTRAINT employee_allowances_unique_effective UNIQUE (org_id, employee_id, tax_year, effective_from_month);


--
-- Name: employees employees_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_pkey PRIMARY KEY (id);


--
-- Name: establishments establishments_org_branch_uniq; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.establishments
    ADD CONSTRAINT establishments_org_branch_uniq UNIQUE (org_id, branch_number);


--
-- Name: establishments establishments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.establishments
    ADD CONSTRAINT establishments_pkey PRIMARY KEY (id);


--
-- Name: exception_queue exception_queue_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exception_queue
    ADD CONSTRAINT exception_queue_pkey PRIMARY KEY (id);


--
-- Name: exemplar_consensus exemplar_consensus_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exemplar_consensus
    ADD CONSTRAINT exemplar_consensus_pkey PRIMARY KEY (id);


--
-- Name: extraction_compiled_patterns extraction_compiled_patterns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extraction_compiled_patterns
    ADD CONSTRAINT extraction_compiled_patterns_pkey PRIMARY KEY (id);


--
-- Name: extraction_correction_sessions extraction_correction_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extraction_correction_sessions
    ADD CONSTRAINT extraction_correction_sessions_pkey PRIMARY KEY (id);


--
-- Name: extraction_exemplars extraction_exemplars_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extraction_exemplars
    ADD CONSTRAINT extraction_exemplars_pkey PRIMARY KEY (id);


--
-- Name: extraction_learning_candidates extraction_learning_candidates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extraction_learning_candidates
    ADD CONSTRAINT extraction_learning_candidates_pkey PRIMARY KEY (id);


--
-- Name: extraction_log extraction_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extraction_log
    ADD CONSTRAINT extraction_log_pkey PRIMARY KEY (id);


--
-- Name: extraction_review_outcome extraction_review_outcome_extraction_log_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extraction_review_outcome
    ADD CONSTRAINT extraction_review_outcome_extraction_log_id_unique UNIQUE (extraction_log_id);


--
-- Name: extraction_review_outcome extraction_review_outcome_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extraction_review_outcome
    ADD CONSTRAINT extraction_review_outcome_pkey PRIMARY KEY (id);


--
-- Name: fixed_asset_depreciation_periods fixed_asset_depreciation_periods_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fixed_asset_depreciation_periods
    ADD CONSTRAINT fixed_asset_depreciation_periods_pkey PRIMARY KEY (id);


--
-- Name: fixed_assets fixed_assets_org_code_uniq; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fixed_assets
    ADD CONSTRAINT fixed_assets_org_code_uniq UNIQUE (org_id, asset_code);


--
-- Name: fixed_assets fixed_assets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fixed_assets
    ADD CONSTRAINT fixed_assets_pkey PRIMARY KEY (id);


--
-- Name: fx_rates_bot fx_rates_bot_date_currency_uniq; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fx_rates_bot
    ADD CONSTRAINT fx_rates_bot_date_currency_uniq UNIQUE (rate_date, currency);


--
-- Name: fx_rates_bot fx_rates_bot_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fx_rates_bot
    ADD CONSTRAINT fx_rates_bot_pkey PRIMARY KEY (id);


--
-- Name: fx_valuation_layers fx_valuation_layers_item_date_uniq; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fx_valuation_layers
    ADD CONSTRAINT fx_valuation_layers_item_date_uniq UNIQUE (org_id, monetary_item_type, monetary_item_id, valuation_date);


--
-- Name: fx_valuation_layers fx_valuation_layers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fx_valuation_layers
    ADD CONSTRAINT fx_valuation_layers_pkey PRIMARY KEY (id);


--
-- Name: gl_accounts gl_accounts_org_code_uniq; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gl_accounts
    ADD CONSTRAINT gl_accounts_org_code_uniq UNIQUE (org_id, account_code);


--
-- Name: gl_accounts gl_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gl_accounts
    ADD CONSTRAINT gl_accounts_pkey PRIMARY KEY (id);


--
-- Name: gl_opening_balances gl_opening_balances_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gl_opening_balances
    ADD CONSTRAINT gl_opening_balances_pkey PRIMARY KEY (id);


--
-- Name: global_exemplar_pool global_exemplar_pool_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.global_exemplar_pool
    ADD CONSTRAINT global_exemplar_pool_pkey PRIMARY KEY (id);


--
-- Name: import_charge_lines import_charge_lines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.import_charge_lines
    ADD CONSTRAINT import_charge_lines_pkey PRIMARY KEY (id);


--
-- Name: import_documents import_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.import_documents
    ADD CONSTRAINT import_documents_pkey PRIMARY KEY (id);


--
-- Name: import_documents import_documents_unique_doc; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.import_documents
    ADD CONSTRAINT import_documents_unique_doc UNIQUE (import_id, document_id);


--
-- Name: import_goods_lines import_goods_lines_lot_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.import_goods_lines
    ADD CONSTRAINT import_goods_lines_lot_unique UNIQUE (import_id, sku_code, lot_sequence);


--
-- Name: import_goods_lines import_goods_lines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.import_goods_lines
    ADD CONSTRAINT import_goods_lines_pkey PRIMARY KEY (id);


--
-- Name: import_payments import_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.import_payments
    ADD CONSTRAINT import_payments_pkey PRIMARY KEY (id);


--
-- Name: imports imports_org_reference_uniq; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.imports
    ADD CONSTRAINT imports_org_reference_uniq UNIQUE (org_id, import_reference);


--
-- Name: imports imports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.imports
    ADD CONSTRAINT imports_pkey PRIMARY KEY (id);


--
-- Name: inventory_count_items inventory_count_items_count_sku_uniq; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_count_items
    ADD CONSTRAINT inventory_count_items_count_sku_uniq UNIQUE (count_id, sku_id);


--
-- Name: inventory_count_items inventory_count_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_count_items
    ADD CONSTRAINT inventory_count_items_pkey PRIMARY KEY (id);


--
-- Name: inventory_counts inventory_counts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_counts
    ADD CONSTRAINT inventory_counts_pkey PRIMARY KEY (id);


--
-- Name: inventory_movements inventory_movements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_movements
    ADD CONSTRAINT inventory_movements_pkey PRIMARY KEY (id);


--
-- Name: inventory_statutory_overhead_components inventory_statutory_overhead_components_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_statutory_overhead_components
    ADD CONSTRAINT inventory_statutory_overhead_components_pkey PRIMARY KEY (id);


--
-- Name: journal_entries journal_entries_org_number_uniq; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.journal_entries
    ADD CONSTRAINT journal_entries_org_number_uniq UNIQUE (org_id, entry_number);


--
-- Name: journal_entries journal_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.journal_entries
    ADD CONSTRAINT journal_entries_pkey PRIMARY KEY (id);


--
-- Name: journal_lines journal_lines_entry_line_uniq; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.journal_lines
    ADD CONSTRAINT journal_lines_entry_line_uniq UNIQUE (journal_entry_id, line_number);


--
-- Name: journal_lines journal_lines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.journal_lines
    ADD CONSTRAINT journal_lines_pkey PRIMARY KEY (id);


--
-- Name: loss_carry_forward_layers loss_carry_forward_layers_org_year_uniq; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loss_carry_forward_layers
    ADD CONSTRAINT loss_carry_forward_layers_org_year_uniq UNIQUE (org_id, originated_tax_year);


--
-- Name: loss_carry_forward_layers loss_carry_forward_layers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loss_carry_forward_layers
    ADD CONSTRAINT loss_carry_forward_layers_pkey PRIMARY KEY (id);


--
-- Name: org_ai_settings org_ai_settings_org_id; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_ai_settings
    ADD CONSTRAINT org_ai_settings_org_id UNIQUE (org_id);


--
-- Name: org_ai_settings org_ai_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_ai_settings
    ADD CONSTRAINT org_ai_settings_pkey PRIMARY KEY (id);


--
-- Name: org_memberships org_membership_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_memberships
    ADD CONSTRAINT org_membership_unique UNIQUE (org_id, user_id);


--
-- Name: org_memberships org_memberships_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_memberships
    ADD CONSTRAINT org_memberships_pkey PRIMARY KEY (id);


--
-- Name: org_reputation org_reputation_org_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_reputation
    ADD CONSTRAINT org_reputation_org_id_unique UNIQUE (org_id);


--
-- Name: org_reputation org_reputation_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_reputation
    ADD CONSTRAINT org_reputation_pkey PRIMARY KEY (id);


--
-- Name: organizations organizations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT organizations_pkey PRIMARY KEY (id);


--
-- Name: pay_runs pay_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pay_runs
    ADD CONSTRAINT pay_runs_pkey PRIMARY KEY (id);


--
-- Name: pay_slips pay_slips_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pay_slips
    ADD CONSTRAINT pay_slips_pkey PRIMARY KEY (id);


--
-- Name: payments payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_pkey PRIMARY KEY (id);


--
-- Name: period_locks period_locks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.period_locks
    ADD CONSTRAINT period_locks_pkey PRIMARY KEY (id);


--
-- Name: pit_brackets pit_brackets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pit_brackets
    ADD CONSTRAINT pit_brackets_pkey PRIMARY KEY (id);


--
-- Name: pit_standard_deductions pit_standard_deductions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pit_standard_deductions
    ADD CONSTRAINT pit_standard_deductions_pkey PRIMARY KEY (id);


--
-- Name: pnd_filings pnd_filings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pnd_filings
    ADD CONSTRAINT pnd_filings_pkey PRIMARY KEY (id);


--
-- Name: posting_exceptions posting_exceptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.posting_exceptions
    ADD CONSTRAINT posting_exceptions_pkey PRIMARY KEY (id);


--
-- Name: posting_outbox posting_outbox_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.posting_outbox
    ADD CONSTRAINT posting_outbox_pkey PRIMARY KEY (id);


--
-- Name: pp36_obligations pp36_obligations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pp36_obligations
    ADD CONSTRAINT pp36_obligations_pkey PRIMARY KEY (id);


--
-- Name: processor_settlements processor_settlements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.processor_settlements
    ADD CONSTRAINT processor_settlements_pkey PRIMARY KEY (id);


--
-- Name: processor_settlements processor_settlements_source_external_uniq; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.processor_settlements
    ADD CONSTRAINT processor_settlements_source_external_uniq UNIQUE (org_id, processor, external_id);


--
-- Name: projects projects_org_code_uniq; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_org_code_uniq UNIQUE (org_id, code);


--
-- Name: projects projects_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_pkey PRIMARY KEY (id);


--
-- Name: reconciliation_matches reconciliation_matches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reconciliation_matches
    ADD CONSTRAINT reconciliation_matches_pkey PRIMARY KEY (id);


--
-- Name: reconciliation_rules reconciliation_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reconciliation_rules
    ADD CONSTRAINT reconciliation_rules_pkey PRIMARY KEY (id);


--
-- Name: recurring_payment_patterns recurring_payment_patterns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recurring_payment_patterns
    ADD CONSTRAINT recurring_payment_patterns_pkey PRIMARY KEY (id);


--
-- Name: sales_transactions sales_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_transactions
    ADD CONSTRAINT sales_transactions_pkey PRIMARY KEY (id);


--
-- Name: sales_transactions sales_transactions_source_external_uniq; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_transactions
    ADD CONSTRAINT sales_transactions_source_external_uniq UNIQUE (org_id, source, external_id);


--
-- Name: skus skus_org_code_uniq; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skus
    ADD CONSTRAINT skus_org_code_uniq UNIQUE (org_id, sku_code);


--
-- Name: skus skus_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skus
    ADD CONSTRAINT skus_pkey PRIMARY KEY (id);


--
-- Name: sso_config sso_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sso_config
    ADD CONSTRAINT sso_config_pkey PRIMARY KEY (id);


--
-- Name: sso_filings sso_filings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sso_filings
    ADD CONSTRAINT sso_filings_pkey PRIMARY KEY (id);


--
-- Name: tax_config tax_config_key_effective_from; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tax_config
    ADD CONSTRAINT tax_config_key_effective_from UNIQUE (key, effective_from);


--
-- Name: tax_config tax_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tax_config
    ADD CONSTRAINT tax_config_pkey PRIMARY KEY (id);


--
-- Name: tax_min_life_by_category tax_min_life_by_category_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tax_min_life_by_category
    ADD CONSTRAINT tax_min_life_by_category_pkey PRIMARY KEY (category);


--
-- Name: tax_payment_events tax_payment_events_idempotency; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tax_payment_events
    ADD CONSTRAINT tax_payment_events_idempotency UNIQUE (org_id, filing_id, idempotency_key);


--
-- Name: tax_payment_events tax_payment_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tax_payment_events
    ADD CONSTRAINT tax_payment_events_pkey PRIMARY KEY (id);


--
-- Name: tax_rule_versions tax_rule_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tax_rule_versions
    ADD CONSTRAINT tax_rule_versions_pkey PRIMARY KEY (id);


--
-- Name: tax_treatment_decisions tax_treatment_decisions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tax_treatment_decisions
    ADD CONSTRAINT tax_treatment_decisions_pkey PRIMARY KEY (id);


--
-- Name: thai_business_calendar thai_business_calendar_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.thai_business_calendar
    ADD CONSTRAINT thai_business_calendar_pkey PRIMARY KEY (date);


--
-- Name: transactions transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_pkey PRIMARY KEY (id);


--
-- Name: transfer_pricing_disclosures transfer_pricing_disclosures_org_year_uniq; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transfer_pricing_disclosures
    ADD CONSTRAINT transfer_pricing_disclosures_org_year_uniq UNIQUE (org_id, tax_year);


--
-- Name: transfer_pricing_disclosures transfer_pricing_disclosures_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transfer_pricing_disclosures
    ADD CONSTRAINT transfer_pricing_disclosures_pkey PRIMARY KEY (id);


--
-- Name: user_nav_pins user_nav_pins_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_nav_pins
    ADD CONSTRAINT user_nav_pins_pkey PRIMARY KEY (id);


--
-- Name: users users_clerk_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_clerk_id_unique UNIQUE (clerk_id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: vat_credit_carryforwards vat_credit_carryforwards_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vat_credit_carryforwards
    ADD CONSTRAINT vat_credit_carryforwards_pkey PRIMARY KEY (id);


--
-- Name: vat_filing_lines vat_filing_lines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vat_filing_lines
    ADD CONSTRAINT vat_filing_lines_pkey PRIMARY KEY (id);


--
-- Name: vat_filings vat_filings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vat_filings
    ADD CONSTRAINT vat_filings_pkey PRIMARY KEY (id);


--
-- Name: vat_input_items vat_input_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vat_input_items
    ADD CONSTRAINT vat_input_items_pkey PRIMARY KEY (id);


--
-- Name: vat_output_items vat_output_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vat_output_items
    ADD CONSTRAINT vat_output_items_pkey PRIMARY KEY (id);


--
-- Name: vendor_bank_aliases vendor_alias_org_text; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendor_bank_aliases
    ADD CONSTRAINT vendor_alias_org_text UNIQUE (org_id, alias_text, alias_type);


--
-- Name: vendor_bank_aliases vendor_bank_aliases_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendor_bank_aliases
    ADD CONSTRAINT vendor_bank_aliases_pkey PRIMARY KEY (id);


--
-- Name: vendor_tier vendor_tier_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendor_tier
    ADD CONSTRAINT vendor_tier_pkey PRIMARY KEY (id);


--
-- Name: vendors vendors_org_tax_branch; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendors
    ADD CONSTRAINT vendors_org_tax_branch UNIQUE (org_id, tax_id, branch_number);


--
-- Name: vendors vendors_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendors
    ADD CONSTRAINT vendors_pkey PRIMARY KEY (id);


--
-- Name: voucher_sales voucher_sales_org_code_uniq; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.voucher_sales
    ADD CONSTRAINT voucher_sales_org_code_uniq UNIQUE (org_id, voucher_code);


--
-- Name: voucher_sales voucher_sales_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.voucher_sales
    ADD CONSTRAINT voucher_sales_pkey PRIMARY KEY (id);


--
-- Name: wht_annual_threshold_decisions wht_annual_threshold_decisions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wht_annual_threshold_decisions
    ADD CONSTRAINT wht_annual_threshold_decisions_pkey PRIMARY KEY (id);


--
-- Name: wht_certificates wht_cert_org_no; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wht_certificates
    ADD CONSTRAINT wht_cert_org_no UNIQUE (org_id, certificate_no);


--
-- Name: wht_certificate_items wht_certificate_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wht_certificate_items
    ADD CONSTRAINT wht_certificate_items_pkey PRIMARY KEY (id);


--
-- Name: wht_certificates wht_certificates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wht_certificates
    ADD CONSTRAINT wht_certificates_pkey PRIMARY KEY (id);


--
-- Name: wht_credits_received wht_credits_received_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wht_credits_received
    ADD CONSTRAINT wht_credits_received_pkey PRIMARY KEY (id);


--
-- Name: wht_monthly_filings wht_filing_org_period; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wht_monthly_filings
    ADD CONSTRAINT wht_filing_org_period UNIQUE (org_id, period_year, period_month, form_type);


--
-- Name: wht_monthly_filings wht_monthly_filings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wht_monthly_filings
    ADD CONSTRAINT wht_monthly_filings_pkey PRIMARY KEY (id);


--
-- Name: wht_rates wht_rates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wht_rates
    ADD CONSTRAINT wht_rates_pkey PRIMARY KEY (id);


--
-- Name: wht_sequence_counters wht_seq_org_form_year; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wht_sequence_counters
    ADD CONSTRAINT wht_seq_org_form_year UNIQUE (org_id, form_type, year);


--
-- Name: wht_sequence_counters wht_sequence_counters_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wht_sequence_counters
    ADD CONSTRAINT wht_sequence_counters_pkey PRIMARY KEY (id);


--
-- Name: wht_annual_threshold_decisions wht_threshold_line_payment_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wht_annual_threshold_decisions
    ADD CONSTRAINT wht_threshold_line_payment_unique UNIQUE (org_id, line_item_id, payment_id);


--
-- Name: ai_batch_runs_org_trigger; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ai_batch_runs_org_trigger ON public.ai_batch_runs USING btree (org_id, trigger_type, triggered_at);


--
-- Name: ai_suggestions_org_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ai_suggestions_org_status ON public.ai_match_suggestions USING btree (org_id, status);


--
-- Name: allocation_rule_targets_rule_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX allocation_rule_targets_rule_idx ON public.allocation_rule_targets USING btree (allocation_rule_id);


--
-- Name: allocation_rules_id_org_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX allocation_rules_id_org_uniq ON public.allocation_rules USING btree (id, org_id);


--
-- Name: allocation_rules_org_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX allocation_rules_org_active_idx ON public.allocation_rules USING btree (org_id, is_active);


--
-- Name: allocation_rules_org_source_key_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX allocation_rules_org_source_key_idx ON public.allocation_rules USING btree (org_id, source_type, source_key) WHERE (deleted_at IS NULL);


--
-- Name: audit_log_org_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_org_created ON ONLY public.audit_log USING btree (org_id, created_at DESC);


--
-- Name: audit_log_2026_06_org_id_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_2026_06_org_id_created_at_idx ON public.audit_log_2026_06 USING btree (org_id, created_at DESC);


--
-- Name: audit_log_entity_history; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_entity_history ON ONLY public.audit_log USING btree (org_id, entity_type, entity_id, created_at DESC);


--
-- Name: audit_log_2026_06_org_id_entity_type_entity_id_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_2026_06_org_id_entity_type_entity_id_created_at_idx ON public.audit_log_2026_06 USING btree (org_id, entity_type, entity_id, created_at DESC);


--
-- Name: audit_log_2026_07_org_id_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_2026_07_org_id_created_at_idx ON public.audit_log_2026_07 USING btree (org_id, created_at DESC);


--
-- Name: audit_log_2026_07_org_id_entity_type_entity_id_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_2026_07_org_id_entity_type_entity_id_created_at_idx ON public.audit_log_2026_07 USING btree (org_id, entity_type, entity_id, created_at DESC);


--
-- Name: audit_log_2026_08_org_id_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_2026_08_org_id_created_at_idx ON public.audit_log_2026_08 USING btree (org_id, created_at DESC);


--
-- Name: audit_log_2026_08_org_id_entity_type_entity_id_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_2026_08_org_id_entity_type_entity_id_created_at_idx ON public.audit_log_2026_08 USING btree (org_id, entity_type, entity_id, created_at DESC);


--
-- Name: audit_log_2026_09_org_id_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_2026_09_org_id_created_at_idx ON public.audit_log_2026_09 USING btree (org_id, created_at DESC);


--
-- Name: audit_log_2026_09_org_id_entity_type_entity_id_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_2026_09_org_id_entity_type_entity_id_created_at_idx ON public.audit_log_2026_09 USING btree (org_id, entity_type, entity_id, created_at DESC);


--
-- Name: audit_log_2026_10_org_id_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_2026_10_org_id_created_at_idx ON public.audit_log_2026_10 USING btree (org_id, created_at DESC);


--
-- Name: audit_log_2026_10_org_id_entity_type_entity_id_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_2026_10_org_id_entity_type_entity_id_created_at_idx ON public.audit_log_2026_10 USING btree (org_id, entity_type, entity_id, created_at DESC);


--
-- Name: audit_log_2026_11_org_id_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_2026_11_org_id_created_at_idx ON public.audit_log_2026_11 USING btree (org_id, created_at DESC);


--
-- Name: audit_log_2026_11_org_id_entity_type_entity_id_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_2026_11_org_id_entity_type_entity_id_created_at_idx ON public.audit_log_2026_11 USING btree (org_id, entity_type, entity_id, created_at DESC);


--
-- Name: audit_log_2026_12_org_id_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_2026_12_org_id_created_at_idx ON public.audit_log_2026_12 USING btree (org_id, created_at DESC);


--
-- Name: audit_log_2026_12_org_id_entity_type_entity_id_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_2026_12_org_id_entity_type_entity_id_created_at_idx ON public.audit_log_2026_12 USING btree (org_id, entity_type, entity_id, created_at DESC);


--
-- Name: audit_log_2027_01_org_id_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_2027_01_org_id_created_at_idx ON public.audit_log_2027_01 USING btree (org_id, created_at DESC);


--
-- Name: audit_log_2027_01_org_id_entity_type_entity_id_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_2027_01_org_id_entity_type_entity_id_created_at_idx ON public.audit_log_2027_01 USING btree (org_id, entity_type, entity_id, created_at DESC);


--
-- Name: audit_log_2027_02_org_id_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_2027_02_org_id_created_at_idx ON public.audit_log_2027_02 USING btree (org_id, created_at DESC);


--
-- Name: audit_log_2027_02_org_id_entity_type_entity_id_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_2027_02_org_id_entity_type_entity_id_created_at_idx ON public.audit_log_2027_02 USING btree (org_id, entity_type, entity_id, created_at DESC);


--
-- Name: audit_log_2027_03_org_id_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_2027_03_org_id_created_at_idx ON public.audit_log_2027_03 USING btree (org_id, created_at DESC);


--
-- Name: audit_log_2027_03_org_id_entity_type_entity_id_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_2027_03_org_id_entity_type_entity_id_created_at_idx ON public.audit_log_2027_03 USING btree (org_id, entity_type, entity_id, created_at DESC);


--
-- Name: audit_log_2027_04_org_id_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_2027_04_org_id_created_at_idx ON public.audit_log_2027_04 USING btree (org_id, created_at DESC);


--
-- Name: audit_log_2027_04_org_id_entity_type_entity_id_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_2027_04_org_id_entity_type_entity_id_created_at_idx ON public.audit_log_2027_04 USING btree (org_id, entity_type, entity_id, created_at DESC);


--
-- Name: audit_log_2027_05_org_id_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_2027_05_org_id_created_at_idx ON public.audit_log_2027_05 USING btree (org_id, created_at DESC);


--
-- Name: audit_log_2027_05_org_id_entity_type_entity_id_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_2027_05_org_id_entity_type_entity_id_created_at_idx ON public.audit_log_2027_05 USING btree (org_id, entity_type, entity_id, created_at DESC);


--
-- Name: audit_log_2027_06_org_id_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_2027_06_org_id_created_at_idx ON public.audit_log_2027_06 USING btree (org_id, created_at DESC);


--
-- Name: audit_log_2027_06_org_id_entity_type_entity_id_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_2027_06_org_id_entity_type_entity_id_created_at_idx ON public.audit_log_2027_06 USING btree (org_id, entity_type, entity_id, created_at DESC);


--
-- Name: audit_log_2027_07_org_id_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_2027_07_org_id_created_at_idx ON public.audit_log_2027_07 USING btree (org_id, created_at DESC);


--
-- Name: audit_log_2027_07_org_id_entity_type_entity_id_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_2027_07_org_id_entity_type_entity_id_created_at_idx ON public.audit_log_2027_07 USING btree (org_id, entity_type, entity_id, created_at DESC);


--
-- Name: audit_log_default_org_id_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_default_org_id_created_at_idx ON public.audit_log_default USING btree (org_id, created_at DESC);


--
-- Name: audit_log_default_org_id_entity_type_entity_id_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_default_org_id_entity_type_entity_id_created_at_idx ON public.audit_log_default USING btree (org_id, entity_type, entity_id, created_at DESC);


--
-- Name: bank_accounts_id_org_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX bank_accounts_id_org_uniq ON public.bank_accounts USING btree (id, org_id);


--
-- Name: bank_statements_id_org_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX bank_statements_id_org_uniq ON public.bank_statements USING btree (id, org_id);


--
-- Name: book_tax_adjustments_org_year_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX book_tax_adjustments_org_year_idx ON public.book_tax_adjustments USING btree (org_id, tax_year);


--
-- Name: cash_deposits_org_establishment_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cash_deposits_org_establishment_date_idx ON public.cash_deposits USING btree (org_id, establishment_id, deposited_at);


--
-- Name: cit_brackets_lookup_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cit_brackets_lookup_idx ON public.cit_brackets USING btree (entity_type, effective_from);


--
-- Name: cit_filings_amendment_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX cit_filings_amendment_uniq ON public.cit_filings USING btree (org_id, tax_year, filing_type, amends_filing_id) WHERE ((is_amendment = true) AND (amends_filing_id IS NOT NULL));


--
-- Name: cit_filings_non_amendment_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX cit_filings_non_amendment_uniq ON public.cit_filings USING btree (org_id, tax_year, filing_type) WHERE ((is_amendment = false) AND (amends_filing_id IS NULL));


--
-- Name: cit_filings_org_year_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cit_filings_org_year_idx ON public.cit_filings USING btree (org_id, tax_year);


--
-- Name: close_checklist_items_org_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX close_checklist_items_org_status_idx ON public.close_checklist_items USING btree (org_id, status);


--
-- Name: close_checklists_org_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX close_checklists_org_status_idx ON public.close_checklists USING btree (org_id, status);


--
-- Name: copilot_messages_org_session_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX copilot_messages_org_session_idx ON public.copilot_messages USING btree (org_id, session_id);


--
-- Name: copilot_sessions_org_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX copilot_sessions_org_user_idx ON public.copilot_sessions USING btree (org_id, user_id);


--
-- Name: copilot_tool_events_org_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX copilot_tool_events_org_created_idx ON public.copilot_tool_events USING btree (org_id, created_at);


--
-- Name: copilot_tool_events_org_tool_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX copilot_tool_events_org_tool_idx ON public.copilot_tool_events USING btree (org_id, tool_name);


--
-- Name: cost_centers_id_org_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX cost_centers_id_org_uniq ON public.cost_centers USING btree (id, org_id);


--
-- Name: depreciation_schedule_org_period_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX depreciation_schedule_org_period_idx ON public.depreciation_schedule USING btree (org_id, period_year, period_month);


--
-- Name: doc_files_document; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX doc_files_document ON public.document_files USING btree (document_id);


--
-- Name: doc_files_org_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX doc_files_org_created ON public.document_files USING btree (org_id, created_at);


--
-- Name: doc_org_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX doc_org_status ON public.documents USING btree (org_id, status);


--
-- Name: doc_org_vat_branch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX doc_org_vat_branch ON public.documents USING btree (org_id, vat_establishment_id, vat_treatment);


--
-- Name: doc_org_vendor_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX doc_org_vendor_date ON public.documents USING btree (org_id, vendor_id, issue_date);


--
-- Name: document_line_items_id_org_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX document_line_items_id_org_uniq ON public.document_line_items USING btree (id, org_id);


--
-- Name: documents_id_org_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX documents_id_org_uniq ON public.documents USING btree (id, org_id);


--
-- Name: employee_allowances_org_employee_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX employee_allowances_org_employee_idx ON public.employee_allowances USING btree (org_id, employee_id);


--
-- Name: employees_org_establishment_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX employees_org_establishment_idx ON public.employees USING btree (org_id, establishment_id);


--
-- Name: establishments_id_org_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX establishments_id_org_uniq ON public.establishments USING btree (id, org_id);


--
-- Name: establishments_org_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX establishments_org_idx ON public.establishments USING btree (org_id);


--
-- Name: exception_queue_open_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX exception_queue_open_unique ON public.exception_queue USING btree (org_id, entity_type, entity_id, exception_type) WHERE (resolved_at IS NULL);


--
-- Name: exception_queue_org_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX exception_queue_org_created ON public.exception_queue USING btree (org_id, created_at);


--
-- Name: exception_queue_org_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX exception_queue_org_type ON public.exception_queue USING btree (org_id, exception_type);


--
-- Name: fixed_asset_depreciation_periods_org_period_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX fixed_asset_depreciation_periods_org_period_idx ON public.fixed_asset_depreciation_periods USING btree (org_id, period_year, period_month);


--
-- Name: fixed_assets_id_org_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX fixed_assets_id_org_uniq ON public.fixed_assets USING btree (id, org_id);


--
-- Name: fixed_assets_org_acquisition_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX fixed_assets_org_acquisition_idx ON public.fixed_assets USING btree (org_id, acquisition_date);


--
-- Name: fixed_assets_org_category_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX fixed_assets_org_category_idx ON public.fixed_assets USING btree (org_id, category);


--
-- Name: fx_valuation_layers_org_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX fx_valuation_layers_org_date_idx ON public.fx_valuation_layers USING btree (org_id, valuation_date);


--
-- Name: gl_accounts_id_org_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX gl_accounts_id_org_uniq ON public.gl_accounts USING btree (id, org_id);


--
-- Name: gl_accounts_org_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX gl_accounts_org_type_idx ON public.gl_accounts USING btree (org_id, account_type);


--
-- Name: gl_opening_balances_org_account_date_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX gl_opening_balances_org_account_date_uniq ON public.gl_opening_balances USING btree (org_id, COALESCE((establishment_id)::text, 'org'::text), as_of_date, account_id);


--
-- Name: idx_compiled_pattern_active; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_compiled_pattern_active ON public.extraction_compiled_patterns USING btree (vendor_key, scope_kind, COALESCE((org_id)::text, 'global'::text)) WHERE (status = 'active'::public.compiled_pattern_status);


--
-- Name: idx_compiled_pattern_version; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_compiled_pattern_version ON public.extraction_compiled_patterns USING btree (vendor_key, scope_kind, COALESCE((org_id)::text, 'global'::text), version);


--
-- Name: idx_consensus_promotion_lookup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_consensus_promotion_lookup ON public.exemplar_consensus USING btree (status, vendor_key, field_name);


--
-- Name: idx_consensus_unique_value; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_consensus_unique_value ON public.exemplar_consensus USING btree (vendor_key, field_name, normalized_value_hash);


--
-- Name: idx_correction_sessions_active_log; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_correction_sessions_active_log ON public.extraction_correction_sessions USING btree (extraction_log_id) WHERE (deleted_at IS NULL);


--
-- Name: idx_correction_sessions_org_document; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_correction_sessions_org_document ON public.extraction_correction_sessions USING btree (org_id, document_id, created_at) WHERE (deleted_at IS NULL);


--
-- Name: idx_correction_sessions_org_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_correction_sessions_org_status ON public.extraction_correction_sessions USING btree (org_id, status, created_at) WHERE (deleted_at IS NULL);


--
-- Name: idx_exemplars_by_vendor_tax_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_exemplars_by_vendor_tax_id ON public.extraction_exemplars USING btree (vendor_tax_id, field_name) WHERE ((was_corrected = true) AND (deleted_at IS NULL) AND (vendor_tax_id IS NOT NULL));


--
-- Name: idx_exemplars_top_recent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_exemplars_top_recent ON public.extraction_exemplars USING btree (org_id, vendor_id, field_name, created_at) WHERE (deleted_at IS NULL);


--
-- Name: idx_exemplars_unique_active; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_exemplars_unique_active ON public.extraction_exemplars USING btree (org_id, vendor_id, field_name, document_id) WHERE (deleted_at IS NULL);


--
-- Name: idx_extraction_log_document; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_extraction_log_document ON public.extraction_log USING btree (document_id, created_at);


--
-- Name: idx_extraction_log_idempotency; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_extraction_log_idempotency ON public.extraction_log USING btree (inngest_idempotency_key);


--
-- Name: idx_extraction_log_vendor; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_extraction_log_vendor ON public.extraction_log USING btree (vendor_id, created_at);


--
-- Name: idx_global_pool_active_field; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_global_pool_active_field ON public.global_exemplar_pool USING btree (vendor_key, field_name) WHERE (retired_at IS NULL);


--
-- Name: idx_global_pool_vendor_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_global_pool_vendor_active ON public.global_exemplar_pool USING btree (vendor_key) WHERE (retired_at IS NULL);


--
-- Name: idx_learning_candidates_org_vendor_field; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_learning_candidates_org_vendor_field ON public.extraction_learning_candidates USING btree (org_id, vendor_id, document_family, field_name, status) WHERE (deleted_at IS NULL);


--
-- Name: idx_learning_candidates_session; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_learning_candidates_session ON public.extraction_learning_candidates USING btree (correction_session_id) WHERE (deleted_at IS NULL);


--
-- Name: idx_learning_candidates_unique_active; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_learning_candidates_unique_active ON public.extraction_learning_candidates USING btree (correction_session_id, field_name, candidate_type) WHERE (deleted_at IS NULL);


--
-- Name: idx_vendor_tier_unique_global; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_vendor_tier_unique_global ON public.vendor_tier USING btree (vendor_id) WHERE (scope_kind = 'global'::public.vendor_tier_scope_kind);


--
-- Name: idx_vendor_tier_unique_org; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_vendor_tier_unique_org ON public.vendor_tier USING btree (vendor_id, org_id) WHERE (scope_kind = 'org'::public.vendor_tier_scope_kind);


--
-- Name: import_charge_lines_import_doc_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX import_charge_lines_import_doc_idx ON public.import_charge_lines USING btree (import_id, source_document_id);


--
-- Name: import_charge_lines_import_vat_per_doc_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX import_charge_lines_import_vat_per_doc_uniq ON public.import_charge_lines USING btree (import_id, source_document_id) WHERE (vat_treatment = 'is_import_vat'::text);


--
-- Name: import_charge_lines_treatment_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX import_charge_lines_treatment_idx ON public.import_charge_lines USING btree (import_id, vat_treatment);


--
-- Name: import_documents_org_import_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX import_documents_org_import_idx ON public.import_documents USING btree (org_id, import_id);


--
-- Name: import_goods_lines_org_import_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX import_goods_lines_org_import_idx ON public.import_goods_lines USING btree (org_id, import_id);


--
-- Name: import_payments_org_bank_transaction_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX import_payments_org_bank_transaction_uniq ON public.import_payments USING btree (org_id, bank_transaction_id);


--
-- Name: import_payments_role_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX import_payments_role_idx ON public.import_payments USING btree (import_id, payment_role);


--
-- Name: imports_id_org_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX imports_id_org_uniq ON public.imports USING btree (id, org_id);


--
-- Name: imports_org_clearance_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX imports_org_clearance_idx ON public.imports USING btree (org_id, customs_clearance_date);


--
-- Name: inventory_count_items_org_count_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX inventory_count_items_org_count_idx ON public.inventory_count_items USING btree (org_id, count_id);


--
-- Name: inventory_counts_org_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX inventory_counts_org_date_idx ON public.inventory_counts USING btree (org_id, count_date);


--
-- Name: inventory_movements_document_purchase_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX inventory_movements_document_purchase_uniq ON public.inventory_movements USING btree (org_id, source_entity_type, source_entity_id, sku_id, movement_type) WHERE ((deleted_at IS NULL) AND (source_entity_type = 'documents'::text) AND (movement_type = 'purchase_in'::text));


--
-- Name: inventory_movements_sku_history_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX inventory_movements_sku_history_idx ON public.inventory_movements USING btree (org_id, sku_id, movement_at);


--
-- Name: inventory_movements_source_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX inventory_movements_source_idx ON public.inventory_movements USING btree (org_id, source_entity_type, source_entity_id);


--
-- Name: inventory_overhead_components_import_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX inventory_overhead_components_import_idx ON public.inventory_statutory_overhead_components USING btree (org_id, import_id);


--
-- Name: inventory_overhead_components_sku_year_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX inventory_overhead_components_sku_year_idx ON public.inventory_statutory_overhead_components USING btree (org_id, sku_id, fiscal_year);


--
-- Name: journal_entries_auto_source_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX journal_entries_auto_source_uniq ON public.journal_entries USING btree (org_id, source_entity_type, source_entity_id, posting_kind) WHERE ((source_entity_type IS NOT NULL) AND (source_entity_id IS NOT NULL) AND (posting_kind IS NOT NULL) AND (reversed_by_entry_id IS NULL));


--
-- Name: journal_entries_id_org_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX journal_entries_id_org_uniq ON public.journal_entries USING btree (id, org_id);


--
-- Name: journal_entries_period_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX journal_entries_period_idx ON public.journal_entries USING btree (org_id, period_year, period_month);


--
-- Name: journal_entries_source_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX journal_entries_source_idx ON public.journal_entries USING btree (org_id, source_entity_type, source_entity_id);


--
-- Name: journal_lines_account_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX journal_lines_account_idx ON public.journal_lines USING btree (org_id, account_id, journal_entry_id);


--
-- Name: journal_lines_subledger_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX journal_lines_subledger_idx ON public.journal_lines USING btree (org_id, subledger_entity_type, subledger_entity_id);


--
-- Name: loss_carry_forward_layers_org_expiry_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX loss_carry_forward_layers_org_expiry_idx ON public.loss_carry_forward_layers USING btree (org_id, expiry_tax_year);


--
-- Name: pay_runs_org_period_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pay_runs_org_period_idx ON public.pay_runs USING btree (org_id, period_start, period_end);


--
-- Name: pay_slips_org_employee_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pay_slips_org_employee_idx ON public.pay_slips USING btree (org_id, employee_id);


--
-- Name: pay_slips_org_run_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pay_slips_org_run_idx ON public.pay_slips USING btree (org_id, pay_run_id);


--
-- Name: payments_id_org_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX payments_id_org_uniq ON public.payments USING btree (id, org_id);


--
-- Name: period_locks_active_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX period_locks_active_uniq ON public.period_locks USING btree (org_id, COALESCE(establishment_id, '00000000-0000-0000-0000-000000000000'::uuid), domain, period_year, COALESCE(period_month, 0)) WHERE (unlocked_at IS NULL);


--
-- Name: period_locks_lookup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX period_locks_lookup ON public.period_locks USING btree (org_id, domain, period_year, period_month) WHERE (unlocked_at IS NULL);


--
-- Name: pnd_filings_org_form_period_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pnd_filings_org_form_period_idx ON public.pnd_filings USING btree (org_id, form_type, tax_period);


--
-- Name: posting_exceptions_open_outbox_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX posting_exceptions_open_outbox_uniq ON public.posting_exceptions USING btree (org_id, posting_outbox_id) WHERE (resolved_at IS NULL);


--
-- Name: posting_outbox_pending_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX posting_outbox_pending_idx ON public.posting_outbox USING btree (org_id, posting_status, created_at) WHERE (posting_status = ANY (ARRAY['pending'::text, 'failed'::text, 'retrying'::text]));


--
-- Name: posting_outbox_posting_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX posting_outbox_posting_date_idx ON public.posting_outbox USING btree (org_id, posting_status, posting_date);


--
-- Name: posting_outbox_source_event_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX posting_outbox_source_event_uniq ON public.posting_outbox USING btree (org_id, source_entity_type, source_entity_id, event_type);


--
-- Name: pp36_obligations_id_org_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX pp36_obligations_id_org_uniq ON public.pp36_obligations USING btree (id, org_id);


--
-- Name: pp36_obligations_org_period; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pp36_obligations_org_period ON public.pp36_obligations USING btree (org_id, pp36_period_year, pp36_period_month, status) WHERE (deleted_at IS NULL);


--
-- Name: pp36_obligations_reclaim_period; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pp36_obligations_reclaim_period ON public.pp36_obligations USING btree (org_id, pp30_reclaim_eligible_period_year, pp30_reclaim_eligible_period_month, status) WHERE (deleted_at IS NULL);


--
-- Name: pp36_obligations_source_active; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX pp36_obligations_source_active ON public.pp36_obligations USING btree (org_id, source_payment_transaction_id) WHERE ((deleted_at IS NULL) AND (source_payment_transaction_id IS NOT NULL));


--
-- Name: pp36_obligations_source_document_active; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX pp36_obligations_source_document_active ON public.pp36_obligations USING btree (org_id, source_document_id) WHERE ((deleted_at IS NULL) AND (source_document_id IS NOT NULL) AND (source_document_line_id IS NULL));


--
-- Name: pp36_obligations_source_line_active; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX pp36_obligations_source_line_active ON public.pp36_obligations USING btree (org_id, source_document_line_id) WHERE ((deleted_at IS NULL) AND (source_document_line_id IS NOT NULL));


--
-- Name: processor_settlements_org_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX processor_settlements_org_status_idx ON public.processor_settlements USING btree (org_id, reconciliation_status);


--
-- Name: projects_id_org_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX projects_id_org_uniq ON public.projects USING btree (id, org_id);


--
-- Name: projects_org_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX projects_org_status_idx ON public.projects USING btree (org_id, status);


--
-- Name: recon_matches_document; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX recon_matches_document ON public.reconciliation_matches USING btree (document_id);


--
-- Name: recon_matches_layer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX recon_matches_layer ON public.reconciliation_matches USING btree (((match_metadata ->> 'layer'::text))) WHERE (deleted_at IS NULL);


--
-- Name: recon_rules_org_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX recon_rules_org_active ON public.reconciliation_rules USING btree (org_id, priority);


--
-- Name: recon_txn_doc; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX recon_txn_doc ON public.reconciliation_matches USING btree (transaction_id, document_id) WHERE (deleted_at IS NULL);


--
-- Name: sales_transactions_clearing_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sales_transactions_clearing_idx ON public.sales_transactions USING btree (org_id, clearing_account_key, settlement_status);


--
-- Name: sales_transactions_event_role_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sales_transactions_event_role_idx ON public.sales_transactions USING btree (org_id, event_role, sold_at);


--
-- Name: sales_transactions_id_org_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX sales_transactions_id_org_uniq ON public.sales_transactions USING btree (id, org_id);


--
-- Name: sales_transactions_sold_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sales_transactions_sold_at_idx ON public.sales_transactions USING btree (org_id, establishment_id, sold_at);


--
-- Name: sales_transactions_tax_invoice_active_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX sales_transactions_tax_invoice_active_uniq ON public.sales_transactions USING btree (org_id, establishment_id, terminal_id, tax_invoice_number) WHERE ((tax_invoice_number IS NOT NULL) AND (superseded_by_id IS NULL));


--
-- Name: skus_org_establishment_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX skus_org_establishment_idx ON public.skus USING btree (org_id, establishment_id);


--
-- Name: sso_filings_org_month_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sso_filings_org_month_idx ON public.sso_filings USING btree (org_id, tax_month);


--
-- Name: stmt_org_account; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX stmt_org_account ON public.bank_statements USING btree (org_id, bank_account_id);


--
-- Name: stmt_org_account_period_active; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX stmt_org_account_period_active ON public.bank_statements USING btree (org_id, bank_account_id, period_start, period_end) WHERE (deleted_at IS NULL);


--
-- Name: tax_payment_events_filing; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tax_payment_events_filing ON public.tax_payment_events USING btree (org_id, filing_id);


--
-- Name: tax_payment_events_id_org_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX tax_payment_events_id_org_uniq ON public.tax_payment_events USING btree (id, org_id);


--
-- Name: tax_rule_versions_lookup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tax_rule_versions_lookup ON public.tax_rule_versions USING btree (org_id, rule_scope, effective_from) WHERE (deleted_at IS NULL);


--
-- Name: tax_rule_versions_unique_active; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX tax_rule_versions_unique_active ON public.tax_rule_versions USING btree (COALESCE(org_id, '00000000-0000-0000-0000-000000000000'::uuid), rule_scope, version) WHERE (deleted_at IS NULL);


--
-- Name: tax_treatment_document; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tax_treatment_document ON public.tax_treatment_decisions USING btree (org_id, source_document_id) WHERE (deleted_at IS NULL);


--
-- Name: tax_treatment_line_active; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX tax_treatment_line_active ON public.tax_treatment_decisions USING btree (org_id, source_document_line_id) WHERE ((deleted_at IS NULL) AND (source_document_line_id IS NOT NULL));


--
-- Name: tax_treatment_org_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tax_treatment_org_status ON public.tax_treatment_decisions USING btree (org_id, review_status, created_at) WHERE (deleted_at IS NULL);


--
-- Name: thai_business_calendar_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX thai_business_calendar_date ON public.thai_business_calendar USING btree (date);


--
-- Name: transactions_id_org_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX transactions_id_org_uniq ON public.transactions USING btree (id, org_id);


--
-- Name: transfer_pricing_disclosures_org_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX transfer_pricing_disclosures_org_status_idx ON public.transfer_pricing_disclosures USING btree (org_id, status);


--
-- Name: txn_dedup; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX txn_dedup ON public.transactions USING btree (org_id, bank_account_id, external_ref, date, amount) WHERE (deleted_at IS NULL);


--
-- Name: txn_org_amount_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX txn_org_amount_date ON public.transactions USING btree (org_id, amount, date);


--
-- Name: txn_org_counterparty; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX txn_org_counterparty ON public.transactions USING btree (org_id, counterparty);


--
-- Name: txn_org_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX txn_org_date ON public.transactions USING btree (org_id, date);


--
-- Name: txn_org_recon_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX txn_org_recon_status ON public.transactions USING btree (org_id, reconciliation_status);


--
-- Name: txn_org_reference; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX txn_org_reference ON public.transactions USING btree (org_id, reference_no);


--
-- Name: user_nav_pins_org_user_href_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX user_nav_pins_org_user_href_uniq ON public.user_nav_pins USING btree (org_id, user_id, href);


--
-- Name: user_nav_pins_org_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_nav_pins_org_user_idx ON public.user_nav_pins USING btree (org_id, user_id);


--
-- Name: vat_carryforwards_org_establishment_available; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX vat_carryforwards_org_establishment_available ON public.vat_credit_carryforwards USING btree (org_id, establishment_id, status);


--
-- Name: vat_credit_carryforwards_available; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX vat_credit_carryforwards_available ON public.vat_credit_carryforwards USING btree (org_id, status);


--
-- Name: vat_credit_carryforwards_id_org_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX vat_credit_carryforwards_id_org_uniq ON public.vat_credit_carryforwards USING btree (id, org_id);


--
-- Name: vat_credit_carryforwards_origin_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX vat_credit_carryforwards_origin_unique ON public.vat_credit_carryforwards USING btree (org_id, source_pp30_filing_id);


--
-- Name: vat_filing_lines_filing; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX vat_filing_lines_filing ON public.vat_filing_lines USING btree (org_id, filing_id, line_type);


--
-- Name: vat_filing_lines_id_org_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX vat_filing_lines_id_org_uniq ON public.vat_filing_lines USING btree (id, org_id);


--
-- Name: vat_filing_lines_input_once; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX vat_filing_lines_input_once ON public.vat_filing_lines USING btree (org_id, vat_input_item_id, line_type) WHERE ((vat_input_item_id IS NOT NULL) AND (line_type = 'input'::public.vat_filing_line_type));


--
-- Name: vat_filing_lines_output_once; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX vat_filing_lines_output_once ON public.vat_filing_lines USING btree (org_id, vat_output_item_id, line_type) WHERE ((vat_output_item_id IS NOT NULL) AND (line_type = 'output'::public.vat_filing_line_type));


--
-- Name: vat_filing_lines_pp36_role_once; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX vat_filing_lines_pp36_role_once ON public.vat_filing_lines USING btree (org_id, pp36_obligation_id, line_type) WHERE ((pp36_obligation_id IS NOT NULL) AND (line_type = ANY (ARRAY['pp36_obligation'::public.vat_filing_line_type, 'pp36_reclaim'::public.vat_filing_line_type])));


--
-- Name: vat_filings_id_org_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX vat_filings_id_org_uniq ON public.vat_filings USING btree (id, org_id);


--
-- Name: vat_filings_open_ordinary_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX vat_filings_open_ordinary_unique ON public.vat_filings USING btree (org_id, COALESCE(establishment_id, '00000000-0000-0000-0000-000000000000'::uuid), filing_type, period_year, period_month) WHERE ((filing_kind = 'ordinary'::public.vat_filing_kind) AND (status <> 'voided'::public.vat_filing_status) AND (deleted_at IS NULL));


--
-- Name: vat_filings_org_period; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX vat_filings_org_period ON public.vat_filings USING btree (org_id, filing_type, period_year, period_month, status) WHERE (deleted_at IS NULL);


--
-- Name: vat_input_items_document; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX vat_input_items_document ON public.vat_input_items USING btree (org_id, source_document_id) WHERE (deleted_at IS NULL);


--
-- Name: vat_input_items_id_org_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX vat_input_items_id_org_uniq ON public.vat_input_items USING btree (id, org_id);


--
-- Name: vat_input_items_org_establishment_period; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX vat_input_items_org_establishment_period ON public.vat_input_items USING btree (org_id, establishment_id, eligible_period_year, eligible_period_month, status) WHERE (deleted_at IS NULL);


--
-- Name: vat_input_items_org_expiry; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX vat_input_items_org_expiry ON public.vat_input_items USING btree (org_id, expiry_period_year, expiry_period_month, status) WHERE (deleted_at IS NULL);


--
-- Name: vat_input_items_org_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX vat_input_items_org_status ON public.vat_input_items USING btree (org_id, status, created_at) WHERE (deleted_at IS NULL);


--
-- Name: vat_input_items_source_document_active; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX vat_input_items_source_document_active ON public.vat_input_items USING btree (org_id, source_document_id) WHERE ((deleted_at IS NULL) AND (source_document_line_id IS NULL));


--
-- Name: vat_input_items_source_line_active; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX vat_input_items_source_line_active ON public.vat_input_items USING btree (org_id, source_document_line_id) WHERE ((deleted_at IS NULL) AND (source_document_line_id IS NOT NULL));


--
-- Name: vat_output_items_document; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX vat_output_items_document ON public.vat_output_items USING btree (org_id, source_document_id) WHERE (deleted_at IS NULL);


--
-- Name: vat_output_items_id_org_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX vat_output_items_id_org_uniq ON public.vat_output_items USING btree (id, org_id);


--
-- Name: vat_output_items_org_establishment_period; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX vat_output_items_org_establishment_period ON public.vat_output_items USING btree (org_id, establishment_id, output_period_year, output_period_month, status) WHERE (deleted_at IS NULL);


--
-- Name: vat_output_items_org_period; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX vat_output_items_org_period ON public.vat_output_items USING btree (org_id, output_period_year, output_period_month, status) WHERE (deleted_at IS NULL);


--
-- Name: vat_output_items_source_document_active; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX vat_output_items_source_document_active ON public.vat_output_items USING btree (org_id, source_document_id) WHERE ((deleted_at IS NULL) AND (source_document_id IS NOT NULL) AND (source_document_line_id IS NULL));


--
-- Name: vat_output_items_source_line_active; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX vat_output_items_source_line_active ON public.vat_output_items USING btree (org_id, source_document_line_id) WHERE ((deleted_at IS NULL) AND (source_document_line_id IS NOT NULL));


--
-- Name: vendor_alias_lookup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX vendor_alias_lookup ON public.vendor_bank_aliases USING btree (org_id, alias_text);


--
-- Name: vendors_id_org_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX vendors_id_org_uniq ON public.vendors USING btree (id, org_id);


--
-- Name: voucher_sales_org_establishment_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX voucher_sales_org_establishment_idx ON public.voucher_sales USING btree (org_id, establishment_id);


--
-- Name: wht_certificates_id_org_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX wht_certificates_id_org_uniq ON public.wht_certificates USING btree (id, org_id);


--
-- Name: wht_credits_received_customer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX wht_credits_received_customer ON public.wht_credits_received USING btree (org_id, customer_vendor_id);


--
-- Name: wht_credits_received_org_year; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX wht_credits_received_org_year ON public.wht_credits_received USING btree (org_id, tax_year);


--
-- Name: wht_credits_received_unique_cert; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX wht_credits_received_unique_cert ON public.wht_credits_received USING btree (org_id, customer_vendor_id, certificate_no, tax_year) WHERE ((deleted_at IS NULL) AND (certificate_no IS NOT NULL));


--
-- Name: wht_credits_received_unique_doc; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX wht_credits_received_unique_doc ON public.wht_credits_received USING btree (org_id, certificate_received_document_id) WHERE ((deleted_at IS NULL) AND (certificate_received_document_id IS NOT NULL));


--
-- Name: wht_monthly_filings_id_org_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX wht_monthly_filings_id_org_uniq ON public.wht_monthly_filings USING btree (id, org_id);


--
-- Name: wht_threshold_org_payee_year; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX wht_threshold_org_payee_year ON public.wht_annual_threshold_decisions USING btree (org_id, payee_vendor_id, tax_year);


--
-- Name: audit_log_2026_06_org_id_created_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.audit_log_org_created ATTACH PARTITION public.audit_log_2026_06_org_id_created_at_idx;


--
-- Name: audit_log_2026_06_org_id_entity_type_entity_id_created_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.audit_log_entity_history ATTACH PARTITION public.audit_log_2026_06_org_id_entity_type_entity_id_created_at_idx;


--
-- Name: audit_log_2026_06_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.audit_log_pkey ATTACH PARTITION public.audit_log_2026_06_pkey;


--
-- Name: audit_log_2026_07_org_id_created_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.audit_log_org_created ATTACH PARTITION public.audit_log_2026_07_org_id_created_at_idx;


--
-- Name: audit_log_2026_07_org_id_entity_type_entity_id_created_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.audit_log_entity_history ATTACH PARTITION public.audit_log_2026_07_org_id_entity_type_entity_id_created_at_idx;


--
-- Name: audit_log_2026_07_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.audit_log_pkey ATTACH PARTITION public.audit_log_2026_07_pkey;


--
-- Name: audit_log_2026_08_org_id_created_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.audit_log_org_created ATTACH PARTITION public.audit_log_2026_08_org_id_created_at_idx;


--
-- Name: audit_log_2026_08_org_id_entity_type_entity_id_created_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.audit_log_entity_history ATTACH PARTITION public.audit_log_2026_08_org_id_entity_type_entity_id_created_at_idx;


--
-- Name: audit_log_2026_08_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.audit_log_pkey ATTACH PARTITION public.audit_log_2026_08_pkey;


--
-- Name: audit_log_2026_09_org_id_created_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.audit_log_org_created ATTACH PARTITION public.audit_log_2026_09_org_id_created_at_idx;


--
-- Name: audit_log_2026_09_org_id_entity_type_entity_id_created_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.audit_log_entity_history ATTACH PARTITION public.audit_log_2026_09_org_id_entity_type_entity_id_created_at_idx;


--
-- Name: audit_log_2026_09_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.audit_log_pkey ATTACH PARTITION public.audit_log_2026_09_pkey;


--
-- Name: audit_log_2026_10_org_id_created_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.audit_log_org_created ATTACH PARTITION public.audit_log_2026_10_org_id_created_at_idx;


--
-- Name: audit_log_2026_10_org_id_entity_type_entity_id_created_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.audit_log_entity_history ATTACH PARTITION public.audit_log_2026_10_org_id_entity_type_entity_id_created_at_idx;


--
-- Name: audit_log_2026_10_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.audit_log_pkey ATTACH PARTITION public.audit_log_2026_10_pkey;


--
-- Name: audit_log_2026_11_org_id_created_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.audit_log_org_created ATTACH PARTITION public.audit_log_2026_11_org_id_created_at_idx;


--
-- Name: audit_log_2026_11_org_id_entity_type_entity_id_created_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.audit_log_entity_history ATTACH PARTITION public.audit_log_2026_11_org_id_entity_type_entity_id_created_at_idx;


--
-- Name: audit_log_2026_11_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.audit_log_pkey ATTACH PARTITION public.audit_log_2026_11_pkey;


--
-- Name: audit_log_2026_12_org_id_created_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.audit_log_org_created ATTACH PARTITION public.audit_log_2026_12_org_id_created_at_idx;


--
-- Name: audit_log_2026_12_org_id_entity_type_entity_id_created_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.audit_log_entity_history ATTACH PARTITION public.audit_log_2026_12_org_id_entity_type_entity_id_created_at_idx;


--
-- Name: audit_log_2026_12_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.audit_log_pkey ATTACH PARTITION public.audit_log_2026_12_pkey;


--
-- Name: audit_log_2027_01_org_id_created_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.audit_log_org_created ATTACH PARTITION public.audit_log_2027_01_org_id_created_at_idx;


--
-- Name: audit_log_2027_01_org_id_entity_type_entity_id_created_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.audit_log_entity_history ATTACH PARTITION public.audit_log_2027_01_org_id_entity_type_entity_id_created_at_idx;


--
-- Name: audit_log_2027_01_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.audit_log_pkey ATTACH PARTITION public.audit_log_2027_01_pkey;


--
-- Name: audit_log_2027_02_org_id_created_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.audit_log_org_created ATTACH PARTITION public.audit_log_2027_02_org_id_created_at_idx;


--
-- Name: audit_log_2027_02_org_id_entity_type_entity_id_created_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.audit_log_entity_history ATTACH PARTITION public.audit_log_2027_02_org_id_entity_type_entity_id_created_at_idx;


--
-- Name: audit_log_2027_02_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.audit_log_pkey ATTACH PARTITION public.audit_log_2027_02_pkey;


--
-- Name: audit_log_2027_03_org_id_created_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.audit_log_org_created ATTACH PARTITION public.audit_log_2027_03_org_id_created_at_idx;


--
-- Name: audit_log_2027_03_org_id_entity_type_entity_id_created_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.audit_log_entity_history ATTACH PARTITION public.audit_log_2027_03_org_id_entity_type_entity_id_created_at_idx;


--
-- Name: audit_log_2027_03_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.audit_log_pkey ATTACH PARTITION public.audit_log_2027_03_pkey;


--
-- Name: audit_log_2027_04_org_id_created_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.audit_log_org_created ATTACH PARTITION public.audit_log_2027_04_org_id_created_at_idx;


--
-- Name: audit_log_2027_04_org_id_entity_type_entity_id_created_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.audit_log_entity_history ATTACH PARTITION public.audit_log_2027_04_org_id_entity_type_entity_id_created_at_idx;


--
-- Name: audit_log_2027_04_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.audit_log_pkey ATTACH PARTITION public.audit_log_2027_04_pkey;


--
-- Name: audit_log_2027_05_org_id_created_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.audit_log_org_created ATTACH PARTITION public.audit_log_2027_05_org_id_created_at_idx;


--
-- Name: audit_log_2027_05_org_id_entity_type_entity_id_created_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.audit_log_entity_history ATTACH PARTITION public.audit_log_2027_05_org_id_entity_type_entity_id_created_at_idx;


--
-- Name: audit_log_2027_05_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.audit_log_pkey ATTACH PARTITION public.audit_log_2027_05_pkey;


--
-- Name: audit_log_2027_06_org_id_created_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.audit_log_org_created ATTACH PARTITION public.audit_log_2027_06_org_id_created_at_idx;


--
-- Name: audit_log_2027_06_org_id_entity_type_entity_id_created_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.audit_log_entity_history ATTACH PARTITION public.audit_log_2027_06_org_id_entity_type_entity_id_created_at_idx;


--
-- Name: audit_log_2027_06_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.audit_log_pkey ATTACH PARTITION public.audit_log_2027_06_pkey;


--
-- Name: audit_log_2027_07_org_id_created_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.audit_log_org_created ATTACH PARTITION public.audit_log_2027_07_org_id_created_at_idx;


--
-- Name: audit_log_2027_07_org_id_entity_type_entity_id_created_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.audit_log_entity_history ATTACH PARTITION public.audit_log_2027_07_org_id_entity_type_entity_id_created_at_idx;


--
-- Name: audit_log_2027_07_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.audit_log_pkey ATTACH PARTITION public.audit_log_2027_07_pkey;


--
-- Name: audit_log_default_org_id_created_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.audit_log_org_created ATTACH PARTITION public.audit_log_default_org_id_created_at_idx;


--
-- Name: audit_log_default_org_id_entity_type_entity_id_created_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.audit_log_entity_history ATTACH PARTITION public.audit_log_default_org_id_entity_type_entity_id_created_at_idx;


--
-- Name: audit_log_default_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.audit_log_pkey ATTACH PARTITION public.audit_log_default_pkey;


--
-- Name: ai_match_suggestions ai_match_suggestions_document_same_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER ai_match_suggestions_document_same_org BEFORE INSERT OR UPDATE OF document_id, org_id ON public.ai_match_suggestions FOR EACH ROW EXECUTE FUNCTION public.enforce_same_org_reference('documents', 'document_id');


--
-- Name: ai_match_suggestions ai_match_suggestions_payment_same_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER ai_match_suggestions_payment_same_org BEFORE INSERT OR UPDATE OF payment_id, org_id ON public.ai_match_suggestions FOR EACH ROW EXECUTE FUNCTION public.enforce_same_org_reference('payments', 'payment_id');


--
-- Name: ai_match_suggestions ai_match_suggestions_transaction_same_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER ai_match_suggestions_transaction_same_org BEFORE INSERT OR UPDATE OF transaction_id, org_id ON public.ai_match_suggestions FOR EACH ROW EXECUTE FUNCTION public.enforce_same_org_reference('transactions', 'transaction_id');


--
-- Name: bank_statements bank_statements_bank_account_same_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER bank_statements_bank_account_same_org BEFORE INSERT OR UPDATE OF bank_account_id, org_id ON public.bank_statements FOR EACH ROW EXECUTE FUNCTION public.enforce_same_org_reference('bank_accounts', 'bank_account_id');


--
-- Name: extraction_correction_sessions correction_sessions_document_same_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER correction_sessions_document_same_org BEFORE INSERT OR UPDATE OF document_id, org_id ON public.extraction_correction_sessions FOR EACH ROW EXECUTE FUNCTION public.enforce_same_org_reference('documents', 'document_id');


--
-- Name: extraction_correction_sessions correction_sessions_extraction_log_same_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER correction_sessions_extraction_log_same_org BEFORE INSERT OR UPDATE OF extraction_log_id, org_id ON public.extraction_correction_sessions FOR EACH ROW EXECUTE FUNCTION public.enforce_same_org_reference('extraction_log', 'extraction_log_id');


--
-- Name: document_files document_files_document_same_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER document_files_document_same_org BEFORE INSERT OR UPDATE OF document_id, org_id ON public.document_files FOR EACH ROW EXECUTE FUNCTION public.enforce_same_org_reference('documents', 'document_id');


--
-- Name: document_files document_files_vat_bound_source; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER document_files_vat_bound_source BEFORE DELETE OR UPDATE ON public.document_files FOR EACH ROW EXECUTE FUNCTION public.guard_document_files_vat_bound_source();


--
-- Name: document_line_items document_line_items_document_same_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER document_line_items_document_same_org BEFORE INSERT OR UPDATE OF document_id, org_id ON public.document_line_items FOR EACH ROW EXECUTE FUNCTION public.enforce_same_org_reference('documents', 'document_id');


--
-- Name: document_line_items document_line_items_vat_bound_source; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER document_line_items_vat_bound_source BEFORE DELETE OR UPDATE ON public.document_line_items FOR EACH ROW EXECUTE FUNCTION public.guard_document_line_items_vat_bound_source();


--
-- Name: documents documents_related_document_same_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER documents_related_document_same_org BEFORE INSERT OR UPDATE OF related_document_id, org_id ON public.documents FOR EACH ROW EXECUTE FUNCTION public.enforce_same_org_reference('documents', 'related_document_id');


--
-- Name: documents documents_vat_bound_source; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER documents_vat_bound_source BEFORE DELETE OR UPDATE ON public.documents FOR EACH ROW EXECUTE FUNCTION public.guard_documents_vat_bound_source();


--
-- Name: documents documents_vat_period_lock; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER documents_vat_period_lock BEFORE INSERT OR DELETE OR UPDATE ON public.documents FOR EACH ROW EXECUTE FUNCTION public.guard_documents_vat_period_lock();


--
-- Name: documents documents_vendor_same_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER documents_vendor_same_org BEFORE INSERT OR UPDATE OF vendor_id, org_id ON public.documents FOR EACH ROW EXECUTE FUNCTION public.enforce_same_org_reference('vendors', 'vendor_id');


--
-- Name: journal_entries enforce_journal_entry_header_balance_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE CONSTRAINT TRIGGER enforce_journal_entry_header_balance_trigger AFTER INSERT OR UPDATE OF total_debit, total_credit ON public.journal_entries DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.enforce_journal_entry_header_balance();


--
-- Name: journal_lines enforce_journal_entry_line_balance_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE CONSTRAINT TRIGGER enforce_journal_entry_line_balance_trigger AFTER INSERT OR DELETE OR UPDATE ON public.journal_lines DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.enforce_journal_entry_line_balance();


--
-- Name: extraction_exemplars extraction_exemplars_correction_session_same_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER extraction_exemplars_correction_session_same_org BEFORE INSERT OR UPDATE OF correction_session_id, org_id ON public.extraction_exemplars FOR EACH ROW EXECUTE FUNCTION public.enforce_same_org_reference('extraction_correction_sessions', 'correction_session_id');


--
-- Name: extraction_exemplars extraction_exemplars_document_same_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER extraction_exemplars_document_same_org BEFORE INSERT OR UPDATE OF document_id, org_id ON public.extraction_exemplars FOR EACH ROW EXECUTE FUNCTION public.enforce_same_org_reference('documents', 'document_id');


--
-- Name: extraction_exemplars extraction_exemplars_vendor_same_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER extraction_exemplars_vendor_same_org BEFORE INSERT OR UPDATE OF vendor_id, org_id ON public.extraction_exemplars FOR EACH ROW EXECUTE FUNCTION public.enforce_same_org_reference('vendors', 'vendor_id');


--
-- Name: extraction_log extraction_log_document_same_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER extraction_log_document_same_org BEFORE INSERT OR UPDATE OF document_id, org_id ON public.extraction_log FOR EACH ROW EXECUTE FUNCTION public.enforce_same_org_reference('documents', 'document_id');


--
-- Name: extraction_log extraction_log_exemplars_same_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER extraction_log_exemplars_same_org BEFORE INSERT OR UPDATE OF exemplar_ids, org_id ON public.extraction_log FOR EACH ROW EXECUTE FUNCTION public.enforce_extraction_log_exemplars_same_org();


--
-- Name: extraction_log extraction_log_vendor_same_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER extraction_log_vendor_same_org BEFORE INSERT OR UPDATE OF vendor_id, org_id ON public.extraction_log FOR EACH ROW EXECUTE FUNCTION public.enforce_same_org_reference('vendors', 'vendor_id');


--
-- Name: extraction_review_outcome extraction_review_outcome_document_same_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER extraction_review_outcome_document_same_org BEFORE INSERT OR UPDATE OF document_id, org_id ON public.extraction_review_outcome FOR EACH ROW EXECUTE FUNCTION public.enforce_same_org_reference('documents', 'document_id');


--
-- Name: extraction_review_outcome extraction_review_outcome_extraction_log_same_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER extraction_review_outcome_extraction_log_same_org BEFORE INSERT OR UPDATE OF extraction_log_id, org_id ON public.extraction_review_outcome FOR EACH ROW EXECUTE FUNCTION public.enforce_same_org_reference('extraction_log', 'extraction_log_id');


--
-- Name: allocation_rule_targets guard_allocation_rule_target_same_org_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER guard_allocation_rule_target_same_org_trigger BEFORE INSERT OR UPDATE OF org_id, allocation_rule_id, cost_center_id, project_id ON public.allocation_rule_targets FOR EACH ROW EXECUTE FUNCTION public.guard_allocation_rule_target_same_org();


--
-- Name: book_tax_adjustments guard_book_tax_adjustment_org_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER guard_book_tax_adjustment_org_trigger BEFORE INSERT OR UPDATE OF org_id, gl_account_id ON public.book_tax_adjustments FOR EACH ROW EXECUTE FUNCTION public.guard_book_tax_adjustment_same_org();


--
-- Name: cash_deposits guard_cash_deposits_establishment_org_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER guard_cash_deposits_establishment_org_trigger BEFORE INSERT OR UPDATE OF org_id, establishment_id ON public.cash_deposits FOR EACH ROW EXECUTE FUNCTION public.guard_establishment_same_org();


--
-- Name: cit_filings guard_cit_filing_refs_org_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER guard_cit_filing_refs_org_trigger BEFORE INSERT OR UPDATE OF org_id, bank_transaction_id, confirmation_document_id, working_paper_document_id ON public.cit_filings FOR EACH ROW EXECUTE FUNCTION public.guard_cit_filing_refs_same_org();


--
-- Name: close_checklists guard_close_checklist_establishment_org_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER guard_close_checklist_establishment_org_trigger BEFORE INSERT OR UPDATE OF org_id, establishment_id ON public.close_checklists FOR EACH ROW EXECUTE FUNCTION public.guard_close_checklist_establishment_same_org();


--
-- Name: close_checklist_items guard_close_checklist_item_same_org_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER guard_close_checklist_item_same_org_trigger BEFORE INSERT OR UPDATE OF org_id, checklist_id ON public.close_checklist_items FOR EACH ROW EXECUTE FUNCTION public.guard_close_checklist_item_same_org();


--
-- Name: copilot_messages guard_copilot_messages_session_org_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER guard_copilot_messages_session_org_trigger BEFORE INSERT OR UPDATE OF org_id, session_id ON public.copilot_messages FOR EACH ROW EXECUTE FUNCTION public.guard_copilot_session_same_org();


--
-- Name: copilot_tool_events guard_copilot_tool_events_session_org_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER guard_copilot_tool_events_session_org_trigger BEFORE INSERT OR UPDATE OF org_id, session_id ON public.copilot_tool_events FOR EACH ROW EXECUTE FUNCTION public.guard_copilot_session_same_org();


--
-- Name: cost_centers guard_cost_center_parent_org_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER guard_cost_center_parent_org_trigger BEFORE INSERT OR UPDATE OF org_id, parent_id ON public.cost_centers FOR EACH ROW EXECUTE FUNCTION public.guard_cost_center_parent_same_org();


--
-- Name: depreciation_schedule guard_depreciation_schedule_same_org_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER guard_depreciation_schedule_same_org_trigger BEFORE INSERT OR UPDATE OF org_id, fixed_asset_id, journal_entry_id ON public.depreciation_schedule FOR EACH ROW EXECUTE FUNCTION public.guard_depreciation_schedule_same_org();


--
-- Name: employee_allowances guard_employee_allowances_same_org_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER guard_employee_allowances_same_org_trigger BEFORE INSERT OR UPDATE OF org_id, employee_id ON public.employee_allowances FOR EACH ROW EXECUTE FUNCTION public.guard_employee_allowance_same_org();


--
-- Name: employees guard_employees_establishment_org_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER guard_employees_establishment_org_trigger BEFORE INSERT OR UPDATE OF org_id, establishment_id ON public.employees FOR EACH ROW EXECUTE FUNCTION public.guard_payroll_establishment_same_org();


--
-- Name: fixed_assets guard_fixed_asset_establishment_org_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER guard_fixed_asset_establishment_org_trigger BEFORE INSERT OR UPDATE OF org_id, establishment_id ON public.fixed_assets FOR EACH ROW EXECUTE FUNCTION public.guard_fixed_asset_establishment_same_org();


--
-- Name: fixed_assets guard_fixed_asset_refs_org_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER guard_fixed_asset_refs_org_trigger BEFORE INSERT OR UPDATE OF org_id, gl_account_id, accumulated_depreciation_account_id, depreciation_expense_account_id, acquisition_document_id, disposal_document_id, assigned_to_employee_id ON public.fixed_assets FOR EACH ROW EXECUTE FUNCTION public.guard_fixed_asset_refs_same_org();


--
-- Name: fx_valuation_layers guard_fx_valuation_layer_same_org_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER guard_fx_valuation_layer_same_org_trigger BEFORE INSERT OR UPDATE OF org_id, journal_entry_id ON public.fx_valuation_layers FOR EACH ROW EXECUTE FUNCTION public.guard_fx_valuation_layer_same_org();


--
-- Name: gl_accounts guard_gl_account_parent_org_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER guard_gl_account_parent_org_trigger BEFORE INSERT OR UPDATE OF org_id, parent_account_id ON public.gl_accounts FOR EACH ROW EXECUTE FUNCTION public.guard_gl_account_parent_org();


--
-- Name: journal_entries guard_gl_entry_period_lock_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER guard_gl_entry_period_lock_trigger BEFORE INSERT OR DELETE OR UPDATE ON public.journal_entries FOR EACH ROW EXECUTE FUNCTION public.guard_gl_entry_period_lock();


--
-- Name: gl_opening_balances guard_gl_opening_balance_scope_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER guard_gl_opening_balance_scope_trigger BEFORE INSERT OR UPDATE OF org_id, account_id ON public.gl_opening_balances FOR EACH ROW EXECUTE FUNCTION public.guard_gl_opening_balance_scope();


--
-- Name: import_charge_lines guard_import_charge_lines_finalized_delete_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER guard_import_charge_lines_finalized_delete_trigger BEFORE DELETE ON public.import_charge_lines FOR EACH ROW EXECUTE FUNCTION public.guard_finalized_import_child_immutability();


--
-- Name: import_charge_lines guard_import_charge_lines_finalized_update_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER guard_import_charge_lines_finalized_update_trigger BEFORE UPDATE ON public.import_charge_lines FOR EACH ROW EXECUTE FUNCTION public.guard_finalized_import_child_immutability();


--
-- Name: import_charge_lines guard_import_charge_lines_same_org_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER guard_import_charge_lines_same_org_trigger BEFORE INSERT OR UPDATE OF org_id, import_id, source_document_id, expense_account_id ON public.import_charge_lines FOR EACH ROW EXECUTE FUNCTION public.guard_import_child_same_org();


--
-- Name: import_documents guard_import_documents_finalized_delete_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER guard_import_documents_finalized_delete_trigger BEFORE DELETE ON public.import_documents FOR EACH ROW EXECUTE FUNCTION public.guard_finalized_import_child_immutability();


--
-- Name: import_documents guard_import_documents_finalized_update_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER guard_import_documents_finalized_update_trigger BEFORE UPDATE ON public.import_documents FOR EACH ROW EXECUTE FUNCTION public.guard_finalized_import_child_immutability();


--
-- Name: import_documents guard_import_documents_same_org_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER guard_import_documents_same_org_trigger BEFORE INSERT OR UPDATE OF org_id, import_id, document_id ON public.import_documents FOR EACH ROW EXECUTE FUNCTION public.guard_import_child_same_org();


--
-- Name: imports guard_import_finalize_delete_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER guard_import_finalize_delete_trigger BEFORE DELETE ON public.imports FOR EACH ROW EXECUTE FUNCTION public.guard_import_finalize();


--
-- Name: imports guard_import_finalize_update_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER guard_import_finalize_update_trigger BEFORE UPDATE ON public.imports FOR EACH ROW EXECUTE FUNCTION public.guard_import_finalize();


--
-- Name: import_goods_lines guard_import_goods_lines_finalized_delete_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER guard_import_goods_lines_finalized_delete_trigger BEFORE DELETE ON public.import_goods_lines FOR EACH ROW EXECUTE FUNCTION public.guard_finalized_import_child_immutability();


--
-- Name: import_goods_lines guard_import_goods_lines_finalized_update_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER guard_import_goods_lines_finalized_update_trigger BEFORE UPDATE ON public.import_goods_lines FOR EACH ROW EXECUTE FUNCTION public.guard_finalized_import_child_immutability();


--
-- Name: import_goods_lines guard_import_goods_lines_same_org_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER guard_import_goods_lines_same_org_trigger BEFORE INSERT OR UPDATE OF org_id, import_id ON public.import_goods_lines FOR EACH ROW EXECUTE FUNCTION public.guard_import_child_same_org();


--
-- Name: import_payments guard_import_payments_finalized_delete_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER guard_import_payments_finalized_delete_trigger BEFORE DELETE ON public.import_payments FOR EACH ROW EXECUTE FUNCTION public.guard_finalized_import_child_immutability();


--
-- Name: import_payments guard_import_payments_finalized_update_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER guard_import_payments_finalized_update_trigger BEFORE UPDATE ON public.import_payments FOR EACH ROW EXECUTE FUNCTION public.guard_finalized_import_child_immutability();


--
-- Name: import_payments guard_import_payments_same_org_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER guard_import_payments_same_org_trigger BEFORE INSERT OR UPDATE OF org_id, import_id, bank_transaction_id ON public.import_payments FOR EACH ROW EXECUTE FUNCTION public.guard_import_child_same_org();


--
-- Name: imports guard_imports_same_org_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER guard_imports_same_org_trigger BEFORE INSERT OR UPDATE OF org_id, establishment_id, supplier_vendor_id ON public.imports FOR EACH ROW EXECUTE FUNCTION public.guard_import_packet_same_org();


--
-- Name: inventory_count_items guard_inventory_count_items_same_org_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER guard_inventory_count_items_same_org_trigger BEFORE INSERT OR UPDATE OF org_id, count_id, sku_id ON public.inventory_count_items FOR EACH ROW EXECUTE FUNCTION public.guard_inventory_count_item_same_org();


--
-- Name: inventory_counts guard_inventory_counts_same_org_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER guard_inventory_counts_same_org_trigger BEFORE INSERT OR UPDATE OF org_id, establishment_id ON public.inventory_counts FOR EACH ROW EXECUTE FUNCTION public.guard_inventory_count_same_org();


--
-- Name: inventory_movements guard_inventory_movements_delete_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER guard_inventory_movements_delete_trigger BEFORE DELETE ON public.inventory_movements FOR EACH ROW EXECUTE FUNCTION public.guard_inventory_movement_immutable();


--
-- Name: inventory_movements guard_inventory_movements_same_org_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER guard_inventory_movements_same_org_trigger BEFORE INSERT OR UPDATE OF org_id, establishment_id, sku_id, journal_entry_id ON public.inventory_movements FOR EACH ROW EXECUTE FUNCTION public.guard_inventory_movement_same_org();


--
-- Name: inventory_movements guard_inventory_movements_update_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER guard_inventory_movements_update_trigger BEFORE UPDATE ON public.inventory_movements FOR EACH ROW EXECUTE FUNCTION public.guard_inventory_movement_immutable();


--
-- Name: inventory_statutory_overhead_components guard_inventory_overhead_components_same_org_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER guard_inventory_overhead_components_same_org_trigger BEFORE INSERT OR UPDATE OF org_id, import_id, import_goods_line_id, import_charge_line_id, sku_id ON public.inventory_statutory_overhead_components FOR EACH ROW EXECUTE FUNCTION public.guard_inventory_overhead_component_same_org();


--
-- Name: journal_lines guard_journal_line_scope_and_lock_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER guard_journal_line_scope_and_lock_trigger BEFORE INSERT OR DELETE OR UPDATE ON public.journal_lines FOR EACH ROW EXECUTE FUNCTION public.guard_journal_line_scope_and_lock();


--
-- Name: pay_runs guard_pay_runs_establishment_org_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER guard_pay_runs_establishment_org_trigger BEFORE INSERT OR UPDATE OF org_id, establishment_id ON public.pay_runs FOR EACH ROW EXECUTE FUNCTION public.guard_payroll_establishment_same_org();


--
-- Name: pay_slips guard_pay_slips_establishment_org_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER guard_pay_slips_establishment_org_trigger BEFORE INSERT OR UPDATE OF org_id, establishment_id ON public.pay_slips FOR EACH ROW EXECUTE FUNCTION public.guard_payroll_establishment_same_org();


--
-- Name: pay_slips guard_pay_slips_same_org_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER guard_pay_slips_same_org_trigger BEFORE INSERT OR UPDATE OF org_id, pay_run_id, employee_id ON public.pay_slips FOR EACH ROW EXECUTE FUNCTION public.guard_pay_slip_same_org();


--
-- Name: pnd_filings guard_pnd_filings_establishment_org_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER guard_pnd_filings_establishment_org_trigger BEFORE INSERT OR UPDATE OF org_id, establishment_id ON public.pnd_filings FOR EACH ROW EXECUTE FUNCTION public.guard_payroll_establishment_same_org();


--
-- Name: processor_settlements guard_processor_settlements_establishment_org_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER guard_processor_settlements_establishment_org_trigger BEFORE INSERT OR UPDATE OF org_id, establishment_id ON public.processor_settlements FOR EACH ROW EXECUTE FUNCTION public.guard_processor_settlement_establishment_org();


--
-- Name: projects guard_project_vendor_org_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER guard_project_vendor_org_trigger BEFORE INSERT OR UPDATE OF org_id, customer_vendor_id ON public.projects FOR EACH ROW EXECUTE FUNCTION public.guard_project_vendor_same_org();


--
-- Name: sales_transactions guard_sales_transactions_establishment_org_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER guard_sales_transactions_establishment_org_trigger BEFORE INSERT OR UPDATE OF org_id, establishment_id ON public.sales_transactions FOR EACH ROW EXECUTE FUNCTION public.guard_establishment_same_org();


--
-- Name: skus guard_skus_same_org_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER guard_skus_same_org_trigger BEFORE INSERT OR UPDATE OF org_id, establishment_id, gl_inventory_account_id, gl_cogs_account_id, gl_revenue_account_id ON public.skus FOR EACH ROW EXECUTE FUNCTION public.guard_sku_same_org();


--
-- Name: sso_filings guard_sso_filings_establishment_org_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER guard_sso_filings_establishment_org_trigger BEFORE INSERT OR UPDATE OF org_id, establishment_id ON public.sso_filings FOR EACH ROW EXECUTE FUNCTION public.guard_payroll_establishment_same_org();


--
-- Name: voucher_sales guard_voucher_sales_establishment_org_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER guard_voucher_sales_establishment_org_trigger BEFORE INSERT OR UPDATE OF org_id, establishment_id ON public.voucher_sales FOR EACH ROW EXECUTE FUNCTION public.guard_establishment_same_org();


--
-- Name: extraction_learning_candidates learning_candidates_document_same_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER learning_candidates_document_same_org BEFORE INSERT OR UPDATE OF document_id, org_id ON public.extraction_learning_candidates FOR EACH ROW EXECUTE FUNCTION public.enforce_same_org_reference('documents', 'document_id');


--
-- Name: extraction_learning_candidates learning_candidates_session_same_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER learning_candidates_session_same_org BEFORE INSERT OR UPDATE OF correction_session_id, org_id ON public.extraction_learning_candidates FOR EACH ROW EXECUTE FUNCTION public.enforce_same_org_reference('extraction_correction_sessions', 'correction_session_id');


--
-- Name: extraction_learning_candidates learning_candidates_vendor_same_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER learning_candidates_vendor_same_org BEFORE INSERT OR UPDATE OF vendor_id, org_id ON public.extraction_learning_candidates FOR EACH ROW EXECUTE FUNCTION public.enforce_same_org_reference('vendors', 'vendor_id');


--
-- Name: payments payments_document_same_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER payments_document_same_org BEFORE INSERT OR UPDATE OF document_id, org_id ON public.payments FOR EACH ROW EXECUTE FUNCTION public.enforce_same_org_reference('documents', 'document_id');


--
-- Name: payments payments_vat_bound_source; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER payments_vat_bound_source BEFORE DELETE OR UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.guard_payments_vat_bound_source();


--
-- Name: pp36_obligations pp36_decision_same_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER pp36_decision_same_org BEFORE INSERT OR UPDATE OF tax_treatment_decision_id, org_id ON public.pp36_obligations FOR EACH ROW EXECUTE FUNCTION public.enforce_same_org_reference('tax_treatment_decisions', 'tax_treatment_decision_id');


--
-- Name: pp36_obligations pp36_document_same_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER pp36_document_same_org BEFORE INSERT OR UPDATE OF source_document_id, org_id ON public.pp36_obligations FOR EACH ROW EXECUTE FUNCTION public.enforce_same_org_reference('documents', 'source_document_id');


--
-- Name: pp36_obligations pp36_filing_line_same_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER pp36_filing_line_same_org BEFORE INSERT OR UPDATE OF pp36_filing_line_id, org_id ON public.pp36_obligations FOR EACH ROW EXECUTE FUNCTION public.enforce_same_org_reference('vat_filing_lines', 'pp36_filing_line_id');


--
-- Name: pp36_obligations pp36_filing_same_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER pp36_filing_same_org BEFORE INSERT OR UPDATE OF pp36_filing_id, org_id ON public.pp36_obligations FOR EACH ROW EXECUTE FUNCTION public.enforce_same_org_reference('vat_filings', 'pp36_filing_id');


--
-- Name: pp36_obligations pp36_line_same_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER pp36_line_same_org BEFORE INSERT OR UPDATE OF source_document_line_id, org_id ON public.pp36_obligations FOR EACH ROW EXECUTE FUNCTION public.enforce_same_org_reference('document_line_items', 'source_document_line_id');


--
-- Name: pp36_obligations pp36_payment_txn_same_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER pp36_payment_txn_same_org BEFORE INSERT OR UPDATE OF pp36_payment_transaction_id, org_id ON public.pp36_obligations FOR EACH ROW EXECUTE FUNCTION public.enforce_same_org_reference('transactions', 'pp36_payment_transaction_id');


--
-- Name: pp36_obligations pp36_period_lock; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER pp36_period_lock BEFORE INSERT OR DELETE OR UPDATE ON public.pp36_obligations FOR EACH ROW EXECUTE FUNCTION public.guard_pp36_obligations_period_lock();


--
-- Name: pp36_obligations pp36_reclaim_filing_line_same_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER pp36_reclaim_filing_line_same_org BEFORE INSERT OR UPDATE OF pp30_reclaim_filing_line_id, org_id ON public.pp36_obligations FOR EACH ROW EXECUTE FUNCTION public.enforce_same_org_reference('vat_filing_lines', 'pp30_reclaim_filing_line_id');


--
-- Name: pp36_obligations pp36_reclaim_filing_same_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER pp36_reclaim_filing_same_org BEFORE INSERT OR UPDATE OF pp30_reclaim_filing_id, org_id ON public.pp36_obligations FOR EACH ROW EXECUTE FUNCTION public.enforce_same_org_reference('vat_filings', 'pp30_reclaim_filing_id');


--
-- Name: pp36_obligations pp36_recon_same_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER pp36_recon_same_org BEFORE INSERT OR UPDATE OF source_reconciliation_match_id, org_id ON public.pp36_obligations FOR EACH ROW EXECUTE FUNCTION public.enforce_same_org_reference('reconciliation_matches', 'source_reconciliation_match_id');


--
-- Name: pp36_obligations pp36_source_payment_txn_same_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER pp36_source_payment_txn_same_org BEFORE INSERT OR UPDATE OF source_payment_transaction_id, org_id ON public.pp36_obligations FOR EACH ROW EXECUTE FUNCTION public.enforce_same_org_reference('transactions', 'source_payment_transaction_id');


--
-- Name: pp36_obligations pp36_vendor_same_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER pp36_vendor_same_org BEFORE INSERT OR UPDATE OF vendor_id, org_id ON public.pp36_obligations FOR EACH ROW EXECUTE FUNCTION public.enforce_same_org_reference('vendors', 'vendor_id');


--
-- Name: reconciliation_matches reconciliation_matches_allocation_limits; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER reconciliation_matches_allocation_limits BEFORE INSERT OR UPDATE OF matched_amount, transaction_id, document_id, payment_id, deleted_at, org_id ON public.reconciliation_matches FOR EACH ROW EXECUTE FUNCTION public.enforce_reconciliation_allocation_limits();


--
-- Name: reconciliation_matches reconciliation_matches_document_same_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER reconciliation_matches_document_same_org BEFORE INSERT OR UPDATE OF document_id, org_id ON public.reconciliation_matches FOR EACH ROW EXECUTE FUNCTION public.enforce_same_org_reference('documents', 'document_id');


--
-- Name: reconciliation_matches reconciliation_matches_payment_same_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER reconciliation_matches_payment_same_org BEFORE INSERT OR UPDATE OF payment_id, org_id ON public.reconciliation_matches FOR EACH ROW EXECUTE FUNCTION public.enforce_same_org_reference('payments', 'payment_id');


--
-- Name: reconciliation_matches reconciliation_matches_transaction_same_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER reconciliation_matches_transaction_same_org BEFORE INSERT OR UPDATE OF transaction_id, org_id ON public.reconciliation_matches FOR EACH ROW EXECUTE FUNCTION public.enforce_same_org_reference('transactions', 'transaction_id');


--
-- Name: reconciliation_matches reconciliation_matches_vat_bound_source; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER reconciliation_matches_vat_bound_source BEFORE DELETE OR UPDATE ON public.reconciliation_matches FOR EACH ROW EXECUTE FUNCTION public.guard_reconciliation_matches_vat_bound_source();


--
-- Name: recurring_payment_patterns recurring_payment_patterns_vendor_same_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER recurring_payment_patterns_vendor_same_org BEFORE INSERT OR UPDATE OF vendor_id, org_id ON public.recurring_payment_patterns FOR EACH ROW EXECUTE FUNCTION public.enforce_same_org_reference('vendors', 'vendor_id');


--
-- Name: extraction_review_outcome review_outcome_correction_session_same_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER review_outcome_correction_session_same_org BEFORE INSERT OR UPDATE OF correction_session_id, org_id ON public.extraction_review_outcome FOR EACH ROW EXECUTE FUNCTION public.enforce_same_org_reference('extraction_correction_sessions', 'correction_session_id');


--
-- Name: tax_payment_events tax_payment_events_append_only; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tax_payment_events_append_only BEFORE DELETE OR UPDATE ON public.tax_payment_events FOR EACH ROW EXECUTE FUNCTION public.guard_tax_payment_events_append_only();


--
-- Name: tax_payment_events tax_payment_events_period_lock; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tax_payment_events_period_lock BEFORE DELETE OR UPDATE ON public.tax_payment_events FOR EACH ROW EXECUTE FUNCTION public.guard_tax_payment_events_period_lock();


--
-- Name: tax_payment_events tax_payment_evidence_document_same_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tax_payment_evidence_document_same_org BEFORE INSERT OR UPDATE OF evidence_document_id, org_id ON public.tax_payment_events FOR EACH ROW EXECUTE FUNCTION public.enforce_same_org_reference('documents', 'evidence_document_id');


--
-- Name: tax_payment_events tax_payment_filing_same_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tax_payment_filing_same_org BEFORE INSERT OR UPDATE OF filing_id, org_id ON public.tax_payment_events FOR EACH ROW EXECUTE FUNCTION public.enforce_same_org_reference('vat_filings', 'filing_id');


--
-- Name: tax_payment_events tax_payment_transaction_same_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tax_payment_transaction_same_org BEFORE INSERT OR UPDATE OF payment_transaction_id, org_id ON public.tax_payment_events FOR EACH ROW EXECUTE FUNCTION public.enforce_same_org_reference('transactions', 'payment_transaction_id');


--
-- Name: tax_treatment_decisions tax_treatment_decisions_vat_bound_source; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tax_treatment_decisions_vat_bound_source BEFORE DELETE OR UPDATE ON public.tax_treatment_decisions FOR EACH ROW EXECUTE FUNCTION public.guard_tax_treatment_decisions_vat_bound_source();


--
-- Name: tax_treatment_decisions tax_treatment_document_same_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tax_treatment_document_same_org BEFORE INSERT OR UPDATE OF source_document_id, org_id ON public.tax_treatment_decisions FOR EACH ROW EXECUTE FUNCTION public.enforce_same_org_reference('documents', 'source_document_id');


--
-- Name: tax_treatment_decisions tax_treatment_line_same_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tax_treatment_line_same_org BEFORE INSERT OR UPDATE OF source_document_line_id, org_id ON public.tax_treatment_decisions FOR EACH ROW EXECUTE FUNCTION public.enforce_same_org_reference('document_line_items', 'source_document_line_id');


--
-- Name: tax_treatment_decisions tax_treatment_payment_same_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tax_treatment_payment_same_org BEFORE INSERT OR UPDATE OF source_payment_id, org_id ON public.tax_treatment_decisions FOR EACH ROW EXECUTE FUNCTION public.enforce_same_org_reference('payments', 'source_payment_id');


--
-- Name: tax_treatment_decisions tax_treatment_recon_same_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tax_treatment_recon_same_org BEFORE INSERT OR UPDATE OF source_reconciliation_match_id, org_id ON public.tax_treatment_decisions FOR EACH ROW EXECUTE FUNCTION public.enforce_same_org_reference('reconciliation_matches', 'source_reconciliation_match_id');


--
-- Name: tax_treatment_decisions tax_treatment_transaction_same_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tax_treatment_transaction_same_org BEFORE INSERT OR UPDATE OF source_transaction_id, org_id ON public.tax_treatment_decisions FOR EACH ROW EXECUTE FUNCTION public.enforce_same_org_reference('transactions', 'source_transaction_id');


--
-- Name: transactions transactions_bank_account_same_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER transactions_bank_account_same_org BEFORE INSERT OR UPDATE OF bank_account_id, org_id ON public.transactions FOR EACH ROW EXECUTE FUNCTION public.enforce_same_org_reference('bank_accounts', 'bank_account_id');


--
-- Name: transactions transactions_statement_same_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER transactions_statement_same_org BEFORE INSERT OR UPDATE OF statement_id, org_id ON public.transactions FOR EACH ROW EXECUTE FUNCTION public.enforce_same_org_reference('bank_statements', 'statement_id');


--
-- Name: transactions transactions_vat_bound_source; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER transactions_vat_bound_source BEFORE DELETE OR UPDATE ON public.transactions FOR EACH ROW EXECUTE FUNCTION public.guard_transactions_vat_bound_source();


--
-- Name: vat_credit_carryforwards vat_credit_applied_filing_same_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER vat_credit_applied_filing_same_org BEFORE INSERT OR UPDATE OF applied_to_pp30_filing_id, org_id ON public.vat_credit_carryforwards FOR EACH ROW EXECUTE FUNCTION public.enforce_same_org_reference('vat_filings', 'applied_to_pp30_filing_id');


--
-- Name: vat_credit_carryforwards vat_credit_period_lock; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER vat_credit_period_lock BEFORE INSERT OR DELETE OR UPDATE ON public.vat_credit_carryforwards FOR EACH ROW EXECUTE FUNCTION public.guard_vat_credit_carryforwards_period_lock();


--
-- Name: vat_credit_carryforwards vat_credit_source_filing_same_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER vat_credit_source_filing_same_org BEFORE INSERT OR UPDATE OF source_pp30_filing_id, org_id ON public.vat_credit_carryforwards FOR EACH ROW EXECUTE FUNCTION public.enforce_same_org_reference('vat_filings', 'source_pp30_filing_id');


--
-- Name: vat_credit_carryforwards vat_credit_source_line_same_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER vat_credit_source_line_same_org BEFORE INSERT OR UPDATE OF source_pp30_filing_line_id, org_id ON public.vat_credit_carryforwards FOR EACH ROW EXECUTE FUNCTION public.enforce_same_org_reference('vat_filing_lines', 'source_pp30_filing_line_id');


--
-- Name: vat_filing_lines vat_filing_lines_filing_same_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER vat_filing_lines_filing_same_org BEFORE INSERT OR UPDATE OF filing_id, org_id ON public.vat_filing_lines FOR EACH ROW EXECUTE FUNCTION public.enforce_same_org_reference('vat_filings', 'filing_id');


--
-- Name: vat_filing_lines vat_filing_lines_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER vat_filing_lines_immutable BEFORE INSERT OR DELETE OR UPDATE ON public.vat_filing_lines FOR EACH ROW EXECUTE FUNCTION public.guard_vat_filing_lines_immutable();


--
-- Name: vat_filing_lines vat_filing_lines_input_same_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER vat_filing_lines_input_same_org BEFORE INSERT OR UPDATE OF vat_input_item_id, org_id ON public.vat_filing_lines FOR EACH ROW EXECUTE FUNCTION public.enforce_same_org_reference('vat_input_items', 'vat_input_item_id');


--
-- Name: vat_filing_lines vat_filing_lines_output_same_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER vat_filing_lines_output_same_org BEFORE INSERT OR UPDATE OF vat_output_item_id, org_id ON public.vat_filing_lines FOR EACH ROW EXECUTE FUNCTION public.enforce_same_org_reference('vat_output_items', 'vat_output_item_id');


--
-- Name: vat_filing_lines vat_filing_lines_period_lock; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER vat_filing_lines_period_lock BEFORE INSERT OR DELETE OR UPDATE ON public.vat_filing_lines FOR EACH ROW EXECUTE FUNCTION public.guard_vat_filing_lines_period_lock();


--
-- Name: vat_filing_lines vat_filing_lines_pp36_same_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER vat_filing_lines_pp36_same_org BEFORE INSERT OR UPDATE OF pp36_obligation_id, org_id ON public.vat_filing_lines FOR EACH ROW EXECUTE FUNCTION public.enforce_same_org_reference('pp36_obligations', 'pp36_obligation_id');


--
-- Name: vat_filings vat_filings_amendment_chain; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER vat_filings_amendment_chain BEFORE INSERT OR UPDATE OF amends_filing_id, filing_type, period_year, period_month, establishment_id, filing_kind ON public.vat_filings FOR EACH ROW EXECUTE FUNCTION public.guard_vat_filings_amendment_chain();


--
-- Name: vat_filings vat_filings_amends_same_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER vat_filings_amends_same_org BEFORE INSERT OR UPDATE OF amends_filing_id, org_id ON public.vat_filings FOR EACH ROW EXECUTE FUNCTION public.enforce_same_org_reference('vat_filings', 'amends_filing_id');


--
-- Name: vat_filings vat_filings_immutable_status; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER vat_filings_immutable_status BEFORE DELETE OR UPDATE ON public.vat_filings FOR EACH ROW EXECUTE FUNCTION public.guard_vat_filings_immutable_status();


--
-- Name: vat_filings vat_filings_payment_txn_same_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER vat_filings_payment_txn_same_org BEFORE INSERT OR UPDATE OF payment_transaction_id, org_id ON public.vat_filings FOR EACH ROW EXECUTE FUNCTION public.enforce_same_org_reference('transactions', 'payment_transaction_id');


--
-- Name: vat_filings vat_filings_period_lock; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER vat_filings_period_lock BEFORE INSERT OR DELETE OR UPDATE OF establishment_id, filing_type, period_year, period_month, filing_kind, version, output_vat_total, input_vat_total, pp36_vat_total, pp36_reclaim_total, carryforward_in, carryforward_out, net_payable, deleted_at ON public.vat_filings FOR EACH ROW EXECUTE FUNCTION public.guard_vat_filings_period_lock();


--
-- Name: vat_input_items vat_input_decision_same_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER vat_input_decision_same_org BEFORE INSERT OR UPDATE OF tax_treatment_decision_id, org_id ON public.vat_input_items FOR EACH ROW EXECUTE FUNCTION public.enforce_same_org_reference('tax_treatment_decisions', 'tax_treatment_decision_id');


--
-- Name: vat_input_items vat_input_document_same_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER vat_input_document_same_org BEFORE INSERT OR UPDATE OF source_document_id, org_id ON public.vat_input_items FOR EACH ROW EXECUTE FUNCTION public.enforce_same_org_reference('documents', 'source_document_id');


--
-- Name: vat_input_items vat_input_draft_filing_same_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER vat_input_draft_filing_same_org BEFORE INSERT OR UPDATE OF draft_filing_id, org_id ON public.vat_input_items FOR EACH ROW EXECUTE FUNCTION public.enforce_same_org_reference('vat_filings', 'draft_filing_id');


--
-- Name: vat_input_items vat_input_filed_line_same_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER vat_input_filed_line_same_org BEFORE INSERT OR UPDATE OF filed_filing_line_id, org_id ON public.vat_input_items FOR EACH ROW EXECUTE FUNCTION public.enforce_same_org_reference('vat_filing_lines', 'filed_filing_line_id');


--
-- Name: vat_input_items vat_input_items_allocated_frozen; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER vat_input_items_allocated_frozen BEFORE UPDATE ON public.vat_input_items FOR EACH ROW EXECUTE FUNCTION public.guard_vat_input_items_allocated_frozen();


--
-- Name: vat_input_items vat_input_line_same_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER vat_input_line_same_org BEFORE INSERT OR UPDATE OF source_document_line_id, org_id ON public.vat_input_items FOR EACH ROW EXECUTE FUNCTION public.enforce_same_org_reference('document_line_items', 'source_document_line_id');


--
-- Name: vat_input_items vat_input_period_lock; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER vat_input_period_lock BEFORE INSERT OR DELETE OR UPDATE ON public.vat_input_items FOR EACH ROW EXECUTE FUNCTION public.guard_vat_input_items_period_lock();


--
-- Name: vat_input_items vat_input_recon_same_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER vat_input_recon_same_org BEFORE INSERT OR UPDATE OF source_reconciliation_match_id, org_id ON public.vat_input_items FOR EACH ROW EXECUTE FUNCTION public.enforce_same_org_reference('reconciliation_matches', 'source_reconciliation_match_id');


--
-- Name: vat_input_items vat_input_transaction_same_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER vat_input_transaction_same_org BEFORE INSERT OR UPDATE OF source_transaction_id, org_id ON public.vat_input_items FOR EACH ROW EXECUTE FUNCTION public.enforce_same_org_reference('transactions', 'source_transaction_id');


--
-- Name: vat_input_items vat_input_vendor_same_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER vat_input_vendor_same_org BEFORE INSERT OR UPDATE OF vendor_id, org_id ON public.vat_input_items FOR EACH ROW EXECUTE FUNCTION public.enforce_same_org_reference('vendors', 'vendor_id');


--
-- Name: vat_output_items vat_output_customer_same_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER vat_output_customer_same_org BEFORE INSERT OR UPDATE OF customer_id, org_id ON public.vat_output_items FOR EACH ROW EXECUTE FUNCTION public.enforce_same_org_reference('vendors', 'customer_id');


--
-- Name: vat_output_items vat_output_decision_same_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER vat_output_decision_same_org BEFORE INSERT OR UPDATE OF tax_treatment_decision_id, org_id ON public.vat_output_items FOR EACH ROW EXECUTE FUNCTION public.enforce_same_org_reference('tax_treatment_decisions', 'tax_treatment_decision_id');


--
-- Name: vat_output_items vat_output_document_same_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER vat_output_document_same_org BEFORE INSERT OR UPDATE OF source_document_id, org_id ON public.vat_output_items FOR EACH ROW EXECUTE FUNCTION public.enforce_same_org_reference('documents', 'source_document_id');


--
-- Name: vat_output_items vat_output_line_same_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER vat_output_line_same_org BEFORE INSERT OR UPDATE OF source_document_line_id, org_id ON public.vat_output_items FOR EACH ROW EXECUTE FUNCTION public.enforce_same_org_reference('document_line_items', 'source_document_line_id');


--
-- Name: vat_output_items vat_output_period_lock; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER vat_output_period_lock BEFORE INSERT OR DELETE OR UPDATE ON public.vat_output_items FOR EACH ROW EXECUTE FUNCTION public.guard_vat_output_items_period_lock();


--
-- Name: vat_output_items vat_output_transaction_same_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER vat_output_transaction_same_org BEFORE INSERT OR UPDATE OF source_transaction_id, org_id ON public.vat_output_items FOR EACH ROW EXECUTE FUNCTION public.enforce_same_org_reference('transactions', 'source_transaction_id');


--
-- Name: vendor_bank_aliases vendor_bank_aliases_vendor_same_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER vendor_bank_aliases_vendor_same_org BEFORE INSERT OR UPDATE OF vendor_id, org_id ON public.vendor_bank_aliases FOR EACH ROW EXECUTE FUNCTION public.enforce_same_org_reference('vendors', 'vendor_id');


--
-- Name: vendor_tier vendor_tier_org_scope_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER vendor_tier_org_scope_guard BEFORE INSERT OR UPDATE OF vendor_id, org_id, scope_kind ON public.vendor_tier FOR EACH ROW EXECUTE FUNCTION public.enforce_vendor_tier_org_scope();


--
-- Name: wht_certificate_items wht_certificate_items_certificate_same_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER wht_certificate_items_certificate_same_org BEFORE INSERT OR UPDATE OF certificate_id, org_id ON public.wht_certificate_items FOR EACH ROW EXECUTE FUNCTION public.enforce_same_org_reference('wht_certificates', 'certificate_id');


--
-- Name: wht_certificate_items wht_certificate_items_document_same_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER wht_certificate_items_document_same_org BEFORE INSERT OR UPDATE OF document_id, org_id ON public.wht_certificate_items FOR EACH ROW EXECUTE FUNCTION public.enforce_same_org_reference('documents', 'document_id');


--
-- Name: wht_certificate_items wht_certificate_items_line_item_same_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER wht_certificate_items_line_item_same_org BEFORE INSERT OR UPDATE OF line_item_id, org_id ON public.wht_certificate_items FOR EACH ROW EXECUTE FUNCTION public.enforce_same_org_reference('document_line_items', 'line_item_id');


--
-- Name: wht_certificates wht_certificate_snapshot_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER wht_certificate_snapshot_immutable BEFORE UPDATE ON public.wht_certificates FOR EACH ROW EXECUTE FUNCTION public.prevent_wht_certificate_snapshot_update();


--
-- Name: wht_certificates wht_certificates_filing_same_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER wht_certificates_filing_same_org BEFORE INSERT OR UPDATE OF filing_id, org_id ON public.wht_certificates FOR EACH ROW EXECUTE FUNCTION public.enforce_same_org_reference('wht_monthly_filings', 'filing_id');


--
-- Name: wht_certificates wht_certificates_period_lock; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER wht_certificates_period_lock BEFORE INSERT OR DELETE OR UPDATE ON public.wht_certificates FOR EACH ROW EXECUTE FUNCTION public.guard_wht_certificates_period_lock();


--
-- Name: wht_certificates wht_certificates_replacement_same_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER wht_certificates_replacement_same_org BEFORE INSERT OR UPDATE OF replacement_cert_id, org_id ON public.wht_certificates FOR EACH ROW EXECUTE FUNCTION public.enforce_same_org_reference('wht_certificates', 'replacement_cert_id');


--
-- Name: wht_certificates wht_certificates_vendor_same_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER wht_certificates_vendor_same_org BEFORE INSERT OR UPDATE OF payee_vendor_id, org_id ON public.wht_certificates FOR EACH ROW EXECUTE FUNCTION public.enforce_same_org_reference('vendors', 'payee_vendor_id');


--
-- Name: wht_credits_received wht_credits_received_customer_same_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER wht_credits_received_customer_same_org BEFORE INSERT OR UPDATE OF customer_vendor_id, org_id ON public.wht_credits_received FOR EACH ROW EXECUTE FUNCTION public.enforce_same_org_reference('vendors', 'customer_vendor_id');


--
-- Name: wht_credits_received wht_credits_received_document_same_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER wht_credits_received_document_same_org BEFORE INSERT OR UPDATE OF certificate_received_document_id, org_id ON public.wht_credits_received FOR EACH ROW EXECUTE FUNCTION public.enforce_same_org_reference('documents', 'certificate_received_document_id');


--
-- Name: wht_monthly_filings wht_monthly_filings_period_lock; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER wht_monthly_filings_period_lock BEFORE INSERT OR DELETE OR UPDATE ON public.wht_monthly_filings FOR EACH ROW EXECUTE FUNCTION public.guard_wht_monthly_filings_period_lock();


--
-- Name: ai_batch_runs ai_batch_runs_org_id_organizations_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_batch_runs
    ADD CONSTRAINT ai_batch_runs_org_id_organizations_id_fk FOREIGN KEY (org_id) REFERENCES public.organizations(id);


--
-- Name: ai_batch_runs ai_batch_runs_triggered_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_batch_runs
    ADD CONSTRAINT ai_batch_runs_triggered_by_users_id_fk FOREIGN KEY (triggered_by) REFERENCES public.users(id);


--
-- Name: ai_match_suggestions ai_match_suggestions_document_id_documents_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_match_suggestions
    ADD CONSTRAINT ai_match_suggestions_document_id_documents_id_fk FOREIGN KEY (document_id) REFERENCES public.documents(id);


--
-- Name: ai_match_suggestions ai_match_suggestions_org_id_organizations_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_match_suggestions
    ADD CONSTRAINT ai_match_suggestions_org_id_organizations_id_fk FOREIGN KEY (org_id) REFERENCES public.organizations(id);


--
-- Name: ai_match_suggestions ai_match_suggestions_payment_id_payments_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_match_suggestions
    ADD CONSTRAINT ai_match_suggestions_payment_id_payments_id_fk FOREIGN KEY (payment_id) REFERENCES public.payments(id);


--
-- Name: ai_match_suggestions ai_match_suggestions_reviewed_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_match_suggestions
    ADD CONSTRAINT ai_match_suggestions_reviewed_by_users_id_fk FOREIGN KEY (reviewed_by) REFERENCES public.users(id);


--
-- Name: ai_match_suggestions ai_match_suggestions_transaction_id_transactions_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_match_suggestions
    ADD CONSTRAINT ai_match_suggestions_transaction_id_transactions_id_fk FOREIGN KEY (transaction_id) REFERENCES public.transactions(id);


--
-- Name: allocation_rule_targets allocation_rule_targets_allocation_rule_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.allocation_rule_targets
    ADD CONSTRAINT allocation_rule_targets_allocation_rule_id_fkey FOREIGN KEY (allocation_rule_id) REFERENCES public.allocation_rules(id);


--
-- Name: allocation_rule_targets allocation_rule_targets_cost_center_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.allocation_rule_targets
    ADD CONSTRAINT allocation_rule_targets_cost_center_id_fkey FOREIGN KEY (cost_center_id) REFERENCES public.cost_centers(id);


--
-- Name: allocation_rule_targets allocation_rule_targets_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.allocation_rule_targets
    ADD CONSTRAINT allocation_rule_targets_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id);


--
-- Name: allocation_rule_targets allocation_rule_targets_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.allocation_rule_targets
    ADD CONSTRAINT allocation_rule_targets_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id);


--
-- Name: allocation_rules allocation_rules_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.allocation_rules
    ADD CONSTRAINT allocation_rules_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id);


--
-- Name: audit_log audit_log_actor_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.audit_log
    ADD CONSTRAINT audit_log_actor_id_users_id_fk FOREIGN KEY (actor_id) REFERENCES public.users(id);


--
-- Name: audit_log_old audit_log_actor_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log_old
    ADD CONSTRAINT audit_log_actor_id_users_id_fk FOREIGN KEY (actor_id) REFERENCES public.users(id);


--
-- Name: audit_log audit_log_org_id_organizations_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.audit_log
    ADD CONSTRAINT audit_log_org_id_organizations_id_fk FOREIGN KEY (org_id) REFERENCES public.organizations(id);


--
-- Name: audit_log_old audit_log_org_id_organizations_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log_old
    ADD CONSTRAINT audit_log_org_id_organizations_id_fk FOREIGN KEY (org_id) REFERENCES public.organizations(id);


--
-- Name: bank_accounts bank_accounts_org_id_organizations_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_accounts
    ADD CONSTRAINT bank_accounts_org_id_organizations_id_fk FOREIGN KEY (org_id) REFERENCES public.organizations(id);


--
-- Name: bank_statements bank_statements_bank_account_id_bank_accounts_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_statements
    ADD CONSTRAINT bank_statements_bank_account_id_bank_accounts_id_fk FOREIGN KEY (bank_account_id) REFERENCES public.bank_accounts(id);


--
-- Name: bank_statements bank_statements_org_id_organizations_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_statements
    ADD CONSTRAINT bank_statements_org_id_organizations_id_fk FOREIGN KEY (org_id) REFERENCES public.organizations(id);


--
-- Name: book_tax_adjustments book_tax_adjustments_gl_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.book_tax_adjustments
    ADD CONSTRAINT book_tax_adjustments_gl_account_id_fkey FOREIGN KEY (gl_account_id) REFERENCES public.gl_accounts(id);


--
-- Name: book_tax_adjustments book_tax_adjustments_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.book_tax_adjustments
    ADD CONSTRAINT book_tax_adjustments_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id);


--
-- Name: cash_deposits cash_deposits_bank_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cash_deposits
    ADD CONSTRAINT cash_deposits_bank_account_id_fkey FOREIGN KEY (bank_account_id) REFERENCES public.bank_accounts(id);


--
-- Name: cash_deposits cash_deposits_bank_transaction_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cash_deposits
    ADD CONSTRAINT cash_deposits_bank_transaction_id_fkey FOREIGN KEY (bank_transaction_id) REFERENCES public.transactions(id);


--
-- Name: cash_deposits cash_deposits_deposit_slip_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cash_deposits
    ADD CONSTRAINT cash_deposits_deposit_slip_document_id_fkey FOREIGN KEY (deposit_slip_document_id) REFERENCES public.documents(id);


--
-- Name: cash_deposits cash_deposits_establishment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cash_deposits
    ADD CONSTRAINT cash_deposits_establishment_id_fkey FOREIGN KEY (establishment_id) REFERENCES public.establishments(id);


--
-- Name: cash_deposits cash_deposits_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cash_deposits
    ADD CONSTRAINT cash_deposits_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id);


--
-- Name: cit_filings cit_filings_bank_transaction_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cit_filings
    ADD CONSTRAINT cit_filings_bank_transaction_id_fkey FOREIGN KEY (bank_transaction_id) REFERENCES public.transactions(id);


--
-- Name: cit_filings cit_filings_confirmation_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cit_filings
    ADD CONSTRAINT cit_filings_confirmation_document_id_fkey FOREIGN KEY (confirmation_document_id) REFERENCES public.documents(id);


--
-- Name: cit_filings cit_filings_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cit_filings
    ADD CONSTRAINT cit_filings_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id);


--
-- Name: cit_filings cit_filings_working_paper_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cit_filings
    ADD CONSTRAINT cit_filings_working_paper_document_id_fkey FOREIGN KEY (working_paper_document_id) REFERENCES public.documents(id);


--
-- Name: close_checklist_items close_checklist_items_checklist_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.close_checklist_items
    ADD CONSTRAINT close_checklist_items_checklist_id_fkey FOREIGN KEY (checklist_id) REFERENCES public.close_checklists(id);


--
-- Name: close_checklist_items close_checklist_items_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.close_checklist_items
    ADD CONSTRAINT close_checklist_items_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id);


--
-- Name: close_checklists close_checklists_establishment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.close_checklists
    ADD CONSTRAINT close_checklists_establishment_id_fkey FOREIGN KEY (establishment_id) REFERENCES public.establishments(id);


--
-- Name: close_checklists close_checklists_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.close_checklists
    ADD CONSTRAINT close_checklists_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id);


--
-- Name: copilot_messages copilot_messages_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.copilot_messages
    ADD CONSTRAINT copilot_messages_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id);


--
-- Name: copilot_messages copilot_messages_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.copilot_messages
    ADD CONSTRAINT copilot_messages_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.copilot_sessions(id);


--
-- Name: copilot_sessions copilot_sessions_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.copilot_sessions
    ADD CONSTRAINT copilot_sessions_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id);


--
-- Name: copilot_tool_events copilot_tool_events_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.copilot_tool_events
    ADD CONSTRAINT copilot_tool_events_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id);


--
-- Name: copilot_tool_events copilot_tool_events_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.copilot_tool_events
    ADD CONSTRAINT copilot_tool_events_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.copilot_sessions(id);


--
-- Name: cost_centers cost_centers_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cost_centers
    ADD CONSTRAINT cost_centers_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id);


--
-- Name: cost_centers cost_centers_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cost_centers
    ADD CONSTRAINT cost_centers_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.cost_centers(id);


--
-- Name: depreciation_schedule depreciation_schedule_fixed_asset_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.depreciation_schedule
    ADD CONSTRAINT depreciation_schedule_fixed_asset_id_fkey FOREIGN KEY (fixed_asset_id) REFERENCES public.fixed_assets(id);


--
-- Name: depreciation_schedule depreciation_schedule_journal_entry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.depreciation_schedule
    ADD CONSTRAINT depreciation_schedule_journal_entry_id_fkey FOREIGN KEY (journal_entry_id) REFERENCES public.journal_entries(id);


--
-- Name: depreciation_schedule depreciation_schedule_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.depreciation_schedule
    ADD CONSTRAINT depreciation_schedule_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id);


--
-- Name: document_files document_files_document_id_documents_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_files
    ADD CONSTRAINT document_files_document_id_documents_id_fk FOREIGN KEY (document_id) REFERENCES public.documents(id);


--
-- Name: document_files document_files_org_id_organizations_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_files
    ADD CONSTRAINT document_files_org_id_organizations_id_fk FOREIGN KEY (org_id) REFERENCES public.organizations(id);


--
-- Name: document_line_items document_line_items_document_id_documents_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_line_items
    ADD CONSTRAINT document_line_items_document_id_documents_id_fk FOREIGN KEY (document_id) REFERENCES public.documents(id);


--
-- Name: document_line_items document_line_items_org_id_organizations_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_line_items
    ADD CONSTRAINT document_line_items_org_id_organizations_id_fk FOREIGN KEY (org_id) REFERENCES public.organizations(id);


--
-- Name: documents documents_created_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_created_by_users_id_fk FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: documents documents_org_id_organizations_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_org_id_organizations_id_fk FOREIGN KEY (org_id) REFERENCES public.organizations(id);


--
-- Name: documents documents_related_document_id_documents_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_related_document_id_documents_id_fk FOREIGN KEY (related_document_id) REFERENCES public.documents(id);


--
-- Name: documents documents_vat_establishment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_vat_establishment_id_fkey FOREIGN KEY (vat_establishment_id) REFERENCES public.establishments(id);


--
-- Name: documents documents_vendor_id_vendors_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_vendor_id_vendors_id_fk FOREIGN KEY (vendor_id) REFERENCES public.vendors(id);


--
-- Name: employee_allowances employee_allowances_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_allowances
    ADD CONSTRAINT employee_allowances_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id);


--
-- Name: employee_allowances employee_allowances_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_allowances
    ADD CONSTRAINT employee_allowances_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id);


--
-- Name: employees employees_establishment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_establishment_id_fkey FOREIGN KEY (establishment_id) REFERENCES public.establishments(id);


--
-- Name: employees employees_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id);


--
-- Name: employees employees_prior_employer_ynot_certificate_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_prior_employer_ynot_certificate_document_id_fkey FOREIGN KEY (prior_employer_ynot_certificate_document_id) REFERENCES public.documents(id);


--
-- Name: establishments establishments_consolidated_under_branch_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.establishments
    ADD CONSTRAINT establishments_consolidated_under_branch_id_fk FOREIGN KEY (consolidated_under_branch_id) REFERENCES public.establishments(id);


--
-- Name: establishments establishments_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.establishments
    ADD CONSTRAINT establishments_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id);


--
-- Name: exception_queue exception_queue_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exception_queue
    ADD CONSTRAINT exception_queue_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id);


--
-- Name: extraction_compiled_patterns extraction_compiled_patterns_org_id_organizations_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extraction_compiled_patterns
    ADD CONSTRAINT extraction_compiled_patterns_org_id_organizations_id_fk FOREIGN KEY (org_id) REFERENCES public.organizations(id);


--
-- Name: extraction_correction_sessions extraction_correction_sessions_document_id_documents_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extraction_correction_sessions
    ADD CONSTRAINT extraction_correction_sessions_document_id_documents_id_fk FOREIGN KEY (document_id) REFERENCES public.documents(id);


--
-- Name: extraction_correction_sessions extraction_correction_sessions_extraction_log_id_extraction_log; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extraction_correction_sessions
    ADD CONSTRAINT extraction_correction_sessions_extraction_log_id_extraction_log FOREIGN KEY (extraction_log_id) REFERENCES public.extraction_log(id);


--
-- Name: extraction_correction_sessions extraction_correction_sessions_org_id_organizations_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extraction_correction_sessions
    ADD CONSTRAINT extraction_correction_sessions_org_id_organizations_id_fk FOREIGN KEY (org_id) REFERENCES public.organizations(id);


--
-- Name: extraction_exemplars extraction_exemplars_correction_session_id_extraction_correctio; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extraction_exemplars
    ADD CONSTRAINT extraction_exemplars_correction_session_id_extraction_correctio FOREIGN KEY (correction_session_id) REFERENCES public.extraction_correction_sessions(id);


--
-- Name: extraction_exemplars extraction_exemplars_document_id_documents_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extraction_exemplars
    ADD CONSTRAINT extraction_exemplars_document_id_documents_id_fk FOREIGN KEY (document_id) REFERENCES public.documents(id);


--
-- Name: extraction_exemplars extraction_exemplars_org_id_organizations_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extraction_exemplars
    ADD CONSTRAINT extraction_exemplars_org_id_organizations_id_fk FOREIGN KEY (org_id) REFERENCES public.organizations(id);


--
-- Name: extraction_exemplars extraction_exemplars_vendor_id_vendors_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extraction_exemplars
    ADD CONSTRAINT extraction_exemplars_vendor_id_vendors_id_fk FOREIGN KEY (vendor_id) REFERENCES public.vendors(id);


--
-- Name: extraction_learning_candidates extraction_learning_candidates_correction_session_id_extraction; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extraction_learning_candidates
    ADD CONSTRAINT extraction_learning_candidates_correction_session_id_extraction FOREIGN KEY (correction_session_id) REFERENCES public.extraction_correction_sessions(id);


--
-- Name: extraction_learning_candidates extraction_learning_candidates_document_id_documents_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extraction_learning_candidates
    ADD CONSTRAINT extraction_learning_candidates_document_id_documents_id_fk FOREIGN KEY (document_id) REFERENCES public.documents(id);


--
-- Name: extraction_learning_candidates extraction_learning_candidates_org_id_organizations_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extraction_learning_candidates
    ADD CONSTRAINT extraction_learning_candidates_org_id_organizations_id_fk FOREIGN KEY (org_id) REFERENCES public.organizations(id);


--
-- Name: extraction_learning_candidates extraction_learning_candidates_vendor_id_vendors_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extraction_learning_candidates
    ADD CONSTRAINT extraction_learning_candidates_vendor_id_vendors_id_fk FOREIGN KEY (vendor_id) REFERENCES public.vendors(id);


--
-- Name: extraction_log extraction_log_document_id_documents_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extraction_log
    ADD CONSTRAINT extraction_log_document_id_documents_id_fk FOREIGN KEY (document_id) REFERENCES public.documents(id);


--
-- Name: extraction_log extraction_log_org_id_organizations_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extraction_log
    ADD CONSTRAINT extraction_log_org_id_organizations_id_fk FOREIGN KEY (org_id) REFERENCES public.organizations(id);


--
-- Name: extraction_log extraction_log_vendor_id_vendors_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extraction_log
    ADD CONSTRAINT extraction_log_vendor_id_vendors_id_fk FOREIGN KEY (vendor_id) REFERENCES public.vendors(id);


--
-- Name: extraction_review_outcome extraction_review_outcome_correction_session_id_extraction_corr; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extraction_review_outcome
    ADD CONSTRAINT extraction_review_outcome_correction_session_id_extraction_corr FOREIGN KEY (correction_session_id) REFERENCES public.extraction_correction_sessions(id);


--
-- Name: extraction_review_outcome extraction_review_outcome_document_id_documents_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extraction_review_outcome
    ADD CONSTRAINT extraction_review_outcome_document_id_documents_id_fk FOREIGN KEY (document_id) REFERENCES public.documents(id);


--
-- Name: extraction_review_outcome extraction_review_outcome_extraction_log_id_extraction_log_id_f; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extraction_review_outcome
    ADD CONSTRAINT extraction_review_outcome_extraction_log_id_extraction_log_id_f FOREIGN KEY (extraction_log_id) REFERENCES public.extraction_log(id);


--
-- Name: extraction_review_outcome extraction_review_outcome_org_id_organizations_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extraction_review_outcome
    ADD CONSTRAINT extraction_review_outcome_org_id_organizations_id_fk FOREIGN KEY (org_id) REFERENCES public.organizations(id);


--
-- Name: fixed_asset_depreciation_periods fixed_asset_depreciation_periods_journal_entry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fixed_asset_depreciation_periods
    ADD CONSTRAINT fixed_asset_depreciation_periods_journal_entry_id_fkey FOREIGN KEY (journal_entry_id) REFERENCES public.journal_entries(id);


--
-- Name: fixed_asset_depreciation_periods fixed_asset_depreciation_periods_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fixed_asset_depreciation_periods
    ADD CONSTRAINT fixed_asset_depreciation_periods_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id);


--
-- Name: fixed_asset_depreciation_periods fixed_asset_depreciation_periods_posting_outbox_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fixed_asset_depreciation_periods
    ADD CONSTRAINT fixed_asset_depreciation_periods_posting_outbox_id_fkey FOREIGN KEY (posting_outbox_id) REFERENCES public.posting_outbox(id);


--
-- Name: fixed_assets fixed_assets_accumulated_depreciation_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fixed_assets
    ADD CONSTRAINT fixed_assets_accumulated_depreciation_account_id_fkey FOREIGN KEY (accumulated_depreciation_account_id) REFERENCES public.gl_accounts(id);


--
-- Name: fixed_assets fixed_assets_acquisition_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fixed_assets
    ADD CONSTRAINT fixed_assets_acquisition_document_id_fkey FOREIGN KEY (acquisition_document_id) REFERENCES public.documents(id);


--
-- Name: fixed_assets fixed_assets_assigned_to_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fixed_assets
    ADD CONSTRAINT fixed_assets_assigned_to_employee_id_fkey FOREIGN KEY (assigned_to_employee_id) REFERENCES public.employees(id);


--
-- Name: fixed_assets fixed_assets_depreciation_expense_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fixed_assets
    ADD CONSTRAINT fixed_assets_depreciation_expense_account_id_fkey FOREIGN KEY (depreciation_expense_account_id) REFERENCES public.gl_accounts(id);


--
-- Name: fixed_assets fixed_assets_disposal_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fixed_assets
    ADD CONSTRAINT fixed_assets_disposal_document_id_fkey FOREIGN KEY (disposal_document_id) REFERENCES public.documents(id);


--
-- Name: fixed_assets fixed_assets_establishment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fixed_assets
    ADD CONSTRAINT fixed_assets_establishment_id_fkey FOREIGN KEY (establishment_id) REFERENCES public.establishments(id);


--
-- Name: fixed_assets fixed_assets_gl_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fixed_assets
    ADD CONSTRAINT fixed_assets_gl_account_id_fkey FOREIGN KEY (gl_account_id) REFERENCES public.gl_accounts(id);


--
-- Name: fixed_assets fixed_assets_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fixed_assets
    ADD CONSTRAINT fixed_assets_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id);


--
-- Name: fx_valuation_layers fx_valuation_layers_journal_entry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fx_valuation_layers
    ADD CONSTRAINT fx_valuation_layers_journal_entry_id_fkey FOREIGN KEY (journal_entry_id) REFERENCES public.journal_entries(id);


--
-- Name: fx_valuation_layers fx_valuation_layers_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fx_valuation_layers
    ADD CONSTRAINT fx_valuation_layers_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id);


--
-- Name: fx_valuation_layers fx_valuation_layers_prior_valuation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fx_valuation_layers
    ADD CONSTRAINT fx_valuation_layers_prior_valuation_id_fkey FOREIGN KEY (prior_valuation_id) REFERENCES public.fx_valuation_layers(id);


--
-- Name: gl_accounts gl_accounts_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gl_accounts
    ADD CONSTRAINT gl_accounts_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id);


--
-- Name: gl_accounts gl_accounts_parent_account_id_gl_accounts_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gl_accounts
    ADD CONSTRAINT gl_accounts_parent_account_id_gl_accounts_id_fk FOREIGN KEY (parent_account_id) REFERENCES public.gl_accounts(id);


--
-- Name: gl_accounts gl_accounts_tenant_added_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gl_accounts
    ADD CONSTRAINT gl_accounts_tenant_added_by_fkey FOREIGN KEY (tenant_added_by) REFERENCES public.users(id);


--
-- Name: gl_opening_balances gl_opening_balances_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gl_opening_balances
    ADD CONSTRAINT gl_opening_balances_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.gl_accounts(id);


--
-- Name: gl_opening_balances gl_opening_balances_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gl_opening_balances
    ADD CONSTRAINT gl_opening_balances_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id);


--
-- Name: global_exemplar_pool global_exemplar_pool_consensus_id_exemplar_consensus_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.global_exemplar_pool
    ADD CONSTRAINT global_exemplar_pool_consensus_id_exemplar_consensus_id_fk FOREIGN KEY (consensus_id) REFERENCES public.exemplar_consensus(id);


--
-- Name: import_charge_lines import_charge_lines_expense_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.import_charge_lines
    ADD CONSTRAINT import_charge_lines_expense_account_id_fkey FOREIGN KEY (expense_account_id) REFERENCES public.gl_accounts(id);


--
-- Name: import_charge_lines import_charge_lines_import_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.import_charge_lines
    ADD CONSTRAINT import_charge_lines_import_id_fkey FOREIGN KEY (import_id) REFERENCES public.imports(id);


--
-- Name: import_charge_lines import_charge_lines_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.import_charge_lines
    ADD CONSTRAINT import_charge_lines_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id);


--
-- Name: import_charge_lines import_charge_lines_source_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.import_charge_lines
    ADD CONSTRAINT import_charge_lines_source_document_id_fkey FOREIGN KEY (source_document_id) REFERENCES public.documents(id);


--
-- Name: import_documents import_documents_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.import_documents
    ADD CONSTRAINT import_documents_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.documents(id);


--
-- Name: import_documents import_documents_import_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.import_documents
    ADD CONSTRAINT import_documents_import_id_fkey FOREIGN KEY (import_id) REFERENCES public.imports(id);


--
-- Name: import_documents import_documents_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.import_documents
    ADD CONSTRAINT import_documents_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id);


--
-- Name: import_goods_lines import_goods_lines_import_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.import_goods_lines
    ADD CONSTRAINT import_goods_lines_import_id_fkey FOREIGN KEY (import_id) REFERENCES public.imports(id);


--
-- Name: import_goods_lines import_goods_lines_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.import_goods_lines
    ADD CONSTRAINT import_goods_lines_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id);


--
-- Name: import_payments import_payments_bank_transaction_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.import_payments
    ADD CONSTRAINT import_payments_bank_transaction_id_fkey FOREIGN KEY (bank_transaction_id) REFERENCES public.transactions(id);


--
-- Name: import_payments import_payments_import_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.import_payments
    ADD CONSTRAINT import_payments_import_id_fkey FOREIGN KEY (import_id) REFERENCES public.imports(id);


--
-- Name: import_payments import_payments_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.import_payments
    ADD CONSTRAINT import_payments_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id);


--
-- Name: imports imports_establishment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.imports
    ADD CONSTRAINT imports_establishment_id_fkey FOREIGN KEY (establishment_id) REFERENCES public.establishments(id);


--
-- Name: imports imports_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.imports
    ADD CONSTRAINT imports_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id);


--
-- Name: imports imports_supplier_vendor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.imports
    ADD CONSTRAINT imports_supplier_vendor_id_fkey FOREIGN KEY (supplier_vendor_id) REFERENCES public.vendors(id);


--
-- Name: inventory_count_items inventory_count_items_count_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_count_items
    ADD CONSTRAINT inventory_count_items_count_id_fkey FOREIGN KEY (count_id) REFERENCES public.inventory_counts(id);


--
-- Name: inventory_count_items inventory_count_items_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_count_items
    ADD CONSTRAINT inventory_count_items_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id);


--
-- Name: inventory_count_items inventory_count_items_sku_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_count_items
    ADD CONSTRAINT inventory_count_items_sku_id_fkey FOREIGN KEY (sku_id) REFERENCES public.skus(id);


--
-- Name: inventory_counts inventory_counts_establishment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_counts
    ADD CONSTRAINT inventory_counts_establishment_id_fkey FOREIGN KEY (establishment_id) REFERENCES public.establishments(id);


--
-- Name: inventory_counts inventory_counts_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_counts
    ADD CONSTRAINT inventory_counts_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id);


--
-- Name: inventory_movements inventory_movements_establishment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_movements
    ADD CONSTRAINT inventory_movements_establishment_id_fkey FOREIGN KEY (establishment_id) REFERENCES public.establishments(id);


--
-- Name: inventory_movements inventory_movements_journal_entry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_movements
    ADD CONSTRAINT inventory_movements_journal_entry_id_fkey FOREIGN KEY (journal_entry_id) REFERENCES public.journal_entries(id);


--
-- Name: inventory_movements inventory_movements_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_movements
    ADD CONSTRAINT inventory_movements_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id);


--
-- Name: inventory_movements inventory_movements_sku_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_movements
    ADD CONSTRAINT inventory_movements_sku_id_fkey FOREIGN KEY (sku_id) REFERENCES public.skus(id);


--
-- Name: inventory_statutory_overhead_components inventory_statutory_overhead_compone_import_charge_line_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_statutory_overhead_components
    ADD CONSTRAINT inventory_statutory_overhead_compone_import_charge_line_id_fkey FOREIGN KEY (import_charge_line_id) REFERENCES public.import_charge_lines(id);


--
-- Name: inventory_statutory_overhead_components inventory_statutory_overhead_componen_import_goods_line_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_statutory_overhead_components
    ADD CONSTRAINT inventory_statutory_overhead_componen_import_goods_line_id_fkey FOREIGN KEY (import_goods_line_id) REFERENCES public.import_goods_lines(id);


--
-- Name: inventory_statutory_overhead_components inventory_statutory_overhead_components_import_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_statutory_overhead_components
    ADD CONSTRAINT inventory_statutory_overhead_components_import_id_fkey FOREIGN KEY (import_id) REFERENCES public.imports(id);


--
-- Name: inventory_statutory_overhead_components inventory_statutory_overhead_components_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_statutory_overhead_components
    ADD CONSTRAINT inventory_statutory_overhead_components_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id);


--
-- Name: inventory_statutory_overhead_components inventory_statutory_overhead_components_sku_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_statutory_overhead_components
    ADD CONSTRAINT inventory_statutory_overhead_components_sku_id_fkey FOREIGN KEY (sku_id) REFERENCES public.skus(id);


--
-- Name: journal_entries journal_entries_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.journal_entries
    ADD CONSTRAINT journal_entries_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id);


--
-- Name: journal_entries journal_entries_reversed_by_entry_id_journal_entries_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.journal_entries
    ADD CONSTRAINT journal_entries_reversed_by_entry_id_journal_entries_id_fk FOREIGN KEY (reversed_by_entry_id) REFERENCES public.journal_entries(id);


--
-- Name: journal_entries journal_entries_reverses_entry_id_journal_entries_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.journal_entries
    ADD CONSTRAINT journal_entries_reverses_entry_id_journal_entries_id_fk FOREIGN KEY (reverses_entry_id) REFERENCES public.journal_entries(id);


--
-- Name: journal_lines journal_lines_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.journal_lines
    ADD CONSTRAINT journal_lines_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.gl_accounts(id);


--
-- Name: journal_lines journal_lines_journal_entry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.journal_lines
    ADD CONSTRAINT journal_lines_journal_entry_id_fkey FOREIGN KEY (journal_entry_id) REFERENCES public.journal_entries(id);


--
-- Name: journal_lines journal_lines_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.journal_lines
    ADD CONSTRAINT journal_lines_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id);


--
-- Name: loss_carry_forward_layers loss_carry_forward_layers_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loss_carry_forward_layers
    ADD CONSTRAINT loss_carry_forward_layers_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id);


--
-- Name: org_ai_settings org_ai_settings_org_id_organizations_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_ai_settings
    ADD CONSTRAINT org_ai_settings_org_id_organizations_id_fk FOREIGN KEY (org_id) REFERENCES public.organizations(id);


--
-- Name: org_memberships org_memberships_org_id_organizations_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_memberships
    ADD CONSTRAINT org_memberships_org_id_organizations_id_fk FOREIGN KEY (org_id) REFERENCES public.organizations(id);


--
-- Name: org_memberships org_memberships_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_memberships
    ADD CONSTRAINT org_memberships_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: org_reputation org_reputation_org_id_organizations_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_reputation
    ADD CONSTRAINT org_reputation_org_id_organizations_id_fk FOREIGN KEY (org_id) REFERENCES public.organizations(id);


--
-- Name: pay_runs pay_runs_establishment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pay_runs
    ADD CONSTRAINT pay_runs_establishment_id_fkey FOREIGN KEY (establishment_id) REFERENCES public.establishments(id);


--
-- Name: pay_runs pay_runs_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pay_runs
    ADD CONSTRAINT pay_runs_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id);


--
-- Name: pay_slips pay_slips_bank_transaction_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pay_slips
    ADD CONSTRAINT pay_slips_bank_transaction_id_fkey FOREIGN KEY (bank_transaction_id) REFERENCES public.transactions(id);


--
-- Name: pay_slips pay_slips_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pay_slips
    ADD CONSTRAINT pay_slips_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id);


--
-- Name: pay_slips pay_slips_establishment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pay_slips
    ADD CONSTRAINT pay_slips_establishment_id_fkey FOREIGN KEY (establishment_id) REFERENCES public.establishments(id);


--
-- Name: pay_slips pay_slips_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pay_slips
    ADD CONSTRAINT pay_slips_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id);


--
-- Name: pay_slips pay_slips_pay_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pay_slips
    ADD CONSTRAINT pay_slips_pay_run_id_fkey FOREIGN KEY (pay_run_id) REFERENCES public.pay_runs(id);


--
-- Name: pay_slips pay_slips_pnd_filing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pay_slips
    ADD CONSTRAINT pay_slips_pnd_filing_id_fkey FOREIGN KEY (pnd_filing_id) REFERENCES public.pnd_filings(id);


--
-- Name: pay_slips pay_slips_wht_certificate_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pay_slips
    ADD CONSTRAINT pay_slips_wht_certificate_id_fkey FOREIGN KEY (wht_certificate_id) REFERENCES public.wht_certificates(id);


--
-- Name: payments payments_document_id_documents_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_document_id_documents_id_fk FOREIGN KEY (document_id) REFERENCES public.documents(id);


--
-- Name: payments payments_org_id_organizations_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_org_id_organizations_id_fk FOREIGN KEY (org_id) REFERENCES public.organizations(id);


--
-- Name: period_locks period_locks_org_id_organizations_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.period_locks
    ADD CONSTRAINT period_locks_org_id_organizations_id_fk FOREIGN KEY (org_id) REFERENCES public.organizations(id);


--
-- Name: pnd_filings pnd_filings_amends_filing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pnd_filings
    ADD CONSTRAINT pnd_filings_amends_filing_id_fkey FOREIGN KEY (amends_filing_id) REFERENCES public.pnd_filings(id);


--
-- Name: pnd_filings pnd_filings_bank_transaction_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pnd_filings
    ADD CONSTRAINT pnd_filings_bank_transaction_id_fkey FOREIGN KEY (bank_transaction_id) REFERENCES public.transactions(id);


--
-- Name: pnd_filings pnd_filings_confirmation_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pnd_filings
    ADD CONSTRAINT pnd_filings_confirmation_document_id_fkey FOREIGN KEY (confirmation_document_id) REFERENCES public.documents(id);


--
-- Name: pnd_filings pnd_filings_establishment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pnd_filings
    ADD CONSTRAINT pnd_filings_establishment_id_fkey FOREIGN KEY (establishment_id) REFERENCES public.establishments(id);


--
-- Name: pnd_filings pnd_filings_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pnd_filings
    ADD CONSTRAINT pnd_filings_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id);


--
-- Name: posting_exceptions posting_exceptions_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.posting_exceptions
    ADD CONSTRAINT posting_exceptions_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id);


--
-- Name: posting_exceptions posting_exceptions_posting_outbox_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.posting_exceptions
    ADD CONSTRAINT posting_exceptions_posting_outbox_id_fkey FOREIGN KEY (posting_outbox_id) REFERENCES public.posting_outbox(id);


--
-- Name: posting_outbox posting_outbox_journal_entry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.posting_outbox
    ADD CONSTRAINT posting_outbox_journal_entry_id_fkey FOREIGN KEY (journal_entry_id) REFERENCES public.journal_entries(id);


--
-- Name: posting_outbox posting_outbox_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.posting_outbox
    ADD CONSTRAINT posting_outbox_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id);


--
-- Name: pp36_obligations pp36_obligations_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pp36_obligations
    ADD CONSTRAINT pp36_obligations_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id);


--
-- Name: pp36_obligations pp36_obligations_period_rule_version_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pp36_obligations
    ADD CONSTRAINT pp36_obligations_period_rule_version_id_fkey FOREIGN KEY (period_rule_version_id) REFERENCES public.tax_rule_versions(id);


--
-- Name: pp36_obligations pp36_obligations_pp30_reclaim_filing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pp36_obligations
    ADD CONSTRAINT pp36_obligations_pp30_reclaim_filing_id_fkey FOREIGN KEY (pp30_reclaim_filing_id) REFERENCES public.vat_filings(id);


--
-- Name: pp36_obligations pp36_obligations_pp30_reclaim_filing_line_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pp36_obligations
    ADD CONSTRAINT pp36_obligations_pp30_reclaim_filing_line_id_fk FOREIGN KEY (pp30_reclaim_filing_line_id) REFERENCES public.vat_filing_lines(id);


--
-- Name: pp36_obligations pp36_obligations_pp30_reclaim_filing_line_org_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pp36_obligations
    ADD CONSTRAINT pp36_obligations_pp30_reclaim_filing_line_org_fk FOREIGN KEY (pp30_reclaim_filing_line_id, org_id) REFERENCES public.vat_filing_lines(id, org_id);


--
-- Name: pp36_obligations pp36_obligations_pp30_reclaim_filing_org_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pp36_obligations
    ADD CONSTRAINT pp36_obligations_pp30_reclaim_filing_org_fk FOREIGN KEY (pp30_reclaim_filing_id, org_id) REFERENCES public.vat_filings(id, org_id);


--
-- Name: pp36_obligations pp36_obligations_pp36_filing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pp36_obligations
    ADD CONSTRAINT pp36_obligations_pp36_filing_id_fkey FOREIGN KEY (pp36_filing_id) REFERENCES public.vat_filings(id);


--
-- Name: pp36_obligations pp36_obligations_pp36_filing_line_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pp36_obligations
    ADD CONSTRAINT pp36_obligations_pp36_filing_line_id_fk FOREIGN KEY (pp36_filing_line_id) REFERENCES public.vat_filing_lines(id);


--
-- Name: pp36_obligations pp36_obligations_pp36_filing_line_org_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pp36_obligations
    ADD CONSTRAINT pp36_obligations_pp36_filing_line_org_fk FOREIGN KEY (pp36_filing_line_id, org_id) REFERENCES public.vat_filing_lines(id, org_id);


--
-- Name: pp36_obligations pp36_obligations_pp36_filing_org_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pp36_obligations
    ADD CONSTRAINT pp36_obligations_pp36_filing_org_fk FOREIGN KEY (pp36_filing_id, org_id) REFERENCES public.vat_filings(id, org_id);


--
-- Name: pp36_obligations pp36_obligations_pp36_payment_transaction_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pp36_obligations
    ADD CONSTRAINT pp36_obligations_pp36_payment_transaction_id_fkey FOREIGN KEY (pp36_payment_transaction_id) REFERENCES public.transactions(id);


--
-- Name: pp36_obligations pp36_obligations_reclaim_rule_version_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pp36_obligations
    ADD CONSTRAINT pp36_obligations_reclaim_rule_version_id_fkey FOREIGN KEY (reclaim_rule_version_id) REFERENCES public.tax_rule_versions(id);


--
-- Name: pp36_obligations pp36_obligations_source_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pp36_obligations
    ADD CONSTRAINT pp36_obligations_source_document_id_fkey FOREIGN KEY (source_document_id) REFERENCES public.documents(id);


--
-- Name: pp36_obligations pp36_obligations_source_document_line_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pp36_obligations
    ADD CONSTRAINT pp36_obligations_source_document_line_id_fkey FOREIGN KEY (source_document_line_id) REFERENCES public.document_line_items(id);


--
-- Name: pp36_obligations pp36_obligations_source_payment_transaction_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pp36_obligations
    ADD CONSTRAINT pp36_obligations_source_payment_transaction_id_fkey FOREIGN KEY (source_payment_transaction_id) REFERENCES public.transactions(id);


--
-- Name: pp36_obligations pp36_obligations_source_reconciliation_match_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pp36_obligations
    ADD CONSTRAINT pp36_obligations_source_reconciliation_match_id_fkey FOREIGN KEY (source_reconciliation_match_id) REFERENCES public.reconciliation_matches(id);


--
-- Name: pp36_obligations pp36_obligations_tax_treatment_decision_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pp36_obligations
    ADD CONSTRAINT pp36_obligations_tax_treatment_decision_id_fkey FOREIGN KEY (tax_treatment_decision_id) REFERENCES public.tax_treatment_decisions(id);


--
-- Name: pp36_obligations pp36_obligations_vendor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pp36_obligations
    ADD CONSTRAINT pp36_obligations_vendor_id_fkey FOREIGN KEY (vendor_id) REFERENCES public.vendors(id);


--
-- Name: processor_settlements processor_settlements_bank_transaction_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.processor_settlements
    ADD CONSTRAINT processor_settlements_bank_transaction_id_fkey FOREIGN KEY (bank_transaction_id) REFERENCES public.transactions(id);


--
-- Name: processor_settlements processor_settlements_establishment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.processor_settlements
    ADD CONSTRAINT processor_settlements_establishment_id_fkey FOREIGN KEY (establishment_id) REFERENCES public.establishments(id);


--
-- Name: processor_settlements processor_settlements_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.processor_settlements
    ADD CONSTRAINT processor_settlements_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id);


--
-- Name: processor_settlements processor_settlements_processor_tax_invoice_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.processor_settlements
    ADD CONSTRAINT processor_settlements_processor_tax_invoice_document_id_fkey FOREIGN KEY (processor_tax_invoice_document_id) REFERENCES public.documents(id);


--
-- Name: projects projects_customer_vendor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_customer_vendor_id_fkey FOREIGN KEY (customer_vendor_id) REFERENCES public.vendors(id);


--
-- Name: projects projects_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id);


--
-- Name: reconciliation_matches reconciliation_matches_document_id_documents_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reconciliation_matches
    ADD CONSTRAINT reconciliation_matches_document_id_documents_id_fk FOREIGN KEY (document_id) REFERENCES public.documents(id);


--
-- Name: reconciliation_matches reconciliation_matches_org_id_organizations_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reconciliation_matches
    ADD CONSTRAINT reconciliation_matches_org_id_organizations_id_fk FOREIGN KEY (org_id) REFERENCES public.organizations(id);


--
-- Name: reconciliation_matches reconciliation_matches_payment_id_payments_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reconciliation_matches
    ADD CONSTRAINT reconciliation_matches_payment_id_payments_id_fk FOREIGN KEY (payment_id) REFERENCES public.payments(id);


--
-- Name: reconciliation_matches reconciliation_matches_transaction_id_transactions_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reconciliation_matches
    ADD CONSTRAINT reconciliation_matches_transaction_id_transactions_id_fk FOREIGN KEY (transaction_id) REFERENCES public.transactions(id);


--
-- Name: reconciliation_rules reconciliation_rules_org_id_organizations_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reconciliation_rules
    ADD CONSTRAINT reconciliation_rules_org_id_organizations_id_fk FOREIGN KEY (org_id) REFERENCES public.organizations(id);


--
-- Name: recurring_payment_patterns recurring_payment_patterns_org_id_organizations_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recurring_payment_patterns
    ADD CONSTRAINT recurring_payment_patterns_org_id_organizations_id_fk FOREIGN KEY (org_id) REFERENCES public.organizations(id);


--
-- Name: recurring_payment_patterns recurring_payment_patterns_vendor_id_vendors_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recurring_payment_patterns
    ADD CONSTRAINT recurring_payment_patterns_vendor_id_vendors_id_fk FOREIGN KEY (vendor_id) REFERENCES public.vendors(id);


--
-- Name: sales_transactions sales_transactions_credit_note_for_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_transactions
    ADD CONSTRAINT sales_transactions_credit_note_for_id_fk FOREIGN KEY (credit_note_for_id) REFERENCES public.sales_transactions(id);


--
-- Name: sales_transactions sales_transactions_establishment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_transactions
    ADD CONSTRAINT sales_transactions_establishment_id_fkey FOREIGN KEY (establishment_id) REFERENCES public.establishments(id);


--
-- Name: sales_transactions sales_transactions_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_transactions
    ADD CONSTRAINT sales_transactions_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id);


--
-- Name: sales_transactions sales_transactions_settled_transaction_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_transactions
    ADD CONSTRAINT sales_transactions_settled_transaction_id_fkey FOREIGN KEY (settled_transaction_id) REFERENCES public.transactions(id);


--
-- Name: sales_transactions sales_transactions_superseded_by_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_transactions
    ADD CONSTRAINT sales_transactions_superseded_by_id_fk FOREIGN KEY (superseded_by_id) REFERENCES public.sales_transactions(id);


--
-- Name: sales_transactions sales_transactions_voucher_sales_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_transactions
    ADD CONSTRAINT sales_transactions_voucher_sales_id_fk FOREIGN KEY (voucher_sales_id) REFERENCES public.voucher_sales(id);


--
-- Name: skus skus_establishment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skus
    ADD CONSTRAINT skus_establishment_id_fkey FOREIGN KEY (establishment_id) REFERENCES public.establishments(id);


--
-- Name: skus skus_gl_cogs_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skus
    ADD CONSTRAINT skus_gl_cogs_account_id_fkey FOREIGN KEY (gl_cogs_account_id) REFERENCES public.gl_accounts(id);


--
-- Name: skus skus_gl_inventory_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skus
    ADD CONSTRAINT skus_gl_inventory_account_id_fkey FOREIGN KEY (gl_inventory_account_id) REFERENCES public.gl_accounts(id);


--
-- Name: skus skus_gl_revenue_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skus
    ADD CONSTRAINT skus_gl_revenue_account_id_fkey FOREIGN KEY (gl_revenue_account_id) REFERENCES public.gl_accounts(id);


--
-- Name: skus skus_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skus
    ADD CONSTRAINT skus_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id);


--
-- Name: sso_filings sso_filings_amends_filing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sso_filings
    ADD CONSTRAINT sso_filings_amends_filing_id_fkey FOREIGN KEY (amends_filing_id) REFERENCES public.sso_filings(id);


--
-- Name: sso_filings sso_filings_bank_transaction_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sso_filings
    ADD CONSTRAINT sso_filings_bank_transaction_id_fkey FOREIGN KEY (bank_transaction_id) REFERENCES public.transactions(id);


--
-- Name: sso_filings sso_filings_confirmation_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sso_filings
    ADD CONSTRAINT sso_filings_confirmation_document_id_fkey FOREIGN KEY (confirmation_document_id) REFERENCES public.documents(id);


--
-- Name: sso_filings sso_filings_establishment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sso_filings
    ADD CONSTRAINT sso_filings_establishment_id_fkey FOREIGN KEY (establishment_id) REFERENCES public.establishments(id);


--
-- Name: sso_filings sso_filings_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sso_filings
    ADD CONSTRAINT sso_filings_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id);


--
-- Name: tax_payment_events tax_payment_events_evidence_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tax_payment_events
    ADD CONSTRAINT tax_payment_events_evidence_document_id_fkey FOREIGN KEY (evidence_document_id) REFERENCES public.documents(id);


--
-- Name: tax_payment_events tax_payment_events_filing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tax_payment_events
    ADD CONSTRAINT tax_payment_events_filing_id_fkey FOREIGN KEY (filing_id) REFERENCES public.vat_filings(id);


--
-- Name: tax_payment_events tax_payment_events_filing_org_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tax_payment_events
    ADD CONSTRAINT tax_payment_events_filing_org_fk FOREIGN KEY (filing_id, org_id) REFERENCES public.vat_filings(id, org_id);


--
-- Name: tax_payment_events tax_payment_events_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tax_payment_events
    ADD CONSTRAINT tax_payment_events_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id);


--
-- Name: tax_payment_events tax_payment_events_payment_transaction_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tax_payment_events
    ADD CONSTRAINT tax_payment_events_payment_transaction_id_fkey FOREIGN KEY (payment_transaction_id) REFERENCES public.transactions(id);


--
-- Name: tax_rule_versions tax_rule_versions_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tax_rule_versions
    ADD CONSTRAINT tax_rule_versions_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id);


--
-- Name: tax_treatment_decisions tax_treatment_decisions_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tax_treatment_decisions
    ADD CONSTRAINT tax_treatment_decisions_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id);


--
-- Name: tax_treatment_decisions tax_treatment_decisions_rule_version_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tax_treatment_decisions
    ADD CONSTRAINT tax_treatment_decisions_rule_version_id_fkey FOREIGN KEY (rule_version_id) REFERENCES public.tax_rule_versions(id);


--
-- Name: tax_treatment_decisions tax_treatment_decisions_source_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tax_treatment_decisions
    ADD CONSTRAINT tax_treatment_decisions_source_document_id_fkey FOREIGN KEY (source_document_id) REFERENCES public.documents(id);


--
-- Name: tax_treatment_decisions tax_treatment_decisions_source_document_line_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tax_treatment_decisions
    ADD CONSTRAINT tax_treatment_decisions_source_document_line_id_fkey FOREIGN KEY (source_document_line_id) REFERENCES public.document_line_items(id);


--
-- Name: tax_treatment_decisions tax_treatment_decisions_source_payment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tax_treatment_decisions
    ADD CONSTRAINT tax_treatment_decisions_source_payment_id_fkey FOREIGN KEY (source_payment_id) REFERENCES public.payments(id);


--
-- Name: tax_treatment_decisions tax_treatment_decisions_source_reconciliation_match_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tax_treatment_decisions
    ADD CONSTRAINT tax_treatment_decisions_source_reconciliation_match_id_fkey FOREIGN KEY (source_reconciliation_match_id) REFERENCES public.reconciliation_matches(id);


--
-- Name: tax_treatment_decisions tax_treatment_decisions_source_transaction_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tax_treatment_decisions
    ADD CONSTRAINT tax_treatment_decisions_source_transaction_id_fkey FOREIGN KEY (source_transaction_id) REFERENCES public.transactions(id);


--
-- Name: transactions transactions_bank_account_id_bank_accounts_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_bank_account_id_bank_accounts_id_fk FOREIGN KEY (bank_account_id) REFERENCES public.bank_accounts(id);


--
-- Name: transactions transactions_org_id_organizations_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_org_id_organizations_id_fk FOREIGN KEY (org_id) REFERENCES public.organizations(id);


--
-- Name: transactions transactions_statement_id_bank_statements_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_statement_id_bank_statements_id_fk FOREIGN KEY (statement_id) REFERENCES public.bank_statements(id);


--
-- Name: transfer_pricing_disclosures transfer_pricing_disclosures_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transfer_pricing_disclosures
    ADD CONSTRAINT transfer_pricing_disclosures_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id);


--
-- Name: user_nav_pins user_nav_pins_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_nav_pins
    ADD CONSTRAINT user_nav_pins_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id);


--
-- Name: users users_org_id_organizations_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_org_id_organizations_id_fk FOREIGN KEY (org_id) REFERENCES public.organizations(id);


--
-- Name: vat_credit_carryforwards vat_credit_carryforwards_applied_filing_org_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vat_credit_carryforwards
    ADD CONSTRAINT vat_credit_carryforwards_applied_filing_org_fk FOREIGN KEY (applied_to_pp30_filing_id, org_id) REFERENCES public.vat_filings(id, org_id);


--
-- Name: vat_credit_carryforwards vat_credit_carryforwards_applied_to_pp30_filing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vat_credit_carryforwards
    ADD CONSTRAINT vat_credit_carryforwards_applied_to_pp30_filing_id_fkey FOREIGN KEY (applied_to_pp30_filing_id) REFERENCES public.vat_filings(id);


--
-- Name: vat_credit_carryforwards vat_credit_carryforwards_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vat_credit_carryforwards
    ADD CONSTRAINT vat_credit_carryforwards_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id);


--
-- Name: vat_credit_carryforwards vat_credit_carryforwards_source_filing_org_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vat_credit_carryforwards
    ADD CONSTRAINT vat_credit_carryforwards_source_filing_org_fk FOREIGN KEY (source_pp30_filing_id, org_id) REFERENCES public.vat_filings(id, org_id);


--
-- Name: vat_credit_carryforwards vat_credit_carryforwards_source_line_org_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vat_credit_carryforwards
    ADD CONSTRAINT vat_credit_carryforwards_source_line_org_fk FOREIGN KEY (source_pp30_filing_line_id, org_id) REFERENCES public.vat_filing_lines(id, org_id);


--
-- Name: vat_credit_carryforwards vat_credit_carryforwards_source_pp30_filing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vat_credit_carryforwards
    ADD CONSTRAINT vat_credit_carryforwards_source_pp30_filing_id_fkey FOREIGN KEY (source_pp30_filing_id) REFERENCES public.vat_filings(id);


--
-- Name: vat_credit_carryforwards vat_credit_carryforwards_source_pp30_filing_line_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vat_credit_carryforwards
    ADD CONSTRAINT vat_credit_carryforwards_source_pp30_filing_line_id_fkey FOREIGN KEY (source_pp30_filing_line_id) REFERENCES public.vat_filing_lines(id);


--
-- Name: vat_filing_lines vat_filing_lines_filing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vat_filing_lines
    ADD CONSTRAINT vat_filing_lines_filing_id_fkey FOREIGN KEY (filing_id) REFERENCES public.vat_filings(id);


--
-- Name: vat_filing_lines vat_filing_lines_filing_org_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vat_filing_lines
    ADD CONSTRAINT vat_filing_lines_filing_org_fk FOREIGN KEY (filing_id, org_id) REFERENCES public.vat_filings(id, org_id);


--
-- Name: vat_filing_lines vat_filing_lines_input_item_org_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vat_filing_lines
    ADD CONSTRAINT vat_filing_lines_input_item_org_fk FOREIGN KEY (vat_input_item_id, org_id) REFERENCES public.vat_input_items(id, org_id);


--
-- Name: vat_filing_lines vat_filing_lines_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vat_filing_lines
    ADD CONSTRAINT vat_filing_lines_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id);


--
-- Name: vat_filing_lines vat_filing_lines_output_item_org_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vat_filing_lines
    ADD CONSTRAINT vat_filing_lines_output_item_org_fk FOREIGN KEY (vat_output_item_id, org_id) REFERENCES public.vat_output_items(id, org_id);


--
-- Name: vat_filing_lines vat_filing_lines_pp36_obligation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vat_filing_lines
    ADD CONSTRAINT vat_filing_lines_pp36_obligation_id_fkey FOREIGN KEY (pp36_obligation_id) REFERENCES public.pp36_obligations(id);


--
-- Name: vat_filing_lines vat_filing_lines_pp36_obligation_org_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vat_filing_lines
    ADD CONSTRAINT vat_filing_lines_pp36_obligation_org_fk FOREIGN KEY (pp36_obligation_id, org_id) REFERENCES public.pp36_obligations(id, org_id);


--
-- Name: vat_filing_lines vat_filing_lines_vat_input_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vat_filing_lines
    ADD CONSTRAINT vat_filing_lines_vat_input_item_id_fkey FOREIGN KEY (vat_input_item_id) REFERENCES public.vat_input_items(id);


--
-- Name: vat_filing_lines vat_filing_lines_vat_output_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vat_filing_lines
    ADD CONSTRAINT vat_filing_lines_vat_output_item_id_fkey FOREIGN KEY (vat_output_item_id) REFERENCES public.vat_output_items(id);


--
-- Name: vat_filings vat_filings_amends_filing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vat_filings
    ADD CONSTRAINT vat_filings_amends_filing_id_fkey FOREIGN KEY (amends_filing_id) REFERENCES public.vat_filings(id);


--
-- Name: vat_filings vat_filings_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vat_filings
    ADD CONSTRAINT vat_filings_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id);


--
-- Name: vat_filings vat_filings_payment_transaction_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vat_filings
    ADD CONSTRAINT vat_filings_payment_transaction_id_fkey FOREIGN KEY (payment_transaction_id) REFERENCES public.transactions(id);


--
-- Name: vat_input_items vat_input_items_claim_window_rule_version_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vat_input_items
    ADD CONSTRAINT vat_input_items_claim_window_rule_version_id_fkey FOREIGN KEY (claim_window_rule_version_id) REFERENCES public.tax_rule_versions(id);


--
-- Name: vat_input_items vat_input_items_draft_filing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vat_input_items
    ADD CONSTRAINT vat_input_items_draft_filing_id_fkey FOREIGN KEY (draft_filing_id) REFERENCES public.vat_filings(id);


--
-- Name: vat_input_items vat_input_items_draft_filing_org_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vat_input_items
    ADD CONSTRAINT vat_input_items_draft_filing_org_fk FOREIGN KEY (draft_filing_id, org_id) REFERENCES public.vat_filings(id, org_id);


--
-- Name: vat_input_items vat_input_items_filed_filing_line_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vat_input_items
    ADD CONSTRAINT vat_input_items_filed_filing_line_id_fk FOREIGN KEY (filed_filing_line_id) REFERENCES public.vat_filing_lines(id);


--
-- Name: vat_input_items vat_input_items_filed_line_org_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vat_input_items
    ADD CONSTRAINT vat_input_items_filed_line_org_fk FOREIGN KEY (filed_filing_line_id, org_id) REFERENCES public.vat_filing_lines(id, org_id);


--
-- Name: vat_input_items vat_input_items_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vat_input_items
    ADD CONSTRAINT vat_input_items_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id);


--
-- Name: vat_input_items vat_input_items_source_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vat_input_items
    ADD CONSTRAINT vat_input_items_source_document_id_fkey FOREIGN KEY (source_document_id) REFERENCES public.documents(id);


--
-- Name: vat_input_items vat_input_items_source_document_line_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vat_input_items
    ADD CONSTRAINT vat_input_items_source_document_line_id_fkey FOREIGN KEY (source_document_line_id) REFERENCES public.document_line_items(id);


--
-- Name: vat_input_items vat_input_items_source_reconciliation_match_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vat_input_items
    ADD CONSTRAINT vat_input_items_source_reconciliation_match_id_fkey FOREIGN KEY (source_reconciliation_match_id) REFERENCES public.reconciliation_matches(id);


--
-- Name: vat_input_items vat_input_items_source_transaction_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vat_input_items
    ADD CONSTRAINT vat_input_items_source_transaction_id_fkey FOREIGN KEY (source_transaction_id) REFERENCES public.transactions(id);


--
-- Name: vat_input_items vat_input_items_tax_treatment_decision_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vat_input_items
    ADD CONSTRAINT vat_input_items_tax_treatment_decision_id_fkey FOREIGN KEY (tax_treatment_decision_id) REFERENCES public.tax_treatment_decisions(id);


--
-- Name: vat_input_items vat_input_items_vendor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vat_input_items
    ADD CONSTRAINT vat_input_items_vendor_id_fkey FOREIGN KEY (vendor_id) REFERENCES public.vendors(id);


--
-- Name: vat_output_items vat_output_items_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vat_output_items
    ADD CONSTRAINT vat_output_items_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.vendors(id);


--
-- Name: vat_output_items vat_output_items_draft_filing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vat_output_items
    ADD CONSTRAINT vat_output_items_draft_filing_id_fkey FOREIGN KEY (draft_filing_id) REFERENCES public.vat_filings(id);


--
-- Name: vat_output_items vat_output_items_draft_filing_org_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vat_output_items
    ADD CONSTRAINT vat_output_items_draft_filing_org_fk FOREIGN KEY (draft_filing_id, org_id) REFERENCES public.vat_filings(id, org_id);


--
-- Name: vat_output_items vat_output_items_filed_filing_line_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vat_output_items
    ADD CONSTRAINT vat_output_items_filed_filing_line_id_fkey FOREIGN KEY (filed_filing_line_id) REFERENCES public.vat_filing_lines(id);


--
-- Name: vat_output_items vat_output_items_filed_line_org_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vat_output_items
    ADD CONSTRAINT vat_output_items_filed_line_org_fk FOREIGN KEY (filed_filing_line_id, org_id) REFERENCES public.vat_filing_lines(id, org_id);


--
-- Name: vat_output_items vat_output_items_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vat_output_items
    ADD CONSTRAINT vat_output_items_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id);


--
-- Name: vat_output_items vat_output_items_source_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vat_output_items
    ADD CONSTRAINT vat_output_items_source_document_id_fkey FOREIGN KEY (source_document_id) REFERENCES public.documents(id);


--
-- Name: vat_output_items vat_output_items_source_document_line_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vat_output_items
    ADD CONSTRAINT vat_output_items_source_document_line_id_fkey FOREIGN KEY (source_document_line_id) REFERENCES public.document_line_items(id);


--
-- Name: vat_output_items vat_output_items_source_transaction_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vat_output_items
    ADD CONSTRAINT vat_output_items_source_transaction_id_fkey FOREIGN KEY (source_transaction_id) REFERENCES public.transactions(id);


--
-- Name: vat_output_items vat_output_items_tax_point_rule_version_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vat_output_items
    ADD CONSTRAINT vat_output_items_tax_point_rule_version_id_fkey FOREIGN KEY (tax_point_rule_version_id) REFERENCES public.tax_rule_versions(id);


--
-- Name: vat_output_items vat_output_items_tax_treatment_decision_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vat_output_items
    ADD CONSTRAINT vat_output_items_tax_treatment_decision_id_fkey FOREIGN KEY (tax_treatment_decision_id) REFERENCES public.tax_treatment_decisions(id);


--
-- Name: vendor_bank_aliases vendor_bank_aliases_org_id_organizations_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendor_bank_aliases
    ADD CONSTRAINT vendor_bank_aliases_org_id_organizations_id_fk FOREIGN KEY (org_id) REFERENCES public.organizations(id);


--
-- Name: vendor_bank_aliases vendor_bank_aliases_vendor_id_vendors_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendor_bank_aliases
    ADD CONSTRAINT vendor_bank_aliases_vendor_id_vendors_id_fk FOREIGN KEY (vendor_id) REFERENCES public.vendors(id);


--
-- Name: vendor_tier vendor_tier_org_id_organizations_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendor_tier
    ADD CONSTRAINT vendor_tier_org_id_organizations_id_fk FOREIGN KEY (org_id) REFERENCES public.organizations(id);


--
-- Name: vendor_tier vendor_tier_vendor_id_vendors_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendor_tier
    ADD CONSTRAINT vendor_tier_vendor_id_vendors_id_fk FOREIGN KEY (vendor_id) REFERENCES public.vendors(id);


--
-- Name: vendors vendors_org_id_organizations_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendors
    ADD CONSTRAINT vendors_org_id_organizations_id_fk FOREIGN KEY (org_id) REFERENCES public.organizations(id);


--
-- Name: voucher_sales voucher_sales_establishment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.voucher_sales
    ADD CONSTRAINT voucher_sales_establishment_id_fkey FOREIGN KEY (establishment_id) REFERENCES public.establishments(id);


--
-- Name: voucher_sales voucher_sales_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.voucher_sales
    ADD CONSTRAINT voucher_sales_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id);


--
-- Name: voucher_sales voucher_sales_redemption_sales_transaction_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.voucher_sales
    ADD CONSTRAINT voucher_sales_redemption_sales_transaction_id_fkey FOREIGN KEY (redemption_sales_transaction_id) REFERENCES public.sales_transactions(id);


--
-- Name: wht_annual_threshold_decisions wht_annual_threshold_decisions_certificate_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wht_annual_threshold_decisions
    ADD CONSTRAINT wht_annual_threshold_decisions_certificate_id_fkey FOREIGN KEY (certificate_id) REFERENCES public.wht_certificates(id);


--
-- Name: wht_annual_threshold_decisions wht_annual_threshold_decisions_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wht_annual_threshold_decisions
    ADD CONSTRAINT wht_annual_threshold_decisions_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.documents(id);


--
-- Name: wht_annual_threshold_decisions wht_annual_threshold_decisions_line_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wht_annual_threshold_decisions
    ADD CONSTRAINT wht_annual_threshold_decisions_line_item_id_fkey FOREIGN KEY (line_item_id) REFERENCES public.document_line_items(id);


--
-- Name: wht_annual_threshold_decisions wht_annual_threshold_decisions_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wht_annual_threshold_decisions
    ADD CONSTRAINT wht_annual_threshold_decisions_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id);


--
-- Name: wht_annual_threshold_decisions wht_annual_threshold_decisions_payee_vendor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wht_annual_threshold_decisions
    ADD CONSTRAINT wht_annual_threshold_decisions_payee_vendor_id_fkey FOREIGN KEY (payee_vendor_id) REFERENCES public.vendors(id);


--
-- Name: wht_annual_threshold_decisions wht_annual_threshold_decisions_payment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wht_annual_threshold_decisions
    ADD CONSTRAINT wht_annual_threshold_decisions_payment_id_fkey FOREIGN KEY (payment_id) REFERENCES public.payments(id);


--
-- Name: wht_certificate_items wht_certificate_items_certificate_id_wht_certificates_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wht_certificate_items
    ADD CONSTRAINT wht_certificate_items_certificate_id_wht_certificates_id_fk FOREIGN KEY (certificate_id) REFERENCES public.wht_certificates(id);


--
-- Name: wht_certificate_items wht_certificate_items_document_id_documents_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wht_certificate_items
    ADD CONSTRAINT wht_certificate_items_document_id_documents_id_fk FOREIGN KEY (document_id) REFERENCES public.documents(id);


--
-- Name: wht_certificate_items wht_certificate_items_line_item_id_document_line_items_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wht_certificate_items
    ADD CONSTRAINT wht_certificate_items_line_item_id_document_line_items_id_fk FOREIGN KEY (line_item_id) REFERENCES public.document_line_items(id);


--
-- Name: wht_certificate_items wht_certificate_items_org_id_organizations_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wht_certificate_items
    ADD CONSTRAINT wht_certificate_items_org_id_organizations_id_fk FOREIGN KEY (org_id) REFERENCES public.organizations(id);


--
-- Name: wht_certificates wht_certificates_filing_id_wht_monthly_filings_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wht_certificates
    ADD CONSTRAINT wht_certificates_filing_id_wht_monthly_filings_id_fk FOREIGN KEY (filing_id) REFERENCES public.wht_monthly_filings(id);


--
-- Name: wht_certificates wht_certificates_org_id_organizations_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wht_certificates
    ADD CONSTRAINT wht_certificates_org_id_organizations_id_fk FOREIGN KEY (org_id) REFERENCES public.organizations(id);


--
-- Name: wht_certificates wht_certificates_payee_vendor_id_vendors_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wht_certificates
    ADD CONSTRAINT wht_certificates_payee_vendor_id_vendors_id_fk FOREIGN KEY (payee_vendor_id) REFERENCES public.vendors(id);


--
-- Name: wht_certificates wht_certificates_replacement_cert_id_wht_certificates_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wht_certificates
    ADD CONSTRAINT wht_certificates_replacement_cert_id_wht_certificates_id_fk FOREIGN KEY (replacement_cert_id) REFERENCES public.wht_certificates(id);


--
-- Name: wht_credits_received wht_credits_received_certificate_received_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wht_credits_received
    ADD CONSTRAINT wht_credits_received_certificate_received_document_id_fkey FOREIGN KEY (certificate_received_document_id) REFERENCES public.documents(id);


--
-- Name: wht_credits_received wht_credits_received_customer_vendor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wht_credits_received
    ADD CONSTRAINT wht_credits_received_customer_vendor_id_fkey FOREIGN KEY (customer_vendor_id) REFERENCES public.vendors(id);


--
-- Name: wht_credits_received wht_credits_received_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wht_credits_received
    ADD CONSTRAINT wht_credits_received_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id);


--
-- Name: wht_monthly_filings wht_monthly_filings_org_id_organizations_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wht_monthly_filings
    ADD CONSTRAINT wht_monthly_filings_org_id_organizations_id_fk FOREIGN KEY (org_id) REFERENCES public.organizations(id);


--
-- Name: wht_sequence_counters wht_sequence_counters_org_id_organizations_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wht_sequence_counters
    ADD CONSTRAINT wht_sequence_counters_org_id_organizations_id_fk FOREIGN KEY (org_id) REFERENCES public.organizations(id);


--
-- PostgreSQL database dump complete
--


