# Plan: Phase 8.5 — VAT Operations Ledger

**Status:** Completed 2026-05-16 — created 2026-05-14 after FlowAccount workflow review
**Completion evidence:** Final gate passed on 2026-05-16: `pnpm tsc --noEmit`; VAT ledger DB schema/query tests; VAT actions, full export, foreign-vendor tax, WHT certificate, and today-gap dependent tests; `pnpm test:e2e e2e/tax/vat.spec.ts`. Runtime `vat_records` path removed; remaining references are historical/legacy notes only.
**2026-05-15 cutover note:** Phase 8.5 now uses a clean ledger cutover. The app is not live, so no legacy `vat_records` backfill, dual-read gate, staged migration, schema model, export, or active workflow is required.
**Depends on:** Hardened baseline, Phase 6 VAT reporting, Phase 7 reconciliation, Phase 8 corrective extraction scaffolding
**Blocks:** Phase 9 foreign-vendor tax, Phase 10 POS/section 87 reports, Phase 10.5 GL settlement postings
**Priority:** Critical monthly compliance spine

## Problem

The current platform treats VAT mainly as a report output. That is not enough for Thailand.

Thai VAT is a monthly operational workflow. Each bank transaction, document, vendor/customer, tax invoice, WHT certificate, VAT claim, PP30 filing, PP36 filing, payment, and later correction must be traceable. If a filed VAT number is wrong, the customer faces late filing fees, adjustment filings, penalties, interest, lost input VAT claims, and bad cash-flow planning.

The previous VAT model used `documents.vat_period_year/month` and a monthly rollup. That could summarize a period, but it could not safely answer:

- Which exact source documents were included in the filed PP30 for April 2026?
- Which input VAT items were eligible but held for later?
- Which input VAT items are near six-month expiry?
- Which items were deliberately marked "do not claim"?
- Which PP36 obligations were declared in the correct payment/expense month?
- Which PP36 payments later became eligible for PP30 reclaim?
- Which bank transaction paid a PP30/PP36 filing?
- What is the amendment path when a document already included in a filing is wrong?

FlowAccount's UI confirms this is a first-class workflow: Manage Purchase VAT has document-level states such as Awaiting, To be submitted, and Do not claim; Monthly Tax Filings tracks PP30/PP36 ordinary/additional filings and payment state; input/output tax reports are generated views over filing state.

Thai operator feedback added 2026-05-15 sharpened the product gap: FlowAccount has filing workflow steps, but does not make the PP36-paid-to-PP30-reclaim planning loop visible enough, and does not let users easily see which source expense was included in which tax form after submission. This phase must therefore treat VAT as a control surface, not only as ledger tables.

This phase turns VAT into an item-level operations ledger with hard links, immutable filing snapshots, and cash-flow projection.

## Legal/Plan Boundary

This plan supersedes the VAT architecture assumptions in completed `phase-6-vat-reporting.md` where they conflict with this document.

Critical corrections:

- Monthly VAT rollups are not authoritative filing sources after this phase.
- Phase 6 said PP36 reverse charge is never reclaimable. That is no longer the product model. Phase 8.5 treats PP36 as a separate self-assessment/payment workflow that can later create PP30 input-VAT reclaim eligibility only after remittance is recorded.
- Phase 6 document-period fields remain useful review hints during migration, but filed numbers must come from VAT item ledgers and frozen filing lines.
- Product v1 uses the normal six-month PP30 input VAT claim window. Longer exceptional/necessary-cause treatments are deferred unless CPA review explicitly reopens them.

Legal facts still require CPA sign-off before implementation. Until confirmed, store rule metadata and source dates explicitly rather than baking unreviewable assumptions into code.

## MVP Branch Scope

Most new tables include nullable `establishment_id` because Thai VAT can become branch/establishment-sensitive. The current app has organization-level branch metadata but no full `establishments` table.

For Phase 8.5:

- Single-establishment MVP is allowed.
- `establishment_id` stays nullable and must be null for the MVP unless an `establishments` table is added in the same slice.
- All unique indexes must treat null establishment consistently with org-wide filing, using the same sentinel pattern as `period_locks`.
- Multi-branch consolidated filing is deferred, but adding branch support later must not require rewriting filed VAT snapshots.

## Design Principles

1. **VAT filings are snapshots, not live reports.**
   Once a PP30 or PP36 filing is filed, the filing lines and amounts are frozen. Later corrections create amendment/reversal records.

2. **Documents are evidence, not the VAT source of truth after allocation.**
   A document can create VAT ledger items, but filed VAT must read from allocation tables and filing lines, not from a live scan of `documents`.

3. **PP30 and PP36 are separate workflows.**
   PP30 input VAT can be claimed within the six-month claim window. PP36 foreign-service VAT must be declared for the month it occurred/was paid and cannot be carried later.

4. **Oldest eligible PP30 input VAT is the default.**
   The default build for a PP30 draft claims oldest eligible VAT first, with user/accountant ability to hold or mark do-not-claim.

