# Plan: Phase 12a — CIT Engine (PND.51 + PND.50) + Book-Tax Adjustments

**Status:** Draft v2 — captured 2026-04-26, split from original Phase 12 after round-3 review
**Depends on:** Phase 10.5 (GL primitives) shipped; Phase 10.6 (inventory + COGS) shipped; Phase 13 (fixed assets + depreciation) HARD prerequisite (manual depreciation in PND.50 is a footgun)
**Authority reference:** `vat-info.md` §4 (annual filings + CIT rates), §8.3 (CIT penalties); Thai Revenue Code Title 2 (CIT); Thai Revenue Code §65 ter (non-deductible expenses); §65 bis (depreciation methods/rates)

**Note on split:** Original Phase 12 covered CIT engine + TFRS NPAEs financial statements + DBD package + audit firm package. Round-3 review found this is two distinct concerns. **Phase 12a (this plan) is the CIT engine only.** Phase 12b (`phase-12b-tfrs-dbd-audit-pack.md`) covers TFRS NPAEs financial statements, DBD e-Filing package, and audit firm exchange package. Phase 12b is blocked on the DBD/TFRS research spike (`dbd-tfrs-research-spike.md`).

## Problem

Every juristic person operating in Thailand must:
1. File **PND.51** (semi-annual CIT prepayment) within 2 months of half-year end (8-day e-filing extension).
2. File **PND.50** (annual CIT return) within 150 days of fiscal year-end (158 days e-file).
3. File **audited financial statements with DBD** within 1 month of AGM; AGM within 4 months of fiscal year-end.
4. (For revenue > THB 200M) File transfer pricing disclosure form with PND.50.

Today's platform produces no CIT working papers, no GL trial balance (until Phase 10.5), no DBD format financial statements, and no transfer pricing form. Any tenant operating today must use external tools for these annual obligations — defeats the platform's premise.

## Goals

1. **PND.51 prep** — semi-annual CIT estimate from H1 books; warn if estimate < 25% below pace for full-year actual (§8.3 20% penalty risk).
2. **PND.50 prep** — full annual CIT calc from GL trial balance + book-tax differences (depreciation method differences, non-deductible expenses, WHT credits used).
3. **Transfer pricing disclosure form** — for tenants > THB 200M revenue; flag-only otherwise.
4. **Year-end CIT accrual JE** — book the income tax expense + payable so retained earnings close (Phase 10.5) reflects after-tax profit.
5. **Loss carry-forward bookkeeping** — track 5-year carry-forward, oldest-first consumption.
6. **WHT credits used** — consume `wht_credits_received` against CIT payable.

## Non-goals (deferred / external — owned by Phase 12b unless noted)

- **TFRS NPAEs financial statements** — Phase 12b.
- **DBD e-Filing package** — Phase 12b.
- **Audit firm exchange package** — Phase 12b.
- **Audit itself** — performed by Thai-licensed CPA firm.
- **Multi-entity consolidation** — v1 single-entity per org.
- **CIT estimated tax planning advisory** — math is automated; planning advice is human.

## Requirements

### CIT calculation engine

#### Schema

- [ ] New table `cit_filings`:
  - `id uuid PK`
  - `org_id uuid NOT NULL`
  - `tax_year integer NOT NULL` — Thai fiscal year (organization-defined start/end)
  - `filing_type text NOT NULL` — `pnd51` (semi-annual) or `pnd50` (annual)
  - `period_start date NOT NULL`
  - `period_end date NOT NULL`
  - `filing_status text NOT NULL` — `draft`, `submitted`, `accepted`
  - `submitted_at, accepted_at timestamptz`
  - `revenue_total numeric(14,2)`
  - `cogs_total numeric(14,2)`
  - `expense_total numeric(14,2)`
  - `accounting_profit numeric(14,2)` — from P&L
  - `book_tax_adjustments_payload jsonb` — list of adjustments with description, amount, GL account ref
  - `taxable_income numeric(14,2)`
  - `cit_rate numeric(5,4)` — applied rate (sme tiered or 20% standard or BOI privileged)
  - `cit_calculated numeric(14,2)`
  - `wht_credits_used numeric(14,2)` — from `wht_credits_received` for the year
  - `prepayment_credits_used numeric(14,2)` — PND.51 prepayment credit on PND.50
  - `pnd51_method text` — `projected_full_year` | `actual_h1_books` (round-6: user picks per year; both methods supported. NULL when filing_type != PND.51)
  - `pnd51_projected_full_year_profit numeric(14,2)` — input when method = projected_full_year
  - `pnd51_h1_actual_profit numeric(14,2)` — derived when method = actual_h1_books
  - `cit_payable numeric(14,2)`
  - `paid_at timestamptz`
  - `bank_transaction_id uuid`
  - `is_amendment boolean DEFAULT false`
  - `amends_filing_id uuid`
  - `rd_reference_number text`
  - `confirmation_document_id uuid`
  - `working_paper_document_id uuid` — generated working paper PDF
  - `created_at, updated_at`
  - Unique on `(org_id, tax_year, filing_type, is_amendment, amends_filing_id)`

