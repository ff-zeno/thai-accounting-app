# Goal Completion Audit — 2026-05-17

**Status:** Not complete.

This audit maps the overnight goal-mode objective to concrete artifacts and current evidence. It is intentionally conservative: missing external validation, live manual QA, or broad unfinished phase items remain open even when adjacent tests are green.

## Most Recent Gate

This is the current verification snapshot for the committed stacked branch `goal/overnight-completion-2026-05-17`. Older gate entries later in this audit are historical and should not be treated as the current baseline. These whole-tree gates do not prove that partial review slices are independently green; per-slice gates are valid only when run on the required stacked predecessors from `dirty-tree-checkpoint-2026-05-17.md`.

- `pnpm test:e2e` — 223 tests passed.
- `pnpm test` — 56 files / 633 tests passed.
- `pnpm test:db` — 40 files / 437 tests passed.
- `pnpm lint` — 0 errors / 3 existing TanStack/React Compiler warnings after mechanical unused-code cleanup.
- `pnpm build` — passed with 81 generated static app pages.
- `pnpm exec drizzle-kit check` — passed.
- `pnpm db:migrate` — passed after the packaged-stack gate, confirming migration execution beyond Drizzle SQL/journal consistency.
- `pnpm tsc --noEmit` — passed.
- `git diff --check` — passed.
- Active-code `vat_records|vatRecords|vat-records` search — no hits outside excluded docs/migrations/meta/test-results.
- Packaging — review slices are now local commits on `goal/overnight-completion-2026-05-17` from `6a6f0b2` through `a767ad2`; `main` remains at `68ba8be`.
- Dirty tree — only explicit keep-out/scratch paths remain uncommitted: 4 porcelain entries / 8 file-level paths.
- Artifact status — no tracked/untracked generated `.next`, `test-results`, `playwright-report`, coverage, dist, `.turbo`, `.vercel`, or local agent-runtime artifacts.
- Note: `pnpm test`, `pnpm build`, `pnpm lint`, `pnpm test:db`, `pnpm test:e2e`, `pnpm exec drizzle-kit check`, `pnpm tsc --noEmit`, `git diff --check`, active-code no-`vat_records` search, artifact-status check, focused compiled-pattern/exemplar unit tests (11 tests), focused inventory DB tests (29 tests), focused fixed-assets Playwright (8 tests), and focused inventory Playwright (5 tests) were refreshed after the mechanical lint cleanup. Full E2E initially exposed stale fixed-assets dashboard-create and inventory count-link click races under parallel load; tests were hardened to use persisted redirect/direct-route assertions and the final full E2E rerun passed 223 tests.
- Post-estimate reviewability refresh on 2026-05-17 revalidated the dirty-tree staging manifest against the current tree: main slices still select 306 paths, residual assigned mini-groups still select 39 paths, and the coverage model remains 345 staged paths plus 8 explicit keep-out/scratch paths. Follow-up `pnpm tsc --noEmit`, `pnpm exec drizzle-kit check`, `pnpm db:migrate`, `git diff --check`, active-code no-`vat_records`, and artifact-status checks passed.

## Objective Restatement

Goal-mode success means the app is owner-testable across VAT, WHT, foreign-vendor tax, tax workflows, GL/accounting, POS/cash flow, imports, inventory, payroll, fixed assets, analytics, CIT/audit prep, and AI copilot surfaces, with:

- Authoritative phase docs and runbook kept current.
- Phase 8.5 VAT ledger closed with no active `vat_records` runtime path.
- Remaining phases implemented as far as feasible in dependency order.
- Completed slices covered by DB/unit/integration/UI tests.
- Thai compliance behavior backed by official or primary-source research before encoding.
- High-risk slices self-reviewed and, where feasible, Claude Companion reviewed.

## Prompt-to-Artifact Checklist

