CREATE TYPE "public"."tax_treatment_type" AS ENUM('local_vat_input', 'local_vat_output', 'not_vatable', 'pp36_foreign_service', 'wht_only', 'mixed');
--> statement-breakpoint
CREATE TYPE "public"."tax_treatment_review_status" AS ENUM('ai_suggested', 'needs_review', 'confirmed', 'rejected', 'voided');
--> statement-breakpoint
CREATE TYPE "public"."tax_rule_scope" AS ENUM('pp30_input_claim_window', 'pp36_period_basis', 'pp36_reclaim_timing', 'output_tax_point', 'tax_invoice_claimability');
--> statement-breakpoint
CREATE TYPE "public"."vat_input_status" AS ENUM('needs_review', 'awaiting_tax_invoice', 'claimable', 'held', 'do_not_claim', 'allocated_to_draft', 'filed', 'expired', 'voided_by_amendment');
--> statement-breakpoint
CREATE TYPE "public"."vat_output_status" AS ENUM('needs_review', 'reportable', 'allocated_to_draft', 'filed');
--> statement-breakpoint
CREATE TYPE "public"."pp36_obligation_status" AS ENUM('needs_review', 'pp36_required', 'allocated_to_draft_pp36', 'pp36_filed', 'pp36_paid', 'eligible_for_pp30_reclaim', 'reclaimed_in_pp30', 'voided_by_amendment');
--> statement-breakpoint
CREATE TYPE "public"."vat_filing_type" AS ENUM('pp30', 'pp36');
--> statement-breakpoint
CREATE TYPE "public"."vat_filing_kind" AS ENUM('ordinary', 'additional', 'amendment');
--> statement-breakpoint
CREATE TYPE "public"."vat_filing_status" AS ENUM('draft', 'ready_for_review', 'filed', 'amended', 'voided');
--> statement-breakpoint
CREATE TYPE "public"."vat_payment_status" AS ENUM('not_required', 'waiting_to_pay_tax', 'tax_paid', 'refund_or_credit');
--> statement-breakpoint
CREATE TYPE "public"."vat_filing_line_type" AS ENUM('input', 'output', 'pp36_obligation', 'pp36_reclaim', 'credit_note_adjustment', 'carryforward');
--> statement-breakpoint
CREATE TYPE "public"."vat_credit_carryforward_status" AS ENUM('available', 'applied', 'refunded', 'adjusted');
--> statement-breakpoint
CREATE TYPE "public"."tax_payment_event_type" AS ENUM('payment', 'refund_received', 'credit_applied', 'adjustment');
--> statement-breakpoint
CREATE TYPE "public"."tax_payment_event_status" AS ENUM('recorded', 'matched_to_bank', 'posted_to_gl', 'voided');
--> statement-breakpoint
CREATE TYPE "public"."pp36_period_basis" AS ENUM('payment_date', 'invoice_date', 'occurred_on', 'cpa_reviewed_override');
--> statement-breakpoint
CREATE TYPE "public"."vat_output_tax_point_basis" AS ENUM('issue_date', 'payment_date', 'delivery_date', 'cpa_reviewed_override');
--> statement-breakpoint
CREATE TYPE "public"."vat_refund_status" AS ENUM('not_requested', 'requested', 'approved', 'received', 'rejected');
--> statement-breakpoint
CREATE TYPE "public"."tax_posting_outbox_status" AS ENUM('pending', 'queued', 'posted', 'failed', 'skipped');
--> statement-breakpoint
CREATE TABLE "tax_rule_versions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid REFERENCES "organizations"("id"),
  "rule_scope" "tax_rule_scope" NOT NULL,
  "version" text NOT NULL,
  "effective_from" date NOT NULL,
  "effective_to" date,
  "rule_body" jsonb NOT NULL,
  "source_url" text,
  "source_checked_at" timestamptz,
  "cpa_reviewed_by_user_id" text,
  "cpa_reviewed_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz,
  "deleted_at" timestamptz
);
--> statement-breakpoint
CREATE UNIQUE INDEX "tax_rule_versions_unique_active" ON "tax_rule_versions" (COALESCE("org_id", '00000000-0000-0000-0000-000000000000'::uuid), "rule_scope", "version") WHERE "deleted_at" IS NULL;
--> statement-breakpoint
CREATE INDEX "tax_rule_versions_lookup" ON "tax_rule_versions" ("org_id", "rule_scope", "effective_from") WHERE "deleted_at" IS NULL;
--> statement-breakpoint

