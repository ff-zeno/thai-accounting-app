# Plan: Phase 10 — POS Sales Ledger + Channel Settlement + Cash Deposit Tracking + Mandatory §87 Reports

**Status:** Draft v2 — captured 2026-04-26, patched same day after Opus + Codex adversarial review
**Depends on:** Phases 2-4 (bank statements, documents, reconciliation) shipped; this layers a second source of truth on top
**Authority reference:** `vat-info.md` §1 (two-ledger model), §2.3 (output VAT base), §2.5 (TI / ABB), §2.6 (PP 30 + §87 mandatory reports), §5 (reconciliation), §5.4 (edge cases), §7.1 (VAT integrity), §8.1 (amendment penalties)

## Problem

The platform today reconciles from bank statements only. For VAT compliance this is wrong. `vat-info.md` is explicit:

> **Hard rule.** The VAT base for output VAT is the gross sale price recorded by the POS, **not** the net amount that lands in the bank after processor fees, MDR, marketplace commissions, or platform charges. Using settlement-net amounts as the VAT base is a compliance defect that under-reports output VAT.

Concretely:
- A ฿1,070 card sale lands in the bank as ฿1,047.10 (after 2% MDR + 7% VAT on the fee).
- Today the platform sees ฿1,047.10 in the bank statement and books that as revenue.
- PP 30 should declare ฿1,000 net + ฿70 output VAT. We're under-declaring output VAT.

Beyond the VAT base error, today's stack is missing **two of the three §87 mandatory monthly reports** (input tax report and goods/raw-materials report — Codex review finding #5). A tenant who gets RD-audited without these reports is in §87 violation regardless of whether their PP 30 numbers are right.

Owners also need to know **where their money is in the pipeline**: ZORT says we sold ฿100k cash this week, the staff deposit slips show ฿95k arrived at the bank — where's the ฿5k? Today the platform can't answer this because it only sees the bank.

Three real-world data sources are needed:
1. **POS systems** (ZORT, FlowAccount POS, others) — gross sales, line items, payment channel, ABB/full-TI numbers, terminal IDs, branch IDs.
2. **Payment processors** (BEAM, Ksher, others) — settlement reports per channel, fees, fee tax invoices, payouts to bank.
3. **Cash deposit slips** — staff deposits the cash drawer to the bank; the slip is the audit-grade evidence linking POS cash → bank deposit.

Reconciling these gives the owner a **channel tracker** showing unsettled balances per pipe (card terminal, QR machine, cash) and surfaces shrinkage, missing deposits, and processor fee surprises.

## Requirements

### Schema

#### New: place of business / branch dimension
- [ ] New table `establishments` (per-org place of business under `vat-info.md` §2.6 "one PP 30 per place of business"):
  - `id uuid PK`
  - `org_id uuid NOT NULL`
  - `branch_number varchar(5) NOT NULL` — '00000' for head office, '00001'+ for branches (matches `vendors.branchNumber` precedent)
  - `name_th`, `name_en` text
  - `address_line1`, `address_line2`, `subdistrict`, `district`, `province`, `postcode` text
  - `is_head_office` boolean DEFAULT false
  - `consolidated_filing_approved` boolean DEFAULT false — Director-General approval to consolidate PP 30 across branches
  - `consolidated_under_branch_id` uuid — points to the consolidating branch when approved
  - `vat_registered` boolean NOT NULL DEFAULT true
  - `tax_id` text — usually inherits from org but stored for audit immutability
  - `created_at`, `updated_at`, `deleted_at`
  - Unique on `(org_id, branch_number)`
- [ ] Migration (round-5 corrected): existing orgs get a single `establishments` row with `branch_number='00000', is_head_office=true`. **Single-branch tenants:** all historical data backfills to head-office. **Multi-branch tenants** (detected during onboarding interview OR by branch hints in existing `documents.notes` / vendor branch numbers): historical rows get `establishment_id = '<branch_unknown_sentinel_uuid>'` — a synthetic establishment row with `branch_number='UNKNOWN', is_head_office=false` and a flag `requires_manual_mapping=true`. **Branch-level filings (per-branch PP 30, PND.1, SSO) are blocked** for any tenant with `establishment_id=<branch_unknown_sentinel>` rows in the relevant period until the owner manually maps each historical row OR explicitly accepts "head-office allocation for all unmapped" via a documented sign-off (audit_log entry). This prevents silent destruction of branch-level §2.6 history.

- [ ] **Establishment dimension propagated to every existing source table (round-4 fix).** Without this, branch PP 30 reports JOIN against `documents` / `processor_settlements` / `wht_credits_received` / `pp36_vat_reclaims` and lose the branch dimension, violating §2.6 one-PP-30-per-place-of-business. Migration:
  - `documents` — add `establishment_id uuid NOT NULL` (default to head-office establishment for backfill). Forward writes capture from extraction context (terminal/branch ID on the invoice or user selection in review UI).
  - `processor_settlements` — already added in this plan (line 117); confirm NOT NULL on new rows.
  - `wht_credits_received` (Phase 9) — add `establishment_id uuid NOT NULL`.
  - `pp36_vat_reclaims` (Phase 9) — add `establishment_id uuid NOT NULL` for branch-level PP 36 obligation tracking.
  - `imports` (Phase 10.6) — already keyed per establishment; confirm.
  - `inventory_movements` (Phase 10.6) — already keyed per establishment; confirm.
  - All branch-level reports (output tax, input tax, inventory, PND.1, PND.3/53, SSO) JOIN on `establishment_id` and filter to one branch at a time.