| Requirement | Evidence | Status |
|---|---|---|
| Keep roadmap/runbook/phase docs authoritative | `docs/exec-plans/active/roadmap.md`, `docs/exec-plans/active/overnight-completion-control.md`, phase docs updated throughout; dirty-tree review map added in `dirty-tree-checkpoint-2026-05-17.md`; owner walkthrough plan added in `owner-test-plan-2026-05-17.md`; control docs and implementation slices are now local commits on `goal/overnight-completion-2026-05-17` | Satisfied for local branch; still needs reviewer/PR acceptance |
| Phase 8.5 VAT ledger closed/archive-ready | Runbook marks Phase 8.5 completed/archived; completed doc referenced; VAT routes/tests previously green | Automated evidence satisfied; keep bundled with schema/VAT cutover review slice |
| No active `vat_records` runtime path | Fresh 2026-05-17 code search found no `vat_records` / `vatRecords` / `vat-records` references outside docs, migrations, meta snapshots, and the deleted legacy query/test files | Automated evidence satisfied; recheck before final PR |
| Extensive tests | Focused gates run across VAT, WHT, payroll, fixed assets, analytics, copilot, all-pages smoke, TypeScript, Drizzle, diff check; full 2026-05-17 `pnpm build`, `pnpm test`, `pnpm lint`, `pnpm test:db`, and `pnpm test:e2e` gate now recorded green | Strong automated coverage for current tree; still not a substitute for owner/accountant walkthrough or external compliance validation |
| Integration tests | DB suites cover ledger/posting/payroll/assets/analytics/copilot; WHT and route Playwright flows cover UI integration | Strong for completed slices |
| UI tests | Expanded `ALL_ROUTES` smoke covers 65 static routes; focused Playwright for VAT, payroll, dashboard, fixed assets, WHT, copilot, settings/analytics from prior slices; `owner-test-plan-2026-05-17.md` supplies manual owner/accountant walkthrough coverage | Strong smoke coverage; visual regression and actual human walkthrough execution still open |
| Self-review and adversarial review | Claude Companion used on high-risk payroll audit, payroll filing/remittance hardening, payroll payment/remittance outbox, fixed-asset, fixed-asset depreciation posting-outbox, CIT, CIT accrual/payment posting-outbox hardening, posting-outbox hardening, packaging-control docs, imports payment unlink / GL reversal, close/posting readiness, POS/cash posting, inventory movement posting/outbox hardening, and BYO-Copilot settings hardening where available. Named previously skipped high-risk reviews in this audit now have follow-up closures; remaining review debt is packaging/review-slice execution plus any future feature slice. | Satisfied for named high-risk slices, but not a substitute for PR review, CPA/accountant signoff, or future-slice review |
| Official/primary-source research before compliance behavior | VAT/WHT/foreign-vendor, BOT FX, CIT, fixed-asset, PDPA payroll read-audit, DBD/TFRS source packets documented; DBD/TFRS public-source blocker refreshed 2026-05-17 | Mostly satisfied; SSO production rate/cap configuration and CPA/Builder-validated DBD/TFRS schemas remain blocked |
| Owner-testable across VAT | VAT dashboard/input/output/register/filings/forecast route smoke and ledger-backed docs | Automated v1 coverage satisfied; owner/accountant walkthrough still pending |
| Owner-testable across WHT/foreign-vendor tax | WHT action test and WHT workflow Playwright pass; PND54 separation and bilingual renderer covered | Automated coverage satisfied for local v1; not owner-shippable until live Blob/Inngest/storage QA is done |
| Owner-testable across GL/accounting | Accounting UI, posting queue, reports, CSV exports, all-pages smoke included | Partial; richer GL drilldowns/manual JE grid/close workflow remain |
| Owner-testable across POS/cash flow | `/sales`, cash-flow analytics, Section 87 reports, posting coverage from prior slices | Partial; richer matching/OCR/connectors remain |
| Owner-testable across imports | Import list/detail/finalize/classifier/payment-link surfaces, open-packet header edit, empty open-packet delete, open goods/charge line delete, and tests from prior slices | Partial; richer picker/payment-document cleanup/backfill outbox remains |
| Owner-testable across inventory | Inventory UI, SKU profile edit v1, count detail page, standalone and dashboard sign-safe adjustment paths, configurable low-stock watch, movement history, roll-forward/aged reports, COGS/document-purchase/count-variance postings, posting-outbox replay guardrails, and Claude-reviewed sale/document source validation | Partial; FIFO/specific-ID/statutory true-up/richer count edit/adjustment approval workflow remain |
| Owner-testable across payroll | Payroll dashboard/employees/allowances/pay-run detail, PIT/SSO, PND.1/PND.1 Kor/SSO filing list pages with audited submit/accept transitions, PND.1 drafts/remittance, sensitive-read audit, payroll E2E | Implementation-testable only; not production-fileable until current SSO rate/cap config is entered from official validation and exact RD/SSO exports/employee 50 Tawi land |
| Owner-testable across fixed assets | Register/detail/import/new/disposal/roll-forward, depreciation posting-outbox enqueue/handler, GL depreciation/disposal, allocation metadata, export coverage, E2E | Automated v1 coverage strong; owner walkthrough pending and richer methods/impairment remain deferred |
| Owner-testable across analytics | AR/AP, cash-flow, concentration, profitability, FX rates, dashboard drilldowns, route smoke | Automated v1 coverage strong; owner walkthrough pending and bank/WHT/realized FX remain |
| Owner-testable across CIT/audit prep | CIT/PND.51/PND.50/loss layers/year-end close/audit-pack query exports from prior slices | Phase 12a partial; Phase 12b externally blocked on CPA + authenticated DBD Builder validation |
| Owner-testable across AI copilot | `/copilot` route, typed tools, prompt router, safe draft recode apply, RBAC/confirmation/period-lock/audit tests | Automated foundation strong; owner walkthrough pending and live model orchestration/richer proposals remain |

## Current Open Items from Runbook

These unchecked items mean the goal must remain active:

- Phase 8 closeout still needs broader FedEx/Photoism held-out documents when available.
- Phase 9 still needs live manual Blob/Inngest upload timing and browser/storage inspection.
- Phase 10.5 still has broader posting engine, richer GL drilldowns, bulk opening balance import, advanced manual JE grid, and richer close workflow.
- Phase 10 still has richer processor matching, cash variance resolution, cash slip OCR/bank matching, file-upload/column-mapping POS import UX, settlement aging/escalation, branch-level propagation, Excel/PDF exports, and branch backfill/blocking workflow.
- Phase 10.6 imports still has direct-clear customs/backfill reversal depth, richer existing-document picker UX, and richer charge classifier UX. Open-packet header edit, empty-packet delete, open goods/charge line delete, open document-link unlink, payment picker, and payment unlink with GL reversal are landed.
- Phase 10.6 inventory still has FIFO/specific-ID, statutory true-up, demand forecasting automation, richer count edit workflow, and richer adjustment review/approval workflow. SKU profile edit v1, count detail page, standalone sign-safe adjustment page, and configurable low-stock watch from per-SKU reorder points are landed.
- Phase 11 payroll still has production SSO rate/cap configuration after official validation, exact RD/SSO exports, employee 50 Tawi, receipt attachment, reconciliation, and bank matching. Payroll filing list pages and audited submit/accept transitions are landed.
- Phase 14 still has bank/WHT FX revaluation, realized settlement FX, and any remaining allocation metadata gaps found during review.
- Phase 12a still has richer book-tax adjustment catalog automation and exact RD transfer-pricing form rendering/submission.
- Phase 12b remains blocked until CPA/DBD Builder-validated DBD/TFRS schemas exist; financial statements, notes, DBD Excel/Builder packet, and auditor ZIP are not implemented.
- Phase 16 still has live model/provider orchestration, richer correction proposals, and future mutation gate expansion. BYO-Copilot settings hardening and Claude follow-up review are closed for the current settings-only slice.

## Review Debt

Claude Companion packaging review on 2026-05-17 found these status risks:

- Current control docs are useful but not proof by themselves because several are untracked; they must be staged/committed with the slices they describe or treated only as a control snapshot.
- `dirty-tree-checkpoint-2026-05-17.md` now has concrete pathspec-based staging groups and per-slice gates, but no actual commits have been created yet.
- Claude Companion packaging reviews found the initial manifest understated stacked-branch dependency and could split VAT/schema/migration changes dangerously; the follow-up found WHT/GL ordering, stale residual-count wording, and docs-first overclaim risks. The checkpoint now labels the manifest as stacked, combines schema/VAT cutover into a foundational bundle, orders GL/posting before WHT and later posting-outbox workflow slices, records scratch-file dispositions, and documents per-slice gates. Claude re-review found no remaining packaging-control blockers. This is still a review aid, not a substitute for actually staging/committing the slices.
- Several high-risk slices previously skipped Claude review when the CLI was unavailable. Named skipped slices in this audit now have follow-up closures: imports payment unlink / GL reversal, close/posting readiness, POS/cash posting, inventory movement/posting-outbox, payroll payment/remittance outbox, CIT accrual/payment posting-outbox hardening, and BYO-Copilot settings hardening. No named skipped high-risk review remains open in this audit, but actual PR-ready status still requires review-slice packaging and reviewer acceptance.
- Imports payment unlink/GL reversal cleanup has now received a Claude Companion follow-up after `claude` became available on PATH. Claude found a cross-month locked-GL reversal blocker plus posting-exception cleanup and dangling reversal subledger-reference risks; fixes landed and focused imports/GL DB gates passed.
- BYO-Copilot settings follow-up ran after `claude` became available on PATH. Claude found no blockers after owner/admin verified-org gating, audit/export redaction, membership-role propagation, env-backed live enablement, bounded validation, and force-dynamic settings page hardening.
- Route smoke and owner-test plan presence are not equivalent to owner walkthrough execution.
- Full commit gate is now recorded green for the current tree, but this is still not a substitute for staged/committed review slices or external compliance validation.
- Claude Companion review closures are iterative adversarial review evidence, not independent CPA/accountant signoff or production compliance approval.

