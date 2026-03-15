# Engineering Review: Thai Accounting Platform Plan

**Date:** 2026-03-14
**Reviewer:** Opus (Staff Engineer perspective)
**Plan:** docs/exec-plans/active/001-thai-accounting-platform.md

---

## Summary

Well-structured execution plan with solid architectural decisions. However, the schema was designed for the happy path. It does not model partial payments, many-to-many reconciliation, credit/debit note adjustments, audit trails, or temporal dimensions (no `created_at`/`updated_at` on any table). These are structural requirements that become exponentially harder to retrofit after Phase 1 ships.

**Found:** 7 critical issues, 12 high-severity issues, 15 medium issues, 11 unvalidated assumptions.

---

## SECTION 1: SCHEMA GAPS

### S-1: No audit timestamps on any table — CRITICAL
No `created_at`, `updated_at`, or `deleted_at` on any table. Thai tax records must be retained 5 years. Cannot prove when records were created or modified.
**Fix:** Add `created_at TIMESTAMPTZ DEFAULT NOW()`, `updated_at TIMESTAMPTZ`, optionally `created_by`/`updated_by` to every table in Phase 1.

### S-2: Reconciliation is 1:1 but reality is M:N — CRITICAL
`transactions.reconciled_doc_id` is a single FK. Cannot handle partial payments, batch payments, split payments, or net-of-WHT matching.
**Fix:** Create `reconciliation_matches` junction table: `{id, transaction_id FK, document_id FK, matched_amount, match_type, confidence, matched_by, matched_at}`.

### S-3: WHT certificates have no FK to documents — CRITICAL
Cannot trace which invoice(s) a certificate was issued for. Breaks audit trails and corrections.
**Fix:** Create `wht_certificate_items` detail table: `{id, certificate_id FK, line_item_id FK, base_amount, wht_rate, wht_amount, payment_type_code}`.

### S-4: WHT monthly filings have no link to certificates — HIGH
Cannot enumerate which certificates rolled up into a filing.
**Fix:** Add `filing_id FK` to `wht_certificates` or junction table.

### S-5: VAT records have no link to source documents — HIGH
Cannot produce the required input/output VAT registers with document-level detail.
**Fix:** Rely on querying `documents` + `document_line_items` for period. `vat_records` becomes a materialized summary regenerable from source.

### S-6: Organizations table missing branch number — HIGH
Thai branches have separate WHT filing identities. 50 Tawi and PND forms require 13-digit tax ID AND 5-digit branch number.
**Fix:** Add `branch_number VARCHAR(5) DEFAULT '00000'` to `organizations`.

### S-7: No exchange rate on documents — HIGH
Foreign-currency invoices need BOT reference rate for THB conversion for WHT calculation on PND 54.
**Fix:** Add `exchange_rate NUMERIC(12,6)` and `total_amount_thb NUMERIC(12,2)` to `documents`.

### S-8: No `payment_type_code` for RD e-Filing — HIGH
RD CSV requires Section 40 numeric codes (40(2), 40(4)(a), 40(8), etc.), not descriptive labels.
**Fix:** Add `rd_payment_type_code` column or lookup table mapping internal types to RD codes.

### S-9: `numeric(12,2)` insufficient for WHT rate precision — MEDIUM
DTA treaty rates can be fractional (7.5%). WHT rate columns need `numeric(5,4)`.
**Fix:** Use `numeric(5,4)` for rates, `numeric(14,2)` for amounts.

### S-10: No fiscal year configuration — MEDIUM
Not all Thai companies use calendar fiscal year. Affects PND 50/51 deadlines.
**Fix:** Add `fiscal_year_end_month/day` to `organizations`.

### S-11: Missing indexes specification — MEDIUM
No indexes beyond PKs/FKs for common query patterns (date ranges, reconciliation matching, vendor lookup).
**Fix:** Define indexes in Phase 1. Add unique constraint on `vendors(org_id, tax_id)`.

### S-12: No soft delete mechanism — MEDIUM
Financial records should never be hard-deleted.
**Fix:** Add `deleted_at TIMESTAMPTZ` to all tables.

### S-13: Credit/debit notes have no parent reference — MEDIUM
`documents.type` includes credit_note/debit_note but no `related_document_id` FK.
**Fix:** Add `related_document_id FK NULLABLE` to `documents`.

