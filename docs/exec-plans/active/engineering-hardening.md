# Plan: Engineering Hardening

**Status:** Active. Documented 2026-06-12, execution not started.
**Source findings:** `docs/reviews/engineering-review-2026-06-12.md` (F1, F3–F9).
**Sequencing:** Tasks 1–2 first (protect everything after). Runs alongside `owner-mode-ux-reset.md`; does not add product surface. Task 9 (external validation) is owner legwork — start immediately, it is calendar time, not code time.

## Problem

The app is a broad ~124k-LOC baseline with good fundamentals but no enforcement: no CI, no end-to-end flow proof, float math in the reconciliation core, date-bombed tax config (2026-only holidays, VAT 7% hardcoded, rate validity expiring Sep 2026), test coverage skewed away from payroll, and 761 lines of completed-but-uncommitted VAT work sitting on main.

## Requirements

- Every PR automatically runs typecheck, lint, unit tests, db tests, and Playwright smoke.
- One golden-path E2E proves: statement upload → document upload → extraction → reconciliation → PP30 draft.
- No `parseFloat`/`Number()` arithmetic or comparison on monetary values anywhere in src/.
- All Thai tax parameters (VAT rate, deadline days, holidays, WHT rates) come from one effective-dated source; calendar covers ≥2027.
- Payroll and reconciliation-rule evaluation have meaningful test coverage.
- In-flight VAT branch work committed; no dirty tree on main.

## Approach

CI first because it makes every later task enforceable. Money math via a single shared utility comparing/summing NUMERIC strings as integer satang — no decimal library dependency needed for 2-dp THB (rejected: decimal.js — extra dep for what integer satang covers). Tax config centralized into the existing tax-config pattern with effective dates, mirroring how `wht_rates` already works (rejected: per-org config — statutory values are national; org overrides only where law allows). Large-file splits deferred to a follow-up task and done opportunistically when a file is touched (rejected: big-bang refactor — churn without behavior change competes with owner-mode reset).

## Tasks

- [ ] **1. Commit in-flight VAT branch work.** Run `pnpm build && pnpm test && pnpm lint`; fix any failures; commit the 13 dirty files + `drizzle/0072`/`0073` as `feat(vat): branch-scoped PP30 and document VAT source controls`. Requires owner permission per CLAUDE.md rule 1.
- [ ] **2. Add CI.** Create `.github/workflows/ci.yml`: pnpm install → `tsc --noEmit` → `pnpm lint` → `pnpm test` → db tests via `docker-compose.test.yml` (`pnpm test:db`) → `pnpm build` → Playwright smoke (`e2e/smoke/all-pages.spec.ts`) against a build with seeded test db. Cache pnpm store. Require green on PRs to main.
- [ ] **3. Golden-path E2E.** New `e2e/golden-path/owner-month.spec.ts` + fixtures (sample KBank CSV, 2–3 sample invoices already in repo test assets if present, else add). Flow: upload statement → upload expense doc → run extraction (mock AI at the OpenRouter boundary) → confirm match → see VAT line → build PP30 draft. Wire into CI.
- [ ] **4. Shared money utility.** Create `src/lib/utils/money.ts`: `satang(amount: string): bigint`, `addMoney`, `compareMoney`, `moneyEquals`, plus `moneyToNumber` for display only (clearly named `unsafeMoneyToDisplayNumber`). Unit tests incl. rounding edges.
- [ ] **5. Replace float money math.** Migrate `src/lib/reconciliation/matcher.ts` (all ~12 sites), `src/lib/tax/vat-register.ts` accumulation, and local `moneyToNumber` in `src/lib/db/queries/documents.ts` to the utility. Display-only sites in `rd-csv-export.ts` / `csv-utils.ts` may keep formatting but route through the utility.
- [ ] **6. Lint guard.** Add ESLint `no-restricted-syntax` rule blocking `parseFloat` outside `src/lib/utils/money.ts` (allowlist non-monetary uses explicitly).
- [ ] **7. Centralize tax config.** Single effective-dated source for: VAT rate (replace 4 hardcodes: `schema.ts` default, `pos-sales-ledger.ts`, `foreign-vendor-tax.ts` `PP36_VAT_RATE`, `documents/document-table.tsx` bulk action), filing deadline days (`DEFAULT_TAX_CONFIG`), e-filing +8 extension validity, and WHT rate source-of-truth (drop the duplicate constants in `service-categories.ts` in favor of `wht_rates`). Verify current statutory values against official RD sources and record retrieval dates per operating rules.
- [ ] **8. 2027 holiday calendar.** Extend `src/lib/tax/filing-deadlines.ts` holiday data beyond 2026 (official BOT/RD list, capture retrieval date); add a test that fails when the calendar's last year < current year + 1, so this can never silently expire again.
- [ ] **9. External validation kickoff (owner legwork, track here).** Open checklist items with owner: CPA review session booked; DBD Builder credentials obtained; real RD CSV / SSO fixtures collected; employee 50 Tawi production sample obtained. Code-side: build fixture-comparison tests as each artifact arrives.
- [ ] **10. Payroll + recon-rule test coverage.** Integration tests for payroll posting flow and PND1/SSO filing generation (`src/lib/db/queries/payroll.ts`); unit tests for reconciliation rule evaluation paths not covered by matcher-cascade tests.
- [ ] **11. Inngest failure visibility.** Add a small failed-run audit trail (table or reuse `audit_log`) for terminal Inngest failures + a retry affordance surfaced in extraction health admin page.
- [ ] **12. (Opportunistic) Split `vat-operations-ledger.ts`** (3,696 lines) into create/allocate/readiness/filing modules next time it is materially edited. Same policy for `general-ledger.ts`, `payroll.ts`.

## Verification

- [ ] CI green on a deliberately-broken test PR (proves gates actually fail).
- [ ] Golden-path spec passes locally and in CI.
- [ ] `grep -rE "parseFloat" src/ --include="*.ts" --include="*.tsx"` returns only `src/lib/utils/money.ts` + explicit allowlist.
- [ ] `grep -rn "0.0700" src/` returns only the central tax config (+ tests).
- [ ] Holiday-coverage test fails when calendar year list is truncated to 2026 (manual check), passes with 2027 data.
- [ ] `pnpm build && pnpm test && pnpm lint` green; clean git tree after Task 1.
