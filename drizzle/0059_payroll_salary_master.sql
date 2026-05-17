ALTER TABLE "employees"
  ADD COLUMN IF NOT EXISTS "base_monthly_salary" numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "salary_effective_from" date;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'employees_base_salary_nonnegative_check'
  ) THEN
    ALTER TABLE "employees"
      ADD CONSTRAINT "employees_base_salary_nonnegative_check"
      CHECK ("base_monthly_salary" >= 0);
  END IF;
END $$;
