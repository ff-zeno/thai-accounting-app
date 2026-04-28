CREATE OR REPLACE FUNCTION enforce_extraction_log_exemplars_same_org()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  bad_exemplar_id uuid;
BEGIN
  IF NEW.exemplar_ids IS NULL OR array_length(NEW.exemplar_ids, 1) IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT exemplar_id INTO bad_exemplar_id
  FROM unnest(NEW.exemplar_ids) AS exemplar_id
  LEFT JOIN extraction_exemplars
    ON extraction_exemplars.id = exemplar_id
    AND extraction_exemplars.org_id = NEW.org_id
    AND extraction_exemplars.deleted_at IS NULL
  WHERE extraction_exemplars.id IS NULL
  LIMIT 1;

  IF bad_exemplar_id IS NOT NULL THEN
    RAISE EXCEPTION 'cross-org or missing extraction exemplar rejected: %', bad_exemplar_id USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "extraction_log_exemplars_same_org" BEFORE INSERT OR UPDATE OF "exemplar_ids","org_id" ON "extraction_log" FOR EACH ROW EXECUTE FUNCTION enforce_extraction_log_exemplars_same_org();
