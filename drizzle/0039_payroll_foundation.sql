CREATE TABLE "employees" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "establishment_id" uuid NOT NULL REFERENCES "establishments"("id"),
  "national_id" text,
  "passport_number" text,
  "tax_id" text,
  "full_name_th" text,
  "full_name_en" text,
  "dob" date,
  "start_date" date NOT NULL,
  "end_date" date,
  "position" text,
  "pay_frequency" text DEFAULT 'monthly' NOT NULL,
  "pay_periods_per_year" integer DEFAULT 12 NOT NULL,
  "bank_account_number" text,
  "bank_account_name" text,
  "bank_code" text,
  "provident_fund_eligible" boolean DEFAULT false NOT NULL,
  "social_security_eligible" boolean DEFAULT true NOT NULL,
  "social_security_first_registered_at" date,
  "is_director" boolean DEFAULT false NOT NULL,
  "prior_employer_ytd_gross" numeric(14, 2) DEFAULT '0' NOT NULL,
  "prior_employer_ytd_pit" numeric(14, 2) DEFAULT '0' NOT NULL,
  "prior_employer_ytd_as_of_month" integer,
  "prior_employer_ynot_certificate_document_id" uuid REFERENCES "documents"("id"),
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone,
  "deleted_at" timestamp with time zone,
  CONSTRAINT "employees_pay_frequency_check" CHECK ("pay_frequency" IN ('monthly', 'bi_weekly', 'weekly', 'daily')),
  CONSTRAINT "employees_pay_periods_positive_check" CHECK ("pay_periods_per_year" > 0),
  CONSTRAINT "employees_prior_ytd_nonnegative_check" CHECK ("prior_employer_ytd_gross" >= 0 AND "prior_employer_ytd_pit" >= 0)
);

CREATE TABLE "employee_allowances" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "employee_id" uuid NOT NULL REFERENCES "employees"("id"),
  "tax_year" integer NOT NULL,
  "personal_allowance" numeric(14, 2) DEFAULT '60000' NOT NULL,
  "spouse_allowance" numeric(14, 2) DEFAULT '0' NOT NULL,
  "child_count_pre_2018" integer DEFAULT 0 NOT NULL,
  "child_count_post_2018_second_plus" integer DEFAULT 0 NOT NULL,
  "parent_allowance" numeric(14, 2) DEFAULT '0' NOT NULL,
  "disabled_dependent_allowance" numeric(14, 2) DEFAULT '0' NOT NULL,
  "health_insurance_premium" numeric(14, 2) DEFAULT '0' NOT NULL,
  "life_insurance_premium" numeric(14, 2) DEFAULT '0' NOT NULL,
  "parents_health_insurance" numeric(14, 2) DEFAULT '0' NOT NULL,
  "pension_insurance" numeric(14, 2) DEFAULT '0' NOT NULL,
  "provident_fund_contribution_pct" numeric(5, 4) DEFAULT '0' NOT NULL,
  "ltf_rmf_ssf_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
  "mortgage_interest" numeric(14, 2) DEFAULT '0' NOT NULL,
  "social_security_contribution" numeric(14, 2),
  "submitted_by_employee_at" timestamp with time zone,
  "recorded_by_employer_at" timestamp with time zone,
  "recorded_by_user_id" text,
  "effective_from_month" date NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone,
  CONSTRAINT "employee_allowances_unique_effective" UNIQUE("org_id", "employee_id", "tax_year", "effective_from_month"),
  CONSTRAINT "employee_allowances_counts_nonnegative_check" CHECK ("child_count_pre_2018" >= 0 AND "child_count_post_2018_second_plus" >= 0)
);

CREATE TABLE "pay_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "establishment_id" uuid NOT NULL REFERENCES "establishments"("id"),
  "period_start" date NOT NULL,
  "period_end" date NOT NULL,
  "pay_date" date NOT NULL,
  "status" text DEFAULT 'draft' NOT NULL,
  "approved_by" text,
  "approved_at" timestamp with time zone,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone,
  CONSTRAINT "pay_runs_status_check" CHECK ("status" IN ('draft', 'approved', 'paid', 'voided'))
);

