# Plan: Phase 10.5 — General Ledger Primitives (Chart of Accounts, Journal Entries, Trial Balance, Period Close)

**Status:** Draft — captured 2026-04-26 after CPA review identified missing GL spine
**Position:** Between Phase 10 (POS cutover) and Phase 11 (payroll). Payroll cannot post to GL without this.
**Authority reference:** `vat-info.md` §5.1 (clearing-account model + COA), §5.2 (journal entry templates), §5.3 (reconciliation invariants), §8 (period close); TFRS for NPAEs (Thai Financial Reporting Standards for Non-Publicly Accountable Entities)

## Problem

Both adversarial reviews (Opus + Codex) converged on the same strategic finding: today's platform is **smart AP automation with tax-form generators bolted on**, not an accounting system. There is no general ledger, no chart of accounts, no double-entry posting. Implications:

- Cannot produce trial balance, P&L, balance sheet
- Cannot file PND.50 (annual CIT) — needs taxable income from the books
- Cannot file DBD financial statements — required of every juristic person
- Cannot do year-end close
- Phase 11 pay slips have 8+ implicit journal lines per slip with **no destination**
- Auditor asking "show me the GL" gets nothing

A working Thai bookkeeper closing the books on the 25th of next month needs trial balance, accruals, prepayments, recurring journals, opening balances, period-close attestation. None of this exists.

This phase adds the bookkeeping spine. Once shipped, every existing data source (documents, transactions, sales, payroll, FX, fixed assets) **posts to the GL**, and the accounting reports flow naturally from `journal_lines`.

## Goals

1. **Chart of accounts** with 4-digit Thai convention, bilingual EN/TH names, parent-child hierarchy.
2. **Journal entries** with strict double-entry (debit must equal credit per entry).
3. **Posting engine** — every taxable event in documents/sales/payments/payroll auto-creates journal lines.
4. **Trial balance / P&L / balance sheet** derived from `journal_lines`.
5. **Opening balances** for tenants onboarding mid-year.
6. **Period close** at GL level (locks all entries in closed periods; amendments require explicit unlock + audit).
7. **Year-end roll-forward** (close revenue/expense to retained earnings).

## Non-goals (deferred to later phases)

- Fixed assets / depreciation (Phase 13)
- DBD financial statement format export (Phase 12)
- PND.50 / PND.51 calc (Phase 12)
- TFRS for NPAEs full disclosure notes (Phase 12)
- Cost-center / project / job dimension (Phase 14)
- Multi-currency consolidated GL (single currency per org for v1; FX revaluation in Phase 14)

## Requirements

### Schema

#### Chart of accounts

- [ ] New table `gl_accounts`:
  - `id uuid PK`
  - `org_id uuid NOT NULL`
  - `establishment_id uuid` — null for org-wide accounts (most), set for branch-specific where needed
  - `account_code text NOT NULL` — 4-digit Thai convention, e.g. `1110`, `2150`, `4110`, `6110`. CHECK that string matches `^[1-9][0-9]{3}$` (Thai practice: 1xxx assets, 2xxx liabilities, 3xxx equity, 4xxx revenue, 5xxx COGS, 6xxx expenses, 7xxx non-operating).
  - `name_th` text NOT NULL
  - `name_en` text NOT NULL
  - `account_type` text NOT NULL — `asset`, `liability`, `equity`, `revenue`, `expense`, `cogs`, `contra_asset`, `contra_liability`
  - `account_subtype` text — `cash`, `bank`, `ar`, `inventory`, `fixed_asset`, `accumulated_depreciation`, `ap`, `accrued_liability`, `tax_payable`, `tax_receivable`, `clearing`, `equity_capital`, `retained_earnings`, `sales`, `service_revenue`, `cogs_inventory`, `salaries`, `rent`, `utilities`, etc.
  - `parent_account_id` uuid — self-FK for hierarchy
  - `is_clearing` boolean DEFAULT false — clearing/control accounts used by automated flows. Channel/processor settlement does not create new account codes; it uses `1142` plus typed `journal_lines.channel_key` / `processor_key`.
  - `is_control_account` boolean DEFAULT false — control accounts (AR, AP) where postings flow from sub-ledgers rather than direct journal entries
  - `is_active` boolean DEFAULT true
  - `is_system` boolean DEFAULT false — true for seeded accounts from `chart-of-accounts.md`
  - `is_automated` boolean DEFAULT false — true for tax-engine/posting-engine-owned accounts hidden from owner-mode manual JE
  - `is_postable` boolean DEFAULT true — false for memo/reporting-only accounts such as registered-but-unpaid capital
  - `description_override_en` text
  - `description_override_th` text
  - `visibility_condition` text — e.g. `vat_registered`, `co_ltd`, `has_inventory`, `has_lease`, `has_provisions`
  - `dbd_taxonomy_hint` text — optional current mapping hint; Phase 12b's versioned taxonomy remains authoritative
  - `tenant_added_by` uuid
  - `tenant_added_at` timestamptz
  - `tax_treatment` text — `taxable_revenue`, `vat_exempt_revenue`, `zero_rated_revenue`, `non_deductible_expense`, `vat_recoverable_input`, `non_recoverable_input`, `n_a` — drives PP 30 + PND.50 prep
  - `boi_segment` text — `boi_promoted`, `non_boi`, `n_a` (defaults n_a; only matters for BOI tenants)
  - `vat_register_role` text — `output_tax_payable`, `input_tax_recoverable`, `pp36_payable`, `pp36_reclaim`, `n_a` — auto-links to vat_records
  - `wht_register_role` text — `wht_payable_pnd1`, `wht_payable_pnd3`, `wht_payable_pnd53`, `wht_payable_pnd54`, `wht_credits_receivable`, `n_a`
  - `notes` text
  - `created_at`, `updated_at`, `deleted_at`
  - Unique on `(org_id, account_code)` (one chart per org)
  - Migration: seed a **Thai standard chart of accounts** for every existing org on Phase 10.5 deployment. Standard COA below.

- [ ] **Standard Thai chart of accounts seed** — source of truth: [`chart-of-accounts.md`](./chart-of-accounts.md). Phase 10.5 deployment runs the seeder against every existing org and every new org from the master COA file. Tenants can extend the COA per the Tenant Extensibility section in master COA (add custom sub-accounts, override descriptions, AI-assisted tuning). Tenants cannot delete system accounts once posted to. Audited customizations land in Phase 14.

  Per-channel clearing accounts (Card processor / QR / Marketplace / Delivery receivables) are NOT separate codes — they collapse into master `1142 Processor / marketplace settlement receivable` with typed `journal_lines.channel_key` / `processor_key` columns. This keeps `1140 Trade accounts receivable` reserved for customer credit exposure and prevents AR aging pollution. Bank accounts in foreign currency use master `1114 Bank — foreign currency` with `journal_lines.currency`; THB bank accounts use `1111` (operating) / `1112` (savings) / `1113` (POS settlement).

  Manufacturing accounts (raw materials inventory, raw materials cost, production labour) are NOT in the v1 seed. Tenants who manufacture extend their COA via the Tenant Extensibility mechanism — propose `1162 Inventory — raw materials`, `5170 Raw materials consumed`, `5180 Production labour` as conventional codes, but the master seed is retail / services / import-resale.

#### Journal entries

- [ ] New table `journal_entries`:
  - `id uuid PK`
  - `org_id uuid NOT NULL`
  - `establishment_id uuid NOT NULL`
  - `entry_number text NOT NULL` — sequential per org per fiscal year, format `JE-{year}-{seq}`
  - `entry_date` date NOT NULL — accounting date (drives period assignment)
  - `posting_date` date NOT NULL — when posted to GL (may differ from entry_date for late captures with audit log)
  - `period_year` integer NOT NULL — derived from entry_date
  - `period_month` integer NOT NULL — derived from entry_date
  - `entry_type` text NOT NULL — `manual`, `auto_document`, `auto_sales`, `auto_payment`, `auto_payroll`, `auto_fx_revaluation`, `auto_depreciation`, `auto_accrual`, `auto_year_end_close`, `auto_pp30_settlement`
  - `source_entity_type` text — `documents`, `sales_transactions`, `pay_slips`, `processor_settlements`, `cash_deposits`, etc.
  - `source_entity_id` uuid
  - `description` text NOT NULL
  - `description_th` text — bilingual when set
  - `currency` text DEFAULT 'THB'
  - `fx_rate` numeric(18,8)
  - `total_debit` numeric(14,2) NOT NULL
  - `total_credit` numeric(14,2) NOT NULL
  - `is_balanced` boolean GENERATED ALWAYS AS `(total_debit = total_credit)` STORED — DB CHECK enforces true
  - `created_by_user_id` text
  - `approved_by_user_id` text
  - `approved_at` timestamptz
  - `posted_at` timestamptz NOT NULL
  - `is_reversal` boolean DEFAULT false
  - `reverses_entry_id` uuid — FK; reversal entries inverse-post the referenced entry
  - `reversed_by_entry_id` uuid — FK back-pointer
  - **No `period_locked` boolean.** Lock state lives in shared `period_locks` table (`domain='gl'`). Per `period-lock-protocol.md` anti-patterns: the boolean was a stale primitive from round-2 and has been removed. UI displays lock state via JOIN to `period_locks`.
  - `notes` text
  - `created_at`, `updated_at`
  - Unique on `(org_id, entry_number)`
  - Index on `(org_id, period_year, period_month)`
  - Index on `(org_id, source_entity_type, source_entity_id)` for "find the JE that posted this document"

