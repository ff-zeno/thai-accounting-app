# Execution Plan: Thai Accounting Platform

**Status:** Active — Rev 2 (post-review)
**Created:** 2026-03-14
**Revised:** 2026-03-14
**Reviews:** [Engineering](../reviews/review-engineering-2026-03-14.md) | [Product](../reviews/review-product-business-2026-03-14.md) | [Consolidated](../reviews/consolidated-findings-2026-03-14.md)
**Approach:** Foundation-first, 6 phases + pre-implementation validation sprint

## Scope Definition

This is a **tax compliance and filing preparation tool**, not a full double-entry accounting system. It manages document ingestion, WHT/VAT calculation, certificate generation, and filing prep. It does NOT replace FlowAccount/Peak for journal entries, chart of accounts, or audited financials.

### Explicitly Out of Scope (V1)

- Double-entry bookkeeping / journal entries / chart of accounts
- CIT calculations (PND 50/51)
- Payroll (PND 1 employee salary WHT, SSO contributions)
- Stamp duty (Or. Sor. 9)
- DTA treaty rate application (default to statutory rates; DTA is V2)
- RD e-Filing portal automation (RPA/Playwright)
- Authentication, billing, user management (layered in later)
- Offline/PWA capabilities beyond basic mobile capture

## Architectural Decisions (Resolved)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Multi-tenancy | Row-level isolation (org_id FK + RLS) | Simplest, standard SaaS pattern, migratable |
| ORM | Drizzle ORM | Type-safe, SQL-like, lightweight, Neon-native |
| Background jobs | Inngest | Step-based retry, Vercel-native, LLM offloading |
| Bank parsing | Format-specific parsers + AI fallback | Deterministic = testable + reliable; AI for unknowns |
| UI components | shadcn/ui + TanStack Table | Full control, Tailwind-native, good for data-heavy UI |
| AI model selection | Benchmark harness first | Data-driven model tiering after testing 5 models |
| PDF generation | React-PDF (@react-pdf/renderer) | React components, Thai font support, server-side |
| AI integration | Vercel AI SDK + @openrouter/ai-sdk-provider | Streaming, generateObject, tool use, model switching |
| MCP | Deferred to V2 | Inngest steps use direct DB calls; MCP adds overhead without external AI clients |
| Blob storage | Vercel Blob behind abstraction layer | 1 GB hobby limit; abstraction enables R2/S3 migration |
| Package manager | pnpm | User preference |
| Monitoring | Sentry + Inngest failure webhooks | Non-negotiable for financial software |

## System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        THAI ACCOUNTING APP                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌──────────┐  ┌──────────────┐  ┌───────────────┐  ┌───────────┐ │
│  │  Org      │  │  Bank        │  │  Document     │  │  Tax &    │ │
│  │  Switcher │  │  Statements  │  │  Upload &     │  │  Filing   │ │
│  │  & Mgmt   │  │  & Txns      │  │  AI Extract   │  │  Engine   │ │
│  └─────┬─────┘  └──────┬───────┘  └───────┬───────┘  └─────┬─────┘ │
│        │               │                  │                │       │
│        └───────┬───────┴──────────┬───────┴────────┬───────┘       │
│                │                  │                │                │
│         ┌──────▼──────┐   ┌──────▼──────┐  ┌──────▼──────┐        │
│         │ Reconcil-   │   │ Vendor      │  │ Reporting   │        │
│         │ iation      │   │ Registry    │  │ & Export    │        │
│         │ Engine      │   │ (DBD API)   │  │ (RD/FA/PA)  │        │
│         └──────┬──────┘   └──────┬──────┘  └──────┬──────┘        │
│                │                 │                 │                │
│  ══════════════╪═════════════════╪═════════════════╪════════════   │
│                │         DATA LAYER                │                │
│         ┌──────▼─────────────────▼─────────────────▼──────┐        │
│         │              Neon Postgres (Drizzle)            │        │
│         │     Row-level multi-tenancy (org_id + RLS)      │        │
│         └─────────────────────────────────────────────────┘        │
│                                                                     │
│  ══════════════════════════════════════════════════════════════     │
│                      EXTERNAL SERVICES                              │
│  ┌────────────┐  ┌────────────┐  ┌─────────┐  ┌──────────────┐   │
│  │ OpenRouter  │  │ Blob Store │  │ Inngest │  │ DBD Open API │   │
│  │ (AI/LLM)   │  │ (abstract) │  │ (Jobs)  │  │ (Company DB) │   │
│  └────────────┘  └────────────┘  └─────────┘  └──────────────┘   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router, Turbopack) |
| Language | TypeScript (strict) |
| Styling | Tailwind CSS 4 |
| Components | shadcn/ui, TanStack Table, react-hook-form + zod |
| Database | Neon Postgres (Launch tier $19/mo for production) |
| ORM | Drizzle ORM + drizzle-kit migrations |
| Blob storage | Abstracted interface (Vercel Blob initially, R2/S3 later) |
| AI/LLM | Vercel AI SDK + @openrouter/ai-sdk-provider |
| Background jobs | Inngest |
| PDF generation | @react-pdf/renderer |
| Bank parsing | Custom parsers per bank + pdf-parse for PDF extraction |
| Testing | Vitest (unit/integration) + Playwright (E2E) |
| Monitoring | Sentry (errors) + Inngest webhooks (job failures) |
| Deployment | Vercel |

## Database Schema (Rev 2 — Post-Review)

All tables include: `created_at TIMESTAMPTZ DEFAULT NOW()`, `updated_at TIMESTAMPTZ`, `deleted_at TIMESTAMPTZ` (soft delete).

