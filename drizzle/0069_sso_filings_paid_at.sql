ALTER TABLE "sso_filings" ADD COLUMN "paid_at" timestamp with time zone;

UPDATE "sso_filings"
SET "paid_at" = COALESCE(
  ("payload"->'remittance'->>'postedAt')::timestamptz,
  (("payload"->'remittance'->>'paymentDate') || 'T12:00:00+07:00')::timestamptz
)
WHERE "paid_at" IS NULL
  AND "payload" ? 'remittance';