- [ ] New table `journal_lines`:
  - `id uuid PK`
  - `org_id uuid NOT NULL`
  - `journal_entry_id uuid NOT NULL` (FK)
  - `line_number` integer NOT NULL
  - `account_id uuid NOT NULL` (FK to `gl_accounts`)
  - `description` text
  - `debit_amount` numeric(14,2) NOT NULL DEFAULT 0
  - `credit_amount` numeric(14,2) NOT NULL DEFAULT 0
  - CHECK: `(debit_amount > 0 AND credit_amount = 0) OR (debit_amount = 0 AND credit_amount > 0)` — line is either-or, never both
  - `subledger_entity_type` text — `vendor`, `customer`, `employee`, `bank_account`, `establishment`, `tax_period` — for control-account drill-through
  - `subledger_entity_id` uuid
  - `channel_key` text — typed channel dimension for POS/processor/marketplace lines; required by CHECK constraints for channel-driven posting kinds
  - `processor_key` text — typed processor/marketplace dimension for `1142` clearing lines
  - `cash_deposit_key` text — typed cash-deposit dimension for `1120` cash-in-transit lines
  - `cost_center_id` uuid — Phase 14 dimension; nullable today
  - `project_id` uuid — Phase 14 dimension; nullable today
  - `boi_segment` text — inherits from account but can be overridden per line
  - `created_at`, `updated_at`
  - Index on `(org_id, account_id, journal_entry_id)`
  - Index on `(org_id, subledger_entity_type, subledger_entity_id)`

#### Period locks

GL period locks use the shared `period_locks` table with `domain='gl'`. **Do not** create a separate `gl_period_locks` table — round-3 review found three colliding lock primitives across plans, round-4 found this plan still defined the deprecated table. See `docs/_ai_context/period-lock-protocol.md` for canonical schema, trigger function, override session variable (`app.lock_override_user_id`), and amendment workflow.

- [ ] Phase 10.5 contributes the GL-specific trigger application:
  - `journal_entries` — domain `gl`, period from `entry_date`. BEFORE INSERT/UPDATE/DELETE.
  - `journal_lines` — inherits from parent JE; a line cannot be inserted/updated/deleted if its parent JE's period is locked.
  - `depreciation_schedule` — domain `gl`, period from `posted_at`.
- [ ] All lock writes/unlocks go through `period_locks` per the protocol. No GL-specific lock table, no GL-specific session var.

#### Opening balances

- [ ] New table `gl_opening_balances`:
  - `id uuid PK`
  - `org_id uuid NOT NULL`
  - `establishment_id uuid NOT NULL`
  - `as_of_date` date NOT NULL — typically fiscal year start
  - `account_id uuid NOT NULL`
  - `debit_amount` numeric(14,2) DEFAULT 0
  - `credit_amount` numeric(14,2) DEFAULT 0
  - `entered_by_user_id` text
  - `notes` text
  - `created_at`, `updated_at`
  - Unique on `(org_id, establishment_id, as_of_date, account_id)`
- Opening balances post a single journal entry per `as_of_date` with `entry_type='opening_balance'` to seed the GL.

#### Recurring journals — DEFERRED (round-6 user direction)

User direction 2026-04-27: recurring journal templates de-prioritized. Future scope is Xero-style **recurring documents** (repeating bills + invoices), not raw GL templates: a recurring template produces a draft `documents` row on its scheduled day, user reviews/edits/attaches PDF, then approves it through the standard document-confirmation flow (which already triggers the posting engine via Phase 3 → 10.5 `documents.confirmed` posting rule). No separate recurring-JE table needed; the existing posting rules handle the JE.

- v1 of Phase 10.5 ships **without** any recurring-journal primitive.
- Track as a separate plan once 10.5 + 13 are stable: `phase-1x-recurring-documents.md` (Xero-style repeating bills/invoices that produce draft documents on schedule for human review).
- Depreciation entries (Phase 13) are NOT modelled as recurring journals — they're posted by Phase 13's own depreciation cron directly through the posting engine.

### Posting engine

For every existing data source, define a posting rule that converts the source event into a journal entry. **Posting is asynchronous via the `posting_outbox` pattern (round-3 hardening, see below) — never synchronous within the source mutation transaction.** Source mutations write outbox rows in the same transaction; the consumer cron drains them into JEs. The "synchronous within source mutation" framing earlier in this plan is the v1 design, since superseded — this section retains the per-source posting-rule mappings, but the wire-up is via outbox.

#### Document-driven postings (Phase 3 docs path)

- [ ] When `documents.status` flips to `confirmed` AND `direction='expense'`:
  ```
  Dr  6xxx Expense (mapped from category → account_code)
  Dr  1251 Input VAT recoverable (if recoverable; from documents.vatAmount)
  Dr  1132 Input VAT — pending tax invoice (if AB B-tagged or TI fields incomplete; non-recoverable buffer; sweeps to 1251 on TI receipt)
      Cr  2153/2154/2155/2156 WHT payable PND.x (if WHT applies; mapped from wht_certificates.form_type → master PND.3 / PND.53 / PND.54 / PND.1)
      Cr  2110 Trade payables (gross net of WHT) — if not yet paid
      Cr  1110/1111 Cash/Bank (if paid same time)
  ```
- [ ] When document is later paid (linked to a `transactions` row):
  ```
  Dr  2110 Trade payables
      Cr  1110/1111 Cash/Bank
  ```
- [ ] When `documents.direction='income'` confirmed (legacy path; deprecated post-Phase-10 cutover):
  ```
  Dr  1140 Trade accounts receivable (or 1110/1111 if paid same time)
      Cr  4xxx Revenue (mapped from category — 4110/4120/4130/4140)
      Cr  2150 Output VAT — sales (per-sale liability; sweeps to 2151 on PP 30 close)
  ```

#### Sales-driven postings (Phase 10 sales_transactions)

- [ ] When `sales_transactions` row created with `event_role='pos_primary'` and `tax_invoice_type IN ('abb','full_ti','e_tax_invoice')`:
  ```
  Dr  1142 Processor / marketplace settlement receivable [channel_key, processor_key from sales_transactions.clearing_account_key]
      Cr  4110 Retail sales — store / 4120 Online sales / 4130 Wholesale (mapped from sales_transactions.channel)
      Cr  2150 Output VAT — sales
  ```
- [ ] When `sales_transactions` is matched via reconciliation Layer A to a `processor_shadow` row, no GL impact (shadow is reference only).
- [ ] When `processor_settlements` row matched to bank deposit:
  ```
  Dr  1111 Bank (or 1113 POS settlement bank, per processor mapping)
  Dr  6411 Payment gateway / card-processing fees (= processor_settlements.fee_amount)
  Dr  1251 Input VAT recoverable (= processor_settlements.fee_vat_amount, only if processor_tax_invoice_document_id is set)
      Cr  1142 Processor / marketplace settlement receivable [matching processor_key — clears the receivable from sales]
  ```
- [ ] When `cash_deposits` matched to bank deposit:
  ```
  Dr  1111 Bank
      Cr  1120 Cash in transit [cash_deposit_key]
  ```
  (Cash transition: POS cash sale debits `1110 Cash on hand` → at deposit slip, debit `1120 Cash in transit` with `cash_deposit_key`, credit `1110` → at bank arrival, debit `1111 Bank`, credit `1120`. Processor/marketplace timing uses `1142`, not `1120`.)

#### Voucher / gift-card postings

- [ ] At voucher sale (no VAT yet per §5.4):
  ```
  Dr  1110 Cash / 1142 processor receivable / 1140 Trade AR [channel_key]
      Cr  2160 Customer deposits & gift vouchers (voucher liability)
  ```