```
┌────────────────────────┐
│  organizations         │
├────────────────────────┤
│  id (PK, uuid)         │
│  name                  │
│  name_th               │
│  tax_id (13-digit)     │
│  branch_number (5-dig) │  ← NEW: '00000' = head office
│  registration_no       │
│  address               │
│  address_th            │
│  is_vat_registered     │
│  fiscal_year_end_month │  ← NEW: default 12
│  fiscal_year_end_day   │  ← NEW: default 31
│  created_at            │
│  updated_at            │
│  deleted_at            │
└────────┬───────────────┘
         │
         │  ┌────────────────────────┐
         │  │  users (stub)          │  ← NEW: placeholder for auth
         │  ├────────────────────────┤
         ├─►│  id (PK)               │
         │  │  org_id (FK)           │
         │  │  name                  │
         │  │  email                 │
         │  │  role                  │
         │  └────────────────────────┘
         │
         │  ┌────────────────────────┐
         │  │  bank_accounts         │
         │  ├────────────────────────┤
         ├─►│  id (PK)               │
         │  │  org_id (FK)           │
         │  │  bank_code             │
         │  │  account_number        │
         │  │  account_name          │
         │  │  currency              │
         │  │  current_balance       │
         │  └────────┬───────────────┘
         │           │
         │  ┌────────▼───────────────┐
         │  │  bank_statements       │
         │  ├────────────────────────┤
         │  │  id (PK)               │
         │  │  org_id (FK)           │
         │  │  bank_account_id (FK)  │
         │  │  period_start          │
         │  │  period_end            │
         │  │  opening_balance       │
         │  │  closing_balance       │
         │  │  file_url              │
         │  │  parser_used           │
         │  │  import_status         │
         │  └────────┬───────────────┘
         │           │
         │  ┌────────▼───────────────┐
         │  │  transactions          │
         │  ├────────────────────────┤
         │  │  id (PK)               │
         │  │  org_id (FK)           │
         │  │  bank_account_id (FK)  │
         │  │  statement_id (FK)     │
         │  │  date                  │
         │  │  description           │
         │  │  amount NUMERIC(14,2)  │  ← widened from 12,2
         │  │  type (debit/credit)   │
         │  │  running_balance       │
         │  │  reference_no          │
         │  │  channel               │
         │  │  counterparty          │
         │  │  reconciliation_status │  ← denormalized status
         │  │  is_petty_cash         │
         │  │  external_ref          │  ← dedup key
         │  │  INDEX(org_id, date)              │
         │  │  INDEX(org_id, reconciliation_status) │
         │  │  INDEX(org_id, amount, date)      │
         │  └────────────────────────┘
         │
         │  ┌────────────────────────┐
         │  │  vendors               │
         │  ├────────────────────────┤
         ├─►│  id (PK)               │
         │  │  org_id (FK)           │
         │  │  name                  │
         │  │  name_th               │
         │  │  tax_id                │
         │  │  registration_no       │
         │  │  branch_number         │  ← NEW
         │  │  address               │
         │  │  address_th            │
         │  │  email                 │  ← NEW: for sending 50 Tawi
         │  │  payment_terms_days    │  ← NEW: for due date calc
         │  │  is_vat_registered     │
         │  │  entity_type           │
         │  │  (individual/company/  │
         │  │   foreign)             │
         │  │  country               │
         │  │  dbd_verified          │
         │  │  dbd_data (jsonb)      │
         │  │  UNIQUE(org_id, tax_id, branch_number) │
         │  └────────────────────────┘
         │
         │  ┌────────────────────────┐
         │  │  documents             │
         │  ├────────────────────────┤
         ├─►│  id (PK)               │
         │  │  org_id (FK)           │
         │  │  vendor_id (FK)        │
         │  │  related_document_id   │  ← NEW: credit/debit note parent
         │  │  type (invoice/receipt │
         │  │    /debit_note         │
         │  │    /credit_note)       │
         │  │  document_number       │
         │  │  issue_date            │
         │  │  due_date              │
         │  │  subtotal NUMERIC(14,2)│
         │  │  vat_amount            │
         │  │  total_amount          │
         │  │  currency              │
         │  │  exchange_rate         │  ← NEW: NUMERIC(12,6) for foreign
         │  │  total_amount_thb      │  ← NEW: NUMERIC(14,2) THB equivalent
         │  │  direction (expense/   │
         │  │    income)             │
         │  │  status (draft/        │
         │  │    confirmed/          │
         │  │    partially_paid/     │  ← NEW
         │  │    paid/voided)        │  ← NEW: voided status
         │  │  amount_paid           │  ← NEW: running total paid
         │  │  balance_due           │  ← NEW: remaining
         │  │  vat_period_year       │  ← NEW: which VAT period
         │  │  vat_period_month      │  ← NEW: this belongs to
         │  │  ai_confidence         │
         │  │  needs_review          │
         │  │  review_notes          │
         │  │  created_by (FK users) │  ← NEW
         │  │  INDEX(org_id, vendor_id, issue_date)  │
         │  │  INDEX(org_id, status)                  │
         │  └────────┬───────────────┘
         │           │
         │  ┌────────▼───────────────┐
         │  │  document_line_items   │
         │  ├────────────────────────┤
         │  │  id (PK)               │
         │  │  org_id (FK)           │
         │  │  document_id (FK)      │
         │  │  description           │
         │  │  quantity              │
         │  │  unit_price            │
         │  │  amount NUMERIC(14,2)  │  ← ALWAYS pre-VAT
         │  │  vat_amount            │
         │  │  wht_rate NUMERIC(5,4) │  ← NEW: precision for treaty rates
         │  │  wht_amount            │
         │  │  wht_type              │
         │  │  rd_payment_type_code  │  ← NEW: RD Section 40 code
         │  │  account_code          │  ← NEW: nullable, future chart of accounts
         │  └────────────────────────┘
         │
         │  ┌────────────────────────┐
         │  │  document_files        │
         │  ├────────────────────────┤
         │  │  id (PK)               │  ← also idempotency key for pipeline
         │  │  org_id (FK)           │
         │  │  document_id (FK)      │
         │  │  file_url (blob)       │
         │  │  file_type             │
         │  │  page_number           │
         │  │  original_filename     │
         │  │  pipeline_status       │  ← NEW: uploaded/extracting/extracted/
         │  │                        │    validated/failed_extraction/
         │  │                        │    failed_validation
         │  │  ai_extraction_status  │
         │  │  ai_raw_response       │
         │  │  ai_model_used         │  ← NEW: which model extracted
         │  │  ai_cost_tokens        │  ← NEW: token count
         │  │  ai_cost_usd           │  ← NEW: NUMERIC(8,6)
         │  └────────────────────────┘
         │
         │  ══════════════════════════════════════════════
         │  PAYMENT & RECONCILIATION (NEW SECTION)
         │  ══════════════════════════════════════════════
         │
         │  ┌────────────────────────┐
         │  │  payments              │  ← ENTIRELY NEW TABLE
         │  ├────────────────────────┤
         │  │  id (PK)               │
         │  │  org_id (FK)           │
         │  │  document_id (FK)      │
         │  │  payment_date          │
         │  │  gross_amount          │  ← invoice total
         │  │  wht_amount_withheld   │  ← retained for RD
         │  │  net_amount_paid       │  ← actual transfer (gross - WHT)
         │  │  payment_method        │  ← bank_transfer/promptpay/cheque/cash
         │  │  is_ewht              │  ← NEW: paid via e-WHT system?
         │  │  notes                 │
         │  └────────────────────────┘
         │
         │  ┌──────────────────────────────┐
         │  │  reconciliation_matches      │  ← REPLACES reconciled_doc_id
         │  ├──────────────────────────────┤
         │  │  id (PK)                     │
         │  │  org_id (FK)                 │
         │  │  transaction_id (FK)         │
         │  │  document_id (FK)            │
         │  │  payment_id (FK)             │  ← links to payment record
         │  │  matched_amount NUMERIC(14,2)│  ← allocated portion
         │  │  match_type (exact/fuzzy/    │
         │  │    manual/ai_suggested)      │
         │  │  confidence NUMERIC(3,2)     │
         │  │  matched_by (auto/manual)    │
         │  │  matched_at TIMESTAMPTZ      │
         │  │  UNIQUE(transaction_id, document_id) │
         │  └──────────────────────────────┘
         │
         │  ══════════════════════════════════════════════
         │  WHT & TAX
         │  ══════════════════════════════════════════════
         │
         │  ┌────────────────────────┐
         │  │  wht_certificates      │
         │  ├────────────────────────┤
         ├─►│  id (PK)               │
         │  │  org_id (FK)           │
         │  │  certificate_no        │  ← format: {form_type}/{year}/{seq}
         │  │  payee_vendor_id (FK)  │
         │  │  payment_date          │
         │  │  total_base_amount     │
         │  │  total_wht             │
         │  │  form_type             │
         │  │  (pnd1/pnd3/pnd53/     │
         │  │   pnd54)               │  ← added pnd54
         │  │  filing_id (FK)        │  ← NEW: links to monthly filing
         │  │  pdf_url               │
         │  │  status (draft/issued/ │
         │  │    voided/replaced)    │  ← NEW: void support
         │  │  voided_at             │  ← NEW
         │  │  void_reason           │  ← NEW
         │  │  replacement_cert_id   │  ← NEW: FK to replacement cert
         │  │  issued_date           │
         │  │  UNIQUE(org_id, certificate_no) │
         │  └────────────────────────┘
         │
         │  ┌──────────────────────────────┐
         │  │  wht_certificate_items       │  ← ENTIRELY NEW TABLE
         │  ├──────────────────────────────┤
         │  │  id (PK)                     │
         │  │  org_id (FK)                 │
         │  │  certificate_id (FK)         │
         │  │  document_id (FK)            │
         │  │  line_item_id (FK)           │
         │  │  base_amount NUMERIC(14,2)   │
         │  │  wht_rate NUMERIC(5,4)       │
         │  │  wht_amount NUMERIC(14,2)    │
         │  │  rd_payment_type_code        │
         │  │  wht_type                    │
         │  └──────────────────────────────┘
         │
         │  ┌────────────────────────┐
         │  │  wht_sequence_counters │  ← ENTIRELY NEW TABLE
         │  ├────────────────────────┤
         │  │  id (PK)               │
         │  │  org_id (FK)           │
         │  │  form_type             │
         │  │  year                  │
         │  │  next_sequence         │
         │  │  UNIQUE(org_id, form_type, year) │
         │  └────────────────────────┘
         │
         │  ┌────────────────────────┐
         │  │  wht_monthly_filings   │
         │  ├────────────────────────┤
         │  │  id (PK)               │
         │  │  org_id (FK)           │
         │  │  period_year           │
         │  │  period_month          │
         │  │  form_type             │
         │  │  total_base_amount     │  ← computed from certificates
         │  │  total_wht_amount      │  ← computed from certificates
         │  │  status (draft/filed/  │
         │  │    paid)               │
         │  │  filing_date           │
         │  │  deadline              │  ← computed with e-filing extension
         │  │  period_locked         │  ← NEW: prevents edits after filing
         │  └────────────────────────┘
         │
         │  ┌────────────────────────┐
         │  │  vat_records           │
         │  ├────────────────────────┤
         ├─►│  id (PK)               │
         │  │  org_id (FK)           │
         │  │  period_year           │
         │  │  period_month          │
         │  │  output_vat            │  ← computed from sales docs
         │  │  input_vat_pp30        │  ← RENAMED: reclaimable only
         │  │  pp36_reverse_charge   │  ← RENAMED: NOT reclaimable, separate
         │  │  net_vat_payable       │  ← = output_vat - input_vat_pp30
         │  │  pp30_status           │
         │  │  pp30_deadline         │  ← 23rd (e-filing)
         │  │  pp36_status           │  ← NEW: separate filing status
         │  │  pp36_deadline         │  ← NEW: 15th (different from PP 30!)
         │  │  nil_filing_required   │  ← NEW: must file even with zero
         │  │  period_locked         │  ← NEW
         │  └────────────────────────┘
         │
         │  ┌────────────────────────┐
         │  │  cash_transactions     │
         │  ├────────────────────────┤
         │  │  id (PK)               │
         │  │  org_id (FK)           │
         │  │  date                  │
         │  │  description           │
         │  │  amount NUMERIC(14,2)  │
         │  │  type (expense/income) │
         │  │  reimbursement_txn_id  │
         │  │  document_id (FK)      │
         │  │  status                │
         │  └────────────────────────┘
         │
         │  ┌────────────────────────┐
         │  │  wht_rates             │  ← NEW: configurable rate table
         │  ├────────────────────────┤
         │  │  id (PK)               │
         │  │  payment_type          │
         │  │  entity_type           │
         │  │  rd_payment_type_code  │  ← Section 40 code
         │  │  standard_rate         │  ← NUMERIC(5,4)
         │  │  ewht_rate             │  ← NUMERIC(5,4) nullable
         │  │  ewht_valid_from       │
         │  │  ewht_valid_to         │
         │  │  effective_from        │
         │  │  effective_to          │
         │  └────────────────────────┘
         │
         │  ┌────────────────────────┐
         │  │  audit_log             │  ← ENTIRELY NEW TABLE
         │  ├────────────────────────┤
         │  │  id (PK)               │
         │  │  org_id (FK)           │
         │  │  entity_type           │
         │  │  entity_id             │
         │  │  action                │
         │  │  old_value (jsonb)     │
         │  │  new_value (jsonb)     │
         │  │  actor_id (FK users)   │
         │  │  created_at            │
         │  └────────────────────────┘
```

