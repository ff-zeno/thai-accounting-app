# Plan: Phase 12a — CIT Engine (PND.51 + PND.50) + Book-Tax Adjustments

**Status:** Implementation-active — foundation shipped 2026-05-16; projected PND.51, actual-H1 PND.51 from GL, manual-profit and GL-derived PND.50 drafts with WHT-credit, paid-only PND.51 prepayment consumption, non-mutating loss carry-forward preview, filed PND.50 loss-layer mutation/disclosure, audited manual book-tax adjustment entry, audited submit/accept workflow, Claude-reviewed idempotent CIT accrual/payment JEs with posting-outbox producer/handler coverage, transfer-pricing threshold flag plus structured disclosure draft/submit record, year-end close readiness checks/posting, loss carry-forward layer entry, oldest-first consumption helper, audited expired-loss forfeiture control, fixed-asset depreciation and entertainment cap addback sync, owner-visible CIT working-paper v1 caveat, and route smoke landed. TP disclosure exact RD print/PDF layout remains
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

- [x] New table `cit_filings`:
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
  - Partial unique indexes enforce one active non-amendment filing per `(org_id, tax_year, filing_type)` and one amendment per amended filing reference.

- [x] New table `book_tax_adjustments` (catalog of common Thai book-tax differences):
  - `id`, `org_id`, `tax_year`, `description`, `gl_account_id`, `amount`, `direction` (`add_back` or `deduct`), `category` (`non_deductible_expense`, `depreciation_method_difference`, `boi_exempt_revenue`, `entertainment_50pct_disallowance`, `over_300m_director_meeting_disallowance`, `donation_2pct_limit`, etc.), `notes`, `audit_log_ref`

- [x] New table `cit_brackets` (configurable, mirrors `pit_brackets` pattern):
  - `id`, `effective_from`, `effective_to`, `entity_type` (`sme_qualifying`, `standard`), `lower_bound`, `upper_bound`, `marginal_rate`
  - Seed with current SME tiered rates (0% / 15% / 20%) and standard 20% per `vat-info.md` §4.

#### Calculation logic

- [x] `src/lib/cit/cit-calculator.ts` first-slice calculator:
  - `computePnd50({ orgId, taxYear })`:
    1. Load TB at `fiscal_year_end` from Phase 10.5 trial balance.
    2. Compute accounting profit = sum(4xxx revenue) − sum(5xxx COGS) − sum(6xxx expense).
    3. Apply book-tax adjustments from `book_tax_adjustments` for the year.
    4. Determine entity type: SME-qualifying (paid-up capital ≤ 5M AND revenue ≤ 30M for the year) vs standard.
    5. Apply tiered rates from `cit_brackets`.
    6. Subtract `wht_credits_received` (from Phase 9 hardening) for the year.
    7. Subtract PND.51 prepayment.
    8. Result: CIT payable / refund.
  - `buildProjectedPnd51Draft({ orgId, taxYear, projectedFullYearProfit })` first-slice draft route. Full `computePnd51({ orgId, taxYear, method })` remains open — round-6 user direction: support BOTH methods, user picks per filing year. Number handling identical; only the input source for the H1 estimate differs.
    - `method = 'projected_full_year'` (default for first-time filers): user enters projected full-year net taxable profit; system computes annual CIT, half = PND.51. Surface "you are projecting ฿X full-year, that's ฿Y CIT, ฿Y/2 = ฿Z prepayment". Allow override of the projection.
    - `method = 'actual_h1_books'`: load TB at H1 end (Jun 30 for calendar-year). Compute H1 net taxable profit (revenue − COGS − expenses, with H1-applicable book-tax adjustments). Annualize H1 (× 2) → forecasted full-year. Compute annual CIT, half = PND.51 prepayment.
    - Warn (both methods) if `H1 actual or projected basis` × 2 < 75% of likely full-year actual (§8.3 estimation-shortfall 20% penalty kicks in when prepayment + WHT credits + PND.50 actual show under-estimation by > 25%). Use prior-year actual and current trailing revenue/profit trend as sanity benchmarks.
    - If projected basis is below prior-year actual run-rate or current trailing trend, require explicit owner/accountant acknowledgment and store the rationale on `cit_filings.pnd51_estimate_rationale`.
    - Persist `cit_filings.pnd51_method` (`projected_full_year` | `actual_h1_books`) so audit trail records which path was used.

