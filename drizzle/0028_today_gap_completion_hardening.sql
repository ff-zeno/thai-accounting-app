DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'wht_credits_received_wht_not_above_gross_check'
  ) THEN
    ALTER TABLE "wht_credits_received"
      ADD CONSTRAINT "wht_credits_received_wht_not_above_gross_check"
      CHECK ("wht_amount" <= "gross_amount");
  END IF;
END;
$$;
