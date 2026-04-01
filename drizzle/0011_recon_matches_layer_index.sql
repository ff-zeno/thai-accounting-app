CREATE INDEX IF NOT EXISTS "recon_matches_layer"
  ON "reconciliation_matches" ((match_metadata->>'layer'))
  WHERE deleted_at IS NULL;