#### New: sales ledger
- [ ] New table `sales_transactions`:
  - `id uuid PK`
  - `org_id uuid NOT NULL` (Clerk org)
  - `establishment_id uuid NOT NULL` — FK to `establishments` (per-branch PP 30 grouping)
  - `event_role` text NOT NULL — `pos_primary` (canonical sale event from POS — counted in PP 30) or `processor_shadow` (cross-reference record from processor; never counted in PP 30 directly). Codex finding #6 — without this discriminator, ingesting POS + processor records double-counts VAT.
  - `source` text NOT NULL — `pos:zort`, `pos:flowaccount`, `processor:beam`, `processor:ksher`, `manual_csv`
  - `external_id` text NOT NULL — POS/processor-side transaction ID for idempotency
  - `sold_at` timestamptz NOT NULL — POS-recorded sale time (drives VAT month, NOT deposit time per §2.2)
  - `channel` text NOT NULL — `cash`, `card`, `qr_promptpay`, `qr_truemoney`, `qr_rabbit`, `marketplace_shopee`, `marketplace_lazada`, `delivery_grab`, `delivery_lineman`, `b2b_credit`, `voucher_redemption`
  - `pricing_mode` text NOT NULL — `vat_inclusive` (gross includes VAT, common in retail) or `vat_exclusive` (net + VAT line). Codex finding #1 — the field semantics depend on this.
  - `amount_including_vat` numeric(14,2) NOT NULL — gross consideration charged to customer
  - `tax_base_ex_vat` numeric(14,2) NOT NULL — VAT base (the §2.3 "tax base"), net of any line-item discount shown on TI
  - `vat_amount` numeric(14,2) NOT NULL — output VAT
  - `vat_rate` numeric(5,4) NOT NULL — defaults to 0.07; reads from active rate config
  - `discount_amount` numeric(14,2) DEFAULT 0 — line-item discount shown on TI; `tax_base_ex_vat` already net of this
  - `discount_funded_by` text — `vendor` (reduces tax base) or `third_party` (does NOT reduce tax base — credit-card promo, etc., per §5.4); applied for audit trail
  - `tip_amount` numeric(14,2) DEFAULT 0 — separately stated, may be outside VAT scope per §5.4 (configurable per tenant)
  - `tax_invoice_type` text NOT NULL — `abb`, `full_ti`, `e_tax_invoice`, `voucher_sale_no_ti` (deferred recognition, see §Vouchers below). NULL not allowed for VAT-registered establishments.
  - `tax_invoice_number` text — sequential serial from POS terminal; required when `tax_invoice_type IN ('abb', 'full_ti', 'e_tax_invoice')`
  - `terminal_id` text — issuing POS terminal (for ABB approval traceability per §2.5)
  - `superseded_by_id` uuid — self-FK; when a sale is upgraded mid-transaction from ABB → full TI, original row is marked superseded and counted-once in VAT (§2.5 / §5.4)
  - `is_deemed_supply` boolean DEFAULT false — staff meals, gifts, samples (§77/1(8) deemed supply); `tax_base_ex_vat` set to market value when true
  - `deemed_supply_basis` text — `staff_benefit`, `gift`, `sample`, `internal_consumption`
  - `original_currency` text — ISO-4217, e.g. 'USD'; null for THB-native sales
  - `fx_rate` numeric(18,8) — applied conversion rate
  - `fx_source` text — 'BOT_reference' (default per §5.4), 'processor_provided', 'manual_override'
  - `payload` jsonb — raw POS/processor record (line items if available)
  - `clearing_account_key` text NOT NULL — channel + processor identifier (`card_beam`, `qr_ksher`, `cash_drawer_<terminal>`, etc.)
  - `settlement_status` text NOT NULL DEFAULT `pending` — `pending`, `settled`, `partial`, `disputed`, `aged_unsettled`, `written_off`
  - `settlement_aged_at` timestamptz — populated when SLA breach flagged for owner action
  - `settled_transaction_id` uuid — FK to `transactions` (bank-side) when matched
  - `settled_at` timestamptz
  - `voided_at` timestamptz — same-session void; `voided_by_terminal_user`, `void_reason` text
  - `credit_note_for_id` uuid — FK to `sales_transactions` when this row is a refund/return; original sale must reference a TI/ABB number
  - `credit_note_reason` text
  - `is_voucher_redemption` boolean DEFAULT false — gift card / pre-paid voucher being redeemed (VAT recognized at redemption per §5.4); references original `voucher_sales` row
  - `voucher_sales_id` uuid — FK to `voucher_sales` when redeemed
  - `notes` text
  - `created_at`, `updated_at`, `deleted_at` (soft-delete per CLAUDE.md)
  - Unique on `(org_id, source, external_id)` for idempotent ingestion
  - Unique on `(org_id, establishment_id, terminal_id, tax_invoice_number)` WHERE `tax_invoice_type IS NOT NULL AND superseded_by_id IS NULL` — enforces serial uniqueness per terminal (§2.5 sequential serial requirement)
  - Index on `(org_id, establishment_id, sold_at)` for VAT-month queries
  - Index on `(org_id, clearing_account_key, settlement_status)` for channel-tracker queries
  - Index on `(org_id, event_role, sold_at)` — PP 30 query filters `event_role='pos_primary'`
  - Check: `event_role='pos_primary' → tax_invoice_type IS NOT NULL` for VAT-registered establishments

#### New: voucher / gift card deferred recognition (§5.4)
- [ ] New table `voucher_sales`:
  - `id uuid PK`
  - `org_id uuid NOT NULL`
  - `establishment_id uuid NOT NULL`
  - `sold_at` timestamptz NOT NULL
  - `voucher_code` text NOT NULL
  - `face_value` numeric(14,2) NOT NULL
  - `payment_received` numeric(14,2) NOT NULL — cash/card received for the voucher (financial liability, not revenue)
  - `expires_at` date
  - `redeemed_at` timestamptz
  - `redemption_sales_transaction_id` uuid — FK to the redemption row
  - `payload` jsonb
  - `created_at`, `updated_at`, `deleted_at`
  - Unique on `(org_id, voucher_code)`
- VAT is recognized only at redemption time (creates `sales_transactions` with `is_voucher_redemption=true`). Cash received at sale-of-voucher books to a deferred-revenue liability account; not on PP 30 until redeemed.

