CREATE UNIQUE INDEX IF NOT EXISTS "import_payments_org_bank_transaction_uniq"
  ON "import_payments" ("org_id", "bank_transaction_id");