## Latest Focused Green Gates

- 2026-05-17 broader serial DB stabilization gate:
  - `pnpm vitest run --config vitest.config.db.ts src/lib/db/queries/vat-operations-ledger-schema.db.test.ts src/lib/db/queries/vat-operations-ledger.db.test.ts` — 36 tests passed.
  - `pnpm vitest run --config vitest.config.db.ts src/lib/db/queries/foreign-vendor-tax.db.test.ts` — 4 tests passed.
  - `pnpm vitest run --config vitest.config.db.ts src/lib/db/queries/general-ledger.db.test.ts` — 34 tests passed.
  - `pnpm vitest run --config vitest.config.db.ts src/lib/db/queries/payroll.db.test.ts` — 19 tests passed.
  - `pnpm vitest run --config vitest.config.db.ts src/lib/db/queries/fixed-assets.db.test.ts` — 22 tests passed.
  - `pnpm vitest run --config vitest.config.db.ts src/lib/db/queries/copilot-tools.db.test.ts` — 9 tests passed.
  - Follow-up `pnpm tsc --noEmit` and `git diff --check` passed.
- 2026-05-17 payroll filing workflow refresh:
  - `pnpm vitest run --config vitest.config.db.ts src/lib/db/queries/payroll.db.test.ts` — 19 tests passed, including submitted/accepted timestamp assertions and reference preservation.
  - `pnpm test:e2e e2e/payroll/payroll.spec.ts` — 5 tests passed, including PND.1, PND.1 Kor, and SSO submit/accept UI paths.
  - `pnpm test:e2e e2e/smoke/all-pages.spec.ts` — 65 routes passed.
  - Follow-up `pnpm tsc --noEmit` and `git diff --check` passed.
  - Claude Companion payroll filing review found two blockers: silent page-action failures and brittle row selection. Both were fixed with visible redirect messages and row-scoped Playwright actions; audit timestamp payloads and lock-boundary documentation were tightened; focused payroll DB/E2E/TypeScript/diff gate passed again.
  - Follow-up SSO remittance hardening added explicit `sso_filings.paid_at` migration/schema/query/UI/export coverage. Claude Companion found missing legacy backfill, missing remittance audit, and zero-contribution remittance issues; fixes landed with migration backfill, remittance audit rows, zero-contribution guard, and legacy-payload duplicate regression coverage. `pnpm exec drizzle-kit check`, `pnpm db:migrate`, payroll DB tests, full export tests, payroll Playwright, all-pages smoke, TypeScript, and diff check passed.
  - Filing-list workflow follow-up added PND.1 and SSO remittance CTAs after acceptance; payroll Playwright asserts the Pay controls appear, and follow-up all-pages smoke, TypeScript, and diff gates passed.
- 2026-05-17 selected Playwright stabilization bundle:
  - `pnpm test:e2e e2e/tax/vat.spec.ts e2e/accounting/accounting.spec.ts e2e/fixed-assets/fixed-assets.spec.ts e2e/analytics/analytics.spec.ts` — 29 tests passed.
  - Follow-up `pnpm tsc --noEmit` and `git diff --check` passed.
- 2026-05-17 core export/unit stabilization bundle:
  - `pnpm vitest run src/lib/export/full-export.test.ts src/lib/fixed-assets/fixed-asset-report-export.test.ts src/lib/gl/accounting-report-export.test.ts src/lib/tax/inventory-movement-report-export.test.ts src/app/(app)/tax/vat/actions.test.ts` — 23 tests passed.
  - Follow-up `pnpm tsc --noEmit` and `git diff --check` passed.
- 2026-05-17 Phase 8.5 legacy-path invariant check:
  - `rg -n "vat_records|vatRecords|vat-records" --glob '!drizzle/**' --glob '!docs/**' --glob '!**/*.md' --glob '!node_modules/**' --glob '!test-results/**' .` returned no active-code hits.
  - Broader docs/migration search only found historical migrations/meta/docs and deleted `src/lib/db/queries/vat-records.ts` / `vat-records.test.ts`.
- 2026-05-17 refreshed schema/cutover checks:
  - `rg -n "vat_records|vatRecords|vat-records" --glob '!drizzle/**' --glob '!docs/**' --glob '!**/*.md' --glob '!node_modules/**' --glob '!test-results/**' .` returned no active-code hits.
  - `pnpm exec drizzle-kit check` passed.
- 2026-05-17 post-payroll hardening VAT legacy-path refresh:
  - `rg -n "vat_records|vatRecords|vat-records" --glob '!drizzle/**' --glob '!docs/**' --glob '!**/*.md' --glob '!node_modules/**' --glob '!test-results/**' .` returned no active-code hits.
