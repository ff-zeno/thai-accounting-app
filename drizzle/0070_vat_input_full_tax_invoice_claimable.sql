DO $$
DECLARE
  invalid_count integer;
BEGIN
  SELECT COUNT(*)
    INTO invalid_count
  FROM "vat_input_items"
  WHERE "deleted_at" IS NULL
    AND "status" IN ('claimable', 'allocated_to_draft', 'filed')
    AND (
      "tax_invoice_subtype" NOT IN ('full_ti', 'e_tax_invoice')
      OR "tax_invoice_no" IS NULL
      OR "tax_invoice_date" IS NULL
    );

  IF invalid_count > 0 THEN
    RAISE EXCEPTION
      'Cannot add vat_input_claimable_requires_full_tax_invoice_check: % existing VAT input rows are claimable/allocated/filed without full/e-tax invoice subtype plus invoice no/date. Correct evidence or move unfiled rows back to needs_review before migration.',
      invalid_count;
  END IF;
END $$;

ALTER TABLE "vat_input_items"
  DROP CONSTRAINT IF EXISTS "vat_input_claimable_requires_tax_invoice_check";

ALTER TABLE "vat_input_items"
  ADD CONSTRAINT "vat_input_claimable_requires_full_tax_invoice_check"
  CHECK (
    "status" NOT IN ('claimable', 'allocated_to_draft', 'filed')
    OR (
      "tax_invoice_subtype" IN ('full_ti', 'e_tax_invoice')
      AND "tax_invoice_no" IS NOT NULL
      AND "tax_invoice_date" IS NOT NULL
    )
  );
