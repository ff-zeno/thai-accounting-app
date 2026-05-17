CREATE TABLE "establishments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "branch_number" varchar(7) NOT NULL,
  "name_th" text,
  "name_en" text,
  "address_line1" text,
  "address_line2" text,
  "subdistrict" text,
  "district" text,
  "province" text,
  "postcode" text,
  "is_head_office" boolean DEFAULT false NOT NULL,
  "requires_manual_mapping" boolean DEFAULT false NOT NULL,
  "consolidated_filing_approved" boolean DEFAULT false NOT NULL,
  "consolidated_under_branch_id" uuid,
  "vat_registered" boolean DEFAULT true NOT NULL,
  "tax_id" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone,
  "deleted_at" timestamp with time zone,
  CONSTRAINT "establishments_consolidated_under_branch_id_fk" FOREIGN KEY ("consolidated_under_branch_id") REFERENCES "establishments"("id"),
  CONSTRAINT "establishments_org_branch_uniq" UNIQUE("org_id", "branch_number"),
  CONSTRAINT "establishments_branch_number_check" CHECK ("branch_number" ~ '^(00000|[0-9]{5}|UNKNOWN)$')
);

CREATE TABLE "sales_transactions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "establishment_id" uuid NOT NULL REFERENCES "establishments"("id"),
  "event_role" text NOT NULL,
  "source" text NOT NULL,
  "external_id" text NOT NULL,
  "sold_at" timestamp with time zone NOT NULL,
  "channel" text NOT NULL,
  "pricing_mode" text NOT NULL,
  "amount_including_vat" numeric(14, 2) NOT NULL,
  "tax_base_ex_vat" numeric(14, 2) NOT NULL,
  "vat_amount" numeric(14, 2) NOT NULL,
  "vat_rate" numeric(5, 4) DEFAULT '0.0700' NOT NULL,
  "discount_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
  "discount_funded_by" text,
  "tip_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
  "tax_invoice_type" text,
  "tax_invoice_number" text,
  "terminal_id" text,
  "superseded_by_id" uuid,
  "is_deemed_supply" boolean DEFAULT false NOT NULL,
  "deemed_supply_basis" text,
  "original_currency" text,
  "fx_rate" numeric(18, 8),
  "fx_source" text,
  "payload" jsonb,
  "clearing_account_key" text NOT NULL,
  "settlement_status" text DEFAULT 'pending' NOT NULL,
  "settlement_aged_at" timestamp with time zone,
  "settled_transaction_id" uuid REFERENCES "transactions"("id"),
  "settled_at" timestamp with time zone,
  "voided_at" timestamp with time zone,
  "voided_by_terminal_user" text,
  "void_reason" text,
  "credit_note_for_id" uuid,
  "credit_note_reason" text,
  "is_voucher_redemption" boolean DEFAULT false NOT NULL,
  "voucher_sales_id" uuid,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone,
  "deleted_at" timestamp with time zone,
  CONSTRAINT "sales_transactions_superseded_by_id_fk" FOREIGN KEY ("superseded_by_id") REFERENCES "sales_transactions"("id"),
  CONSTRAINT "sales_transactions_credit_note_for_id_fk" FOREIGN KEY ("credit_note_for_id") REFERENCES "sales_transactions"("id"),
  CONSTRAINT "sales_transactions_source_external_uniq" UNIQUE("org_id", "source", "external_id"),
  CONSTRAINT "sales_transactions_event_role_check" CHECK ("event_role" IN ('pos_primary', 'processor_shadow')),
  CONSTRAINT "sales_transactions_pricing_mode_check" CHECK ("pricing_mode" IN ('vat_inclusive', 'vat_exclusive')),
  CONSTRAINT "sales_transactions_pos_primary_invoice_check" CHECK ("event_role" <> 'pos_primary' OR "tax_invoice_type" IS NOT NULL),
  CONSTRAINT "sales_transactions_amounts_nonnegative_check" CHECK ("amount_including_vat" >= 0 AND "tax_base_ex_vat" >= 0 AND "vat_amount" >= 0)
);

CREATE TABLE "voucher_sales" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "establishment_id" uuid NOT NULL REFERENCES "establishments"("id"),
  "sold_at" timestamp with time zone NOT NULL,
  "voucher_code" text NOT NULL,
  "face_value" numeric(14, 2) NOT NULL,
  "payment_received" numeric(14, 2) NOT NULL,
  "expires_at" date,
  "redeemed_at" timestamp with time zone,
  "redemption_sales_transaction_id" uuid REFERENCES "sales_transactions"("id"),
  "payload" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone,
  "deleted_at" timestamp with time zone,
  CONSTRAINT "voucher_sales_org_code_uniq" UNIQUE("org_id", "voucher_code"),
  CONSTRAINT "voucher_sales_amounts_nonnegative_check" CHECK ("face_value" >= 0 AND "payment_received" >= 0)
);

