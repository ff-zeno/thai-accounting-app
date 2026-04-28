CREATE TYPE "public"."tax_invoice_subtype" AS ENUM('full_ti', 'abb', 'e_tax_invoice', 'not_a_ti');
--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "tax_invoice_subtype" "tax_invoice_subtype";
--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_related_document_id_documents_id_fk" FOREIGN KEY ("related_document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action NOT VALID;
--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_vat_period_month_check" CHECK ("vat_period_month" IS NULL OR ("vat_period_month" >= 1 AND "vat_period_month" <= 12)) NOT VALID;
--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_money_nonnegative_check" CHECK (
  (subtotal IS NULL OR subtotal >= 0)
  AND (vat_amount IS NULL OR vat_amount >= 0)
  AND (total_amount IS NULL OR total_amount >= 0)
  AND (total_amount_thb IS NULL OR total_amount_thb >= 0)
) NOT VALID;
--> statement-breakpoint
ALTER TABLE "document_line_items" ADD CONSTRAINT "document_line_items_amounts_nonnegative_check" CHECK (
  (quantity IS NULL OR quantity >= 0)
  AND (unit_price IS NULL OR unit_price >= 0)
  AND (amount IS NULL OR amount >= 0)
  AND (vat_amount IS NULL OR vat_amount >= 0)
  AND (wht_amount IS NULL OR wht_amount >= 0)
  AND (wht_rate IS NULL OR (wht_rate >= 0 AND wht_rate <= 1))
) NOT VALID;
--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_amounts_nonnegative_check" CHECK (
  gross_amount >= 0
  AND (wht_amount_withheld IS NULL OR wht_amount_withheld >= 0)
  AND net_amount_paid >= 0
) NOT VALID;
--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_gross_minus_wht_equals_net_check" CHECK (
  ROUND((gross_amount - COALESCE(wht_amount_withheld, 0))::numeric, 2) = ROUND(net_amount_paid::numeric, 2)
) NOT VALID;
--> statement-breakpoint
ALTER TABLE "vat_records" ADD CONSTRAINT "vat_records_period_month_check" CHECK ("period_month" >= 1 AND "period_month" <= 12) NOT VALID;
--> statement-breakpoint
ALTER TABLE "vat_records" ADD CONSTRAINT "vat_records_amounts_nonnegative_check" CHECK (
  (output_vat IS NULL OR output_vat >= 0)
  AND (input_vat_pp30 IS NULL OR input_vat_pp30 >= 0)
  AND (pp36_reverse_charge IS NULL OR pp36_reverse_charge >= 0)
) NOT VALID;
--> statement-breakpoint
ALTER TABLE "vat_records" ADD CONSTRAINT "vat_records_net_formula_check" CHECK (
  net_vat_payable IS NULL
  OR ROUND((COALESCE(output_vat, 0) - COALESCE(input_vat_pp30, 0))::numeric, 2) = ROUND(net_vat_payable::numeric, 2)
) NOT VALID;
--> statement-breakpoint
ALTER TABLE "wht_monthly_filings" ADD CONSTRAINT "wht_monthly_filings_period_month_check" CHECK ("period_month" >= 1 AND "period_month" <= 12) NOT VALID;
--> statement-breakpoint
ALTER TABLE "wht_monthly_filings" ADD CONSTRAINT "wht_monthly_filings_amounts_nonnegative_check" CHECK (
  (total_base_amount IS NULL OR total_base_amount >= 0)
  AND (total_wht_amount IS NULL OR total_wht_amount >= 0)
) NOT VALID;
--> statement-breakpoint
ALTER TABLE "wht_certificates" ADD CONSTRAINT "wht_certificates_amounts_nonnegative_check" CHECK (
  (total_base_amount IS NULL OR total_base_amount >= 0)
  AND (total_wht IS NULL OR total_wht >= 0)
) NOT VALID;
--> statement-breakpoint
ALTER TABLE "wht_certificate_items" ADD CONSTRAINT "wht_certificate_items_amounts_nonnegative_check" CHECK (
  (base_amount IS NULL OR base_amount >= 0)
  AND (wht_amount IS NULL OR wht_amount >= 0)
  AND (wht_rate IS NULL OR (wht_rate >= 0 AND wht_rate <= 1))
) NOT VALID;
--> statement-breakpoint
ALTER TABLE "wht_rates" ADD CONSTRAINT "wht_rates_rate_range_check" CHECK (
  standard_rate >= 0 AND standard_rate <= 1
  AND (ewht_rate IS NULL OR (ewht_rate >= 0 AND ewht_rate <= 1))
) NOT VALID;
