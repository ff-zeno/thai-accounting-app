CREATE TABLE "imports" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "establishment_id" uuid NOT NULL REFERENCES "establishments"("id"),
  "import_reference" text,
  "supplier_vendor_id" uuid REFERENCES "vendors"("id"),
  "customs_declaration_number" text,
  "arrival_port" text,
  "arrival_date" date NOT NULL,
  "customs_clearance_date" date NOT NULL,
  "original_currency" text NOT NULL,
  "fx_rate_at_clearance" numeric(18, 8) NOT NULL,
  "cif_original" numeric(14, 2),
  "cif_thb" numeric(14, 2),
  "customs_assessed_duty_thb" numeric(14, 2) DEFAULT '0' NOT NULL,
  "customs_assessed_excise_thb" numeric(14, 2) DEFAULT '0' NOT NULL,
  "customs_assessed_import_vat_thb" numeric(14, 2) DEFAULT '0' NOT NULL,
  "is_finalized" boolean DEFAULT false NOT NULL,
  "finalized_at" timestamp with time zone,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone,
  "deleted_at" timestamp with time zone,
  CONSTRAINT "imports_org_reference_uniq" UNIQUE("org_id", "import_reference"),
  CONSTRAINT "imports_fx_positive_check" CHECK ("fx_rate_at_clearance" > 0),
  CONSTRAINT "imports_assessed_amounts_nonnegative_check" CHECK (
    "customs_assessed_duty_thb" >= 0
    AND "customs_assessed_excise_thb" >= 0
    AND "customs_assessed_import_vat_thb" >= 0
  ),
  CONSTRAINT "imports_finalized_at_check" CHECK ("is_finalized" = false OR "finalized_at" IS NOT NULL)
);

CREATE TABLE "import_documents" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "import_id" uuid NOT NULL REFERENCES "imports"("id"),
  "document_id" uuid NOT NULL REFERENCES "documents"("id"),
  "document_role" text NOT NULL,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "import_documents_unique_doc" UNIQUE("import_id", "document_id"),
  CONSTRAINT "import_documents_role_check" CHECK ("document_role" IN ('foreign_supplier_invoice', 'customs_declaration', 'broker_invoice', 'shipping_invoice', 'insurance_invoice', 'bank_remittance_advice', 'other'))
);

CREATE TABLE "import_goods_lines" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "import_id" uuid NOT NULL REFERENCES "imports"("id"),
  "sku_id" uuid,
  "sku_code" text NOT NULL,
  "description" text,
  "quantity" numeric(14, 4) NOT NULL,
  "unit_price_original" numeric(14, 4) NOT NULL,
  "goods_value_original" numeric(14, 2),
  "goods_value_thb" numeric(14, 2),
  "weight_kg" numeric(14, 4),
  "lot_sequence" integer DEFAULT 1 NOT NULL,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone,
  CONSTRAINT "import_goods_lines_lot_unique" UNIQUE("import_id", "sku_code", "lot_sequence"),
  CONSTRAINT "import_goods_lines_positive_qty_check" CHECK ("quantity" > 0),
  CONSTRAINT "import_goods_lines_amounts_nonnegative_check" CHECK (
    "unit_price_original" >= 0
    AND ("goods_value_original" IS NULL OR "goods_value_original" >= 0)
    AND ("goods_value_thb" IS NULL OR "goods_value_thb" >= 0)
    AND ("weight_kg" IS NULL OR "weight_kg" >= 0)
  )
);

CREATE TABLE "import_charge_lines" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "import_id" uuid NOT NULL REFERENCES "imports"("id"),
  "source_document_id" uuid NOT NULL REFERENCES "documents"("id"),
  "line_description" text NOT NULL,
  "amount_thb" numeric(14, 2) NOT NULL,
  "original_currency" text DEFAULT 'THB' NOT NULL,
  "original_amount" numeric(14, 2) NOT NULL,
  "fx_rate_applied" numeric(18, 8),
  "fx_source" text,
  "fx_date" date,
  "vat_treatment" text NOT NULL,
  "vat_amount_thb" numeric(14, 2) DEFAULT '0' NOT NULL,
  "expense_account_id" uuid REFERENCES "gl_accounts"("id"),
  "vat_period_override" text,
  "late_claim_reason" text,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone,
  CONSTRAINT "import_charge_lines_treatment_check" CHECK ("vat_treatment" IN ('service_with_vat_pct', 'service_with_vat_zero', 'service_vat_exempt', 'is_import_vat', 'is_pass_through', 'excise_pass_through')),
  CONSTRAINT "import_charge_lines_amount_nonnegative_check" CHECK ("amount_thb" >= 0 AND "original_amount" >= 0 AND "vat_amount_thb" >= 0),
  CONSTRAINT "import_charge_lines_fx_positive_check" CHECK ("fx_rate_applied" IS NULL OR "fx_rate_applied" > 0),
  CONSTRAINT "import_charge_lines_import_vat_override_check" CHECK (
    "vat_treatment" <> 'is_import_vat'
    OR (
      "vat_period_override" IS NOT NULL
      AND "vat_period_override" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
      AND "expense_account_id" IS NULL
    )
  )
);