**Schema changes from Rev 1 (summary):**
- Added 6 new tables: `payments`, `reconciliation_matches`, `wht_certificate_items`, `wht_sequence_counters`, `wht_rates`, `audit_log`, `users` (stub)
- Added `created_at`/`updated_at`/`deleted_at` to ALL tables
- Added `branch_number` to organizations + vendors
- Added `fiscal_year_end_month/day` to organizations
- Added `exchange_rate`/`total_amount_thb` to documents
- Added `related_document_id` for credit/debit notes
- Added `amount_paid`/`balance_due`/`partially_paid`/`voided` to documents
- Added `vat_period_year/month` to documents
- Renamed `input_vat` → `input_vat_pp30`, separated PP 36
- Added `pipeline_status`/`ai_model_used`/`ai_cost_*` to document_files
- Added void support to wht_certificates
- Added `rd_payment_type_code` for RD Section 40 codes
- Widened amounts to `NUMERIC(14,2)`, rates to `NUMERIC(5,4)`
- Added indexes on key query patterns
- Removed `reconciled_doc_id` from transactions (replaced by junction)

## AI Processing Pipeline (Rev 2)

Key changes from Rev 1:
- **Removed auto-reconciliation from upload pipeline** (moved to separate trigger)
- **Added idempotency** via `document_files.id` as dedup key
- **Added image quality preprocessing** step
- **Added AI cost tracking** per extraction
- **Added retry budget** (max 2 retries, max cost per document)

