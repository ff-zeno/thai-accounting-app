ALTER TABLE "documents" VALIDATE CONSTRAINT "documents_related_document_id_documents_id_fk";
--> statement-breakpoint
ALTER TABLE "documents" VALIDATE CONSTRAINT "documents_vat_period_month_check";
--> statement-breakpoint
ALTER TABLE "documents" VALIDATE CONSTRAINT "documents_money_nonnegative_check";
--> statement-breakpoint
ALTER TABLE "document_line_items" VALIDATE CONSTRAINT "document_line_items_amounts_nonnegative_check";
--> statement-breakpoint
ALTER TABLE "payments" VALIDATE CONSTRAINT "payments_amounts_nonnegative_check";
--> statement-breakpoint
ALTER TABLE "payments" VALIDATE CONSTRAINT "payments_gross_minus_wht_equals_net_check";
--> statement-breakpoint
ALTER TABLE "vat_records" VALIDATE CONSTRAINT "vat_records_period_month_check";
--> statement-breakpoint
ALTER TABLE "vat_records" VALIDATE CONSTRAINT "vat_records_amounts_nonnegative_check";
--> statement-breakpoint
ALTER TABLE "vat_records" VALIDATE CONSTRAINT "vat_records_net_formula_check";
--> statement-breakpoint
ALTER TABLE "wht_monthly_filings" VALIDATE CONSTRAINT "wht_monthly_filings_period_month_check";
--> statement-breakpoint
ALTER TABLE "wht_monthly_filings" VALIDATE CONSTRAINT "wht_monthly_filings_amounts_nonnegative_check";
--> statement-breakpoint
ALTER TABLE "wht_certificates" VALIDATE CONSTRAINT "wht_certificates_amounts_nonnegative_check";
--> statement-breakpoint
ALTER TABLE "wht_certificate_items" VALIDATE CONSTRAINT "wht_certificate_items_amounts_nonnegative_check";
--> statement-breakpoint
ALTER TABLE "wht_rates" VALIDATE CONSTRAINT "wht_rates_rate_range_check";
--> statement-breakpoint
ALTER TABLE "reconciliation_matches" VALIDATE CONSTRAINT "reconciliation_matches_amount_positive_check";
--> statement-breakpoint
ALTER TABLE "reconciliation_matches" VALIDATE CONSTRAINT "reconciliation_matches_confidence_range_check";
