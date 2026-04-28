ALTER TABLE "reconciliation_matches" ADD CONSTRAINT "reconciliation_matches_amount_positive_check" CHECK (
  matched_amount IS NOT NULL AND matched_amount > 0
) NOT VALID;
--> statement-breakpoint
ALTER TABLE "reconciliation_matches" ADD CONSTRAINT "reconciliation_matches_confidence_range_check" CHECK (
  confidence IS NULL OR (confidence >= 0 AND confidence <= 1)
) NOT VALID;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION enforce_reconciliation_allocation_limits()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  txn_cap numeric;
  doc_cap numeric;
  payment_cap numeric;
  existing_txn_total numeric;
  existing_doc_total numeric;
  existing_payment_total numeric;
  new_amount numeric;
BEGIN
  IF TG_OP = 'DELETE' OR NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  new_amount := COALESCE(NEW.matched_amount, 0);
  IF new_amount <= 0 THEN
    RAISE EXCEPTION 'matched_amount must be greater than zero' USING ERRCODE = '23514';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.org_id::text || ':txn:' || NEW.transaction_id::text, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.org_id::text || ':doc:' || NEW.document_id::text, 0));
  IF NEW.payment_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(NEW.org_id::text || ':payment:' || NEW.payment_id::text, 0));
  END IF;

  SELECT amount INTO txn_cap
  FROM transactions
  WHERE id = NEW.transaction_id
    AND org_id = NEW.org_id
    AND deleted_at IS NULL;

  IF txn_cap IS NULL THEN
    RAISE EXCEPTION 'transaction not found for reconciliation match' USING ERRCODE = '23514';
  END IF;

  SELECT total_amount INTO doc_cap
  FROM documents
  WHERE id = NEW.document_id
    AND org_id = NEW.org_id
    AND deleted_at IS NULL;

  IF doc_cap IS NULL THEN
    RAISE EXCEPTION 'document not found for reconciliation match' USING ERRCODE = '23514';
  END IF;

  SELECT COALESCE(SUM(matched_amount), 0) INTO existing_txn_total
  FROM reconciliation_matches
  WHERE org_id = NEW.org_id
    AND transaction_id = NEW.transaction_id
    AND deleted_at IS NULL
    AND id <> NEW.id;

  IF ROUND((existing_txn_total + new_amount)::numeric, 2) > ROUND(txn_cap::numeric, 2) THEN
    RAISE EXCEPTION 'matched amount exceeds transaction amount' USING ERRCODE = '23514';
  END IF;

  SELECT COALESCE(SUM(matched_amount), 0) INTO existing_doc_total
  FROM reconciliation_matches
  WHERE org_id = NEW.org_id
    AND document_id = NEW.document_id
    AND deleted_at IS NULL
    AND id <> NEW.id;

  IF ROUND((existing_doc_total + new_amount)::numeric, 2) > ROUND(doc_cap::numeric, 2) THEN
    RAISE EXCEPTION 'matched amount exceeds document total' USING ERRCODE = '23514';
  END IF;

  IF NEW.payment_id IS NOT NULL THEN
    SELECT net_amount_paid INTO payment_cap
    FROM payments
    WHERE id = NEW.payment_id
      AND org_id = NEW.org_id
      AND document_id = NEW.document_id
      AND deleted_at IS NULL;

    IF payment_cap IS NULL THEN
      RAISE EXCEPTION 'payment not found for reconciliation match document' USING ERRCODE = '23514';
    END IF;

    SELECT COALESCE(SUM(matched_amount), 0) INTO existing_payment_total
    FROM reconciliation_matches
    WHERE org_id = NEW.org_id
      AND payment_id = NEW.payment_id
      AND deleted_at IS NULL
      AND id <> NEW.id;

    IF ROUND((existing_payment_total + new_amount)::numeric, 2) > ROUND(payment_cap::numeric, 2) THEN
      RAISE EXCEPTION 'matched amount exceeds payment net amount' USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "reconciliation_matches_allocation_limits" BEFORE INSERT OR UPDATE OF "matched_amount","transaction_id","document_id","payment_id","deleted_at","org_id" ON "reconciliation_matches" FOR EACH ROW EXECUTE FUNCTION enforce_reconciliation_allocation_limits();
