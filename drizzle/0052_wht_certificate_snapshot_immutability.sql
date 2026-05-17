CREATE OR REPLACE FUNCTION prevent_wht_certificate_snapshot_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.payer_tax_id_snapshot IS DISTINCT FROM NEW.payer_tax_id_snapshot
    OR OLD.payer_address_snapshot IS DISTINCT FROM NEW.payer_address_snapshot
    OR OLD.payee_address_snapshot IS DISTINCT FROM NEW.payee_address_snapshot
    OR OLD.payee_id_number_snapshot IS DISTINCT FROM NEW.payee_id_number_snapshot
    OR OLD.payment_type_description IS DISTINCT FROM NEW.payment_type_description
    OR OLD.signatory_name_snapshot IS DISTINCT FROM NEW.signatory_name_snapshot
    OR OLD.signatory_position_snapshot IS DISTINCT FROM NEW.signatory_position_snapshot
  THEN
    RAISE EXCEPTION 'wht_certificate_snapshot_immutable';
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS wht_certificate_snapshot_immutable ON "wht_certificates";
--> statement-breakpoint
CREATE TRIGGER wht_certificate_snapshot_immutable
BEFORE UPDATE ON "wht_certificates"
FOR EACH ROW
EXECUTE FUNCTION prevent_wht_certificate_snapshot_update();
