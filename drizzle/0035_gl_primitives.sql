CREATE TYPE "public"."gl_account_type" AS ENUM('asset', 'liability', 'equity', 'revenue', 'expense', 'cogs', 'contra_asset', 'contra_liability');
CREATE TYPE "public"."gl_entry_type" AS ENUM('manual', 'opening_balance', 'memo', 'auto_document', 'auto_sales', 'auto_payment', 'auto_payroll', 'auto_fx_revaluation', 'auto_depreciation', 'auto_accrual', 'auto_year_end_close', 'auto_pp30_settlement');
CREATE TYPE "public"."gl_tax_treatment" AS ENUM('taxable_revenue', 'vat_exempt_revenue', 'zero_rated_revenue', 'non_deductible_expense', 'vat_recoverable_input', 'non_recoverable_input', 'n_a');
CREATE TYPE "public"."gl_vat_register_role" AS ENUM('output_tax_payable', 'input_tax_recoverable', 'pp36_payable', 'pp36_reclaim', 'n_a');
CREATE TYPE "public"."gl_wht_register_role" AS ENUM('wht_payable_pnd1', 'wht_payable_pnd3', 'wht_payable_pnd53', 'wht_payable_pnd54', 'wht_credits_receivable', 'n_a');

CREATE TABLE "gl_accounts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "establishment_id" uuid,
  "account_code" text NOT NULL,
  "name_th" text NOT NULL,
  "name_en" text NOT NULL,
  "account_type" "gl_account_type" NOT NULL,
  "account_subtype" text,
  "parent_account_id" uuid,
  "is_clearing" boolean DEFAULT false NOT NULL,
  "is_control_account" boolean DEFAULT false NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "is_system" boolean DEFAULT false NOT NULL,
  "is_automated" boolean DEFAULT false NOT NULL,
  "is_postable" boolean DEFAULT true NOT NULL,
  "description_override_en" text,
  "description_override_th" text,
  "visibility_condition" text,
  "dbd_taxonomy_hint" text,
  "tenant_added_by" uuid REFERENCES "users"("id"),
  "tenant_added_at" timestamp with time zone,
  "tax_treatment" "gl_tax_treatment" DEFAULT 'n_a' NOT NULL,
  "boi_segment" text DEFAULT 'n_a' NOT NULL,
  "vat_register_role" "gl_vat_register_role" DEFAULT 'n_a' NOT NULL,
  "wht_register_role" "gl_wht_register_role" DEFAULT 'n_a' NOT NULL,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone,
  "deleted_at" timestamp with time zone,
  CONSTRAINT "gl_accounts_parent_account_id_gl_accounts_id_fk" FOREIGN KEY ("parent_account_id") REFERENCES "gl_accounts"("id"),
  CONSTRAINT "gl_accounts_org_code_uniq" UNIQUE("org_id", "account_code"),
  CONSTRAINT "gl_accounts_code_format_check" CHECK ("account_code" ~ '^[1-9][0-9]{3}$')
);

CREATE TABLE "journal_entries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "establishment_id" uuid,
  "entry_number" text NOT NULL,
  "entry_date" date NOT NULL,
  "posting_date" date NOT NULL,
  "period_year" integer NOT NULL,
  "period_month" integer NOT NULL,
  "entry_type" "gl_entry_type" NOT NULL,
  "posting_kind" text,
  "source_entity_type" text,
  "source_entity_id" uuid,
  "source_event_id" text,
  "description" text NOT NULL,
  "description_th" text,
  "currency" text DEFAULT 'THB' NOT NULL,
  "fx_rate" numeric(18, 8),
  "total_debit" numeric(14, 2) DEFAULT '0' NOT NULL,
  "total_credit" numeric(14, 2) DEFAULT '0' NOT NULL,
  "created_by_user_id" text,
  "approved_by_user_id" text,
  "approved_at" timestamp with time zone,
  "posted_at" timestamp with time zone DEFAULT now() NOT NULL,
  "is_reversal" boolean DEFAULT false NOT NULL,
  "reverses_entry_id" uuid,
  "reversed_by_entry_id" uuid,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone,
  CONSTRAINT "journal_entries_reverses_entry_id_journal_entries_id_fk" FOREIGN KEY ("reverses_entry_id") REFERENCES "journal_entries"("id"),
  CONSTRAINT "journal_entries_reversed_by_entry_id_journal_entries_id_fk" FOREIGN KEY ("reversed_by_entry_id") REFERENCES "journal_entries"("id"),
  CONSTRAINT "journal_entries_org_number_uniq" UNIQUE("org_id", "entry_number"),
  CONSTRAINT "journal_entries_period_month_check" CHECK ("period_month" BETWEEN 1 AND 12),
  CONSTRAINT "journal_entries_balanced_check" CHECK ("total_debit" = "total_credit"),
  CONSTRAINT "journal_entries_nonzero_or_documented_check" CHECK ("total_debit" > 0 OR "is_reversal" = true OR "entry_type" IN ('opening_balance', 'memo') OR "notes" IS NOT NULL)
);

