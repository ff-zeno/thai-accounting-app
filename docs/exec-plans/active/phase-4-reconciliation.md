# Phase 4: Reconciliation Engine

**Status:** Complete (shipped 2026-03-18)
**Dependencies:** Phase 2 (bank transactions, vendor registry), Phase 3 (confirmed documents, AI pipeline, review UI)

## Goal

Match confirmed documents to bank transactions. Triggered AFTER user confirms in review UI -- never during the upload pipeline. Support exact, fuzzy, split, and combined payment matching. Enable audit_log middleware now that workflows are stable.

## Deliverables

### Post-Review Triggers

When a user confirms a document in the review UI (status changes from 'draft' to 'confirmed'):

**1. Create WHT certificate draft**
- Allocate sequence number using MAX+1 on `wht_sequence_counters` with UNIQUE constraint
  - Race-safe: INSERT with unique constraint on (org_id, form_type, year, next_sequence) catches conflicts; retry with next number
  - Format: `{form_type}/{gregorian_year}/{seq}` (e.g., `PND53/2026/001`)
- Create `wht_certificates` record with status='draft'
- Create `wht_certificate_items` from confirmed line items with WHT
- Only created if document has WHT-applicable line items

**2. Create payment record**
- One payment row per document per payment event
- `gross_amount` = document total
- `wht_amount_withheld` = sum of WHT from confirmed line items
- `net_amount_paid` = gross_amount - wht_amount_withheld (actual bank transfer expected)
- `payment_method` defaults to 'bank_transfer' (editable by user)

**3. Trigger reconciliation via Inngest**
- Event name: `document/confirmed`
- Inngest function with concurrency limit: 1 per org (`key: "org-${orgId}", limit: 1`)
  - Serialized per org to prevent race conditions on transaction matching
- Payload includes: document_id, payment_id, net_amount_paid, payment_date

### Reconciliation Matching Logic

The engine searches bank transactions to find matches for confirmed documents. Matching uses the net amount (after WHT deduction) since that is what appears in the bank statement.

**a) Exact match**
- `transaction.amount = payment.net_amount_paid`
- AND `transaction.date` within +/- 7 days of `payment.payment_date`
- Highest confidence (1.0)

**b) Fuzzy match**
- `transaction.amount` within +/- 1% of `payment.net_amount_paid`
- AND `transaction.date` within +/- 14 days of `payment.payment_date`
- Confidence based on amount proximity and date distance

**c) Split match**
- Sum of 2-3 bank transactions = `payment.net_amount_paid`
- All transactions within +/- 14 days of payment date
- Creates multiple `reconciliation_matches` rows (one per transaction), each with `matched_amount` = that transaction's contribution

### reconciliation_matches Junction Table (M:N)

- Links transactions to documents via payments
- Fields: transaction_id, document_id, payment_id, matched_amount, match_type, confidence, matched_by, matched_at
- UNIQUE constraint on `(transaction_id, document_id)` prevents duplicate matches
- `matched_amount` (NUMERIC 14,2) enables split and combined payment tracking
- `match_type`: exact, fuzzy, manual, ai_suggested
- `matched_by`: auto, manual

### Combined Payments

One bank transaction pays multiple documents (e.g., monthly batch payment to one vendor):

- One bank transaction maps to multiple payment rows via multiple `reconciliation_matches` records
- Each match has `matched_amount` = that document's share of the transaction
- Sum of all `matched_amount` for a transaction must equal the transaction amount
- Split allocation UI allows user to specify how a single transaction divides across documents

### amount_paid / balance_due (Computed, Not Denormalized)

- `documents.amount_paid` and `documents.balance_due` are NOT stored columns
- Always derived at query time: `amount_paid = SUM(payments.net_amount_paid)` for that document
- `balance_due = documents.total_amount - SUM(payments.net_amount_paid)`
- Implemented as a Drizzle subquery or SQL view, not a trigger or denormalized field
- Document status transitions (draft -> confirmed -> paid) derived from balance_due:
  - balance_due > 0 AND has payments: 'partially_paid'
  - balance_due = 0: 'paid'

### Manual Reconciliation UI

- Unmatched transactions list: bank transactions with no reconciliation match
- Unmatched documents list: confirmed documents with no matched transaction
- Select-to-link: user selects a transaction and a document to manually create a match
- Split allocation UI:
  - For combined payments: user selects one transaction + multiple documents, allocates amounts
  - For split payments: user selects one document + multiple transactions
  - Running total shows remaining unallocated amount
