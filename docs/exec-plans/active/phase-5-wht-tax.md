# Phase 5: WHT & Tax Calculations + Certificates

**Status:** Not started
**Dependencies:** Phase 4 (reconciliation, payments table populated), Phase 3 (documents, vendor registry, AI extraction pipeline)
**Blocked by:** V6 (RD e-Filing CSV format researched from Phase 0 validation), V4 (React-PDF Thai font rendering validated from Phase 0 validation)

## Goal

Generate 50 Tawi WHT certificates, prepare monthly PND filings (PND 3, PND 53, PND 54 -- NO PND 1), export RD e-Filing CSVs, and produce annual summaries. This phase turns confirmed documents and payments into tax-ready outputs.

**Out of scope:** PND 1 is payroll withholding -- explicitly excluded from V1. DTA treaty rates default to statutory; DTA is V2.

## Deliverables

### WHT Type Picker (Review UI Extension)

- Dropdown added to the document review UI (Phase 3 review page)
- Shows: payment type, entity type, applicable WHT rate, RD Section 40 code
- Rate preview updates dynamically based on vendor entity_type and payment classification
- WHT rate lookup reads from `wht_rates` table (not hardcoded)
- AI-suggested WHT type pre-filled from Phase 3 extraction, user confirms or overrides

### 50 Tawi Certificate Generation

- React-PDF (`@react-pdf/renderer`) with Sarabun Thai font (Regular + Bold weights)
- A4 layout matching official 50 Tawi form zones
- Content requirements:
  - Payer details: company name (Thai + English), tax ID, branch number, address
  - Payee details: vendor name (Thai + English), tax ID, branch number, address
  - Payment details: date, type, base amount, WHT rate, WHT amount
  - All dates rendered in Buddhist Era (Gregorian + 543) using `toBuddhistYear()` utility from Phase 1a
  - Checkbox for form type (PND 3 / PND 53 / PND 54)
  - Checkbox for payment type (RD Section 40 categories)
  - Certificate number displayed in B.E. format (internal storage uses Gregorian)
- PDF stored in blob storage, URL saved to `wht_certificates.pdf_url`

### Certificate Sequence Numbers

- Internal format: `{form_type}/{gregorian_year}/{seq}` (e.g., `pnd3/2026/42`)
- Display format converts year to B.E. (e.g., `pnd3/2569/42`)
- **MVP implementation:** MAX+1 query with `UNIQUE(org_id, certificate_no)` constraint
  - Query: `SELECT COALESCE(MAX(seq), 0) + 1` scoped by org_id, form_type, year
  - UNIQUE constraint provides safety net against duplicates
  - If concurrent issuance becomes a real problem, harden to counter row (`wht_sequence_counters`) with advisory lock
- Year rollover: when Gregorian year changes (Dec to Jan), sequence resets to 1
- Sequence numbers never reused -- voided certificates retain their number

### Void and Replacement Workflow

- Void action: sets `status = 'voided'`, records `voided_at` and `void_reason`
- Voided certificate retains its certificate_no (never deleted, never reused)
- Replacement: issues new certificate with next sequence number
- `replacement_cert_id` FK links voided cert to its replacement
- Audit log entry for every void and replacement

### WHT Certificate Items

- `wht_certificate_items` table links each certificate to source document line items
- Each item records: `base_amount`, `wht_rate`, `wht_amount`, `rd_payment_type_code`, `wht_type`
- FKs to `documents` and `document_line_items` for full traceability
- Certificate totals computed from sum of items (not stored independently of items)

### Monthly WHT Aggregation

- Aggregate certificates by form type per month into `wht_monthly_filings`
- Form types: PND 3 (individual vendors), PND 53 (corporate vendors), PND 54 (foreign remittance)
- **No PND 1** -- payroll is out of scope
- Computed fields: `total_base_amount`, `total_wht_amount` from linked certificates
- Filing status tracking: draft, filed, paid

### PND Filing Prep View

- Grouped by form type (PND 3 / PND 53 / PND 54)
- Per-payee-per-type detail within each form type
- Shows: vendor name, tax ID, total base amount, WHT rate(s), total WHT withheld
- Filing totals with certificate count
- Status indicator (draft / ready to file / filed)
- One-click "mark as filed" action (triggers period lock)

### Period Locking

- When a monthly filing's status is set to `filed`, `period_locked` becomes true
- Locked periods prevent:
  - Editing documents whose `issue_date` falls within that period
  - Issuing new certificates dated within that period
  - Modifying existing certificates linked to that filing
- To edit a locked-period document, user must go through amendment workflow:
  - Void the filing (sets status back to draft, unlocks period)
  - Make corrections
  - Re-file
- Locking enforced at the application level (server actions / API routes check `period_locked` before writes)

### RD e-Filing CSV Export

- Format must match the researched RD specification (V6 prerequisite -- cannot build without verified format)
- Encoding: TIS-620 or UTF-8 with BOM (per RD requirements, determined during V6 research)
- Year fields use Buddhist Era (Gregorian + 543)
- One CSV per PND form type per month
- Includes: payer info, payee info per row, payment type code, amounts, WHT amounts
- Download action from the filing prep view

### Filing Calendar and Deadline Alerts

- Calendar view showing all WHT filing deadlines
- Deadlines computed from `tax_config`:
  - WHT (PND 3/53/54): 15th of following month
  - With e-filing extension: 15th + `efiling_extension_days` from `tax_config`
