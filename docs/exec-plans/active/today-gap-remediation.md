# Today-Gap Remediation — Compliance Patches for Shipped Code

**Status:** Implementation complete; pending self-review before moving to completed
**Created:** 2026-04-26 after Opus + Codex CPA review
**Owner:** Block on completion before any new tenant onboards
**Scope:** Patches to currently-shipped code that fix compliance defects independent of Phase 10/11 plans

## Current Status — 2026-04-29 Validation

Do not move this file to `completed` yet.

Closed by baseline v2:

- P0-3 DB-level period lock enforcement for current VAT/WHT filing/source paths via shared `period_locks`.
- P0-4 PP36 self-assessment fix for marked foreign-service documents.
- P1-4 document tax-invoice subtype: `full_ti`, `abb`, `e_tax_invoice`, `not_a_ti`; recoverable input VAT limited to full/e-tax invoices.
- P0-1 PP30 document-derived output VAT is blocked for organizations flagged with POS/channel sales.
- P0-2 VAT period must match `issue_date` unless explicit override metadata is present.
- P0-5 suspected foreign vendors mis-tagged as Thai are excluded from PP30 input VAT and queued for country review.
- P0-6 WHT certificates now snapshot §3.4 payer/payee/payment fields at creation and `filing_id` has a real FK.
- P0-7 annual cumulative below-1000-baht WHT exemption is tracked per vendor/year with catch-up withholding after threshold crossover.
- P1-1 filing deadlines now roll weekends and seeded 2026 Thai financial-institution holidays to the next business day.
- P1-2 PND.2 is now a first-class WHT form type across enum/schema, filing calendar, monthly filing UI, CSV export, period locks, and 50 Tawi rendering.
- P1-3 silent-drop paths now write idempotent `exception_queue` rows for vendor-country review, duplicate extraction logs, and unmatched imported bank transactions; dashboard surfaces open review items.
- P1-5 foreign WHT below-default rates now require persisted user acknowledgment, rationale, and accountant note text before a PND.54 certificate can be created.
- P2-1 WHT certificate reissue now marks the original as replaced, creates and links a replacement certificate, exposes a reissue action in the WHT certificate table, and prints replacement context on 50 Tawi PDFs.

Pending review:

- P2-2 payee-side WHT received tracking is implemented; needs review before this plan moves to completed.

## Why this exists

Both Opus and Codex CPA-grade reviews identified **shipped behavior** that produces wrong tax filings or has unenforceable invariants. Phase 10 and 11 close the structural gaps over weeks; these patches close the bleeding now. Estimated total effort: 2-4 days of focused work.

## Patch list (priority-ordered)

### P0 — bleeding compliance defects

#### P0-1. Block PP 30 from-documents path for tenants with sales channels

**File:** `src/lib/db/queries/vat-records.ts:27-58`
**Problem:** `computeVatForPeriod()` derives output VAT by summing `documents.vatAmount` for `direction='income'`. For any tenant with card/QR/marketplace sales, this captures bank-net or AR-only income — not POS gross. Output VAT is under-declared. §2.3 hard rule violation.

**Fix:**
- Add `organizations.has_pos_sales` boolean (default false; manual flag during onboarding).
- In `computeVatForPeriod`, if `org.has_pos_sales=true` AND `vat_records.pp30_data_source != 'pos_derived'`: throw `OutputVatPathDisabledError` with message linking to Phase 10 cutover doc.
- For existing tenants flagged as retail: queue PP 30 ก amendment review (manual list, owner-confirms).

**Verification:**
- New retail tenant attempts to generate PP 30 from documents path → blocked.
- Service-only tenant (no POS sales flag) → continues to use documents path.
- Audit log entry on every blocked attempt.

#### P0-2. Tax point integrity: derive `vat_period` from `issue_date`, not AI

**File:** `src/lib/db/schema.ts` — `documents.vatPeriodYear/Month`
**File:** `src/lib/inngest/functions/process-document.ts` — extraction → store-result
**Problem:** AI sets `vatPeriodYear/Month`. There is no constraint that they match `issueDate` per §2.2. A late-captured invoice can land in any month the extractor or reviewer chooses. §7.3 invariant unenforceable. Period lock can be bypassed silently.