- 2026-05-17 post-source-refresh stabilization check:
  - Payroll official-source notes for RD WHT forms/50 Tawi and SSO Sor.Por.So.1-10 remain documented in `docs/exec-plans/active/phase-11-payroll.md`.
  - Employee 50 Tawi notes now cite RD Section 50 bis issuance timing and the official 50 Tawi Generator manual; live-link checks returned HTTP 200 for payroll RD/SSO source URLs including PIT, PND.1, WHT index, 50 Tawi, SSO Data Catalog, and SSO eSelf manual; production rendering remains blocked until the exact current SVS/export format and generator output are fixture-tested.
  - Follow-up SSO blocker notes now document the SSO Data Catalog and eSelf manual as validation leads, but not enough to seed production Section 33 rate/cap defaults. Payroll SSO config remains fail-closed pending current official rate/cap and submission-format validation.
  - Stale SSO production-default wording was removed from `phase-11-payroll.md`; 5% / THB 15,000 / THB 750 examples are now test-fixture config only.
  - Transfer-pricing source leads now cite RD Revenue Code Section 71 ter and the RD Director-General announcement index; live-link checks returned HTTP 200 for both pages; exact TP print/PDF rendering remains blocked until the current announcement/form asset is extracted and fixture-tested.
  - DBD/TFRS public links were live-checked: DBD Excel/XBRL manual, DBD filing manual, TFAC NPAEs page, and TFAC Q&A page all returned HTTP 200. Phase 12b remains blocked on authenticated DBD template download, CPA review, and Builder validation.
  - Fixed-asset depreciation RD source was live-checked: RD corporate income tax depreciation table returned HTTP 200; Phase 13 remains straight-line v1 with richer methods/impairment deferred.
  - Section 87 / VAT report-format RD sources were live-checked: RD English Sections 87-90, Thai Sections 87-90, and VAT Announcement No. 89 URLs all returned HTTP 200; Phase 10 tax reports remain CSV-first v1 workpapers.
  - Imports/inventory official sources were live-checked: RD VAT overview, Revenue Code Section 86/14, Thai Customs import/export duties overview, and RD Section 65 bis index URLs all returned HTTP 200; imports/inventory statutory true-up depth remains deferred/CPA-blocked where documented.
  - Phase 9 foreign-vendor/VAT/WHT source pins were live-checked: RD CIT, non-resident WHT certificate, RD ruling 0702/390, RD VAT Sections 85-86, and thailand.go non-resident WHT summary URLs all returned HTTP 200.
  - BOT FX source was live-checked: Bank of Thailand Exchange Rates API portal returned GET HTTP 200 (`HEAD` returns 405 while advertising GET/POST); Phase 14 keeps endpoint details env-configured rather than hard-coding unvalidated API credentials/templates.
  - Phase 12a CIT/TP source pins were live-checked: PND.50 PDF, RD PND.50 FAQ/TP threshold page, and RD English transfer-pricing news PDF all returned HTTP 200.
  - Active public-source live-check sweep is complete for the current compliance docs: Phase 9 foreign-vendor/VAT/WHT, Phase 10 Section 87 reports, Phase 10.6 imports/inventory, Phase 11 payroll/SSO/50 Tawi, Phase 12a CIT/TP, Phase 12b DBD/TFRS public packet, Phase 13 fixed assets, and Phase 14 BOT FX all have current source-link evidence. This does not lift external blockers: SSO production config, DBD Builder/CPA validation, exact government file exports, and live Blob/Inngest WHT storage QA remain open.
  - Earlier follow-up `pnpm tsc --noEmit`, `pnpm exec drizzle-kit check`, and `git diff --check` passed after the first docs/source refresh; the later SSO blocker note is docs-only.
  - Review packaging checkpoint now records the dirty-tree file-level count, suggested split order, local artifact exclusions, and a fresh no-active-`vat_records` code search.
- 2026-05-17 full commit/phase gate refresh:
  - `pnpm build` passed.
  - `pnpm test` passed: 56 files / 632 tests.
  - `pnpm lint` passed with 0 errors and 28 existing warnings.
  - `pnpm test:db` passed: 40 files / 401 tests.
  - `pnpm test:e2e` initially found one stale assertion in `e2e/documents/expenses.spec.ts` because the UI showed `documents+ shown`; both income/expense count assertions now accept the plus marker, targeted document E2E passed 11 tests, and full rerun passed 219 tests.
  - Follow-up `rm -rf .next/dev/types`, `pnpm tsc --noEmit`, and `git diff --check` passed.
- 2026-05-17 review packaging cleanup:
  - `.gitignore` now excludes local agent/runtime artifacts: `.codex`, `.playwright-mcp/`, `.serena/`, `.superpowers/`, `_tmp_images/`, and root `image.png`.
  - Dirty tree count after ignore cleanup is 253 porcelain entries / 329 file-level entries.
  - Dirty tree count after BYO-Copilot review closure was 258 porcelain entries / 335 file-level entries; after the 223-test Playwright/package/DB recovery and docs refresh it is 258 porcelain entries / 336 file-level entries.
- 2026-05-17 payroll SSO readiness warning:
  - `/payroll/filings/sso` now shows an SSO Rate Check before the filing table. Active config displays rates, wage cap, max contribution per side, source citation, and a verification warning; missing config displays a fail-closed warning.
  - `pnpm vitest run --config vitest.config.db.ts src/lib/db/queries/payroll.db.test.ts` passed 21 tests.
  - `pnpm test:e2e e2e/payroll/payroll.spec.ts` passed 5 tests.
  - Follow-up `.next/dev/types` cleanup, `pnpm tsc --noEmit`, and `git diff --check` passed.
- 2026-05-17 Copilot preview-only warning:
  - `/settings/ai` and `/copilot` now state that live model orchestration is preview-only; current prompts route through deterministic audited tools and write-capable tools still require preview, role checks, confirmation, period-lock checks, and audit events.
  - `pnpm test:e2e e2e/settings/ai.spec.ts e2e/copilot/copilot.spec.ts` passed 6 tests.
  - Follow-up `.next/dev/types` cleanup, `pnpm tsc --noEmit`, and `git diff --check` passed.
- 2026-05-17 outgoing WHT storage-readiness warning:
  - `/tax/wht-certificates` and `/tax/withholding/outgoing` now warn that live Blob/Inngest storage QA remains required before relying on uploaded certificate URLs in production.
  - `pnpm test:e2e e2e/tax/wht-certificates.spec.ts e2e/tax/withholding-workflow.spec.ts` passed 11 tests.
  - Follow-up `.next/dev/types` cleanup, `pnpm tsc --noEmit`, and `git diff --check` passed.
- 2026-05-17 DBD/TFRS blocked-state warning:
  - `/year-end/cit` and `/close` now warn that DBD/TFRS financial statements, notes, Builder packet, and auditor ZIP are not generated yet and remain blocked on CPA + authenticated DBD Builder validation.
  - `pnpm test:e2e e2e/year-end/cit.spec.ts e2e/analytics/analytics.spec.ts` passed 9 tests.
  - Follow-up `.next/dev/types` cleanup, `pnpm tsc --noEmit`, and `git diff --check` passed.
- 2026-05-17 post-readiness-warning route smoke:
  - `pnpm test:e2e e2e/smoke/all-pages.spec.ts` passed 65 routes after adding owner-visible readiness warnings across payroll SSO, Copilot, WHT storage, and DBD/TFRS surfaces.
  - Follow-up `.next/dev/types` cleanup, `pnpm tsc --noEmit`, and `git diff --check` passed.
- 2026-05-17 post-readiness-warning VAT legacy-path refresh:
  - `rg -n "vat_records|vatRecords|vat-records" --glob '!drizzle/**' --glob '!docs/**' --glob '!**/*.md' --glob '!node_modules/**' --glob '!test-results/**' .` returned no active-code hits.
- 2026-05-17 post-readiness-warning build/unit/lint refresh:
  - `pnpm build` passed.
  - `pnpm test` passed 56 files / 632 tests.
  - `pnpm lint` passed with 0 errors / 28 warnings.
- 2026-05-17 post-readiness-warning full DB refresh:
  - `pnpm test:db` passed 40 files / 403 tests.
