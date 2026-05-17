CREATE TABLE "skus" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "establishment_id" uuid REFERENCES "establishments"("id"),
  "sku_code" text NOT NULL,
  "barcode_ean13" text,
  "name_th" text,
  "name_en" text,
  "description" text,
  "category" text,
  "valuation_method" text DEFAULT 'weighted_average' NOT NULL,
  "unit_of_measure" text DEFAULT 'pcs' NOT NULL,
  "current_quantity" numeric(14, 4) DEFAULT '0' NOT NULL,
  "current_avg_cost" numeric(14, 4) DEFAULT '0' NOT NULL,
  "last_known_avg_cost" numeric(14, 4),
  "standard_cost" numeric(14, 4),
  "current_value" numeric(14, 2) DEFAULT '0' NOT NULL,
  "last_movement_at" timestamp with time zone,
  "is_inventoriable" boolean DEFAULT true NOT NULL,
  "gl_inventory_account_id" uuid REFERENCES "gl_accounts"("id"),
  "gl_cogs_account_id" uuid REFERENCES "gl_accounts"("id"),
  "gl_revenue_account_id" uuid REFERENCES "gl_accounts"("id"),
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone,
  "deleted_at" timestamp with time zone,
  CONSTRAINT "skus_org_code_uniq" UNIQUE("org_id", "sku_code"),
  CONSTRAINT "skus_valuation_method_check" CHECK ("valuation_method" IN ('weighted_average', 'fifo', 'specific_identification')),
  CONSTRAINT "skus_costs_nonnegative_check" CHECK (
    "current_avg_cost" >= 0
    AND ("last_known_avg_cost" IS NULL OR "last_known_avg_cost" >= 0)
    AND ("standard_cost" IS NULL OR "standard_cost" >= 0)
  )
);

CREATE TABLE "inventory_movements" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "establishment_id" uuid NOT NULL REFERENCES "establishments"("id"),
  "sku_id" uuid NOT NULL REFERENCES "skus"("id"),
  "movement_at" timestamp with time zone NOT NULL,
  "movement_type" text NOT NULL,
  "quantity" numeric(14, 4) NOT NULL,
  "unit_cost" numeric(14, 4),
  "total_cost" numeric(14, 2) NOT NULL,
  "running_quantity_after" numeric(14, 4),
  "running_avg_cost_after" numeric(14, 4),
  "running_value_after" numeric(14, 2),
  "source_entity_type" text,
  "source_entity_id" uuid,
  "journal_entry_id" uuid REFERENCES "journal_entries"("id"),
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone,
  CONSTRAINT "inventory_movements_type_check" CHECK ("movement_type" IN ('purchase_in', 'import_in', 'sale_out', 'return_in', 'return_out', 'adjustment_in', 'adjustment_out', 'transfer_in', 'transfer_out', 'count_variance_in', 'count_variance_out', 'shrinkage', 'revaluation')),
  CONSTRAINT "inventory_movements_sign_check" CHECK (
    ("movement_type" IN ('purchase_in', 'import_in', 'return_in', 'adjustment_in', 'transfer_in', 'count_variance_in') AND "quantity" > 0)
    OR ("movement_type" IN ('sale_out', 'return_out', 'adjustment_out', 'transfer_out', 'count_variance_out', 'shrinkage') AND "quantity" < 0)
    OR ("movement_type" = 'revaluation' AND "quantity" = 0)
  ),
  CONSTRAINT "inventory_movements_costs_nonnegative_check" CHECK (("unit_cost" IS NULL OR "unit_cost" >= 0) AND "total_cost" >= 0)
);

CREATE TABLE "inventory_counts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "establishment_id" uuid NOT NULL REFERENCES "establishments"("id"),
  "count_date" date NOT NULL,
  "count_type" text DEFAULT 'cycle' NOT NULL,
  "status" text DEFAULT 'draft' NOT NULL,
  "submitted_at" timestamp with time zone,
  "reconciled_at" timestamp with time zone,
  "reconciled_by_user_id" text,
  "total_variance_value_thb" numeric(14, 2) DEFAULT '0' NOT NULL,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone,
  CONSTRAINT "inventory_counts_type_check" CHECK ("count_type" IN ('full', 'cycle', 'spot')),
  CONSTRAINT "inventory_counts_status_check" CHECK ("status" IN ('draft', 'submitted', 'reconciled'))
);

CREATE TABLE "inventory_count_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "count_id" uuid NOT NULL REFERENCES "inventory_counts"("id"),
  "sku_id" uuid NOT NULL REFERENCES "skus"("id"),
  "system_quantity" numeric(14, 4) NOT NULL,
  "counted_quantity" numeric(14, 4) NOT NULL,
  "variance" numeric(14, 4) NOT NULL,
  "variance_value_thb" numeric(14, 2) NOT NULL,
  "variance_reason" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone,
  CONSTRAINT "inventory_count_items_count_sku_uniq" UNIQUE("count_id", "sku_id"),
  CONSTRAINT "inventory_count_items_reason_check" CHECK ("variance_reason" IS NULL OR "variance_reason" IN ('shrinkage', 'damage', 'count_error', 'unrecorded_sale', 'other'))
);