- [ ] New table `book_tax_adjustments` (catalog of common Thai book-tax differences):
  - `id`, `org_id`, `tax_year`, `description`, `gl_account_id`, `amount`, `direction` (`add_back` or `deduct`), `category` (`non_deductible_expense`, `depreciation_method_difference`, `boi_exempt_revenue`, `entertainment_50pct_disallowance`, `over_300m_director_meeting_disallowance`, `donation_2pct_limit`, etc.), `notes`, `audit_log_ref`

- [ ] New table `cit_brackets` (configurable, mirrors `pit_brackets` pattern):
  - `id`, `effective_from`, `effective_to`, `entity_type` (`sme_qualifying`, `standard`), `lower_bound`, `upper_bound`, `marginal_rate`
  - Seed with current SME tiered rates (0% / 15% / 20%) and standard 20% per `vat-info.md` §4.

#### Calculation logic

- [ ] `src/lib/cit/cit-calculator.ts`:
  - `computePnd50({ orgId, taxYear })`:
    1. Load TB at `fiscal_year_end` from Phase 10.5 trial balance.
    2. Compute accounting profit = sum(4xxx revenue) − sum(5xxx COGS) − sum(6xxx expense).
    3. Apply book-tax adjustments from `book_tax_adjustments` for the year.
    4. Determine entity type: SME-qualifying (paid-up capital ≤ 5M AND revenue ≤ 30M for the year) vs standard.
    5. Apply tiered rates from `cit_brackets`.
    6. Subtract `wht_credits_received` (from Phase 9 hardening) for the year.
    7. Subtract PND.51 prepayment.
    8. Result: CIT payable / refund.
  - `computePnd51({ orgId, taxYear, method })` — round-6 user direction: support BOTH methods, user picks per filing year. Number handling identical; only the input source for the H1 estimate differs.
    - `method = 'projected_full_year'` (default for first-time filers): user enters projected full-year net taxable profit; system computes annual CIT, half = PND.51. Surface "you are projecting ฿X full-year, that's ฿Y CIT, ฿Y/2 = ฿Z prepayment". Allow override of the projection.
    - `method = 'actual_h1_books'`: load TB at H1 end (Jun 30 for calendar-year). Compute H1 net taxable profit (revenue − COGS − expenses, with H1-applicable book-tax adjustments). Annualize H1 (× 2) → forecasted full-year. Compute annual CIT, half = PND.51 prepayment.
    - Warn (both methods) if `H1 actual or projected basis` × 2 < 75% of likely full-year actual (§8.3 estimation-shortfall 20% penalty kicks in when prepayment + WHT credits + PND.50 actual show under-estimation by > 25%). Use prior-year actual and current trailing revenue/profit trend as sanity benchmarks.
    - If projected basis is below prior-year actual run-rate or current trailing trend, require explicit owner/accountant acknowledgment and store the rationale on `cit_filings.pnd51_estimate_rationale`.
    - Persist `cit_filings.pnd51_method` (`projected_full_year` | `actual_h1_books`) so audit trail records which path was used.

#### Common Thai book-tax adjustments (seed catalog)

