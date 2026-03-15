# Database Schema Reference

**Status:** Active -- Rev 3 (post-round-2-review)
**Source:** [001-thai-accounting-platform.md](001-thai-accounting-platform.md) with fixes from [Round 2 Engineering Review](../../reviews/review-round2-engineering-2026-03-14.md)

---

## Conventions

- **Primary keys:** `id UUID DEFAULT gen_random_uuid()` on all tables
- **Multi-tenancy:** Every data table has `org_id UUID NOT NULL REFERENCES organizations(id)`. RLS policies filter by org_id.
- **Money:** `NUMERIC(14,2)` for amounts in THB. `NUMERIC(12,6)` for exchange rates. `NUMERIC(5,4)` for tax/WHT rates. `NUMERIC(8,6)` for USD cost tracking.
- **Timestamps:** `TIMESTAMPTZ` for all temporal columns. Stored as UTC. UI displays in `Asia/Bangkok`. `DATE` columns store Thai local date.
- **Soft delete:** Most tables include `deleted_at TIMESTAMPTZ` for soft delete. Exceptions noted per table.
- **created_at / updated_at:** All tables have `created_at TIMESTAMPTZ DEFAULT NOW()` and `updated_at TIMESTAMPTZ`. Exceptions: `audit_log` has only `created_at` (immutable).
- **Buddhist Era (B.E.):** `wht_sequence_counters.year` stores Gregorian year. Display layer converts to B.E. (Gregorian + 543) via `toBuddhistYear()` utility.
- **Table count:** 7 new tables added in Rev 2: `payments`, `reconciliation_matches`, `wht_certificate_items`, `wht_sequence_counters`, `wht_rates`, `audit_log`, `users` (stub).

---

## Core Tables

### organizations

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| name | TEXT NOT NULL | English name |
| name_th | TEXT | Thai name |
| tax_id | VARCHAR(13) NOT NULL | 13-digit Thai tax ID |
| branch_number | VARCHAR(5) NOT NULL DEFAULT '00000' | '00000' = head office |
| registration_no | TEXT | |
| address | TEXT | English address |
| address_th | TEXT | Thai address |
| is_vat_registered | BOOLEAN DEFAULT false | |
| fiscal_year_end_month | INTEGER DEFAULT 12 | |
| fiscal_year_end_day | INTEGER DEFAULT 31 | |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |
| deleted_at | TIMESTAMPTZ | Soft delete |

### users (stub)

Placeholder for future auth integration. No authentication logic in V1.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| org_id | UUID FK -> organizations | |
| name | TEXT NOT NULL | |
| email | TEXT NOT NULL | |
| role | TEXT | |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |
| deleted_at | TIMESTAMPTZ | |

### vendors

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| org_id | UUID FK -> organizations | |
| name | TEXT NOT NULL | English name |
| name_th | TEXT | Thai name |
| tax_id | VARCHAR(13) | |
| registration_no | TEXT | |
| branch_number | VARCHAR(5) | |
| address | TEXT | |
| address_th | TEXT | |
| email | TEXT | For sending 50 Tawi certificates |
| payment_terms_days | INTEGER | For due date calculation |
| is_vat_registered | BOOLEAN | |
| entity_type | TEXT NOT NULL | Enum: individual / company / foreign |
| country | TEXT DEFAULT 'TH' | |
| dbd_verified | BOOLEAN DEFAULT false | |
| dbd_data | JSONB | Raw DBD API response |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |
| deleted_at | TIMESTAMPTZ | |

**Unique constraints:**
- `UNIQUE(org_id, tax_id, branch_number)`

### bank_accounts

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| org_id | UUID FK -> organizations | |
| bank_code | TEXT NOT NULL | Bank identifier |
| account_number | TEXT NOT NULL | |
| account_name | TEXT | |
| currency | VARCHAR(3) DEFAULT 'THB' | |
| current_balance | NUMERIC(14,2) | |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |
| deleted_at | TIMESTAMPTZ | |

---

## Document Tables

