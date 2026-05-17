ALTER TYPE "gl_entry_type" ADD VALUE IF NOT EXISTS 'auto_fixed_asset_disposal';
--> statement-breakpoint
ALTER TYPE "posting_kind" ADD VALUE IF NOT EXISTS 'fixed_asset_disposal';