```
Document Upload (1-N images or PDF per document)
  │
  ▼
┌─────────────────────────────────┐
│  1. Store originals in Blob     │
│     Set pipeline_status =       │
│     'uploaded'                  │
│     (idempotency key =          │
│      document_files.id)         │
└──────────┬──────────────────────┘
           │
           ▼
┌─────────────────────────────────┐
│  2. Inngest event:              │
│     document/uploaded           │
│     concurrency: {              │
│       key: "org-${orgId}",      │
│       limit: 3                  │
│     }                           │
└──────────┬──────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────┐
│  2.5 Image Quality Check (NEW)              │
│                                             │
│  step.run('quality-check')                  │
│    ├─ Check resolution (min 1024x768)       │
│    ├─ Check file size (reject <10KB)        │
│    ├─ Check format (JPEG/PNG/PDF)           │
│    ├─ If below threshold → flag for user    │
│    │   but still attempt extraction         │
│    └─ pipeline_status = 'extracting'        │
└──────────┬──────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────┐
│  3. AI Extraction (per image/page)          │
│                                             │
│  step.run('extract-page-N')                 │
│    ├─ generateObject() with vision model    │
│    ├─ Schema: InvoiceExtraction (Zod)       │
│    ├─ Track: model used, tokens, cost       │
│    ├─ Returns structured data + confidence  │
│    └─ Retry budget: max 2 retries,          │
│       max $0.50 per document                │
└──────────┬──────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────┐
│  4. Merge & Validate                        │
│                                             │
│  step.run('merge-validate')                 │
│    ├─ Combine multi-page extractions        │
│    ├─ Validate: math (items sum = subtotal, │
│    │   subtotal + VAT = total)              │
│    ├─ Validate: tax_id format (13 digits)   │
│    ├─ Normalize: amount ALWAYS = pre-VAT    │
│    │   (if vat_included, divide by 1.07)    │
│    ├─ If validation fails → retry with      │
│    │   stronger model (within budget)       │
│    ├─ Flag low-confidence fields            │
│    └─ pipeline_status = 'validated' or      │
│       'failed_validation'                   │
└──────────┬──────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────┐
│  5. Vendor Lookup                           │
│                                             │
│  step.run('vendor-lookup')                  │
│    ├─ Check vendor registry by              │
│    │   (org_id, tax_id, branch_number)      │
│    ├─ If new vendor → DBD API lookup        │
│    │   (fallback: OpenCorporates)           │
│    ├─ If DBD down → store without verify,   │
│    │   flag dbd_verified = false            │
│    ├─ Auto-fill/correct company details     │
│    └─ Store vendor if new (upsert)          │
└──────────┬──────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────┐
│  6. WHT Classification (SUGGESTION ONLY)    │
│                                             │
│  step.run('classify-wht')                   │
│    ├─ Classify each line item by type       │
│    ├─ Lookup rate from wht_rates table      │
│    │   (payment_type × entity_type)         │
│    ├─ Assign rd_payment_type_code           │
│    ├─ Consider: is_ewht? DTA country?       │
│    ├─ All classifications are SUGGESTIONS   │
│    │   (needs_review = true for WHT)        │
│    └─ Flag ambiguous classifications        │
└──────────┬──────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────┐
│  7. Store & Queue for Review                │
│     (DB TRANSACTION — atomic)               │
│                                             │
│  step.run('store-result')                   │
│    ├─ UPSERT document (idempotent by        │
│    │   document_files.id)                   │
│    ├─ Create line items                     │
│    ├─ needs_review = true                   │
│    ├─ status = 'draft'                      │
│    ├─ Log to audit_log                      │
│    └─ pipeline_status = 'completed'         │
│                                             │
│  NOTE: NO reconciliation here.              │
│  NO WHT certificate creation here.          │
│  Both happen AFTER user confirms in review. │
└─────────────────────────────────────────────┘
```