5. **Every filed number traces back to evidence.**
   Filing line -> VAT ledger item -> document line -> document -> vendor/customer -> reconciliation match -> bank transaction where available.

6. **No silent mutation after filing.**
   Deleting, editing, or reclassifying source records that are bound to filed VAT must be blocked or routed through explicit amendment/reversal.

7. **VAT is also cash-flow planning.**
   The app should project VAT payable/refundable, expiring input VAT, PP36 cash outflows, and later PP30 reclaim opportunities.

8. **PP36 reclaim planning is a user-facing workflow.**
   After PP36 is paid/remitted, the resulting future PP30 reclaim must appear in a planning queue with eligible month, expiry month, linked source expenses, linked PP36 filing/payment evidence, and planned/actual PP30 consumption.

9. **Unclaimed input VAT and filed VAT credits are different ledgers.**
   Unclaimed purchase VAT remains item-level and can expire. A filed PP30 net credit is a filing-level carryforward balance and must not be confused with unclaimed tax invoices waiting to be claimed.

10. **Every source link is tenant-checked at the database boundary.**
   Any row that references a document, document line, transaction, reconciliation match, vendor/customer, filing, or payment event must prove the referenced row has the same `org_id`. App checks are useful UX only; DB constraints/triggers are the guardrail.

## Current Baseline Gap

Current model:

- `documents.vat_period_year/month` stores one selected VAT period.
- `documents.is_pp36_subject` flags possible PP36 relevance.
- A monthly rollup stored output VAT, input VAT PP30, PP36 reverse charge, and statuses.
- `period_locks` can lock VAT domains, but source mutation risk remains if source documents change after filing.

Primary gaps:

- No per-document input VAT lifecycle.
- No claim window queue.
- No oldest-first allocation.
- No immutable PP30/PP36 filing line snapshot.
- No PP36 obligation lifecycle tied to payment month, remittance, and later PP30 reclaim.
- No distinction between unclaimed input VAT expiry and filed PP30 credit carryforward.
- No cash-flow projection over unclaimed VAT and upcoming filing payments.
- No robust amendment path.
- No VAT forecasting view that answers "what reclaimable VAT can reduce future PP30, when can it be used, and when does it expire?"
- No filing drilldown that lets a user click from a PP30/PP36 filed number back to every source document and evidence row included in that period.

## Tax Classification Layer

Before VAT items are created, every confirmed document/payment line needs a durable tax-treatment decision. Do not infer VAT behavior directly from a document amount at filing time.

Create or extend a classification artifact with:

- `org_id`
- source document/payment/transaction references
- `treatment_type` such as `local_vat_input`, `local_vat_output`, `not_vatable`, `pp36_foreign_service`, `wht_only`, `mixed`
- evidence fields used to decide the treatment: vendor tax status, country, entity type, tax invoice subtype, words indicating tax invoice, VAT rate, service/goods category, payment date
- `confidence` and `review_status`
- `confirmed_by_user_id`, `confirmed_at`, and `review_reason`

Rules:

- Human/influencer/service payments with WHT but no VAT must become `wht_only` or `not_vatable`, not ambiguous VAT candidates.
- Foreign-service payments that may trigger PP36 must be explicitly classified before creating a `pp36_obligation`.
- Mixed documents can create multiple VAT/WHT items, but filing lines must still trace back to the line-level source and classification decision.
- AI may suggest classification, but user/accountant confirmation is the trust boundary for tax-impacting classification.

## Required Domain Model

### Snapshot and hash contract

Every VAT item and filing line stores a frozen snapshot. Hash drift checks only work if the hashed field set is canonical.

Use SHA-256 over canonical JSON containing at least:

- Document fields: amount/base amount, VAT amount, VAT rate, tax invoice number/date, issue date, document type, direction, tax invoice subtype, PP36 flag, currency, exchange rate, THB amount, VAT period hints, related document id.
- Vendor/customer fields: id, display/name snapshot, tax id, branch number, country, entity type, VAT registration flag where available.
- Line fields: source document line id, description, amount, VAT amount, WHT rate/amount, account code.
- Reconciliation/payment fields when linked: transaction id/date/amount/reference, reconciliation match id, payment id/date/net amount.
- Rule fields: tax classification decision, claim basis date, claim-window rule version, PP36 period basis.

Do not hash volatile fields such as `updated_at`, AI confidence, UI notes, or non-tax labels. Snapshot JSON may contain extra display fields, but the hash input list must remain stable and versioned.

### VAT input items

Create `vat_input_items` as the source of truth for local purchase VAT candidates.

Suggested columns:

