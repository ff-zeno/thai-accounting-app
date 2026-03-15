# Product/Business Review: Thai Accounting Platform Plan

**Date:** 2026-03-14
**Reviewer:** Sonnet (Product/CTO perspective)
**Plan:** docs/exec-plans/active/001-thai-accounting-platform.md

---

## Summary

The plan is ambitious, well-structured, and shows genuine domain understanding. The architectural choices are sound. However, there is a significant cluster of gaps in three areas: (1) the actual user payment workflow is broken — net payment after WHT deduction won't match invoice total, breaking reconciliation for every service invoice, (2) the data model is missing several tables that are non-negotiable for financial correctness, and (3) several compliance details are either silently wrong or left dangerously unspecified.

**Overall verdict:** Do not begin Phase 3 implementation before resolving Issues #1, #2, #3, #4, #5, #6, and the research task in Issue #8.

---

## Strengths

- Architecture sequencing is correct (bank statements → documents → reconciliation)
- AI pipeline with per-step retries and model escalation is mature
- WHT rate engine core logic is correct (amount-before-VAT × rate)
- Multi-tenancy from day one with RLS
- Decimal-only money math
- Parser-first, AI-fallback for bank statements

---

## CRITICAL Issues

### Issue #1 — Payment workflow is broken: net payment ≠ invoice total

Thai WHT workflow: invoice for THB 10,700 (10,000 + 7% VAT). WHT 3% on 10,000 = 300. Transfer = THB 10,400. Bank shows 10,400.

Reconciliation engine does exact/fuzzy matching but has no way to know that a 10,700 invoice matches a 10,400 transaction because WHT was deducted. This is the **most common case**, not an edge case.

**Root cause:** No `payments` table linking what was invoiced to what was actually transferred.

**Recommendation:** Add a `payments` table with gross_amount, wht_amount_withheld, net_amount_paid. Update reconciliation to compute expected bank amount = gross - WHT.

### Issue #2 — PP 36 VAT risks being treated as reclaimable input VAT

The compliance reference is explicit: PP 36 reverse-charge VAT is NOT reclaimable. If `net_vat = output_vat - input_vat - pp36_amount`, the company understates VAT liability.

**Recommendation:** Rename `input_vat` to `input_vat_pp30`. Define: `net_vat_payable = output_vat - input_vat_pp30`. PP 36 is separate. Different deadline (15th vs 23rd).

### Issue #3 — 50 Tawi sequence number is not year-scoped, no void handling

Sequence must reset to 1 on January 1 per form type. Voided certificates retain their number (never reused).

**Recommendation:** Sequence format: `{form_type}/{year}/{N}`. Counter table: `(org_id, form_type, year) → next_sequence` with DB lock. Add `voided_at` and `void_reason`. Never delete, never reuse.

### Issue #4 — Partial/combined payments cannot be represented

`transactions.reconciled_doc_id` is a single FK. Cannot handle: split payments, combined payments, bank fees.

**Recommendation:** Add `transaction_document_links` junction table: `(transaction_id, document_id, allocated_amount)`. Add `partially_paid` status and `amount_paid`/`balance_due` to documents.

### Issue #5 — Annual filings entirely absent

PND 1 Gor (annual employee WHT summary, due end of Feb), fiscal year configuration, PND 51/50 (CIT) — all missing.

**Recommendation:** Add `fiscal_year_start_month/day` to organizations. Add `annual_filings` table. Add PND 1 Gor to Phase 5. Explicitly mark CIT (PND 50/51) as out of scope for V1.

### Issue #6 — Reconciliation runs before WHT is confirmed

Pipeline order: Extract → Validate → Vendor Lookup → WHT Classification → Auto-Reconciliation. But WHT classification may be overridden by the user in review UI. Reconciliation uses unconfirmed WHT amount → match fails → everything goes to manual queue.

**Recommendation:** Remove auto-reconciliation from upload pipeline. Trigger reconciliation after user confirms WHT in review UI. Also support on-demand and nightly batch reconciliation.

---

## HIGH Issues

### Issue #7 — Reconciliation engine handles only 1-to-1 matching

No split payments, combined payments, bank fees, or cross-period timing differences.

**Recommendation:** Add combined/split matching modes. Use `transaction_document_links` junction. Use `payment_date` (not `issue_date`) for WHT filing period.

### Issue #8 — Export formats for RD/FlowAccount/Peak are unverified