### Post-Review Triggers (NEW)

```
User confirms document in Review UI
  │
  ├─► WHT confirmed? ──► Create WHT certificate draft
  │                       (allocate sequence number
  │                        with DB lock on counter)
  │
  ├─► Create payment record
  │   (gross - WHT = net expected)
  │
  └─► Trigger reconciliation
      │
      ▼
┌─────────────────────────────────────────────┐
│  Reconciliation Engine                      │
│  (Inngest: concurrency limit 1 per org)     │
│                                             │
│  1. Compute expected bank amount:           │
│     net_amount = total - wht_withheld       │
│                                             │
│  2. Search transactions:                    │
│     a) Exact: amount = net_amount           │
│        AND date within ±7 days              │
│     b) Fuzzy: amount ±1%                    │
│        AND date within ±14 days             │
│     c) Split: sum of 2-3 txns = net_amount  │
│                                             │
│  3. If match found:                         │
│     → Create reconciliation_matches record  │
│     → Update transaction.reconciliation_    │
│       status                                │
│     → Update document.status                │
│                                             │
│  4. If no match:                            │
│     → Leave as unmatched                    │
│     → Will appear in reconciliation review  │
└─────────────────────────────────────────────┘
```

## WHT Rate Engine (Rev 2)

```
┌─────────────────────────────────────────────────────────────────┐
│  WHT RATE LOOKUP                                                │
│  lookup_wht_rate(payment_type, entity_type, is_ewht?) →         │
│    { rate, form_type, rd_payment_type_code }                    │
│                                                                 │
│  Source: wht_rates table (configurable, not hardcoded)          │
│  Rates have effective_from/to dates for temporal changes        │
└─────────────────────────────────────────────────────────────────┘

DOMESTIC RATES (PND 3 = individual, PND 53 = company):

  Payment Type             │ Ind  │ Corp │ e-WHT* │ RD Code
  ─────────────────────────┼──────┼──────┼────────┼────────
  Services (general)       │  3%  │  3%  │   1%   │ 40(8)
  Professional fees        │  3%  │  3%  │   1%   │ 40(6)
  Rent — immovable         │  5%  │  5%  │   1%   │ 40(5)(a)
  Rent — other assets      │  5%  │  5%  │   1%   │ 40(5)(a)
  Advertising              │  2%  │  2%  │   2%   │ 40(8)
  Transport                │  1%  │  1%  │   1%   │ 40(8)
  Insurance premiums       │  1%  │  1%  │   1%   │ 40(8)
  Royalties / IP           │  3%  │  3%  │   1%   │ 40(3)
  Prizes / promotions      │  5%  │  3%  │   1%   │ 40(8)
  Interest                 │ 15%  │  1%  │   —    │ 40(4)(a)
  Dividends                │ 10%  │ 10%  │   —    │ 40(4)(b)

  * e-WHT: valid Jan 2023–Dec 2025, companies only.
    Extension to 2026 UNCONFIRMED — verify before launch.
    Gated on: is_ewht = true AND entity_type = company.

FOREIGN RATES (PND 54):

  Payment Type             │ Default │ DTA may reduce │ RD Code
  ─────────────────────────┼─────────┼────────────────┼────────
  Service fees             │   15%   │ 0% (no PE)     │ 40(8)
  Royalties / license fees │   15%   │ 5–15%          │ 40(3)
  Interest                 │   15%   │ 10–15%         │ 40(4)(a)
  Dividends                │   10%   │ 5–10%          │ 40(4)(b)
  Capital gains            │   15%   │ varies         │ —
  Rent of property         │   15%   │ varies         │ 40(5)(a)
  Technical/mgmt fees      │   15%   │ varies         │ 40(8)

  V1: Always use default rates. DTA application deferred to V2.
  DTA requires: Certificate of Tax Residence + DTR form pre-filing.

VAT CALCULATION:

  net_vat_payable = output_vat - input_vat_pp30
  PP 36 (reverse charge 7% on foreign services) is a SEPARATE
  payment obligation. It is NOT reclaimable and NEVER offsets
  the PP 30 calculation. Different deadline (15th vs 23rd).

  VAT rate = 7% (reduced from statutory 10%).
  Valid through Sep 2026. STORED IN CONFIG, NOT HARDCODED.

WHT CALCULATION:

  wht_amount = amount_before_vat × wht_rate
  amount_before_vat = line_item.amount (ALWAYS pre-VAT in our schema)
  net_payment = invoice_total - sum(wht_amounts)
```

## UI Navigation Structure

```
┌──────────────────────────────────────────────────────┐
│  [Org Switcher ▼]          Thai Accounting App       │
├──────────────────────────────────────────────────────┤
│                                                      │
│  Sidebar (desktop):                                  │
│  ├─ Dashboard (overview, alerts, deadlines)          │
│  ├─ Bank Accounts                                    │
│  │    ├─ Account list                                │
│  │    ├─ Upload statement                            │
│  │    └─ Transactions (with reconciliation status)   │
│  ├─ Documents                                        │
│  │    ├─ Expenses (list, review)                     │
│  │    ├─ Income/Sales (list, review)                 │
│  │    └─ Upload new (multi-image)                    │
│  ├─ Reconciliation                                   │
│  │    ├─ Unmatched transactions                      │
│  │    ├─ Review queue (AI-flagged items)             │
│  │    └─ Petty cash                                  │
│  ├─ Tax & Filing                                     │
│  │    ├─ WHT Certificates (50 Tawi)                  │
│  │    ├─ Monthly WHT Summary (PND 3/53/54)          │
│  │    ├─ VAT (PP 30 / PP 36)                         │
│  │    └─ Filing calendar & deadlines                 │
│  ├─ Vendors                                          │
│  │    ├─ Vendor registry                             │
│  │    └─ Add/edit vendor                             │
│  ├─ Reports & Export                                 │
│  │    ├─ Expense/income summary                      │
│  │    ├─ VAT input/output register                   │
│  │    ├─ WHT summary by period                       │
│  │    └─ Export (FlowAccount/Peak/RD CSV)            │
│  └─ Settings                                         │
│       ├─ Organization details                        │
│       ├─ Bank account setup                          │
│       ├─ WHT rates configuration                     │
│       └─ AI model preferences                        │
│                                                      │
│  Mobile /capture route (NEW):                        │
│  ├─ Single-purpose, no sidebar chrome                │
│  ├─ Camera button → photo preview → confirm → done   │
│  ├─ <input accept="image/*" capture="environment">   │
│  └─ Queue uploads for processing                     │
│                                                      │
└──────────────────────────────────────────────────────┘
```

