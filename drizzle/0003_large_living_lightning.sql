DROP TABLE "allocation_rule_targets" CASCADE;--> statement-breakpoint
DROP TABLE "allocation_rules" CASCADE;--> statement-breakpoint
DROP TABLE "book_tax_adjustments" CASCADE;--> statement-breakpoint
DROP TABLE "cash_deposits" CASCADE;--> statement-breakpoint
DROP TABLE "cit_brackets" CASCADE;--> statement-breakpoint
DROP TABLE "cit_filings" CASCADE;--> statement-breakpoint
DROP TABLE "close_checklist_items" CASCADE;--> statement-breakpoint
DROP TABLE "close_checklists" CASCADE;--> statement-breakpoint
DROP TABLE "copilot_messages" CASCADE;--> statement-breakpoint
DROP TABLE "copilot_sessions" CASCADE;--> statement-breakpoint
DROP TABLE "copilot_tool_events" CASCADE;--> statement-breakpoint
DROP TABLE "cost_centers" CASCADE;--> statement-breakpoint
DROP TABLE "depreciation_schedule" CASCADE;--> statement-breakpoint
DROP TABLE "employee_allowances" CASCADE;--> statement-breakpoint
DROP TABLE "employees" CASCADE;--> statement-breakpoint
DROP TABLE "exemplar_consensus" CASCADE;--> statement-breakpoint
DROP TABLE "extraction_compiled_patterns" CASCADE;--> statement-breakpoint
DROP TABLE "extraction_correction_sessions" CASCADE;--> statement-breakpoint
DROP TABLE "extraction_exemplars" CASCADE;--> statement-breakpoint
DROP TABLE "extraction_learning_candidates" CASCADE;--> statement-breakpoint
DROP TABLE "extraction_review_outcome" CASCADE;--> statement-breakpoint
DROP TABLE "fixed_asset_depreciation_periods" CASCADE;--> statement-breakpoint
DROP TABLE "fixed_assets" CASCADE;--> statement-breakpoint
DROP TABLE "fx_rates_bot" CASCADE;--> statement-breakpoint
DROP TABLE "fx_valuation_layers" CASCADE;--> statement-breakpoint
DROP TABLE "gl_accounts" CASCADE;--> statement-breakpoint
DROP TABLE "gl_opening_balances" CASCADE;--> statement-breakpoint
DROP TABLE "global_exemplar_pool" CASCADE;--> statement-breakpoint
DROP TABLE "import_charge_lines" CASCADE;--> statement-breakpoint
DROP TABLE "import_documents" CASCADE;--> statement-breakpoint
DROP TABLE "import_goods_lines" CASCADE;--> statement-breakpoint
DROP TABLE "imports" CASCADE;--> statement-breakpoint
DROP TABLE "import_payments" CASCADE;--> statement-breakpoint
DROP TABLE "inventory_count_items" CASCADE;--> statement-breakpoint
DROP TABLE "inventory_counts" CASCADE;--> statement-breakpoint
DROP TABLE "inventory_movements" CASCADE;--> statement-breakpoint
DROP TABLE "inventory_statutory_overhead_components" CASCADE;--> statement-breakpoint
DROP TABLE "journal_entries" CASCADE;--> statement-breakpoint
DROP TABLE "journal_lines" CASCADE;--> statement-breakpoint
DROP TABLE "loss_carry_forward_layers" CASCADE;--> statement-breakpoint
DROP TABLE "org_reputation" CASCADE;--> statement-breakpoint
DROP TABLE "pay_runs" CASCADE;--> statement-breakpoint
DROP TABLE "pay_slips" CASCADE;--> statement-breakpoint
DROP TABLE "pit_brackets" CASCADE;--> statement-breakpoint
DROP TABLE "pit_standard_deductions" CASCADE;--> statement-breakpoint
DROP TABLE "pnd_filings" CASCADE;--> statement-breakpoint
DROP TABLE "posting_exceptions" CASCADE;--> statement-breakpoint
DROP TABLE "posting_outbox" CASCADE;--> statement-breakpoint
DROP TABLE "processor_settlements" CASCADE;--> statement-breakpoint
DROP TABLE "projects" CASCADE;--> statement-breakpoint
DROP TABLE "recurring_payment_patterns" CASCADE;--> statement-breakpoint
DROP TABLE "skus" CASCADE;--> statement-breakpoint
DROP TABLE "sso_config" CASCADE;--> statement-breakpoint
DROP TABLE "sso_filings" CASCADE;--> statement-breakpoint
DROP TABLE "tax_min_life_by_category" CASCADE;--> statement-breakpoint
DROP TABLE "thai_business_calendar" CASCADE;--> statement-breakpoint
DROP TABLE "transfer_pricing_disclosures" CASCADE;--> statement-breakpoint
DROP TABLE "vendor_tier" CASCADE;--> statement-breakpoint
DROP TABLE "voucher_sales" CASCADE;--> statement-breakpoint
ALTER TABLE "extraction_log" DROP COLUMN "tier_used";--> statement-breakpoint
ALTER TABLE "extraction_log" DROP COLUMN "exemplar_ids";--> statement-breakpoint
ALTER TABLE "org_ai_settings" DROP COLUMN "copilot_provider";--> statement-breakpoint
ALTER TABLE "org_ai_settings" DROP COLUMN "copilot_model";--> statement-breakpoint
ALTER TABLE "org_ai_settings" DROP COLUMN "copilot_api_key_secret_ref";--> statement-breakpoint
ALTER TABLE "org_ai_settings" DROP COLUMN "copilot_api_key_last4";--> statement-breakpoint
ALTER TABLE "org_ai_settings" DROP COLUMN "copilot_monthly_budget_usd";--> statement-breakpoint
ALTER TABLE "org_ai_settings" DROP COLUMN "copilot_live_model_enabled";--> statement-breakpoint
ALTER TABLE "org_ai_settings" DROP COLUMN "copilot_write_tools_enabled";--> statement-breakpoint
ALTER TABLE "sales_transactions" DROP COLUMN "voucher_sales_id";--> statement-breakpoint
DROP TYPE "public"."compiled_pattern_status";--> statement-breakpoint
DROP TYPE "public"."consensus_status";--> statement-breakpoint
DROP TYPE "public"."extraction_correction_session_status";--> statement-breakpoint
DROP TYPE "public"."extraction_learning_candidate_scope";--> statement-breakpoint
DROP TYPE "public"."extraction_learning_candidate_status";--> statement-breakpoint
DROP TYPE "public"."extraction_learning_candidate_type";--> statement-breakpoint
DROP TYPE "public"."field_criticality";--> statement-breakpoint
DROP TYPE "public"."gl_account_type";--> statement-breakpoint
DROP TYPE "public"."gl_entry_type";--> statement-breakpoint
DROP TYPE "public"."gl_tax_treatment";--> statement-breakpoint
DROP TYPE "public"."gl_vat_register_role";--> statement-breakpoint
DROP TYPE "public"."gl_wht_register_role";--> statement-breakpoint
DROP TYPE "public"."posting_kind";--> statement-breakpoint
DROP TYPE "public"."vendor_tier_scope_kind";