CREATE TABLE "pnd_filings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "establishment_id" uuid NOT NULL REFERENCES "establishments"("id"),
  "form_type" text NOT NULL,
  "tax_period" text NOT NULL,
  "filing_status" text DEFAULT 'draft' NOT NULL,
  "submitted_at" timestamp with time zone,
  "accepted_at" timestamp with time zone,
  "total_payees" integer,
  "total_gross_amount" numeric(14, 2),
  "total_wht_amount" numeric(14, 2),
  "paid_at" timestamp with time zone,
  "bank_transaction_id" uuid REFERENCES "transactions"("id"),
  "is_amendment" boolean DEFAULT false NOT NULL,
  "amends_filing_id" uuid REFERENCES "pnd_filings"("id"),
  "amendment_reason" text,
  "voluntary_amendment_penalty_pct" numeric(5, 4),
  "surcharge_amount" numeric(14, 2),
  "rd_reference_number" text,
  "confirmation_document_id" uuid REFERENCES "documents"("id"),
  "payload" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone,
  CONSTRAINT "pnd_filings_form_type_check" CHECK ("form_type" IN ('PND1', 'PND1KOR', 'PND2', 'PND3', 'PND53', 'PND54')),
  CONSTRAINT "pnd_filings_status_check" CHECK ("filing_status" IN ('draft', 'submitted', 'accepted', 'rejected'))
);

CREATE TABLE "sso_filings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "establishment_id" uuid NOT NULL REFERENCES "establishments"("id"),
  "tax_month" text NOT NULL,
  "filing_status" text DEFAULT 'draft' NOT NULL,
  "total_employees" integer,
  "total_employee_contribution" numeric(14, 2),
  "total_employer_contribution" numeric(14, 2),
  "submitted_at" timestamp with time zone,
  "accepted_at" timestamp with time zone,
  "bank_transaction_id" uuid REFERENCES "transactions"("id"),
  "is_amendment" boolean DEFAULT false NOT NULL,
  "amends_filing_id" uuid REFERENCES "sso_filings"("id"),
  "amendment_reason" text,
  "sso_reference_number" text,
  "confirmation_document_id" uuid REFERENCES "documents"("id"),
  "payload" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone,
  CONSTRAINT "sso_filings_status_check" CHECK ("filing_status" IN ('draft', 'submitted', 'accepted'))
);

CREATE TABLE "pay_slips" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "establishment_id" uuid NOT NULL REFERENCES "establishments"("id"),
  "pay_run_id" uuid NOT NULL REFERENCES "pay_runs"("id"),
  "employee_id" uuid NOT NULL REFERENCES "employees"("id"),
  "pnd1_income_type" text DEFAULT '40_1' NOT NULL,
  "gross_salary" numeric(14, 2) NOT NULL,
  "bonus" numeric(14, 2) DEFAULT '0' NOT NULL,
  "bonus_treatment" text DEFAULT 'rolled_in' NOT NULL,
  "overtime" numeric(14, 2) DEFAULT '0' NOT NULL,
  "other_taxable_income" numeric(14, 2) DEFAULT '0' NOT NULL,
  "non_taxable_allowances" numeric(14, 2) DEFAULT '0' NOT NULL,
  "pit_wht" numeric(14, 2) NOT NULL,
  "sso_employee" numeric(14, 2) NOT NULL,
  "sso_employer" numeric(14, 2) NOT NULL,
  "provident_fund_employee" numeric(14, 2) DEFAULT '0' NOT NULL,
  "provident_fund_employer" numeric(14, 2) DEFAULT '0' NOT NULL,
  "other_deductions" numeric(14, 2) DEFAULT '0' NOT NULL,
  "severance_payment" numeric(14, 2) DEFAULT '0' NOT NULL,
  "accrued_leave_payout" numeric(14, 2) DEFAULT '0' NOT NULL,
  "inlieu_of_notice" numeric(14, 2) DEFAULT '0' NOT NULL,
  "special_treatment_override" boolean DEFAULT false NOT NULL,
  "special_treatment_note" text,
  "net_pay" numeric(14, 2) NOT NULL,
  "payment_method" text,
  "bank_transaction_id" uuid REFERENCES "transactions"("id"),
  "wht_certificate_id" uuid REFERENCES "wht_certificates"("id"),
  "pnd_filing_id" uuid REFERENCES "pnd_filings"("id"),
  "payload" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone,
  CONSTRAINT "pay_slips_income_type_check" CHECK ("pnd1_income_type" IN ('40_1', '40_2')),
  CONSTRAINT "pay_slips_bonus_treatment_check" CHECK ("bonus_treatment" IN ('rolled_in', 'separate_event')),
  CONSTRAINT "pay_slips_amounts_nonnegative_check" CHECK ("gross_salary" >= 0 AND "bonus" >= 0 AND "overtime" >= 0 AND "pit_wht" >= 0 AND "sso_employee" >= 0 AND "sso_employer" >= 0 AND "net_pay" >= 0),
  CONSTRAINT "pay_slips_override_note_check" CHECK ("special_treatment_override" = false OR "special_treatment_note" IS NOT NULL)
);