CREATE TABLE "tax_treatment_decisions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "source_document_id" uuid REFERENCES "documents"("id"),
  "source_document_line_id" uuid REFERENCES "document_line_items"("id"),
  "source_transaction_id" uuid REFERENCES "transactions"("id"),
  "source_payment_id" uuid REFERENCES "payments"("id"),
  "source_reconciliation_match_id" uuid REFERENCES "reconciliation_matches"("id"),
  "treatment_type" "tax_treatment_type" NOT NULL,
  "review_status" "tax_treatment_review_status" DEFAULT 'needs_review' NOT NULL,
  "confidence" numeric(5,4),
  "evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "rule_version_id" uuid REFERENCES "tax_rule_versions"("id"),
  "suggested_by" text,
  "confirmed_by_user_id" text,
  "confirmed_at" timestamptz,
  "review_reason" text,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz,
  "deleted_at" timestamptz,
  CONSTRAINT "tax_treatment_confidence_range_check" CHECK ("confidence" IS NULL OR ("confidence" >= 0 AND "confidence" <= 1)),
  CONSTRAINT "tax_treatment_has_source_check" CHECK (num_nonnulls("source_document_id", "source_document_line_id", "source_transaction_id", "source_payment_id", "source_reconciliation_match_id") >= 1)
);
--> statement-breakpoint
CREATE INDEX "tax_treatment_org_status" ON "tax_treatment_decisions" ("org_id", "review_status", "created_at") WHERE "deleted_at" IS NULL;
--> statement-breakpoint
CREATE INDEX "tax_treatment_document" ON "tax_treatment_decisions" ("org_id", "source_document_id") WHERE "deleted_at" IS NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "tax_treatment_line_active" ON "tax_treatment_decisions" ("org_id", "source_document_line_id") WHERE "deleted_at" IS NULL AND "source_document_line_id" IS NOT NULL;
--> statement-breakpoint

CREATE TABLE "vat_filings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "establishment_id" uuid,
  "filing_type" "vat_filing_type" NOT NULL,
  "period_year" integer NOT NULL,
  "period_month" integer NOT NULL,
  "filing_kind" "vat_filing_kind" NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  "amends_filing_id" uuid REFERENCES "vat_filings"("id"),
  "status" "vat_filing_status" DEFAULT 'draft' NOT NULL,
  "output_vat_total" numeric(14,2),
  "input_vat_total" numeric(14,2),
  "pp36_vat_total" numeric(14,2),
  "pp36_reclaim_total" numeric(14,2),
  "carryforward_in" numeric(14,2),
  "carryforward_out" numeric(14,2),
  "net_payable" numeric(14,2),
  "filed_at" timestamptz,
  "filed_by_user_id" text,
  "payment_status" "vat_payment_status" DEFAULT 'not_required' NOT NULL,
  "deadline" date,
  "refund_requested" boolean DEFAULT false NOT NULL,
  "refund_amount" numeric(14,2),
  "refund_status" "vat_refund_status",
  "penalty_amount" numeric(14,2),
  "surcharge_amount" numeric(14,2),
  "paid_at" timestamptz,
  "payment_transaction_id" uuid REFERENCES "transactions"("id"),
  "rd_receipt_no" text,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz,
  "deleted_at" timestamptz,
  CONSTRAINT "vat_filings_period_month_check" CHECK ("period_month" >= 1 AND "period_month" <= 12),
  CONSTRAINT "vat_filings_version_positive_check" CHECK ("version" >= 1),
  CONSTRAINT "vat_filings_establishment_null_check" CHECK ("establishment_id" IS NULL),
  CONSTRAINT "vat_filings_refund_requested_amount_check" CHECK ("refund_requested" = false OR "refund_amount" > 0),
  CONSTRAINT "vat_filings_amounts_nonnegative_check" CHECK (
    ("output_vat_total" IS NULL OR "output_vat_total" >= 0)
    AND ("input_vat_total" IS NULL OR "input_vat_total" >= 0)
    AND ("pp36_vat_total" IS NULL OR "pp36_vat_total" >= 0)
    AND ("pp36_reclaim_total" IS NULL OR "pp36_reclaim_total" >= 0)
    AND ("carryforward_in" IS NULL OR "carryforward_in" >= 0)
    AND ("carryforward_out" IS NULL OR "carryforward_out" >= 0)
    AND ("refund_amount" IS NULL OR "refund_amount" >= 0)
    AND ("penalty_amount" IS NULL OR "penalty_amount" >= 0)
    AND ("surcharge_amount" IS NULL OR "surcharge_amount" >= 0)
  )
);
--> statement-breakpoint
CREATE UNIQUE INDEX "vat_filings_id_org_uniq" ON "vat_filings" ("id", "org_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "vat_filings_open_ordinary_unique" ON "vat_filings" (
  "org_id",
  COALESCE("establishment_id", '00000000-0000-0000-0000-000000000000'::uuid),
  "filing_type",
  "period_year",
  "period_month"
) WHERE "filing_kind" = 'ordinary' AND "deleted_at" IS NULL;
--> statement-breakpoint
CREATE INDEX "vat_filings_org_period" ON "vat_filings" ("org_id", "filing_type", "period_year", "period_month", "status") WHERE "deleted_at" IS NULL;
--> statement-breakpoint