**Fix:**
- Add `documents.vat_period_override_reason` text (nullable).
- Add `documents.vat_period_overridden_by_user_id` text + `vat_period_overridden_at` timestamptz.
- DB CHECK (or trigger): `vat_period_year = year(issue_date) AND vat_period_month = month(issue_date)` UNLESS `vat_period_override_reason IS NOT NULL`.
- In `process-document.ts` store-result step: set `vat_period_year/month` directly from `issue_date`. Don't accept AI-provided values.
- UI: editing the period from defaults requires entering an override reason; logs to `audit_log` with `read_pii=false, action='override_vat_period'`.

**Verification:**
- Document with issue_date=2026-03-15 has vat_period_year=2026, vat_period_month=3.
- Attempt to set period=2026-04 without override → DB rejects.
- Override with reason → succeeds, audit_log entry created.

#### P0-3. DB-level period lock enforcement

**Files:**
- `src/lib/db/queries/vat-records.ts` — `upsertVatRecord` (lock check missing on conflict path)
- `src/lib/db/queries/wht-filings.ts` — `upsertMonthlyFiling` (same)
- `src/lib/db/queries/wht-filings.ts` — `voidFiling` (can unlock)

**Problem:** `period_locked` is enforced only in some paths. The `ON CONFLICT` upsert path skips the check. `voidFiling` resets the lock. Means a "locked" period is theatre.

**Fix:**
- **Use the shared `period_locks` primitive** per `docs/_ai_context/period-lock-protocol.md` (NOT a per-table session var). Single canonical session var `app.lock_override_user_id`; single trigger function `check_period_lock(org_id, establishment_id, domain, period_year, period_month)`.
- Apply the trigger to `vat_records` (domain='vat') and `wht_monthly_filings` (domain='wht').
- `voidFiling` server action sets `app.lock_override_user_id` and updates the `period_locks` row (sets `unlocked_at`, `unlocked_by_user_id`, `unlock_reason`).
- Every unlock event writes to `audit_log` with reason.
- Phase 10.5 reuses the same primitive for GL (domain='gl'), Phase 11 for payroll (domain='payroll'), Phase 12 for CIT (domain='cit'). Single concept across the platform.

**Verification:**
- Locked vat_record cannot be updated by direct SQL or by `upsertVatRecord` without explicit unlock.
- `voidFiling` succeeds only with `unlock_authorized_by_user_id` set; logs audit event.
- Cross-tenant lock test: org A locks period; org B's identical period unaffected (org_id always in WHERE clause anyway).

#### P0-4. PP 36 self-assessment fix

**File:** `src/lib/db/queries/vat-records.ts` (PP 36 logic) and any caller
**Problem:** PP 36 logic sums `documents.vatAmount` for foreign docs. Foreign invoices typically show 0 VAT. The 7% self-assessment is **missed entirely** — every TikTok/Meta/AWS invoice produces no PP 36 obligation today.

**Fix:**
- Update PP 36 computation: base = `documents.totalAmount` (or `totalAmountThb` when foreign currency), rate = current Thai VAT rate (0.07). PP 36 output VAT = `base × rate`, ignoring `documents.vatAmount` field for foreign docs.
- Add `documents.is_pp36_subject` boolean — set to true when `vendor.country != 'TH' AND document_category IN ('service', 'royalty', 'professional_fee', etc.)`.
- For documents already booked under wrong PP 36 logic: regenerate PP 36 retroactively per affected month, surface for amendment.

**Verification:**
- TikTok SG ad invoice for ฿107,000 (showing 0 VAT) → PP 36 obligation ฿7,490 (= 107,000 × 0.07). NOT ฿0.
- Domestic vendor invoice → no PP 36 entry.
- Goods import (handled via customs) → no PP 36 entry.

#### P0-5. Foreign-vendor input-VAT leak guard

