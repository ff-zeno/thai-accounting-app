ALTER TABLE "documents"
  ADD COLUMN IF NOT EXISTS "supplier_tax_id_snapshot" text,
  ADD COLUMN IF NOT EXISTS "supplier_branch_number_snapshot" text,
  ADD COLUMN IF NOT EXISTS "buyer_tax_id_snapshot" text,
  ADD COLUMN IF NOT EXISTS "buyer_branch_number_snapshot" text,
  ADD COLUMN IF NOT EXISTS "tax_invoice_serial_number" text,
  ADD COLUMN IF NOT EXISTS "tax_invoice_words" text;