CREATE TABLE "vat_input_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "establishment_id" uuid,
  "tax_treatment_decision_id" uuid REFERENCES "tax_treatment_decisions"("id"),
  "source_document_id" uuid NOT NULL REFERENCES "documents"("id"),
  "source_document_line_id" uuid REFERENCES "document_line_items"("id"),
  "source_transaction_id" uuid REFERENCES "transactions"("id"),
  "source_reconciliation_match_id" uuid REFERENCES "reconciliation_matches"("id"),
  "vendor_id" uuid NOT NULL REFERENCES "vendors"("id"),
  "tax_invoice_no" text,
  "tax_invoice_date" date,
  "tax_invoice_received_date" date,
  "tax_invoice_subtype" "tax_invoice_subtype" NOT NULL,
  "document_date" date,
  "payment_date" date,
  "base_amount" numeric(14,2) NOT NULL,
  "vat_amount" numeric(14,2) NOT NULL,
  "vat_rate" numeric(5,4) NOT NULL,
  "eligible_period_year" integer,
  "eligible_period_month" integer,
  "expiry_period_year" integer,
  "expiry_period_month" integer,
  "claim_period_year" integer,
  "claim_period_month" integer,
  "claim_basis_date" date,
  "claim_window_rule_version_id" uuid REFERENCES "tax_rule_versions"("id"),
  "status" "vat_input_status" DEFAULT 'needs_review' NOT NULL,
  "status_reason" text,
  "draft_filing_id" uuid REFERENCES "vat_filings"("id"),
  "filed_filing_line_id" uuid,
  "source_snapshot" jsonb NOT NULL,
  "source_snapshot_hash" text NOT NULL,
  "snapshot_version" text DEFAULT 'vat_snapshot_v1' NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz,
  "deleted_at" timestamptz,
  CONSTRAINT "vat_input_amounts_nonnegative_check" CHECK ("base_amount" >= 0 AND "vat_amount" >= 0),
  CONSTRAINT "vat_input_rate_range_check" CHECK ("vat_rate" >= 0 AND "vat_rate" <= 1),
  CONSTRAINT "vat_input_establishment_null_check" CHECK ("establishment_id" IS NULL),
  CONSTRAINT "vat_input_snapshot_hash_check" CHECK ("source_snapshot_hash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "vat_input_period_month_check" CHECK (
    ("eligible_period_month" IS NULL OR ("eligible_period_month" >= 1 AND "eligible_period_month" <= 12))
    AND ("expiry_period_month" IS NULL OR ("expiry_period_month" >= 1 AND "expiry_period_month" <= 12))
    AND ("claim_period_month" IS NULL OR ("claim_period_month" >= 1 AND "claim_period_month" <= 12))
  )
);
--> statement-breakpoint
CREATE UNIQUE INDEX "vat_input_items_id_org_uniq" ON "vat_input_items" ("id", "org_id");
--> statement-breakpoint
CREATE INDEX "vat_input_items_org_status" ON "vat_input_items" ("org_id", "status", "created_at") WHERE "deleted_at" IS NULL;
--> statement-breakpoint
CREATE INDEX "vat_input_items_org_expiry" ON "vat_input_items" ("org_id", "expiry_period_year", "expiry_period_month", "status") WHERE "deleted_at" IS NULL;
--> statement-breakpoint
CREATE INDEX "vat_input_items_document" ON "vat_input_items" ("org_id", "source_document_id") WHERE "deleted_at" IS NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "vat_input_items_source_line_active" ON "vat_input_items" ("org_id", "source_document_line_id") WHERE "deleted_at" IS NULL AND "source_document_line_id" IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "vat_input_items_source_document_active" ON "vat_input_items" ("org_id", "source_document_id") WHERE "deleted_at" IS NULL AND "source_document_line_id" IS NULL;
--> statement-breakpoint

