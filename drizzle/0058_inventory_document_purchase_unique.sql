CREATE UNIQUE INDEX IF NOT EXISTS "inventory_movements_document_purchase_uniq"
  ON "inventory_movements" (
    "org_id",
    "source_entity_type",
    "source_entity_id",
    "sku_id",
    "movement_type"
  )
  WHERE "deleted_at" IS NULL
    AND "source_entity_type" = 'documents'
    AND "movement_type" = 'purchase_in';