### documents

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| org_id | UUID FK -> organizations | |
| vendor_id | UUID FK -> vendors | Nullable |
| related_document_id | UUID FK -> documents | For credit/debit note parent |
| type | TEXT NOT NULL | Enum: invoice / receipt / debit_note / credit_note |
| document_number | TEXT | |
| issue_date | DATE | |
| due_date | DATE | |
| subtotal | NUMERIC(14,2) | Pre-VAT total |
| vat_amount | NUMERIC(14,2) | |
| total_amount | NUMERIC(14,2) | |
| currency | VARCHAR(3) DEFAULT 'THB' | |
| exchange_rate | NUMERIC(12,6) | For foreign currency documents |
| total_amount_thb | NUMERIC(14,2) | THB equivalent when foreign currency |
| direction | TEXT NOT NULL | Enum: expense / income |
| status | TEXT NOT NULL DEFAULT 'draft' | Enum: draft / confirmed / partially_paid / paid / voided |
| ~~amount_paid~~ | — | COMPUTED: `SUM(payments.net_amount_paid)` — not stored |
| ~~balance_due~~ | — | COMPUTED: `total_amount - amount_paid` — not stored |
| vat_period_year | INTEGER | Which VAT period this belongs to |
| vat_period_month | INTEGER | |
| ai_confidence | NUMERIC(3,2) | 0.00 - 1.00 |
| needs_review | BOOLEAN DEFAULT true | |
| review_notes | TEXT | |
| created_by | UUID FK -> users | |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |
| deleted_at | TIMESTAMPTZ | |

**Indexes:**
- `INDEX(org_id, vendor_id, issue_date)`
- `INDEX(org_id, status)`

### document_line_items

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| org_id | UUID FK -> organizations | |
| document_id | UUID FK -> documents | |
| description | TEXT | |
| quantity | NUMERIC(10,4) | |
| unit_price | NUMERIC(14,2) | |
| amount | NUMERIC(14,2) | Always pre-VAT |
| vat_amount | NUMERIC(14,2) | |
| wht_rate | NUMERIC(5,4) | Precision supports treaty rates |
| wht_amount | NUMERIC(14,2) | |
| wht_type | TEXT | |
| rd_payment_type_code | TEXT | RD Section 40 code |
| account_code | TEXT | Nullable; for future chart of accounts |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |
| deleted_at | TIMESTAMPTZ | |

### document_files

Pipeline processes per-document: one Inngest function per document, receiving all file IDs belonging to that document.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | Also serves as idempotency key for pipeline |
| org_id | UUID FK -> organizations | |
| document_id | UUID FK -> documents | |
| file_url | TEXT NOT NULL | Blob storage URL |
| file_type | TEXT | MIME type |
| page_number | INTEGER | For multi-page documents |
| original_filename | TEXT | |
| pipeline_status | TEXT NOT NULL DEFAULT 'uploaded' | See enum below |
| ai_raw_response | JSONB | Raw LLM extraction output |
| ai_model_used | TEXT | Which model performed extraction |
| ai_cost_tokens | INTEGER | Token count for cost tracking |
| ai_cost_usd | NUMERIC(8,6) | USD cost of extraction |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |
| deleted_at | TIMESTAMPTZ | |

**pipeline_status enum values:**
`uploaded` -> `extracting` -> `validating` -> `validated` -> `completed`

Failure states: `failed_extraction`, `failed_validation`

Full enum: `uploaded / extracting / validating / validated / completed / failed_extraction / failed_validation`

---

## Payments & Reconciliation Tables

### payments

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| org_id | UUID FK -> organizations | |
| document_id | UUID FK -> documents | |
| payment_date | DATE | |
| gross_amount | NUMERIC(14,2) | Payment amount before WHT deduction |
| wht_amount_withheld | NUMERIC(14,2) | Amount retained for Revenue Department |
| net_amount_paid | NUMERIC(14,2) | Actual transfer amount (gross - WHT) |
| payment_method | TEXT | Enum: bank_transfer / promptpay / cheque / cash |
| is_ewht | BOOLEAN DEFAULT false | Paid via e-WHT system |
| notes | TEXT | |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |
| deleted_at | TIMESTAMPTZ | |

### reconciliation_matches

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| org_id | UUID FK -> organizations | |
| transaction_id | UUID FK -> transactions | |
| document_id | UUID FK -> documents | |
| payment_id | UUID FK -> payments | Links to payment record |
| matched_amount | NUMERIC(14,2) | Allocated portion of transaction |
| match_type | TEXT NOT NULL | Enum: exact / fuzzy / manual / ai_suggested |
| confidence | NUMERIC(3,2) | 0.00 - 1.00 |
| matched_by | TEXT NOT NULL | Enum: auto / manual |
| matched_at | TIMESTAMPTZ | |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |
| deleted_at | TIMESTAMPTZ | |

**Unique constraints:**
- `UNIQUE(transaction_id, document_id)`

