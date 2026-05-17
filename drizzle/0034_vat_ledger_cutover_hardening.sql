ALTER TABLE "vat_input_items" ADD CONSTRAINT "vat_input_claimable_requires_tax_invoice_check" CHECK (
  "status" NOT IN ('claimable', 'allocated_to_draft', 'filed')
  OR ("tax_invoice_no" IS NOT NULL AND "tax_invoice_date" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "vat_input_items" ADD CONSTRAINT "vat_input_status_links_check" CHECK (
  ("status" <> 'allocated_to_draft' OR "draft_filing_id" IS NOT NULL)
  AND ("status" <> 'filed' OR "filed_filing_line_id" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "vat_output_items" ADD COLUMN "draft_filing_id" uuid REFERENCES "vat_filings"("id");
--> statement-breakpoint
ALTER TABLE "vat_output_items" ADD COLUMN "filed_filing_line_id" uuid REFERENCES "vat_filing_lines"("id");
--> statement-breakpoint
ALTER TABLE "vat_output_items" ADD CONSTRAINT "vat_output_status_links_check" CHECK (
  ("status" <> 'allocated_to_draft' OR "draft_filing_id" IS NOT NULL)
  AND ("status" <> 'filed' OR "filed_filing_line_id" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "pp36_obligations" ADD CONSTRAINT "pp36_status_links_check" CHECK (
  (
    "status" NOT IN (
      'allocated_to_draft_pp36',
      'pp36_filed',
      'pp36_paid',
      'eligible_for_pp30_reclaim',
      'reclaimed_in_pp30'
    )
    OR ("pp36_filing_id" IS NOT NULL AND "pp36_filing_line_id" IS NOT NULL)
  )
  AND (
    "status" NOT IN ('pp36_paid', 'eligible_for_pp30_reclaim', 'reclaimed_in_pp30')
    OR "pp36_paid_at" IS NOT NULL
  )
);
--> statement-breakpoint
DROP INDEX IF EXISTS "vat_filings_open_ordinary_unique";
--> statement-breakpoint
CREATE UNIQUE INDEX "vat_filings_open_ordinary_unique" ON "vat_filings" (
  "org_id",
  COALESCE("establishment_id", '00000000-0000-0000-0000-000000000000'::uuid),
  "filing_type",
  "period_year",
  "period_month"
) WHERE "filing_kind" = 'ordinary' AND "status" <> 'voided' AND "deleted_at" IS NULL;
--> statement-breakpoint
ALTER TABLE "vat_filing_lines" ADD CONSTRAINT "vat_filing_lines_type_source_check" CHECK (
  (
    "line_type" = 'input'
    AND "vat_input_item_id" IS NOT NULL
    AND "vat_output_item_id" IS NULL
    AND "pp36_obligation_id" IS NULL
  )
  OR (
    "line_type" = 'output'
    AND "vat_input_item_id" IS NULL
    AND "vat_output_item_id" IS NOT NULL
    AND "pp36_obligation_id" IS NULL
  )
  OR (
    "line_type" IN ('pp36_obligation', 'pp36_reclaim')
    AND "vat_input_item_id" IS NULL
    AND "vat_output_item_id" IS NULL
    AND "pp36_obligation_id" IS NOT NULL
  )
  OR (
    "line_type" IN ('carryforward', 'credit_note_adjustment')
    AND "vat_input_item_id" IS NULL
    AND "vat_output_item_id" IS NULL
    AND "pp36_obligation_id" IS NULL
  )
);
--> statement-breakpoint
ALTER TABLE "vat_filing_lines" ADD CONSTRAINT "vat_filing_lines_filing_org_fk"
  FOREIGN KEY ("filing_id", "org_id") REFERENCES "vat_filings"("id", "org_id");
--> statement-breakpoint
ALTER TABLE "vat_filing_lines" ADD CONSTRAINT "vat_filing_lines_input_item_org_fk"
  FOREIGN KEY ("vat_input_item_id", "org_id") REFERENCES "vat_input_items"("id", "org_id");
--> statement-breakpoint
ALTER TABLE "vat_filing_lines" ADD CONSTRAINT "vat_filing_lines_output_item_org_fk"
  FOREIGN KEY ("vat_output_item_id", "org_id") REFERENCES "vat_output_items"("id", "org_id");
--> statement-breakpoint
ALTER TABLE "vat_filing_lines" ADD CONSTRAINT "vat_filing_lines_pp36_obligation_org_fk"
  FOREIGN KEY ("pp36_obligation_id", "org_id") REFERENCES "pp36_obligations"("id", "org_id");
--> statement-breakpoint
ALTER TABLE "vat_input_items" ADD CONSTRAINT "vat_input_items_draft_filing_org_fk"
  FOREIGN KEY ("draft_filing_id", "org_id") REFERENCES "vat_filings"("id", "org_id");
--> statement-breakpoint
ALTER TABLE "vat_input_items" ADD CONSTRAINT "vat_input_items_filed_line_org_fk"
  FOREIGN KEY ("filed_filing_line_id", "org_id") REFERENCES "vat_filing_lines"("id", "org_id");
--> statement-breakpoint
ALTER TABLE "vat_output_items" ADD CONSTRAINT "vat_output_items_draft_filing_org_fk"
  FOREIGN KEY ("draft_filing_id", "org_id") REFERENCES "vat_filings"("id", "org_id");
--> statement-breakpoint
ALTER TABLE "vat_output_items" ADD CONSTRAINT "vat_output_items_filed_line_org_fk"
  FOREIGN KEY ("filed_filing_line_id", "org_id") REFERENCES "vat_filing_lines"("id", "org_id");
--> statement-breakpoint
ALTER TABLE "pp36_obligations" ADD CONSTRAINT "pp36_obligations_pp36_filing_org_fk"
  FOREIGN KEY ("pp36_filing_id", "org_id") REFERENCES "vat_filings"("id", "org_id");
--> statement-breakpoint
ALTER TABLE "pp36_obligations" ADD CONSTRAINT "pp36_obligations_pp36_filing_line_org_fk"
  FOREIGN KEY ("pp36_filing_line_id", "org_id") REFERENCES "vat_filing_lines"("id", "org_id");
--> statement-breakpoint
ALTER TABLE "pp36_obligations" ADD CONSTRAINT "pp36_obligations_pp30_reclaim_filing_org_fk"
  FOREIGN KEY ("pp30_reclaim_filing_id", "org_id") REFERENCES "vat_filings"("id", "org_id");
--> statement-breakpoint
ALTER TABLE "pp36_obligations" ADD CONSTRAINT "pp36_obligations_pp30_reclaim_filing_line_org_fk"
  FOREIGN KEY ("pp30_reclaim_filing_line_id", "org_id") REFERENCES "vat_filing_lines"("id", "org_id");
--> statement-breakpoint
ALTER TABLE "vat_credit_carryforwards" ADD CONSTRAINT "vat_credit_carryforwards_source_filing_org_fk"
  FOREIGN KEY ("source_pp30_filing_id", "org_id") REFERENCES "vat_filings"("id", "org_id");
--> statement-breakpoint
ALTER TABLE "vat_credit_carryforwards" ADD CONSTRAINT "vat_credit_carryforwards_source_line_org_fk"
  FOREIGN KEY ("source_pp30_filing_line_id", "org_id") REFERENCES "vat_filing_lines"("id", "org_id");
--> statement-breakpoint
ALTER TABLE "vat_credit_carryforwards" ADD CONSTRAINT "vat_credit_carryforwards_applied_filing_org_fk"
  FOREIGN KEY ("applied_to_pp30_filing_id", "org_id") REFERENCES "vat_filings"("id", "org_id");
--> statement-breakpoint
ALTER TABLE "tax_payment_events" ADD CONSTRAINT "tax_payment_events_filing_org_fk"
  FOREIGN KEY ("filing_id", "org_id") REFERENCES "vat_filings"("id", "org_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "pp36_obligations_source_line_active" ON "pp36_obligations" ("org_id", "source_document_line_id")
  WHERE "deleted_at" IS NULL AND "source_document_line_id" IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "pp36_obligations_source_document_active" ON "pp36_obligations" ("org_id", "source_document_id")
  WHERE "deleted_at" IS NULL AND "source_document_id" IS NOT NULL AND "source_document_line_id" IS NULL;
