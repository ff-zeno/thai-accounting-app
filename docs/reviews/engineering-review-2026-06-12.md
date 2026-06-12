# Engineering Review Findings

**Date:** 2026-06-12
**Source:** Claude (Fable 5) full-codebase orientation review: active exec plans, codebase health scan, product-surface map, spot verification.
**Feeds:** `docs/exec-plans/active/engineering-hardening.md`, `ui-consistency.md`, `design-refresh.md`

## Context

~492 src files / ~124k LOC, 98 tables, 81 routes, 74 migrations, 27 Inngest function files, ~880 test files. Fundamentals verified good: consistent `org_id` scoping (sampled), audit logging (251 call sites), soft-deletes with documented exceptions, idempotency keys, zero TODOs, near-zero `any`. The March 2026 consolidated review criticals (payments table, M:N reconciliation, audit timestamps, PP36/PP30 separation) are fixed. The gap is reliability, coherence, and external validation — not features.

## Findings (ranked by leverage)

### F1 — No CI (CRITICAL)
No `.github/` directory exists. All gates (`pnpm build && pnpm test && pnpm lint`, db tests, Playwright) run manually on the honor system across 124k LOC of largely AI-written code. Regressions can land silently with every session. Highest-leverage fix available (~half a day). `docker-compose.test.yml` already exists for db tests.

### F2 — Owner-mode reset Slice 1 not actually done (CRITICAL, process)
Commit `2e967a3` "Reset owner navigation and home dashboard" rebuilt the dashboard but left `src/lib/nav/structure.ts` untouched (238 lines before and after). The "more" category still exposes ~37 pages; nothing demoted or hidden, no owner/accountant mode split. Slice 1 of `owner-mode-ux-reset.md` (nav/IA reset) is open despite history implying done. Process lesson: verify plan acceptance criteria against the running app, not commit messages.

### F3 — End-to-end flow unproven (HIGH)
The 65-route smoke proves pages render, not that the product works. No test exercises the product promise: upload bank statement → upload documents → AI extract → reconcile → review exceptions → build PP30 draft → finalize. A golden-path Playwright test with fixture data, run in CI, is the operational definition of "works end-to-end."

### F4 — Float math on money in reconciliation core (HIGH)
Violates spirit of CLAUDE.md rule 4 (NUMERIC only, never floating point):
- `src/lib/reconciliation/matcher.ts` — ~12 `parseFloat` sites incl. `===` equality on parsed amounts (lines 100, 145, 198, 258, 269, 373–374, 403, 470–471, 562–564). Equality on two 2-dp strings is coincidentally safe in doubles; arithmetic is not.
- `src/lib/tax/vat-register.ts` — accumulates VAT totals via `parseFloat` (summation drift risk).
- `src/lib/tax/rd-csv-export.ts`, `src/lib/export/csv-utils.ts` — display formatting (lower risk).
- `moneyToNumber()` defined locally in `src/lib/db/queries/documents.ts` and possibly elsewhere — no shared money utility.

### F5 — Tax-config time bombs (HIGH, date-sensitive)
- `THAI_BUSINESS_HOLIDAYS_2026` (`src/lib/tax/filing-deadlines.ts:23`) covers 2026 only. From Jan 2027, deadline rolling silently degrades to weekend-only adjustment. ~6 months out.
- VAT 7% hardcoded in 4 places: `schema.ts` column default, `pos-sales-ledger.ts`, `foreign-vendor-tax.ts` (`PP36_VAT_RATE`), and the new bulk action in `documents/document-table.tsx`. Rate validated only through Sep 2026 (~3 months out). No effective-dated config.
- Filing deadline days are static constants (`DEFAULT_TAX_CONFIG` in `filing-deadlines.ts`): whtPaper=7, whtEfiling=15, pp30Efiling=23, pp36=15. No config table; e-filing +8 extension validated only through Jan 2027.
- WHT rates duplicated: DB-driven `wht_rates` seed AND `src/lib/tax/service-categories.ts` constants. Source of truth unclear.

### F6 — External validation is the calendar critical path (HIGH, non-code)
CPA review of statutory assumptions, authenticated DBD Builder validation, exact RD/SSO export fixtures, employee 50 Tawi production-format validation, transfer-pricing form rendering. Already tracked in `completion-control.md` but not started; everything fileable is hostage to them. Legwork, parallelizable with dev — should start now.

### F7 — Uncommitted branch-scoped VAT PP30 work on main (MEDIUM, urgent hygiene)
13 files, +761 lines, migrations `drizzle/0072` + `0073`. Exploration judged it complete (schema/migrations consistent, tests updated, no orphans). Needs gates run + commit before it rots or collides. Nit: bulk action hardcodes `vatRate: "0.0700"` (feeds F5).

### F8 — Maintainability hotspots (MEDIUM)
Large files degrade AI-driven editing reliability specifically:
- `src/lib/db/queries/vat-operations-ledger.ts` — 3,696 lines (+233 pending)
- `src/lib/db/schema.ts` — 5,056 (acceptable for schema, monitor)
- `src/lib/db/queries/general-ledger.ts` — 2,630
- `src/lib/db/queries/payroll.ts` — 2,301
- `src/app/(app)/documents/document-table.tsx` — 1,048 (client component w/ embedded state machine)
- Bank `smart-upload-form.tsx` — 1,140

### F9 — Test coverage skew (MEDIUM)
Parsers/imports (96 files) and VAT (63) well covered. Payroll: ~2 test files for a 2,301-line query module + filings (PND1/PND1-Kor/SSO) — exactly where a small business "gets caught off guard." Reconciliation *rule evaluation* thin vs the matcher cascade. No explicit dead-letter audit trail for failed Inngest runs (failures live in status columns only).

### F10 — UI/UX consistency (MEDIUM, product quality)
Shared shadcn primitives exist (table, badge), but:
- 7 bespoke table implementations (document-table 1,048 lines, transaction-table 824, certificate-table 378, statement-table 172, filing-status-table 112, rule-effectiveness 81, match-trend 77). No shared data-table abstraction (sorting/filtering/selection/bulk-action logic re-implemented per table).
- 9 bespoke forms, no form framework (no react-hook-form etc.); validation patterns ad hoc per form.
- Status badge vocabulary fragmented — VAT lifecycle alone defines 8 statuses; pipeline, reconciliation, filing statuses each render their own way.
- No inventory of empty states, loading states, error/toast, confirmation-dialog, and filter-bar patterns; consistency unknown → audit needed.
- Overall look reads "AI-generated default shadcn." Owner wants a design-kit selection pass (4–5 mockup directions) after consistency is fixed.

## Sequencing recommendation

1. F7 commit in-flight work → 2. F1 CI → 3. F2 finish owner-mode Slice 1 → 4. F3 golden-path E2E → 5. F4+F5 money/tax-config hardening → 6. F9 coverage; F6 external validation runs in parallel from day one; F10 (ui-consistency plan) after owner-mode nav lands; design refresh after that.