Pre-built adjustment templates:
- Entertainment expenses — 50% non-deductible (§65 ter)
- Director meeting fees over THB 300/meeting — disallowed
- Donations to non-approved entities — disallowed
- Donations to approved entities — limited to 2% of net profit
- Depreciation method differences (book straight-line vs tax DDB)
- Provisions for losses without realized event — disallowed
- Goodwill amortization — disallowed (Thai CIT)
- BOI-exempt revenue — deducted
- Foreign tax credits — limited per DTA

UI presents the catalog; tenant marks which adjustments apply with amounts.

### TFRS NPAEs financial statements + DBD package + audit firm package

**Moved to Phase 12b.** See `phase-12b-tfrs-dbd-audit-pack.md`. Phase 12a (this plan) ships the
CIT engine + book-tax adjustments + transfer pricing disclosure form + the year-end CIT accrual
JE posted to GL. Phase 12b ships the financial statements, DBD package, and audit firm package
(blocked on the DBD/TFRS research spike per `dbd-tfrs-research-spike.md`).

### Year-end CIT accrual posting (replaces fragmented year-end-close logic)

The CIT engine produces the **CIT accrual JE** that must post BEFORE Phase 10.5 closes
the P&L to retained earnings. Round-3 review found the original sequence was wrong.

Corrected year-end sequence (cross-cutting; defined here, executed by Phase 10.5):

1. Phase 10.5 / 13 / 14: post all month-end/year-end accruals + adjustments (manual JEs),
   depreciation through year-end, FX revaluation through year-end.
2. **Phase 12a (this phase): compute CIT for the year + post CIT accrual JE:**
   ```
   Dr  6810 Income tax expense
       Cr  2170 Income tax payable
   ```
3. **Phase 12a: book any year-end adjusting JEs from book-tax differences review.**
4. Phase 10.5 close: revenue + COGS + expense (4xxx + 5xxx + 6xxx) → 3230 Net profit.
5. Phase 10.5 close: 3230 → 3220 Retained earnings.

Phase 10.5's `runYearEndClose(orgId, fiscalYear)` server action validates that this phase
has produced a `cit_filings` row with `filing_status >= 'draft'` for the year, AND that the
accrual JE has been posted, AND that any book-tax adjusting JEs are posted. Refuses to close
otherwise.

#### Outbox race fix (round-4 critical)

Round-4 review found a race: the GL posting outbox is async (cron-drained), so a user clicking
"Year-end close" immediately after CIT calc could land before the CIT accrual JE has been
posted by the consumer — close validation queries `journal_entries WHERE
source_entity_type='cit_filings'` and finds nothing → either blocks (if check is strict) or
proceeds wrongly (if check is loose). Either way, racy.

Fix: `runYearEndClose` orchestrates a **synchronous drain** of the outbox before reading,
under a per-org advisory lock:

```sql
-- In runYearEndClose transaction:
SELECT pg_advisory_xact_lock(hashtext('year_end_close:' || :org_id));

-- Drain any pending outbox rows for this org's fiscal year (deterministic order, retry-safe)
PERFORM drain_posting_outbox(:org_id, :fiscal_year_end_date);

-- After drain: every pending posting for the year has either succeeded (JE present)
-- or moved to exception_queue. Now safe to validate.
PERFORM validate_year_end_preconditions(:org_id, :fiscal_year);
```

`drain_posting_outbox(orgId, throughDate)`:
- Selects all `posting_outbox` rows where `org_id = :orgId` AND `pending` AND
  the source event period falls in or before the fiscal year being closed.
- Runs each through the consumer synchronously (same code path as the cron consumer).
- If any row enters `failed` state after 3 retries → `runYearEndClose` aborts with the
  `exception_queue` IDs surfaced to the user.
- The advisory lock prevents the cron consumer + the year-end action from both posting the
  same row.

CIT accrual specifically: the CIT calculation server action posts to `posting_outbox` like
any other source. `runYearEndClose` always invokes `drain_posting_outbox` before its
`cit_filings` validation step, so the accrual JE is guaranteed to exist (or to have failed
and surfaced) by the time validation runs.

### Loss carry-forward (added per round-3; round-4 simplified; round-5 layered)