- [ ] At voucher redemption (`sales_transactions.is_voucher_redemption=true`):
  ```
  Dr  2160 Customer deposits & gift vouchers
      Cr  4xxx Revenue (4110/4120/4130/4140 per channel)
      Cr  2150 Output VAT — sales
  ```

#### Payroll postings (Phase 11 pay_slips)

- [ ] When `pay_slip` approved (status='approved'):
  ```
  Dr  6110 Salaries & wages (gross_salary + bonus + overtime; 6111 Bonus split if material)
  Dr  6112 Social security expense — employer (sso_employer)
      Cr  2156 WHT payable — PND.1 (pit_wht)
      Cr  2157 SSO payable (sso_employee + sso_employer)
      Cr  2158 Salaries & wages payable / 1111 Bank (net_pay)
  ```
- [ ] When PND.1 filed + paid:
  ```
  Dr  2156 WHT payable — PND.1
      Cr  1111 Bank
  ```
- [ ] When SSO filed + paid:
  ```
  Dr  2157 SSO payable
      Cr  1111 Bank
  ```

#### PP 30 / PP 36 settlement postings

- [ ] When `vat_records` for a period locked + paid:
  - For PP 30 net payable / excess: see "Updated PP 30 settlement posting" below for the universal close-out template.

- [ ] **PP 36 self-assessed VAT — full lifecycle (round-4 fix; original was unbalanced and missing remittance + reclaim gating):**

  **Step 1 — Recognition** (when foreign-service document is confirmed in extraction review and PP 36 obligation calculated):
  ```
  Dr  6xxx Foreign-service expense           [foreign service amount, gross]
      Cr  2110 Trade payables — foreign supplier   [foreign service amount, gross]
  ```
  This is the normal AP posting, no PP 36 here. The expense is recognized; the foreign supplier owes nothing for VAT (foreign vendors don't charge Thai VAT).

  **Step 2 — Self-assessment** (at PP 36 declaration, end of declaration month):
  ```
  Dr  1253 Input VAT — PP 36 pending remittance  [pp36_vat_amount]   -- per round-4 reclaim gating
      Cr  2152 PP 36 self-assessed VAT payable        [pp36_vat_amount]
  ```
  We recognize both sides: a contingent input VAT (asset, but locked) and the payable to RD. **The input VAT booked here is NOT yet eligible for PP 30 reclaim** — it sits in `1253` segregated by `pp36_vat_reclaims.reclaim_status='pending_remittance'` until the payable is settled. Master COA gives `1253` the dedicated transitional role so the GL trial balance surfaces the pending pool without joining a sub-ledger.

  **Step 3 — Remittance** (when bank transaction confirms PP 36 payment to RD):
  ```
  Dr  2152 PP 36 self-assessed VAT payable       [pp36_vat_amount]
      Cr  1111 Bank                                  [pp36_vat_amount]
  ```
  System sets `pp36_vat_reclaims.reclaim_status='eligible_for_reclaim'`, `pp36_paid_at=now()`. This is the gate that lets the reclaim flow into the next PP 30.

  **Step 4 — Reclaim** (in the next PP 30 close-out, the reclaim is rolled into the universal close-out template via `vat_period_balances.pp36_reclaim_used`):
  ```
  Dr  1251 Input VAT recoverable (current period)        [pp36_vat_amount]
      Cr  1253 Input VAT — PP 36 pending remittance         [pp36_vat_amount]
  ```
  Followed by the universal close-out template that includes the now-current input VAT.

  Round-4 audit: every step balances. Total flow is: foreign-service expense ↑, AP ↑, then a transient PP 36 cycle (recognized → paid → reclaimed) that nets to zero against bank cash flow over the two-month cycle, leaving the input VAT in current PP 30. Final tax position is consistent with vat-info.md §5.4.

#### Account mapping configuration

- [ ] New table `posting_rules`:
  - `id uuid PK`
  - `org_id uuid NOT NULL`
  - `rule_key text NOT NULL` — e.g. `expense_category:advertising` or `revenue_category:product_sales` or `payroll_employer_sso`
  - `account_id uuid NOT NULL` (FK to `gl_accounts`)
  - `priority integer DEFAULT 0`
  - `notes text`
- Tenants can override default mappings (e.g. "advertising" → 6310 by default; tenant can map to a custom account).

### Reports

- [ ] New module `src/lib/gl/trial-balance.ts`:
  - `buildTrialBalance(orgId, establishmentId, asOfDate)` — sums journal_lines by account_id up to as_of_date; returns rows {account_code, account_name, debit_total, credit_total, net_balance}.
  - Includes opening balances + all posted entries through the date.
  - Validation: total debits = total credits (else GL is broken; surface error).

- [ ] New module `src/lib/gl/profit-loss.ts`:
  - `buildProfitLoss(orgId, establishmentId, periodStart, periodEnd)` — revenue accounts (4xxx) − COGS (5xxx) − expense (6xxx) for the period, grouped by subtype.
  - Output: gross revenue, total COGS, gross profit, total opex, operating profit, other income/expense, net profit before tax, income tax, net profit.

- [ ] New module `src/lib/gl/balance-sheet.ts`:
  - `buildBalanceSheet(orgId, establishmentId, asOfDate)` — assets (1xxx) − liabilities (2xxx) − equity (3xxx) = 0.
  - Year-to-date P&L flows to retained earnings during interim views; closes to 3220 at year-end.

- [ ] New module `src/lib/gl/general-ledger-detail.ts`:
  - `buildGlDetail(orgId, accountId, periodStart, periodEnd)` — every journal_line for the account with running balance.
  - Supports drill-through from trial balance / P&L / BS to underlying entries to source documents.

### Period close

- [ ] Server action `closePeriod(orgId, establishmentId, periodYear, periodMonth)`:
  1. Validate trial balance balances (debits = credits).
  2. Validate sub-ledger ties: `documents.totalAmount` posted to GL = sum of relevant journal_lines for the period; `transactions.amount` posted = sum; `pay_slips.net_pay` posted = sum.
  3. Validate VAT register ties from tax subledgers first, not raw account buckets:
     - `outputVat` = output-tax report VAT for `sales_transactions.event_role='pos_primary'` plus approved credit-note adjustments.
     - `inputVatPp30` = input-tax report recoverable VAT only (`full_ti` / `e_tax_invoice` + eligible processor fee TIs + PP 36 reclaims already remitted and moved to `1251`).
     - GL check = `posting_kind='vat_settlement_pp30'` lines reconcile to `vat_period_balances`. Do not add `2151` back into output VAT, and do not count `1253` as PP 30 input until the reclaim posting moves it to `1251`.
  4. Validate WHT register ties: sum of `wht_certificates.totalWht` for period = sum of journal_lines on 2153/2154/2155/2156 (master codes: PND.3 / PND.53 / PND.54 / PND.1).
  5. If all pass, insert `period_locks` row with `domain='gl'`, `lock_reason='routine_close'`, `period_year`, `period_month`. From this point, journal_entries cannot be posted to this period without explicit unlock (trigger enforces).
  6. Send confirmation email + dashboard notification.
- [ ] Server action `unlockPeriod(orgId, establishmentId, periodYear, periodMonth, reason)`:
  - Requires elevated permission (manager role + reason text).
  - Sets `SET LOCAL app.lock_override_user_id = '<clerk_user_id>'` for the current transaction (canonical session var per protocol).
  - Updates the existing `period_locks` row for `(org, establishment, 'gl', year, month)`: `unlocked_at = now()`, `unlocked_by_user_id`, `unlock_reason`.
  - Audit_log entry.

### UI

- [ ] `src/app/(app)/accounting/coa/page.tsx` — chart of accounts list + custom account creation (cannot delete standard accounts; can deactivate).
- [ ] `src/app/(app)/accounting/journal/page.tsx` — journal entries list, filters by date / type / source.
- [ ] `src/app/(app)/accounting/journal/new/page.tsx` — manual journal entry creation (debit/credit lines, balance check before save).
- [ ] `src/app/(app)/accounting/journal/[id]/page.tsx` — entry detail with reversal action.
- [ ] `src/app/(app)/accounting/reports/trial-balance/page.tsx`
- [ ] `src/app/(app)/accounting/reports/profit-loss/page.tsx`
- [ ] `src/app/(app)/accounting/reports/balance-sheet/page.tsx`
- [ ] `src/app/(app)/accounting/reports/general-ledger/page.tsx` — drill-through report.
- [ ] `src/app/(app)/accounting/period-close/page.tsx` — close month flow with sub-ledger tie validation.
- [ ] `src/app/(app)/accounting/opening-balances/page.tsx` — entry form for onboarding.

### Onboarding flow updates

- [ ] New tenant onboarding step: opening balances entry (or skip if greenfield).
  - Importer: TB CSV from prior accounting tool (FlowAccount, Peak, Xero, manual).
  - Validation: dr = cr.
  - Audit log entry.

## Approach

### Sequencing (5 weeks)

**Week 1 — Schema + COA seed**
1. Migrations for `gl_accounts`, `journal_entries`, `journal_lines`, `gl_opening_balances`, `posting_rules`. (Period locks live in shared `period_locks` table — see period-lock-protocol.md. Recurring-journal templates dropped per round-6 scope cut.)
2. Seed standard Thai COA for every existing org (idempotent).
3. Backfill: existing `bank_accounts` create matching 1xxx GL accounts.
4. Backfill: existing channel clearing keys from Phase 10 `sales_transactions` map to `1142` dimensions; no per-channel GL account codes are created.
5. Read-only COA page + admin custom account creation.

**Week 2 — Posting engine for documents + sales**
1. Document-driven posting rules (expense + legacy income path).
2. Sales-driven posting rules (POS sales + processor settlements + cash deposits).
3. Voucher posting rules.
4. Backfill: post journal entries for all confirmed historical documents, sales, settlements (idempotent — keyed on `source_entity_id`).
5. Trial balance derivation working from posted journals.

**Week 3 — Manual journal entries + reports**
1. Manual JE creation UI (debit/credit lines, balance check).
2. Trial balance + P&L + balance sheet reports.
3. General ledger detail drill-through.
4. Reversal flow.

**Week 4 — Opening balances + period close**
1. Opening balances import + entry UI.
2. Period close action with all sub-ledger tie validations.
3. DB trigger enforcing GL period lock.
4. Year-end close action: revenue + expense + COGS to 3230 Current year P&L, then 3230 to 3220 Retained earnings.

**Week 5 — Polish + first design partner cutover**
1. PP 30 settlement posting (Phase 6 → GL).
2. WHT remittance posting.
3. PP 36 reclaim posting.
4. Dashboard widgets: trial balance summary, oldest open period, sub-ledger tie health.
5. First org cutover: Lumera enters opening balances, posts historical periods, closes Q1 in the platform.

### Dependencies

- **Phase 10 must be cut over first.** Sales-side posting rules need `sales_transactions` populated.
- **Today-gap remediation P0-3 (DB period lock trigger)** lays the pattern reused here.
- **Phase 11 (payroll) cannot ship before this.** Pay slips must post to GL.
- **Phase 12 (annual close + DBD)** depends on this entirely.
- **Phase 13 (fixed assets)** depreciation entries are posted by Phase 13's own monthly cron through the standard posting engine; needs GL primitives in place.
- **Phase 14 (analytics + audit pack)** queries the GL. Cost-center / project dimension lands there.

## Critical files

To be created:
- `src/lib/db/schema.ts` — extend with all new tables
- `src/lib/gl/coa-seed.ts` — standard Thai chart of accounts seed
- `src/lib/gl/posting-engine.ts` — central dispatch
- `src/lib/gl/posters/document-posting.ts`
- `src/lib/gl/posters/sales-posting.ts`
- `src/lib/gl/posters/payment-posting.ts`
- `src/lib/gl/posters/payroll-posting.ts`
- `src/lib/gl/posters/vat-settlement-posting.ts`
- `src/lib/gl/posters/wht-settlement-posting.ts`
- `src/lib/gl/posters/voucher-posting.ts`
- `src/lib/gl/posters/year-end-close-posting.ts`
- `src/lib/gl/posters/opening-balance-posting.ts`
- `src/lib/gl/trial-balance.ts`
- `src/lib/gl/profit-loss.ts`
- `src/lib/gl/balance-sheet.ts`
- `src/lib/gl/general-ledger-detail.ts`
- `src/lib/gl/period-close.ts`
- `src/lib/db/queries/gl-accounts.ts`
- `src/lib/db/queries/journal-entries.ts`
- `src/lib/db/queries/period-locks.ts` — shared lock CRUD covering all domains (vat/wht/gl/payroll/cit/sso) per period-lock-protocol.md. Replaces the earlier draft `gl-period-locks.ts` filename.
- `src/lib/db/queries/gl-opening-balances.ts`
- `src/lib/db/queries/posting-rules.ts`
- `src/lib/inngest/functions/post-historical-backfill.ts`
- `src/app/(app)/accounting/**` — full UI tree above

To be edited:
- `src/lib/db/queries/documents.ts` — call posting engine on confirm
- `src/lib/db/queries/transactions.ts` — call posting engine on payment match
- (Phase 11) `src/lib/db/queries/pay-slips.ts` — call posting engine on approve
- `src/lib/db/queries/vat-records.ts` — call posting engine on filing close + payment
- `src/lib/db/queries/wht-filings.ts` — call posting engine on remittance
- `CLAUDE.md` — Context Map rows for all new modules

## Verification

- [ ] **COA seed:** new org gets all standard accounts; cannot delete any with posted journal_lines.
- [ ] **JE balance:** attempt to insert a journal_entry with total_debit ≠ total_credit → DB rejects.
- [ ] **JE line direction:** attempt to insert a journal_line with both debit_amount > 0 AND credit_amount > 0 → DB rejects.
- [ ] **Sub-ledger ties:** for a sample tax month, sum of `documents.totalAmount` confirmed in period equals the relevant journal_lines sum on AP / cash / VAT control accounts.
- [ ] **Trial balance:** for any closed period, total debits = total credits across all accounts.
- [ ] **P&L tie:** revenue accounts sum (4xxx) − cogs (5xxx) − expense (6xxx) = net profit; net profit YTD on P&L = retained earnings movement on BS.
- [ ] **Balance sheet:** assets (1xxx) = liabilities (2xxx) + equity (3xxx) at every closed period.
- [ ] **Drill-through:** click on a P&L line → sees journal entries → click on entry → sees source document/sales row.
- [ ] **Period close:** lock March → cannot post a JE in March without unlock; SQL-level + app-level both enforce.
- [ ] **Voided JE:** reversal entry visible on the GL; no actual deletion (audit trail intact per §2.8).
- [ ] **Opening balances:** entered TB matches starting BS; subsequent transactions roll forward correctly.
- [ ] **Backfill:** posting historical data is idempotent — running backfill twice doesn't duplicate journal entries.
- [ ] **Year-end close:** runs at fiscal year-end; revenue + expense accounts zero out into 3230 Current year P&L; 3230 closes to 3220 Retained earnings.
- [ ] **Org isolation:** all queries include `org_id`; cross-tenant access blocked.
- [ ] **Audit trail:** every JE posting captured in `audit_log` with `actor_user_id`, `entity_type='journal_entry'`, `entity_id`.

## Risks

- **Backfill volume.** Re-posting 6+ months of confirmed documents per tenant is significant. Run as Inngest batch jobs; surface progress; allow per-period backfill so Lumera can validate one month at a time.
- **Posting rule mistakes.** Wrong account mapping for "Office Supplies" → 6211 (utilities) instead of 6512 (office supplies) silently shifts P&L lines. Mitigate: tenant-overridable `posting_rules` table; surface affected accounts in P&L hierarchical view; pre-cutover review sheet for each tenant.
- **Sub-ledger tie failures.** Document marked confirmed but no JE posted (e.g. extraction pipeline crashed mid-step). Mitigate: scheduled tie-out job that flags discrepancies; re-post option from UI.
- **Period-close locking too aggressive.** Tenants sometimes need late captures. Mitigate: clear unlock flow with audit; "amendment journal" pattern for closed-period adjustments (post in next open period with description reference).
- **Performance.** Trial balance over years of data — naive query is slow. Mitigate: materialized monthly account balance summary refreshed on close.
- **Bilingual mapping.** UI must show TH labels for Thai bookkeepers. Account `name_th` is canonical; `name_en` for English-speaking users. Both seeded.
- **Custom accounts that conflict with seed.** Tenant adds account 6905 "Marketing — campaign A" but later we add 6905 to seed. Mitigate: when seed updates, custom-account-code conflicts surface for resolution at deploy time; never silently overwrite.

## Open questions

- **Multi-currency GL.** v1 single currency per org (THB-functional). Foreign currency expenses post at conversion rate. FX revaluation lands in Phase 14. Tenants with USD bank accounts: defer or add ad-hoc revaluation? Recommend Phase 14.
- **Sub-ledger architecture.** Today's `documents` ↔ `transactions` ↔ `vat_records` model is sub-ledger-shaped already. GL is the new layer above. Option A: GL is derived view (every report queries posting engine + backfill). Option B: GL is authoritative storage (everything posts immediately). v1 picks Option B — simpler integrity model, easier reconciliation.
- **Manual JE permissions.** Should every user be able to post manual JEs? Recommend: only "accountant" role + audit log per entry. Owner role can view but not post.
- **Account hierarchy depth.** v1: parent-child via `parent_account_id` (single level useful for grouping). Multi-level rolls up via recursive CTE. No hard limit but UI shows max 3 levels.
- **Multi-establishment GL.** Each establishment has its own period locks; consolidated reports roll up to org level. v1 supports per-establishment trial balance, P&L, balance sheet AND consolidated views. Tenants without DG approval to consolidate file per-establishment.

---

## Post-round-3-review hardening (added 2026-04-26)

### Posting failure mode — outbox pattern (NOT synchronous-blocking)

Round-3 review found that "synchronous within source mutation transaction" creates a footgun: COA mis-config or missing posting rule blocks the entire AI extraction pipeline. Re-spec:

- [ ] New table `posting_outbox`:
  - `id uuid PK`
  - `org_id uuid NOT NULL`
  - `source_entity_type text NOT NULL`
  - `source_entity_id uuid NOT NULL`
  - `event_type text NOT NULL` — `confirm`, `void`, `amend`, `reverse`
  - `payload jsonb` — snapshot of source data needed to compute the JE
  - `posting_status text NOT NULL DEFAULT 'pending'` — `pending`, `posted`, `failed`, `retrying`
  - `posting_attempts integer DEFAULT 0`
  - `last_attempt_at timestamptz`
  - `last_error text`
  - `journal_entry_id uuid` — populated on success
  - Unique on `(org_id, source_entity_type, source_entity_id, event_type)`
  - `created_at, updated_at`
- [ ] Source mutations (document confirm, sales create, pay slip approve) write `posting_outbox` row in the same transaction. **Never** post the JE inside the source mutation.
- [ ] Inngest cron `process-posting-outbox` (every minute): pulls pending rows, runs posting engine, updates status. Failed rows surface in `posting_exceptions` after 3 failed attempts.
- [ ] **`drainPostingOutbox(orgId, throughDate)` — chunked synchronous drain helper (round-4 race fix; round-5 chunked).** Used by `runYearEndClose` (Phase 12a) and `closePeriod` (this phase) to eliminate the async race where a close action runs before the cron consumer has processed accrual JEs. **Chunked execution to avoid long-held advisory lock at year-end:**
  1. Loop: acquire `pg_advisory_lock(hashtext('outbox_drain:' || orgId))` (session-level, not transaction-level), select up to **50 pending rows** for the org with source event period ≤ throughDate, run consumer for the chunk, release lock.
  2. Repeat until no pending rows remain for the org+date window OR until `posting_attempts >= 3` rows surface in `posting_exceptions`.
  3. If any row entered `posting_exceptions` after retries: abort the calling close action with the row IDs surfaced to the user; don't proceed to validation.
  4. Per-chunk lock acquire/release prevents the cron consumer from being starved during a year-end close on a busy tenant.
- Configurable chunk size via `app_config.posting_outbox_drain_chunk_size` (default 50).
- [ ] Period close blocks if any `posting_outbox` row is `pending` / `failed` for the period — close action must call `drainPostingOutbox` first; if any row finished in `failed` state, close aborts with the failures listed.
- [ ] **First-deploy bootstrap.** On the deploy that introduces `posting_outbox` and the consumer cron: a backfill seeds outbox rows for every historical confirmed source event (documents, sales, settlements, WHT certs, PP 36 self-assessments, VAT settlements, soft-deletes) so historical periods can be closed by Phase 10.5. Without this, the first close attempt fails because outbox is empty but JEs are still missing. Backfill query keys: same idempotency key the consumer uses → safe to re-run.
- [ ] Tie-out cron (daily): cross-checks sub-ledger amounts vs GL posted amounts; surfaces drift.

### `journal_entries` idempotency upgrade

- [ ] Replace the `(org_id, source_entity_type, source_entity_id)` index with **partial unique constraint**: `UNIQUE (org_id, source_entity_type, source_entity_id, entry_type, posting_kind) WHERE is_reversal = false AND entry_type LIKE 'auto_%'`. Manual JEs unaffected.
- [ ] Round-4 added `posting_kind` column (text, NOT NULL for `auto_*` entry_types). One source entity may produce multiple distinct JEs — e.g. a POS sale produces revenue + COGS + voucher-redemption + processor-clearing JEs, each a different `posting_kind`. Without this discriminator the unique constraint either over-collides (rejects legitimate second JE) or under-protects (allows duplicate revenue posting).
  - Phase 10.6 example: one `sales_transactions` row → `posting_kind='revenue'` (Phase 10.5) + `posting_kind='cogs'` (Phase 10.6).
  - Voucher example: `voucher_sales` row → `posting_kind='issuance'` at sale + `posting_kind='redemption'` at redemption.
  - Document confirm + later payment: still the same source `documents` row, but the document confirm produces `posting_kind='ap_recognition'` and the payment match produces `posting_kind='ap_settlement'`.
- [ ] Backfill jobs check existence before insert (using full key including `posting_kind`).

### `journal_entries.is_balanced` enforced via deferrable constraint trigger

Round-4 fix: a non-deferrable AFTER trigger fires on the first line insert and rejects the JE because debits ≠ credits at that point. Lines must be inserted as a unit, then balanced check fires at commit.

- [ ] DB **constraint trigger** `enforce_journal_entry_balance` declared `DEFERRABLE INITIALLY DEFERRED`:
  - Fires once per transaction, at COMMIT.
  - For each `journal_entry_id` touched in the transaction: recompute `total_debit = SUM(debit)` and `total_credit = SUM(credit)` from `journal_lines`.
  - Raise exception if `total_debit != total_credit` OR if either differs from the cached header value (header must be updated by the same transaction that writes the lines).
- [ ] Posting helpers (`postJournalEntry(...)`) wrap header + lines + header-recompute in a single transaction — the deferred trigger fires once at the end.
- [ ] Manual JE UI builds the entire entry client-side, submits header + lines together server-side, posts in a single transaction.
- [ ] Lines for posted entries (entry referenced by posted source events) are immutable except via reversal entries. Enforced by separate trigger on `journal_lines`.
- [ ] **Defense against zero-fraud (round-5 relaxed):** CHECK on `journal_entries`: `total_debit > 0 OR is_reversal = true OR entry_type IN ('opening_balance', 'memo') OR notes IS NOT NULL`. Zero-debit allowed when (a) it's a reversal of a zero-impact entry, (b) it's an opening balance for a startup with no opening data, (c) it's a memo entry (notes-only documentation entry that some Thai bookkeepers use), or (d) it has explicit notes documenting why it's zero. This avoids legitimate-zero blocks while still preventing accidental zero-fraud.

### `journal_lines` multi-currency capture

- [ ] Add columns:
  - `original_currency text NOT NULL DEFAULT 'THB'`
  - `original_amount_debit numeric(14,2) DEFAULT 0`
  - `original_amount_credit numeric(14,2) DEFAULT 0`
  - `fx_rate_applied numeric(18,8)` — null when currency = THB
- [ ] All postings preserve original currency; THB amounts derived. Phase 14 FX revaluation reads `original_amount_*` per line.

### `posting_rules` unique resolution

- [ ] Schema: `UNIQUE (org_id, rule_key, priority)` so only one row per rule_key+priority. Posting engine selects highest `priority` matching rule_key.
- [ ] Default priority = 0 for system seeds; tenant overrides use priority = 100.

### GL reversal on source soft-delete

- [ ] When `documents.deleted_at` is set on a confirmed document with a posted JE: enqueue `posting_outbox` row with `event_type='reverse'`. Posting engine creates a reversal JE inverse-posting the original.
- [ ] Same for `sales_transactions.deleted_at`, `pay_slips` voids.
- [ ] Reversals never delete the original JE — audit trail intact.

#### Reversal date rule (round-4 fix)

The reversal JE's `entry_date` matters because it determines which tax period it lands in. Original Phase 10.5 spec was silent on this — the assumption that "the period_locks trigger handles it" doesn't tell the engine what date to write.

Policy:

| Original JE period status | Reversal `entry_date` | Tax / VAT impact | Auth required |
|---|---|---|---|
| **Open** (current period or any period not yet locked) | Same as original (`original.entry_date`) | Reverses cleanly within the period. PP 30 / WHT register reflects the corrected number. | Standard write permission. |
| **Locked** (period filed; lock present in `period_locks`) | **Current open period** (`now()` truncated to current month) | Reversal lands in the current period — does NOT touch the locked filed period. The original sale / expense remains in its filed period; the reversal is recognized in the current month as a separate event. | Manager + reason text. |
| **Locked, but tenant wants to amend the filed period** | `original.entry_date`, with unlock workflow | Reversal lands in the original period; original filing now needs a PP 30 ก amendment + new locked filing. | Manager + reason + amendment workflow per period-lock-protocol §"Amendment workflow". |

Per `vat-info.md` §5.4 (returned goods after VAT month closed): the standard practice is to **issue a credit note in the current month**, not reverse the original. The "locked + reverse-in-original-period" path is reserved for genuine errors (wrong period booked) and triggers the formal amendment flow.

Implementation:

- [ ] Reversal posting engine receives `reversal_target_period` parameter:
  - Default for soft-deletes that hit a locked period: `current_open` (matches the §5.4 credit-note practice).
  - User can explicitly request `original_period` via the void/amend UI; system requires manager auth + amendment record + period unlock.
  - If period is open: always `original_period` regardless of parameter.
- [ ] Reversal JE description includes: "Reversal of [original entry number] dated [original date]; reversed in [reversal period] per [credit-note | amendment] workflow".

### `vat_period_balances` sub-ledger for PP 30 carry-forward

The original Phase 10.5 PP 30 settlement JE netted output/input directly to bank — losing carry-forward and refund tracking. `vat-info.md` §2.4: excess input VAT can be requested as cash refund or carried forward indefinitely.

- [ ] New table `vat_period_balances`:
  - `id, org_id, establishment_id, tax_month`
  - `output_vat numeric(14,2)`
  - `input_vat numeric(14,2)`
  - `pp36_self_assessed numeric(14,2)` — output side from Phase 9
  - `pp36_reclaim_used numeric(14,2)` — input side reclaim
  - `prior_carry_forward_used numeric(14,2)`
  - `current_period_balance numeric(14,2)` — positive = payable, negative = excess
  - `disposition` text — `paid`, `carry_forward`, `cash_refund_requested`, `cash_refund_received`
  - `carry_forward_to_period text` — null unless disposition='carry_forward'
  - `payment_bank_transaction_id uuid`
  - `refund_bank_transaction_id uuid`
- [ ] Updated PP 30 settlement posting (round-4 fix — original had carry-forward direction wrong; 1252 is an asset, debit increases, credit decreases):

  **Pre-close sweep** (run at period boundary before the close-out template fires):
  ```
  Dr  2150 Output VAT — sales              [period per-sale output VAT accrued]
      Cr  2151 Output VAT payable (PP 30 net)   [moves accrued liability into the PP 30 settlement bucket]
  ```
  This collapses the per-sale `2150` liability accrual into `2151`, the PP 30 net bucket the close-out template settles. (`2143` Output VAT — pending PP 30 close is a transitional bucket for events where output VAT lands before the sale is fully recognized — typically empty at period-end for normal flows.)

  **Universal close-out template** (handles all four scenarios — net payable / net excess / with-or-without prior carry-forward consumed):
  ```
  Dr  2151 Output VAT payable (PP 30 net)  [period output VAT after sweep above]
  Dr  1252 VAT carry-forward asset         [if current period has excess input → asset increases]
  Dr  1131 VAT refund receivable           [if cash refund requested instead of carry-forward]
      Cr  1251 Input VAT recoverable    [period input VAT, including any reclaimed PP 36 — see B3]
      Cr  1252 VAT carry-forward asset  [if prior carry-forward consumed → asset decreases]
      Cr  1111 Bank                     [cash paid, when net payable]
  ```
  Per `vat_period_balances.disposition`, the engine emits exactly the lines that apply (no zero-amount lines). Net excess carry-forward case: `Dr 1252` line is non-zero, `Cr 1111` line is omitted. Net excess cash-refund-requested case: `Dr 1131` line is non-zero, `Dr 1252` is omitted. Net payable case: `Cr 1111` line is non-zero, `Dr 1252` / `Dr 1131` lines are omitted.

  Example: period output VAT ฿70, input VAT ฿100, cash refund requested → `Dr 2151 ฿70 / Dr 1131 ฿30 / Cr 1251 ฿100`.

- [ ] **Required COA seeds** (round-4 found these missing):
  - `1251 Input VAT recoverable` (asset, debit normal)
  - `1252 VAT carry-forward asset` (asset, debit normal) — **add to standard COA seed**
  - `1131 VAT refund receivable` (asset, debit normal) — for cash-refund disposition
  - `2151 Output VAT payable` (liability, credit normal)
  - `2152 PP 36 VAT payable` (liability, credit normal — see B3 for reclaim gating)

### Year-end close ordering corrected

Round-3 review found the original sequence was wrong: closing P&L → retained earnings BEFORE Phase 12 calculates CIT means the CIT accrual JE never lands in the year being closed.

Corrected sequence (Phase 10.5 implements steps 1-3 + 6-7; Phase 12 implements step 4-5):

1. Run all month-end / year-end accruals + adjustments (manual JE for prepayment release, accrued utilities, etc.).
2. Run depreciation through fiscal year-end (Phase 13).
3. Run FX revaluation through fiscal year-end (Phase 14).
4. **Phase 12: compute CIT for the year + book CIT accrual JE:**
   ```
   Dr  6810 Corporate income tax expense
       Cr  2170 CIT payable
   ```
5. **Phase 12: compute book-tax adjustments + post any year-end adjusting JEs.**
6. Now close revenue + COGS + expense accounts (4xxx + 5xxx + 6xxx) into 3230 Current year P&L (income summary).
7. Close 3230 → 3220 Retained earnings.

Phase 10.5 server action `runYearEndClose(orgId, fiscalYear)`:
- Validates that Phase 12 has run for this fiscal year (CIT filing in `cit_filings` exists with `filing_status >= 'draft'`).
- Refuses to close if not.
- Posts steps 6-7 JEs in a single batch.

### Period locks via shared protocol

- [ ] Drop `gl_period_locks` from this plan; replace all references with the unified `period_locks` table per `docs/_ai_context/period-lock-protocol.md`. Domain = `'gl'`.
- [ ] DB trigger on `journal_entries` calls the shared `check_period_lock(org_id, establishment_id, 'gl', period_year, period_month)` function.

### Inventory accounting moved to Phase 10.6

Phase 10.5 surfaces master COA codes `1160 Inventory — merchandise` and `5110 Cost of goods sold` but no posting rules. Inventory accounting is the entire scope of Phase 10.6 (NEW). Phase 10.5 ships the COA seed (sourced from `chart-of-accounts.md`); Phase 10.6 ships the posting rules + the perpetual ledger. **Phase 10.6 must ship before Phase 12 (CIT) runs for the first fiscal year-end.**

### Audit log retention

- [ ] Add to plan: `audit_log` archival policy. Round-4 hardened spec:

  **Hot storage (Neon primary):** rolling 12 months. All recent queries (audit trail UI, `gh` PR review, "what changed last month") hit Neon directly.

  **Cold storage (S3 Glacier or equivalent):** entries older than 12 months. Migration via monthly Inngest cron `archive-old-audit-log`. Cold storage requirements:
  - **WORM (Write Once, Read Many)**: S3 Object Lock in Compliance mode with 10-year retention. Once written, immutable until retention expires — even root account cannot delete. Required for §2.8 audit-trail integrity.
  - **Restore test**: monthly Inngest cron `verify-audit-archive-restore` picks a random archived month, restores to staging, validates row count + checksum vs the archive manifest. Failures alert.
  - **Manifest**: each monthly archive includes a manifest JSON listing every archived row's `(id, hash)` for tamper detection. Manifest itself is WORM.
  - **Legal hold**: schema flag `audit_log.legal_hold_until date` — entries with non-null hold are excluded from archival until the hold expires. UI for compliance officer to set holds on specific entity_ids.
  - **Retrieval SLA**: Glacier retrieval is hours-to-days. Phase 12b audit-pack builder must read from cold storage when building tax-year-N packages — UX surfaces the wait + emails owner when ready.

  Schema additions:
  - `audit_log.is_archived boolean DEFAULT false`
  - `audit_log.archived_at timestamptz`
  - `audit_log.archive_manifest_id uuid` — FK to monthly manifest row
  - `audit_log.legal_hold_until date`
  - New table `audit_archive_manifests` — per-month metadata for restore validation.

### Updated verification additions

- [ ] Posting outbox: synthetic posting failure → row stays `pending`, retried 3x, then surfaces in `posting_exceptions`. Source mutation NOT rolled back.
- [ ] Idempotency: re-running historical backfill twice → no duplicate JEs (unique constraint enforces).
- [ ] Trigger: insert journal_lines with sum != header → DB rejects.
- [ ] Multi-currency: USD invoice posts journal_line with `original_currency='USD', original_amount_credit=100, fx_rate_applied=35.50`, THB credit_amount=3550.
- [ ] Posting rules: two rows for same rule_key with priorities 0 and 100 → engine picks priority 100.
- [ ] Soft-delete reversal: confirmed document with posted JE then `deleted_at` set → reversal JE posted automatically; original JE preserved.
- [ ] vat_period_balances: month with excess input VAT → carry-forward row created; next period consumes it correctly.
- [ ] Year-end close blocks if `cit_filings` for the year has no draft.
- [ ] Audit log retention: synthetic 13-month-old row → archived to blob; primary table query returns it via cross-source view.

---

## Round-7 plan-architecture hardening (added 2026-04-28)

Independent architectural review (Opus, post-baseline-hardening) flagged four plan-stage risks that compound across Phase 10.5 → 14. Each is cheap to fix at plan time, expensive once the GL has been live a quarter. All four fold into Week 1 implementation, before any poster ships.

### 1. `posting_kind` becomes a Postgres enum (not free text)

Round-4 added `posting_kind text NOT NULL` on `journal_entries` for `entry_type LIKE 'auto_%'` rows, and made it part of the partial unique constraint protecting against duplicate auto-postings. Free text means a typo in a poster (`'revenu'`) silently bypasses idempotency and creates a duplicate revenue JE. Discrimination via spelling is fragile.

- [ ] Replace `posting_kind text` with `pgEnum('posting_kind', [...])`. Initial values, all phases included so the enum is stable across the roadmap:
  - `revenue` (sales-driven, Phase 10)
  - `cogs` (Phase 10.6b)
  - `ap_recognition` (document confirmed, Phase 3 → 10.5)
  - `ap_settlement` (document paid, Phase 4 → 10.5)
  - `voucher_issuance`
  - `voucher_redemption`
  - `processor_settlement` (processor → bank deposit, Phase 10)
  - `cash_deposit` (Phase 10)
  - `payroll_gross` (Phase 11)
  - `payroll_remit_pnd1` (Phase 11)
  - `payroll_remit_sso` (Phase 11)
  - `vat_pre_close_sweep` (this plan, pre-close 2150 → 2151)
  - `vat_settlement_pp30` (Phase 6 / 10)
  - `vat_settlement_pp36_recognition` (Phase 9)
  - `vat_settlement_pp36_remit` (Phase 9)
  - `vat_settlement_pp36_reclaim` (Phase 9)
  - `wht_remit` (Phase 5 / 9 / 11)
  - `fx_revaluation` (Phase 14)
  - `depreciation_period` (Phase 13)
  - `opening_balance` (this plan, Week 4)
  - `year_end_close_revenue_summary` (this plan, Week 4)
  - `year_end_close_to_retained_earnings` (this plan, Week 4)
  - `cit_accrual` (Phase 12a)
  - `import_landed_cost` (Phase 10.6a)
  - `manual` (operator-entered; no source entity)
- [ ] Migrations adding values are append-only. Never rename or remove enum values — `audit_log` references the historical name and the GL trail must remain readable. Deprecation is via a `retired` flag in the dispatcher table, not enum mutation.
- [ ] The posting engine resolves `(source_entity_type, event_type)` → `posting_kind` via a single static dispatch table (`src/lib/gl/posting-kind-dispatch.ts`). Each poster declares its kind statically; the engine asserts the declared kind matches the dispatch table at boot.

### 2. Poster protocol — explicit interface contract before any poster ships

The plan lists 9 individual posters under `src/lib/gl/posters/` plus one `posting-engine.ts` "central dispatch", but does not specify what a poster declares vs what the engine guarantees. Without a contract, each poster reinvents balance check, idempotency-key generation, account resolution, dimension flow, and FX handling. Nine slightly-different posting paths is a recipe for a bug class.

- [ ] Land `src/lib/gl/posters/poster-protocol.ts` BEFORE the first poster (Week 2 Day 1). Required interface:

  ```ts
  interface Poster<TPayload> {
    readonly posting_kind: PostingKind;
    readonly source_entity_type: SourceEntityType;
    /** Engine validates the seed COA contains every code at boot. */
    readonly required_account_codes: readonly string[];
    /** Pure function. No DB access. Used for outbox idempotency. */
    idempotencyKey(payload: TPayload, event_type: OutboxEventType): string;
    /** Pure function. No DB access. Engine provides preloaded refs in ctx. */
    compute(payload: TPayload, ctx: PostingContext): JournalEntryDraft;
  }

  interface PostingContext {
    org_id: string;
    establishment_id: string;
    accountIdByCode: Map<string, string>;     // preloaded by engine
    fxRate: (currency: string, on: Date) => string | null;
    posting_kind: PostingKind;
  }

  interface JournalEntryDraft {
    entry_date: Date;
    description: string;
    description_th?: string;
    posting_kind: PostingKind;
    lines: JournalLineDraft[];                // engine asserts sum(debit) === sum(credit)
  }

  interface JournalLineDraft {
    account_code: string;                     // resolved to account_id by engine
    debit_amount: string;                     // string for NUMERIC precision
    credit_amount: string;
    description?: string;
    // Typed dimensions — see (4); no jsonb dimension bag.
    channel_key?: string;
    processor_key?: string;
    cash_deposit_id?: string;
    subledger_entity_type?: SubledgerEntityType;
    subledger_entity_id?: string;
    // Multi-currency (round-4)
    original_currency?: string;
    original_amount_debit?: string;
    original_amount_credit?: string;
    fx_rate_applied?: string;
  }
  ```

- [ ] **Engine responsibilities** (every poster gets these for free):
  - account_code → account_id resolution (against the preloaded map; unknown code → boot-time fail, not runtime).
  - Balance assertion (`sum(debit) === sum(credit)` exact, NUMERIC compare, before insert).
  - Idempotency dedup using `(org_id, source_entity_type, source_entity_id, entry_type, posting_kind)` partial unique key.
  - Transactional write of header + all lines + outbox row update (single transaction; deferred constraint trigger fires once at commit).
  - `audit_log` entry per JE, captured in the same transaction.
  - Period-lock check via the shared `check_period_lock(...)` trigger (applied per period-lock-protocol).
- [ ] **Poster responsibilities** (each poster's whole job):
  - Pure `compute(payload, ctx) → JournalEntryDraft`. No DB queries, no `Date.now()` calls, no FX HTTP — `ctx` provides everything.
  - Stable `idempotencyKey()`: same payload + event_type → same key, byte-for-byte. No timestamp, no UUID generation.
  - Static declaration of `required_account_codes`. Adding a new account code requires updating the declaration AND the COA seed in the same migration.
- [ ] **Boot-time validation** (`src/lib/gl/posting-engine-boot.ts`, runs at app start):
  1. Confirm every `posting_kind` enum value has a registered poster (or is explicitly marked `manual`).
  2. Confirm every poster's `required_account_codes` exists in the standard COA seed (`chart-of-accounts.md`).
  3. Confirm dispatch table covers every `(source_entity_type, event_type)` produced by `posting_outbox` writers.
  4. Any failure → process exits non-zero. CI catches before deploy.
- [ ] Tests: every poster gets a pure-unit test (no DB) asserting the JE draft for representative payloads, plus a `*.db.test.ts` asserting end-to-end engine + outbox + audit_log + idempotency.

### 3. `posting_exceptions` — explicit schema + resolution flow

Round-3 hardening referenced an `exception_queue` for posting-outbox failures after 3 retries; this plan standardizes that concept as `posting_exceptions`. `closePeriod` blocks on unresolved `posting_exceptions`.

- [ ] New table `posting_exceptions`:
  - `id uuid PK`
  - `org_id uuid NOT NULL`
  - `outbox_id uuid NOT NULL` (FK to `posting_outbox.id`)
  - `source_entity_type text NOT NULL`
  - `source_entity_id uuid NOT NULL`
  - `posting_kind` posting_kind — the kind that failed; nullable when failure occurred before kind classification
  - `failure_class text NOT NULL` — controlled vocabulary: `unmapped_account`, `coa_inactive`, `period_locked`, `balance_violation`, `idempotency_collision`, `fx_rate_missing`, `payload_invalid`, `unknown`
  - `last_error text NOT NULL`
  - `attempts integer NOT NULL`
  - `surfaced_at timestamptz NOT NULL`
  - `resolution_status text NOT NULL DEFAULT 'open'` — `open`, `resolved_retry`, `resolved_manual_je`, `resolved_dismiss`
  - `resolved_by_user_id text`
  - `resolved_at timestamptz`
  - `resolution_notes text` — required when `resolution_status='resolved_dismiss'`
  - `resolution_journal_entry_id uuid` — set when operator resolved with a manual JE
  - `created_at`, `updated_at`
  - Unique on `(org_id, outbox_id)` — one exception row per failed outbox event
  - Index on `(org_id, resolution_status, surfaced_at)` for operator dashboard
  - Index on `(org_id, source_entity_type, source_entity_id)` for "show me the exceptions for this document"

- [ ] **Producer:** `process-posting-outbox` cron writes to `posting_exceptions` when `posting_attempts >= 3` (atomically with the outbox row marked `failed`). Failure classification logic per poster: each `Poster` may export a `classifyFailure(error) → failure_class` helper; engine falls back to `unknown` if not provided.

- [ ] **UI:** `src/app/(app)/accounting/posting-exceptions/page.tsx`:
  - List filterable by `failure_class`, period, source_entity_type
  - Per-row actions:
    - "Retry" — resets `posting_outbox.posting_status` to `pending`, increments a separate `manual_retry_count`, leaves the exception row open until the next attempt resolves.
    - "Resolve with manual JE" — opens manual JE form prefilled with the outbox `payload`. On JE save, exception row flips to `resolved_manual_je`, links the resulting `journal_entry_id`.
    - "Dismiss with reason" — manager role only, requires `resolution_notes` (free text), audit-logged. Outbox row stays `failed` (no JE produced); exception row flips to `resolved_dismiss`. Use case: source event was a duplicate that should never have been queued.
  - Period-close blocker: `closePeriod()` queries this table for `org_id = ? AND resolution_status = 'open' AND <period match on source event date>`. Any rows → abort with the count + deep link. No close button without zero open exceptions for the period.

- [ ] **Backfill bootstrap behaviour:** when `post-historical-backfill` Inngest job runs, failures land in `posting_exceptions` from day 1 (NOT just console errors). The historical-period close action then surfaces them through the standard UI. Without this, the first-deploy backfill produces silent failures that block the first close attempt with no explanation.

### 4. Typed dimension columns on `journal_lines` — drop the JSON dimension

Current spec: `dimension jsonb` carries `channel_key`, `processor_key`, cash-deposit metadata "until Phase 14 dimensions land." Phase 14 adds `cost_center_id`, `project_id` as typed columns. This creates a 6-month window where some lines have JSON dimensions and others have FK columns. Reports, sub-ledger ties, drill-through, P&L slicing all branch on shape. It also invites typo-driven drift — no DB constraint catches `channnel_key`. Querying via `jsonb_extract_path_text` in hot paths is slow and hard to index cleanly.

- [ ] Replace `dimension jsonb` on `journal_lines` with explicit typed columns from day 1:
  - `channel_key text` — sales channel (`pos_store`, `online`, `wholesale`, `direct`); matches the controlled vocabulary on `sales_transactions.channel`
  - `processor_key text` — `card_visa`, `card_mastercard`, `qr_promptpay`, `marketplace_shopee`, `marketplace_lazada`, `delivery_grab`, `delivery_lineman`, etc.; controlled by a separate `processors` reference table seeded in Week 1
  - `cash_deposit_id uuid` — FK to `cash_deposits`, replacing the JSON `cash_deposit` flag
  - Existing typed columns retained: `subledger_entity_type`, `subledger_entity_id`, `boi_segment`
  - Phase 14 adds `cost_center_id uuid`, `project_id uuid` as additional typed columns (NOT into a JSON bag).

- [ ] Indexes (in this plan's Week 1 migration):
  - `(org_id, account_id, channel_key)` — channel-level P&L slicing on revenue / 1142 receivable
  - `(org_id, account_id, processor_key)` — processor reconciliation drill-through
  - `(org_id, cash_deposit_id) WHERE cash_deposit_id IS NOT NULL` — cash-deposit close-out queries

- [ ] **CHECK constraints** per posting_kind (DB-enforced, prevents posters from omitting required dimensions):
  - `posting_kind = 'revenue' AND account_code = '1142'` → `channel_key IS NOT NULL AND processor_key IS NOT NULL`
  - `posting_kind = 'cash_deposit' AND account_code = '1120'` → `cash_deposit_id IS NOT NULL`
  - `posting_kind = 'processor_settlement'` → `processor_key IS NOT NULL`
  - Other kinds permit nulls (manual JE, opening balance, year-end close, etc.).

- [ ] Reports query typed columns directly. Zero `jsonb_extract_path_text` in `src/lib/gl/`.

- [ ] Migration consideration: this round-7 hardening lands in Week 1 of Phase 10.5, before any line is written. JSON dimension is removed from the spec entirely; no in-flight migration needed.

### Cross-cutting follow-ups (logged here; tracked in their own phases)

These surfaced in the same architectural review but don't belong in Phase 10.5 itself:

- **Inngest `runStep<T>` helper.** Extract the retryable-classification + budget-guard + idempotency-key + audit pattern from `process-document.ts` into a reusable helper. Used by `process-posting-outbox` (this plan, Week 2), `archive-old-audit-log` (this plan, Week 4), Phase 13 depreciation cron, Phase 14 FX revaluation cron. Land before this plan's Week 2. Tracked in Phase 8 follow-up section.
- **Transaction-boundaries doc.** One-pager `docs/_ai_context/transaction-boundaries.md`: when does a write go to a query module / server action / Inngest function / API route. Phases 10–14 will collide on this without a guide. Drafted before Phase 11 Week 1.
- **Vendor / customer / employee taxonomy.** Decide payee structure before Phase 11 ships. Recommendation: separate `vendors`, `customers`, `employees` tables; `wht_certificates` becomes polymorphic via `payee_kind text + payee_id uuid`. Tracked in Phase 11 plan as a Week 1 schema decision.
- **Modular schema split.** `src/lib/db/schema.ts` (1500 lines / 35 tables; ~70+ tables expected by Phase 14) carved into `src/lib/db/schema/{core,documents,banking,wht,vat,gl,inventory,imports,payroll,fixed-assets,cit,fx,...}/index.ts` — pure refactor, preserves Drizzle re-exports. Land in Week 1 of Phase 10.5, in the same PR as the GL schema additions.
- **`src/lib/{gl,pos,payroll,...}/` domain folder layout.** Phase 10.5 lands `src/lib/gl/`. Phase 10 lands `src/lib/pos/`, `src/lib/cash-flow/`. Phase 11 lands `src/lib/payroll/`. Phase 13 lands `src/lib/fixed-assets/`. Phase 14 lands `src/lib/fx/`. FX revaluation never lives in `src/lib/tax/`. Documented up front in the Phase 10.5 module README to prevent cross-cutting from re-mixing.
- **`audit_log` monthly partitioning.** Belongs in `baseline-hardening.md`, not here — added to that plan separately. Adding partitioning to a populated audit log is migration-painful at scale.

### Round-7 verification additions

- [ ] `posting_kind` enum: attempt to insert a JE with a kind not in the enum → DB rejects.
- [ ] Boot-time validation: synthetic missing poster for an enum value → app process exits non-zero. CI red.
- [ ] Boot-time validation: synthetic poster declaring a non-existent account code in `required_account_codes` → app process exits non-zero. CI red.
- [ ] Idempotency under typo: simulate a duplicate posting attempt with identical payload + posting_kind → second attempt rejected by partial unique constraint, not silently accepted.
- [ ] `posting_exceptions`: simulated unmapped-account failure → row written with `failure_class='unmapped_account'`. Period close blocks until resolved.
- [ ] `posting_exceptions` retry: operator clicks "Retry" on a resolved-by-fix outbox row → outbox flips to `pending`, next cron run posts cleanly, exception row flips to `resolved_retry`.
- [ ] Typed dimensions: insert a `posting_kind='revenue'` line on `1142` with `channel_key=NULL` → DB rejects via CHECK constraint.
- [ ] Typed dimensions: revenue P&L by channel query runs against `(org_id, account_id, channel_key)` index — `EXPLAIN` shows index scan, not seq scan.