#### Common Thai book-tax adjustments (seed catalog)

Pre-built adjustment templates:
- Entertainment/representation expenses — generated addback for excess over v1 revenue-based cap (0.3% of GL revenue, capped at THB 10M); paid-up-capital comparison stays accountant-review until organization paid-up capital is modeled.
- Director meeting fees over THB 300/meeting — disallowed
- Donations to non-approved entities — disallowed
- Donations to approved entities — limited to 2% of net profit
- Depreciation method differences (book straight-line vs statutory tax ceiling)
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

`postYearEndCloseJournalEntries(orgId, taxYear)` validates that this phase has produced a
non-amendment PND.50 row for the year and that the source-linked CIT accrual JE has been
posted. It then closes revenue/COGS/expense balances into 3230 and posts 3230 into 3220
retained earnings as idempotent source-linked `auto_year_end_close` journal entries. It
refuses to close if only one of the two close entries exists, so a partial close requires
manual review instead of silent recomputation.

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

- [x] `cit_filings` schema additions:
  - `taxable_loss numeric(14,2)` — when negative taxable income for this year (creates a new loss layer).
  - `losses_consumed_this_year numeric(14,2)` — total loss layers consumed against this year's profit.
- [x] **New table `loss_carry_forward_layers`:**
  - `id uuid PK`
  - `org_id uuid NOT NULL`
  - `originated_tax_year integer NOT NULL` — the year the loss was created.
  - `expiry_tax_year integer NOT NULL` — `originated_tax_year + 5`.
  - `original_amount numeric(14,2) NOT NULL` — full loss when layer was created.
  - `remaining_amount numeric(14,2) NOT NULL` — current unconsumed balance.
  - `is_expired boolean GENERATED ALWAYS AS (current_tax_year > expiry_tax_year OR remaining_amount <= 0) STORED` — query-time derived (Postgres GENERATED with reference year via app config, OR computed in app layer).
  - Unique on `(org_id, originated_tax_year)` — one layer per origin year per org.
- [x] CIT calculator consumption helper: SELECT eligible `loss_carry_forward_layers` where `expiry_tax_year >= current_year`, `remaining_amount > 0`, and origin year precedes current year; consume oldest first and update remaining balances.
- [x] Manual layer creation surface: `/year-end/cit` can record one loss layer with `expiry_tax_year = originated_tax_year + 5`. Automatic layer creation from filed PND.50 remains pending.
- [x] Audited expiration control: layers with `expiry_tax_year < selected_tax_year` and `remaining_amount > 0` are marked expired only after the layer expiry-year PND.50 is submitted/accepted, remaining amount is zeroed/forfeited, and per-layer audit_log rows record source and forfeited amount. This is exposed on `/year-end/cit`; a background cron can call the same helper later if needed. Source checked 2026-05-16: Thai Revenue Code §65 Ter (12), `https://www.rd.go.th/english/37764.html`.
- [x] PND.50 disclosure: list each layer consumed, showing origin year + amount consumed + remaining. Auditor can verify consumption order is oldest-first. Evidence: `loss_carry_forward_consumption_payload` is stored on submitted PND.50 rows, `/year-end/cit` renders the loss disclosure column, `pnpm vitest run --config vitest.config.db.ts src/lib/db/queries/cit-filings.db.test.ts`, and `pnpm test:e2e e2e/year-end/cit.spec.ts`.

### Transfer pricing disclosure (preserved here, not moved to 12b)

- [x] Schema: `organizations.transfer_pricing_required` boolean — set to true when annual GL revenue > 200M.
- [x] First TP disclosure draft table/action/UI:
  - Stores annual revenue, threshold result, structured related-party transaction rows, preparer, draft/submitted status, audit log, and export rows.
- [ ] `src/lib/cit/transfer-pricing-disclosure.ts`:
  - Captures related-party transactions (purchases, sales, royalties, interest, services).
  - Surfaces at year-end if any transactions are flagged related-party.
  - Output: form per RD-published format, attached to PND.50.

### UI (Phase 12a scope)

- [ ] `src/app/(app)/year-end/page.tsx` — year-end close orchestrator (skeleton; Phase 12b extends).
  - Status checklist with per-step ownership.