ALTER TABLE "sales_transactions"
  ADD CONSTRAINT "sales_transactions_voucher_sales_id_fk" FOREIGN KEY ("voucher_sales_id") REFERENCES "voucher_sales"("id");

CREATE TABLE "processor_settlements" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "establishment_id" uuid REFERENCES "establishments"("id"),
  "processor" text NOT NULL,
  "external_id" text NOT NULL,
  "period_start" timestamp with time zone,
  "period_end" timestamp with time zone,
  "gross_amount" numeric(14, 2) NOT NULL,
  "fee_amount" numeric(14, 2) NOT NULL,
  "fee_vat_amount" numeric(14, 2),
  "net_payout" numeric(14, 2) NOT NULL,
  "processor_tax_invoice_document_id" uuid REFERENCES "documents"("id"),
  "processor_ti_received_at" timestamp with time zone,
  "processor_ti_number" text,
  "bank_transaction_id" uuid REFERENCES "transactions"("id"),
  "payload" jsonb,
  "reconciliation_status" text DEFAULT 'unreconciled' NOT NULL,
  "reconciliation_discrepancy" numeric(14, 2),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone,
  CONSTRAINT "processor_settlements_source_external_uniq" UNIQUE("org_id", "processor", "external_id"),
  CONSTRAINT "processor_settlements_fee_vat_document_check" CHECK ("fee_vat_amount" IS NULL OR "fee_vat_amount" = 0 OR "processor_tax_invoice_document_id" IS NOT NULL)
);

CREATE TABLE "cash_deposits" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "establishment_id" uuid NOT NULL REFERENCES "establishments"("id"),
  "deposit_slip_document_id" uuid REFERENCES "documents"("id"),
  "deposited_at" date NOT NULL,
  "deposited_by" text,
  "bank_account_id" uuid REFERENCES "bank_accounts"("id"),
  "amount" numeric(14, 2) NOT NULL,
  "slip_reference" text,
  "bank_transaction_id" uuid REFERENCES "transactions"("id"),
  "pos_cash_period_start" date,
  "pos_cash_period_end" date,
  "cash_variance" numeric(14, 2),
  "variance_resolution_status" text DEFAULT 'open' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone,
  CONSTRAINT "cash_deposits_amount_nonnegative_check" CHECK ("amount" >= 0)
);

CREATE UNIQUE INDEX "establishments_id_org_uniq" ON "establishments" ("id", "org_id");
CREATE INDEX "establishments_org_idx" ON "establishments" ("org_id");
CREATE UNIQUE INDEX "sales_transactions_id_org_uniq" ON "sales_transactions" ("id", "org_id");
CREATE UNIQUE INDEX "sales_transactions_tax_invoice_active_uniq" ON "sales_transactions" ("org_id", "establishment_id", "terminal_id", "tax_invoice_number") WHERE "tax_invoice_number" IS NOT NULL AND "superseded_by_id" IS NULL;
CREATE INDEX "sales_transactions_sold_at_idx" ON "sales_transactions" ("org_id", "establishment_id", "sold_at");
CREATE INDEX "sales_transactions_clearing_idx" ON "sales_transactions" ("org_id", "clearing_account_key", "settlement_status");
CREATE INDEX "sales_transactions_event_role_idx" ON "sales_transactions" ("org_id", "event_role", "sold_at");
CREATE INDEX "voucher_sales_org_establishment_idx" ON "voucher_sales" ("org_id", "establishment_id");
CREATE INDEX "processor_settlements_org_status_idx" ON "processor_settlements" ("org_id", "reconciliation_status");
CREATE INDEX "cash_deposits_org_establishment_date_idx" ON "cash_deposits" ("org_id", "establishment_id", "deposited_at");

CREATE OR REPLACE FUNCTION guard_establishment_same_org()
RETURNS trigger
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

CREATE TRIGGER guard_sales_transactions_establishment_org_trigger
BEFORE INSERT OR UPDATE OF org_id, establishment_id ON sales_transactions
FOR EACH ROW EXECUTE FUNCTION guard_establishment_same_org();

CREATE TRIGGER guard_voucher_sales_establishment_org_trigger
BEFORE INSERT OR UPDATE OF org_id, establishment_id ON voucher_sales
FOR EACH ROW EXECUTE FUNCTION guard_establishment_same_org();

CREATE TRIGGER guard_cash_deposits_establishment_org_trigger
BEFORE INSERT OR UPDATE OF org_id, establishment_id ON cash_deposits
FOR EACH ROW EXECUTE FUNCTION guard_establishment_same_org();

CREATE OR REPLACE FUNCTION guard_processor_settlement_establishment_org()
RETURNS trigger
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

CREATE TRIGGER guard_processor_settlements_establishment_org_trigger
BEFORE INSERT OR UPDATE OF org_id, establishment_id ON processor_settlements
FOR EACH ROW EXECUTE FUNCTION guard_processor_settlement_establishment_org();
