ALTER TABLE "documents" ADD COLUMN "category" text;--> statement-breakpoint
CREATE INDEX "doc_files_document" ON "document_files" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "recon_matches_document" ON "reconciliation_matches" USING btree ("document_id");