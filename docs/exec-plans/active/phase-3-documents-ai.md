# Phase 3: Documents, AI Extraction & Mobile Capture

**Status:** Not started
**Dependencies:** Phase 1a (Inngest client, blob storage abstraction, WHT rate lookup, Drizzle schema), Phase 1b (app shell, shadcn/ui), Phase 2 (vendor CRUD + dedup)
**Blocked by:** V2 (DBD Open API access), V5 (OpenRouter vision model testing) -- both validated in Phase 0

## Goal

Upload invoices and receipts (multi-image per document), run AI extraction pipeline, store structured data for review. Provide mobile capture route for on-the-go receipt scanning. All AI output is a suggestion -- nothing is confirmed until the user reviews.

## Deliverables

### Document Upload Flow

- "Add expense" / "Add income" upload UI
  - Multi-image per document (user selects or drops 1-N images/PDFs)
  - Each image becomes a `document_files` row with page_number
  - Creates one `documents` row with status='draft', needs_review=true
  - All file IDs passed to a single Inngest event (one function per document, NOT per file)
- Direction (expense/income) set at upload time, stored on document

### Mobile /capture Route

- Single-purpose route at `/capture` -- no sidebar, minimal chrome
- Document type via URL parameter: `/capture?type=expense` or `/capture?type=income`
- Camera capture via `<input accept="image/*" capture="environment">`
- Immediate upload on capture (not queued, not batched)
- Post-capture feedback: "Received, processing..." message, then returns to capture view for next document
- Multi-page support: user takes multiple photos, taps "Done" to group them as one document
  - Each photo uploads immediately to blob storage
  - "Done" button finalizes the document and triggers the pipeline with all file IDs
- No sidebar navigation -- back button returns to main app

### Blob Storage Integration

- All files stored via blob storage abstraction layer (built in Phase 1a)
- Vercel Blob as initial implementation (1 GB hobby limit)
- Interface allows future migration to R2/S3 without pipeline changes
- Files stored with path: `{org_id}/documents/{document_id}/{file_id}.{ext}`

### AI Extraction Pipeline (Inngest)

One Inngest function per document. Receives document ID + all file IDs. 7 steps, idempotent.

**Step 1: Store in blob, set pipeline_status='uploaded'**
- Upload files to blob storage (if not already uploaded from capture route)
- Set `document_files.pipeline_status = 'uploaded'` for each file
- Idempotency: check if file already exists in blob before uploading

**Step 2: Inngest event with concurrency control**
- Event name: `document/uploaded`
- Concurrency limit: 3 per org (`key: "org-${orgId}", limit: 3`)
- Idempotency key: `document.id`

**Step 2.5: Image quality check**
- `step.run('quality-check-{fileId}')`
- Minimum resolution: 1024x768
- Reject files < 10KB (likely corrupt or blank)
- Accepted formats: JPEG, PNG, PDF
- Below-threshold images: flag for user but still attempt extraction
- Set `pipeline_status = 'extracting'`

**Step 3: AI extraction per page**
- `step.run('extract-page-{fileId}')`
- Uses Vercel AI SDK `generateObject()` with vision model
- Zod schema: `InvoiceExtraction` (vendor info, line items, totals, dates, tax_id)
- Track per extraction: model used (`ai_model_used`), token count (`ai_cost_tokens`), cost in USD (`ai_cost_usd` NUMERIC(8,6))
- Retry budget: max 2 retries per page, max $0.50 total cost per document
- On retry, escalate to stronger/more expensive model (within budget)

**Step 4: Merge + validate**
- `step.run('merge-validate')`
- Combine multi-page extractions into single document data
- Math validation: line items sum = subtotal, subtotal + VAT = total
- Tax ID validation: 13-digit format check
- Amount normalization: amount ALWAYS stored as pre-VAT; if VAT-included price detected, divide by 1.07
- On validation failure with retry budget remaining: retry extraction with stronger model
- Flag low-confidence fields individually
- Set `pipeline_status = 'validated'` or `'failed_validation'`

**Step 5: Vendor lookup**
- `step.run('vendor-lookup')`
- Search vendor registry by `(org_id, tax_id, branch_number)` from extracted data
- If new vendor: lookup via DBD Open API
- If DBD unavailable: fallback to OpenCorporates API
- If both fail: store vendor with `dbd_verified = false`
- Auto-fill/correct company name and address from DBD data
- UPSERT vendor (dedup by unique constraint from Phase 2)

**Step 6: WHT classification (SUGGESTION ONLY)**
- `step.run('classify-wht')`
- Classify each line item by service type
- Lookup WHT rate from `wht_rates` table via `lookup_wht_rate()` function (available from Phase 1a)
- Assign `rd_payment_type_code` (Section 40 code)
- Consider entity_type (individual/company/foreign) for rate selection
- All classifications are SUGGESTIONS: `needs_review = true`
- Flag ambiguous classifications with lower confidence score

