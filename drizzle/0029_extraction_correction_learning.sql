CREATE TYPE "public"."extraction_correction_session_status" AS ENUM('draft', 'confirmed', 'abandoned');
--> statement-breakpoint
CREATE TYPE "public"."extraction_learning_candidate_type" AS ENUM('field_exemplar', 'field_rule', 'document_family_rule', 'vendor_rule');
--> statement-breakpoint
CREATE TYPE "public"."extraction_learning_candidate_scope" AS ENUM('document', 'vendor', 'vendor_document_family', 'global_candidate');
--> statement-breakpoint
CREATE TYPE "public"."extraction_learning_candidate_status" AS ENUM('candidate', 'shadow', 'active', 'retired', 'rejected');
--> statement-breakpoint
CREATE TABLE "extraction_correction_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"extraction_log_id" uuid NOT NULL,
	"started_by_user_id" text NOT NULL,
	"confirmed_by_user_id" text,
	"status" "extraction_correction_session_status" DEFAULT 'draft' NOT NULL,
	"user_explanation" text,
	"ai_interpretation" jsonb,
	"confirmed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "extraction_learning_candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"correction_session_id" uuid NOT NULL,
	"vendor_id" uuid,
	"vendor_key" text,
	"document_family" text,
	"field_name" text NOT NULL,
	"field_criticality" "field_criticality" NOT NULL,
	"candidate_type" "extraction_learning_candidate_type" NOT NULL,
	"ai_value" text,
	"confirmed_value" text,
	"rationale" text,
	"selector_hint" text,
	"reject_hint" text,
	"applies_when" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"scope" "extraction_learning_candidate_scope" NOT NULL,
	"status" "extraction_learning_candidate_status" DEFAULT 'candidate' NOT NULL,
	"confidence" numeric(5, 4),
	"promotion_evidence" jsonb,
	"retirement_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "extraction_correction_sessions" ADD CONSTRAINT "extraction_correction_sessions_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "extraction_correction_sessions" ADD CONSTRAINT "extraction_correction_sessions_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "extraction_correction_sessions" ADD CONSTRAINT "extraction_correction_sessions_extraction_log_id_extraction_log_id_fk" FOREIGN KEY ("extraction_log_id") REFERENCES "public"."extraction_log"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "extraction_learning_candidates" ADD CONSTRAINT "extraction_learning_candidates_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "extraction_learning_candidates" ADD CONSTRAINT "extraction_learning_candidates_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "extraction_learning_candidates" ADD CONSTRAINT "extraction_learning_candidates_correction_session_id_extraction_correction_sessions_id_fk" FOREIGN KEY ("correction_session_id") REFERENCES "public"."extraction_correction_sessions"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "extraction_learning_candidates" ADD CONSTRAINT "extraction_learning_candidates_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "extraction_review_outcome" ADD COLUMN "correction_session_id" uuid;
--> statement-breakpoint
ALTER TABLE "extraction_exemplars" ADD COLUMN "correction_session_id" uuid;
--> statement-breakpoint
ALTER TABLE "extraction_review_outcome" ADD CONSTRAINT "extraction_review_outcome_correction_session_id_extraction_correction_sessions_id_fk" FOREIGN KEY ("correction_session_id") REFERENCES "public"."extraction_correction_sessions"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "extraction_exemplars" ADD CONSTRAINT "extraction_exemplars_correction_session_id_extraction_correction_sessions_id_fk" FOREIGN KEY ("correction_session_id") REFERENCES "public"."extraction_correction_sessions"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "idx_correction_sessions_active_log" ON "extraction_correction_sessions" USING btree ("extraction_log_id") WHERE "extraction_correction_sessions"."deleted_at" IS NULL;
--> statement-breakpoint
CREATE INDEX "idx_correction_sessions_org_document" ON "extraction_correction_sessions" USING btree ("org_id","document_id","created_at") WHERE "extraction_correction_sessions"."deleted_at" IS NULL;
--> statement-breakpoint
CREATE INDEX "idx_correction_sessions_org_status" ON "extraction_correction_sessions" USING btree ("org_id","status","created_at") WHERE "extraction_correction_sessions"."deleted_at" IS NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "idx_learning_candidates_unique_active" ON "extraction_learning_candidates" USING btree ("correction_session_id","field_name","candidate_type") WHERE "extraction_learning_candidates"."deleted_at" IS NULL;
--> statement-breakpoint
CREATE INDEX "idx_learning_candidates_org_vendor_field" ON "extraction_learning_candidates" USING btree ("org_id","vendor_id","document_family","field_name","status") WHERE "extraction_learning_candidates"."deleted_at" IS NULL;
--> statement-breakpoint
CREATE INDEX "idx_learning_candidates_session" ON "extraction_learning_candidates" USING btree ("correction_session_id") WHERE "extraction_learning_candidates"."deleted_at" IS NULL;
--> statement-breakpoint
CREATE TRIGGER "correction_sessions_document_same_org" BEFORE INSERT OR UPDATE OF "document_id","org_id" ON "extraction_correction_sessions" FOR EACH ROW EXECUTE FUNCTION enforce_same_org_reference('documents', 'document_id');
--> statement-breakpoint
CREATE TRIGGER "correction_sessions_extraction_log_same_org" BEFORE INSERT OR UPDATE OF "extraction_log_id","org_id" ON "extraction_correction_sessions" FOR EACH ROW EXECUTE FUNCTION enforce_same_org_reference('extraction_log', 'extraction_log_id');
--> statement-breakpoint
CREATE TRIGGER "learning_candidates_document_same_org" BEFORE INSERT OR UPDATE OF "document_id","org_id" ON "extraction_learning_candidates" FOR EACH ROW EXECUTE FUNCTION enforce_same_org_reference('documents', 'document_id');
--> statement-breakpoint
CREATE TRIGGER "learning_candidates_session_same_org" BEFORE INSERT OR UPDATE OF "correction_session_id","org_id" ON "extraction_learning_candidates" FOR EACH ROW EXECUTE FUNCTION enforce_same_org_reference('extraction_correction_sessions', 'correction_session_id');
--> statement-breakpoint
CREATE TRIGGER "learning_candidates_vendor_same_org" BEFORE INSERT OR UPDATE OF "vendor_id","org_id" ON "extraction_learning_candidates" FOR EACH ROW EXECUTE FUNCTION enforce_same_org_reference('vendors', 'vendor_id');
--> statement-breakpoint
CREATE TRIGGER "review_outcome_correction_session_same_org" BEFORE INSERT OR UPDATE OF "correction_session_id","org_id" ON "extraction_review_outcome" FOR EACH ROW EXECUTE FUNCTION enforce_same_org_reference('extraction_correction_sessions', 'correction_session_id');
--> statement-breakpoint
CREATE TRIGGER "extraction_exemplars_correction_session_same_org" BEFORE INSERT OR UPDATE OF "correction_session_id","org_id" ON "extraction_exemplars" FOR EACH ROW EXECUTE FUNCTION enforce_same_org_reference('extraction_correction_sessions', 'correction_session_id');
