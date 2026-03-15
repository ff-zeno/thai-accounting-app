# Round 2 Engineering Review — Rev 2 Plan

**Date:** 2026-03-14
**Reviewer:** Opus (Round 2)
**Verdict:** 1 critical, 5 high, 10 medium, 4 low. Fix findings 1, 2, 3, 7, 8, 11, 15 before Phase 1.

---

## Critical

### 1 — PND 1 Gor is payroll (out of scope)
PND 1 is employee salary WHT — explicitly excluded. But `pnd1` is in the form_type enum and Phase 5 lists "PND 1 Gor annual summary." Should be PND 3 Gor (individual vendors) and PND 53 Gor (corporate vendors).
**Fix:** Remove `pnd1` from enum. Replace "PND 1 Gor" with "PND 3 Gor / PND 53 Gor" throughout.

## High

### 2 — pipeline_status enum missing 'completed'
Schema defines: uploaded/extracting/extracted/validated/failed_*. Step 7 sets 'completed' which isn't in the enum. 'extracted' is defined but never set.
**Fix:** Add 'completed'. Decide if 'extracted' is needed between steps 3-4.

### 3 — ai_extraction_status is a Rev 1 leftover
document_files has both pipeline_status (Rev 2) and ai_extraction_status (Rev 1). The old field is never referenced in any pipeline step.
**Fix:** Remove ai_extraction_status.

### 7 — No tax_config table for configurable parameters
Design principle says "stored in DB, not hardcoded" but there's no table for: VAT rate (7%), e-filing extension (+8 days), PP 36 deadline. Only wht_rates has a table.
**Fix:** Add tax_config key-value table or document that these are app constants until config table is needed.

### 8 — cash_transactions is an orphan
Not in any phase deliverable, test, or pipeline step. Petty cash refs in Phase 4 are about transactions.is_petty_cash, not this table.
**Fix:** Remove from schema (defer to V2) or assign to a phase.

### 11 — RLS without auth is underspecified
RLS listed as Phase 1 deliverable but auth is out of scope. Drizzle+Neon RLS relies on Neon Authorize (needs auth provider). Without it, need SET LOCAL approach with custom middleware.
**Fix:** Either defer RLS to auth phase (use application-level WHERE for now) or document SET LOCAL approach.

### 15 — Buddhist Era (B.E.) year not addressed
Thai tax forms use พ.ศ. (Gregorian + 543). Certificate sequence format {form_type}/{year}/{seq} — which year system? 50 Tawi PDF prints dates in B.E. RD CSV likely uses B.E.
**Fix:** Add toBuddhistYear() utility. Document that wht_sequence_counters.year stores Gregorian, display converts to B.E.

## Medium

### 4 — audit_log and wht_sequence_counters shouldn't have deleted_at
Audit logs must be immutable. Sequence counters must never be deleted. Blanket "all tables include deleted_at" is wrong for these.

### 5 — payments.gross_amount comment misleading
"Invoice total" is wrong for partial payments. Should say "payment amount before WHT deduction."

### 6 — Schema summary says 6 new tables but lists 7.

### 9 — Missing unique constraints on wht_monthly_filings, vat_records, bank_statements.

### 10 — Transaction dedup has no unique constraint, only indexes. Application-level dedup is racy.

### 12 — Pipeline per-document vs per-file ambiguity. Idempotency key is document_files.id but pipeline processes all pages of a document. Clarify: one Inngest function per document.

### 13 — Phase 1 and Phase 3 oversized for solo developer. Both have 15+ deliverables.

### 14 — Test database strategy unspecified. Recommend Docker Compose with local Postgres.

### 16 — No .env.example in deliverables.

### 17 — No loading states, pagination, or error UX patterns specified.

### 18 — Timezone convention needed: TIMESTAMPTZ = UTC, DATE = Thai local, UI displays Asia/Bangkok.

### 19 — audit_log middleware can be deferred from Phase 1. Build table but populate from Phase 4/5 when workflows are stable.

## Low

### 20 — Concurrent sequence allocation test is genuinely hard to write reliably. Use sequential test + unique constraint as safety net.