- `id uuid PK`
- `org_id uuid NOT NULL`
- `establishment_id uuid NULL`
- `source_document_id uuid NOT NULL`
- `source_document_line_id uuid NULL`
- `source_transaction_id uuid NULL`
- `source_reconciliation_match_id uuid NULL`
- `vendor_id uuid NOT NULL`
- `tax_invoice_no text`
- `tax_invoice_date date`
- `tax_invoice_received_date date`
- `tax_invoice_subtype text NOT NULL`
- `document_date date`
- `payment_date date NULL`
- `base_amount numeric(14,2) NOT NULL`
- `vat_amount numeric(14,2) NOT NULL`
- `vat_rate numeric(5,4) NOT NULL`
- `eligible_period_year integer NOT NULL`
- `eligible_period_month integer NOT NULL`
- `expiry_period_year integer NOT NULL`
- `expiry_period_month integer NOT NULL`
- `claim_period_year integer NULL`
- `claim_period_month integer NULL`
- `claim_basis_date date NOT NULL`
- `claim_window_rule_version text NOT NULL`
- `status text NOT NULL`
- `status_reason text`
- `draft_filing_id uuid NULL`
- `filed_filing_line_id uuid NULL`
- `source_snapshot jsonb NOT NULL`
- `source_snapshot_hash text NOT NULL`
- `created_at`, `updated_at`, `deleted_at`

Status enum:

- `needs_review`
- `not_vatable`
- `awaiting_tax_invoice`
- `claimable`
- `held`
- `do_not_claim`
- `allocated_to_draft`
- `filed`
- `expired`
- `voided_by_amendment`

Rules:

- Claim period must be within the six-month claim window.
- `claim_basis_date` is the date used to compute eligibility/expiry. The default basis must be CPA-confirmed before implementation; likely candidates are tax invoice date or received date. Store the basis and rule version so future corrections are auditable.
- DB constraint or trigger must prevent `claimable`, `allocated_to_draft`, or `filed` status unless `tax_invoice_subtype` is a full/electronic tax invoice subtype accepted by the CPA-reviewed rule set.
- `filed` requires a filing line.
- `allocated_to_draft` requires `draft_filing_id`; releasing/resetting a draft must return still-valid items to `claimable`, `held`, or `expired` based on current rules.
- `do_not_claim`, `held`, and tax-invoice-date overrides require user/accountant reason.
- Full tax invoice completeness must be validated before `claimable`.
- ABB/simplified tax invoice handling must not silently become claimable as full input VAT.

### VAT output items

Create `vat_output_items` for sales/output VAT.

Suggested columns:

- `id uuid PK`
- `org_id uuid NOT NULL`
- `establishment_id uuid NULL`
- `source_document_id uuid NULL`
- `source_document_line_id uuid NULL`
- `source_pos_sale_id uuid NULL`
- `source_transaction_id uuid NULL`
- `customer_id uuid NULL`
- `tax_invoice_no text`
- `tax_invoice_date date NOT NULL`
- `document_date date NOT NULL`
- `tax_point_date date NOT NULL`
- `tax_point_basis text NOT NULL`
- `base_amount numeric(14,2) NOT NULL`
- `vat_amount numeric(14,2) NOT NULL`
- `vat_rate numeric(5,4) NOT NULL`
- `output_period_year integer NOT NULL`
- `output_period_month integer NOT NULL`
- `status text NOT NULL`
- `source_snapshot jsonb NOT NULL`
- `source_snapshot_hash text NOT NULL`
- `created_at`, `updated_at`, `deleted_at`

Status enum:

- `needs_review`
- `reportable`
- `allocated_to_draft`
- `filed`
- `voided_by_credit_note`
- `amended`

Rules:

- Output VAT belongs to its tax point period; no six-month flexibility.
- For v1, if we do not automate Thai tax-point rules for goods/services, the review UI must explicitly capture/confirm `tax_point_date` and `tax_point_basis`. Do not silently assume issue date for every output VAT item.
- Credit/debit notes produce new adjustment items; they do not mutate filed historical output items.
- Credit/debit note adjustment items must reference the original `vat_output_item` or filing line they adjust where available.
- POS output VAT can be added later, but the table must be ready for POS lines as a source.

### PP36 obligations

Create `pp36_obligations` as first-class foreign-service VAT self-assessments.

Suggested columns:

- `id uuid PK`
- `org_id uuid NOT NULL`
- `establishment_id uuid NULL`
- `source_document_id uuid NULL`
- `source_document_line_id uuid NULL`
- `source_payment_transaction_id uuid NULL`
- `source_reconciliation_match_id uuid NULL`
- `vendor_id uuid NOT NULL`
- `vendor_country_code text NOT NULL`
- `service_description text`
- `base_amount_thb numeric(14,2) NOT NULL`
- `source_currency text NULL`
- `source_amount numeric(14,2) NULL`
- `fx_rate numeric(12,6) NULL`
- `fx_rate_source text NULL`
- `fx_rate_date date NULL`
- `vat_amount numeric(14,2) NOT NULL`
- `vat_rate numeric(5,4) NOT NULL`
- `occurred_on date NOT NULL`
- `payment_date date NOT NULL`
- `tax_point_date date NOT NULL`
- `period_basis text NOT NULL` -- default `payment_date`; alternatives require CPA-reviewed rule metadata
- `pp36_period_year integer NOT NULL`
- `pp36_period_month integer NOT NULL`
- `pp36_filing_id uuid NULL`
- `pp36_filing_line_id uuid NULL`
- `pp36_paid_at timestamptz NULL`
- `pp36_payment_transaction_id uuid NULL`
- `pp30_reclaim_eligible_period_year integer NULL`
- `pp30_reclaim_eligible_period_month integer NULL`
- `pp30_reclaim_expiry_period_year integer NULL`
- `pp30_reclaim_expiry_period_month integer NULL`
- `pp30_reclaim_filing_id uuid NULL`
- `pp30_reclaim_filing_line_id uuid NULL`
- `status text NOT NULL`
- `source_snapshot jsonb NOT NULL`
- `source_snapshot_hash text NOT NULL`
- `created_at`, `updated_at`, `deleted_at`

