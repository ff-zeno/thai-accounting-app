# Plan: Phase 9 — Foreign-Vendor Tax Handling (PP 36 + PND.54 + Bilingual WHT Receipts)

**Status:** Draft — captured 2026-04-17 during Phase 8 dogfood review
**Depends on:** Phases 5-6 scope (tax engine) already shipped; this extends them
**Surfaced by:** Dogfood run 2026-04-17T07-05-33-418Z — TikTok SG invoices + Zeno Marketing HK invoice flagged these as unmodeled tax scenarios

## Problem

The current tax engine models domestic Thai VAT (PP 30) and domestic WHT (PND 3 / PND 53) against a flat `wht_rates` table. Three real-world scenarios hit today in Lumera bookkeeping are not modeled:

1. **Cross-border services consumed in Thailand (PP 36 self-assessed VAT).** Foreign vendor invoices (e.g. TikTok Pte Ltd SG for ad spend, SaaS from foreign providers) typically show 0% VAT or no VAT line. Thai law still requires the Thai buyer to self-declare 7% output VAT on PP 36 in the period paid, then reclaim it as input VAT on PP 30 in a later period. CLAUDE.md already flags "PP 36 VAT is NOT mixed into PP 30 input VAT calculations" in the verification checklist, but the actual filing path, reconciliation linkage, and UI surfacing do not exist.

2. **Foreign payments triggering WHT (PND.54).** Payments to foreign suppliers can be subject to Thai WHT. The platform does not encode treaty rates or TRC validation in v1. It suggests Thai §70 statutory defaults by income type, lets the owner/accountant enter the actual rate, and records any below-default rate with explicit acknowledgment and rationale.

3. **Bilingual 50 Tawi WHT receipts for foreign counterparties.** The React-PDF component `src/lib/pdf/fifty-tawi.tsx` renders Thai-only. Foreign counterparties need the tax receipt in English (and often a Thai + English side-by-side) to claim the withheld tax against their local tax authority. Lumera manually translates these today — a recurring pain point.

None of these are extraction bugs. AI extraction correctly records what invoices say. The gap is downstream: schema has no `vendorCountry` field, tax engine has no PP 36 / PND.54 workflow, PDF has no English path, filing calendar has no PP 36 / PND.54 entries.

## Requirements

### Schema
- [ ] Add `country_code` (ISO-3166-1 alpha-2, 2-char TEXT) to `vendors` table, nullable; default to `TH` when inferrable.
- [ ] Add `is_foreign` boolean to `vendors` (derived from `country_code != 'TH'`, but denormalized for query speed).
- [ ] Add `country_code` nullable TEXT to the invoice extraction schema output so AI can surface it.
- [ ] **No treaty-rate table.** No treaty-rate database; owner enters the WHT rate per foreign payment with a §70 statutory default suggestion.

  **Round-5 audit-trail addition (acknowledged risk capture):**
  Schema additions on `wht_certificates`:
  - `rate_source text NOT NULL` ∈ `{'system_default', 'user_override'}` — captures whether the rate was auto-suggested or owner-entered.
  - `rate_below_default_acknowledged_by_user_id text` — populated when owner enters a rate below the §70 default; otherwise null.
  - `rate_below_default_acknowledged_at timestamptz`
  - `rate_below_default_acknowledgment_text text` — owner-typed reason ("HK Art. 7 services exemption per CPA advice", "Treaty interpretation by tax advisor X", etc.).
  - `statutory_default_rate_at_issuance numeric(5,4)` — frozen snapshot of the §70 default for the income type at the time of cert issuance, regardless of what owner picked. Auditor can compare what platform suggested vs what was selected.

  UI behavior: when owner enters a rate < §70 default, certificate save flow requires accountant role OR an uploaded CPA note, plus acknowledgment text confirming tax-advisor approval. Without it, save is blocked. This is the platform's audit defense — RD audit + auditor see clearly that the owner overrode the platform's default knowingly.
