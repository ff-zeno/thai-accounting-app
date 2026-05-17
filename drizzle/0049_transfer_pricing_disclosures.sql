CREATE TABLE "transfer_pricing_disclosures" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "tax_year" integer NOT NULL,
  "status" text DEFAULT 'draft' NOT NULL,
  "revenue_total" numeric(14,2) DEFAULT '0' NOT NULL,
  "disclosure_required" boolean DEFAULT false NOT NULL,
  "related_party_transactions_payload" jsonb,
  "notes" text,
  "prepared_by_user_id" text,
  "submitted_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "transfer_pricing_disclosures_org_year_uniq" UNIQUE("org_id", "tax_year"),
  CONSTRAINT "transfer_pricing_disclosures_status_check" CHECK ("status" IN ('draft', 'submitted'))
);

CREATE INDEX "transfer_pricing_disclosures_org_status_idx"
ON "transfer_pricing_disclosures" ("org_id", "status");
