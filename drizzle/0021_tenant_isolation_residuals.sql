ALTER TABLE "wht_certificates" ADD CONSTRAINT "wht_certificates_replacement_cert_id_wht_certificates_id_fk" FOREIGN KEY ("replacement_cert_id") REFERENCES "public"."wht_certificates"("id") ON DELETE no action ON UPDATE no action NOT VALID;
--> statement-breakpoint
ALTER TABLE "vendor_tier" ADD CONSTRAINT "vendor_tier_scope_org_consistency_check" CHECK (
  (scope_kind = 'org' AND org_id IS NOT NULL)
  OR (scope_kind = 'global' AND org_id IS NULL)
) NOT VALID;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION enforce_same_org_reference()
RETURNS trigger
LANGUAGE plpgsql
AS $$
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
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION enforce_vendor_tier_org_scope()
RETURNS trigger
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
--> statement-breakpoint
CREATE TRIGGER "wht_certificates_replacement_same_org" BEFORE INSERT OR UPDATE OF "replacement_cert_id","org_id" ON "wht_certificates" FOR EACH ROW EXECUTE FUNCTION enforce_same_org_reference('wht_certificates', 'replacement_cert_id');
--> statement-breakpoint
CREATE TRIGGER "extraction_review_outcome_extraction_log_same_org" BEFORE INSERT OR UPDATE OF "extraction_log_id","org_id" ON "extraction_review_outcome" FOR EACH ROW EXECUTE FUNCTION enforce_same_org_reference('extraction_log', 'extraction_log_id');
--> statement-breakpoint
CREATE TRIGGER "vendor_tier_org_scope_guard" BEFORE INSERT OR UPDATE OF "vendor_id","org_id","scope_kind" ON "vendor_tier" FOR EACH ROW EXECUTE FUNCTION enforce_vendor_tier_org_scope();
--> statement-breakpoint
ALTER TABLE "wht_certificates" VALIDATE CONSTRAINT "wht_certificates_replacement_cert_id_wht_certificates_id_fk";
--> statement-breakpoint
ALTER TABLE "vendor_tier" VALIDATE CONSTRAINT "vendor_tier_scope_org_consistency_check";