- Manual matches stored with `match_type = 'manual'`, `matched_by = 'manual'`

### Petty Cash Marking

- `is_petty_cash` boolean flag on transactions
- Configurable threshold per org (stored in org settings, e.g., 2,000 THB)
- Transactions below threshold can be bulk-marked as petty cash
- Petty cash transactions excluded from reconciliation matching
- Petty cash summary view: total by period

### Reconciliation Dashboard

- **% matched**: count of matched transactions / total transactions per period
- **Gap analysis**: total unmatched amount (both transaction-side and document-side)
- **Unmatched alerts**: highlight periods with low match rates or large unmatched amounts
- **Period selector**: filter dashboard by month/quarter/year
- **Summary cards**: total transactions, total matched, total unmatched, total petty cash

### Audit Log Middleware

- Enable audit_log middleware in this phase (deferred from Phase 1 because workflows are now stable)
- All mutations to documents, payments, reconciliation_matches, wht_certificates logged to `audit_log`
- Captures: entity_type, entity_id, action (create/update/delete), old_value, new_value, actor_id, timestamp
- Immutable: audit_log rows never updated or deleted

## Tests

### Exact Match Tests (integration, Docker Postgres)

- Invoice 10,700 THB with 3% WHT (321 THB) -> net 10,379 THB: match to bank transaction of 10,379 THB within 3 days
- Invoice with zero WHT: match on full total_amount
- Match updates transaction.reconciliation_status to 'matched'

### Fuzzy Match Tests

- Transaction 10,375 THB vs expected 10,379 THB (within 1%): matched with lower confidence
- Transaction 10,000 THB vs expected 10,379 THB (outside 1%): NOT matched
- Transaction within amount tolerance but outside 14-day window: NOT matched

### Split Payment Tests

- One invoice 50,000 THB -> two bank transactions (30,000 + 20,000): matched
- Three transactions summing to invoice amount: matched
- Four transactions: NOT matched (max 3 for split)
- Partial sum (2 of 3 transactions found): left unmatched, no partial match stored

### Combined Payment Tests

- One bank transaction 30,000 THB -> three invoices (10,000 + 12,000 + 8,000): three reconciliation_matches rows
- Sum of matched_amounts = transaction amount (30,000)
- Each document's payment correctly linked

### Concurrency Tests

- Two documents confirmed simultaneously for same org: reconciliation runs serialized (concurrency 1)
- Two documents from different orgs: reconciliation runs in parallel
- Same transaction matched by concurrent reconciliation runs: UNIQUE constraint prevents duplicate match

### Petty Cash Tests

- Transaction below threshold marked as petty cash
- Petty cash transaction excluded from reconciliation matching
- Bulk mark: 10 transactions below threshold, all marked in one operation

### Payment Computation Tests

- Document with one payment: amount_paid = net_amount_paid, balance_due = total - net_amount_paid
- Document with two payments (partial): amount_paid = sum of both, balance_due = remainder
- Document with no payments: amount_paid = 0, balance_due = total_amount
- Document fully paid: balance_due = 0, status derived as 'paid'

### Re-reconciliation Tests

- Document updated after confirmation (e.g., amount corrected): old match removed, new reconciliation triggered
- Transaction previously matched then unmatched (manual): transaction.reconciliation_status reverts to 'unmatched'

### Audit Log Tests

- Document confirmation creates audit log entry
- Payment creation creates audit log entry
- Reconciliation match creates audit log entry
- Audit log entries are immutable (no UPDATE/DELETE permitted)

### E2E Tests (Playwright)

- Confirm document in review UI, see WHT certificate draft created
- Navigate to reconciliation dashboard, see match count
- Manually link unmatched transaction to document
- Split allocation: allocate one transaction across two documents
- Mark transaction as petty cash

## Checkpoint

Phase 4 is complete when:

1. Confirming a document creates a WHT certificate draft (with sequence number) and a payment record
2. Reconciliation triggers automatically after confirmation and finds exact matches
3. Fuzzy matching works within 1% amount and 14-day window
4. Split payments (1 document -> 2-3 transactions) are detected and matched
5. Combined payments (1 transaction -> N documents) work via split allocation UI
6. amount_paid and balance_due are correctly computed from payments table (not denormalized)
7. Manual reconciliation UI allows select-to-link and split allocation
8. Petty cash marking excludes transactions from matching
9. Reconciliation dashboard shows % matched and gap analysis
10. Audit log middleware captures all mutations
11. Concurrency limit 1 per org prevents race conditions
12. All matching, payment, and audit integration tests pass