## Pre-Implementation Validation Sprint

Before writing Phase 1 code, validate critical assumptions:

### Day 1: Validate

| # | Task | Blocking | How to validate |
|---|------|----------|----------------|
| V1 | KBank CSV/PDF format | Phase 2 | Download actual statement from K-BIZ or ask user for anonymized sample |
| V2 | DBD Open API access | Phase 3 | `curl https://openapi.dbd.go.th/api/v1/juristic_person/0105500002383` — test endpoint, check auth requirements |
| V3 | Inngest + Next.js 16 | Phase 1 | Build minimal hello-world: Inngest function triggered by API route, deployed to Vercel |
| V4 | React-PDF Thai fonts | Phase 5 | Build 50 Tawi PoC with Sarabun font, Thai+English mixed text, checkbox rendering |
| V5 | OpenRouter vision models | Phase 3 | Test 3 models via API: send sample invoice image, check response quality |

### Day 2: Revise Schema & Plan

Apply all critical and high-priority schema changes (this document = done).
Set up Phase 1 project infrastructure.

## Phase Breakdown (Rev 2)

### Phase 1: Foundation + Infrastructure

**Goal:** Database schema, multi-tenant infrastructure, app shell, Inngest setup, monitoring.

**Deliverables:**
- Drizzle schema for ALL tables (including new tables from review)
- Neon Postgres connection via @neondatabase/serverless + Drizzle
- RLS policies for org_id isolation
- App layout: sidebar navigation, org switcher, page shells
- shadcn/ui setup + base components
- Organization CRUD (create, switch, edit) with branch_number + fiscal year
- Users stub table
- Audit log infrastructure (middleware that logs mutations)
- pnpm migration (replace npm)
- Vitest setup with test database
- Inngest client setup + hello-world function + Vercel integration (MOVED from Phase 3)
- Sentry error tracking setup
- Blob storage abstraction layer (interface wrapping Vercel Blob)
- WHT rates seed data (configurable rate table)
- Filing deadline calculator (with configurable e-filing extension days)
- CLAUDE.md with build/test/lint commands

**Tests:**
- Schema migration up/down for all tables
- RLS policy enforcement (org A cannot see org B data)
- Org CRUD operations
- Audit log captures mutations
- WHT rate lookup returns correct rates for all payment type × entity type combos
- Filing deadline calculation (with and without e-filing extension)
- Inngest function fires and completes
- Blob storage abstraction (upload/retrieve/delete)
- Component rendering tests for layout

### Phase 2: Bank Statements + Vendor CRUD

**Goal:** Upload, parse, and store bank statements. Maintain accurate running balances. Basic vendor management.

**Deliverables:**
- Bank account management UI (add account, select bank)
- Statement upload UI (drag-drop PDF/CSV)
- KasikornBank CSV parser (primary) — format validated in V1
- KasikornBank PDF parser
- Generic CSV parser with column mapping
- AI fallback parser (unknown formats)
- Transaction storage with dedup (external_ref + date + amount)
- Running balance validation (opening + sum(txns) = closing)
- Statement import status tracking
- Transaction list view with TanStack Table (sort, filter, search)
- Vendor CRUD UI (create, edit, list, search by tax_id) — MOVED from Phase 3
- Vendor dedup by (org_id, tax_id, branch_number) unique constraint

**Tests:**
- Parser tests with real statement fixtures (anonymized)
- Dedup logic (same statement re-upload = no duplicates)
- Balance validation (correct and incorrect statements)
- Edge cases: reversed transactions, same-day duplicates
- Vendor CRUD operations
- Vendor dedup on duplicate tax_id

### Phase 3: Documents & AI Extraction + Mobile Capture

**Goal:** Upload invoices/receipts (multi-image), AI-extract data, store structured. Mobile capture route.

**Deliverables:**
- "Add expense" / "Add income" upload flow (multi-image per document)
- Mobile `/capture` route — single-purpose camera capture page
- Blob storage integration (via abstraction layer)
- AI extraction pipeline via Inngest (Rev 2 pipeline: 7 steps, idempotent)
- Image quality preprocessing step
- Model benchmark harness (test 5 models, >90% accuracy target, 2-day timebox)
- generateObject with InvoiceExtraction Zod schema
- Validation: math checks, required fields, tax_id format, amount normalization
- Vendor auto-lookup via DBD Open API (or OpenCorporates fallback)
- Vendor registry: auto-create on first invoice, dedup by tax_id
- Review UI: side-by-side images + extracted data, edit inline, confirm
- WHT classification suggestions (using rate lookup from Phase 1)
- Confidence indicators per field
- AI cost tracking per extraction
- Pipeline status tracking (visible in UI for failed/stuck items)
- Retry button for failed pipeline items

**Tests:**
- Extraction accuracy tests (fixture images → expected JSON)
- Validation logic tests (correct, incorrect, vat-included normalization)
- Pipeline idempotency (re-run same document_files.id = no duplicates)
- Pipeline failure + retry (mock AI failure at each step)
- Vendor dedup from AI extraction
- Blob upload/retrieval tests
- Benchmark harness E2E test
- Image quality check (below threshold, above threshold)

### Phase 4: Reconciliation Engine

**Goal:** Match bank transactions to confirmed documents. Support 1:1, split, and combined payments.

**Deliverables:**
- Payment record creation on document confirmation
- Reconciliation engine (Inngest, concurrency limit 1 per org)
- Matching logic: exact net amount, fuzzy amount, split payment detection
- WHT-aware matching (expected bank amount = invoice total - WHT)
- reconciliation_matches junction table (M:N)
- Reconciliation review UI: unmatched transactions, suggested matches
- Manual reconciliation: select to link, split allocation UI
- Petty cash marking: flag small transactions as immaterial
- Reconciliation dashboard: % matched, gap analysis
- Unmatched alerts per period