### bank_statements

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| org_id | UUID FK -> organizations | |
| bank_account_id | UUID FK -> bank_accounts | |
| period_start | DATE | |
| period_end | DATE | |
| opening_balance | NUMERIC(14,2) | |
| closing_balance | NUMERIC(14,2) | |
| file_url | TEXT | |
| parser_used | TEXT | Which parser extracted transactions |
| import_status | TEXT | |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |
| deleted_at | TIMESTAMPTZ | |

**Unique constraints:**
- `UNIQUE(org_id, bank_account_id, period_start, period_end)`

### transactions

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| org_id | UUID FK -> organizations | |
| bank_account_id | UUID FK -> bank_accounts | |
| statement_id | UUID FK -> bank_statements | |
| date | DATE | |
| description | TEXT | |
| amount | NUMERIC(14,2) | |
| type | TEXT NOT NULL | Enum: debit / credit |
| running_balance | NUMERIC(14,2) | |
| reference_no | TEXT | |
| channel | TEXT | Transfer channel |
| counterparty | TEXT | |
| reconciliation_status | TEXT | Denormalized for query performance |
| is_petty_cash | BOOLEAN DEFAULT false | |
| external_ref | TEXT | Dedup key from bank |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |
| deleted_at | TIMESTAMPTZ | |

**Indexes:**
- `INDEX(org_id, date)`
- `INDEX(org_id, reconciliation_status)`
- `INDEX(org_id, amount, date)`

**Unique constraints:**
- `UNIQUE(org_id, bank_account_id, external_ref, date, amount)` -- transaction dedup

---

## WHT & Tax Tables

### wht_certificates

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| org_id | UUID FK -> organizations | |
| certificate_no | TEXT NOT NULL | Format: {form_type}/{year}/{seq} |
| payee_vendor_id | UUID FK -> vendors | |
| payment_date | DATE | |
| total_base_amount | NUMERIC(14,2) | |
| total_wht | NUMERIC(14,2) | |
| form_type | TEXT NOT NULL | Enum: pnd3 / pnd53 / pnd54 |
| filing_id | UUID FK -> wht_monthly_filings | Links to monthly filing |
| pdf_url | TEXT | Generated 50 Tawi PDF |
| status | TEXT NOT NULL DEFAULT 'draft' | Enum: draft / issued / voided / replaced |
| voided_at | TIMESTAMPTZ | |
| void_reason | TEXT | |
| replacement_cert_id | UUID FK -> wht_certificates | FK to replacement cert |
| issued_date | DATE | |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |
| deleted_at | TIMESTAMPTZ | |

**Unique constraints:**
- `UNIQUE(org_id, certificate_no)`

**Note on form_type:** PND 1 is payroll (out of scope for V1). PND 3 = individual vendors, PND 53 = corporate vendors, PND 54 = foreign remittance.

### wht_certificate_items

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| org_id | UUID FK -> organizations | |
| certificate_id | UUID FK -> wht_certificates | |
| document_id | UUID FK -> documents | |
| line_item_id | UUID FK -> document_line_items | |
| base_amount | NUMERIC(14,2) | |
| wht_rate | NUMERIC(5,4) | |
| wht_amount | NUMERIC(14,2) | |
| rd_payment_type_code | TEXT | RD Section 40 code |
| wht_type | TEXT | |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |
| deleted_at | TIMESTAMPTZ | |

### wht_sequence_counters

Manages auto-incrementing certificate numbers per org/form/year. Uses `SELECT ... FOR UPDATE` for concurrent safety.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| org_id | UUID FK -> organizations | |
| form_type | TEXT NOT NULL | Matches wht_certificates.form_type |
| year | INTEGER NOT NULL | Gregorian year; display converts to B.E. (+543) |
| next_sequence | INTEGER NOT NULL DEFAULT 1 | |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

**No deleted_at** -- sequence counters must never be deleted.

**Unique constraints:**
- `UNIQUE(org_id, form_type, year)`

### wht_monthly_filings

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| org_id | UUID FK -> organizations | |
| period_year | INTEGER NOT NULL | |
| period_month | INTEGER NOT NULL | 1-12 |
| form_type | TEXT NOT NULL | Matches wht_certificates.form_type |
| total_base_amount | NUMERIC(14,2) | Computed from certificates |
| total_wht_amount | NUMERIC(14,2) | Computed from certificates |
| status | TEXT NOT NULL DEFAULT 'draft' | Enum: draft / filed / paid |
| filing_date | DATE | |
| deadline | DATE | Computed with e-filing extension |
| period_locked | BOOLEAN DEFAULT false | Prevents edits after filing |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |
| deleted_at | TIMESTAMPTZ | |

**Unique constraints:**
- `UNIQUE(org_id, period_year, period_month, form_type)`

