CREATE TABLE IF NOT EXISTS "wht_credits_received" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "customer_vendor_id" uuid NOT NULL REFERENCES "vendors"("id"),
  "certificate_received_document_id" uuid REFERENCES "documents"("id"),
  "payment_date" date NOT NULL,
  "gross_amount" numeric(14,2) NOT NULL,
  "wht_amount" numeric(14,2) NOT NULL,
  "form_type" text NOT NULL,
  "tax_year" integer NOT NULL,
  "certificate_no" text,
  "notes" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz,
  "deleted_at" timestamptz
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "wht_credits_received_org_year"
  ON "wht_credits_received" ("org_id", "tax_year");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "wht_credits_received_customer"
  ON "wht_credits_received" ("org_id", "customer_vendor_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "wht_credits_received_unique_cert"
  ON "wht_credits_received" ("org_id", "customer_vendor_id", "certificate_no", "tax_year")
  WHERE "deleted_at" IS NULL AND "certificate_no" IS NOT NULL;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'wht_credits_received_amounts_nonnegative_check'
  ) THEN
    ALTER TABLE "wht_credits_received"
      ADD CONSTRAINT "wht_credits_received_amounts_nonnegative_check"
      CHECK ("gross_amount" >= 0 AND "wht_amount" >= 0);
  END IF;
END;
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'wht_credits_received_customer_same_org'
  ) THEN
    CREATE TRIGGER "wht_credits_received_customer_same_org"
      BEFORE INSERT OR UPDATE OF "customer_vendor_id","org_id"
      ON "wht_credits_received"
      FOR EACH ROW
      EXECUTE FUNCTION enforce_same_org_reference('vendors', 'customer_vendor_id');
  END IF;
END;
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'wht_credits_received_document_same_org'
  ) THEN
    CREATE TRIGGER "wht_credits_received_document_same_org"
      BEFORE INSERT OR UPDATE OF "certificate_received_document_id","org_id"
      ON "wht_credits_received"
      FOR EACH ROW
      EXECUTE FUNCTION enforce_same_org_reference('documents', 'certificate_received_document_id');
  END IF;
END;
$$;