- [x] `src/app/(app)/year-end/cit/page.tsx` — projected PND.51 prep foundation plus loss carry-forward layer entry/list.
- [x] `/year-end/cit` exposes a manual PND.50 draft builder, fixed-asset depreciation addback sync, audited manual book-tax adjustment entry, and book-tax adjustment table.
- [x] `/year-end/cit` shows an owner-visible working-paper v1 caveat: PND.51/PND.50 drafts, loss layers, manual book-tax adjustments, WHT credits, CIT accrual/payment posting, and transfer-pricing threshold flagging are testable; richer book-tax adjustment catalog automation and exact RD transfer-pricing form rendering/submission remain deferred. Evidence: `pnpm test:e2e e2e/year-end/cit.spec.ts`; `.next/types` + `.next/dev/types` cleanup; `pnpm tsc --noEmit`; `git diff --check`.
- [ ] `src/app/(app)/year-end/cit/pnd51/[year]/page.tsx` — dedicated PND.51 prep.
- [ ] `src/app/(app)/year-end/cit/pnd50/[year]/page.tsx` — dedicated GL-derived PND.50 prep + book-tax adjustment catalog.
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

- [x] Projected PND.51 estimate computes annual CIT and half-year prepayment within ±0.01 baht.
- [x] PND.51 estimate from H1 books matches manual calc within ±0.01 baht.
- [ ] PND.50 calc with BOI-exempt revenue: BOI revenue not taxed; non-BOI taxed normally.
- [x] PND.50 calc from GL-derived revenue, COGS, and expenses applies book-tax adjustments, WHT credits, and paid PND.51 prepayments.
- [ ] SME tier eligibility: revenue 25M, paid-up capital 4M → SME tiered rates apply; if paid-up capital 6M → standard 20%.
- [x] WHT credits used: manual-profit PND.50 draft applies the sum of `wht_credits_received` for the tax year.
- [x] PND.51 prepayment credits: manual-profit and GL-derived PND.50 drafts consume only non-amendment PND.51 rows with `paid_at` set, so unpaid submitted estimates cannot create a negative prepaid-CIT asset.
- [x] Book-tax adjustment for fixed-asset depreciation tax ceiling differences: yearly positive `depreciation_schedule.book_tax_difference` syncs to one generated addback row.
- [x] Book-tax adjustment for entertainment expenses: account `6610` excess over revenue-only v1 cap is generated as an addback and marked accountant-review.
- [ ] (TFRS BS / P&L / cash flow / DBD package / audit ZIP verification all moved to Phase 12b — this phase only verifies CIT calc + book-tax adjustments + accrual JE.)
- [x] CIT accrual and year-end close JEs: PND.50 accrual books gross CIT expense to 6810, relieves WHT credits from 1180, relieves paid PND.51 prepayments from new prepaid-CIT account 1186, and credits 2170 only for net payable; zero-net-payable accruals omit 2170. `/close` year-end readiness blocks missing PND.50/accrual evidence whenever `cit_calculated > 0`, then posts revenue/COGS/expense close to 3230 and retained-earnings close to 3220 idempotently.
- [x] CIT accrual/payment posting-outbox coverage: PND.50 accrual and submitted-CIT payment enqueue outbox rows transactionally while preserving existing immediate JE behavior; reversed accrual/payment JEs can be reposted through an active-source unique index that excludes reversed entries, and posted outbox rows are rebound to the replacement JE. Evidence: `pnpm vitest run --config vitest.config.db.ts src/lib/db/queries/cit-filings.db.test.ts` passed 24 tests; `pnpm vitest run --config vitest.config.db.ts src/lib/db/queries/general-ledger.db.test.ts` passed 39 tests; `pnpm exec drizzle-kit check`; `pnpm test:e2e e2e/year-end/cit.spec.ts e2e/analytics/analytics.spec.ts` passed 9 tests; `.next/types` + `.next/dev/types` cleanup; `pnpm tsc --noEmit`; `git diff --check`; active-code `vat_records|vatRecords|vat-records` search passed. Claude Companion initial review found CIT credit/close/reversal risks; follow-up review reported no blockers after fixes.
- [x] Loss carry-forward layered consumption: PND.50 drafts preview oldest-first eligible layer consumption without mutating layer balances; PND.50 submit mutates eligible layer balances and stores per-layer disclosure payload.
- [x] Transfer pricing: threshold flag triggered for tenant with annual GL revenue > 200M; audited disclosure draft/submit record captures structured related-party rows and locks submitted rows against rebuild. Exact RD print/PDF layout remains pending.