CREATE TABLE "pit_brackets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "effective_from" date NOT NULL,
  "effective_to" date,
  "lower_bound" numeric(14, 2) NOT NULL,
  "upper_bound" numeric(14, 2),
  "marginal_rate" numeric(5, 4) NOT NULL,
  "cumulative_tax_at_lower_bound" numeric(14, 2) NOT NULL,
  "source_citation" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone
);

CREATE TABLE "pit_standard_deductions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "effective_from" date NOT NULL,
  "effective_to" date,
  "employment_expense_pct" numeric(5, 4) NOT NULL,
  "employment_expense_cap" numeric(14, 2) NOT NULL,
  "personal_allowance" numeric(14, 2) NOT NULL,
  "spouse_allowance" numeric(14, 2) NOT NULL,
  "child_pre_2018_allowance" numeric(14, 2) NOT NULL,
  "child_post_2018_second_plus_allowance" numeric(14, 2) NOT NULL,
  "parent_allowance_per" numeric(14, 2) NOT NULL,
  "source_citation" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone
);

CREATE TABLE "sso_config" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "effective_from" date NOT NULL,
  "effective_to" date,
  "employee_rate" numeric(5, 4) NOT NULL,
  "employer_rate" numeric(5, 4) NOT NULL,
  "insurable_wage_floor" numeric(14, 2) NOT NULL,
  "insurable_wage_cap" numeric(14, 2) NOT NULL,
  "monthly_max_per_side" numeric(14, 2) NOT NULL,
  "source_citation" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone
);

CREATE INDEX "employees_org_establishment_idx" ON "employees" ("org_id", "establishment_id");
CREATE INDEX "employee_allowances_org_employee_idx" ON "employee_allowances" ("org_id", "employee_id");
CREATE INDEX "pay_runs_org_period_idx" ON "pay_runs" ("org_id", "period_start", "period_end");
CREATE INDEX "pnd_filings_org_form_period_idx" ON "pnd_filings" ("org_id", "form_type", "tax_period");
CREATE INDEX "sso_filings_org_month_idx" ON "sso_filings" ("org_id", "tax_month");
CREATE INDEX "pay_slips_org_employee_idx" ON "pay_slips" ("org_id", "employee_id");
CREATE INDEX "pay_slips_org_run_idx" ON "pay_slips" ("org_id", "pay_run_id");

CREATE OR REPLACE FUNCTION guard_payroll_establishment_same_org()
RETURNS trigger
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

CREATE TRIGGER guard_employees_establishment_org_trigger
BEFORE INSERT OR UPDATE OF org_id, establishment_id ON employees
FOR EACH ROW EXECUTE FUNCTION guard_payroll_establishment_same_org();

CREATE TRIGGER guard_pay_runs_establishment_org_trigger
BEFORE INSERT OR UPDATE OF org_id, establishment_id ON pay_runs
FOR EACH ROW EXECUTE FUNCTION guard_payroll_establishment_same_org();

CREATE TRIGGER guard_pnd_filings_establishment_org_trigger
BEFORE INSERT OR UPDATE OF org_id, establishment_id ON pnd_filings
FOR EACH ROW EXECUTE FUNCTION guard_payroll_establishment_same_org();

CREATE TRIGGER guard_sso_filings_establishment_org_trigger
BEFORE INSERT OR UPDATE OF org_id, establishment_id ON sso_filings
FOR EACH ROW EXECUTE FUNCTION guard_payroll_establishment_same_org();

CREATE TRIGGER guard_pay_slips_establishment_org_trigger
BEFORE INSERT OR UPDATE OF org_id, establishment_id ON pay_slips
FOR EACH ROW EXECUTE FUNCTION guard_payroll_establishment_same_org();

CREATE OR REPLACE FUNCTION guard_employee_allowance_same_org()
RETURNS trigger
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

CREATE TRIGGER guard_employee_allowances_same_org_trigger
BEFORE INSERT OR UPDATE OF org_id, employee_id ON employee_allowances
FOR EACH ROW EXECUTE FUNCTION guard_employee_allowance_same_org();

CREATE OR REPLACE FUNCTION guard_pay_slip_same_org()
RETURNS trigger
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

CREATE TRIGGER guard_pay_slips_same_org_trigger
BEFORE INSERT OR UPDATE OF org_id, pay_run_id, employee_id ON pay_slips
FOR EACH ROW EXECUTE FUNCTION guard_pay_slip_same_org();
