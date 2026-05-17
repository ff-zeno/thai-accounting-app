ALTER TABLE "skus"
  ADD COLUMN IF NOT EXISTS "reorder_point_quantity" numeric(14, 4) DEFAULT '0' NOT NULL;

ALTER TABLE "skus"
  ADD CONSTRAINT "skus_reorder_point_nonnegative_check"
  CHECK ("reorder_point_quantity" >= 0);