- 2026-05-17 post-DB Drizzle refresh:
  - `pnpm exec drizzle-kit check` passed.
- 2026-05-17 owner walkthrough plan refresh:
  - `docs/exec-plans/active/owner-test-plan-2026-05-17.md` now includes local launch/preflight steps, latest local gate evidence, and owner/accountant walkthrough checks for SSO config readiness, WHT storage QA caveat, DBD/TFRS blocked-state caveat, and Copilot preview-only status.
- 2026-05-17 statutory tax reports v1 scope caveat:
  - `/tax/reports` now says Section 87 reports are CSV-first v1 workpapers and that Excel/PDF formats, branch-level input propagation, processor-fee VAT lanes, and PP36 reclaim lanes remain deferred.
  - `pnpm test:e2e e2e/tax/reports.spec.ts` passed 2 tests.
  - Follow-up `.next/types` + `.next/dev/types` cleanup, `pnpm tsc --noEmit`, and `git diff --check` passed.
- 2026-05-17 inventory weighted-average v1 scope caveat:
  - `/inventory` now says inventory valuation is weighted-average v1 and that FIFO, specific-ID costing, statutory true-up automation, demand forecasting, and adjustment approval workflow remain deferred/accountant-review cases.
  - `pnpm test:e2e e2e/inventory/inventory.spec.ts` passed 5 tests.
  - Follow-up `.next/types` + `.next/dev/types` cleanup, `pnpm tsc --noEmit`, and `git diff --check` passed.
- 2026-05-17 imports v1 scope caveat:
  - `/imports` said manual packet controls were testable and that direct-clear customs depth, historical backfill/reversal tooling, picker UX, and open-packet edit/delete workflows remained deferred at that point in the run.
  - `pnpm test:e2e e2e/imports/imports.spec.ts` passed 3 tests.
  - Follow-up `.next/types` + `.next/dev/types` cleanup, `pnpm tsc --noEmit`, and `git diff --check` passed.
- 2026-05-17 imports open-packet edit/delete workflow:
  - `/imports/[id]` now supports open-packet header edits for reference/declaration/port/notes and deletion of empty open packets only; finalized or non-empty packets are blocked server-side.
  - `pnpm vitest run --config vitest.config.db.ts src/lib/db/queries/imports-schema.db.test.ts` passed 22 tests.
  - `pnpm test:e2e e2e/imports/imports.spec.ts` passed 4 tests.
  - Follow-up `.next/types` + `.next/dev/types` cleanup, `pnpm tsc --noEmit`, and `git diff --check` passed.
- 2026-05-17 imports open goods/charge line delete workflow:
  - `/imports/[id]` now supports confirmed deletion of open goods lines and broker/customs charge lines; finalized packets and locked VAT/GL periods are blocked.
  - Charge-line deletion removes orphan auto-created draft import document links/source docs when no remaining charge uses them.
  - Delete audit rows include old row snapshots and action actors from server actions.
  - Claude Companion review flagged orphan documents, locked-period bypass, thin audit/no confirmation, and add/delete guard asymmetry; fixes landed before final gate.
  - `pnpm vitest run --config vitest.config.db.ts src/lib/db/queries/imports-schema.db.test.ts` passed 24 tests.
  - `pnpm test:e2e e2e/imports/imports.spec.ts` passed 5 tests.
  - Follow-up `.next/types` + `.next/dev/types` cleanup, `pnpm tsc --noEmit`, and `git diff --check` passed.
- 2026-05-17 imports document/payment unlink cleanup:
  - `/imports/[id]` now supports confirmed document unlink and payment unlink on open packets. Document unlink blocks charge-line-used documents and soft-deletes orphan draft source documents.
  - Payment unlink reverses the import-payment GL entry, releases the bank transaction, clears source outbox create rows, and writes audit snapshots.
  - Payment-link UI now lists recent unmatched debit bank transactions as selectable candidates instead of forcing UUID paste. Local adversarial review found the API still needed an explicit unmatched guard, so `linkImportPayment()` now locks and rejects already matched bank transactions server-side before insertion.
  - Claude Companion follow-up found unlink could reverse a payment JE into a locked bank-transaction GL period when that period differed from customs clearance, could hit posting-exception FK rows during outbox cleanup, and could leave reversal lines pointing at a hard-deleted import payment. Fixes landed: unlink checks the bank transaction posting date, deletes linked posting exceptions before deleting outbox rows, and clears reversal subledger refs for import-payment unlink reversals.
  - Goods, charge, import-VAT, document-link, and payment-link import mutations now share open-packet/period-lock guards.
  - `pnpm vitest run --config vitest.config.db.ts src/lib/db/queries/imports-schema.db.test.ts` passed 29 tests after the Claude follow-up fixes.
  - `pnpm vitest run --config vitest.config.db.ts src/lib/db/queries/general-ledger.db.test.ts` passed 34 tests.
  - `pnpm test:e2e e2e/imports/imports.spec.ts` passed 5 tests.
  - `pnpm test:e2e e2e/smoke/all-pages.spec.ts` passed 65 routes.
  - Follow-up `.next/types` + `.next/dev/types` cleanup, `pnpm tsc --noEmit`, `git diff --check`, and active-code `vat_records|vatRecords|vat-records` search passed again after the Claude follow-up fixes.
  - Claude Companion review completed for this GL-touching slice after the CLI became available; high/medium findings were fixed before the latest focused gate, and Claude follow-up re-review approved the fixes with no new findings.
- 2026-05-17 post-imports broader non-DB/build gate:
  - `pnpm test` passed 56 files / 632 tests.
  - `pnpm lint` passed with 0 errors / 28 existing warnings.
  - `pnpm build` passed and generated 82 static app pages.
  - Follow-up `.next/types` + `.next/dev/types` cleanup, `pnpm tsc --noEmit`, and `git diff --check` passed.
- 2026-05-17 full E2E stabilization after imports document/payment cleanup:
  - Initial full `pnpm test:e2e` reruns exposed three stateful E2E weaknesses against the polluted long-running local org: inventory receipt SKU selection could race hydration under full-suite load, TikTok PP36 calendar expected a clean finite random period while prior fixtures already existed, and inventory count detail clicked the first shared `2026-06-30` link instead of the seeded count.
  - Hardened `e2e/documents/review-learning.spec.ts` to wait for the seeded SKU select value before submit, verify the seeded PP36 obligation is allocated, and assert the calendar amount from the built PP36 draft total.
  - Hardened `e2e/inventory/inventory.spec.ts` to click the exact seeded count detail href.
  - Targeted gates passed: `pnpm test:e2e e2e/documents/review-learning.spec.ts` — 6 tests; `pnpm test:e2e e2e/inventory/inventory.spec.ts` — 5 tests.
  - Full rerun passed: `pnpm test:e2e` — 221 tests.
  - Follow-up `.next/types` + `.next/dev/types` cleanup, `pnpm tsc --noEmit`, and `git diff --check` passed.
  - Follow-up active-code search for `vat_records`, `vatRecords`, and `vat-records` returned no hits outside excluded docs/migrations/meta/test-results.
  - After the import payment unmatched-transaction guard landed, full `pnpm test:e2e` passed again: 221 tests; follow-up `.next/types` + `.next/dev/types` cleanup, `pnpm tsc --noEmit`, and `git diff --check` passed.