**File:** `src/lib/db/queries/vat-records.ts`
**Problem:** `vendors.country` defaults `'TH'`. AI extraction may mis-tag a foreign vendor as Thai. Result: input VAT claimed on PP 30 (because it looks domestic) AND will later be claimed on PP 30 reclaim of PP 36 output → double-claim. §8.1 200% penalty exposure.

**Fix:**
- Phase 9 introduces `is_foreign` derived from `country_code`. Until Phase 9 ships, add a runtime block:
  - If `documents.vatAmount > 0` AND `vendor.country = 'TH'` AND vendor name contains foreign-pattern keywords (Pte Ltd, GmbH, LLC, Inc, Limited from non-Thai address) → flag for review, exclude from input VAT until human confirms.
- Surface a weekly "vendor-country review" task in dashboard for tenants with any flagged docs.

**Verification:**
- Doc from "TikTok Pte. Ltd." with `vendors.country='TH'` → flagged, excluded from input VAT until reviewed.
- Doc from "Bangkok Coffee Co., Ltd." → not flagged.

#### P0-6. WHT certificate §3.4 required-field enforcement

**File:** `src/lib/db/schema.ts` — `wht_certificates`
**Problem:** Today's table has `certificateNo`, payee FK, amounts, form, status, void/replacement. Missing required §3.4 content: `payerTaxId`, `payeeAddress`, `paymentTypeDescription`, `payeeIdNumber` (Thai ID for individuals). PDF renders these from joins; no DB constraint. Payee dispute path open.

**Fix:**
- Add columns NOT NULL with backfill from existing rows (joins to org + payee at creation time, snapshot values).
- New columns: `payer_tax_id_snapshot`, `payer_address_snapshot`, `payee_address_snapshot`, `payee_id_number_snapshot`, `payment_type_description`, `signatory_name_snapshot`, `signatory_position_snapshot`.
- `wht_certificates.filing_id` — add proper FK `references(() => wht_monthly_filings.id)` (line 475-476 currently typed but not constrained).
- Snapshot at certificate-creation time — payee address change post-issue does NOT change the cert (immutability).

**Verification:**
- New cert created → all snapshot fields populated from current state.
- Payee changes address → existing cert unchanged.
- DB constraint: cannot insert cert with NULL in any required field.

#### P0-7. Aggregate-below-1000-baht WHT exemption (§3.1) — ANNUAL cumulative

**File:** `src/lib/db/queries/wht-rates.ts` and any caller computing WHT before payment
**Problem:** §3.1 exempts payments from WHT when **annual cumulative payments to a payee stay below THB 1,000 for the tax year**. Once cumulative > ฿1,000, withholding triggers and applies on the full accumulated amount going forward. Not implemented. Causes false-positive withholdings and unnecessary 50 Tawi issuance.

**Fix (round-4 user clarification + round-6 simplification — single bucket per vendor):**

User decision: track annual cumulative as a **single bucket per (org, payee_vendor, tax_year)**, not split by income category. Goods purchases still excluded (§3.0 — no WHT on goods at all). Simpler model; user accepts that a payee who happens to receive both services AND rent payments has them aggregated into one cumulative for the threshold.

- New query `getYtdWhtEligiblePaymentsToPayee(orgId, payeeVendorId, taxYear)` — sums prior **WHT-eligible** payments to same payee for the tax year. Goods purchases excluded.
- WHT calculator: if (this payment + ytd WHT-eligible payments to same payee in tax year) ≤ 1,000: skip WHT, log decision in audit_log.
- Threshold cross-over: when this payment pushes annual cumulative > 1,000, **withhold on the full accumulated amount** (catch-up pattern). The exemption is forfeit for that vendor for the rest of the tax year.
- Rate scope: applies regardless of payee type (individual or juristic) — the exemption is the annual cumulative amount per vendor, not the payee classification.
- Index needed: `(org_id, payee_vendor_id, tax_year)` on payment-side data for fast aggregation.

