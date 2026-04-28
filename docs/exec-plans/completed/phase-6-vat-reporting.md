# Phase 6: VAT & Reporting

**Status:** Complete (shipped 2026-03-18)
**Dependencies:** Phase 5 (WHT certificates, filing calendar, period locking), Phase 3 (documents with VAT amounts, vendor entity_type/country)
**Blocked by:** V7 (FlowAccount import format researched from Phase 0 validation), V8 (Peak Accounts import format researched from Phase 0 validation)

## Goal

Track input and output VAT, prepare PP 30 and PP 36 filings (separately!), generate VAT register reports, handle credit note adjustments, and export data to FlowAccount and Peak Accounts. This is the final compliance layer -- after this phase, the platform covers the full WHT + VAT filing cycle.

**Critical rule:** `net_vat_payable = output_vat - input_vat_pp30`. PP 36 reverse charge is a SEPARATE obligation with a SEPARATE deadline. PP 36 never offsets PP 30.

## Deliverables

### Input VAT Tracking

- Automatically computed from confirmed purchase invoices (direction = 'expense') that have VAT amounts
- Only invoices from VAT-registered vendors with proper tax invoices qualify for input VAT credit
- Each document's `vat_amount` contributes to `vat_records.input_vat_pp30` for the appropriate period
- Period determined by `documents.vat_period_year` and `vat_period_month` (set during document review)

### Output VAT Tracking

- Automatically computed from confirmed sales invoices (direction = 'income') that have VAT amounts
- Each document's `vat_amount` contributes to `vat_records.output_vat` for the appropriate period
- Period determined by `documents.vat_period_year` and `vat_period_month`

### Net VAT Calculation

- Formula: `net_vat_payable = output_vat - input_vat_pp30`
- **PP 36 reverse charge is EXCLUDED from this calculation** -- it is a separate obligation
- Positive result = VAT payable to Revenue Department
- Negative result = VAT credit carried forward (or refund request)
- Stored in `vat_records.net_vat_payable`

### PP 30 Worksheet

- Monthly PP 30 preparation view with per-invoice detail:
  - Each contributing invoice listed: document number, vendor/customer name, tax ID, date, base amount, VAT amount
  - Subtotals for output VAT and input VAT (PP 30 only)
  - Net VAT payable
- Filing status tracking: draft / filed / paid
- Deadline from `tax_config`: `pp30_deadline_day` (23rd with e-filing extension)
- "Mark as filed" action triggers period lock (same mechanism as Phase 5 WHT filing)

### PP 36 Reverse Charge Tracking