---

## SECTION 2: ARCHITECTURAL RISKS

### A-1: Neon free tier cold start + scale-to-zero — HIGH
5-minute inactivity suspension, 1-3 second cold start. Inngest pipeline steps hit cold starts.
**Fix:** Document risk. Consider Neon "always on" for production. Connection pooling with keepalive.

### A-2: Vercel Blob Hobby limit is 1 GB — HIGH
~1,000 documents at 1 MB average. Blocks all access when exceeded.
**Fix:** Abstract blob storage behind interface. Plan migration to R2/S3. Consider compression.

### A-3: No concurrency control for reconciliation — HIGH
Concurrent uploads could double-match the same transaction.
**Fix:** Unique constraint on matches. Inngest concurrency controls: `concurrency: { key: "org-${orgId}", limit: 1 }`.

### A-4: Inngest free tier 50K-100K executions/month — MEDIUM
8 steps × retries per document. Budget should be documented.

### A-5: No failure recovery for partial pipeline completion — HIGH
No compensation/rollback, no dead letter queue, no manual retry UI.
**Fix:** Make steps idempotent. DB transactions in step 8. Add `pipeline_status` to `document_files`. "Retry" button in UI.

### A-6: AI cost blowup on retries — MEDIUM
50 blurry photos failing cheap model → 50 premium model calls with no cap.
**Fix:** Per-document retry budget. Daily/monthly cost cap. Log costs per extraction.

---

## SECTION 3: AI PIPELINE CONCERNS

### P-1: Pipeline is not idempotent — CRITICAL
Retry creates duplicate documents, certificates, VAT adjustments. No dedup for AI-processed documents.
**Fix:** Use `document_files.id` as idempotency key. Upsert pattern in step 8. DB transaction.

### P-2: No cost tracking per pipeline run — MEDIUM
**Fix:** Add `ai_cost_tokens`, `ai_cost_usd`, `ai_model_used` to `document_files`.

### P-3: Image quality detection underspecified — MEDIUM
"Flag blurry images" but no HOW. Thai thermal receipts fade and have low contrast.
**Fix:** Preprocessing step for resolution/quality check. Minimum 1024x768. Reject early.

### P-4: Multi-page merge logic underspecified — MEDIUM
10 pages from 3 invoices uploaded together — no page-to-document clustering.
**Fix:** Require one document per upload initially. Defer multi-document batching.

---

## SECTION 4: TAX LOGIC CORRECTNESS

### T-1: PND 54 WHT rate table is incomplete — CRITICAL
Plan shows only "15% default" for foreign payments. Dividends to foreign entities default to 10%, not 15%. Over-withholding is a compliance error.
**Fix:** Expand PND 54 to all 7 payment types with correct rates.

### T-2: e-WHT reduced rates not modeled — HIGH
3% → 1% for e-WHT payments to companies. Valid 2023-2025, extension unconfirmed.
**Fix:** Add `is_ewht` flag. Make rates configurable via `wht_rates` table with effective dates.

### T-3: DTA treaty handling mentioned but not designed — HIGH
61+ DTAs, DTR pre-filing required, Certificate of Tax Residence tracking needed.
**Fix for MVP:** Default PND 54 to statutory rates. Document DTA as V2.

### T-4: PP 36 reverse charge not distinguished from reclaimable VAT — HIGH
Same as product review Issue #2.
**Fix:** Separate columns: `input_vat_pp30` and `reverse_charge_vat_pp36`. Explicit formula.

### T-5: WHT calculation basis ambiguous — MEDIUM
`vat_included BOOLEAN` means `amount` could be pre- or post-VAT. WHT engine could compute on wrong base.
**Fix:** Standardize `amount` as always pre-VAT. Validate: if vat_included, divide by 1.07 for WHT base.

### T-6: Missing payment type granularity for RD codes — MEDIUM
"Professional fees" vs "Services (general)" are distinct RD categories at same rate.

---

## SECTION 5: MISSING FEATURES

### F-1: No audit trail / change log — CRITICAL
No mechanism to track who changed what when.
**Fix:** Add `audit_log` table in Phase 1. Log all mutations.

### F-2: No currency conversion / exchange rate — HIGH
PND 54 foreign payments require THB conversion.
**Fix:** Add exchange rate fields. Manual entry for MVP.