- [ ] New enum `vat_filing_type` or extend existing filing-calendar types to include `pp_36` alongside existing PP 30 monthly.
- [ ] New linkage table `pp36_vat_reclaims` — round-4 fix: tracks **per-payment** lifecycle of every PP 36 self-assessment from declaration through remittance to PP 30 reclaim. Distinct from `vat_period_balances.pp36_self_assessed` / `pp36_reclaim_used`, which are **per-period rollups** consumed by the PP 30 settlement engine. The two are derived: `vat_period_balances.pp36_reclaim_used` for a given period = `SUM(pp36_vat_reclaims.vat_amount WHERE pp30_reclaim_filing_period = <period>)`.
  - `id uuid PK`
  - `org_id uuid NOT NULL`
  - `source_transaction_id uuid` — the foreign payment that triggered the PP 36
  - `pp36_filing_period text NOT NULL` — YYYY-MM the output VAT was declared
  - `pp36_filing_id uuid` — FK to the `vat_records` row (`filing_type='pp_36'`) that declared this self-assessment
  - `pp36_paid_at timestamptz` — **gating field**: set when the PP 36 payment to RD has been remitted (bank transaction confirmed)
  - `pp36_remittance_bank_transaction_id uuid` — FK to `transactions` for the remittance
  - `pp30_reclaim_filing_period text` — YYYY-MM the input VAT was reclaimed (NULL until reclaim posted)
  - `pp30_reclaim_filing_id uuid` — FK to the PP 30 `vat_records` row that consumed the reclaim
  - `vat_amount numeric(14,2) NOT NULL`
  - `reclaim_status text NOT NULL DEFAULT 'pending_remittance'` — `pending_remittance` (declared, not paid) → `eligible_for_reclaim` (paid, awaiting next PP 30) → `reclaimed` (consumed in PP 30) → `void` (amended/reversed)
  - `created_at`, `reclaimed_at`
  - **Reclaim gate (round-4 critical fix):** the PP 30 input-VAT roll-up may include a `pp36_vat_reclaims` row only when `reclaim_status = 'eligible_for_reclaim'` AND `pp36_paid_at IS NOT NULL` AND `pp36_paid_at <= <PP 30 period end>`. Per `vat-info.md` §5.4: input VAT for foreign services is reclaimable only after the PP 36 is remitted to RD. Round-3 design pulled reclaims into PP 30 input directly off self-assessment — round-4 found that violates §5.4 (reclaim before remittance). DB-level CHECK + application guard both enforce.

### Extraction
- [ ] Extend `src/lib/ai/schemas/invoice-extraction.ts`: add optional `vendorCountry` (ISO-2 hint, e.g. "SG", "HK", "JP", "TH") — the LLM infers from address/tax ID format.
- [ ] Update extraction prompt to note: "Thai tax IDs are 13 digits. Non-Thai addresses or non-13-digit tax IDs indicate a foreign vendor — populate vendorCountry."
- [ ] On save (review handler), populate `vendors.country_code` and `is_foreign` when creating or updating the vendor record.
- [ ] Extraction review UI: show a "Foreign vendor" chip when `is_foreign`, with a tooltip explaining tax implications.

### Tax engine
- [ ] Extend `src/lib/tax/` with `src/lib/tax/foreign-wht.ts`:
  - `resolveWhtRate({ vendor, incomeType, paymentDate })` — round-4 user direction: **the platform does NOT enforce treaty rates or TRC validation.** Treaty/TRC complexity is the user's tax-advisor problem, not the platform's. Resolution order:
    1. Domestic vendor → domestic rate (existing).
    2. Foreign vendor → **user-input WHT rate**. Form prompts for rate when paying a foreign vendor; default is the seeded statutory §70 default (15% services, 10% royalties, 15% interest) but user can override to any value 0-30% with a free-text reason.
    3. Selected rate is captured on the WHT certificate + payment record + sent to RD as declared.
  - Treaty rate seeding: dropped from this plan. No automated treaty lookup; no TRC fields on `vendors`. Owner / accountant takes responsibility for the rate.
  - Schema simplification: `vendors.trc_document_id` removed from this plan. The accounting / WHT certificate flow records what the owner said the rate is, with full audit trail.
  - Surface in UI: when a foreign-vendor payment is being entered, show a warning "Treaty rate? Verify with your tax advisor. Default = Thai §70 statutory rate." Below-default rates require accountant role or uploaded CPA note.