Status enum:

- `needs_review`
- `pp36_required`
- `allocated_to_draft_pp36`
- `pp36_filed`
- `pp36_paid`
- `eligible_for_pp30_reclaim`
- `reclaimed_in_pp30`
- `voided_by_amendment`

Rules:

- PP36 period is derived from `tax_point_date`, defaulting to payment date for v1 foreign-service payments, and is immutable after creation except through amendment.
- For v1, the product default is `tax_point_date = payment_date` for foreign-service payments. If `occurred_on` and `payment_date` point to different periods, flag for review; do not silently choose the later month.
- Add generated-column or trigger enforcement that `pp36_period_year/month` equals `tax_point_date` year/month for active rows.
- PP36 cannot be carried to a later declaration month.
- PP30 reclaim cannot occur until PP36 is paid/remitted.
- PP36 reclaim eligibility/expiry rule must be versioned. Default implementation assumption: eligibility starts no earlier than the PP30 period after remittance; expiry follows the CPA-confirmed six-month input VAT rule from that eligibility basis.
- Reclaim must happen through a PP30 filing transaction, not a standalone status toggle.
- Late/missed PP36 obligations must surface as exceptions with penalty risk, not silently roll forward.
- Paid/remitted PP36 obligations that are not yet reclaimed must be forecastable by future PP30 period. The forecast must show eligible month, expiry month, source expense, PP36 filing/payment evidence, and planned PP30 period if the user has selected one.

### VAT filings

Create `vat_filings`.

Suggested columns:

- `id uuid PK`
- `org_id uuid NOT NULL`
- `establishment_id uuid NULL`
- `filing_type text NOT NULL` -- `PP30`, `PP36`
- `period_year integer NOT NULL`
- `period_month integer NOT NULL`
- `filing_kind text NOT NULL` -- `ordinary`, `additional`, `amendment`
- `version integer NOT NULL DEFAULT 1`
- `amends_filing_id uuid NULL`
- `status text NOT NULL`
- `output_vat_total numeric(14,2)`
- `input_vat_total numeric(14,2)`
- `pp36_vat_total numeric(14,2)`
- `pp36_reclaim_total numeric(14,2)`
- `carryforward_in numeric(14,2)`
- `carryforward_out numeric(14,2)`
- `net_payable numeric(14,2)`
- `filed_at timestamptz NULL`
- `filed_by_user_id text NULL`
- `payment_status text NOT NULL`
- `deadline date NULL`
- `refund_requested boolean NOT NULL DEFAULT false`
- `refund_amount numeric(14,2)`
- `refund_status text NULL`
- `penalty_amount numeric(14,2)`
- `surcharge_amount numeric(14,2)`
- `paid_at timestamptz NULL`
- `payment_transaction_id uuid NULL`
- `rd_receipt_no text NULL`
- `created_at`, `updated_at`, `deleted_at`

Filing status enum:

- `draft`
- `ready_for_review`
- `filed`
- `paid`
- `amended`
- `voided`

Payment status enum:

- `not_required`
- `waiting_to_pay_tax`
- `tax_paid`
- `refund_or_credit`

### VAT filing lines

Create `vat_filing_lines`.

Suggested columns:

- `id uuid PK`
- `org_id uuid NOT NULL`
- `filing_id uuid NOT NULL`
- `line_type text NOT NULL` -- `input`, `output`, `pp36_obligation`, `pp36_reclaim`, `credit_note_adjustment`, `carryforward`
- `vat_input_item_id uuid NULL`
- `vat_output_item_id uuid NULL`
- `pp36_obligation_id uuid NULL`
- `amount numeric(14,2) NOT NULL`
- `vat_amount numeric(14,2) NOT NULL`
- `frozen_snapshot_hash text NOT NULL`
- `frozen_snapshot jsonb NOT NULL`
- `created_at`

Rules:

- Filing lines are immutable after filing status becomes `filed` or later.
- Each filed VAT item can appear only once in the same claim/declaration role.
- There can be only one open ordinary draft per `org_id` + `establishment_id` + `filing_type` + period. Additional/amendment drafts are separate versions tied to `amends_filing_id`.
- Draft filing lines may be rebuilt only through explicit "rebuild draft" action.
- Draft rebuild must release removed items from `allocated_to_draft`; source hash drift makes the draft stale and requires rebuild/review before filing.
- BEFORE UPDATE/DELETE triggers must reject changes to filing lines whose parent filing is `filed`, `paid`, `amended`, or `voided`, unless the canonical lock override is active.
- Oldest-first allocation tie-breaker must be deterministic: eligible period, expiry period, tax invoice date, created_at, id.