- 2026-05-17 post-E2E full DB refresh:
  - `pnpm test:db` passed: 40 files / 412 tests.
  - After the import payment unmatched-transaction guard landed, `pnpm test:db` passed again: 40 files / 413 tests.
- 2026-05-17 inventory movement posting/outbox hardening:
  - Claude Companion initial review found blockers around count-variance GL/SKU divergence, replay period locks, phantom sale-out sources, missing document IDs, sign-inverted manual adjustments, and impossible direct E2E fixtures.
  - Fixes landed for all blocking findings; final Claude follow-up reported no blocking findings.
  - `pnpm vitest run --config vitest.config.db.ts src/lib/db/queries/inventory.db.test.ts` passed 29 tests.
  - `pnpm vitest run --config vitest.config.db.ts src/lib/db/queries/general-ledger.db.test.ts` passed 34 tests.
  - `pnpm test:e2e e2e/inventory/inventory.spec.ts` passed 5 tests.
  - `pnpm test:e2e e2e/documents/review-learning.spec.ts --workers=1` passed 6 tests after a combined parallel run showed unrelated toast/state flake.
  - Follow-up `.next/types` + `.next/dev/types` cleanup, `pnpm tsc --noEmit`, `git diff --check`, and active-code `vat_records|vatRecords|vat-records` search passed.
- 2026-05-17 payroll payment/remittance posting-outbox hardening:
  - Claude Companion review found high/medium findings around filing-status remittance gates, missing pay-run audit trail, replay source-state drift, JE prefix races, and GL close race windows.
  - Fixes landed for high findings plus JE-prefix and GL advisory-lock hardening; final Claude follow-up reported no blocking findings.
  - `pnpm vitest run --config vitest.config.db.ts src/lib/db/queries/payroll.db.test.ts` passed 22 tests.
  - `pnpm vitest run --config vitest.config.db.ts src/lib/db/queries/general-ledger.db.test.ts` passed 34 tests.
  - `pnpm test:e2e e2e/payroll/payroll.spec.ts` passed 5 tests.
  - Follow-up `.next/types` + `.next/dev/types` cleanup, `pnpm tsc --noEmit`, `git diff --check`, and active-code `vat_records|vatRecords|vat-records` search passed.
- 2026-05-17 post-E2E non-DB/build refresh:
  - `pnpm test` passed: 56 files / 632 tests.
  - `pnpm lint` passed with 0 errors / 28 existing warnings.
  - `pnpm build` passed and generated 82 static app pages.
  - Follow-up `.next/types` + `.next/dev/types` cleanup, `pnpm tsc --noEmit`, `git diff --check`, and `pnpm exec drizzle-kit check` passed.
- 2026-05-17 close/posting readiness Claude follow-up:
  - Claude Companion found a critical close invariant gap where `drainPostingOutbox()` could leave retrying rows but still allow GL locking; medium findings also covered drain-to-lock enqueue race, reversed CIT accrual readiness, server-side year-end close readiness, oldest-first recent periods, and dead close-checklist branch.
  - Fixes landed: manual/close drains fail closed on retrying or incomplete through-date rows while cron keeps retry-friendly behavior, GL lock action and enqueue use the same org/period advisory lock, CIT accrual readiness/year-end close ignore reversed accrual JEs, `postYearEndCloseAction()` rechecks readiness/posting queue server-side, recent close periods sort newest first, and close checklist completion uses one update path.
  - Evidence: `pnpm vitest run --config vitest.config.db.ts src/lib/db/queries/wht-credits-received.db.test.ts` passed 22 tests; `pnpm vitest run --config vitest.config.db.ts src/lib/db/queries/close-checklists.db.test.ts` passed 6 tests serially; `pnpm vitest run --config vitest.config.db.ts src/lib/db/queries/general-ledger.db.test.ts` passed 34 tests serially; `pnpm test:e2e e2e/accounting/accounting.spec.ts e2e/analytics/analytics.spec.ts` passed 16 tests; `.next/types` + `.next/dev/types` cleanup, `pnpm tsc --noEmit`, `git diff --check`, and active-code no-`vat_records` search passed. Claude follow-up re-review approved with no new findings.
- 2026-05-17 POS/cash posting Claude follow-up:
  - Claude Companion found medium gaps in POS gross/base/VAT server-side tie-out and source-row audit logging, plus low CSV BOM and duplicate-message issues.
  - Fixes landed: POS source creation validates gross equals tax base plus VAT before insert, POS/cash/processor source rows write `audit_log` rows inside the same transaction as source+VAT/GL/outbox writes, POS CSV import strips UTF-8 BOM headers, and duplicate manual POS sale submits return a friendly error.
  - Evidence: `pnpm vitest run --config vitest.config.db.ts src/lib/db/queries/pos-sales-ledger-schema.db.test.ts` passed 16 tests; `pnpm vitest run --config vitest.config.db.ts src/lib/db/queries/general-ledger.db.test.ts` passed 34 tests serially; `pnpm test:e2e e2e/sales/pos.spec.ts` passed 2 tests; `.next/types` + `.next/dev/types` cleanup, `pnpm tsc --noEmit`, `git diff --check`, and active-code no-`vat_records` search passed. Claude follow-up re-review approved with no new findings.
- 2026-05-17 post-import-edit-delete broad smoke:
  - `pnpm test:e2e e2e/smoke/all-pages.spec.ts` passed 65 routes after imports header/delete and child-line delete slices.
  - Follow-up `.next/types` + `.next/dev/types` cleanup, `pnpm tsc --noEmit`, and `git diff --check` passed.
  - Refreshed active-code search for `vat_records`, `vatRecords`, and `vat-records` returned no hits outside excluded docs/migrations/meta/test-results.
- 2026-05-17 fixed-assets straight-line v1 scope caveat:
  - `/fixed-assets` now says straight-line register/schedule/roll-forward/disposal/GL/CSV import are testable and that declining-balance, units-of-production, impairment workflow, and method changes remain deferred.
  - `pnpm test:e2e e2e/fixed-assets/fixed-assets.spec.ts` passed 8 tests after adding malformed import-result URL coverage.
  - Follow-up `.next/types` + `.next/dev/types` cleanup, `pnpm tsc --noEmit`, and `git diff --check` passed.