- [ ] Extend `src/lib/tax/filing-calendar.ts`: add PP 36 monthly entries, PND 54 monthly entries for months with foreign payments.
- [ ] New module `src/lib/tax/pp36.ts`:
  - `computePp36Obligation(foreignServicePayment)` — returns VAT amount to self-declare.
  - `recordPp36Reclaim(pp36FilingId, pp30FilingPeriod)` — links the reclaim on the later PP 30.

### PDFs
- [ ] New component `src/lib/pdf/fifty-tawi-bilingual.tsx` — Thai left column, English right column, SAME layout as `fifty-tawi.tsx`. Reuse the existing Sarabun font for Thai; use Helvetica for English.
- [ ] Routing: in the WHT certificate generation flow, if `vendor.is_foreign` → render bilingual variant; else Thai-only.
- [ ] Add English field labels alongside Thai ones: "Tax Withheld / ภาษีหัก ณ ที่จ่าย", "Payer / ผู้จ่ายเงิน", etc. Keep the 50 Tawi visual layout; don't invent a new design.

### UX surfacing
- [ ] On foreign-vendor docs in review UI: show a warning card — "Foreign vendor. PP 36 self-assessed VAT may apply. PND.54 WHT may apply; verify rate with your accountant."
- [ ] On the tax calendar / monthly filings page: separate PP 30, PP 36, PND 54 entries with distinct icons so the user doesn't conflate them.
- [ ] PP 36 reconciliation view: show each PP 36 obligation + its paired PP 30 reclaim (if any) so the user sees the full loop.

## Approach

### Rollout strategy

**Week 1 — Schema + extraction hook.** Migration for `country_code`, `is_foreign`, `pp36_vat_reclaims`, and WHT rate-override audit fields. Update extraction Zod schema + prompt. Update review handler to populate country. No tax-engine work yet — just capture the data.

**Week 2 — Foreign WHT rate capture + PND.54 foundation.** Build `resolveWhtRate` with §70 statutory defaults, owner/accountant override capture, below-default acknowledgment gate, and PND.54 filing-calendar entries. No treaty database, no automated TRC enforcement.

**Week 3 — PP 36 pipeline.** Tax engine `pp36.ts`. Filing-calendar integration. Reconciliation linkage for future PP 30 reclaim. End-to-end integration test: foreign service payment → PP 36 record created → next-month PP 30 reclaim record materializes.

**Week 4 — Bilingual 50 Tawi + UX.** New PDF component. Routing logic. Warning chips in review UI. Tax calendar page shows separate PP 36 / PND 54 rows.

### Rejected Alternatives

- **Automated treaty-rate database.** Rejected by user direction — treaty/TRC correctness belongs with the tenant's accountant in v1. The platform records the declared rate, suggested statutory default, and override rationale.
- **Single combined "foreign VAT + WHT" report.** Rejected — PP 36, PP 30 (reclaim), and PND 54 have different filing forms, different deadlines, and different recipient authorities. Conflating them in UI leads to bad filings.
- **AI-inferred WHT/treaty rate at extraction time.** Rejected — AI only supplies the country hint. The WHT rate comes from statutory default or explicit owner/accountant entry.
- **Skip bilingual PDF; keep English-only fallback.** Rejected — counterparties need the Thai original for their own records, and Thai RD may require the Thai text for validity. Side-by-side is the standard format in practice.

### Open questions