**Verification:**
- ฿400 + ฿400 + ฿300 = ฿1,100 to same payee → first two skip WHT (cumulative ฿800 ≤ 1,000); third crosses threshold → WHT applies on full ฿1,100 accumulated WHT-eligible payments.
- ฿800 services + ฿800 services to same payee + ฿50,000 goods purchase → goods excluded; cumulative ฿1,600 → catch-up WHT applies on ฿1,600.
- After threshold crossed, subsequent payments are withheld at the relevant rate per income type.
- Cross-year: ytd resets at January 1.

### P1 — important corrections

#### P1-1. Filing calendar: weekend + Thai holiday adjustment

**Status:** Implemented 2026-04-29 in migration `0025_today_gap_p1_calendar_pnd2.sql`.

**File:** `src/lib/tax/filing-deadlines.ts`, `src/lib/tax/filing-calendar.ts`
**Problem:** Deadline engine returns calendar dates without weekend/holiday adjustment. RD practice: when due date falls on weekend or public holiday, deadline shifts to next business day. Surcharge calc is wrong on edge cases.

**Fix:**
- Add `thai_business_calendar` table: date, holiday_name_th, holiday_name_en, source_announcement.
- Seed with 2026 Thai financial-institution holidays as published by BOT/notified banks.
- Update `getFilingDeadline(formType, taxPeriod)` to return next business day when raw deadline is weekend or holiday.
- Holiday-calendar admin UI is deferred; annual seed updates remain a maintenance task until settings/admin screens exist.

**Verification:**
- PP 30 e-file due 2026-08-23 (Sunday) → deadline returns 2026-08-24 (Monday).
- PP 30 due falling on Songkran (April 13-15) → deadline returns next non-holiday business day.

#### P1-2. PND.2 form coverage

**Status:** Implemented 2026-04-29 in migration `0025_today_gap_p1_calendar_pnd2.sql`.

**File:** `src/lib/db/schema.ts` — `wht_form_type` enum
**File:** `src/lib/tax/rd-csv-export.ts` — form type union
**Problem:** PND.2 (dividends/interest to individuals per §3.1) is missing from form enum. Tenants paying dividends cannot file via the platform.

**Fix:**
- Add 'PND2' to `wht_form_type` enum (Postgres ALTER TYPE ADD VALUE).
- Add CSV exporter for PND.2 (similar shape to PND.3).
- Add 50 Tawi rendering for PND.2 form type.
- Filing calendar entries for PND.2 (same monthly cadence as PND.3).

#### P1-3. Silent-drop exception queues

**Status:** Implemented 2026-04-29 using existing `exception_queue` table.

**Files:**
- Bank transactions never matched → `unmatched_bank_transactions` review queue
- Foreign-flag uncertainty (P0-5 candidates) → `vendor_country_review_queue`
- Duplicate extraction onConflictDoNothing returning null → `duplicate_extraction_log` for review

**Problem:** Codex finding #15 — multiple silent-drop paths. No exception queue surfacing them. Owner doesn't see what was ignored.

**Fix:**
- New table `exception_queue`:
  - `id`, `org_id`, `entity_type`, `entity_id`, `exception_type`, `severity`, `summary`, `payload`, `created_at`, `resolved_at`, `resolution`
- Wire each silent-drop path to insert an exception_queue row.
- Dashboard widget: "Items waiting for your review (N)" with severity-sorted list.

#### P1-4. Document subclass for ABB vs full TI

**File:** `src/lib/db/schema.ts` — `documents.document_type`
**Problem:** Today's enum has invoice/receipt/debit/credit. No distinction between ABB (abbreviated tax invoice) and full TI. §2.4 requires only full TIs support input VAT recovery; today's logic can't tell them apart.

**Fix:**
- Add new field `documents.tax_invoice_subtype`: `full_ti`, `abb`, `e_tax_invoice`, `not_a_ti` (e.g. delivery order, quote).
- AI extraction populates from invoice content (full TIs say "ใบกำกับภาษี" prominently; ABBs say "ใบกำกับภาษีอย่างย่อ").
- Input VAT eligibility query: `WHERE tax_invoice_subtype IN ('full_ti', 'e_tax_invoice')`.
- ABB-classified docs explicitly flagged "non-recoverable input VAT — request full TI from supplier" in UI.

