CREATE TABLE "tax_min_life_by_category" (
  "category" text PRIMARY KEY NOT NULL,
  "tax_useful_life_months_minimum" integer NOT NULL,
  "source_citation" text NOT NULL,
  "effective_from" date NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone,
  CONSTRAINT "tax_min_life_months_nonnegative_check" CHECK ("tax_useful_life_months_minimum" >= 0)
);

INSERT INTO "tax_min_life_by_category" (
  "category",
  "tax_useful_life_months_minimum",
  "source_citation",
  "effective_from"
) VALUES
  ('building', 240, 'Revenue Department corporate income tax depreciation table, https://www.rd.go.th/english/6044.html, retrieved 2026-05-16', '2026-05-16'),
  ('temporary_building', 12, 'Revenue Department corporate income tax depreciation table, https://www.rd.go.th/english/6044.html, retrieved 2026-05-16', '2026-05-16'),
  ('equipment', 60, 'Revenue Department corporate income tax depreciation table, https://www.rd.go.th/english/6044.html, retrieved 2026-05-16', '2026-05-16'),
  ('vehicle', 60, 'Revenue Department corporate income tax depreciation table, https://www.rd.go.th/english/6044.html, retrieved 2026-05-16', '2026-05-16'),
  ('furniture_fixtures', 60, 'Revenue Department corporate income tax depreciation table, https://www.rd.go.th/english/6044.html, retrieved 2026-05-16', '2026-05-16'),
  ('computer_hardware', 36, 'Revenue Department corporate income tax depreciation table, https://www.rd.go.th/english/6044.html, retrieved 2026-05-16', '2026-05-16'),
  ('computer_software', 36, 'Revenue Department corporate income tax depreciation table, https://www.rd.go.th/english/6044.html, retrieved 2026-05-16', '2026-05-16'),
  ('leasehold_improvement', 120, 'Revenue Department corporate income tax depreciation table, https://www.rd.go.th/english/6044.html, retrieved 2026-05-16', '2026-05-16'),
  ('intangible_other', 120, 'Revenue Department corporate income tax depreciation table, https://www.rd.go.th/english/6044.html, retrieved 2026-05-16', '2026-05-16'),
  ('natural_resource_right', 240, 'Revenue Department corporate income tax depreciation table, https://www.rd.go.th/english/6044.html, retrieved 2026-05-16', '2026-05-16'),
  ('land', 0, 'Land is not depreciable; tracked as register-only for book/tax workflow, retrieved 2026-05-16', '2026-05-16')
ON CONFLICT ("category") DO NOTHING;

CREATE TABLE "fixed_assets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "establishment_id" uuid REFERENCES "establishments"("id"),
  "asset_code" text NOT NULL,
  "name_th" text,
  "name_en" text NOT NULL,
  "category" text NOT NULL,
  "gl_account_id" uuid REFERENCES "gl_accounts"("id"),
  "accumulated_depreciation_account_id" uuid REFERENCES "gl_accounts"("id"),
  "depreciation_expense_account_id" uuid REFERENCES "gl_accounts"("id"),
  "acquisition_date" date NOT NULL,
  "acquisition_document_id" uuid REFERENCES "documents"("id"),
  "original_cost" numeric(14, 2) NOT NULL,
  "salvage_value" numeric(14, 2) DEFAULT '0' NOT NULL,
  "useful_life_months" integer NOT NULL,
  "tax_useful_life_months_minimum" integer NOT NULL,
  "depreciation_method" text DEFAULT 'straight_line' NOT NULL,
  "depreciation_start_date" date NOT NULL,
  "disposed_at" date,
  "disposal_proceeds" numeric(14, 2),
  "disposal_document_id" uuid REFERENCES "documents"("id"),
  "gain_loss_on_disposal" numeric(14, 2),
  "boi_segment" text DEFAULT 'n_a' NOT NULL,
  "serial_number" text,
  "location" text,
  "assigned_to_employee_id" uuid REFERENCES "employees"("id"),
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone,
  "deleted_at" timestamp with time zone,
  CONSTRAINT "fixed_assets_org_code_uniq" UNIQUE("org_id", "asset_code"),
  CONSTRAINT "fixed_assets_category_check" CHECK ("category" IN ('building', 'temporary_building', 'equipment', 'vehicle', 'furniture_fixtures', 'computer_hardware', 'computer_software', 'leasehold_improvement', 'intangible_other', 'natural_resource_right', 'land')),
  CONSTRAINT "fixed_assets_amounts_nonnegative_check" CHECK ("original_cost" >= 0 AND "salvage_value" >= 0),
  CONSTRAINT "fixed_assets_life_check" CHECK (("depreciation_method" = 'not_depreciable' AND "useful_life_months" = 0) OR ("depreciation_method" = 'straight_line' AND "useful_life_months" > 0)),
  CONSTRAINT "fixed_assets_tax_life_nonnegative_check" CHECK ("tax_useful_life_months_minimum" >= 0),
  CONSTRAINT "fixed_assets_method_check" CHECK ("depreciation_method" IN ('straight_line', 'not_depreciable')),
  CONSTRAINT "fixed_assets_disposal_check" CHECK ("disposed_at" IS NULL OR "disposal_proceeds" IS NOT NULL)
);