- **Which §70 default categories are enough for v1?** Start with services, royalties, interest, dividends, and rental/other. Keep category labels owner-readable and accountant-reviewable.
- **What if the foreign vendor already has a Thai branch?** Then it's a domestic vendor for tax purposes. We model this today — just need to ensure `country_code` reflects tax residence, not the global HQ.
- **Do we backfill existing foreign-vendor records?** Lumera already has foreign vendors (Zeno HK, TikTok, Japan vendor). Add a backfill step in Week 1: AI re-classifies existing vendors by address, flags for user confirmation.

## Tasks

### Week 1: Schema + extraction
- [ ] Migration 0016: add `country_code`, `is_foreign` to `vendors`
- [ ] Migration 0016: create `pp36_vat_reclaims` (no treaty-rate table per round-4 simplification — owner enters rate manually).
- [ ] Extend `src/lib/ai/schemas/invoice-extraction.ts` with `vendorCountry`
- [ ] Update extraction prompt to infer country
- [ ] Review handler populates `vendors.country_code`
- [ ] Backfill Inngest job: AI-classify existing vendors by address/tax ID format, flag for user confirmation
- [ ] Foreign-vendor chip in review UI

### Week 2: Foreign WHT rate capture + PND.54
- [ ] `src/lib/tax/foreign-wht.ts` — `resolveWhtRate` with §70 default + explicit owner/accountant override.
- [ ] Seed statutory §70 defaults by income type with citation metadata.
- [ ] UI/API gate: rate below statutory default requires accountant role OR uploaded CPA note + acknowledgment text.
- [ ] Persist selected rate, default rate, rate source, acknowledgment user/time/text, and optional CPA-note document ID.
- [ ] Unit tests covering default rate, above-default override, below-default blocked, below-default allowed with CPA evidence.

### Week 3: PP 36 pipeline
- [ ] `src/lib/tax/foreign-wht.ts` — `resolveWhtRate` with fallback cascade
- [ ] `src/lib/tax/pp36.ts` — `computePp36Obligation`, `recordPp36Reclaim`
- [ ] `src/lib/tax/filing-calendar.ts` — add PP 36 + PND 54 monthly entries
- [ ] Reconciliation: link PP 36 obligation → PP 30 reclaim
- [ ] Integration test: foreign payment → both records materialize

### Week 4: Bilingual PDF + UX
- [ ] `src/lib/pdf/fifty-tawi-bilingual.tsx`
- [ ] WHT cert generation router chooses bilingual for foreign vendors
- [ ] Tax calendar UI separates PP 30 / PP 36 / PND 54 with distinct icons
- [ ] PP 36 reclaim tracker view
- [ ] Warning card on foreign-vendor docs

## Verification

- [ ] Unit tests (round-5 updated): `resolveWhtRate` returns §70 statutory default (15% services) for foreign vendor when owner does not override; honors owner override when supplied; never silently applies a rate below §70 default without explicit owner acknowledgment captured.
- [ ] Integration test: foreign service payment → PP 36 record → PP 30 reclaim link gated by `pp36_paid_at`.
- [ ] Manual QA: upload a TikTok invoice, verify foreign-vendor chip, verify PP 36 warning, verify monthly filing calendar shows PP 36 entry.
- [ ] Manual QA: generate WHT cert for foreign payment → bilingual PDF (Thai + English columns) with the rate the owner selected and a `rate_source` audit field populated.
- [ ] Manual QA: when owner enters rate below §70 default, UI requires `rate_below_default_acknowledgment` (text field + checkbox) before save; certificate captures the acknowledgment.
- [ ] Regression: existing domestic-only orgs see no UI/flow changes.

## Risk notes

- **No platform-side treaty correctness.** Round-4 user direction: platform records the rate the owner enters; tax-advisor responsibility for treaty interpretation. The `rate_below_default_acknowledged_*` fields on `wht_certificates` are the platform's audit defense — they show the owner accepted the risk knowingly.
- **Backfill blast radius.** The AI-based vendor backfill will touch every existing vendor. Gate behind explicit user action + diff view showing which vendors will be flagged foreign.
- **PDF font licensing.** Sarabun is already cleared for Thai. Helvetica (or a Helvetica substitute) is needed for the English column — check that the current React-PDF setup has an appropriate English font bundled.

