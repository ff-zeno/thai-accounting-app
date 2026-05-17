CREATE TABLE "cit_brackets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "effective_from" date NOT NULL,
  "effective_to" date,
  "entity_type" text NOT NULL,
  "lower_bound" numeric(14, 2) NOT NULL,
  "upper_bound" numeric(14, 2),
  "marginal_rate" numeric(5, 4) NOT NULL,
  "source_citation" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone,
  CONSTRAINT "cit_brackets_entity_type_check" CHECK ("entity_type" IN ('sme_qualifying', 'standard')),
  CONSTRAINT "cit_brackets_bounds_check" CHECK ("lower_bound" >= 0 AND ("upper_bound" IS NULL OR "upper_bound" > "lower_bound")),
  CONSTRAINT "cit_brackets_rate_check" CHECK ("marginal_rate" >= 0 AND "marginal_rate" <= 1)
);

INSERT INTO "cit_brackets" (
  "effective_from",
  "entity_type",
  "lower_bound",
  "upper_bound",
  "marginal_rate",
  "source_citation"
) VALUES
  ('2026-05-16', 'standard', '0.00', NULL, '0.2000', 'Revenue Department corporate income tax overview, https://www.rd.go.th/english/6044.html, retrieved 2026-05-16'),
  ('2026-05-16', 'sme_qualifying', '0.00', '300000.00', '0.0000', 'Revenue Department corporate income tax overview, https://www.rd.go.th/english/6044.html, retrieved 2026-05-16'),
  ('2026-05-16', 'sme_qualifying', '300000.00', '3000000.00', '0.1500', 'Revenue Department corporate income tax overview, https://www.rd.go.th/english/6044.html, retrieved 2026-05-16'),
  ('2026-05-16', 'sme_qualifying', '3000000.00', NULL, '0.2000', 'Revenue Department corporate income tax overview, https://www.rd.go.th/english/6044.html, retrieved 2026-05-16');

CREATE TABLE "cit_filings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "tax_year" integer NOT NULL,
  "filing_type" text NOT NULL,
  "period_start" date NOT NULL,
  "period_end" date NOT NULL,
  "filing_status" text DEFAULT 'draft' NOT NULL,
  "submitted_at" timestamp with time zone,
  "accepted_at" timestamp with time zone,
  "revenue_total" numeric(14, 2),
  "cogs_total" numeric(14, 2),
  "expense_total" numeric(14, 2),
  "accounting_profit" numeric(14, 2),
  "book_tax_adjustments_payload" jsonb,
  "taxable_income" numeric(14, 2),
  "taxable_loss" numeric(14, 2),
  "losses_consumed_this_year" numeric(14, 2),
  "cit_rate" numeric(5, 4),
  "cit_calculated" numeric(14, 2),
  "wht_credits_used" numeric(14, 2),
  "prepayment_credits_used" numeric(14, 2),
  "pnd51_method" text,
  "pnd51_projected_full_year_profit" numeric(14, 2),
  "pnd51_h1_actual_profit" numeric(14, 2),
  "pnd51_estimate_rationale" text,
  "cit_payable" numeric(14, 2),
  "paid_at" timestamp with time zone,
  "bank_transaction_id" uuid REFERENCES "transactions"("id"),
  "is_amendment" boolean DEFAULT false NOT NULL,
  "amends_filing_id" uuid,
  "rd_reference_number" text,
  "confirmation_document_id" uuid REFERENCES "documents"("id"),
  "working_paper_document_id" uuid REFERENCES "documents"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone,
  CONSTRAINT "cit_filings_org_year_type_amendment_uniq" UNIQUE("org_id", "tax_year", "filing_type", "is_amendment", "amends_filing_id"),
  CONSTRAINT "cit_filings_type_check" CHECK ("filing_type" IN ('pnd51', 'pnd50')),
  CONSTRAINT "cit_filings_status_check" CHECK ("filing_status" IN ('draft', 'submitted', 'accepted')),
  CONSTRAINT "cit_filings_pnd51_method_check" CHECK ("pnd51_method" IS NULL OR "pnd51_method" IN ('projected_full_year', 'actual_h1_books'))
);

CREATE TABLE "book_tax_adjustments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "tax_year" integer NOT NULL,
  "description" text NOT NULL,
  "gl_account_id" uuid REFERENCES "gl_accounts"("id"),
  "amount" numeric(14, 2) NOT NULL,
  "direction" text NOT NULL,
  "category" text NOT NULL,
  "notes" text,
  "audit_log_ref" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone,
  CONSTRAINT "book_tax_adjustments_direction_check" CHECK ("direction" IN ('add_back', 'deduct')),
  CONSTRAINT "book_tax_adjustments_amount_check" CHECK ("amount" >= 0)
);

CREATE TABLE "loss_carry_forward_layers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "originated_tax_year" integer NOT NULL,
  "expiry_tax_year" integer NOT NULL,
  "original_amount" numeric(14, 2) NOT NULL,
  "remaining_amount" numeric(14, 2) NOT NULL,
  "expired_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone,
  CONSTRAINT "loss_carry_forward_layers_org_year_uniq" UNIQUE("org_id", "originated_tax_year"),
  CONSTRAINT "loss_carry_forward_layers_year_check" CHECK ("expiry_tax_year" = "originated_tax_year" + 5),
  CONSTRAINT "loss_carry_forward_layers_amount_check" CHECK ("original_amount" >= 0 AND "remaining_amount" >= 0 AND "remaining_amount" <= "original_amount")
);

CREATE INDEX "cit_brackets_lookup_idx" ON "cit_brackets" ("entity_type", "effective_from");
CREATE INDEX "cit_filings_org_year_idx" ON "cit_filings" ("org_id", "tax_year");
CREATE INDEX "book_tax_adjustments_org_year_idx" ON "book_tax_adjustments" ("org_id", "tax_year");
CREATE INDEX "loss_carry_forward_layers_org_expiry_idx" ON "loss_carry_forward_layers" ("org_id", "expiry_tax_year");

CREATE OR REPLACE FUNCTION guard_cit_filing_refs_same_org()
RETURNS trigger
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

CREATE TRIGGER guard_cit_filing_refs_org_trigger
BEFORE INSERT OR UPDATE OF org_id, bank_transaction_id, confirmation_document_id, working_paper_document_id ON cit_filings
FOR EACH ROW EXECUTE FUNCTION guard_cit_filing_refs_same_org();

CREATE OR REPLACE FUNCTION guard_book_tax_adjustment_same_org()
RETURNS trigger
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

CREATE TRIGGER guard_book_tax_adjustment_org_trigger
BEFORE INSERT OR UPDATE OF org_id, gl_account_id ON book_tax_adjustments
FOR EACH ROW EXECUTE FUNCTION guard_book_tax_adjustment_same_org();