CREATE TABLE "vat_output_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "establishment_id" uuid,
  "tax_treatment_decision_id" uuid REFERENCES "tax_treatment_decisions"("id"),
  "source_document_id" uuid REFERENCES "documents"("id"),
  "source_document_line_id" uuid REFERENCES "document_line_items"("id"),
  "source_pos_sale_id" uuid,
  "source_transaction_id" uuid REFERENCES "transactions"("id"),
  "customer_id" uuid REFERENCES "vendors"("id"),
  "tax_invoice_no" text,
  "tax_invoice_date" date NOT NULL,
  "document_date" date NOT NULL,
  "tax_point_date" date NOT NULL,
  "tax_point_basis" "vat_output_tax_point_basis" NOT NULL,
  "tax_point_rule_version_id" uuid REFERENCES "tax_rule_versions"("id"),
  "base_amount" numeric(14,2) NOT NULL,
  "vat_amount" numeric(14,2) NOT NULL,
  "vat_rate" numeric(5,4) NOT NULL,
  "output_period_year" integer NOT NULL,
  "output_period_month" integer NOT NULL,
  "status" "vat_output_status" DEFAULT 'needs_review' NOT NULL,
  "source_snapshot" jsonb NOT NULL,
  "source_snapshot_hash" text NOT NULL,
  "snapshot_version" text DEFAULT 'vat_snapshot_v1' NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz,
  "deleted_at" timestamptz,
  CONSTRAINT "vat_output_amounts_nonnegative_check" CHECK ("base_amount" >= 0 AND "vat_amount" >= 0),
  CONSTRAINT "vat_output_rate_range_check" CHECK ("vat_rate" >= 0 AND "vat_rate" <= 1),
  CONSTRAINT "vat_output_establishment_null_check" CHECK ("establishment_id" IS NULL),
  CONSTRAINT "vat_output_snapshot_hash_check" CHECK ("source_snapshot_hash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "vat_output_has_source_check" CHECK (num_nonnulls("source_document_id", "source_document_line_id", "source_pos_sale_id", "source_transaction_id") >= 1),
  CONSTRAINT "vat_output_period_month_check" CHECK ("output_period_month" >= 1 AND "output_period_month" <= 12)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "vat_output_items_id_org_uniq" ON "vat_output_items" ("id", "org_id");
--> statement-breakpoint
CREATE INDEX "vat_output_items_org_period" ON "vat_output_items" ("org_id", "output_period_year", "output_period_month", "status") WHERE "deleted_at" IS NULL;
--> statement-breakpoint
CREATE INDEX "vat_output_items_document" ON "vat_output_items" ("org_id", "source_document_id") WHERE "deleted_at" IS NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "vat_output_items_source_line_active" ON "vat_output_items" ("org_id", "source_document_line_id") WHERE "deleted_at" IS NULL AND "source_document_line_id" IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "vat_output_items_source_document_active" ON "vat_output_items" ("org_id", "source_document_id") WHERE "deleted_at" IS NULL AND "source_document_id" IS NOT NULL AND "source_document_line_id" IS NULL;
--> statement-breakpoint

CREATE TABLE "pp36_obligations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "establishment_id" uuid,
  "tax_treatment_decision_id" uuid REFERENCES "tax_treatment_decisions"("id"),
  "source_document_id" uuid REFERENCES "documents"("id"),
  "source_document_line_id" uuid REFERENCES "document_line_items"("id"),
  "source_payment_transaction_id" uuid REFERENCES "transactions"("id"),
  "source_reconciliation_match_id" uuid REFERENCES "reconciliation_matches"("id"),
  "vendor_id" uuid NOT NULL REFERENCES "vendors"("id"),
  "vendor_country_code" text NOT NULL,
  "service_description" text,
  "base_amount_thb" numeric(14,2) NOT NULL,
  "source_currency" varchar(3),
  "source_amount" numeric(14,2),
  "fx_rate" numeric(12,6),
  "fx_rate_source" text,
  "fx_rate_date" date,
  "vat_amount" numeric(14,2) NOT NULL,
  "vat_rate" numeric(5,4) NOT NULL,
  "occurred_on" date NOT NULL,
  "payment_date" date NOT NULL,
  "tax_point_date" date NOT NULL,
  "period_basis" "pp36_period_basis" NOT NULL,
  "period_rule_version_id" uuid REFERENCES "tax_rule_versions"("id"),
  "pp36_period_year" integer NOT NULL,
  "pp36_period_month" integer NOT NULL,
  "pp36_filing_id" uuid REFERENCES "vat_filings"("id"),
  "pp36_filing_line_id" uuid,
  "pp36_paid_at" timestamptz,
  "pp36_payment_transaction_id" uuid REFERENCES "transactions"("id"),
  "pp30_reclaim_eligible_period_year" integer,
  "pp30_reclaim_eligible_period_month" integer,
  "pp30_reclaim_expiry_period_year" integer,
  "pp30_reclaim_expiry_period_month" integer,
  "pp30_reclaim_filing_id" uuid REFERENCES "vat_filings"("id"),
  "pp30_reclaim_filing_line_id" uuid,
  "reclaim_rule_version_id" uuid REFERENCES "tax_rule_versions"("id"),
  "status" "pp36_obligation_status" DEFAULT 'needs_review' NOT NULL,
  "source_snapshot" jsonb NOT NULL,
  "source_snapshot_hash" text NOT NULL,
  "snapshot_version" text DEFAULT 'vat_snapshot_v1' NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz,
  "deleted_at" timestamptz,
  CONSTRAINT "pp36_amounts_nonnegative_check" CHECK ("base_amount_thb" >= 0 AND "vat_amount" >= 0 AND ("source_amount" IS NULL OR "source_amount" >= 0)),
  CONSTRAINT "pp36_rate_range_check" CHECK ("vat_rate" >= 0 AND "vat_rate" <= 1),
  CONSTRAINT "pp36_establishment_null_check" CHECK ("establishment_id" IS NULL),
  CONSTRAINT "pp36_vendor_country_code_check" CHECK ("vendor_country_code" ~ '^[A-Z]{2}$'),
  CONSTRAINT "pp36_snapshot_hash_check" CHECK ("source_snapshot_hash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "pp36_period_month_check" CHECK (
    "pp36_period_month" >= 1 AND "pp36_period_month" <= 12
    AND ("pp30_reclaim_eligible_period_month" IS NULL OR ("pp30_reclaim_eligible_period_month" >= 1 AND "pp30_reclaim_eligible_period_month" <= 12))
    AND ("pp30_reclaim_expiry_period_month" IS NULL OR ("pp30_reclaim_expiry_period_month" >= 1 AND "pp30_reclaim_expiry_period_month" <= 12))
  ),
  CONSTRAINT "pp36_period_matches_tax_point_check" CHECK (
    "pp36_period_year" = EXTRACT(YEAR FROM "tax_point_date")::integer
    AND "pp36_period_month" = EXTRACT(MONTH FROM "tax_point_date")::integer
  ),
  CONSTRAINT "pp36_reclaim_requires_paid_check" CHECK (
    (
      "status" NOT IN ('eligible_for_pp30_reclaim', 'reclaimed_in_pp30')
      AND "pp30_reclaim_filing_id" IS NULL
      AND "pp30_reclaim_filing_line_id" IS NULL
    )
    OR (
      "status" = 'eligible_for_pp30_reclaim'
      AND "pp36_paid_at" IS NOT NULL
      AND "pp36_filing_id" IS NOT NULL
      AND "pp36_filing_line_id" IS NOT NULL
      AND "pp30_reclaim_filing_id" IS NULL
      AND "pp30_reclaim_filing_line_id" IS NULL
    )
    OR (
      "status" = 'reclaimed_in_pp30'
      AND "pp36_paid_at" IS NOT NULL
      AND "pp36_filing_id" IS NOT NULL
      AND "pp36_filing_line_id" IS NOT NULL
      AND "pp30_reclaim_filing_id" IS NOT NULL
      AND "pp30_reclaim_filing_line_id" IS NOT NULL
    )
  )
);
--> statement-breakpoint
CREATE UNIQUE INDEX "pp36_obligations_id_org_uniq" ON "pp36_obligations" ("id", "org_id");
--> statement-breakpoint
CREATE INDEX "pp36_obligations_org_period" ON "pp36_obligations" ("org_id", "pp36_period_year", "pp36_period_month", "status") WHERE "deleted_at" IS NULL;
--> statement-breakpoint
CREATE INDEX "pp36_obligations_reclaim_period" ON "pp36_obligations" ("org_id", "pp30_reclaim_eligible_period_year", "pp30_reclaim_eligible_period_month", "status") WHERE "deleted_at" IS NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "pp36_obligations_source_active" ON "pp36_obligations" ("org_id", "source_payment_transaction_id") WHERE "deleted_at" IS NULL AND "source_payment_transaction_id" IS NOT NULL;
--> statement-breakpoint
CREATE TABLE "vat_filing_lines" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "filing_id" uuid NOT NULL REFERENCES "vat_filings"("id"),
  "line_type" "vat_filing_line_type" NOT NULL,
  "vat_input_item_id" uuid REFERENCES "vat_input_items"("id"),
  "vat_output_item_id" uuid REFERENCES "vat_output_items"("id"),
  "pp36_obligation_id" uuid REFERENCES "pp36_obligations"("id"),
  "amount" numeric(14,2) NOT NULL,
  "vat_amount" numeric(14,2) NOT NULL,
  "frozen_snapshot_hash" text NOT NULL,
  "frozen_snapshot" jsonb NOT NULL,
  "snapshot_version" text DEFAULT 'vat_snapshot_v1' NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "vat_filing_lines_amounts_nonnegative_check" CHECK ("amount" >= 0 AND "vat_amount" >= 0),
  CONSTRAINT "vat_filing_lines_snapshot_hash_check" CHECK ("frozen_snapshot_hash" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE UNIQUE INDEX "vat_filing_lines_id_org_uniq" ON "vat_filing_lines" ("id", "org_id");
--> statement-breakpoint
CREATE INDEX "vat_filing_lines_filing" ON "vat_filing_lines" ("org_id", "filing_id", "line_type");
--> statement-breakpoint
CREATE UNIQUE INDEX "vat_filing_lines_input_once" ON "vat_filing_lines" ("org_id", "vat_input_item_id", "line_type") WHERE "vat_input_item_id" IS NOT NULL AND "line_type" = 'input';
--> statement-breakpoint
CREATE UNIQUE INDEX "vat_filing_lines_output_once" ON "vat_filing_lines" ("org_id", "vat_output_item_id", "line_type") WHERE "vat_output_item_id" IS NOT NULL AND "line_type" = 'output';
--> statement-breakpoint
CREATE UNIQUE INDEX "vat_filing_lines_pp36_role_once" ON "vat_filing_lines" ("org_id", "pp36_obligation_id", "line_type") WHERE "pp36_obligation_id" IS NOT NULL AND "line_type" IN ('pp36_obligation', 'pp36_reclaim');
--> statement-breakpoint
ALTER TABLE "vat_input_items" ADD CONSTRAINT "vat_input_items_filed_filing_line_id_fk" FOREIGN KEY ("filed_filing_line_id") REFERENCES "vat_filing_lines"("id");
--> statement-breakpoint
ALTER TABLE "pp36_obligations" ADD CONSTRAINT "pp36_obligations_pp36_filing_line_id_fk" FOREIGN KEY ("pp36_filing_line_id") REFERENCES "vat_filing_lines"("id");
--> statement-breakpoint
ALTER TABLE "pp36_obligations" ADD CONSTRAINT "pp36_obligations_pp30_reclaim_filing_line_id_fk" FOREIGN KEY ("pp30_reclaim_filing_line_id") REFERENCES "vat_filing_lines"("id");
--> statement-breakpoint

CREATE TABLE "vat_credit_carryforwards" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "establishment_id" uuid,
  "source_pp30_filing_id" uuid NOT NULL REFERENCES "vat_filings"("id"),
  "source_pp30_filing_line_id" uuid REFERENCES "vat_filing_lines"("id"),
  "credit_origin_period_year" integer NOT NULL,
  "credit_origin_period_month" integer NOT NULL,
  "amount" numeric(14,2) NOT NULL,
  "remaining_amount" numeric(14,2) NOT NULL,
  "applied_to_pp30_filing_id" uuid REFERENCES "vat_filings"("id"),
  "status" "vat_credit_carryforward_status" DEFAULT 'available' NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz,
  CONSTRAINT "vat_credit_carryforward_period_month_check" CHECK ("credit_origin_period_month" >= 1 AND "credit_origin_period_month" <= 12),
  CONSTRAINT "vat_credit_carryforward_establishment_null_check" CHECK ("establishment_id" IS NULL),
  CONSTRAINT "vat_credit_carryforward_amount_check" CHECK ("amount" >= 0 AND "remaining_amount" >= 0 AND "remaining_amount" <= "amount")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "vat_credit_carryforwards_id_org_uniq" ON "vat_credit_carryforwards" ("id", "org_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "vat_credit_carryforwards_origin_unique" ON "vat_credit_carryforwards" ("org_id", "source_pp30_filing_id");
--> statement-breakpoint
CREATE INDEX "vat_credit_carryforwards_available" ON "vat_credit_carryforwards" ("org_id", "status");
--> statement-breakpoint

CREATE TABLE "tax_payment_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "filing_id" uuid NOT NULL REFERENCES "vat_filings"("id"),
  "event_type" "tax_payment_event_type" NOT NULL,
  "event_status" "tax_payment_event_status" DEFAULT 'recorded' NOT NULL,
  "payment_transaction_id" uuid REFERENCES "transactions"("id"),
  "paid_at" timestamptz NOT NULL,
  "amount" numeric(14,2) NOT NULL,
  "receipt_no" text,
  "evidence_document_id" uuid REFERENCES "documents"("id"),
  "idempotency_key" text NOT NULL,
  "posting_outbox_status" "tax_posting_outbox_status" DEFAULT 'pending' NOT NULL,
  "created_by_user_id" text NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "tax_payment_events_amount_nonnegative_check" CHECK ("amount" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "tax_payment_events_id_org_uniq" ON "tax_payment_events" ("id", "org_id");
--> statement-breakpoint
ALTER TABLE "tax_payment_events" ADD CONSTRAINT "tax_payment_events_idempotency" UNIQUE ("org_id", "filing_id", "idempotency_key");
--> statement-breakpoint
CREATE INDEX "tax_payment_events_filing" ON "tax_payment_events" ("org_id", "filing_id");
