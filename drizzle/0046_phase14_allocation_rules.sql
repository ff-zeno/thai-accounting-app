CREATE TABLE IF NOT EXISTS "allocation_rules" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "rule_name" text NOT NULL,
  "source_type" text NOT NULL,
  "source_id" uuid,
  "is_active" boolean DEFAULT true NOT NULL,
  "effective_from" date,
  "effective_to" date,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone,
  "deleted_at" timestamp with time zone,
  CONSTRAINT "allocation_rules_source_type_check" CHECK ("source_type" IN ('gl_account', 'vendor', 'category')),
  CONSTRAINT "allocation_rules_effective_range_check" CHECK ("effective_to" IS NULL OR "effective_from" IS NULL OR "effective_to" >= "effective_from")
);

CREATE TABLE IF NOT EXISTS "allocation_rule_targets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "allocation_rule_id" uuid NOT NULL REFERENCES "allocation_rules"("id"),
  "cost_center_id" uuid REFERENCES "cost_centers"("id"),
  "project_id" uuid REFERENCES "projects"("id"),
  "percentage" numeric(5,4) NOT NULL,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone,
  "deleted_at" timestamp with time zone,
  CONSTRAINT "allocation_rule_targets_percentage_check" CHECK ("percentage" > 0 AND "percentage" <= 1),
  CONSTRAINT "allocation_rule_targets_has_dimension_check" CHECK ("cost_center_id" IS NOT NULL OR "project_id" IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS "allocation_rules_id_org_uniq" ON "allocation_rules" ("id", "org_id");
CREATE INDEX IF NOT EXISTS "allocation_rules_org_active_idx" ON "allocation_rules" ("org_id", "is_active");
CREATE INDEX IF NOT EXISTS "allocation_rule_targets_rule_idx" ON "allocation_rule_targets" ("allocation_rule_id");

CREATE OR REPLACE FUNCTION guard_allocation_rule_target_same_org()
RETURNS trigger
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

CREATE TRIGGER guard_allocation_rule_target_same_org_trigger
BEFORE INSERT OR UPDATE OF org_id, allocation_rule_id, cost_center_id, project_id ON allocation_rule_targets
FOR EACH ROW EXECUTE FUNCTION guard_allocation_rule_target_same_org();
