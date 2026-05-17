# Plan: Phase 9 — Foreign-Vendor Tax Handling (PP 36 + PND.54 + Bilingual WHT Receipts)

**Status:** Partial implementation active — foreign country extraction, PND.54 routing, below-default WHT gate, PP36 ledger materialization, WHT workflow control surfaces, tax calendar separation for PP30/PP36/PND54, bilingual foreign-payee 50 Tawi PDF routing, and TikTok seeded review-to-calendar replay exist; broader UX/rate-capture/backfill work remains
**Depends on:** Phase 8.5 VAT operations ledger; Phases 5-6 scope (tax engine) already shipped but must not remain the VAT source of truth
**Blocked by:** `phase-8-5-vat-operations-ledger.md` — PP36 and PP30 reclaim handling must be built on item-level VAT obligations, immutable filing lines, and exact-period PP36 state, not on the legacy `vat_records` monthly rollup.
**Surfaced by:** Dogfood run 2026-04-17T07-05-33-418Z — TikTok SG invoices + Zeno Marketing HK invoice flagged these as unmodeled tax scenarios

## Problem

The current tax engine models domestic Thai VAT (PP 30) and domestic WHT (PND 3 / PND 53) against a flat `wht_rates` table. This plan now assumes Phase 8.5 has first replaced report-centric VAT rollups with an item-level VAT operations ledger. Three real-world scenarios hit today in Lumera bookkeeping are not modeled:

1. **Cross-border services consumed in Thailand (PP 36 self-assessed VAT).** Foreign vendor invoices (e.g. TikTok Pte Ltd SG for ad spend, SaaS from foreign providers) typically show 0% VAT or no VAT line. Thai law still requires the Thai buyer to self-declare 7% output VAT on PP 36 in the period paid, then reclaim it as input VAT on PP 30 in a later period. CLAUDE.md already flags "PP 36 VAT is NOT mixed into PP 30 input VAT calculations" in the verification checklist, but the actual filing path, reconciliation linkage, and UI surfacing do not exist.

2. **Foreign payments triggering WHT (PND.54).** Payments to foreign suppliers can be subject to Thai WHT. The platform does not encode treaty rates or TRC validation in v1. It suggests Thai §70 statutory defaults by income type, lets the owner/accountant enter the actual rate, and records any below-default rate with explicit acknowledgment and rationale.

3. **Bilingual 50 Tawi WHT receipts for foreign counterparties.** The React-PDF component `src/lib/pdf/fifty-tawi.tsx` renders Thai-only. Foreign counterparties need the tax receipt in English (and often a Thai + English side-by-side) to claim the withheld tax against their local tax authority. Lumera manually translates these today — a recurring pain point.

None of these are extraction bugs. AI extraction correctly records what invoices say. The gap is downstream: schema has no `vendorCountry` field, tax engine has no PP 36 / PND.54 workflow, PDF has no English path, filing calendar has no PP 36 / PND.54 entries.

Thai operator feedback added 2026-05-15 also flagged a concrete filing risk: FlowAccount-style WHT summaries can show the right total withholding amount while grouping foreign/international WHT under the wrong report form. Phase 9 must make PND.54 foreign remittance a separate WHT filing lane and must not let foreign WHT totals blend into PND.53 just because the payee is a company.

## 2026-05-16 Implementation + Source Update

Current implementation already covers several Phase 9 foundations:

- Vendor country/foreignness is modeled through `vendors.country` and `vendors.entityType='foreign'`.
- `invoiceExtractionSchema.vendorCountry` accepts ISO-2 hints; extraction prompt instructs the model to infer vendor country from address, tax ID shape, currency, domain, and vendor identity.
- `process-document` uses vendorCountry to create/update foreign vendors.
- Review UI surfaces a foreign-vendor warning/chip and PP36-related fields.
- `classifyForeignVendorTax()` routes foreign payees to PND.54 and classifies foreign services/goods imports for PP36.
- `materializePp36ObligationFromDocument()` writes Phase 8.5 `pp36_obligations`, not a separate Phase 9 reclaim table.
- `createPayment()` is transaction-scoped with WHT certificate draft creation and PP36 materialization.
- `getFormTypeForEntity()` and WHT monthly filing UI include PND.54, and foreign/non-TH corporate payees cannot be filed under PND.53.
- `/tax/calendar` now shows separate owner-visible PP30, PP36, PND2, PND3, PND53, and PND54 lanes with distinct icon labels. VAT statuses read from `vat_filings`; WHT statuses read from WHT filings.
- `/tax/vat/forecast` now includes a PP36 reclaim tracker showing each PP36 obligation, PP36 payment state, PP30 reclaim eligibility/expiry, and paired PP30 reclaim state.
- WHT certificates already include below-default foreign WHT acknowledgment fields and a gate using seeded foreign statutory defaults.
- Foreign-payee WHT certificate PDF generation now routes to a bilingual Thai/English 50 Tawi renderer (`src/lib/pdf/fifty-tawi-bilingual.tsx`); domestic payees keep the existing Thai renderer.