Thai CIT allows 5-year loss carry-forward only. **No carry-back** (round-4 fix). Round-5 fix: explicit per-year loss layers tracked via dedicated table — without per-layer remaining-balance tracking, oldest-first consumption ordering is ambiguous in code.

- [ ] `cit_filings` schema additions:
  - `taxable_loss numeric(14,2)` — when negative taxable income for this year (creates a new loss layer).
  - `losses_consumed_this_year numeric(14,2)` — total loss layers consumed against this year's profit.
- [ ] **New table `loss_carry_forward_layers`:**
  - `id uuid PK`
  - `org_id uuid NOT NULL`
  - `originated_tax_year integer NOT NULL` — the year the loss was created.
  - `expiry_tax_year integer NOT NULL` — `originated_tax_year + 5`.
  - `original_amount numeric(14,2) NOT NULL` — full loss when layer was created.
  - `remaining_amount numeric(14,2) NOT NULL` — current unconsumed balance.
  - `is_expired boolean GENERATED ALWAYS AS (current_tax_year > expiry_tax_year OR remaining_amount <= 0) STORED` — query-time derived (Postgres GENERATED with reference year via app config, OR computed in app layer).
  - Unique on `(org_id, originated_tax_year)` — one layer per origin year per org.
- [ ] CIT calculator consumption: SELECT `loss_carry_forward_layers WHERE org_id = ? AND remaining_amount > 0 AND originated_tax_year >= current_year - 4 ORDER BY originated_tax_year ASC` (oldest first). For each layer, consume `min(layer.remaining_amount, this_year_taxable_income_remaining)`. Update `remaining_amount` per layer.
- [ ] Layer creation: when a year files PND.50 with `taxable_loss > 0`, INSERT new `loss_carry_forward_layers` row.
- [ ] Annual cron at year-end: layers where `originated_tax_year < current_year - 4` and `remaining_amount > 0` are marked expired in audit_log; remaining amount is forfeit.
- [ ] PND.50 disclosure: list each layer consumed, showing origin year + amount consumed + remaining. Auditor can verify consumption order is oldest-first.

### Transfer pricing disclosure (preserved here, not moved to 12b)

- [ ] Schema: `organizations.transfer_pricing_required` boolean — set to true when annual revenue > 200M.
- [ ] `src/lib/cit/transfer-pricing-disclosure.ts`:
  - Captures related-party transactions (purchases, sales, royalties, interest, services).
  - Surfaces at year-end if any transactions are flagged related-party.
  - Output: form per RD-published format, attached to PND.50.

### UI (Phase 12a scope)

- [ ] `src/app/(app)/year-end/page.tsx` — year-end close orchestrator (skeleton; Phase 12b extends).
  - Status checklist with per-step ownership.
- [ ] `src/app/(app)/year-end/cit/pnd51/[year]/page.tsx` — PND.51 prep.
- [ ] `src/app/(app)/year-end/cit/pnd50/[year]/page.tsx` — PND.50 prep + book-tax adjustment catalog.
- [ ] `src/app/(app)/year-end/cit/transfer-pricing/[year]/page.tsx` — TP disclosure (when org > 200M revenue).
- [ ] Phase 12b adds: `/year-end/financials`, `/year-end/dbd`, `/year-end/audit-package`.

## Approach

### Sequencing (3 weeks — was 4 before split)

**Week 1 — CIT engine + book-tax adjustments**
1. Schema migrations (cit_filings, cit_brackets, book_tax_adjustments).
2. Seed `cit_brackets` with current rates.
3. Seed common book-tax adjustment catalog.
4. PND.51 calculator + UI.
5. PND.50 calculator + UI.

**Week 2 — CIT accrual JE + loss carry-forward + transfer pricing**
1. CIT accrual JE posting via Phase 10.5 posting outbox.
2. Loss carry-forward calculation + utilization across years.
3. Transfer pricing disclosure form for >200M revenue tenants.

**Week 3 — Year-end orchestration + first dry-run**
1. Year-end ordering enforcement (CIT accrual posts before P&L close).
2. UI orchestrator skeleton (Phase 12b extends).
3. First org dry-run: Lumera CIT-only walkthrough.