#### New: settlement (processor → bank) records
- [ ] New table `processor_settlements`:
  - `id uuid PK`
  - `org_id uuid NOT NULL`
  - `establishment_id uuid` — when the processor reports per-terminal/branch
  - `processor` text NOT NULL — `beam`, `ksher`, etc.
  - `external_id` text NOT NULL — processor settlement batch ID
  - `period_start`, `period_end` timestamptz — daily/weekly window the settlement covers
  - `gross_amount` numeric(14,2) NOT NULL — sum of sales in the batch (must reconcile to sum of `sales_transactions.amount_including_vat WHERE event_role='processor_shadow'` for that processor + window)
  - `fee_amount` numeric(14,2) NOT NULL — MDR / commission ex-VAT
  - `fee_vat_amount` numeric(14,2) — input VAT recoverable on the fee, ONLY when processor TI captured
  - `net_payout` numeric(14,2) NOT NULL — what hits the bank
  - `processor_tax_invoice_document_id` uuid — FK to `documents` (the processor's full TI for the fee — required to claim `fee_vat_amount` per §2.4)
  - `processor_ti_received_at` timestamptz
  - `processor_ti_number` text
  - `bank_transaction_id` uuid — FK to `transactions` once matched
  - `payload` jsonb — raw settlement report
  - `reconciliation_status` text NOT NULL DEFAULT 'unreconciled' — `unreconciled`, `reconciled`, `discrepancy`
  - `reconciliation_discrepancy` numeric(14,2) — non-zero when sum of shadow rows doesn't match `gross_amount`
  - `created_at`, `updated_at`
  - Unique on `(org_id, processor, external_id)`
  - Check: `fee_vat_amount > 0 → processor_tax_invoice_document_id IS NOT NULL`

#### New: cash deposit tracking
- [ ] New table `cash_deposits`:
  - `id uuid PK`
  - `org_id uuid NOT NULL`
  - `establishment_id uuid NOT NULL` — which branch's drawer
  - `deposit_slip_document_id` uuid — FK to `documents` (the OCR'd slip image)
  - `deposited_at` date NOT NULL
  - `deposited_by` text — staff name from the slip
  - `bank_account_id` uuid — FK to `bank_accounts`
  - `amount` numeric(14,2) NOT NULL
  - `slip_reference` text — bank reference number on the slip
  - `bank_transaction_id` uuid — FK once matched to a bank statement deposit
  - `pos_cash_period_start`, `pos_cash_period_end` date — POS cash period this deposit covers
  - `cash_variance` numeric(14,2) — POS cash sales − refunds − this deposit (over/short)
  - `variance_resolution_status` text DEFAULT 'open' — `open`, `accepted`, `disputed`, `written_off`
  - `created_at`, `updated_at`

#### Channel tracker view
- [ ] Materialized or live view `channel_balances`:
  - Group `sales_transactions WHERE event_role='pos_primary'` by `(org_id, establishment_id, clearing_account_key)` where `settlement_status IN ('pending', 'aged_unsettled')`
  - Sum `amount_including_vat`, oldest `sold_at`, count, expected SLA breach indicator
  - Used by the Money-in-the-pipe dashboard

#### Filing audit primitives (cross-cutting)
Apply to existing `vat_records` (PP 30) and existing `wht_filings` AND any new filing tables:

- [ ] Add to `vat_records`:
  - `is_amendment` boolean DEFAULT false
  - `amends_filing_id` uuid — FK to the original filing being amended
  - `amendment_reason` text
  - `pp30_data_source` text NOT NULL DEFAULT 'bank_derived' — `bank_derived` (legacy), `pos_derived` (new), `hybrid` during cutover
  - `rd_reference_number` text
  - `confirmation_document_id` uuid — FK to `documents` storing the RD-issued acceptance receipt
  - **No `period_locked` boolean** — round-4 removed legacy boolean. Lock state lives in shared `period_locks` table (`domain='vat'`). Trigger on `vat_records` blocks mutations on locked periods unless `app.lock_override_user_id` is set. See `docs/_ai_context/period-lock-protocol.md`.
  - `voluntary_amendment_penalty_pct` numeric(5,4) — 0.02 / 0.05 / 0.10 / 0.20 per §8.1 lookup
  - `surcharge_amount` numeric(14,2) — 1.5%/month from due date, capped at tax amount per §8.1

- [ ] Same five amendment fields (`is_amendment`, `amends_filing_id`, `amendment_reason`, `rd_reference_number`, `confirmation_document_id`) added to all other filing tables (existing + new).

### Connectors

**Priority re-shuffled per Opus + Codex review.** API access requires merchant onboarding cycles (5+ business days, often 2-4 weeks for Thai processors); CSV path de-risks v1 entirely.

#### Priority 1 (de-risk v1): generic CSV + Ksher CSV/PDF
- [ ] Generic POS CSV importer with column-mapping UI under `src/app/(app)/sales/import/csv/`. Auto-detect header rows for ZORT / FlowAccount / common Thai POS exports. Maps to `sales_transactions` with `event_role='pos_primary'`.
- [ ] Ksher transaction-list CSV importer. Maps to `sales_transactions` with `event_role='processor_shadow'` (Ksher reports the card swipe, not the original sale).
- [ ] Ksher daily settlement CSV importer. Maps to `processor_settlements`.
- [ ] Ksher PDF settlement importer — **not** "reuse existing pipeline" (Codex #7 — settlement PDFs are tabular batch documents structurally different from invoices). Build a dedicated extractor:
  - New extraction schema `src/lib/ai/schemas/processor-settlement.ts` — batch totals + line-item rows with `tx_date`, `tx_type`, `amount`, `fee`, `net`, `card_last4`.
  - New Inngest pipeline branch in `process-document.ts`: `processor_settlement` doc type → run dedicated extractor → upsert `processor_settlements` (batch) + `sales_transactions` shadow rows (lines).
  - Parser-level invariant: `sum(line.net) = batch.gross − batch.fee − batch.fee_vat`. Fail-fast on mismatch with diff surfaced for human review.

#### Priority 2 (API once design partner credentials in hand): ZORT API + BEAM API
- [ ] `src/lib/integrations/zort/` — API client. OAuth or API-key registration under `src/app/(app)/settings/integrations/zort/`. Inngest cron `pull-zort-sales` (hourly): fetch incremental sales, upsert into `sales_transactions` with `event_role='pos_primary'`. Idempotent on `(source='pos:zort', external_id)`. Map ZORT payment-method codes → our `channel` enum. Capture ZORT terminal_id and ZORT branch ID → resolve to our `establishment_id`.
- [ ] `src/lib/integrations/beam/` — API client. Inngest cron `pull-beam-settlements` (daily) → `processor_settlements`. Inngest cron `pull-beam-transactions` (hourly) → `sales_transactions` with `event_role='processor_shadow'` (cross-reference against ZORT/CSV-imported `pos_primary` rows).

#### Priority 3 (deferred): FlowAccount POS API, marketplace + delivery connectors
- [ ] Flag in plan, build only when first design partner needs them.

### Cash deposit slip OCR
- [ ] Extend `src/lib/ai/schemas/` with `cash-deposit-slip.ts` — fields: deposited_at, deposited_by, amount, slip_reference, bank_account_hint.
- [ ] Add slip detection branch in the existing extraction pipeline (Phase 3 `process-document.ts`): new doc type `cash_deposit_slip`.
- [ ] On extraction success, create a `cash_deposits` row linked to the document.
- [ ] Reconciliation hook: try to match `cash_deposits.amount` + `deposited_at` to a bank deposit transaction (Phase 4 reconciliation cascade gets a new layer "cash deposit slip").
- [ ] Cash variance computation: every Sunday (or month-end), sum POS cash sales − refunds − cash deposits in the period; surface variance per period in the channel tracker.

### Mandatory §87 monthly reports (Codex finding #5 — was missing)

Three reports are mandatory under Revenue Code §87 and `vat-info.md` §2.6. Output report alone is incomplete.

- [ ] **Output tax report (รายงานภาษีขาย)** — `src/lib/tax/output-tax-report.ts`:
  - `buildOutputTaxReport(orgId, establishmentId, taxMonth)` — pulls `sales_transactions WHERE event_role='pos_primary' AND establishment_id=...` for the tax month, applies credit notes, daily ABB roll-up under §86/6.
  - Returns: per-day totals, ABB aggregate, full TI list, credit notes, total output VAT.
  - Output: HTML table + downloadable Excel/CSV (RD-compliant layout).

- [ ] **Input tax report (รายงานภาษีซื้อ)** — `src/lib/tax/input-tax-report.ts`:
  - `buildInputTaxReport(orgId, establishmentId, taxMonth)` — pulls qualifying `documents` (full TI in buyer's name with all §2.4 required fields) + `processor_settlements.fee_vat_amount` (where processor TI captured) + PP 36 reclaims **with `reclaim_status='eligible_for_reclaim'` AND `pp36_paid_at <= taxMonth end`** (Phase 9 linkage; round-4 reclaim-gating fix).
  - Surfaces non-recoverable items separately (ABBs from suppliers, missing TIN, >6-months-old without override).
  - Output: HTML + Excel/CSV (RD-compliant layout).

- [ ] **Goods & raw materials report (รายงานสินค้าและวัตถุดิบ)** — `src/lib/tax/inventory-movement-report.ts`:
  - Tracks inventory in/out per tax month per `establishment_id`.
  - Source: existing `documents` (purchase receipts → in) + `sales_transactions` line items where available (out).
  - For tenants without per-item POS line items, surface as "limited data — manual reconciliation required" placeholder.
  - First-pass: minimum viable — capture totals; full per-SKU tracking deferred until tenant demand.

- [ ] **PP 30 reconciliation harness** — every PP 30 generation runs invariants:
  - `sum(output_tax_report.vat) = pp30.output_vat_line`
  - `sum(input_tax_report.vat) = pp30.input_vat_line`
  - Discrepancy → block submission, surface diff for human review.

### PP 30 generator

- [ ] New module `src/lib/tax/pp30-from-sales.ts`:
  - Reads `sales_transactions WHERE event_role='pos_primary' AND establishment_id=... AND sold_at IN tax_month`.
  - Groups by `establishment_id` per §2.6 one-PP30-per-place-of-business rule (consolidation flag overrides this when on file).
  - Output VAT = `sum(vat_amount) − sum(credit_note vat_amounts in this month)`.
  - Input VAT = output of `buildInputTaxReport` for the same period.
  - Net = output − input (or carry-forward / cash refund per §2.4).

### Reconciliation invariants (Codex review #2)

`vat-info.md` §5.3 lists 8 invariants. Phase 10 owns the following; rest are tracked across phases:

- [ ] Inv1 (output VAT = sum of TI VAT) — `pp30-from-sales.ts` reconciliation harness
- [ ] Inv2 (input VAT tied to supplier TIs) — `buildInputTaxReport` qualification check
- [ ] Inv3 (PP 30 net = output − input) — generator math
- [ ] Inv4 (input tax tied to payment) — Phase 10 ADDS: `documents.payment_transaction_id` linkage check; surface unpaid input claims on input tax report
- [ ] Inv6 (credit notes reduce output, not offset as payments) — enforced by `credit_note_for_id` schema + report query
- [ ] Inv7 (bank balance ties to filed positions) — Phase 10 ADDS: month-end ledger snapshot vs bank statement closing balance, aged reconciling items
- [ ] Inv5, Inv8 — owned by Phase 9 (PP 36) and Phases 5/11 (WHT) respectively

CI test matrix: one test per invariant. Failing invariant blocks the period close.

### UI: Money-in-the-pipe dashboard

- [ ] New page `src/app/(app)/sales/channels/page.tsx`:
  - One card per channel per establishment (cash, card terminal, QR machine, marketplace, delivery).
  - Shows: today's sales, pending settlement (฿X owed by BEAM, settling Friday), oldest pending (red flag if past SLA), cash variance for the week.
  - Owner-friendly framing — never use the term "clearing account". Use "Money in the pipe", "Pending settlement", "Bank arrived".
  - Aged unsettled (`settlement_status='aged_unsettled'`): explicit owner action — `Mark received late`, `Dispute`, `Write off` — each writes to `audit_log`.
- [ ] Sales register page `src/app/(app)/sales/page.tsx`:
  - Filter by date / branch / channel / settlement status.
  - Drill into a sale → show linked processor settlement + linked bank transaction (the full chain).
  - When `superseded_by_id IS NOT NULL`, show "upgraded to full TI #..." with link.
- [ ] Cash deposits page `src/app/(app)/sales/cash-deposits/page.tsx`:
  - List of slips, amounts, who deposited, bank arrival status, variance vs POS cash for the period.
- [ ] §87 reports page `src/app/(app)/tax/reports/page.tsx`:
  - Three tabs: output / input / inventory. Per-month, per-establishment. Export CSV / Excel.

### Settings / configuration

- [ ] `src/app/(app)/settings/establishments/page.tsx`:
  - Manage branches: add, edit, mark head office, store DG approval evidence for consolidated filing.
- [ ] `src/app/(app)/settings/sales-channels/page.tsx`:
  - Configure channels per terminal (e.g. "Counter 1 at Branch 00001: cash + BEAM card + Ksher QR").
  - Per-terminal ABB approval document upload + approval date (§2.5 §86/6 requirement) — stored in the dedicated `abb_approvals` table per the hardening section below. (The earlier `establishments.abb_approvals` jsonb design was replaced; this UI references the table.)
  - Per-channel SLA expectations (BEAM: T+2; Ksher: T+1; cash: deposit within 3 days).
  - Per-tenant tip/service-charge VAT treatment toggle (§5.4).

### Migration hardening (Phase 10 Week 4 cutover)

The PP 30 data-source switch is **not optional**. Without migration, tenants who started filing under bank-derived numbers stay non-compliant.

- [ ] **Mandatory dual-write period (≥1 full tax month per org).** During this window, both bank-derived and POS-derived PP 30 are computed. The active filing source is `pp30_data_source='hybrid'` (bank-derived remains authoritative; POS-derived is shadow).
- [ ] **Delta surface.** For each shadow PP 30, show the exact ฿ delta vs the bank-derived equivalent. Categorize: under-reported output VAT (most common), over-reported input VAT, etc.
- [ ] **Surcharge + penalty estimator.** For each historical month with a non-zero delta:
  - Compute surcharge: 1.5% × months-late × delta (capped at delta per §8.1).
  - Compute voluntary-amendment penalty per §8.1 schedule: 2% / 5% / 10% / 20% by lateness.
  - Show total exposure: surcharge + penalty + delta.
- [ ] **Owner sign-off.** Cutover from `bank_derived` → `pos_derived` requires explicit owner approval (modal with full delta + exposure + legal acknowledgement). Sign-off written to `audit_log` with `actor_user_id`, IP, timestamp, snapshot of delta.
- [ ] **PP 30 ก amendment packet generator.** For each historical month with non-zero delta, generate the formal PP 30 ก amendment filing (additional return) ready for RD submission. Owner files; system tracks `vat_records.is_amendment=true`, links to original.
- [ ] **Period lock.** After cutover and any historical amendments file, insert `period_locks` rows for each closed period with `domain='vat'`, `lock_reason='vat_filed'` (one per `(org_id, establishment_id, year, month)`). The shared trigger on `vat_records`, `documents`, and `sales_transactions` blocks mutations on those periods unless `app.lock_override_user_id` is set via the unlock workflow. See `docs/_ai_context/period-lock-protocol.md`.
- [ ] **Legal acknowledgement banner.** "Switching the PP 30 data source recomputes historical numbers. Discrepancies vs filed returns may require voluntary amendments under Revenue Code §8.1. Recommended: consult Thai CPA before cutover." Surfaced in cutover flow.

## Approach

### Sequencing (revised after review)

**Week 1 — Schema + establishment + generic CSV importer**
1. Migrations: `establishments`, `sales_transactions`, `processor_settlements`, `cash_deposits`, `voucher_sales`, amendment fields on existing filing tables, `channel_balances` view.
2. Backfill `establishments` row per existing org (head office, branch_number='00000').
3. Generic POS CSV importer (priority 1).
4. Bare-bones sales register page (read-only list, filter by branch).

**Week 2 — Ksher CSV/PDF + reconciliation Layer A**
1. Ksher CSV transaction + settlement importers.
2. Ksher PDF settlement extractor (dedicated schema, batch reconciliation invariant).
3. Reconciliation Layer A: `event_role='pos_primary'` row ↔ `event_role='processor_shadow'` row (match by amount + timestamp + last-4 of card if available).

**Week 3 — Cash deposit OCR + ZORT API**
1. Extend extraction pipeline with `cash_deposit_slip` document type.
2. `cash_deposits` table populated from OCR.
3. Reconciliation Layer C: slip ↔ bank deposit.
4. Cash variance computation cron.
5. ZORT API client (priority 2, only if credentials in hand for design partner; otherwise hold).

**Week 4 — §87 reports + PP 30 from POS (NOT yet authoritative)**
1. `buildOutputTaxReport`, `buildInputTaxReport`, `buildInventoryMovementReport`.
2. PP 30 reconciliation harness.
3. `pp30-from-sales.ts` as **shadow** computation; `pp30_data_source='bank_derived'` remains authoritative.
4. Dual-write surfacing: every PP 30 page shows both numbers + delta.
5. Money-in-the-pipe dashboard.
6. Sales channel + establishment settings.

**Week 5 — Migration hardening + first cutover (NON-INVENTORY tenants only)**
1. Surcharge + penalty estimator.
2. PP 30 ก amendment packet generator.
3. Owner sign-off flow + audit log.
4. Period-lock enforcement.
5. First **non-inventory** org cutover (e.g. service-only design partner) — full migration with sign-off.
6. Aged-pending alerts (channel SLA breach → email).
7. CSV export of all three §87 reports matching RD layouts. **Inventory report is placeholder** (totals-only, "manual reconciliation required") — service tenants don't carry inventory so this is acceptable.

**Inventory tenants (e.g. Lumera) are blocked from PP 30 cutover until Phase 10.6 ships the per-SKU §87 inventory report.** Round-4 review found that filing PP 30 without §87(3) per-SKU inventory data violates the Revenue Code requirement; Phase 10's "totals-only" placeholder is fine for service tenants but not for goods tenants.

**Cutover gate (DB-enforced):**
- `vat_records` BEFORE INSERT trigger: if `pp30_data_source='pos_derived'` AND the org has any `skus` rows AND Phase 10.6's §87 inventory report module is not flagged ready (config `tenant_capabilities.has_full_sku_report=true`) → reject with explicit error.
- Lumera and other goods tenants stay on `bank_derived` until 10.6 ships.

**Week 6+ — BEAM API + connector long tail + inventory-tenant cutover (after 10.6)**

- Once Week 5 stable, ship BEAM API integration. FlowAccount POS, marketplace, delivery on demand.
- Once Phase 10.6 ships, run inventory-tenant cutover (Lumera) with full per-SKU §87(3) report.

### Edge case matrix (vat-info.md §5.4 — Codex finding #3)

Each row has a schema/code path; this is the verification checklist:

| Edge case | Handled by |
|---|---|
| 31 March 23:55 sale settles 1 April 02:00 | `sold_at` (POS) drives VAT month, not settlement; index supports |
| ABB → full TI mid-transaction upgrade | `superseded_by_id` self-FK; original row counted-once via `superseded_by_id IS NULL` filter |
| Tip / service charge | `tip_amount` field + per-tenant `tip_vat_treatment` setting |
| Deemed supply (staff meal, gift, sample) §77/1(8) | `is_deemed_supply` + `deemed_supply_basis`; tax_base set to market value |
| Cross-session refund | Credit note as new `sales_transactions` row with `credit_note_for_id` reference; original TI/ABB reference stored |
| Lost ABB / printer fault | `voided_at` + `void_reason`; serial gap auto-detected by `(terminal_id, tax_invoice_number)` sequence check; flagged in output tax report |
| Foreign currency sale | `original_currency` + `fx_rate` + `fx_source='BOT_reference'` |
| Vendor-funded vs third-party-funded discount | `discount_funded_by`; vendor reduces tax_base, third_party does not |
| Gift card / pre-paid voucher | `voucher_sales` table (deferred liability); VAT recognized only at redemption (`sales_transactions.is_voucher_redemption=true`) |
| B2B credit sale | `channel='b2b_credit'`; `sold_at` drives VAT month regardless of payment timing per §2.2; settlement_status remains pending until paid |

### Dependencies and integration points

- **Phase 3 (extraction pipeline)** — cash deposit slips + Ksher PDF settlements both add new doc types to the existing classification → extraction pipeline. Settlement schema is dedicated, NOT a reuse of invoice schema (Codex #7).
- **Phase 4 (reconciliation)** — new layers (A: POS↔processor, C: slip↔bank) added to the matcher cascade; existing 7 layers untouched.
- **Phase 6 (VAT/PP 30)** — `vat_records.pp30_data_source` field added; existing bank-derived path preserved during dual-write; cutover per-org. Existing `vat_records.period_locked` enforces post-cutover immutability.
- **Phase 8 (extraction learning)** — applies to cash deposit slip extraction the same way it applies to invoices. Vendor concept is replaced by "bank account" or "depositor" for tier promotion. Probably defer learning loop on slips until volumes warrant.
- **Phase 9 (foreign-vendor tax)** — independent; POS data is sales-side; Phase 9 is purchase-side. They share no code. Both add amendment fields to filing tables — coordinate the migration.

## Critical files

To be created:
- `src/lib/db/schema.ts` — extend with all new tables + amendment fields on existing
- `src/lib/integrations/ksher/{csv-parser,pdf-importer}.ts`
- `src/lib/integrations/zort/{client,parser,ingest}.ts` (priority 2)
- `src/lib/integrations/beam/{client,parser,ingest}.ts` (Week 6+)
- `src/lib/inngest/functions/pull-zort-sales.ts` (priority 2)
- `src/lib/inngest/functions/pull-beam-settlements.ts` (Week 6+)
- `src/lib/inngest/functions/pull-beam-transactions.ts` (Week 6+)
- `src/lib/tax/output-tax-report.ts`
- `src/lib/tax/input-tax-report.ts`
- `src/lib/tax/inventory-movement-report.ts`
- `src/lib/tax/pp30-from-sales.ts`
- `src/lib/tax/pp30-amendment-generator.ts` (Week 5)
- `src/lib/tax/pp30-migration-estimator.ts` (Week 5)
- `src/lib/reconciliation/sales-cascade.ts` (Layers A, C)
- `src/lib/ai/schemas/cash-deposit-slip.ts`
- `src/lib/ai/schemas/processor-settlement.ts` (Ksher PDF — dedicated, NOT reusing invoice schema)
- `src/lib/db/queries/establishments.ts`
- `src/lib/db/queries/sales-transactions.ts`
- `src/lib/db/queries/processor-settlements.ts`
- `src/lib/db/queries/cash-deposits.ts`
- `src/lib/db/queries/voucher-sales.ts`
- `src/app/(app)/sales/page.tsx`, `channels/page.tsx`, `cash-deposits/page.tsx`, `import/csv/page.tsx`, `import/ksher/page.tsx`
- `src/app/(app)/tax/reports/page.tsx` (three §87 reports)
- `src/app/(app)/settings/establishments/page.tsx`
- `src/app/(app)/settings/sales-channels/page.tsx`

To be edited:
- `src/lib/inngest/functions/process-document.ts` — add `cash_deposit_slip` and `processor_settlement` branches
- `src/lib/reconciliation/matcher.ts` — register new layers
- `src/lib/tax/pp30.ts` (existing) — add `pp30_data_source` aware path; preserve bank-derived during dual-write
- `src/app/(app)/dashboard/page.tsx` — surface channel tracker summary
- `CLAUDE.md` — add Context Map rows for new modules

## Verification

- [ ] `sales_transactions` ingestion idempotent: re-running ZORT pull does not duplicate rows (proved by `(org_id, source, external_id)` unique).
- [ ] Serial uniqueness: two `sales_transactions` rows with same `(establishment_id, terminal_id, tax_invoice_number)` and `superseded_by_id IS NULL` → DB rejects.
- [ ] ABB → full TI upgrade: original row marked `superseded_by_id`; PP 30 sees only the upgraded row.
- [ ] Multi-branch: org with two establishments → two separate PP 30 outputs unless `consolidated_filing_approved=true`.
- [ ] Double-count guard: ingesting a card sale via ZORT (`pos_primary`) AND BEAM (`processor_shadow`) → PP 30 sums only `pos_primary` row's `vat_amount`. Verified by SQL: `SELECT sum(vat_amount) FROM sales_transactions WHERE event_role='pos_primary'` matches PP 30 output line; processor shadow rows reconcile to processor settlement totals separately.
- [ ] `pp30-from-sales.ts` for a sample tax month: total output VAT = sum of POS gross × rate (NOT bank-derived revenue × rate).
- [ ] Reconciliation harness: synthetic mismatch (output report sum ≠ PP 30 line) → block period close.
- [ ] Channel-tracker page: a known unsettled card sale shows up in the BEAM card pipe with "settling T+2" status; after a synthetic settlement, the sale flips to settled and the channel balance drops.
- [ ] Aged unsettled: synthetic SLA breach → owner sees "Mark received late / Dispute / Write off" actions; each logs to `audit_log`.
- [ ] Cash deposit slip OCR: upload a real slip → `cash_deposits` row created → matched to bank deposit transaction.
- [ ] Cash variance: synthetic week of POS cash sales ฿10,000, slip deposit ฿9,500 → variance ฿500 surfaced.
- [ ] Sale on 31 March 23:55 + processor settlement on 1 April 02:00 → sale belongs in March PP 30 (and March output tax report), settlement belongs in April reconciliation.
- [ ] Card sale ฿1,070 with 2% MDR + 7% VAT on fee:
  - `sales_transactions.amount_including_vat = 1070`, `tax_base_ex_vat = 1000`, `vat_amount = 70`, `pricing_mode='vat_inclusive'`
  - `processor_settlements.fee_amount = 21.40`, `fee_vat_amount = 1.50`, `net_payout = 1047.10`, `processor_tax_invoice_document_id` populated
  - PP 30 output VAT: ฿70 (NOT ฿68.50 derived from net).
  - Input VAT recoverable on processor fee: ฿1.50, requires Thai TI from BEAM (FK enforced).
- [ ] Refund: cross-session refund creates a `sales_transactions` row with `credit_note_for_id` pointing to original; PP 30 of refund month reflects negative output VAT; original TI/ABB reference stored.
- [ ] Voucher sold 15 March, redeemed 5 April: `voucher_sales` row at sale; `sales_transactions` with `is_voucher_redemption=true` at redemption; PP 30 output VAT counted only in April.
- [ ] Deemed supply: staff meal recorded → `is_deemed_supply=true`, `deemed_supply_basis='staff_benefit'`; tax_base = market value; surfaces in output tax report under "deemed supply" section.
- [ ] FX sale: USD $30 sale on a day with BOT rate 35.50 → `original_currency='USD'`, `fx_rate=35.50`, `fx_source='BOT_reference'`, `tax_base_ex_vat=995.33`, `vat_amount=69.67`.
- [ ] Discount: vendor-funded ฿100 discount on ฿1,070 sale → `tax_base_ex_vat = 906.54` (1000 − 100 + reduction); third-party-funded same discount → `tax_base_ex_vat = 1000` (no reduction).
- [ ] Migration hardening:
  - Org with 6 prior bank-derived PP 30s, switching to POS-derived: estimator surfaces total delta + surcharge + voluntary-amendment penalty per §8.1 schedule.
  - Owner cannot flip `pp30_data_source='pos_derived'` without sign-off; sign-off logged to `audit_log` with snapshot.
  - PP 30 ก amendment packets generated per affected month, downloadable, marked `is_amendment=true` with `amends_filing_id`.
  - After cutover, prior-month POS data edits blocked via `period_locks` trigger (domain `vat`); attempting to UPDATE a locked-month `sales_transactions` or `documents` row raises Postgres exception unless unlock workflow runs.
- [ ] §87 reports: output / input / inventory all generated for a sample month; each ties to PP 30 line items per Inv1, Inv2, Inv3, Inv4.
- [ ] All DB queries include `org_id` scoping; cross-tenant test passes (org A data invisible to org B).

## Risks

- **Connector access stalls.** ZORT and BEAM API access requires merchant onboarding cycles — mitigated by promoting CSV/PDF to priority 1.
- **Owner confusion: "Where's my money?"** Money-in-the-pipe dashboard must answer literally: "Today's cash: ฿15k. ฿12k sitting at BEAM, settling Friday. ฿3k in the cash drawer waiting for tomorrow's deposit."
- **Migration of existing orgs.** No longer optional — see Migration hardening §. Lumera's first cutover is the proving ground; if surcharge exposure is large, may delay rollout to other orgs until reviewed by Thai CPA.
- **POS data quality.** ZORT export may include voids, miss late-day transactions. Shadow validation against processor totals catches the worst offenders. Reconciliation discrepancy threshold + alert on `processor_settlements.reconciliation_discrepancy != 0`.
- **Storage growth.** Retail tenant doing 200 transactions/day × 365 days = 73k rows/year. Manageable in Neon; partition `sales_transactions` by month when a tenant exceeds 1M rows.
- **Schema migration touches existing filing tables.** Amendment fields land on `vat_records` and `wht_filings`. Backfill: existing rows get `is_amendment=false`, NULL for amends_filing_id, no surcharge/penalty (clean slate). Coordinate Phase 9 + Phase 10 + Phase 11 migrations to land amendment fields once.
- **§87 inventory report under-spec for tenants without per-SKU POS data.** First-pass produces totals + "manual reconciliation required" placeholder. Full per-SKU tracking is a separate product surface (defer until tenant demand).

## Open questions

- **First design partner.** Which Lumera company runs retail with POS + processors? Anchors which connector to ship in priority 2 (ZORT vs FlowAccount POS).
- **Tip/service charge VAT default.** Per-tenant configurable per §5.4. F&B tenants typically VAT-applicable; retail typically out-of-scope. Default OFF (out of scope) to avoid silent over-collection.
- **Marketplace handling (Shopee, Lazada).** Tax point at fulfillment per §5.2. Treat as a separate `source` with order-level tax-point timing? Defer until tenant signs.
- **Delivery platforms (Grab, Lineman, Foodpanda).** Out of v1 scope; ship alongside if F&B tenant signs.
- **e-Tax Invoice / e-Receipt registration.** If a tenant is e-TI registered, the system should issue digital TIs from the platform side instead of relying on POS-side ABBs. `tax_invoice_type='e_tax_invoice'` reserved in schema. Defer issuance flow to a later sub-phase.
- **Audit log: read events.** Today `audit_log` captures mutations only. Either expand to include `action='read'` for sensitive entities (employee records, sales_transactions per-row drill-down) or add a separate `pii_access_log`. Decide before Phase 11 ships.

---

## Post-CPA-review hardening (added 2026-04-26)

### ABB DG approval mandatory (not advisory)

§2.5 requires Director-General approval for every cash register issuing ABBs. Today's plan stored this in `establishments.abb_approvals` as advisory metadata. Hardened:

- [ ] New table `abb_approvals`:
  - `id uuid PK`
  - `org_id uuid NOT NULL`
  - `establishment_id uuid NOT NULL`
  - `terminal_id text NOT NULL`
  - `dg_approval_document_id uuid` — FK to `documents` (uploaded approval letter)
  - `approval_date date NOT NULL`
  - `approval_reference text NOT NULL` — DG announcement number
  - `effective_from date NOT NULL`
  - `effective_to date` — null for ongoing
  - `notes text`
  - Unique on `(org_id, establishment_id, terminal_id, effective_from)`
- [ ] Validation at `sales_transactions` insert: if `tax_invoice_type='abb'` AND no active `abb_approvals` row for `(establishment_id, terminal_id, sold_at)` → reject with actionable error.
- [ ] Onboarding flow: tenant cannot enable a POS terminal for ABB issuance without uploading approval evidence.

### Document subclass for tax invoice type (P1-4 from today-gap)

Already covered in `today-gap-remediation.md` P1-4 — landed before Phase 10. Phase 10 builds on it: `sales_transactions.tax_invoice_type` enum aligns with `documents.tax_invoice_subtype`.

### Terminal serial gap detection

§7.1 invariant: ABB and full-TI serials sequential per terminal. Plan enforces uniqueness; gap detection adds:

- [ ] New view `tax_invoice_serial_audit`:
  - Per `(establishment_id, terminal_id, year)`: list expected serial sequence vs actual.
  - Surfaces gaps (issued #100, #102 but not #101 → flag).
  - Output tax report exports include the gap audit.
- [ ] Inngest cron `audit-tax-invoice-serials` (daily): scans recent terminal output, alerts on gaps unresolved 7+ days.
- [ ] Resolution UI: each gap requires explanation (`voided`, `lost`, `printer_fault`) + audit trail.

### Silent-drop exception queue

Already covered in `today-gap-remediation.md` P1-3. Phase 10 wires into:
- Unmatched POS sales (no processor shadow within SLA window).
- Unmatched processor settlements (no bank deposit).
- Unmatched cash deposit slips.
- POS data with reconciliation discrepancy `processor_settlements.reconciliation_discrepancy != 0`.

### Taxability classification on sales_transactions

In addition to existing `vat_rate` field, add explicit classification (drives PP 30 reporting):

- [ ] `sales_transactions.taxability` text NOT NULL — `taxable_7pct`, `taxable_other_rate` (catch for future rate changes), `zero_rated_export`, `vat_exempt`, `out_of_scope`. PP 30 sums per category for the new revised PP 30 form layout (effective 2026-03-01).

### GL posting integration (Phase 10.5)

When Phase 10.5 ships, every `sales_transactions WHERE event_role='pos_primary'` row creates a journal entry per the posting rules in `phase-10-5-gl-primitives.md`. Backfill: post historical sales when 10.5 deploys.

Cash/card/voucher posting rule is fixed here to avoid the stale all-`1142` pattern:

- `channel='cash'` sale: debit `1110 Cash on hand`.
- card / QR / marketplace / delivery processor sale: debit `1142 Processor / marketplace settlement receivable` with typed `channel_key` / `processor_key`.
- `is_voucher_redemption=true`: debit `2160 Customer deposits & gift vouchers` for the redeemed value, then recognize revenue/VAT at redemption. Voucher sale itself credits `2160` and does not enter PP 30 output VAT until redemption.

### Updated sequencing

Insert today-gap remediation as Week 0 prerequisite:

**Week 0 (pre-Phase-10) — Today-gap remediation lands.** P0 + P1 items shipped. Lumera amendment packets generated for any historical mis-filings.

(Original Weeks 1-6 unchanged.)

**Week 7+ — GL integration.** Phase 10.5 ships; Phase 10 backfill posts historical sales to GL.