### wht_rates

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| payment_type | TEXT NOT NULL | e.g., service, rental, advertising |
| entity_type | TEXT NOT NULL | individual / company / foreign |
| rd_payment_type_code | TEXT | RD Section 40 code |
| standard_rate | NUMERIC(5,4) NOT NULL | e.g., 0.0300 = 3% |
| ewht_rate | NUMERIC(5,4) | Nullable; reduced e-WHT rate |
| ewht_valid_from | DATE | |
| ewht_valid_to | DATE | |
| effective_from | DATE | |
| effective_to | DATE | |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

### vat_records

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| org_id | UUID FK -> organizations | |
| period_year | INTEGER NOT NULL | |
| period_month | INTEGER NOT NULL | 1-12 |
| output_vat | NUMERIC(14,2) | Computed from sales documents |
| input_vat_pp30 | NUMERIC(14,2) | Reclaimable input VAT only |
| pp36_reverse_charge | NUMERIC(14,2) | Not reclaimable; filed separately |
| net_vat_payable | NUMERIC(14,2) | = output_vat - input_vat_pp30 |
| pp30_status | TEXT DEFAULT 'draft' | Enum: draft / filed / paid |
| pp30_deadline | DATE | 23rd of following month (with e-filing extension) |
| pp36_status | TEXT DEFAULT 'draft' | Separate filing status |
| pp36_deadline | DATE | 15th of following month (different from PP 30) |
| nil_filing_required | BOOLEAN DEFAULT false | Must file even with zero amounts |
| period_locked | BOOLEAN DEFAULT false | |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |
| deleted_at | TIMESTAMPTZ | |

**Unique constraints:**
- `UNIQUE(org_id, period_year, period_month)`

---

## System Tables

### tax_config

Key-value configuration for tax parameters. Avoids hardcoding rates and deadlines.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| key | TEXT NOT NULL | Unique config key |
| value | TEXT NOT NULL | Config value (app parses to appropriate type) |
| description | TEXT | Human-readable explanation |
| effective_from | DATE | When this config takes effect |
| effective_to | DATE | Nullable; null = currently active |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

**Unique constraints:**
- `UNIQUE(key)`

**Seed data:**

| key | value | description |
|-----|-------|-------------|
| vat_rate | 0.07 | Standard VAT rate (7%) |
| efiling_extension_days | 8 | Extra days for e-filing deadline |
| pp36_deadline_day | 15 | Day of month for PP 36 filing deadline |
| pp30_deadline_day | 23 | Day of month for PP 30 filing deadline (with e-filing) |

### audit_log

Immutable append-only log. No updates or deletes permitted.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| org_id | UUID FK -> organizations | |
| entity_type | TEXT NOT NULL | Table name being audited |
| entity_id | UUID NOT NULL | PK of audited row |
| action | TEXT NOT NULL | e.g., create / update / delete / void |
| old_value | JSONB | Previous state (null for creates) |
| new_value | JSONB | New state (null for deletes) |
| actor_id | UUID FK -> users | Who performed the action |
| created_at | TIMESTAMPTZ DEFAULT NOW() | |

**No updated_at** -- audit log rows are immutable.
**No deleted_at** -- audit log rows must never be deleted.

---

## Relationships Summary

```
organizations
  |-- users (org_id)
  |-- vendors (org_id)
  |-- bank_accounts (org_id)
  |     |-- bank_statements (bank_account_id)
  |     |-- transactions (bank_account_id)
  |-- documents (org_id, vendor_id, created_by -> users)
  |     |-- document_line_items (document_id)
  |     |-- document_files (document_id)
  |     |-- payments (document_id)
  |     |-- documents (related_document_id) -- credit/debit notes
  |-- reconciliation_matches (transaction_id, document_id, payment_id)
  |-- wht_certificates (org_id, payee_vendor_id, filing_id)
  |     |-- wht_certificate_items (certificate_id, document_id, line_item_id)
  |     |-- wht_certificates (replacement_cert_id) -- void/replace chain
  |-- wht_sequence_counters (org_id)
  |-- wht_monthly_filings (org_id)
  |-- vat_records (org_id)
  |-- audit_log (org_id, actor_id -> users)
```

---

## Removed from Rev 2 Schema

- **cash_transactions** -- Deferred to V2. No workflow references this table. Petty cash is handled via `transactions.is_petty_cash`.
- **ai_extraction_status** on document_files -- Superseded by `pipeline_status`. Rev 1 leftover.
- **pnd1** from form_type enum -- PND 1 is payroll withholding, explicitly out of scope for V1.