- Overdue detection: filings past deadline with status != filed/paid
- Dashboard alert for upcoming deadlines (7-day and 3-day warnings)

### Annual Summary Export

- **PND 3 Gor:** Annual summary of all PND 3 filings, aggregated per individual vendor across 12 months
- **PND 53 Gor:** Annual summary of all PND 53 filings, aggregated per corporate vendor across 12 months
- Export as PDF and/or CSV in RD format (B.E. year headers)
- Totals must match sum of 12 monthly filings exactly

### e-WHT Reduced Rate Support

- Reduced e-WHT rates gated on `payments.is_ewht = true`
- Additional gate: vendor `entity_type = 'company'` (e-WHT only applies to corporate payees)
- Rate lookup: if `is_ewht` is true AND within `ewht_valid_from`/`ewht_valid_to` date range in `wht_rates`, use `ewht_rate`; otherwise fall back to `standard_rate`
- **Warning:** e-WHT extension to 2026 is UNCONFIRMED (V9 in assumptions tracker). Verify with RD announcements before launch. If not extended, `ewht_valid_to` dates in seed data must reflect actual expiry.

## Tests

### WHT Rate Calculation (Vitest)

- All payment types x entity types: verify correct rate for each combination (domestic individual, domestic company, foreign)
- PND 54 dividends = 10% not 15% (regression test -- this was a round 1 review finding)
- Edge case: payment type with no WHT (e.g., goods purchase from company) returns 0% rate

### 50 Tawi PDF Validation (Vitest)

- Generated PDF contains correct Thai text (payer name, payee name in Thai)
- Dates display in Buddhist Era (e.g., 2026 renders as 2569)
- Branch numbers present for both payer and payee
- All required form fields populated (payment type checkboxes, amounts, certificate number)
- Certificate number in B.E. display format

### Sequence Number Tests (integration, Docker Postgres)

- 100 sequential allocations: all unique, monotonically increasing
- Year rollover: last cert in Dec gets seq N, first cert in Jan gets seq 1
- UNIQUE constraint prevents duplicate certificate_no for same org
- Different orgs can have same sequence numbers independently
- Different form types have independent sequences

### Void and Replacement Tests (integration)

- Void: original certificate retains its number, status = 'voided', voided_at set
- Replacement: new certificate gets next available sequence number
- `replacement_cert_id` FK correctly links voided to replacement
- Cannot void an already-voided certificate (idempotent / error)
- Voided certificates excluded from monthly aggregation totals

### Monthly Aggregation Tests (integration)

- Sum of individual certificate amounts matches filing totals
- Certificates from different form types do not cross-aggregate
- Voided certificates excluded from totals
- Adding a new certificate to a draft filing updates totals

### CSV Export Tests (Vitest)

- Generated CSV validated against RD template fixture (from V6 research)
- B.E. years in date fields (not Gregorian)
- Correct encoding (TIS-620 or UTF-8 BOM per spec)
- All required columns present in correct order
- Amounts formatted correctly (no floating point artifacts)

### Period Locking Tests (integration)

- Filing marked as 'filed' sets period_locked = true
- Attempt to edit document in locked period returns error
- Attempt to issue new certificate in locked period returns error
- Unlocking (void filing) allows edits again

### Annual Summary Tests (integration)

- PND 3 Gor: 12-month aggregate per vendor matches sum of monthly PND 3 filings for that vendor
- PND 53 Gor: same validation for corporate vendors
- Vendor appearing in multiple months correctly aggregated
- Voided certificates excluded from annual totals

### e-WHT Rate Tests (Vitest + integration)

- e-WHT rate applied only when: `is_ewht = true` AND `entity_type = 'company'` AND current date within `ewht_valid_from`/`ewht_valid_to`
- `is_ewht = true` but `entity_type = 'individual'` uses standard rate
- `is_ewht = true` but outside valid date range uses standard rate
- `is_ewht = false` always uses standard rate regardless of entity type

## Checkpoint

Phase 5 is complete when:

1. WHT type picker in review UI shows correct rates from `wht_rates` table
2. 50 Tawi PDF generates with correct Thai text, B.E. dates, branch numbers, and all required fields
3. Certificate sequence numbers are unique per org/form/year with automatic year rollover
4. Void and replacement workflow preserves voided certificate numbers
5. Monthly PND filing prep view shows per-payee detail grouped by form type (PND 3/53/54 only)
6. Period locking prevents edits to documents and certificates in filed months
7. RD e-Filing CSV export matches the researched format specification
8. Filing calendar shows correct deadlines with e-filing extension from tax_config
9. PND 3 Gor and PND 53 Gor annual summaries match sum of 12 monthly filings
10. e-WHT reduced rates apply only when all conditions are met (is_ewht + company + valid dates)
11. All tests pass

## Prerequisites Detail

| ID | Prerequisite | Source | Why it blocks |
|----|-------------|--------|---------------|
| V4 | React-PDF Thai font rendering | Phase 0 validation | Cannot generate 50 Tawi certificates without confirmed Thai text rendering |
| V6 | RD e-Filing CSV format | Phase 0 validation | Cannot build CSV export without the exact field order, encoding, and format spec |
| V9 | e-WHT rate extension to 2026 | Unconfirmed | Affects seed data for `wht_rates.ewht_valid_to`; does not block build but must be verified before launch |