Official source pins refreshed 2026-05-16:

- RD corporate income tax page: `https://www.rd.go.th/english/6044.html` — public RD English page states foreign companies not carrying on business in Thailand are taxed on gross receipts at 10% for dividends and 15% for other income from Thailand, and that the payer files CIT 54 and pays by the 7th of the following month.
- RD non-resident withholding tax certificate page: `https://www.rd.go.th/english/21976.html` — public RD English page for the non-resident withholding tax certificate.
- RD ruling กค 0702/390: `https://www.rd.go.th/64571.html` — retrieved 2026-05-16; states customers/payers that withhold income tax must issue withholding tax certificates to the payee under Revenue Code Section 50 bis and remit WHT under Sections 52/59/3 ter. Phase 9 uses this to justify incoming 50 Tawi evidence as a first-class document that materializes `wht_credits_received`.
- Thailand.go non-resident WHT summary: `https://www.thailand.go.th/useful-information-detail/006_130?hl=en` — official government portal summary used as a cross-check for Section 40 non-resident WHT rates where the RD English page is terse.
- RD Revenue Code Sections 85-86 page: `https://www.rd.go.th/english/37741.html` — retrieved 2026-05-16 and refreshed 2026-05-17. Section 86/4 lists full tax invoice particulars, including prominent tax-invoice wording, issuer taxpayer ID, purchaser details, serial number, goods/services detail, separated VAT, and issue date; Section 86/6 separately defines abbreviated tax invoices. Phase 9 uses this as the source for the full-TI confirmation evidence gate and the rule that claimable input VAT must not be allocated from abbreviated/non-tax-invoice evidence.
- RD treaty pages remain relevant only for accountant-reviewed overrides; Phase 9 v1 does not encode treaty rates.
- Live-link check on 2026-05-17 returned HTTP 200 for the pinned RD/thailand.go source URLs above.

Verified on 2026-05-16:

- `pnpm tsc --noEmit`
- `pnpm vitest run src/lib/db/queries/payments.test.ts src/lib/db/queries/wht-certificates.test.ts src/lib/tax/foreign-vendor-tax.test.ts src/lib/ai/correction-interpreter.test.ts src/lib/ai/extract-document.test.ts`
- `pnpm vitest run --config vitest.config.db.ts src/lib/db/queries/foreign-vendor-tax.db.test.ts`
- `pnpm vitest run src/lib/pdf/fifty-tawi-bilingual.test.ts src/lib/db/queries/wht-certificates.test.ts src/lib/tax/foreign-vendor-tax.test.ts`
- `pnpm vitest run src/lib/tax/foreign-wht.test.ts src/lib/tax/foreign-vendor-tax.test.ts src/lib/db/queries/wht-certificates.test.ts`
- `pnpm test:e2e e2e/tax/wht-certificates.spec.ts`
- `pnpm test:e2e e2e/documents/review-learning.spec.ts`

Refresh verification on 2026-05-17:

- `pnpm vitest run src/app/(app)/tax/wht-certificates/actions.test.ts` — proves foreign PND.54 generation uses the bilingual renderer, uploads as `application/pdf`, persists the URL, and skips the domestic renderer.
- `pnpm test:e2e e2e/tax/withholding-workflow.spec.ts` — proves domestic PND.53 rows keep the normal default-rate/PDF/reissue flow, register links work, and PND.54 stays separate from PND.53 in the filings UI.
- `pnpm tsc --noEmit`
- `git diff --check`

Post-cutover integration hardening on 2026-05-16:

- Added a single DB integration test proving the owner workflow: confirmed foreign-service document materializes a PP36 obligation, PP36 draft/file/payment marks it eligible, and the next PP30 draft consumes it as a PP36 reclaim line only after payment.
- Evidence: `pnpm tsc --noEmit`; `pnpm vitest run --config vitest.config.db.ts src/lib/db/queries/foreign-vendor-tax.db.test.ts`.

## Requirements