### VAT credit carryforwards

Track filed PP30 net credits separately from unclaimed input VAT.

Create `vat_credit_carryforwards` or model equivalent immutable carryforward lines with:

- `id uuid PK`
- `org_id uuid NOT NULL`
- `establishment_id uuid NULL`
- `source_pp30_filing_id uuid NOT NULL`
- `source_pp30_filing_line_id uuid NULL`
- `credit_origin_period_year integer NOT NULL`
- `credit_origin_period_month integer NOT NULL`
- `amount numeric(14,2) NOT NULL`
- `remaining_amount numeric(14,2) NOT NULL`
- `applied_to_pp30_filing_id uuid NULL`
- `status text NOT NULL` -- `available`, `applied`, `refunded`, `adjusted`
- `created_at`, `updated_at`

Rules:

- Unclaimed `vat_input_items` can expire if not allocated within the claim window.
- A filed PP30 net credit carryforward is created by a filing result. It is not the same as an unclaimed purchase invoice and must not inherit item expiry.
- Cash-flow projection must show both queues: expiring unclaimed input VAT and filed carryforward credit balances.
- Applying a carryforward to a later PP30 creates a filing line of type `carryforward`; it does not mutate the original filing.

### Tax payment events

Create `tax_payment_events` as a Phase 8.5 bridge/outbox, not as the final GL/payment subsystem. Phase 10.5 consumes these events into journal entries and stronger settlement primitives.

Suggested columns:

- `id uuid PK`
- `org_id uuid NOT NULL`
- `filing_id uuid NOT NULL`
- `event_type text NOT NULL` -- `payment`, `refund_received`, `credit_applied`, `adjustment`
- `event_status text NOT NULL` -- `recorded`, `matched_to_bank`, `posted_to_gl`, `voided`
- `payment_transaction_id uuid NULL`
- `paid_at timestamptz NOT NULL`
- `amount numeric(14,2) NOT NULL`
- `receipt_no text NULL`
- `evidence_document_id uuid NULL`
- `idempotency_key text NOT NULL`
- `posting_outbox_status text NOT NULL DEFAULT 'pending'`
- `created_by_user_id text NOT NULL`
- `created_at`

Rules:

- PP36 payment event unlocks later PP30 reclaim eligibility.
- PP30 payment/refund/credit state feeds cash-flow dashboard.
- Payment event amount and filing payable/refundable amount must reconcile before a filing can move to `paid`, `refund_or_credit`, or equivalent final payment state.
- A linked bank transaction or evidence document cannot be deleted while a tax payment event references it.
- `tax_payment_events` should be append-only after creation except for a narrow reconciliation-match transition; reversals/voids create compensating events.

## VAT Ledger Cutover Protocol

Phase 8.5 is a clean ledger cutover. The app is not live, so active VAT workflows must not include legacy migration states, dual writes, parity gates, rollback reads, or `vat_records` fallback behavior.

Cutover rules:

- VAT dashboards, registers, filings, drilldowns, and forecasts read from the operations ledger and frozen filing lines.
- Filing actions write `vat_filings`, `vat_filing_lines`, `vat_input_items`, `vat_output_items`, `pp36_obligations`, `vat_credit_carryforwards`, and payment events.
- `vat_records` is not part of the active model. Do not add schema/query/export/test dependencies on it.
- Dev/test cleanup may delete stale ledger rows by org/period. Do not build historical backfill or parity tooling.
- Imported seed/test rows must be explicit ledger rows. Ambiguous data starts as `needs_review` or `awaiting_tax_invoice`; only user/accountant-confirmed data becomes claimable/reportable.

## Filing Build Algorithms

### Build PP30 draft

Inputs:

- Period year/month.
- Output VAT items for the period.
- Claimable input VAT items where eligible period <= filing period <= expiry period.
- PP36 obligations paid/remitted and eligible for reclaim.
- Carryforward from previous PP30, if any.

Algorithm:

1. Acquire org/period advisory lock.
2. Reuse existing open draft if present unless user explicitly rebuilds.
3. Select output VAT items for this period.
4. Select input VAT items with status `claimable`, ordered by eligible period then tax invoice date then created time.
5. Apply oldest eligible input VAT first by default.
6. Include PP36 reclaim items only when PP36 is paid and reclaim-eligible.
7. Include available PP30 credit carryforward balances as carryforward lines, separate from unclaimed input VAT.
8. Freeze all selected rows into `vat_filing_lines`.
9. Set selected source item statuses to `allocated_to_draft` with `draft_filing_id`.
10. Compute totals and cash-flow impact.
11. Show held/near-expiry/expired items that were not selected, so users understand what the draft excludes.
12. Show PP36 reclaim lines as a distinct group in the draft preview, not blended into ordinary local input VAT, while still reducing PP30 payable.

### File PP30