CREATE TABLE "inventory_statutory_overhead_components" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "import_id" uuid NOT NULL REFERENCES "imports"("id"),
  "import_goods_line_id" uuid REFERENCES "import_goods_lines"("id"),
  "import_charge_line_id" uuid REFERENCES "import_charge_lines"("id"),
  "sku_id" uuid NOT NULL REFERENCES "skus"("id"),
  "component_type" text NOT NULL,
  "component_amount_thb" numeric(14, 2) NOT NULL,
  "remaining_amount_thb" numeric(14, 2) NOT NULL,
  "fiscal_year" integer NOT NULL,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone,
  CONSTRAINT "inventory_overhead_components_type_check" CHECK ("component_type" IN ('customs_duty', 'excise', 'freight', 'insurance', 'brokerage', 'non_recoverable_tax', 'other')),
  CONSTRAINT "inventory_overhead_components_amount_check" CHECK ("component_amount_thb" >= 0 AND "remaining_amount_thb" >= 0 AND "remaining_amount_thb" <= "component_amount_thb")
);

CREATE INDEX "skus_org_establishment_idx" ON "skus" ("org_id", "establishment_id");
CREATE INDEX "inventory_movements_sku_history_idx" ON "inventory_movements" ("org_id", "sku_id", "movement_at");
CREATE INDEX "inventory_movements_source_idx" ON "inventory_movements" ("org_id", "source_entity_type", "source_entity_id");
CREATE INDEX "inventory_counts_org_date_idx" ON "inventory_counts" ("org_id", "count_date");
CREATE INDEX "inventory_count_items_org_count_idx" ON "inventory_count_items" ("org_id", "count_id");
CREATE INDEX "inventory_overhead_components_import_idx" ON "inventory_statutory_overhead_components" ("org_id", "import_id");
CREATE INDEX "inventory_overhead_components_sku_year_idx" ON "inventory_statutory_overhead_components" ("org_id", "sku_id", "fiscal_year");

CREATE OR REPLACE FUNCTION guard_sku_same_org()
RETURNS trigger
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

CREATE TRIGGER guard_skus_same_org_trigger
BEFORE INSERT OR UPDATE OF org_id, establishment_id, gl_inventory_account_id, gl_cogs_account_id, gl_revenue_account_id ON skus
FOR EACH ROW EXECUTE FUNCTION guard_sku_same_org();

CREATE OR REPLACE FUNCTION guard_inventory_movement_same_org()
RETURNS trigger
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

CREATE TRIGGER guard_inventory_movements_same_org_trigger
BEFORE INSERT OR UPDATE OF org_id, establishment_id, sku_id, journal_entry_id ON inventory_movements
FOR EACH ROW EXECUTE FUNCTION guard_inventory_movement_same_org();

CREATE OR REPLACE FUNCTION guard_inventory_movement_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Inventory movements are immutable; post a reversing movement instead';
END;
$$;

CREATE TRIGGER guard_inventory_movements_update_trigger
BEFORE UPDATE ON inventory_movements
FOR EACH ROW EXECUTE FUNCTION guard_inventory_movement_immutable();

CREATE TRIGGER guard_inventory_movements_delete_trigger
BEFORE DELETE ON inventory_movements
FOR EACH ROW EXECUTE FUNCTION guard_inventory_movement_immutable();

CREATE OR REPLACE FUNCTION guard_inventory_count_same_org()
RETURNS trigger
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

CREATE TRIGGER guard_inventory_counts_same_org_trigger
BEFORE INSERT OR UPDATE OF org_id, establishment_id ON inventory_counts
FOR EACH ROW EXECUTE FUNCTION guard_inventory_count_same_org();

CREATE OR REPLACE FUNCTION guard_inventory_count_item_same_org()
RETURNS trigger
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

CREATE TRIGGER guard_inventory_count_items_same_org_trigger
BEFORE INSERT OR UPDATE OF org_id, count_id, sku_id ON inventory_count_items
FOR EACH ROW EXECUTE FUNCTION guard_inventory_count_item_same_org();

CREATE OR REPLACE FUNCTION guard_inventory_overhead_component_same_org()
RETURNS trigger
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

CREATE TRIGGER guard_inventory_overhead_components_same_org_trigger
BEFORE INSERT OR UPDATE OF org_id, import_id, import_goods_line_id, import_charge_line_id, sku_id ON inventory_statutory_overhead_components
FOR EACH ROW EXECUTE FUNCTION guard_inventory_overhead_component_same_org();