CREATE TABLE "import_payments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "import_id" uuid NOT NULL REFERENCES "imports"("id"),
  "bank_transaction_id" uuid NOT NULL REFERENCES "transactions"("id"),
  "payment_role" text NOT NULL,
  "amount_thb" numeric(14, 2) NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "import_payments_role_check" CHECK ("payment_role" IN ('foreign_supplier_payment', 'broker_settlement', 'shipper_settlement', 'customs_direct_payment')),
  CONSTRAINT "import_payments_amount_nonnegative_check" CHECK ("amount_thb" >= 0)
);

CREATE UNIQUE INDEX "imports_id_org_uniq" ON "imports" ("id", "org_id");
CREATE INDEX "imports_org_clearance_idx" ON "imports" ("org_id", "customs_clearance_date");
CREATE INDEX "import_documents_org_import_idx" ON "import_documents" ("org_id", "import_id");
CREATE INDEX "import_goods_lines_org_import_idx" ON "import_goods_lines" ("org_id", "import_id");
CREATE INDEX "import_charge_lines_import_doc_idx" ON "import_charge_lines" ("import_id", "source_document_id");
CREATE INDEX "import_charge_lines_treatment_idx" ON "import_charge_lines" ("import_id", "vat_treatment");
CREATE UNIQUE INDEX "import_charge_lines_import_vat_per_doc_uniq"
  ON "import_charge_lines" ("import_id", "source_document_id")
  WHERE "vat_treatment" = 'is_import_vat';
CREATE INDEX "import_payments_role_idx" ON "import_payments" ("import_id", "payment_role");

CREATE OR REPLACE FUNCTION guard_import_packet_same_org()
RETURNS trigger
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

CREATE TRIGGER guard_imports_same_org_trigger
BEFORE INSERT OR UPDATE OF org_id, establishment_id, supplier_vendor_id ON imports
FOR EACH ROW EXECUTE FUNCTION guard_import_packet_same_org();

CREATE OR REPLACE FUNCTION guard_import_child_same_org()
RETURNS trigger
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

CREATE TRIGGER guard_import_documents_same_org_trigger
BEFORE INSERT OR UPDATE OF org_id, import_id, document_id ON import_documents
FOR EACH ROW EXECUTE FUNCTION guard_import_child_same_org();

CREATE TRIGGER guard_import_goods_lines_same_org_trigger
BEFORE INSERT OR UPDATE OF org_id, import_id ON import_goods_lines
FOR EACH ROW EXECUTE FUNCTION guard_import_child_same_org();

CREATE TRIGGER guard_import_charge_lines_same_org_trigger
BEFORE INSERT OR UPDATE OF org_id, import_id, source_document_id, expense_account_id ON import_charge_lines
FOR EACH ROW EXECUTE FUNCTION guard_import_child_same_org();

CREATE TRIGGER guard_import_payments_same_org_trigger
BEFORE INSERT OR UPDATE OF org_id, import_id, bank_transaction_id ON import_payments
FOR EACH ROW EXECUTE FUNCTION guard_import_child_same_org();

CREATE OR REPLACE FUNCTION guard_finalized_import_child_immutability()
RETURNS trigger
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

CREATE TRIGGER guard_import_documents_finalized_delete_trigger
BEFORE DELETE ON import_documents
FOR EACH ROW EXECUTE FUNCTION guard_finalized_import_child_immutability();

CREATE TRIGGER guard_import_documents_finalized_update_trigger
BEFORE UPDATE ON import_documents
FOR EACH ROW EXECUTE FUNCTION guard_finalized_import_child_immutability();

CREATE TRIGGER guard_import_goods_lines_finalized_delete_trigger
BEFORE DELETE ON import_goods_lines
FOR EACH ROW EXECUTE FUNCTION guard_finalized_import_child_immutability();

CREATE TRIGGER guard_import_goods_lines_finalized_update_trigger
BEFORE UPDATE ON import_goods_lines
FOR EACH ROW EXECUTE FUNCTION guard_finalized_import_child_immutability();

CREATE TRIGGER guard_import_charge_lines_finalized_delete_trigger
BEFORE DELETE ON import_charge_lines
FOR EACH ROW EXECUTE FUNCTION guard_finalized_import_child_immutability();

CREATE TRIGGER guard_import_charge_lines_finalized_update_trigger
BEFORE UPDATE ON import_charge_lines
FOR EACH ROW EXECUTE FUNCTION guard_finalized_import_child_immutability();

CREATE TRIGGER guard_import_payments_finalized_delete_trigger
BEFORE DELETE ON import_payments
FOR EACH ROW EXECUTE FUNCTION guard_finalized_import_child_immutability();

CREATE TRIGGER guard_import_payments_finalized_update_trigger
BEFORE UPDATE ON import_payments
FOR EACH ROW EXECUTE FUNCTION guard_finalized_import_child_immutability();

CREATE OR REPLACE FUNCTION guard_import_finalize()
RETURNS trigger
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

CREATE TRIGGER guard_import_finalize_update_trigger
BEFORE UPDATE ON imports
FOR EACH ROW EXECUTE FUNCTION guard_import_finalize();

CREATE TRIGGER guard_import_finalize_delete_trigger
BEFORE DELETE ON imports
FOR EACH ROW EXECUTE FUNCTION guard_import_finalize();