**Tests:**
- Exact match with WHT deduction (10,700 invoice → 10,400 transaction)
- Fuzzy match scenarios
- Split payment (one invoice, two transactions)
- Combined payment (one transaction, three invoices)
- No-match scenarios
- Concurrent reconciliation (two documents same org, same transaction)
- Petty cash threshold logic
- Re-reconciliation on document update

### Phase 5: WHT & Tax Calculations + Certificates

**Goal:** WHT certificates, monthly filing prep, RD export CSVs, PND 1 Gor annual summary.

**Prerequisites:** Research RD e-Filing CSV format (U3), verify React-PDF Thai rendering (V4).

**Deliverables:**
- WHT type picker in review UI (dropdown with rate preview, RD code shown)
- 50 Tawi certificate generation (React-PDF, Thai Sarabun font)
  - Year-scoped, form-type-scoped sequence numbers
  - Void and replacement workflow
  - Branch number on certificate
- Monthly WHT aggregation by form type (PND 3/53/54)
- PND filing prep view: grouped by form type, totals, status
- Period locking (prevent edits after filing)
- RD e-Filing CSV export (exact format per researched specs)
- Filing calendar with deadlines (15th WHT + e-filing extension, 23rd VAT)
- Deadline alerts
- PND 1 Gor annual summary export (aggregate of 12 months)
- e-WHT rate support (gated on is_ewht flag, configurable dates)

**Tests:**
- WHT rate calculation for all payment types × entity types
- 50 Tawi PDF content validation (Thai text, correct fields, branch number)
- Sequence number: allocation under concurrent requests
- Sequence number: year rollover (Dec → Jan = reset to 1)
- Void + replacement: original keeps number, replacement gets next number
- Monthly aggregation accuracy
- CSV export format validation against RD template fixtures
- Period locking prevents modifications
- Filing deadline calculation (standard + e-filing extension)
- PND 1 Gor: 12 months aggregate matches sum of monthly PND 1 filings

### Phase 6: VAT & Reporting

**Goal:** VAT tracking, PP 30/PP 36 (separate!), analytics, FlowAccount/Peak export.

**Prerequisites:** Research FlowAccount/Peak import formats (U6).

**Deliverables:**
- Input VAT tracking (from confirmed purchase invoices with tax invoices)
- Output VAT tracking (from sales invoices)
- Net VAT calculation: `output_vat - input_vat_pp30` (PP 36 EXCLUDED)
- PP 30 worksheet generation (with per-invoice detail for VAT register)
- PP 36 reverse charge tracking (separate deadline, separate filing)
- Nil filing tracking (must file PP 30 every month even with zero)
- VAT register report (monthly input/output with document-level detail)
- Expense/income summary view
- Export: FlowAccount-compatible expense/sales spreadsheet
- Export: Peak Accounts-compatible format
- Dashboard with key metrics, period summaries, filing status
- Full data export (JSON/CSV backup of all org data)

**Tests:**
- VAT calculation from invoices
- PP 36 identification (foreign vendor + service → 7% non-reclaimable)
- Net VAT excludes PP 36 (critical compliance test)
- Nil filing appears for months with zero activity
- Export format validation against FlowAccount/Peak templates
- Period boundary handling
- Credit note adjusts parent invoice VAT

## Model Benchmark Harness (Phase 3)

```
benchmarks/
  fixtures/
    invoice-01-clean-printed.jpg
    invoice-02-handwritten.jpg
    invoice-03-multi-page/
      page-1.jpg
      page-2.jpg
    invoice-04-blurry.jpg
    invoice-05-thermal-receipt.jpg   ← common Thai case
    ...
    invoice-20-foreign-vendor.pdf
  expected/
    invoice-01.json
    invoice-02.json
    ...
  run-benchmark.ts
  results/
    2026-03-XX-results.json

Success criteria (defined upfront):
  - Primary model: >90% field-level accuracy on clean printed invoices
  - Primary model: >75% field-level accuracy on camera photos
  - Math validation: items sum correctly in >95% of cases
  - Timebox: 2 days maximum for benchmark phase

Tolerance-based assertions (LLMs are non-deterministic):
  - String fields: fuzzy match (Levenshtein distance threshold)
  - Numeric fields: ±0.5 tolerance
  - Date fields: exact match required
  - Pin model versions in test config
```

## File Structure (Rev 2)