RD e-Filing CSV has specific column ordering, encoding (TIS-620 or UTF-8 with BOM), date formats, and numeric payment type codes. FlowAccount and Peak have proprietary formats. None documented.

**Recommendation:** Research Phase 5 prerequisite: download actual RD templates, create trial FlowAccount/Peak accounts, document exact formats in `docs/export-formats/`.

### Issue #9 — e-WHT reduced rates expired/unconfirmed for 2026

e-WHT reduces 3% to 1% for company payments via integrated bank systems. Valid Jan 2023–Dec 2025. Extension to 2026 unconfirmed. Plan ignores e-WHT entirely.

**Recommendation:** Add `payment_method` to WHT context. Add e-WHT rate variants gated on conditions. Verify extension status. Make rates configurable.

### Issue #10 — Mobile UX not designed despite being a stated core need

Desktop sidebar app with TanStack Tables. No camera capture flow, no PWA, no offline queue.

**Recommendation:** Add `/capture` route: single-purpose mobile page with camera button. Use `<input accept="image/*" capture="environment">`. PWA manifest. Offline upload queue. Phase 3 deliverable.

### Issue #11 — No journal entries or double-entry bookkeeping

No chart of accounts, no ledger. "P&L summary" based on document sums is not a real P&L. FlowAccount/Peak import journal entries, not raw invoices.

**Recommendation:** Explicitly scope as "tax compliance tool" not "accounting system." Add `account_code` (nullable) to `document_line_items` now to preserve migration path.

---

## MEDIUM Issues

### Issue #12 — wht_certificates has no link back to source documents

Cannot show which invoice a certificate was issued for, prevent duplicates, or build PND 1 Gor.

**Recommendation:** Add `wht_certificate_documents` junction: `(certificate_id, document_id, line_item_id, base_amount, wht_amount)`.

### Issue #13 — vat_records are aggregates with no audit trail

PP 30 requires listing each individual tax invoice. Aggregate insufficient. Also: which period does an invoice belong to when issue_date ≠ payment_date month?

**Recommendation:** Add `vat_period_year/month` to documents. Compute aggregate from source data, don't store independently.

### Issue #14 — No vendor contact, email, or payment terms

Cannot send 50 Tawi PDFs (no email). Cannot auto-compute due dates (no payment terms).

**Recommendation:** Add `email`, `payment_terms_days`, `bank_account_number` to vendors.

### Issue #15 — wht_monthly_filings won't generate correct RD CSV

RD CSV requires per-payee-per-payment-type rows, not aggregate totals.

**Recommendation:** Generate CSV dynamically from `wht_certificates` data. Don't store as static blob.

### Issue #16 — DTA rate handling has no data model

Foreign vendor Certificate of Tax Residence + DTR pre-filing required for reduced rates. No model for this.

**Recommendation for MVP:** Default PND 54 to 15%. Add UI note that DTA rates require documentation workflow (V2).

### Issue #17 — Nil PP 30 filing not tracked

PP 30 must be filed every month even with zero activity.

**Recommendation:** Add nil filing tracking. Calendar shows every month from first active month.

---

## LOW Issues

### Issue #18 — MCP Server over-engineered for MVP

Only internal Inngest functions need DB access. No external AI agent clients yet.

**Recommendation:** Defer MCP to V2. Inngest steps use direct DB calls.

### Issue #19 — Benchmark harness has no stopping criterion

No defined accuracy threshold or timebox.

**Recommendation:** Define: >90% accuracy on clean invoices, >75% on photos. Timebox to 2 days.

### Issue #20 — organizations.is_sme is static but changes yearly

**Recommendation:** Add `organization_fiscal_years` table with per-year SME status.

### Issue #21 — No document amendment/void workflow

No voided status, no parent_document_id for credit/debit notes, no period locking.

**Recommendation:** Add `parent_document_id`, `voided` status, period locking after filing.

---

## Prioritized Action List (Before Phase 3)

1. Add `payments` table and `transaction_document_links` junction (#1, #4)
2. Fix reconciliation pipeline — move to post-WHT-confirmation trigger (#6)
3. Implement year-scoped, form-type-scoped, void-safe 50 Tawi sequence (#3)
4. Clarify PP 36 non-reclaimable; rename fields; define net_vat formula (#2)
5. Research actual RD/FlowAccount/Peak export formats (#8)
6. Add fiscal year config, annual filings table, PND 1 Gor to Phase 5 (#5)
7. Add `/capture` mobile route to Phase 3 (#10)