### Schema
- [x] Add `country_code` equivalent to `vendors` table. Implementation uses existing `vendors.country` ISO-2 field.
- [x] Add `is_foreign` equivalent. Implementation uses `vendors.entityType='foreign'` plus `country != 'TH'` routing logic rather than a separate boolean.
- [x] Add country nullable TEXT to the invoice extraction schema output so AI can surface it. Implementation field: `vendorCountry`.
- [x] **No treaty-rate table.** No treaty-rate database; owner enters the WHT rate per foreign payment with a §70 statutory default suggestion. Evidence: foreign WHT resolver/tests use statutory defaults plus explicit selected-rate acknowledgment; no treaty table/schema path is introduced.

  **Round-5 audit-trail addition (acknowledged risk capture):**
  Schema additions on `wht_certificates`:
  - `rate_source text NOT NULL` ∈ `{'system_default', 'user_override'}` — captures whether the rate was auto-suggested or owner-entered.
  - `rate_below_default_acknowledged_by_user_id text` — populated when owner enters a rate below the §70 default; otherwise null.
  - `rate_below_default_acknowledged_at timestamptz`
  - `rate_below_default_acknowledgment_text text` — owner-typed reason ("HK Art. 7 services exemption per CPA advice", "Treaty interpretation by tax advisor X", etc.).
  - `statutory_default_rate_at_issuance numeric(5,4)` — frozen snapshot of the §70 default for the income type at the time of cert issuance, regardless of what owner picked. Auditor can compare what platform suggested vs what was selected.

  UI behavior: when owner enters a rate < §70 default, certificate save flow requires accountant role OR an uploaded CPA note, plus acknowledgment text confirming tax-advisor approval. Without it, save is blocked. This is the platform's audit defense — RD audit + auditor see clearly that the owner overrode the platform's default knowingly.
- [x] Do **not** add the earlier `pp36_vat_reclaims` table from this draft. Phase 8.5 owns this lifecycle through `pp36_obligations`, `vat_filings`, `vat_filing_lines`, and `tax_payment_events`.
- [x] Extend filing/read-model code to show PP36 from Phase 8.5 `vat_filings` / VAT ledger surfaces, not legacy rollups.
- [ ] Phase 9 may add foreign-vendor/WHT fields and UI around PP36 classification, but PP36 declaration/payment/reclaim state must remain in the Phase 8.5 VAT operations ledger.
- [x] **Reclaim gate:** PP30 may include a PP36 reclaim only when the linked Phase 8.5 `pp36_obligation` is paid/remitted and eligible. Reclaim is consumed by a PP30 filing line, not by toggling a status on a foreign-vendor document. Evidence: `foreign-vendor-tax.db.test.ts` covers foreign document → PP36 filing/payment → PP30 reclaim.

### Extraction
- [x] Extend `src/lib/ai/schemas/invoice-extraction.ts`: add optional `vendorCountry` (ISO-2 hint, e.g. "SG", "HK", "JP", "TH") — the LLM infers from address/tax ID format.
- [x] Update extraction prompt to note foreign vendor country inference.
- [x] On save/process, populate vendor country/entity type when creating or updating the vendor record.
- [x] Extraction review UI: show a "Foreign vendor" chip/warning when foreign, with tax implications.

### Tax engine
- [x] Extend `src/lib/tax/` with `src/lib/tax/foreign-wht.ts`:
  - `resolveForeignWhtRate({ vendorCountry, vendorEntityType, incomeType, selectedRate })` — round-4 user direction: **the platform does NOT enforce treaty rates or TRC validation.** Treaty/TRC complexity is the user's tax-advisor problem, not the platform's. Resolution order:
    1. Domestic vendor → domestic form routing only; domestic rate lookup remains existing code.
    2. Foreign vendor → **user-input WHT rate**. If no selected rate is provided, the helper returns the statutory default suggestion. Current defaults: 15% for services/royalties/interest/rental/professional/other and 10% for dividends, with source URL/retrieval metadata.
    3. Selected rate can be captured on the WHT certificate/payment flow; below-default output is flagged with required acknowledgment metadata.
  - Treaty rate seeding: dropped from this plan. No automated treaty lookup; no TRC fields on `vendors`. Owner / accountant takes responsibility for the rate.
  - Schema simplification: `vendors.trc_document_id` removed from this plan. The accounting / WHT certificate flow records what the owner said the rate is, with full audit trail.
  - Surface in UI: when a foreign-vendor payment is being entered, show a warning "Treaty rate? Verify with your tax advisor. Default = Thai §70 statutory rate." Below-default rates require accountant role or uploaded CPA note.