### Dependencies

- **Phase 10.5 (GL primitives)** — must ship first; queries GL for accounting profit.
- **Phase 10.6 (inventory + COGS)** — must ship first; PND.50 gross profit needs COGS.
- **Phase 13 (fixed assets + depreciation)** — HARD prerequisite; manual depreciation in PND.50 is a footgun. Was "ideally" before round-3; now mandatory.
- **Phase 14 (analytics + AR/AP aging + FX revaluation)** — AR/AP aging schedules feed audit package (Phase 12b); FX revaluation feeds period-end TB.
- **Phase 9 hardening (`wht_credits_received`)** — feeds CIT credit calculation.
- **Phase 12b** runs after this; depends on DBD/TFRS research spike completing.

## Critical files

To be created:
- `src/lib/cit/cit-calculator.ts`
- `src/lib/cit/transfer-pricing-disclosure.ts`
- `src/lib/db/queries/cit-filings.ts`
- `src/lib/db/queries/cit-brackets.ts`
- `src/lib/db/queries/book-tax-adjustments.ts`
- `src/lib/db/queries/loss-carry-forward.ts`
- `src/app/(app)/year-end/cit/**` — CIT calc UI + draft PND.51 / PND.50

(Financial statements, DBD builder, audit-firm package, notes/equity/CF generators all live in Phase 12b.)

To be edited:
- `src/lib/db/schema.ts`
- `src/lib/tax/filing-calendar.ts` — PND.51, PND.50, DBD deadlines
- `CLAUDE.md` — Context Map

## Verification

- [ ] PND.51 estimate from H1 books matches manual calc within ±0.01 baht.
- [ ] PND.50 calc with BOI-exempt revenue: BOI revenue not taxed; non-BOI taxed normally.
- [ ] SME tier eligibility: revenue 25M, paid-up capital 4M → SME tiered rates apply; if paid-up capital 6M → standard 20%.
- [ ] WHT credits used: sum of `wht_credits_received` for tax year matches the credit applied on PND.50.
- [ ] Book-tax adjustment for entertainment expenses: 50% of `gl_account 6610` for year is added back.
- [ ] (TFRS BS / P&L / cash flow / DBD package / audit ZIP verification all moved to Phase 12b — this phase only verifies CIT calc + book-tax adjustments + accrual JE.)
- [ ] CIT accrual JE: posted before P&L close to retained earnings (year-end ordering).
- [ ] Loss carry-forward layered consumption: oldest-first; expired layers ignored; PND.50 disclosure shows per-layer detail.
- [ ] Transfer pricing: triggered for tenant with revenue > 200M; not triggered for smaller.

## Risks

- **DBD format may change.** Spec is updated periodically; format generator must be version-aware.
- **TFRS for NPAEs note generation is opinionated.** Auto-generated notes are a starting point; tenant + auditor revise. Surface "draft notes — review before submission" warning.
- **BOI accounting separation.** If a tenant has both BOI-promoted and non-promoted activities, two-column reporting is needed. Out of v1 scope; flag and defer.
- **Audit firm formats vary.** Some auditors prefer Excel exports of TB and GL detail. Provide both PDF and CSV/Excel.
- **CIT estimation risk.** PND.51 under-estimation by >25% triggers 20% penalty. Surface clearly during prep; require user explicit acknowledgement of estimation method.

## Open questions

- **Multi-entity consolidation.** Lumera may operate via multiple Thai juristic persons. Each files separately. v1 single-entity scope per org. Cross-entity consolidation is a separate phase.
- **Auditor-platform integration.** Some Thai audit firms have proprietary exchange formats (e.g. KPMG's audit-data-collector format). v1 produces a generic ZIP; firm-specific exchange is a customer-by-customer ask.
- **Foreign-tax-credit calc.** When the tenant pays CIT abroad on foreign branch income, FTC applies per DTA. Out of v1 scope; manual JE.
- **Loss carry-forward.** Thai CIT allows 5-year loss carry-forward. Schema must track losses by year for utilization tracking. Add to v1 scope.
- **Capital gains on share sales.** Special rules per §40(4)(g). Out of v1 scope unless tenant flagged.