---

## Post-CPA-review hardening (added 2026-04-26)

After Opus + Codex CPA-grade review on the v2 plans, the following items must land within Phase 9 scope or be split into Phase 9.5 if they push the timeline:

### Treaty rate / TRC handling — REMOVED (round-4 user direction)

Round-4 user direction: the platform does not enforce treaty rates or TRC validation. Owners select the WHT rate themselves (defaulted to Thai §70 statutory rate), with a UI tooltip suggesting consultation with a tax advisor. No TRC columns. No treaty-rate table. No automated lookup.

This removes a cross-cutting research spike (treaty-rate seeding) and a hard-block UX path. Saves ~1 week of scope. Rationale: the platform is for owners who already work with accountants for treaty interpretation; encoding 60+ DTAs is over-scope.

### PND.2 form coverage

- [ ] `wht_form_type` enum extended with `PND2` (dividends/interest to individuals per §3.1).
- [ ] PND.2 CSV exporter (similar to PND.3).
- [ ] 50 Tawi rendering for PND.2.
- [ ] Filing calendar entries for PND.2 (paper 7th, e-file 15th of following month).

### Required full-TI fields enforcement on document confirm

- [ ] Add NOT NULL fields on `documents` for full-TI subset (when `tax_invoice_subtype='full_ti'`):
  - `supplier_tax_id_snapshot` (denormalized from vendors at confirm time)
  - `supplier_branch_number_snapshot`
  - `buyer_tax_id_snapshot` (org's TIN)
  - `buyer_branch_number_snapshot`
  - `tax_invoice_serial_number`
  - `tax_invoice_words` text — must contain "ใบกำกับภาษี" or "Tax Invoice"
- [ ] Validation at `confirmDocument()`: if `tax_invoice_subtype='full_ti'` AND any required snapshot is NULL → reject confirm with actionable message.
- [ ] AI extraction populates these from invoice text; review UI surfaces missing fields with "ask supplier for full TI" CTA.
- [ ] §2.4 hard rule: input VAT only against full TI. Phase 9 enforces; Phase 10 builds on this for the input tax report.

### WHT certificate §3.4 mandatory content (snapshot at issuance)

- [ ] Add NOT NULL columns on `wht_certificates`:
  - `payer_tax_id_snapshot`
  - `payer_address_snapshot`
  - `payee_address_snapshot`
  - `payee_id_number_snapshot` — Thai national ID for individuals (13 digits) or passport for foreign
  - `payment_type_description_th`
  - `payment_type_description_en`
  - `signatory_name_snapshot`
  - `signatory_position_snapshot`
- [ ] Snapshot at certificate creation; immutable thereafter (later vendor/payee updates do NOT change historical certs).
- [ ] Backfill existing rows from joins (one-time migration).
- [ ] Add proper FK constraint: `wht_certificates.filing_id REFERENCES wht_monthly_filings(id)` (currently typed but not constrained per CPA review finding).

### Aggregate-below-1000-baht WHT exemption (§3.1)

Already covered in `today-gap-remediation.md` P0-7 — pulled forward from Phase 9. Verify it lands before Phase 9 ships.

### Payee-side WHT tracking (WHT received from customers)

When the tenant invoices a Thai company, that customer often withholds 3% and issues the tenant a 50 Tawi cert. The tenant has a WHT credit usable on PND.50 at year-end. Today not modeled.

- [ ] New table `wht_credits_received`:
  - `id uuid PK`
  - `org_id uuid NOT NULL`
  - `establishment_id uuid NOT NULL`
  - `customer_vendor_id uuid` — FK to `vendors` representing the customer
  - `certificate_received_document_id uuid` — FK to uploaded 50 Tawi PDF (extracted via Phase 3 pipeline with new doc type `wht_certificate_received`)
  - `payment_date` date NOT NULL
  - `gross_amount numeric(14,2)` NOT NULL
  - `wht_rate numeric(5,4)` NOT NULL
  - `wht_amount numeric(14,2)` NOT NULL
  - `net_received numeric(14,2)` NOT NULL
  - `form_type` text — `PND.3`, `PND.53` typically (from customer's perspective)
  - `tax_year` integer NOT NULL
  - `notes` text
  - `created_at`, `updated_at`, `deleted_at`
- [ ] Extend Phase 3 extraction with `wht_certificate_received` document type — extracts certificate data and creates `wht_credits_received` row on confirm.
- [ ] Surface aggregate `wht_credits_received` for tax year on dashboard; flows into PND.50 (Phase 12).
- [ ] GL posting (after Phase 10.5 ships): `Dr 1180 Prepaid WHT, Cr 1140 Trade accounts receivable` at recognition.

### Filing calendar weekend + holiday adjustment

Already covered in `today-gap-remediation.md` P1-1. Phase 9 deadlines must use the adjusted calendar.

### Verification additions

- [ ] Below-default foreign WHT rate without accountant role / CPA note → blocked.
- [ ] Below-default foreign WHT rate with accountant role / CPA note → allowed; audit log captures default rate, selected rate, and rationale.
- [ ] PND.2 filing for a sample dividend payment to an individual → CSV matches RD layout, 50 Tawi cert references PND.2 form.
- [ ] Document confirm with missing full-TI snapshot field → blocked.
- [ ] WHT cert created → all snapshot fields populated; manual edit of vendor address afterward does NOT change cert.
- [ ] WHT credits received: customer payment of ฿97,000 net = ฿100,000 gross with 3% WHT → row created; tax year aggregation matches expected.

### Integration with Phase 10.5 (GL posting)

When Phase 10.5 ships:
- Foreign service payment → posts journal entry: `Dr 6xxx Foreign service expense, Dr 1253 Input VAT — PP 36 pending remittance (recognition gate, not 1251), Cr 2155 WHT payable PND.54, Cr 2152 PP 36 self-assessed VAT payable, Cr 1111 Bank` — see Phase 10.5 PP 36 lifecycle for the four-step posting (recognition → self-assessment → remittance → reclaim).
- PP 36 reclaim on next PP 30 → `Dr 1251 Input VAT recoverable, Cr 1253 Input VAT — PP 36 pending remittance` (only after `pp36_vat_reclaims.reclaim_status='eligible_for_reclaim'`).
- WHT credit received → `Dr 1180 Prepaid WHT, Cr 1140 Trade accounts receivable`

### FX rate source for PP 36 base (gap closed)

Round-3 found that Phase 9 needs FX rates for PP 36 calculation today, but the BOT FX cron lived in Phase 14. Round-5 corrected ownership: **FX engine ships in Phase 14** (canonical). Round-5 resolution:

- [ ] Phase 9 has a **hard dependency** on Phase 14's BOT FX rate ingestion (`fx_rates_bot` table + Inngest cron). If Phase 9 deploys BEFORE Phase 14: include a minimal BOT rate fetcher as a Phase 9 Week 1 deliverable, refactored to Phase 14's canonical version when 14 lands.
- [ ] At foreign-payment booking time: lookup `fx_rates_bot.mid_rate` for `payment_date`. Store on `documents.exchangeRate` snapshot at booking.
- [ ] PP 36 self-assessment base = `documents.totalAmount × exchangeRate` (or `totalAmountThb` directly when populated).

### Treaty rate seed: REMOVED (round-4 user direction)

The earlier round-3 spec for a parallel CPA-led research spike to seed treaty rates is **dropped**. Per round-4: platform does not encode treaty rates; owner enters manually. Roadmap was updated to remove the treaty-rate spike. No prerequisite remains.

### Phase 11 cumulative-tax-bracket alignment

Phase 11's `pit_brackets` schema is updated with `cumulative_tax_at_lower_bound` per round-3 review (matches RD Lor.Yor schedule format). Phase 9 has no PIT bracket work; flagged here for cross-phase awareness.