- **Trigger conditions:** foreign vendor (`vendors.entity_type = 'foreign'` or `vendors.country != 'TH'`) + service purchase
- Rate: 7% self-assessed on the foreign invoice amount (uses `vat_rate` from `tax_config`)
- PP 36 is NOT reclaimable -- it is a pure cost, never offsets input VAT on PP 30
- Stored in `vat_records.pp36_reverse_charge` (separate from `input_vat_pp30`)
- Separate filing status: `vat_records.pp36_status` (draft / filed / paid)
- Separate deadline: `pp36_deadline_day` from `tax_config` (15th of following month -- different from PP 30's 23rd)
- PP 36 prep view: lists triggering documents, foreign vendor details, self-assessed amounts
- "Mark as filed" independent from PP 30 filing status

### Nil Filing Tracking

- PP 30 must be filed every month, even with zero VAT activity
- Calendar shows every month from the organization's first active month (based on earliest document or first `vat_records` row)
- `vat_records.nil_filing_required` flag set for months with zero output VAT and zero input VAT
- Nil months still appear in the filing calendar and require explicit "mark as filed"
- Visual indicator distinguishing nil filings from active filings

### VAT Register Report

- Monthly report with document-level detail (required by Revenue Department for audits)
- **Input VAT register:** lists each purchase invoice -- date, document number, vendor name, vendor tax ID, base amount, VAT amount
- **Output VAT register:** lists each sales invoice -- date, document number, customer name, customer tax ID, base amount, VAT amount
- Sorted by date within each register
- Monthly totals matching `vat_records` amounts
- Exportable as PDF and CSV

### Credit Note Handling

- Credit notes linked to parent invoice via `documents.related_document_id` FK
- Credit note's VAT amount reduces the parent invoice's VAT contribution to the period
- Adjustment reflected in VAT register (credit note appears as a negative entry)
- Credit note must reference the same VAT period as the parent invoice (or the period the credit note is issued, per Thai tax rules -- user selects)
- Net effect: if parent invoice contributed 700 THB output VAT and credit note has 100 THB VAT, net contribution = 600 THB

### Expense / Income Summary View

- Document-based summary (not journal-entry-based -- this is not a double-entry system)
- Grouped by: month, vendor, payment type
- Shows: document count, total amounts (pre-VAT), total VAT, total WHT withheld, net paid
- Filterable by date range, vendor, document type
- Drill-down to individual documents

### FlowAccount Export

- Export expense and sales data in FlowAccount-compatible spreadsheet format
- Format determined by V7 research (create trial FlowAccount account, map fields)
- Maps platform fields to FlowAccount columns (document number, date, vendor, amounts, VAT, WHT)
- Download as Excel/CSV from reports page

### Peak Accounts Export

- Export in Peak Accounts-compatible format
- Format determined by V8 research (create trial Peak account, map fields)
- Same data as FlowAccount export, different column layout
- Download as Excel/CSV from reports page

### Full Data Export

- JSON and CSV backup of all organization data
- Includes: documents, line items, vendors, transactions, certificates, filings, VAT records
- Org-scoped (only exports data for the selected organization)
- Suitable for data portability and disaster recovery
- Download as ZIP archive containing one file per table

### Dashboard

- Key metrics: total expenses (period), total income (period), net VAT position, outstanding WHT filings
- Period summary: current month and previous month comparison
- Filing status overview: which PND and PP filings are due, filed, or overdue
- Deadline warnings: upcoming deadlines within 7 days, overdue items highlighted
- Quick links to filing prep views

## Tests

### PP 36 Identification (Vitest)

- Foreign vendor + service purchase = triggers PP 36 (7% reverse charge)
- Foreign vendor + goods purchase = no PP 36 (goods imported through customs, not self-assessed)
- Domestic vendor (any type) = never triggers PP 36
- PP 36 amount = foreign invoice amount x VAT rate from tax_config

### Net VAT Excludes PP 36 (integration -- critical compliance test)

- Month with: 10,000 output VAT, 3,000 input VAT (PP 30), 2,000 PP 36 reverse charge
- `net_vat_payable` must equal 7,000 (10,000 - 3,000), NOT 5,000
- PP 36 amount tracked separately and does not reduce net_vat_payable
- This is a regression test -- this rule must never be violated

### Nil Filing Tests (integration)

- Month with zero documents: nil_filing_required = true, still appears in calendar
- Month with documents but zero VAT (e.g., all non-VAT purchases): nil_filing_required = true for VAT
- Mark nil filing as filed: status updates correctly
- Gap month detection: if org has activity in Jan and Mar, Feb still shows as nil filing required

### Credit Note Tests (integration)

- Credit note with related_document_id pointing to parent invoice
- Parent invoice output VAT = 700, credit note VAT = 100, net output VAT for period = 600
- Credit note appears as negative entry in VAT register
- Credit note without related_document_id raises validation error
- Multiple credit notes against same parent: cumulative reduction

### VAT Register Tests (integration)

- Register contains per-invoice detail (document number, vendor tax ID, amounts) -- not just aggregates
- Input and output registers are separate sections
- Monthly totals match `vat_records` computed amounts
- Credit notes appear with negative amounts
- Documents from different periods do not cross-contaminate

### Export Format Tests (Vitest)

- FlowAccount CSV output validated against template fixture (from V7 research)
- Peak Accounts CSV output validated against template fixture (from V8 research)
- All required columns present in correct order
- Date formats match target system expectations
- Amount formatting (decimal places, thousands separator) matches target system

### Period Boundary Tests (integration)

- Invoice dated March 31: VAT period = March (not April)
- Invoice dated March 31 with vat_period_month manually set to April: respects manual override
- Document straddling midnight (TIMESTAMPTZ vs DATE): uses `issue_date` DATE field, not created_at

### Full Data Export Tests (integration)

- Export produces valid JSON (parseable)
- Export produces valid CSV (correct headers, escaped values)
- Export includes data from all relevant tables
- Export is scoped to selected org (no data leakage from other orgs)
- Large dataset export (1000+ documents) completes within reasonable time

## Checkpoint

Phase 6 is complete when:

1. Input and output VAT correctly computed from confirmed documents
2. PP 30 worksheet shows per-invoice detail with correct net_vat_payable (excluding PP 36)
3. PP 36 reverse charge correctly identified for foreign vendor + service purchases
4. PP 36 has separate filing status and deadline (15th) from PP 30 (23rd)
5. Nil filing tracking shows every month from org's first active month
6. VAT register report contains document-level detail suitable for RD audit
7. Credit notes correctly adjust parent invoice VAT via related_document_id
8. FlowAccount and Peak Accounts exports match researched format specifications
9. Full data export (JSON/CSV) works for all org data
10. Dashboard shows key metrics, filing status, and deadline warnings
11. All tests pass

## Prerequisites Detail

| ID | Prerequisite | Source | Why it blocks |
|----|-------------|--------|---------------|
| V7 | FlowAccount import format | Phase 0 validation | Cannot build FlowAccount export without knowing the exact column layout and format |
| V8 | Peak Accounts import format | Phase 0 validation | Cannot build Peak export without knowing the exact column layout and format |
| V10 | VAT rate stays 7% | Confirmed thru Sep 2026 | Rate is configurable in `tax_config` -- no code change needed if rate changes |