- [x] Extend `src/lib/tax/filing-calendar.ts`: include PND.54 form type and PP36 deadline helpers/calendar surfaces.
- [x] PP36 materialization module exists at `src/lib/db/queries/foreign-vendor-tax.ts`:
  - `computePp36Obligation(foreignServicePayment)` — returns VAT amount to self-declare and writes/updates the Phase 8.5 `pp36_obligations` row.
  - `recordPp36Reclaim(pp36FilingId, pp30FilingPeriod)` is removed from Phase 9 ownership; the Phase 8.5 PP30 filing builder consumes eligible paid PP36 obligations.

### PDFs
- [x] New component `src/lib/pdf/fifty-tawi-bilingual.tsx` — Thai/English side-by-side sections using Sarabun for Thai and Helvetica for English.
- [x] Routing: in the WHT certificate generation flow, if payee is foreign or non-TH country → render bilingual variant; else Thai-only.
- [x] Add English field labels alongside Thai ones: "Tax withheld at source", "Payer", "Payee", "Withholding Tax Details", etc. Keep the 50 Tawi visual layout; don't invent a new design.

### UX surfacing
- [x] On foreign-vendor docs in review UI: show a warning card/chip — "Foreign vendor. PP 36 self-assessed VAT may apply. PND.54 WHT may apply; verify rate with your accountant." Current implementation surfaces the foreign-vendor badge and PP36-related fields in document review.
- [x] On the tax calendar / monthly filings page: separate PP 30, PP 36, PND 54 entries with distinct icons so the user doesn't conflate them.
- [x] PP 36 reconciliation view: show each PP 36 obligation + its paired PP 30 reclaim (if any) so the user sees the full loop.
- [x] WHT filings/register views show monthly WHT totals by actual filing form: PND.2, PND.3, PND.53, and PND.54. Foreign/international WHT is surfaced under PND.54, not blended into PND.53.
- [x] WHT dashboard distinguishes incoming WHT credits received from customers from outgoing WHT withheld and payable to RD.

## Approach

### Rollout strategy

**Week 1 — Schema + extraction hook.** Migration for `country_code`, `is_foreign`, and WHT rate-override audit fields. Update extraction Zod schema + prompt. Update review handler to populate country. No tax-engine work yet — just capture the data. Do not create duplicate PP36 lifecycle tables; use Phase 8.5.

**Week 2 — Foreign WHT rate capture + PND.54 foundation.** Build `resolveWhtRate` with §70 statutory defaults, owner/accountant override capture, below-default acknowledgment gate, and PND.54 filing-calendar entries. No treaty database, no automated TRC enforcement.

**Week 3 — PP 36 classification and foreign-vendor integration.** Tax engine `pp36.ts` feeds Phase 8.5 `pp36_obligations`. Filing-calendar integration reads Phase 8.5 `vat_filings`. End-to-end integration test: foreign service payment → PP36 obligation created in VAT ledger → PP36 filed/paid through VAT ledger → later PP30 builder can consume the reclaim.

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
- [x] Vendor country/foreignness present as `vendors.country` + `entityType='foreign'`.
- [x] Confirm Phase 8.5 `pp36_obligations` and `vat_filings` are present before enabling foreign-vendor PP36 UI. No `pp36_vat_reclaims` table.
- [x] Extend `src/lib/ai/schemas/invoice-extraction.ts` with `vendorCountry`.
- [x] Update extraction prompt to infer country.
- [x] Review/process handler populates vendor country/entity type.
- [ ] Backfill Inngest job: AI-classify existing vendors by address/tax ID format, flag for user confirmation
- [x] Foreign-vendor chip in review UI

### Week 2: Foreign WHT rate capture + PND.54
- [x] `src/lib/tax/foreign-wht.ts` — `resolveForeignWhtRate` with §70 default + explicit owner/accountant override metadata.
- [x] Seed statutory §70 defaults by income type with citation metadata in code.
- [x] UI/API gate: rate below statutory default requires accountant role OR uploaded CPA note + acknowledgment text. Current implementation enforces this at WHT certificate draft creation and the payment API path; no standalone payment-entry UI exists yet.
- [x] Persist selected rate, default rate, acknowledgment user/time/text, and accountant note text on the WHT certificate. Optional CPA-note document ID remains deferred until document attachment UX exists for payment approval.
- [x] Add form-routing guard/tests so foreign remittance WHT enters PND.54 and cannot be accidentally included in PND.53 monthly totals.
- [x] Add WHT monthly summary read model grouped by form type, with certificate counts and withheld totals per form. Evidence: `getMonthlyFilingSummaryByForm()` plus `wht-filings.db.test.ts`.
- [x] Unit tests covering default rate, above-default override, below-default blocked, below-default allowed with CPA evidence.