1. Validate filing lines and totals.
2. In one database transaction, select the draft filing and filing lines `FOR UPDATE`.
3. Validate no source snapshot hash drift since draft build.
4. Recompute totals from frozen lines and compare with filing totals.
5. Freeze filing status to `filed`.
6. Move included input/output/reclaim items to `filed` or `reclaimed_in_pp30`.
7. Create/update PP30 credit carryforward row if `net_payable` is negative and refund was not requested.
8. Create refund tracking state if refund was requested.
9. Create period lock for VAT PP30 domain.
10. Emit audit log.
11. Queue settlement posting outbox event for Phase 10.5.

All steps above are all-or-nothing. A partial filed state is a money-bug class failure.

### Build PP36 draft

Inputs:

- PP36 obligations with `pp36_period_year/month` equal to the filing period.

Algorithm:

1. Acquire org/period advisory lock.
2. Select obligations due for this exact period. Do not roll later.
3. Freeze into PP36 filing lines.
4. Compute payable.
5. Surface late/missing obligations as exceptions.

### File/pay PP36

1. Filing freezes declaration lines.
2. Payment event records remittance and bank transaction.
3. Paid obligations become eligible for PP30 reclaim only after a versioned reclaim-eligibility window has been recorded.
4. Reclaim status can only be consumed by a PP30 filing whose period is inside that recorded eligibility/expiry window.
5. Phase 8.5 records the settlement outbox event; Phase 10.5 later posts the full GL entries.
6. Late filings calculate penalty/surcharge fields for review and cash-flow projection; do not hide late PP36 by rolling it into a later ordinary filing.

## UI Requirements

### VAT operations dashboard

Show:

- Current month PP30 position.
- Current month PP36 obligations.
- VAT payable/refundable forecast.
- Input VAT expiring soon.
- Filed PP30 credit carryforward balance.
- Unclaimed VAT by expiry month.
- PP36 paid but not reclaimed.
- Late/missing PP36 risk.
- Filed periods and payment state.
- Upcoming reclaimable VAT by future period.
- PP36 paid -> PP30 reclaim queue with eligible, planned, expired, and consumed states.
- Exceptions where a PP36 payment exists but reclaim eligibility cannot be computed because required rule metadata or evidence is missing.

### VAT forecasting and reclaim planning

Forecasting is a first-class VAT screen or dashboard section, not just a number on the filing page.

Show by month:

- Expected output VAT from confirmed sales/output items.
- Claimable local input VAT by expiry month.
- Future PP36 reclaims created by paid/remitted PP36 obligations.
- Filed PP30 credit carryforward and planned use.
- Net projected PP30 payable/refundable after ordinary input VAT, PP36 reclaims, and carryforward.
- Items that expire before the selected claim plan uses them.
- Difference between current draft allocation and forecast allocation.

User actions:

- Plan a PP36 reclaim into a future PP30 draft period without marking it filed.
- Hold a reclaim with a reason.
- See why a reclaim is blocked: unpaid PP36, missing receipt, outside window, amendment required, or CPA-review metadata missing.
- Open the original source document, PP36 filing, payment event, and consuming PP30 filing from one row.

Rules:

- Forecast rows are advisory until consumed by a draft/filing transaction.
- Forecasting must not mutate claim status by itself.
- Any manual plan outside the default oldest/earliest eligible selection requires reason capture.

### Manage Purchase VAT

FlowAccount-equivalent but cleaner:

- Search by document no, supplier, tax invoice no.
- Filters: date, status, VAT rate, eligible period, claim period, expiry window.
- Rows show document thumbnail, doc date, doc no, supplier/project, amount, VAT, status.
- Status actions:
  - Tax invoice received
  - Mark claimable
  - Hold
  - Do not claim
  - Reset/review
  - Create/add to PP30 draft when eligible
- Bulk actions allowed only for draft/unfiled states.
- Near-expiry warning badges.
- Reason required for do-not-claim and manual claim-period override.

### Monthly Tax Filings

List PP30 and PP36 filings:

- Tax payment date.
- Tax filed month.
- Filing type.
- Sales VAT.
- Purchase VAT.
- PP36 amount.
- Status.
- Payment status.
- Ordinary/additional/amendment indicator.

Actions:

- Build draft.
- Review draft lines.
- Mark filed.
- Record tax payment.
- Reset draft.
- Start amendment.

Filed rows should never expose destructive edits.

### VAT reports

Reports are generated from frozen filing lines:

- Input Tax PP30 Report.
- Output Tax PP30 Report.
- Input Tax PP36/Reclaim Report.
- PP36 obligation report.
- Export to Excel.

Reports must reconcile exactly to the filing snapshot.

### Filing drilldown and source traceability

Every PP30/PP36 filing detail page must show:

- Filing header: period, type, status, ordinary/additional/amendment, payment state, receipt evidence.
- Line groups: output VAT, local input VAT, PP36 obligations, PP36 reclaims, carryforward, adjustments.
- Per-line source links: document, document line, vendor/customer, tax treatment decision, reconciliation match, bank transaction, payment event, and source snapshot hash.
- Inclusion status: included in this filing, excluded from this filing, held, expired, do-not-claim, or consumed by another filing.
- Reconciliation footer proving displayed line totals match frozen filing totals.