- 2026-05-17 GL compact-v1 scope caveat:
  - `/accounting` now says COA/opening/manual/reversal/posting-queue/close-readiness/CSV/drill-through are testable and that bulk opening balance import, advanced journal grids, richer statement drilldowns, and full close workflow orchestration remain deferred.
  - `pnpm test:e2e e2e/accounting/accounting.spec.ts` passed 8 tests.
  - Follow-up `.next/types` + `.next/dev/types` cleanup, `pnpm tsc --noEmit`, and `git diff --check` passed.
- 2026-05-17 post-v1-caveat route smoke:
  - `pnpm test:e2e e2e/smoke/all-pages.spec.ts` passed 65 routes after adding owner-visible v1 caveats for imports, fixed assets, and GL/accounting.
  - Follow-up `.next/types` + `.next/dev/types` cleanup, `pnpm tsc --noEmit`, and `git diff --check` passed.
- 2026-05-17 sales manual/CSV v1 scope caveat:
  - `/sales` now says manual sales/POS CSV/cash deposits/processor settlements/VAT output/GL posting are testable and that processor matching, cash variance resolution, cash-slip OCR/bank matching, connector imports, and Excel/PDF statutory exports remain deferred.
  - `pnpm test:e2e e2e/sales/pos.spec.ts` passed 2 tests.
  - Follow-up `.next/types` + `.next/dev/types` cleanup, `pnpm tsc --noEmit`, and `git diff --check` passed.
- 2026-05-17 FX AR/AP v1 scope caveat:
  - `/analytics/fx-rates` now says manual BOT rates/coverage/retry/fully unpaid AR/AP revaluation are testable and that partially paid documents, bank-account FX, WHT-credit FX, and realized settlement FX remain deferred.
  - `pnpm test:e2e e2e/analytics/analytics.spec.ts` passed 8 tests.
  - Follow-up `.next/types` + `.next/dev/types` cleanup, `pnpm tsc --noEmit`, and `git diff --check` passed.
- 2026-05-17 payroll workflow-testable v1 scope caveat:
  - `/payroll` now says employee setup, allowances, draft pay runs, PIT/SSO calculation, filing lists, submit/accept status, remittance posting, and sensitive-read audit are testable; production filing still needs current SSO config validation, exact RD/SSO exports, employee 50 Tawi, receipt attachment, reconciliation hooks, and bank matching.
  - `pnpm test:e2e e2e/payroll/payroll.spec.ts` passed 5 tests.
  - Follow-up `.next/types` + `.next/dev/types` cleanup, `pnpm tsc --noEmit`, and `git diff --check` passed.
- 2026-05-17 CIT working-paper v1 scope caveat:
  - `/year-end/cit` now says PND.51/PND.50 drafts, loss layers, manual book-tax adjustments, WHT credits, CIT accrual/payment posting, and transfer-pricing threshold flagging are testable; richer book-tax adjustment catalog automation and exact RD transfer-pricing form rendering/submission remain deferred.
  - `pnpm test:e2e e2e/year-end/cit.spec.ts` passed 1 test.
  - Follow-up `.next/types` + `.next/dev/types` cleanup, `pnpm tsc --noEmit`, and `git diff --check` passed.
- 2026-05-17 post-sales-FX-payroll-CIT route smoke:
  - `pnpm test:e2e e2e/smoke/all-pages.spec.ts` passed 65 routes after adding owner-visible v1 caveats for sales, FX, payroll, and CIT.
  - Follow-up `.next/types` + `.next/dev/types` cleanup, `pnpm tsc --noEmit`, and `git diff --check` passed.
  - Refreshed active-code search for `vat_records`, `vatRecords`, and `vat-records` returned no hits outside excluded docs/migrations/meta/test-results.
- 2026-05-17 Phase 9 full-tax-invoice claimability hardening:
  - Official RD Revenue Code Sections 85-86 page was refreshed and documented in `phase-9-foreign-vendor-tax.md`; the implementation now treats abbreviated/non-tax-invoice evidence as non-claimable for input VAT allocation.
  - `createVatInputItem()` rejects claimable/allocated/filed input VAT unless subtype is `full_ti` or `e_tax_invoice` and invoice no/date are present; PP30 candidate, dashboard, and forecast claimable-input queries explicitly filter to the same evidence.
  - DB constraint `vat_input_claimable_requires_full_tax_invoice_check` enforces the same invariant through migration `0070_vat_input_full_tax_invoice_claimable.sql`; the migration now prechecks existing rows and raises a clear remediation error instead of failing opaquely.
  - Claude Companion review flagged migration-precheck, narrow-test, and error-message findings; fixes landed before final gate.
  - `pnpm exec drizzle-kit check`, `pnpm db:migrate`, VAT ledger schema/behavior DB tests (38 tests), `pnpm tsc --noEmit`, `git diff --check`, and stale-constraint-name grep passed with only expected historical/migration references.
- 2026-05-17 Phase 12a CIT accrual/payment posting-outbox hardening:
  - Claude Companion found zero-net-payable close, GL-derived profit after close/reversal, unpaid PND.51 prepayment, reversal idempotency, and GL period-lock race risks.
  - Fixes landed: PND.51 payments post to prepaid CIT account 1186; PND.50 accrual books gross CIT expense, relieves WHT/prepayment credits, and credits 2170 only for net payable; PND.51 credits count only after `paid_at`; GL-derived PND.50 profit excludes reversed/close JEs; year-end close requires accrual whenever `cit_calculated > 0`; reversed source-linked JEs can be reposted through migration `0071_journal_entries_active_source_unique.sql`; reverse JE and GL period lock paths now take matching row/advisory locks.
  - Evidence: `pnpm vitest run --config vitest.config.db.ts src/lib/db/queries/cit-filings.db.test.ts` passed 24 tests; `pnpm vitest run --config vitest.config.db.ts src/lib/db/queries/general-ledger.db.test.ts` passed 39 tests; `pnpm exec drizzle-kit check`; `pnpm test:e2e e2e/year-end/cit.spec.ts e2e/analytics/analytics.spec.ts` passed 9 tests; `.next/types` + `.next/dev/types` cleanup; `pnpm tsc --noEmit`; `git diff --check`; active-code `vat_records|vatRecords|vat-records` search passed. Claude follow-up reported no blockers.