### Week 3: PP 36 pipeline
- [x] `src/lib/tax/foreign-wht.ts` — `resolveForeignWhtRate` with fallback cascade
- [x] PP36 materialization now lives in `src/lib/db/queries/foreign-vendor-tax.ts` as `materializePp36ObligationFromDocument()`, feeding Phase 8.5 `pp36_obligations`; no standalone `src/lib/tax/pp36.ts` remains required.
- [x] Filing calendar/read-model surfaces add PP36 + PND54 monthly entries from VAT ledger/WHT filing state. Evidence: `/tax/calendar` Playwright coverage and `src/lib/tax/filing-calendar.test.ts`.
- [x] Reconciliation: foreign payment/document links to PP36 obligation; PP30 reclaim remains owned by Phase 8.5 filing builder. Evidence: `src/lib/db/queries/foreign-vendor-tax.db.test.ts` covers confirmed foreign service → PP36 obligation → PP36 file/payment → PP30 reclaim.
- [x] Integration test: foreign payment/confirmed document → Phase 8.5 PP36 obligation materializes.

### Week 4: Bilingual PDF + UX
- [x] `src/lib/pdf/fifty-tawi-bilingual.tsx`
- [x] WHT cert generation router chooses bilingual for foreign vendors
- [x] Tax calendar UI separates PP 30 / PP 36 / PND 54 with distinct icons
- [x] PP 36 reclaim tracker view
- [x] Warning card on foreign-vendor document review screens: foreign-vendor chip plus PP36/WHT review warning and PP36 checkbox smoke coverage.
- [x] WHT filings UI shows form tabs/cards with clear PND.2 / PND.3 / PND.53 / PND.54 totals and no cross-form blending.

## Verification

- [x] Unit tests (round-5 updated): `resolveForeignWhtRate` returns §70 statutory default (15% services) for foreign vendor when owner does not override; honors owner override when supplied; never silently applies a rate below §70 default without explicit owner acknowledgment captured.
- [x] Integration test: foreign service payment/document → Phase 8.5 PP36 obligation → PP30 reclaim link gated by paid/remitted state. Evidence: `pnpm vitest run --config vitest.config.db.ts src/lib/db/queries/foreign-vendor-tax.db.test.ts`.
- [x] Manual QA smoke: seeded foreign-vendor invoice review verifies foreign-vendor chip, PP36 warning, and PP36 checkbox.
- [x] Automated TikTok seeded replay: review UI confirmation creates a PP36 obligation, PP36 draft build allocates it in the VAT ledger, and `/tax/calendar` shows the PP36 VAT amount. Evidence: `pnpm test:e2e e2e/documents/review-learning.spec.ts`. Live Blob/Inngest upload timing remains a broader upload pipeline concern, not a Phase 9 tax classification blocker.
- [x] Automated smoke: `/tax/calendar` renders separate PP30, PP36, PND3, PND53, and PND54 lanes. Evidence: `pnpm tsc --noEmit && pnpm test:e2e e2e/tax/calendar.spec.ts`.
- [x] Automated smoke: `/tax/vat/forecast` renders seeded PP36 reclaim eligibility and the PP36 reclaim tracker. Evidence: `pnpm test:e2e e2e/tax/vat.spec.ts`.
- [x] Automated smoke: `/tax/withholding/outgoing` renders below-default foreign WHT rate-review evidence for PND.54 certificates; `/tax/withholding/filings` keeps PND.54 separate from PND.53. Evidence: `pnpm tsc --noEmit && pnpm test:e2e e2e/tax/withholding-workflow.spec.ts`.
- [x] Automated smoke: outgoing WHT certificate UI now surfaces the live Blob/Inngest storage QA caveat so local generation/register coverage is not mistaken for production storage validation. Evidence: `pnpm test:e2e e2e/tax/wht-certificates.spec.ts e2e/tax/withholding-workflow.spec.ts`; `.next/dev/types` cleanup; `pnpm tsc --noEmit`; `git diff --check`.
- [x] Automated smoke: foreign-payee 50 Tawi renderer produces a valid bilingual PDF buffer; action router selects bilingual renderer for foreign/non-TH payees. Evidence: `pnpm vitest run src/lib/pdf/fifty-tawi-bilingual.test.ts src/lib/db/queries/wht-certificates.test.ts src/lib/tax/foreign-vendor-tax.test.ts`.
- [x] Automated action coverage: foreign PND.54 certificate PDF generation routes through the bilingual renderer, uploads with `application/pdf`, persists the uploaded URL, and does not call the domestic renderer. Evidence: `pnpm vitest run src/app/\(app\)/tax/wht-certificates/actions.test.ts`.
- [ ] Manual QA: generate WHT cert for foreign payment through the UI and inspect the uploaded bilingual PDF in browser/storage.
- [ ] Manual QA: when owner enters rate below §70 default, UI requires `rate_below_default_acknowledgment` (text field + checkbox) before save; certificate captures the acknowledgment.
- [ ] Manual QA: foreign payee WHT appears in PND.54 monthly summary and is absent from PND.53, even if the payee is a corporate vendor.
- [x] Regression: domestic PND.53 certificates retain the normal default-rate flow, including the PND.53 form label, `Default ok` state, PDF generation, and reissue action. Evidence: `pnpm test:e2e e2e/tax/withholding-workflow.spec.ts`.

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

