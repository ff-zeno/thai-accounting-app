CREATE TABLE "close_checklists" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "establishment_id" uuid REFERENCES "establishments"("id"),
  "period_year" integer NOT NULL,
  "period_month" integer NOT NULL,
  "status" text DEFAULT 'open' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone,
  CONSTRAINT "close_checklists_org_period_uniq" UNIQUE("org_id", "establishment_id", "period_year", "period_month"),
  CONSTRAINT "close_checklists_period_month_check" CHECK ("period_month" BETWEEN 1 AND 12),
  CONSTRAINT "close_checklists_status_check" CHECK ("status" IN ('open', 'in_progress', 'closed'))
);

CREATE TABLE "close_checklist_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "checklist_id" uuid NOT NULL REFERENCES "close_checklists"("id"),
  "sequence" integer NOT NULL,
  "item_key" text NOT NULL,
  "description" text NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "assigned_to_user_id" text,
  "completed_by_user_id" text,
  "completed_at" timestamp with time zone,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone,
  CONSTRAINT "close_checklist_items_sequence_uniq" UNIQUE("checklist_id", "sequence"),
  CONSTRAINT "close_checklist_items_key_uniq" UNIQUE("checklist_id", "item_key"),
  CONSTRAINT "close_checklist_items_sequence_positive_check" CHECK ("sequence" > 0),
  CONSTRAINT "close_checklist_items_status_check" CHECK ("status" IN ('pending', 'done', 'skipped', 'blocked')),
  CONSTRAINT "close_checklist_items_completed_check" CHECK ("status" <> 'done' OR "completed_at" IS NOT NULL)
);

CREATE TABLE "cost_centers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "code" text NOT NULL,
  "name_th" text,
  "name_en" text NOT NULL,
  "parent_id" uuid REFERENCES "cost_centers"("id"),
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone,
  "deleted_at" timestamp with time zone,
  CONSTRAINT "cost_centers_org_code_uniq" UNIQUE("org_id", "code")
);

CREATE TABLE "projects" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "code" text NOT NULL,
  "name_th" text,
  "name_en" text NOT NULL,
  "customer_vendor_id" uuid REFERENCES "vendors"("id"),
  "start_date" date,
  "end_date" date,
  "status" text DEFAULT 'active' NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone,
  "deleted_at" timestamp with time zone,
  CONSTRAINT "projects_org_code_uniq" UNIQUE("org_id", "code"),
  CONSTRAINT "projects_status_check" CHECK ("status" IN ('planned', 'active', 'paused', 'completed', 'cancelled'))
);

CREATE TABLE "fx_rates_bot" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "rate_date" date NOT NULL,
  "currency" varchar(3) NOT NULL,
  "buying_rate" numeric(18, 8),
  "selling_rate" numeric(18, 8),
  "mid_rate" numeric(18, 8) NOT NULL,
  "source_url" text NOT NULL,
  "fetched_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone,
  CONSTRAINT "fx_rates_bot_date_currency_uniq" UNIQUE("rate_date", "currency"),
  CONSTRAINT "fx_rates_bot_mid_positive_check" CHECK ("mid_rate" > 0)
);

CREATE TABLE "fx_valuation_layers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "monetary_item_type" text NOT NULL,
  "monetary_item_id" uuid NOT NULL,
  "original_amount" numeric(14, 2) NOT NULL,
  "original_currency" varchar(3) NOT NULL,
  "valuation_date" date NOT NULL,
  "valuation_rate" numeric(18, 8) NOT NULL,
  "valued_thb_amount" numeric(14, 2) NOT NULL,
  "prior_valuation_id" uuid REFERENCES "fx_valuation_layers"("id"),
  "journal_entry_id" uuid REFERENCES "journal_entries"("id"),
  "realized" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone,
  CONSTRAINT "fx_valuation_layers_item_date_uniq" UNIQUE("org_id", "monetary_item_type", "monetary_item_id", "valuation_date"),
  CONSTRAINT "fx_valuation_layers_type_check" CHECK ("monetary_item_type" IN ('bank_account', 'ar_invoice', 'ap_invoice', 'loan', 'wht_credit_received')),
  CONSTRAINT "fx_valuation_layers_positive_check" CHECK ("valuation_rate" > 0 AND "valued_thb_amount" >= 0)
);

CREATE INDEX "close_checklists_org_status_idx" ON "close_checklists" ("org_id", "status");
CREATE INDEX "close_checklist_items_org_status_idx" ON "close_checklist_items" ("org_id", "status");
CREATE UNIQUE INDEX "cost_centers_id_org_uniq" ON "cost_centers" ("id", "org_id");
CREATE UNIQUE INDEX "projects_id_org_uniq" ON "projects" ("id", "org_id");
CREATE INDEX "projects_org_status_idx" ON "projects" ("org_id", "status");
CREATE INDEX "fx_valuation_layers_org_date_idx" ON "fx_valuation_layers" ("org_id", "valuation_date");

CREATE OR REPLACE FUNCTION guard_close_checklist_establishment_same_org()
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
    RAISE EXCEPTION 'Close checklist establishment must belong to the same organization';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER guard_close_checklist_establishment_org_trigger
BEFORE INSERT OR UPDATE OF org_id, establishment_id ON close_checklists
FOR EACH ROW EXECUTE FUNCTION guard_close_checklist_establishment_same_org();

CREATE OR REPLACE FUNCTION guard_close_checklist_item_same_org()
RETURNS trigger
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

CREATE TRIGGER guard_close_checklist_item_same_org_trigger
BEFORE INSERT OR UPDATE OF org_id, checklist_id ON close_checklist_items
FOR EACH ROW EXECUTE FUNCTION guard_close_checklist_item_same_org();

CREATE OR REPLACE FUNCTION guard_cost_center_parent_same_org()
RETURNS trigger
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

CREATE TRIGGER guard_cost_center_parent_org_trigger
BEFORE INSERT OR UPDATE OF org_id, parent_id ON cost_centers
FOR EACH ROW EXECUTE FUNCTION guard_cost_center_parent_same_org();

CREATE OR REPLACE FUNCTION guard_project_vendor_same_org()
RETURNS trigger
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

CREATE TRIGGER guard_project_vendor_org_trigger
BEFORE INSERT OR UPDATE OF org_id, customer_vendor_id ON projects
FOR EACH ROW EXECUTE FUNCTION guard_project_vendor_same_org();

CREATE OR REPLACE FUNCTION guard_fx_valuation_layer_same_org()
RETURNS trigger
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

CREATE TRIGGER guard_fx_valuation_layer_same_org_trigger
BEFORE INSERT OR UPDATE OF org_id, journal_entry_id ON fx_valuation_layers
FOR EACH ROW EXECUTE FUNCTION guard_fx_valuation_layer_same_org();