**Step 7: Store result**
- `step.run('store-result')`
- Atomic DB transaction:
  - UPSERT document record (idempotent by document.id)
  - Create/update line items with WHT suggestions
  - Set `needs_review = true`, `status = 'draft'`
  - Set `pipeline_status = 'completed'`
- **NO reconciliation in this step.** NO WHT certificate creation. Both happen AFTER user confirms in review UI (Phase 4).

### Model Benchmark Harness

- Test 5 vision models via OpenRouter on invoice extraction task
- Fixture set: 20 invoices covering clean printed, handwritten, thermal receipts, blurry photos, multi-page, foreign vendor
- Expected output: hand-verified JSON per fixture
- Accuracy thresholds:
  - Clean printed invoices: >90% field-level accuracy
  - Camera photos: >75% field-level accuracy
  - Math validation (items sum correctly): >95%
- Tolerance-based assertions:
  - String fields: fuzzy match (Levenshtein distance)
  - Numeric fields: +/- 0.5
  - Date fields: exact match
- **2-day timebox** -- results inform model tiering, not a blocker
- **Run manually** (CLI script), NOT in CI pipeline
- Results stored in `benchmarks/results/` as timestamped JSON
- Pin model versions in benchmark config for reproducibility

### Review UI

- Side-by-side layout: original images (left) + extracted data (right)
- Extracted data shown as editable form fields
- Confidence indicators per field (high/medium/low based on ai_confidence)
- WHT classification shown as suggestion with rate preview
- Inline edit: user can correct any field before confirming
- "Confirm" button: sets `status = 'confirmed'`, `needs_review = false`
  - Confirmation triggers post-review actions (Phase 4: WHT cert draft, payment record, reconciliation)
- "Reject" button: marks document for re-extraction or manual entry

### Async UI Feedback

- Optimistic UI: upload action immediately shows "Processing..." badge on document
- SWR polling every 5s on document list and detail pages until pipeline_status stabilizes (reaches 'completed' or 'failed_*')
- Pipeline status visible in document list:
  - uploaded, extracting, validated, completed, failed_extraction, failed_validation
- Retry button for failed items: re-triggers Inngest function for the document

### AI Cost Tracking

- Per-extraction cost stored on `document_files`: model, tokens, USD cost
- Cost visible in document detail view
- Aggregatable for org-level AI spend monitoring

## Tests

### Extraction Accuracy Tests (Vitest, fixture-based)

- Parse 5 fixture invoice images through extraction pipeline, assert key fields match expected JSON
- Validate math: line items sum = subtotal, subtotal + VAT = total
- VAT-included normalization: 10,700 THB total with 7% VAT stored as 10,000 subtotal

### Pipeline Tests (integration, mocked AI)

- Full pipeline run with mocked AI responses: assert document + line items stored correctly
- Idempotency: re-run pipeline for same document.id, assert no duplicate line items (UPSERT)
- Pipeline failure at each step: mock failure at step 3 (extraction), assert pipeline_status = 'failed_extraction'
- Pipeline failure at step 4 (validation): assert pipeline_status = 'failed_validation'
- Retry: trigger retry on failed document, assert pipeline completes
- Concurrency: 4 documents for same org, assert max 3 running concurrently
- Cost budget: mock expensive model, assert pipeline stops at $0.50 limit

### Vendor Lookup Tests (integration)

- New vendor with valid tax_id: DBD lookup succeeds, vendor stored with dbd_verified = true
- DBD down: vendor stored with dbd_verified = false
- Existing vendor: no duplicate created, existing vendor linked to document
- Vendor dedup: same tax_id + branch_number returns existing vendor

### Image Quality Tests (Vitest)

- Image below 1024x768: flagged but extraction attempted
- File below 10KB: rejected
- Valid JPEG/PNG/PDF: accepted
- Invalid format (e.g., .bmp): rejected

### Benchmark Harness Tests (manual)

- Run `benchmarks/run-benchmark.ts` against 5 models
- Assert primary model meets >90% on clean, >75% on photos
- Results file generated in `benchmarks/results/`

### E2E Tests (Playwright)

- Upload multi-image expense document, see "Processing..." badge
- Wait for pipeline completion (poll), see extracted data in review UI
- Edit extracted fields, confirm document
- Mobile capture: navigate to /capture?type=expense, capture photo, see "Received, processing..."
- Failed pipeline: see retry button, click retry

## Checkpoint

Phase 3 is complete when:

1. A user can upload a multi-image invoice and see AI-extracted data in the review UI
2. Mobile /capture route works: take photo, immediate upload, "processing" feedback, capture next
3. Multi-page grouping works on mobile: take 3 photos, tap "Done", one document created
4. AI pipeline runs all 7 steps via Inngest with correct concurrency limits
5. Pipeline is idempotent: re-running for same document produces no duplicates
6. Failed pipeline items show in UI with retry button
7. Benchmark harness runs and reports accuracy for 5 models
8. WHT classification appears as suggestion (needs_review = true), using rate lookup from Phase 1a
9. Vendor auto-lookup creates/links vendors correctly with DBD data
10. All extraction, pipeline, and vendor integration tests pass
