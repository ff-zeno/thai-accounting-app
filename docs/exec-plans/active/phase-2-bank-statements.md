# Phase 2: Bank Statements + Vendor CRUD

**Status:** Not started
**Dependencies:** Phase 1a (database schema, Drizzle ORM, Inngest client), Phase 1b (app shell, sidebar, shadcn/ui)
**Blocked by:** V1 (KBank CSV/PDF format validation from Phase 0)

## Goal

Upload, parse, and store bank statements with accurate running balances. Build vendor registry with dedup. This phase establishes the "source of truth" layer -- bank transactions that all later reconciliation matches against.

## Deliverables

### Bank Account Management

- Bank account management UI (add account, select bank, edit details)
- Bank accounts scoped to org_id (application-level WHERE clause)
- Support for multiple accounts per org (e.g., KBank savings, KBank current)

### Statement Upload

- Statement upload UI with drag-drop for PDF and CSV files
- Upload via API route (`/api/upload/statement`)
- Statement metadata storage: period_start, period_end, opening_balance, closing_balance, parser_used
- Import status tracking (pending, processing, completed, failed) visible in UI

### Parsers

- **KasikornBank CSV parser** (primary format, validated in Phase 0 sprint)
  - Deterministic, no AI -- parse column positions from known format
  - Extract: date, description, amount, type (debit/credit), running_balance, reference_no, channel
- **KasikornBank PDF parser**
  - Uses pdf-parse for text extraction, then structured parsing
  - Same field extraction as CSV parser
- **Generic CSV parser with column mapping**
  - UI for user to map columns (date, description, amount, etc.)
  - Saves mapping per bank_account for reuse on future uploads
- **AI fallback parser** (unknown/unrecognized formats)
  - Uses Vercel AI SDK + OpenRouter to extract transaction data
  - Structured output via generateObject with BankStatement Zod schema
  - Clearly flagged as AI-parsed in statement record (parser_used = 'ai_fallback')

### Transaction Storage

- Transaction dedup via UNIQUE constraint: `(org_id, bank_account_id, external_ref, date, amount)`
  - Re-uploading the same statement produces zero new rows
  - external_ref derived from bank's reference number or generated hash of (date + description + amount + running_balance) when no reference exists
- Running balance validation: `opening_balance + SUM(transaction amounts) = closing_balance`
  - Validation runs after import, flags mismatches in UI
  - Does NOT block import -- stores transactions but shows warning
- Indexes on key query patterns:
  - `(org_id, date)` for date range queries
  - `(org_id, reconciliation_status)` for unmatched filtering
  - `(org_id, amount, date)` for reconciliation lookups (Phase 4)

### Transaction List UI

- TanStack Table with:
  - Sorting: by date, amount, type, reconciliation_status
  - Filtering: by date range, type (debit/credit), reconciliation status, amount range
  - Search: full-text on description, counterparty, reference_no
  - Pagination: cursor-based for 10K+ rows (keyset pagination on date + id)
- Reconciliation status column (unmatched/matched/partial -- read-only in this phase)
- Export filtered view to CSV

### Vendor CRUD (moved from Phase 3)

- Vendor CRUD UI: create, edit, list vendors
- Search vendors by tax_id (13-digit), name, name_th
- Vendor dedup via UNIQUE constraint: `(org_id, tax_id, branch_number)`
  - On duplicate, show existing vendor and offer to update instead of creating new
- Fields: name, name_th, tax_id, branch_number, address, address_th, email, payment_terms_days, is_vat_registered, entity_type (individual/company/foreign), country
- DBD verification fields (dbd_verified, dbd_data) -- populated later by Phase 3 pipeline, but columns exist now
- Vendor list with TanStack Table (search, sort, pagination)

## Tests

### Parser Tests (Vitest, fixture-based)

- KBank CSV: parse real anonymized statement fixture, assert correct field extraction for all rows
- KBank CSV: handle edge cases (reversed transactions, zero-amount entries, Thai characters in description)
- KBank PDF: parse PDF fixture, assert same output as CSV for identical period
- Generic CSV: map columns from arbitrary CSV, assert correct extraction
- AI fallback: mock AI response, assert structured output matches schema

### Dedup Tests (integration, Docker Postgres)

- Upload same KBank CSV twice: assert zero new transactions on second upload
- Upload overlapping statements (Jan-Feb, then Feb-Mar): assert Feb transactions not duplicated
- Same-day transactions with different amounts: both stored (not deduped)
- Same-day transactions with same amount but different external_ref: both stored

### Balance Validation Tests

- Correct statement: opening + sum = closing, no warning
- Incorrect statement: mismatch detected, warning stored on statement record
- Statement with reversed/voided transaction: balance still validates

### Vendor Tests (integration, Docker Postgres)

- CRUD operations: create, read, update, soft-delete
- Dedup: attempt to create vendor with existing (org_id, tax_id, branch_number) returns error with existing vendor ID
- Search by partial tax_id
- Org isolation: vendor from org A not visible to org B query

### E2E Tests (Playwright)

- Upload KBank CSV via drag-drop, see transactions in table
- Sort and filter transactions
- Create vendor, search by tax_id, edit vendor
- Re-upload same statement, verify no duplicates in table

## Checkpoint

Phase 2 is complete when:

1. A user can add a bank account and upload a KBank CSV statement
2. Transactions appear in the table with correct amounts and dates
3. Re-uploading the same statement creates no duplicate transactions
4. Running balance validates (opening + sum = closing) and mismatches show a warning
5. Transactions table handles 10K+ rows with cursor-based pagination
6. Vendor CRUD works with dedup enforcement on (org_id, tax_id, branch_number)
7. All parser tests pass with anonymized fixture data
8. All dedup and balance validation integration tests pass