```
src/
├── app/
│   ├── layout.tsx
│   ├── page.tsx
│   ├── (app)/
│   │   ├── layout.tsx
│   │   ├── dashboard/
│   │   ├── bank-accounts/
│   │   │   ├── page.tsx
│   │   │   ├── [accountId]/
│   │   │   │   ├── page.tsx
│   │   │   │   └── upload/page.tsx
│   │   ├── documents/
│   │   │   ├── expenses/page.tsx
│   │   │   ├── income/page.tsx
│   │   │   ├── upload/page.tsx
│   │   │   └── [docId]/
│   │   │       └── review/page.tsx
│   │   ├── capture/page.tsx            ← NEW: mobile camera capture
│   │   ├── reconciliation/
│   │   │   ├── page.tsx
│   │   │   └── review/page.tsx
│   │   ├── tax/
│   │   │   ├── wht-certificates/
│   │   │   ├── monthly-filings/
│   │   │   ├── vat/
│   │   │   └── calendar/
│   │   ├── vendors/
│   │   │   ├── page.tsx                ← MOVED: from Phase 3 to Phase 2
│   │   │   └── [vendorId]/page.tsx
│   │   ├── reports/
│   │   └── settings/
│   └── api/
│       ├── inngest/route.ts
│       ├── upload/
│       │   ├── statement/route.ts
│       │   └── document/route.ts
│       └── export/
│           ├── pnd/route.ts
│           ├── vat/route.ts
│           └── accounting/route.ts
├── lib/
│   ├── db/
│   │   ├── schema.ts
│   │   ├── index.ts
│   │   ├── audit.ts                    ← NEW: audit log middleware
│   │   └── migrations/
│   ├── ai/
│   │   ├── openrouter.ts
│   │   ├── schemas/
│   │   │   ├── invoice.ts
│   │   │   └── bank-statement.ts
│   │   ├── extract-invoice.ts
│   │   ├── image-quality.ts            ← NEW: preprocessing checks
│   │   └── reconcile.ts
│   ├── parsers/
│   │   ├── index.ts
│   │   ├── kbank-csv.ts
│   │   ├── kbank-pdf.ts
│   │   ├── bbl-csv.ts
│   │   ├── scb-csv.ts
│   │   └── generic-ai.ts
│   ├── tax/
│   │   ├── wht-rates.ts               ← reads from wht_rates table
│   │   ├── wht-classifier.ts
│   │   ├── vat-calculator.ts
│   │   └── filing-deadlines.ts         ← configurable extension days
│   ├── pdf/
│   │   ├── wht-certificate.tsx
│   │   └── fonts/
│   │       └── Sarabun/               ← Thai font files
│   ├── storage/
│   │   ├── interface.ts                ← NEW: blob storage abstraction
│   │   └── vercel-blob.ts             ← implementation
│   ├── inngest/
│   │   ├── client.ts
│   │   └── functions/
│   │       ├── process-document.ts     ← idempotent, 7-step pipeline
│   │       ├── reconcile.ts            ← triggered post-review
│   │       └── generate-monthly-filings.ts
│   └── utils/
│       ├── org-context.ts
│       ├── money.ts                    ← NUMERIC(14,2) helpers
│       └── thai-tax-id.ts
├── components/
│   ├── ui/
│   ├── layout/
│   │   ├── sidebar.tsx
│   │   ├── org-switcher.tsx
│   │   └── page-header.tsx
│   ├── bank/
│   │   ├── transaction-table.tsx
│   │   ├── statement-upload.tsx
│   │   └── balance-chart.tsx
│   ├── documents/
│   │   ├── multi-image-upload.tsx
│   │   ├── document-review.tsx
│   │   ├── document-list.tsx
│   │   └── mobile-capture.tsx          ← NEW
│   ├── reconciliation/
│   │   ├── match-review.tsx
│   │   ├── split-allocator.tsx         ← NEW: split payment UI
│   │   └── unmatched-list.tsx
│   └── tax/
│       ├── wht-rate-picker.tsx
│       ├── certificate-void.tsx        ← NEW
│       └── filing-status.tsx
└── tests/
    ├── unit/
    │   ├── parsers/
    │   ├── tax/
    │   │   ├── wht-rates.test.ts       ← all payment type × entity combos
    │   │   ├── vat-calculator.test.ts  ← PP 36 exclusion test
    │   │   └── filing-deadlines.test.ts
    │   └── utils/
    ├── integration/
    │   ├── db/
    │   │   ├── rls.test.ts
    │   │   ├── audit-log.test.ts
    │   │   └── wht-sequence.test.ts    ← concurrent allocation test
    │   ├── ai/
    │   │   └── pipeline.test.ts        ← NEW: full pipeline with mocked AI
    │   └── api/
    └── e2e/
        ├── bank-upload.spec.ts
        ├── document-upload.spec.ts
        ├── reconciliation.spec.ts
        └── mobile-capture.spec.ts      ← NEW

benchmarks/                              ← separate from tests
  fixtures/
  expected/
  run-benchmark.ts
  results/
```

## Key Design Principles (Rev 2)

1. **Bank statements are the source of truth.** Everything reconciles against them.
2. **AI suggests, humans confirm.** Every AI-extracted field is reviewable. WHT classifications always require confirmation. Reconciliation happens AFTER confirmation, not during upload.
3. **Deterministic where possible.** CSV parsers, WHT rate lookups, VAT calculations — these are rules, not AI. AI is reserved for: image OCR, unknown format parsing, reconciliation ranking, service type classification.
4. **Multi-tenant from day one.** Every query includes org_id. RLS enforces at the database level.
5. **Every number is a Decimal.** No floating point for money. NUMERIC(14,2) for amounts, NUMERIC(5,4) for rates.
6. **Exportable.** RD-compatible CSVs, FlowAccount/Peak spreadsheets, and PDF certificates are first-class features.
7. **Tests at every layer.** Parsers have fixture tests. Tax calculations have edge case tests. AI extraction has accuracy benchmarks. E2E tests cover critical flows.
8. **Auditable.** Every mutation is logged. Financial records are soft-deleted, never hard-deleted. WHT certificates are voided, never removed.
9. **Configurable tax parameters.** VAT rate, e-filing extension days, e-WHT validity — stored in DB, not hardcoded. Tax law changes should not require code deployment.
10. **Idempotent pipelines.** Every Inngest step can be safely retried without creating duplicates. DB transactions ensure atomicity of writes.
11. **PP 36 is never PP 30.** Reverse-charge VAT on foreign services is a separate obligation with a separate deadline. It NEVER offsets domestic input VAT.

## Unvalidated Assumptions Tracker

| # | Assumption | Status | Blocking | Notes |
|---|-----------|--------|----------|-------|
| V1 | KBank CSV/PDF format | PENDING | Phase 2 | Need sample statement |
| V2 | DBD Open API accessible | PENDING | Phase 3 | Test endpoint |
| V3 | Inngest + Next.js 16 | PENDING | Phase 1 | Build PoC |
| V4 | React-PDF Thai fonts | PENDING | Phase 5 | Build 50 Tawi PoC |
| V5 | OpenRouter vision models | PENDING | Phase 3 | Test 3 models |
| V6 | RD e-Filing CSV format | PENDING | Phase 5 | Obtain from portal/accountant |
| V7 | FlowAccount import format | PENDING | Phase 6 | Create trial account |
| V8 | Peak Accounts import format | PENDING | Phase 6 | Create trial account |
| V9 | e-WHT rates extended to 2026 | UNCONFIRMED | Phase 5 | Check RD announcements |
| V10 | VAT rate stays 7% | VALID thru Sep 2026 | — | Configurable in DB |
| V11 | e-Filing +8 day extension | VALID thru Jan 2027 | — | Configurable in DB |