CREATE TABLE "journal_lines" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "journal_entry_id" uuid NOT NULL REFERENCES "journal_entries"("id"),
  "line_number" integer NOT NULL,
  "account_id" uuid NOT NULL REFERENCES "gl_accounts"("id"),
  "description" text,
  "debit_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
  "credit_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
  "subledger_entity_type" text,
  "subledger_entity_id" uuid,
  "channel_key" text,
  "processor_key" text,
  "cash_deposit_key" text,
  "cost_center_id" uuid,
  "project_id" uuid,
  "boi_segment" text DEFAULT 'n_a' NOT NULL,
  "original_currency" text,
  "original_amount_debit" numeric(18, 2),
  "original_amount_credit" numeric(18, 2),
  "fx_rate_applied" numeric(18, 8),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone,
  CONSTRAINT "journal_lines_entry_line_uniq" UNIQUE("journal_entry_id", "line_number"),
  CONSTRAINT "journal_lines_debit_or_credit_check" CHECK ((("debit_amount" > 0 AND "credit_amount" = 0) OR ("debit_amount" = 0 AND "credit_amount" > 0)))
);

CREATE TABLE "gl_opening_balances" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "establishment_id" uuid,
  "as_of_date" date NOT NULL,
  "account_id" uuid NOT NULL REFERENCES "gl_accounts"("id"),
  "debit_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
  "credit_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
  "entered_by_user_id" text,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone,
  CONSTRAINT "gl_opening_balances_debit_or_credit_check" CHECK ((("debit_amount" > 0 AND "credit_amount" = 0) OR ("debit_amount" = 0 AND "credit_amount" > 0) OR ("debit_amount" = 0 AND "credit_amount" = 0)))
);

CREATE UNIQUE INDEX "gl_accounts_id_org_uniq" ON "gl_accounts" ("id", "org_id");
CREATE INDEX "gl_accounts_org_type_idx" ON "gl_accounts" ("org_id", "account_type");
CREATE UNIQUE INDEX "journal_entries_id_org_uniq" ON "journal_entries" ("id", "org_id");
CREATE UNIQUE INDEX "journal_entries_auto_source_uniq" ON "journal_entries" ("org_id", "source_entity_type", "source_entity_id", "posting_kind") WHERE "source_entity_type" IS NOT NULL AND "source_entity_id" IS NOT NULL AND "posting_kind" IS NOT NULL;
CREATE INDEX "journal_entries_period_idx" ON "journal_entries" ("org_id", "period_year", "period_month");
CREATE INDEX "journal_entries_source_idx" ON "journal_entries" ("org_id", "source_entity_type", "source_entity_id");
CREATE INDEX "journal_lines_account_idx" ON "journal_lines" ("org_id", "account_id", "journal_entry_id");
CREATE INDEX "journal_lines_subledger_idx" ON "journal_lines" ("org_id", "subledger_entity_type", "subledger_entity_id");
CREATE UNIQUE INDEX "gl_opening_balances_org_account_date_uniq" ON "gl_opening_balances" ("org_id", COALESCE("establishment_id"::text, 'org'), "as_of_date", "account_id");

CREATE OR REPLACE FUNCTION guard_gl_account_parent_org()
RETURNS trigger
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

CREATE TRIGGER guard_gl_account_parent_org_trigger
BEFORE INSERT OR UPDATE OF org_id, parent_account_id ON gl_accounts
FOR EACH ROW EXECUTE FUNCTION guard_gl_account_parent_org();

CREATE OR REPLACE FUNCTION guard_gl_entry_period_lock()
RETURNS trigger
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

CREATE TRIGGER guard_gl_entry_period_lock_trigger
BEFORE INSERT OR UPDATE OR DELETE ON journal_entries
FOR EACH ROW EXECUTE FUNCTION guard_gl_entry_period_lock();

CREATE OR REPLACE FUNCTION guard_journal_line_scope_and_lock()
RETURNS trigger
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

CREATE TRIGGER guard_journal_line_scope_and_lock_trigger
BEFORE INSERT OR UPDATE OR DELETE ON journal_lines
FOR EACH ROW EXECUTE FUNCTION guard_journal_line_scope_and_lock();

CREATE OR REPLACE FUNCTION enforce_journal_entry_line_balance()
RETURNS trigger
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

CREATE CONSTRAINT TRIGGER enforce_journal_entry_line_balance_trigger
AFTER INSERT OR UPDATE OR DELETE ON journal_lines
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION enforce_journal_entry_line_balance();

CREATE OR REPLACE FUNCTION enforce_journal_entry_header_balance()
RETURNS trigger
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

CREATE CONSTRAINT TRIGGER enforce_journal_entry_header_balance_trigger
AFTER INSERT OR UPDATE OF total_debit, total_credit ON journal_entries
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION enforce_journal_entry_header_balance();

CREATE OR REPLACE FUNCTION guard_gl_opening_balance_scope()
RETURNS trigger
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

CREATE TRIGGER guard_gl_opening_balance_scope_trigger
BEFORE INSERT OR UPDATE OF org_id, account_id ON gl_opening_balances
FOR EACH ROW EXECUTE FUNCTION guard_gl_opening_balance_scope();