CREATE TABLE "depreciation_schedule" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "fixed_asset_id" uuid NOT NULL REFERENCES "fixed_assets"("id"),
  "period_year" integer NOT NULL,
  "period_month" integer NOT NULL,
  "depreciation_amount" numeric(14, 2) NOT NULL,
  "tax_depreciation_capped_amount" numeric(14, 2) NOT NULL,
  "book_tax_difference" numeric(14, 2) NOT NULL,
  "accumulated_depreciation_after" numeric(14, 2) NOT NULL,
  "book_value_after" numeric(14, 2) NOT NULL,
  "journal_entry_id" uuid REFERENCES "journal_entries"("id"),
  "posted_at" timestamp with time zone,
  "is_partial_month" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone,
  CONSTRAINT "depreciation_schedule_asset_period_uniq" UNIQUE("org_id", "fixed_asset_id", "period_year", "period_month"),
  CONSTRAINT "depreciation_schedule_period_month_check" CHECK ("period_month" BETWEEN 1 AND 12),
  CONSTRAINT "depreciation_schedule_amounts_nonnegative_check" CHECK ("depreciation_amount" >= 0 AND "tax_depreciation_capped_amount" >= 0 AND "accumulated_depreciation_after" >= 0 AND "book_value_after" >= 0)
);

CREATE UNIQUE INDEX "fixed_assets_id_org_uniq" ON "fixed_assets" ("id", "org_id");
CREATE INDEX "fixed_assets_org_category_idx" ON "fixed_assets" ("org_id", "category");
CREATE INDEX "fixed_assets_org_acquisition_idx" ON "fixed_assets" ("org_id", "acquisition_date");
CREATE INDEX "depreciation_schedule_org_period_idx" ON "depreciation_schedule" ("org_id", "period_year", "period_month");

CREATE OR REPLACE FUNCTION guard_fixed_asset_establishment_same_org()
RETURNS trigger
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

CREATE TRIGGER guard_fixed_asset_establishment_org_trigger
BEFORE INSERT OR UPDATE OF org_id, establishment_id ON fixed_assets
FOR EACH ROW EXECUTE FUNCTION guard_fixed_asset_establishment_same_org();

CREATE OR REPLACE FUNCTION guard_fixed_asset_refs_same_org()
RETURNS trigger
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

CREATE TRIGGER guard_fixed_asset_refs_org_trigger
BEFORE INSERT OR UPDATE OF org_id, gl_account_id, accumulated_depreciation_account_id, depreciation_expense_account_id, acquisition_document_id, disposal_document_id, assigned_to_employee_id ON fixed_assets
FOR EACH ROW EXECUTE FUNCTION guard_fixed_asset_refs_same_org();

CREATE OR REPLACE FUNCTION guard_depreciation_schedule_same_org()
RETURNS trigger
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

CREATE TRIGGER guard_depreciation_schedule_same_org_trigger
BEFORE INSERT OR UPDATE OF org_id, fixed_asset_id, journal_entry_id ON depreciation_schedule
FOR EACH ROW EXECUTE FUNCTION guard_depreciation_schedule_same_org();