This is the key user-facing answer to: "Which expense is in which tax form?"

### Cash-flow projection

Projection should show:

- Expected output VAT by sales period.
- Claimable input VAT by expiry period.
- Filed PP30 credit carryforward balance and planned use.
- Refund-requested amounts and expected cash timing.
- Oldest-first claim plan.
- PP36 cash payment dates.
- PP36 reclaim availability.
- Late PP36 penalty/surcharge estimate where applicable.
- Net expected VAT payable/refundable by month.
- Warnings when holding claims creates expiry risk.

## Mutation and Locking Invariants

- Filed VAT filing lines are immutable.
- Source documents tied to filed VAT lines cannot be deleted or tax-significantly edited.
- Document line items, vendors/customers, transactions, payments, reconciliation matches, tax-classification decisions, tax payment events, and evidence files tied to filed VAT lines cannot be silently deleted or tax-significantly edited.
- Tax-significant fields include amount, VAT amount, VAT rate, tax invoice no/date, vendor/customer, document type, direction, PP36 flag, and tax invoice subtype.
- Draft filing allocations block casual source edits; user must rebuild the draft.
- Filed source correction must use credit note, debit note, amendment, or reversal record.
- PP36 period cannot be moved after creation except through amendment.
- PP36 reclaim cannot be marked outside a PP30 filing transaction.
- Period locks must guard source documents, document line items, reconciliations, tax items, filing lines, and payment events.
- New VAT tables must be added to the canonical `period-lock-protocol.md`; do not add `period_locked` booleans to them.
- Every status transition requires audit log with actor, old state, new state, reason when applicable.
- Hard deletes are forbidden for tax-bound rows; use soft delete only before filing, or reversal after filing.

## Cutover Strategy

### Step 1: Use the ledger as the only active VAT model

Do not create legacy Phase 9 `pp36_vat_reclaims` as a separate source of truth. `pp36_obligations` plus filing lines own that lifecycle; any old Phase 9 linkage concept becomes a derived/read model.

### Step 2: Create reviewed VAT ledger rows from source events

For confirmed source events:

- Expense documents with VAT create `vat_input_items`.
- Income documents with VAT create `vat_output_items`.
- Foreign-vendor/PP36 candidates create `pp36_obligations` only after user/accountant review where needed.

Review status rules:

- `claimable` only when full tax invoice data is complete and the source was explicitly user/accountant-confirmed.
- `awaiting_tax_invoice` when evidence is incomplete.
- `needs_review` for ambiguous documents.
- `do_not_claim` only when source facts prove it or user confirms.

### Step 3: Build PP30/PP36 from the ledger

New filings use item ledgers and filing lines. Legacy VAT rollups are not part of the active filing path.

### Step 4: Harden source mutation guards

Add DB triggers and query-helper checks for source mutation after allocation/filing.

### Step 5: Archive old assumptions

Update Phase 6/Phase 9 docs to state that monthly VAT rollups are derived from the VAT operations ledger and that Phase 6 PP36 "pure cost / never reclaimable" language is superseded by this plan.

### Step 7: Tax filing interface compatibility

Start with VAT-specific `vat_filings` because PP30/PP36 line semantics differ from PND/CIT. Still design a shared interface for future unification:

- common filing identity: `org_id`, `establishment_id`, form type, period, status, filed/payment state
- common audit events
- common payment-event/outbox shape
- common period-lock behavior
- migration path to or from a future `tax_filings` supertable without rewriting VAT item ledgers

## Testing and Verification

### Unit tests

- Claim window calculation.
- Oldest eligible input VAT selection.
- Deterministic allocation tiebreaker stability across repeated draft builds.
- Near-expiry and expired input VAT classification.
- PP30 credit carryforward creation and later application.
- Separation of expiring unclaimed input VAT from filed PP30 credit carryforward.
- PP36 period derivation from payment date and review flag when occurrence/payment periods differ.
- PP36 no-carry-forward rule.
- PP36 paid -> PP30 reclaim eligibility.
- PP36 FX snapshot fields preserved and used in frozen filing lines.
- Output VAT tax point date selection.
- Refund-requested vs carryforward behavior.
- Filing totals from frozen lines.
- Source snapshot hash drift detection.
- Draft rebuild releases/reclassifies allocated items correctly.
- Org-mismatch source FK attempts fail.

### Integration tests

- Bank transaction + expense document + full TI -> input VAT claimable -> PP30 draft -> filed -> source edit blocked.
- Expense with no VAT -> not vatable and excluded from PP30.
- Human/influencer payment with WHT but no VAT -> WHT path only.
- Foreign service payment -> PP36 obligation for exact payment month -> PP36 filed -> payment recorded -> later PP30 reclaim.
- PP30 draft claims oldest eligible input VAT first.
- Holding a claim changes projection and expiry warnings.
- Filed PP30 net credit creates a carryforward balance that can be applied later without expiring as an unclaimed invoice.
- Filed PP30 amendment uses new filing version, not mutation.
- Reconciliation match cannot be deleted when its document is in a filed VAT line.
- Bank transaction used as a PP36/PP30 payment event cannot be deleted or rematched without amendment/override workflow.