- [x] `wht_form_type` enum extended with `PND2` (dividends/interest to individuals per §3.1). Evidence: Drizzle enum + migration `0025_today_gap_p1_calendar_pnd2.sql`.
- [x] PND.2 CSV exporter (similar to PND.3). Evidence: `src/lib/tax/rd-csv-export.test.ts`.
- [x] 50 Tawi rendering for PND.2. Evidence: Thai and bilingual 50 Tawi renderers include PND.2 checkboxes; `src/lib/db/queries/wht-certificates.test.ts` covers explicit PND.2 certificate numbering.
- [x] Filing calendar entries for PND.2 (paper 7th, e-file 15th of following month). Evidence: `src/lib/tax/filing-calendar.test.ts`, `/tax/calendar` PND.2 column, and `src/lib/db/queries/wht-filings.db.test.ts` PND.2 monthly summary coverage.

### Required full-TI fields enforcement on document confirm

- [x] Add nullable snapshot fields on `documents` for the full-TI subset, enforced at confirmation when `tax_invoice_subtype='full_ti'`:
  - `supplier_tax_id_snapshot` (denormalized from vendors at confirm time)
  - `supplier_branch_number_snapshot`
  - `buyer_tax_id_snapshot` (org's TIN)
  - `buyer_branch_number_snapshot`
  - `tax_invoice_serial_number`
  - `tax_invoice_words` text — must contain "ใบกำกับภาษี" or "Tax Invoice"
- [x] Validation at `confirmDocument()`: if `tax_invoice_subtype='full_ti'` or `e_tax_invoice` will support recoverable VAT and required snapshot evidence is missing → reject confirm with actionable message. Evidence: `src/lib/db/queries/today-gap-remediation.db.test.ts`.
- [x] Review UI surfaces full-TI evidence fields for owner/accountant correction before confirm, and Confirm persists unsaved evidence-field edits before confirmation. Evidence: `src/app/(app)/documents/[docId]/review/extraction-form.tsx`; `pnpm test:e2e e2e/documents/review-learning.spec.ts`.
- [x] AI extraction populates these from invoice text: `taxInvoiceSubtype`, `taxInvoiceSerialNumber`, `taxInvoiceWords`, `buyerBranchNumber`, plus supplier/buyer tax IDs and supplier branch snapshots from existing extraction fields. Evidence: `src/lib/ai/schemas/invoice-extraction.ts`, `src/lib/inngest/functions/process-document.ts`, `src/lib/tax/foreign-vendor-tax.test.ts`, and `src/lib/ai/extract-document.test.ts`.
- [x] Review UI adds an "ask supplier for full tax invoice" CTA for missing supplier-issued evidence on recoverable full/e-tax invoice claims. Evidence: `pnpm test:e2e e2e/documents/review-learning.spec.ts`.
- [x] §2.4 hard rule: input VAT only against full/e-tax invoice evidence. API guard `createVatInputItem()` rejects `claimable`/allocated/filed input VAT without full/e-tax subtype plus invoice no/date, PP30 candidate/dashboard/forecast queries filter to that same evidence, and DB constraint `vat_input_claimable_requires_full_tax_invoice_check` enforces the invariant. Migration `0070_vat_input_full_tax_invoice_claimable.sql` includes a precheck that raises a clear error if existing claimable/allocated/filed rows lack valid full/e-tax invoice evidence. Evidence: migration `0070_vat_input_full_tax_invoice_claimable.sql`; Claude Companion review 2026-05-17 with migration-precheck/test-message findings fixed; `pnpm exec drizzle-kit check`; `pnpm db:migrate`; `pnpm vitest run --config vitest.config.db.ts src/lib/db/queries/vat-operations-ledger-schema.db.test.ts src/lib/db/queries/vat-operations-ledger.db.test.ts`; `pnpm tsc --noEmit`; `git diff --check`.

### WHT certificate §3.4 mandatory content (snapshot at issuance)

- [x] Add NOT NULL columns on `wht_certificates`:
  - `payer_tax_id_snapshot`
  - `payer_address_snapshot`
  - `payee_address_snapshot`
  - `payee_id_number_snapshot` — Thai national ID for individuals (13 digits) or passport for foreign
  - `payment_type_description` — MVP single description sourced from RD payment type / WHT type; bilingual display remains renderer-owned for foreign-payee certificates
  - `signatory_name_snapshot`
  - `signatory_position_snapshot`
- [x] Snapshot at certificate creation; immutable thereafter (later vendor/payee updates do NOT change historical certs). Evidence: `createWhtCertificateDraft()` snapshots payer/payee/payment-type fields, migration `0052_wht_certificate_snapshot_immutability.sql` blocks snapshot rewrites, and `pnpm vitest run --config vitest.config.db.ts src/lib/db/queries/today-gap-remediation.db.test.ts`.
- [x] Backfill existing rows from joins (one-time migration). Evidence: migration `0024_today_gap_remediation.sql` adds snapshot columns with NOT NULL defaults for existing rows; active creation path now populates non-empty source snapshots where source data exists.
- [x] Add proper FK constraint: `wht_certificates.filing_id REFERENCES wht_monthly_filings(id)`.
  Evidence: Drizzle schema references `wht_monthly_filings.id`; migration `0024_today_gap_remediation.sql` adds the FK if missing; migration `0016_baseline_hardening_period_locks.sql` enforces same-org filing links; `src/lib/db/queries/wht-filings.db.test.ts` rejects missing and cross-org filing references.

### Aggregate-below-1000-baht WHT exemption (§3.1)

Already covered in `today-gap-remediation.md` P0-7 — pulled forward from Phase 9. Verify it lands before Phase 9 ships.

### Payee-side WHT tracking (WHT received from customers)

When the tenant invoices a Thai company, that customer often withholds 3% and issues the tenant a 50 Tawi cert. The tenant has a WHT credit usable on PND.50 at year-end. Today not modeled.

- [x] New table `wht_credits_received`:
  - `id uuid PK`
  - `org_id uuid NOT NULL`
  - `establishment_id uuid NULL` — keep null for single-establishment MVP unless Phase 8.5 adds a first-class `establishments` table
  - `customer_vendor_id uuid` — FK to `vendors` representing the customer
  - `certificate_received_document_id uuid` — FK to uploaded 50 Tawi PDF (extracted via Phase 3 pipeline with new doc type `wht_certificate_received`)
  - `payment_date` date NOT NULL
  - `gross_amount numeric(14,2)` NOT NULL
  - `wht_amount numeric(14,2)` NOT NULL
  - `form_type` text — `PND.3`, `PND.53` typically (from customer's perspective)
  - `tax_year` integer NOT NULL
  - `certificate_no` text
  - `notes` text
  - `created_at`, `updated_at`, `deleted_at`
- [x] Extend Phase 3 extraction with `wht_certificate_received` document type — extracts certificate data and creates `wht_credits_received` row on confirm. Evidence: migrations `0053_wht_certificate_received_document_type.sql` and `0054_wht_credit_received_document_uniqueness.sql`, `invoiceExtractionSchema` schema coverage in `src/lib/tax/foreign-vendor-tax.test.ts`, extraction prompt guidance in `src/lib/ai/extract-document.ts`, `process-document` WHT amount/rate passthrough, `confirmDocument()` materialization, and `pnpm vitest run --config vitest.config.db.ts src/lib/db/queries/wht-credits-received.db.test.ts`.
- [x] Surface aggregate `wht_credits_received` for tax year on dashboard; flows into PND.50 (Phase 12). Evidence: `src/lib/db/queries/wht-credits-received.ts`, WHT register/read-model coverage, and `src/lib/db/queries/cit-filings.db.test.ts` consumes WHT credits in annual PND.50 drafts.
- [x] GL posting (after Phase 10.5 ships): `Dr 1180 Prepaid WHT, Cr 1140 Trade accounts receivable` at recognition through the posting outbox. Evidence: `createWhtCreditReceived()` enqueues `wht_credits_received`, `processPostingOutboxRow()` posts `1180/1140` idempotently, and `pnpm vitest run --config vitest.config.db.ts src/lib/db/queries/wht-credits-received.db.test.ts` covers the vertical.

### Filing calendar weekend + holiday adjustment

Already covered in `today-gap-remediation.md` P1-1. Phase 9 deadlines must use the adjusted calendar.

### Verification additions

- [x] Below-default foreign WHT rate without accountant role / CPA note → blocked.
- [x] Below-default foreign WHT rate with accountant role / CPA note → allowed; certificate captures default rate, selected rate, acknowledgment user/time, rationale, and accountant note.
- [x] PND.2 filing for a sample dividend payment to an individual → CSV matches RD layout, 50 Tawi cert references PND.2 form. Evidence: `src/lib/tax/rd-csv-export.test.ts`, `src/lib/db/queries/wht-certificates.test.ts`, and `src/lib/db/queries/wht-filings.db.test.ts`.
- [x] Document confirm with missing full-TI snapshot field → blocked. Evidence: `pnpm vitest run --config vitest.config.db.ts src/lib/db/queries/today-gap-remediation.db.test.ts`.
- [x] WHT cert created → source snapshot fields populated; manual edit of vendor address afterward does NOT change cert; direct snapshot rewrites are DB-blocked. Evidence: `pnpm vitest run --config vitest.config.db.ts src/lib/db/queries/today-gap-remediation.db.test.ts`.
- [x] WHT credits received: customer payment of ฿97,000 net = ฿100,000 gross with 3% WHT → row created; tax year aggregation matches expected. Evidence: `src/lib/db/queries/wht-credits-received.db.test.ts`.

### Integration with Phase 10.5 (GL posting)

When Phase 10.5 ships:
- Foreign service payment → posts journal entry: `Dr 6xxx Foreign service expense, Dr 1253 Input VAT — PP 36 pending remittance (recognition gate, not 1251), Cr 2155 WHT payable PND.54, Cr 2152 PP 36 self-assessed VAT payable, Cr 1111 Bank` — see Phase 10.5 PP 36 lifecycle for the four-step posting (recognition → self-assessment → remittance → reclaim).
- PP36 reclaim on later PP30 → `Dr 1251 Input VAT recoverable, Cr 1253 Input VAT — PP36 pending remittance` (only after the Phase 8.5 `pp36_obligation` is paid/remitted and eligible).
- WHT credit received → `Dr 1180 Prepaid WHT, Cr 1140 Trade accounts receivable`

### FX rate source for PP 36 base (gap closed)

Round-3 found that Phase 9 needs FX rates for PP 36 calculation today, but the BOT FX cron lived in Phase 14. Round-5 corrected ownership: **FX engine ships in Phase 14** (canonical). Round-5 resolution:

- [ ] Phase 9 has a **hard dependency** on Phase 14's BOT FX rate ingestion (`fx_rates_bot` table + Inngest cron). If Phase 9 deploys BEFORE Phase 14: include a minimal BOT rate fetcher as a Phase 9 Week 1 deliverable, refactored to Phase 14's canonical version when 14 lands.
- [x] At foreign-payment booking/materialization time: use reviewed `documents.exchangeRate` or `documents.totalAmountThb` as the FX snapshot. Live BOT lookup remains Phase 14 canonical UI/cron ownership.
- [x] PP 36 self-assessment base = `documents.totalAmount × exchangeRate` (or `totalAmountThb` directly when populated). Evidence: `src/lib/db/queries/foreign-vendor-tax.db.test.ts` rejects non-THB PP36 services without reviewed THB base or FX snapshot.

### Treaty rate seed: REMOVED (round-4 user direction)

The earlier round-3 spec for a parallel CPA-led research spike to seed treaty rates is **dropped**. Per round-4: platform does not encode treaty rates; owner enters manually. Roadmap was updated to remove the treaty-rate spike. No prerequisite remains.

### Phase 11 cumulative-tax-bracket alignment

Phase 11's `pit_brackets` schema is updated with `cumulative_tax_at_lower_bound` per round-3 review (matches RD Lor.Yor schedule format). Phase 9 has no PIT bracket work; flagged here for cross-phase awareness.