### F-3: No user roles or permissions model — MEDIUM
No `users` table, no `created_by`/`updated_by`.
**Fix:** Add `users` stub in Phase 1 with nullable FKs on key tables.

### F-4: No void/correction workflow for WHT certificates — HIGH
Cannot void and replace certificates with proper sequence handling.
**Fix:** Add `voided`/`replaced` statuses. `replacement_certificate_id FK`. Sequence gap validation.

### F-5: Annual filings absent — MEDIUM
PND 50/51, PND 1 Gor, audited financials not addressed.
**Fix:** Document as out of scope for V1. Add PND 1 Gor to Phase 5.

### F-6: No data export / backup mechanism — MEDIUM
### F-7: Thai language / localization not addressed — LOW

---

## SECTION 6: TESTING STRATEGY GAPS

### TS-1: No test fixtures for RD e-Filing CSV — HIGH
Format not publicly documented. Must obtain samples.

### TS-2: AI extraction tests non-deterministic — MEDIUM
Use tolerance-based assertions. Pin model versions.

### TS-3: No integration test for full Inngest pipeline — HIGH
Most complex part of system has no integration test plan.
**Fix:** Mock AI + Blob, real test DB, test happy path + partial failure + duplicate upload.

### TS-4: No test for WHT certificate sequence integrity — MEDIUM
Concurrent generation, void/replacement, fiscal year reset.

---

## SECTION 7: SEQUENCING RISKS

### Q-1: Phase 3 depends on Inngest not set up in Phase 1 — MEDIUM
**Fix:** Move Inngest setup to Phase 1.

### Q-2: Vendor CRUD should precede Phase 3 — LOW
**Fix:** Basic vendor CRUD in Phase 2.

### Q-4: WHT rate lookup needed in Phase 3 but built in Phase 5 — HIGH
**Fix:** Extract core WHT rate lookup function into Phase 3. Phase 5 builds certificates/aggregation on top.

---

## SECTION 8: UNVALIDATED ASSUMPTIONS

| # | Assumption | Risk | Action |
|---|-----------|------|--------|
| U-1 | KBank CSV format is known | HIGH | Download actual statement sample |
| U-2 | DBD Open API is accessible | HIGH | Test the endpoint |
| U-3 | OpenRouter vision model access | MEDIUM | Verify 3+ models available |
| U-4 | RD e-Filing CSV format is known | HIGH | Obtain from RD portal or accountant |
| U-5 | React-PDF renders Thai 50 Tawi | MEDIUM | Build proof-of-concept |
| U-6 | FlowAccount/Peak import formats | MEDIUM | Obtain sample templates |
| U-7 | Vercel Blob suitable long-term | CONSTRAINED | 1 GB limit, plan migration |
| U-8 | Neon free tier sufficient | CONSTRAINED | 0.5 GB, cold starts |
| U-9 | +8 day e-Filing extension | VALIDATED thru Jan 2027 | Make configurable |
| U-10 | VAT rate is 7% | VALIDATED thru Sep 2026 | Make configurable |
| U-11 | Inngest + Next.js 16 compatible | MEDIUM | Build minimal PoC |

---

## Prioritized Action Items

**Before Phase 1 coding:**
1. Validate DBD API access (U-2)
2. Obtain KBank CSV/PDF sample (U-1)
3. Obtain RD e-Filing CSV specs (U-4)
4. Build PoC: Next.js 16 + Inngest + Neon + React-PDF Thai (U-5, U-11)

**Must fix in Phase 1 schema:**
5. Add `created_at`/`updated_at` to all tables (S-1)
6. Create `reconciliation_matches` junction (S-2)
7. Add `wht_certificate_items` detail table (S-3)
8. Add `audit_log` table (F-1)
9. Add `branch_number` to organizations (S-6)
10. Add exchange rate columns to documents (S-7)
11. Add `related_document_id` for credit/debit notes (S-13)
12. Define indexes and unique constraints (S-11)

**Must fix in architecture:**
13. Pipeline idempotency (P-1)
14. Reconciliation concurrency control (A-3)
15. Blob storage abstraction (A-2)
16. Pull WHT rate lookup into Phase 3 (Q-4)
17. Expand PND 54 foreign rate table (T-1)