### Manual QA

- Reproduce FlowAccount-like Manage Purchase VAT workflow.
- Build PP30 from mixed local expenses, held claims, do-not-claim items, and output VAT.
- Build PP36 from foreign payments and verify it cannot move to a later month.
- Record PP36 payment and verify next PP30 can reclaim it.
- Inspect audit trail from filing back to bank transaction.
- Verify cash-flow projection for an unprofitable period with input VAT carry/claim timing.
- Verify VAT forecasting shows future PP36 reclaim eligibility, expiry, and planned PP30 consumption without mutating filing state.
- Verify PP30/PP36 filing drilldown shows every source document included in a filed period and reconciles line totals to frozen filing totals.

## Rollout Slices

### Slice 1: Schema and state machines

- Resolve the CPA-reviewed PP30 claim-basis date before inserting real `vat_input_items`.
- Decide whether to add `establishments` now or enforce single-establishment null scope.
- Add new VAT item, filing, filing line, and payment event tables.
- Add tax-classification artifact if the current document model cannot safely store line-level treatment decisions.
- Add VAT credit carryforward model.
- Add enums/check constraints.
- Add indexes for org/period/status/expiry lookups.
- Add source snapshot helpers.
- Add org-matching FK/trigger constraints for all source links.
- Add immutable filing-line and source-mutation DB triggers through `period-lock-protocol.md`.

### Slice 2: Ledger source creation and review

- Generate VAT input/output items from reviewed source documents/events.
- Create exception queue for ambiguous cases.
- Keep active VAT reads on ledger-derived models only.

### Slice 3: PP30 build and filing

- Implement oldest-first claim selection.
- Implement draft filing lines.
- Implement file/lock path.
- Add source mutation guards.

### Slice 4: PP36 obligation lifecycle

- Implement exact-period PP36 obligations.
- Implement file/pay/reclaim lifecycle.
- Block carry-forward.

### Slice 5: Operational UI

- VAT operations dashboard.
- Manage Purchase VAT.
- Monthly Tax Filings.
- Filing preview lines.
- VAT forecasting and reclaim planning.
- Filing drilldown with source-document traceability.
- Cash-flow projection.

### Slice 6: Reports and exports

- Input/output VAT reports from frozen filing lines.
- PP36 reports.
- Excel exports.

## Deferred

- Direct RD e-submission.
- Full PP30 amendment UX beyond schema support and manual amendment creation.
- Automated treaty-rate/TRC handling.
- AI/MCP write access to VAT statuses.
- POS output VAT ingestion until POS phase.
- Multi-branch consolidated filing.
- Specific Business Tax, excise, stamp duty.
- e-Tax Invoice/e-Receipt issuance.
- Exceptional claim-window extensions beyond normal six-month handling.

## Open Questions

- Confirm with CPA whether the six-month PP30 input VAT window starts from tax invoice date, tax invoice received date, or another legally relevant date for the cases we support.
- Confirm exact PP36 reclaim timing after payment/remittance for foreign service VAT and whether default reclaim period is the next PP30 filing period after remittance.
- Confirm whether PP36 period basis is always payment date for v1 foreign-service scenarios, and document any exceptions as reviewed rule metadata.
- Confirm Thai output VAT tax-point defaults for the supported v1 sales/service document types, or require explicit accountant confirmation of tax point date.
- Confirm late PP36 penalty/surcharge formula and which amounts are automated vs warning-only in v1.
- Decide final table shape for `tax_payment_events` bridge/outbox, but do not block Phase 8.5 on the full Phase 10.5 GL model.
- Decide whether VAT filings should share a future `tax_filings` supertable with PND/CIT forms. Phase 8.5 should start VAT-specific but keep the common interface above.

## Acceptance Criteria

- Filed PP30/PP36 filings are immutable snapshots with line-level traceability.
- PP30 draft claims oldest eligible input VAT first by default.
- PP30 input VAT cannot be claimed outside the six-month window.
- Filed PP30 credit carryforward is tracked separately from unclaimed input VAT and does not accidentally expire as an invoice claim.
- PP36 obligations are fixed to the correct payment/tax-point month and cannot be carried later.
- PP36 payment is required before PP30 reclaim eligibility.
- Source records included in filed VAT filings cannot be silently edited or deleted.
- Source snapshot hash drift blocks filing until draft is rebuilt/reviewed.
- Active VAT workflows do not depend on legacy rollups, migration states, dual-read gates, or backfill parity.
- VAT dashboard projects payable/refundable position and expiry risk.
- VAT forecasting shows future reclaimable VAT, expiry risk, and PP36 reclaim timing.
- Filed VAT drilldowns answer which documents and payment evidence produced each PP30/PP36 filed number.
- Reports reconcile exactly to filing snapshots.
- Existing domestic WHT and document workflows keep working.