- 2026-05-17 post-CIT-hardening full DB regression:
  - `pnpm test:db` initially caught one stale POS CSV SKU fixture still expecting only sale/COGS JEs after inventory manual-adjustment hardening; the fixture now expects the stock-seeding adjustment JE plus POS sale and COGS.
  - Evidence: `pnpm vitest run --config vitest.config.db.ts src/lib/db/queries/pos-sales-ledger-schema.db.test.ts` passed 16 tests; rerun `pnpm test:db` passed 40 files / 434 tests; follow-up `pnpm tsc --noEmit`, `git diff --check`, and active-code no-`vat_records` search passed.
- 2026-05-17 Phase 13 fixed-asset depreciation posting-outbox Claude review:
  - Claude Companion found missing GL mappings for `intangible_other` and `natural_resource_right`, a disposal-vs-pending-depreciation race, silent monthly cron per-org failures, and duplicate enqueue risk.
  - Fixes landed: new COA seed accounts for intangible amortization and natural-resource depletion, category mappings for depreciation/disposal, disposal blocks same-period pending/retrying/failed depreciation outbox rows, monthly cron failures write audit-log evidence without aborting the batch, and enqueue now serializes/reuses open period rows under an org-period advisory lock.

- 2026-05-17 Phase 16 BYO-Copilot settings review closure:
  - Claude Companion found no blockers after verified-org owner/admin gating, audit/export secret redaction, membership-role Copilot tool execution, env-backed live enablement, bounded validation, and force-dynamic settings page hardening.
  - Follow-up hardening changed AI settings audit payloads to an allowlist with secret-reference presence booleans, narrowed admin guard role typing, and kept secret references out of JSON/CSV export.
  - Historical evidence at that point: `pnpm vitest run --config vitest.config.db.ts src/lib/db/queries/ai-settings.db.test.ts src/lib/db/queries/copilot-tools.db.test.ts` passed 11 tests; `pnpm vitest run src/lib/export/full-export.test.ts` passed 9 tests; `pnpm vitest run src/app/\(app\)/tax/vat/actions.test.ts` passed 9 tests; `pnpm test:e2e e2e/settings/ai.spec.ts e2e/copilot/copilot.spec.ts` passed 6 tests; `pnpm test:db` passed 40 files / 437 tests; `pnpm test` passed 56 files / 633 tests; `pnpm lint` passed with 0 errors / 30 existing warnings before the later mechanical lint cleanup; `pnpm build` passed; `pnpm exec drizzle-kit check` passed; full `pnpm test:e2e` passed 221 tests after fixing the `/sales` string-date render crash and later 223 tests after fixed-assets import-result recovery; follow-up `pnpm tsc --noEmit`, `git diff --check`, and active-code no-`vat_records` search passed. Current lint baseline is 0 errors / 3 TanStack warnings.
  - Evidence: `pnpm vitest run --config vitest.config.db.ts src/lib/db/queries/fixed-assets.db.test.ts` passed 26 tests; `pnpm vitest run --config vitest.config.db.ts src/lib/db/queries/general-ledger.db.test.ts` passed 39 tests; export/dispatch/report unit tests passed 11 tests; `pnpm test:e2e e2e/fixed-assets/fixed-assets.spec.ts` passed 8 tests after import-result URL hardening; follow-up fixed-assets DB, `pnpm tsc --noEmit`, `git diff --check`, and active-code no-`vat_records` search passed. Claude follow-up reported no blockers.
- 2026-05-17 full E2E rerun after sales regression and fixed-asset import-result hardening:
  - Added `/sales` E2E coverage for pending channel balances when aggregate timestamp values hydrate as strings.
  - First 222-test full Playwright rerun then exposed a fixed-assets CSV import workflow gap: the import succeeded, but the dashboard register is capped/order-dependent, so the newly imported asset was not guaranteed visible after returning to `/fixed-assets`.
  - Fix landed: CSV import redirects back with created asset IDs, `/fixed-assets/import` renders direct imported-asset links, and E2E asserts the owner-visible import result instead of relying on the capped dashboard list.
  - Claude Companion found malformed-UUID and oversized-redirect risks in the import-result links; fixes landed with UUID filtering, a 50-link redirect cap, a defensive query cap, href assertion, malformed-URL smoke, pluralized status text, and caller-side imported-row ordering. Claude follow-up re-review approved with no blockers.
  - Evidence: `pnpm test:e2e e2e/fixed-assets/fixed-assets.spec.ts` passed 8 tests; full `pnpm test:e2e` passed 223 tests after the Claude follow-up hardening; `pnpm vitest run --config vitest.config.db.ts src/lib/db/queries/fixed-assets.db.test.ts` passed 26 tests; `pnpm tsc --noEmit`; `git diff --check`; active-code `vat_records|vatRecords|vat-records` search returned no hits outside excluded docs/migrations/meta/test-results.
- 2026-05-17 historical package/DB gate after Playwright recovery:
  - `pnpm test` passed 56 files / 633 tests.
  - `pnpm lint` passed with 0 errors / 30 existing warnings at that point; current lint baseline is 0 errors / 3 TanStack warnings.
  - `pnpm build` passed and generated 81 static app pages.
  - `pnpm exec drizzle-kit check` passed.
  - `pnpm test:db` passed 40 files / 437 tests.

Historical planned gate commands kept for traceability:

- `pnpm tsc --noEmit`
- `pnpm exec drizzle-kit check`
- `pnpm db:migrate`
- `pnpm vitest run --config vitest.config.db.ts src/lib/db/queries/payroll.db.test.ts`
- `pnpm vitest run --config vitest.config.db.ts src/lib/db/queries/copilot-tools.db.test.ts`
- `pnpm vitest run --config vitest.config.db.ts src/lib/db/queries/general-ledger.db.test.ts` serial
- `pnpm vitest run --config vitest.config.db.ts src/lib/db/queries/allocation-rules.db.test.ts` serial
- `pnpm vitest run src/app/(app)/tax/wht-certificates/actions.test.ts`
- `pnpm test:e2e e2e/payroll/payroll.spec.ts`
- `pnpm test:e2e e2e/dashboard/page.spec.ts`
- `pnpm test:e2e e2e/tax/withholding-workflow.spec.ts`
- `pnpm test:e2e e2e/smoke/all-pages.spec.ts`
- `pnpm test:e2e e2e/copilot/copilot.spec.ts`
- `git diff --check`

## Stop/Continue Decision

Do not mark the goal complete. The current tree is much more owner-testable than the starting point, but multiple explicit requirements remain incomplete or externally blocked. The next best engineering move is stabilization and review-splitting before more broad feature work:

1. Split or commit reviewable slices from the dirty tree.
2. Run a broader serial DB gate and selected Playwright bundle.
3. Choose one remaining slice only after the tree is reviewable and a user-approved design exists for any new feature/behavior implementation.