#### P1-5. Foreign WHT below-default override gate (Phase 9 hardening)

**Status:** Implemented 2026-04-29 with text-only accountant note.

**File:** Phase 9 plan + early Phase 9 implementation
**Problem:** Phase 9 no longer encodes treaty rates or TRC validation. That scope cut is correct, but it creates a small-business misuse risk: an owner can type a below-default foreign WHT rate without understanding the §70 exposure.

**Fix:**
- Keep manual foreign WHT rate override.
- If selected rate is below the statutory §70 default, require explicit user acknowledgment plus accountant-note text.
- Persist `rate_below_default_acknowledged_by_user_id`, timestamp, default rate, selected rate, free-text rationale, and accountant note on the WHT certificate.
- UI copy must say: "Below-default foreign WHT can create RD exposure. Use only with accountant advice."

### P2 — high-leverage but lower-urgency

#### P2-1. Re-issuance flow for WHT certificates

**Status:** Implemented 2026-04-30.

**File:** New action under `src/app/(app)/tax/wht/[id]/reissue/`
**Problem:** `replacement_cert_id` exists in schema but no API/UI. Payee dispute → "issue corrected cert" requires a defined flow.

**Fix:**
- Action: `reissueWhtCertificate(originalId, correctedFields, reason)` — voids original (sets `voided_at`, `void_reason`), issues new with `replacement_cert_id` pointing to original. Both rows kept (audit trail).
- 50 Tawi PDF on reissued cert prints "Replaces certificate #XXX dated YYY".

#### P2-2. Payee-side WHT received tracking

**Status:** Implemented 2026-04-30; pending self-review.

**Problem:** When tenant invoices a Thai company that withholds 3%, the tenant receives net + a 50 Tawi cert. This is an asset (WHT credit on PND.50) but not modeled. CIT calc misses the credit.

**Fix:**
- New table `wht_credits_received`:
  - id, org_id, customer_vendor_id, certificate_received_document_id, payment_date, gross_amount, wht_amount, form_type, tax_year, certificate_no, notes
- DB constraints:
  - same-org triggers for customer and received-certificate document references
  - non-negative gross/WHT amounts
  - unique non-deleted certificate number per org/customer/year when a certificate number is provided
- UI: manual received 50 Tawi entry + year total/list.
- PND.50 prep: aggregate `wht_credits_received` by tax_year as creditable WHT.
- AI extraction is deferred to the later document-extraction/CIT phase; the table already has a received-document FK for that path.
- Folds into Phase 12 (annual close + CIT).

## Sequencing

**Day 1:** P0-1, P0-3, P0-4 (the three filing-correctness blockers).
**Day 2:** P0-2, P0-5, P0-6, P0-7 (data integrity + WHT corrections).
**Day 3:** P1-1, P1-2, P1-3 (calendar, PND.2, exception queues).
**Day 4:** P1-4, P1-5, P2-1, P2-2 (subclass, foreign WHT override gate, WHT received).

## Verification sweep

After all P0 patches land:
- Run a synthetic audit: pick a Lumera tax month, generate PP 30 / PP 36 / PND.x. Compare against manual calculation. Verify all changes catch the previously-broken paths.
- Lock the month, attempt various edits — confirm they're blocked or audit-logged.
- Generate PP 30 ก amendment packets for any historical mis-filings discovered.

## Communication to existing tenants

Lumera (and any other onboarded org):
- Notify of the under-declaration discovery (output VAT base + PP 36).
- Present the amendment packet for affected months.
- Offer to accompany owner / CPA to RD voluntary-amendment filing.
- Document the §8.1 voluntary-amendment penalty schedule (2/5/10/20% by lateness) so owner knows the exposure.
- Set expectation: Phase 10 cutover (weeks away) makes this permanent; today's patches stop the bleeding for new periods.
