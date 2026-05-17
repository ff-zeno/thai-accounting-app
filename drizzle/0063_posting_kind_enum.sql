CREATE TYPE "posting_kind" AS ENUM (
  'processor_settlement',
  'cash_deposit',
  'fx_revaluation',
  'year_end_close_revenue_summary',
  'year_end_close_to_retained_earnings',
  'cit_accrual',
  'cit_payment',
  'manual_pair',
  'manual_reversal',
  'opening_balance_pair',
  'pos_primary_sale',
  'tax_payment_pp30',
  'tax_payment_pp36',
  'vat_pp36_self_assessment',
  'vat_pp36_reclaim_transfer',
  'wht_credit_received',
  'import_broker_invoice',
  'import_payment_clearing',
  'inventory_cogs',
  'inventory_sale_cogs',
  'inventory_count_variance',
  'inventory_purchase',
  'payroll_accrual',
  'payroll_net_payment',
  'payroll_pnd1_remittance',
  'payroll_sso_remittance',
  'depreciation'
);
--> statement-breakpoint
ALTER TABLE "journal_entries"
  ALTER COLUMN "posting_kind" TYPE "posting_kind"
  USING "posting_kind"::"posting_kind";