## Implementation evidence — 2026-05-16 foundation slice

- Added `drizzle/0043_cit_foundation.sql`.
- Added Drizzle tables `cit_brackets`, `cit_filings`, `book_tax_adjustments`, and `loss_carry_forward_layers`.
- Seeded standard and SME qualifying CIT brackets from RD corporate income tax overview, `https://www.rd.go.th/english/6044.html`, retrieved 2026-05-16.
- Confirmed annual-credit treatment from RD corporate income tax overview, `https://www.rd.go.th/english/6044.html`, retrieved 2026-05-16: PND.51 prepaid tax is creditable against annual CIT liability. Confirmed current English PND.50 form evidence, `https://www.rd.go.th/fileadmin/download/english_form/frm_pnd50.pdf`, retrieved 2026-05-16: annual return includes withholding tax and tax paid by other persons as credits.
- Confirmed transfer-pricing threshold from RD PND.50 FAQ/news evidence, `https://www.rd.go.th/62231.html` and `https://www.rd.go.th/fileadmin/user_upload/news/2564eng/englishnews11_2564.pdf`, retrieved 2026-05-16: Disclosure Form accompanies PND.50 for companies/juristic partnerships with financial-statement income over 200M THB in an accounting period.
- Refreshed transfer-pricing primary-source leads on 2026-05-17: Revenue Code Section 71 ter at `https://www.rd.go.th/5939.html` requires related companies/partnerships to prepare the related-party/transaction-value report in the Director-General-prescribed form and submit it with the annual return; the same section gives RD authority to request supporting transfer-pricing analysis documents within statutory response periods. RD Director-General announcement index `https://rd.go.th/27995.html` lists the current related-party report announcement, including the amendment dated 18 January 2025 and earlier 14 January 2021 / 7 November 2019 announcements. Live-link checks returned HTTP 200 for both pages. Exact TP print/PDF rendering remains blocked until the current announcement/form asset is extracted and fixture-tested.
- Live-link checks on 2026-05-17 also returned HTTP 200 for the PND.50 PDF, RD PND.50 FAQ/TP threshold page, and RD English transfer-pricing news PDF.
- Added `src/lib/cit/cit-calculator.ts` and `src/lib/db/queries/cit-filings.ts` with projected-profit PND.51 draft creation/update.
- Added generated fixed-asset depreciation book-tax addback sync from `depreciation_schedule.book_tax_difference`, scoped by org/tax year and idempotent via a system notes marker.
- Added generated entertainment/representation book-tax addback sync from GL account `6610`: v1 computes excess over 0.3% of GL revenue capped at THB 10M, stores `entertainment_cap_excess`, and marks the generated notes key for accountant review because paid-up-capital comparison is not yet modeled.
- Added `drizzle/0050_cit_filing_uniqueness_hardening.sql` and schema partial unique indexes so concurrent non-amendment PND.50/PND.51 drafts cannot duplicate through nullable `amends_filing_id`; submit-time loss-layer consumption now locks selected layers `FOR UPDATE` and excludes administratively expired layers consistently.
- Added `/year-end/cit` UI, nav/i18n labels, full export coverage, unit/DB tests, and Playwright route smoke.
- Added manual-profit PND.50 draft builder/action/UI. It snapshots year book-tax adjustments, applies tax-year WHT credits received, consumes only paid PND.51 prepayment credits, and upserts the non-amendment annual draft while blocking rebuilds of submitted/accepted CIT filings pending amendment workflow. Draft rebuild is also blocked while an active CIT accrual JE exists, but allowed again after reversal.
- Added idempotent CIT accrual GL poster/action/UI for non-amendment PND.50 rows with positive calculated CIT: Dr 6810 Corporate income tax expense, Cr 1180 for WHT credits used, Cr 1186 for paid PND.51 prepayments used, and Cr 2170 only for net payable. The poster enqueues a posting-outbox accrual row for close-drain reconciliation and supports repost after reversal.
- Added actual-H1 PND.51 builder/action/UI. It reads GL revenue, COGS, and expense lines for January-June, stores H1 actual profit, annualizes it, computes annual CIT, and stores the half-year prepayment.
- Added GL-derived PND.50 builder/action/UI. It reads full-year GL revenue, COGS, and expense lines while excluding reversed entries and year-end close entries, applies book-tax adjustments, WHT credits, and paid PND.51 prepayments, then upserts the annual draft.
- Added transfer-pricing threshold flag schema and refresh action/UI. It derives annual GL revenue and updates `organizations.transfer_pricing_required`; exact RD print/PDF output remains pending.
- Added audited manual book-tax adjustment entry/action/UI with category, direction, amount, optional GL-account same-org guardrail, and `audit_log_ref` persistence.
- Added non-mutating PND.50 loss carry-forward preview. Annual drafts reduce taxable income by eligible oldest-first loss layers and snapshot `losses_consumed_this_year`; layer balance mutation is deferred to filing workflow.
- Added audited CIT filing submission workflow. Draft PND.51/PND.50 rows can be marked submitted with optional RD reference, `submitted_at`, and audit log; submitted/accepted rows remain rebuild-blocked.
- Added filed PND.50 loss-layer mutation/disclosure. Submit recomputes eligible oldest-first layers, rejects stale drafts if layer balances changed, mutates remaining balances, and stores `loss_carry_forward_consumption_payload`.
- Added audited expired-loss forfeiture control for loss carry-forward layers. `expireLossCarryForwardLayers()` locks expired rows, refuses forfeiture until the relevant expiry-year PND.50 is submitted/accepted, zeroes forfeited remaining balances, stamps `expired_at`, writes per-layer audit-log evidence with RD §65 Ter source, and `/year-end/cit` exposes an "Expire Old Layers" control defaulted to the prior tax year to avoid current-year filing-window forfeiture.
- Added submitted-CIT payment GL posting. Submitted/accepted PND.50 filings with positive payable can post Dr 2170 / Cr 1111 idempotently; PND.51 payments post Dr 1186 / Cr 1111 so annual PND.50 accrual later relieves the prepaid-CIT asset. Both set `paid_at`, preserve source-linked journal evidence, and enqueue posting-outbox payment rows for idempotent queue processing.
- Added audited CIT acceptance workflow. Submitted filings can transition to accepted with `accepted_at` and audit log; only submitted rows are accepted.
- Added `transfer_pricing_disclosures` schema/export plus draft builder/action/UI. Drafts derive annual GL revenue, store threshold result, parse related-party payload rows, write audit logs, and show in `/year-end/cit`.
- Added structured transfer-pricing disclosure payload parsing plus submit workflow. Pipe-delimited rows can capture related party, taxpayer ID, country, relationship, category, revenue/purchase/service/royalty/interest/loan amounts, and notes; submitted disclosures write audit log and cannot be rebuilt.
- Added `/close` year-end readiness read model for Phase 12a preconditions: PND.50 exists and source-linked CIT accrual JE is posted before retained-earnings close.
- Added `/close` year-end posting action backed by `postYearEndCloseJournalEntries`: closes revenue/COGS/expense accounts to 3230, closes net profit/loss to 3220 retained earnings, requires CIT accrual evidence when PND.50 has positive `cit_calculated` even if net payable is zero, uses the PND.50 fiscal period dates, handles contra-direction P&L balances and flat years, blocks partial close state, ignores reversed/close JEs in source balances, and is idempotent by active PND.50 source link.
- Current verified gate: `pnpm db:migrate`; `pnpm tsc --noEmit`; `pnpm vitest run --config vitest.config.db.ts src/lib/db/queries/cit-filings.db.test.ts`; `pnpm vitest run --config vitest.config.db.ts src/lib/db/queries/general-ledger.db.test.ts src/lib/db/queries/close-checklists.db.test.ts`; `pnpm vitest run src/lib/export/full-export.test.ts`; `pnpm test:e2e e2e/analytics/analytics.spec.ts e2e/year-end/cit.spec.ts`; `pnpm exec drizzle-kit check`; `git diff --check`. Latest focused loss-expiry gates re-ran `pnpm vitest run --config vitest.config.db.ts src/lib/db/queries/cit-filings.db.test.ts`, `pnpm test:e2e e2e/year-end/cit.spec.ts`, and `pnpm tsc --noEmit`.

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
