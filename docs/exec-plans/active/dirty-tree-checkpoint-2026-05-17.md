# Dirty Tree Checkpoint — 2026-05-17

**Status:** Active review map for the packaged overnight goal-mode branch.

This checkpoint separates the overnight implementation into coherent review slices. It began as a dirty-tree map; the slices are now local commits on `goal/overnight-completion-2026-05-17`, with only explicit keep-out/scratch paths left uncommitted.

Current count note:
- Baseline commit: `68ba8be005ec36e943c71e200f2410a9c11313fa`.
- `git status --porcelain=v1 | wc -l` reported 254 porcelain entries after the imports document/payment unlink and payment-picker follow-up.
- `git status --porcelain=v1 --untracked-files=all | wc -l` reported 331 file-level entries after the imports document/payment unlink and payment-picker follow-up: 87 modified tracked files, 5 deleted tracked files, and 240 untracked files.
- Counts remained 254 porcelain entries / 331 file-level entries after the full E2E stabilization hardening for document review and inventory specs.
- After BYO-Copilot hardening, review-debt closure, full DB/unit/lint/build refresh, and docs updates, `git status --short | wc -l` reports 258 porcelain entries and `git status --porcelain=v1 --untracked-files=all | wc -l` reports 335 file-level entries.
- After the `/sales` aggregate-date regression, fixed-assets import-result hardening, 223-test full Playwright recovery, full package gate, full DB gate, and docs refresh, `git status --short | wc -l` reports 258 porcelain entries and `git status --porcelain=v1 --untracked-files=all | wc -l` reports 336 file-level entries.
- After the mechanical lint cleanup, `git status --short | wc -l` reports 275 porcelain entries and `git status --porcelain=v1 --untracked-files=all | wc -l` reports 353 file-level entries. The warning count is now 0 errors / 3 existing TanStack/React Compiler warnings; focused compiled-pattern/exemplar unit tests and inventory DB tests passed.
- After final fixed-assets/inventory E2E race hardening, counts remain 275 porcelain entries / 353 file-level entries. Focused fixed-assets Playwright passed 8 tests, focused inventory Playwright passed 5 tests, and full `pnpm test:e2e` passed 223 tests; artifact status remains clean.
- After the owner-test plan launch/evidence refresh, the control snapshot staging command was revalidated with `git add -n` and still selects 15 files.
- The foundational all-phase schema/migration + VAT cutover staging command was also revalidated with `git add -n` and still selects 66 paths, including `drizzle/meta/_journal.json`, migrations `0030`-`0071`, VAT ledger runtime/tests/routes, full export changes, and deleted legacy `vat-records` query/test files. This slice is intentionally broader than Phase 8.5 because Drizzle journal/schema/export changes span multiple later phases.
- Main manifest slices 3-11 were revalidated with `git add -n` after the owner-test refresh and Claude packaging follow-up, and still select the documented counts: extraction 28, GL/posting 27, WHT/foreign-vendor 35, POS/tax reports 23, imports/inventory 22, payroll 15, fixed assets 15, CIT/analytics 34, and Copilot/nav/settings 26.
- Residual mini-groups were revalidated with `git add -n` after the owner-test refresh and still select the documented counts: nav/layout 5, dashboard/analytics 4, documents/extraction 7, tax workflow/upload 4, GL/posting/period-lock 3, analytics/FX 4, fixed-assets cron 1, and baseline cleanup 11.
- Current manifest coverage comparison: 353 dirty file-level paths, 345 paths covered by validated staging groups, and 8 uncovered keep-out/scratch paths. No unclassified dirty files remain outside the staging manifest plus keep-out list.
- Refreshed invariant checks after manifest coverage: artifact-status search found no tracked/untracked build/test/runtime artifact paths, and active-code search in `src`/`e2e` found no `vat_records`, `vatRecords`, or `vat-records` hits.
- After Claude packaging re-review and follow-up doc fixes, dirty counts remain 275 porcelain entries / 353 file-level entries, and the only uncovered paths remain the 8 explicit keep-out/scratch paths listed below.
- After compliance-source doc refreshes for payroll/SSO, 50 Tawi, TP, DBD/TFRS, and fixed assets, `git status --short | wc -l` reports 276 porcelain entries while the file-level count and coverage stay stable: 353 dirty file-level paths, 345 staging-covered paths, and the same 8 keep-out/scratch paths.
- After the later Phase 9/10/11/12a/14 source live-check batch, the counts and coverage remain unchanged: 276 porcelain entries, 353 dirty file-level paths, 345 staging-covered paths, and the same 8 keep-out/scratch paths.
- After the final SSO wording cleanup in the audit/runbook, counts and coverage still remain unchanged: 276 porcelain entries, 353 dirty file-level paths, 345 staging-covered paths, and the same 8 keep-out/scratch paths.
- After adding the new-feature design-approval stop condition, counts and coverage still remain unchanged: 276 porcelain entries, 353 dirty file-level paths, 345 staging-covered paths, and the same 8 keep-out/scratch paths.
- Post-estimate reviewability refresh on 2026-05-17 revalidated the manifest against the current tree: 276 porcelain entries, 353 file-level paths, main slices still selecting 306 paths, residual assigned mini-groups still selecting 39 paths, and coverage still 345 staging-covered paths plus the same 8 keep-out/scratch paths. Follow-up TypeScript, Drizzle check, `pnpm db:migrate`, diff check, active-code no-`vat_records`, and artifact-status checks passed.
- After packaging into local stacked commits on `goal/overnight-completion-2026-05-17`, implementation/control slices are committed from `6a6f0b2` through `a767ad2` and published as draft PR #1: `https://github.com/ff-zeno/thai-accounting-app/pull/1`. The only remaining uncommitted paths are the 8 explicit keep-out/scratch paths: five benchmark PNGs, `docs/_ai_context/skills-cleanup-plan.md`, `scripts/check-ksher-cat.ts`, and `vat-info.md`.
- Final packaged-stack gate passed: `pnpm test` 56 files / 633 tests, `pnpm lint` 0 errors / 3 existing warnings, `pnpm build` 81 static pages, `pnpm test:db` 40 files / 437 tests, `pnpm test:e2e` 223 tests, `pnpm exec drizzle-kit check`, `pnpm db:migrate`, `pnpm tsc --noEmit`, `git diff --check`, active-code no-`vat_records`, and artifact-status check.
- Post-gate artifact check found no tracked/untracked `test-results`, `playwright-report`, `.next`, `node_modules`, coverage, dist, `.turbo`, `.vercel`, or local agent-runtime artifacts in `git status --porcelain=v1 --untracked-files=all`.
- Fresh post-build artifact check after the BYO-Copilot gate also found no tracked/untracked `test-results`, `playwright-report`, `.next`, `node_modules`, coverage, dist, `.turbo`, `.vercel`, `.codex`, `.playwright-mcp`, `.serena`, `.superpowers`, `_tmp_images`, or root `image.png` entries in `git status --porcelain=v1 --untracked-files=all`.
- Fresh post-223-E2E artifact check also found no tracked/untracked `test-results`, `playwright-report`, `.next`, `node_modules`, coverage, dist, `.turbo`, `.vercel`, `.codex`, `.playwright-mcp`, `.serena`, `.superpowers`, `_tmp_images`, or root `image.png` entries in `git status --porcelain=v1 --untracked-files=all`.
- The default count collapses untracked directories, so use the file-level count for review sizing and the porcelain count only as a quick status signal.
- Local/tool artifacts such as `.codex`, `.playwright-mcp/`, `.serena/`, `.superpowers/`, `_tmp_images/`, and `image.png` are ignored by `.gitignore`; keep them out of review unless intentionally needed.
- The remaining count may still include scratch helpers such as `scripts/check-ksher-cat.ts`; review/commit splitting should exclude those unless intentionally needed.
- Review intentionality before staging unclassified untracked docs or data such as `vat-info.md`, `docs/_ai_context/skills-cleanup-plan.md`, `benchmarks/_ground-truth-pages/`, and dogfood helper files.

Current file-level top-level breakdown after the mechanical lint cleanup:

- `src`: 244 entries
- `drizzle`: 43 entries
- `docs`: 29 entries
- `e2e`: 23 entries
- `benchmarks`: 9 entries
- single-file entries: `.gitignore`, `CLAUDE.md`, `DESIGN.md`, `scripts`, `vat-info.md`

## Suggested Review Split Order

Use this order when converting the tree into commits or PRs. These are stacked review slices, not independent cherry-pickable PRs. Keep each slice green before staging the next one.

1. Pure control snapshot docs: roadmap, overnight control, goal audit, owner test plan, dirty-tree checkpoint, and research-only `_ai_context` notes. Treat this as a review preflight or final-branch-tip documentation commit, not a standalone implementation PR, because the cited gate evidence belongs to the full stacked tree.
2. Foundational all-phase schema/migration + VAT cutover bundle: Drizzle migrations/meta `0030`-`0071`, `src/lib/db/schema.ts`, `src/lib/db/index.ts`, full export changes, VAT ledger runtime/tests, deleted legacy `vat-records` files, and `docs/exec-plans/completed/phase-8-5-vat-operations-ledger.md`. This intentionally combines schema/migrations with the VAT cutover so no intermediate review slice drops `vat_records` while legacy runtime code remains. It also means reviewers are approving schema/export additions for later phases in the same bundle; do not frame this as VAT-only review.
3. Schema consumers after the foundational bundle: GL/posting first, then WHT/foreign-vendor, POS, imports/inventory, payroll, fixed assets, CIT/analytics, Copilot/nav/settings. These slices depend on the foundational schema bundle and should be reviewed as stacked branches; WHT credits and later producer/handler tests also depend on the GL/posting slice.
4. Extraction learning: document review changes, AI extraction/correction modules, dogfood harness, extraction learning tests, and Phase 8 docs.
5. GL/posting/accounting/close: GL query modules, posting outbox, accounting routes/API exports, close checklist, accounting Playwright, and GL docs.
6. WHT/foreign-vendor tax: WHT certificate/credit/query/UI/actions, PND54/PP36 tax calendar work, foreign tax tests, upload/file route integration, and `docs/exec-plans/completed/phase-9-5-tax-workflow-control-tower.md`.
7. POS/tax reports: sales routes, POS ledger queries/tests, Section 87 report modules/API exports, sales/report Playwright, and Phase 10 docs.
8. Imports/inventory: import and inventory routes/query modules/tests, movement report exports, import/inventory Playwright, and Phase 10.6 docs.
9. Payroll: payroll routes/actions/query modules/tests, payroll migrations, PII audit behavior, filing status/remittance workflow, payroll Playwright, and Phase 11 docs.
10. Fixed assets/CIT/analytics/copilot/nav/settings: split further if reviewer capacity is limited; each has its own routes, query modules, tests, and phase docs.

## Concrete Staging Manifest

This manifest was derived from `git status --porcelain=v1 -uall` after the full 223-test Playwright recovery. Counts are approximate review sizing signals because some phase docs and shared modules are intentionally cross-cutting. The pathspecs below were validated with `git add -n` after the 223-test recovery. Use `git diff --cached --stat` after each staged slice to confirm the actual staged boundary.

Important: this is a stacked-branch manifest. Do not review later slices against `main` alone; they depend on the foundational all-phase schema/migration + VAT cutover bundle. WHT/foreign-vendor and later workflow slices that exercise posting-outbox behavior also depend on the GL/posting slice. Per-slice gates are valid only when the slice is applied on top of all earlier required slices; later slices may fail TypeScript or runtime checks in isolation against `main`.

Recommended staging sequence:

1. Control snapshot docs, not implementation evidence by itself (~15 files). Use as review preflight or land at the final stacked-branch tip; do not merge as a standalone proof that implementation landed:
   `git add .gitignore CLAUDE.md DESIGN.md docs/_ai_context/_glossary.md docs/_ai_context/dbd-template-spec.md docs/_ai_context/dbd-tfrs-cpa-handoff.md docs/_ai_context/period-lock-protocol.md docs/_ai_context/phase-8-dogfood-runbook.md docs/_ai_context/tfrs-npaes-notes-spec.md docs/exec-plans/active/roadmap.md docs/exec-plans/active/overnight-completion-control.md docs/exec-plans/active/goal-completion-audit-2026-05-17.md docs/exec-plans/active/dirty-tree-checkpoint-2026-05-17.md docs/exec-plans/active/owner-test-plan-2026-05-17.md docs/exec-plans/active/dbd-tfrs-research-spike.md`
2. Foundational all-phase schema/migration + VAT cutover bundle (~66 files):
   `git add drizzle src/lib/db/schema.ts src/lib/db/index.ts src/lib/export 'src/app/(app)/tax/vat' src/lib/db/queries/vat-operations-ledger.ts src/lib/db/queries/vat-operations-ledger*.test.ts 'src/app/(app)/tax/vat/actions.test.ts' e2e/tax/vat.spec.ts docs/exec-plans/completed/phase-8-5-vat-operations-ledger.md docs/exec-plans/completed/phase-6-vat-reporting.md src/lib/db/queries/vat-records.ts src/lib/db/queries/vat-records.test.ts`
3. Extraction learning and document review (~28 files):
   `git add 'src/app/(app)/documents' src/lib/ai src/lib/db/queries/extraction-learning* src/lib/db/queries/extraction-correction* src/lib/db/queries/extraction-* benchmarks/dogfood e2e/documents/review-learning.spec.ts docs/exec-plans/active/phase-8-extraction-learning-loop.md`
4. GL, posting, accounting, and close (~27 files):
   `git add 'src/app/(app)/accounting' 'src/app/(app)/close' src/app/api/accounting src/lib/db/queries/general-ledger* src/lib/db/queries/posting-outbox* src/lib/db/queries/close-checklists* src/lib/gl e2e/accounting docs/exec-plans/active/phase-10-5-gl-primitives.md`
5. WHT and foreign-vendor tax (~35 files):
   `git add 'src/app/(app)/tax/wht-certificates' 'src/app/(app)/tax/wht-credits-received' 'src/app/(app)/tax/withholding' 'src/app/(app)/tax/calendar' 'src/app/(app)/tax/monthly-filings' src/lib/db/queries/wht* src/lib/db/queries/foreign-vendor-tax* src/lib/tax/foreign* src/lib/pdf/fifty-tawi-bilingual* e2e/tax/wht-certificates.spec.ts e2e/tax/withholding-workflow.spec.ts e2e/tax/calendar.spec.ts e2e/tax/monthly-filings.spec.ts docs/exec-plans/active/phase-9-foreign-vendor-tax.md docs/exec-plans/completed/phase-9-5-tax-workflow-control-tower.md`
6. POS, cash flow, and statutory tax reports (~23 files):
   `git add 'src/app/(app)/sales' 'src/app/(app)/tax/reports' src/app/api/tax src/lib/db/queries/pos-sales-ledger* src/lib/tax/input-tax-report* src/lib/tax/output-tax-report* src/lib/tax/inventory-movement-report* e2e/sales e2e/tax/reports.spec.ts docs/exec-plans/active/phase-10-pos-and-cash-flow.md`
7. Imports and inventory (~22 files):
   `git add 'src/app/(app)/imports' 'src/app/(app)/inventory' src/app/api/inventory src/lib/db/queries/imports* src/lib/db/queries/inventory* src/lib/inventory e2e/imports e2e/inventory docs/exec-plans/active/phase-10-6-imports.md docs/exec-plans/active/phase-10-6-inventory-cogs-imports.md`
8. Payroll (~15 files):
   `git add 'src/app/(app)/payroll' src/lib/db/queries/payroll* src/lib/payroll e2e/payroll docs/exec-plans/active/phase-11-payroll.md`
9. Fixed assets (~15 files):
    `git add 'src/app/(app)/fixed-assets' src/app/api/fixed-assets src/lib/db/queries/fixed-assets* src/lib/fixed-assets e2e/fixed-assets docs/exec-plans/active/phase-13-fixed-assets-depreciation.md`
10. CIT, analytics, FX, cost centers, and allocation (~34 files):
    `git add 'src/app/(app)/analytics' 'src/app/(app)/year-end' src/lib/analytics src/lib/cit src/lib/db/queries/cit* src/lib/db/queries/fx* src/lib/db/queries/allocation* src/lib/db/queries/cost-centers* src/lib/db/queries/projects* e2e/analytics e2e/year-end docs/exec-plans/active/phase-12a-cit-engine.md docs/exec-plans/active/phase-12b-tfrs-dbd-audit-pack.md docs/exec-plans/active/phase-14-analytics-audit-pack.md`
11. Copilot, nav, settings, and i18n (~26 files):
    `git add 'src/app/(app)/copilot' 'src/app/(app)/settings' src/lib/copilot src/lib/nav src/lib/db/queries/ai-settings* src/lib/db/queries/copilot* src/i18n e2e/copilot e2e/settings e2e/sidebar docs/exec-plans/active/phase-15-ui-nav-refactor.md docs/exec-plans/active/phase-16-ai-copilot-tool-layer.md`
12. Cross-cutting residual mini-groups (39 files in 8 dry-run validated groups): these are not optional leftovers. Before actual staging, fold each group into the owner slice below or into the explicit cleanup slice. The 8 keep-out/scratch files listed below should remain unstaged unless intentionally promoted.

Current exact residuals after dry-run pathspec validation: 47 files remain outside slices 1-11; 39 are assigned to the residual mini-groups below and 8 are explicit keep-out/scratch paths.

- Keep out unless explicitly promoted: `vat-info.md` until its source/owner is confirmed, `scripts/check-ksher-cat.ts` unless intentionally promoted into the dogfood harness, `docs/_ai_context/skills-cleanup-plan.md` unless the user explicitly wants skill-cleanup work in this PR, and the current `benchmarks/_ground-truth-pages/*.png` files (`fedex-p1.png`, `ksher-p1.png`, `tiktok-p1.png`, `tiktok-p2.png`, `tiktok-p3.png`).
- Nav/layout residual group (5 files, `git add -n` validated): fold into slice 11 with Copilot/nav/settings before running sidebar/nav E2E.
  `git add src/components/layout/mobile-sidebar.tsx src/components/layout/sidebar-nav.tsx src/components/layout/sidebar.tsx src/components/layout/tier1-icon-strip.tsx e2e/helpers/routes.ts`
- Dashboard/analytics residual group (4 files, `git add -n` validated): fold into slice 10 with analytics/dashboard work.
  `git add 'src/app/(app)/dashboard/page.tsx' 'src/app/(app)/dashboard/analytics-overview.tsx' src/lib/db/queries/dashboard.ts e2e/dashboard/page.spec.ts`
- Documents/extraction residual group (7 files, `git add -n` validated): fold into slice 3 with extraction learning/document review.
  `git add src/lib/db/queries/documents.ts e2e/documents/expenses.spec.ts e2e/documents/income.spec.ts src/lib/inngest/functions/process-document.ts src/lib/inngest/functions/backfill-vendor-tax-id.ts src/lib/inngest/functions/consensus-recompute.ts src/lib/inngest/functions/exemplar-decay.test.ts`
- Tax workflow / upload residual group (4 files, `git add -n` validated): fold into slice 5 with WHT/foreign-vendor tax workflow and upload/file access.
  `git add 'src/app/api/files/[fileId]/route.ts' src/lib/db/queries/tax-workflow-exceptions.ts src/lib/db/queries/tax-workflow-exceptions.db.test.ts src/lib/db/queries/today-gap-remediation.db.test.ts`
- GL/posting/period-lock residual group (3 files, `git add -n` validated): fold into slice 4. Do not review or land the GL/posting slice without the posting-outbox processor and period-lock helper.
  `git add src/lib/db/queries/period-locks.ts src/lib/inngest/functions/process-posting-outbox.ts src/lib/inngest/functions/process-posting-outbox.test.ts`
- Analytics/FX residual group (4 files, `git add -n` validated): fold into slice 10 with analytics/FX.
  `git add src/lib/inngest/functions/fetch-bot-fx-rates.ts src/lib/inngest/functions/process-month-end-fx-revaluation.ts src/lib/integrations/bot/fx-rates.ts src/lib/integrations/bot/fx-rates.test.ts`
- Fixed-assets residual group (1 file, `git add -n` validated): fold into slice 9 with fixed assets/depreciation posting.
  `git add src/lib/inngest/functions/process-monthly-depreciation.ts`
- Existing baseline UI/query cleanup residual group (11 files, `git add -n` validated): stage as an explicit cleanup slice after the domain slices it supports, or split by reviewer ownership before final PR. Do not silently bury these files in unrelated domain commits.
  `git add 'src/app/(app)/bank-accounts/[accountId]/statement-upload.tsx' 'src/app/(app)/bank-accounts/bank-account-list.tsx' 'src/app/(app)/reconciliation/reconciliation-dashboard.tsx' 'src/app/(app)/reports/summary-view.tsx' 'src/app/(app)/vendors/vendor-list.tsx' src/lib/db/queries/payments.ts src/lib/db/queries/payments.test.ts src/lib/parsers/kbank-pdf-parser.ts src/lib/utils/admin-guard.ts src/tests/db-test-utils.ts src/app/api/inngest/route.ts`

Per-slice minimum gate:

- Docs/control-only slice: `git diff --check`.
- Foundational all-phase schema/migration + VAT slice: `pnpm exec drizzle-kit check`, `pnpm db:migrate`, VAT ledger schema/behavior DB tests, full export tests, VAT actions tests, VAT Playwright, `pnpm tsc --noEmit`, `pnpm lint`, `git diff --check`, active-code no-`vat_records`. Reviewers running `0070_vat_input_full_tax_invoice_claimable.sql` on a long-lived dev DB may need to clean legacy claimable input VAT rows before the migration applies; follow the migration's remediation message if it fails.
- UI or workflow slice: focused DB/unit tests where relevant, focused Playwright for touched routes, `pnpm tsc --noEmit`, `pnpm lint`, `git diff --check`. WHT/foreign-vendor and later workflow slices that test posting-outbox producers/handlers require the GL/posting slice to be applied first.
- Final stacked branch/PR gate: `pnpm test`, `pnpm test:db`, `pnpm test:e2e`, `pnpm build`, `pnpm exec drizzle-kit check`, `pnpm tsc --noEmit`, `pnpm lint`, active-code no-`vat_records`, artifact-status check.

Do not stage local runtime artifacts by default:

- `.codex`
- `.playwright-mcp/`
- `.serena/`
- `.superpowers/`
- `_tmp_images/`
- `image.png`

These are now covered by `.gitignore`.

Atomic staging warnings:

- `drizzle/meta/_journal.json` and migrations `0030`-`0071` must be staged together. Staging one without the other can break migration ordering or leave journal entries pointing at absent SQL files.
- Deleted legacy VAT query/test files must land with the VAT ledger schema/query/action changes; do not split a state where `vat_records` runtime code can reappear without the cutover migrations.
- Docs that cite new migrations, routes, or tests should land with or after the implementation slice they describe. A docs-only commit can be useful for review, but must be labeled as a control snapshot, not implementation evidence.

## Review Slices

### Phase 8 / Extraction Learning

Scope:
- Correction sessions, confirmed-candidate replay, anchor-aware candidate identity, and extraction dogfood harness.
- Main areas: `src/lib/ai/**`, `src/lib/db/queries/extraction-*`, `benchmarks/dogfood/**`, document review actions/UI, and related tests/docs.

Review focus:
- Tenant isolation for learned candidates.
- No prompt exemplar path that bypasses confirmed evidence.
- Dogfood replay results remain reproducible enough for closeout.

### Phase 8.5 / VAT Ledger Cutover

Scope:
- VAT operations ledger schema/query/action/UI cutover and removal of active `vat_records` runtime path.
- Main areas: VAT pages/actions, VAT ledger query module, migrations/meta, exports, tests, and completed Phase 8.5 docs. For staging, this review rides inside the broader foundational all-phase schema/migration + VAT cutover bundle because Drizzle journal/schema/export changes span later phases too.

Review focus:
- No active legacy `vat_records` reads/writes outside old migrations/meta/history docs.
- PP30/PP36 filing, payment, reclaim, lock, and immutable filed-line behavior.
- DB suites must run serially because shared test DB reset is stateful.

### Phase 9 / Foreign Vendor Tax + WHT

Scope:
- Country/PND54/PP36 materialization, statutory WHT defaults, foreign certificate renderer/routing, WHT workflow controls, tax calendar separation, and full/e-tax-invoice claimability hardening for PP30 input VAT.
- Main areas: WHT certificate actions/UI/tests, foreign-vendor tax query/tests, file route/upload integration, tax calendar/monthly filings pages, docs.

Review focus:
- PP36 obligations consume VAT ledger APIs only.
- Foreign PND54 and bilingual 50 Tawi flows do not regress domestic PND53 behavior.
- Claimable/allocated/filed PP30 input VAT requires `full_ti` or `e_tax_invoice` plus invoice no/date at API, query, and DB boundaries; migration `0070_vat_input_full_tax_invoice_claimable.sql` prechecks legacy invalid rows before adding the constraint.
- Blob/Inngest/live upload timing remains a manual QA item.

### Phase 10.5 / GL + Posting Outbox

Scope:
- GL storage spine, posting outbox producers/handlers, posting queue/operator UI, close-checklist readiness, GL reports/exports.
- Main areas: general-ledger/posting-outbox queries, accounting pages/routes, close checklist, posting migrations, GL docs/tests.

Review focus:
- Idempotency, locked-period rejection, retry/exception behavior, and source-to-posting-kind dispatch coverage.
- Immediate JE paths still align with queued outbox paths.
- Claude follow-up review for close/posting readiness now passed after fixes: retrying/incomplete rows block manual/close drains, GL close/enqueue share an advisory org-period lock, reversed CIT accrual JEs no longer satisfy readiness/year-end close, year-end close action rechecks readiness/posting queue server-side, recent close periods sort newest first, and close checklist completion uses one update path. Evidence: WHT/posting DB 22, close DB 6 serial, GL DB 34 serial, accounting+analytics Playwright 16, TypeScript, diff, and no-active-`vat_records` search passed.

### Phase 10 / POS Cash Flow

Scope:
- Sales source ledger, POS CSV/manual sale capture, cash deposits, processor settlements, Section 87 report workbench.
- Main areas: `src/app/(app)/sales/**`, POS/sales ledger queries/tests, tax report exports/UI.

Review focus:
- Sale-to-VAT/GL posting consistency.
- Cash/processor variance treatment and owner-visible report traceability.
- Claude follow-up review for POS/cash posting now passed after fixes: POS gross/base/VAT tie-out is validated before source insert, POS/cash/processor source rows write audit rows in the source+VAT/GL/outbox transaction, CSV import strips UTF-8 BOM headers, and duplicate manual POS submits return a friendly error. Evidence: POS DB 16, GL DB 34 serial, sales Playwright 2, TypeScript, diff, and no-active-`vat_records` search passed.

### Phase 10.6 / Imports + Inventory

Scope:
- Import packet schema/UI, broker/import charge classification, document/payment link and unlink cleanup, payment picker v1, finalize-to-inventory, weighted-average inventory/COGS, count variance, goods report drilldowns.
- Main areas: imports/inventory app routes, import/inventory query modules/tests, inventory movement exports, docs.

Review focus:
- Same-org guardrails, source traceability, payment-link GL reversal safety, weighted-average correctness, and GL posting locks.
- Inventory movement posting/outbox follow-up has Claude review coverage now: GL/SKU divergence, replay locks, phantom sale sources, missing/deleted document sources, sign-inverted manual adjustments, same-instant ordering, and impossible E2E fixtures were fixed; final Claude follow-up reported no blocking findings.
- Remaining direct-clear/backfill, existing-document picker, richer classifier, and richer count UX is documented as incomplete.

### Phase 11 / Payroll

Scope:
- Payroll foundation, salary master, PIT/SSO calculators, pay-run lifecycle, PND.1/PND.1 Kor/SSO drafts/remittances, audited filing submit/accept transitions, filing-list remittance CTAs, posting-outbox coverage, sensitive-read audit.
- Main areas: `src/lib/db/queries/payroll.ts`, payroll app routes/actions, payroll calculators/tests, migration `0065`, `src/lib/db/schema.ts`, payroll docs.

Review focus:
- Period locks, same-org slip/filing updates, GL posting idempotency, and sensitive-read audit behavior.
- Filing status transitions must be all-or-nothing: status, RD/SSO reference, timestamp, and audit event together.
- Latest gate: payroll DB tests passed 22 tests with timestamp/reference-preservation, explicit SSO `paid_at`, remittance audit, accepted-only remittance gates, direct outbox replay source-state updates, zero-contribution guard, and legacy-payload duplicate assertions; payroll E2E passed 5 tests covering PND.1, PND.1 Kor, SSO submit/accept UI paths, and accepted-row PND.1/SSO Pay controls; full export test passed; all-pages smoke passed 65 routes; Drizzle check/db:migrate, TypeScript, diff check passed. Claude Companion found silent page-action failures, brittle row selection, missing SSO legacy paid backfill, missing remittance audit, zero-contribution issues, payroll outbox filing-status/audit/replay risks, JE-prefix race, and GL advisory-lock race; fixes landed and latest Claude follow-up reported no blocking findings.

### Phase 12a / CIT

Scope:
- CIT brackets/schema, PND.51/PND.50 drafts, loss layers, WHT/prepayment consumption, audited submit/accept, year-end close readiness/posting.
- Main areas: CIT/year-end pages, CIT query modules/tests, close docs.
- CIT accrual/payment posting-outbox hardening follow-up has Claude review coverage now: PND.51 payments post to prepaid CIT account 1186, PND.50 accrual books gross CIT expense and relieves WHT/prepayment credits before net payable, zero-net-payable close requires accrual evidence, GL-derived profit excludes reversed/close JEs, active-source JE uniqueness ignores reversed entries, reverse JE and GL period lock races were hardened, and final Claude follow-up reported no blockers. Evidence: CIT filings DB 24, GL DB 39, Drizzle check, year-end+analytics Playwright 9, TypeScript, diff, and no-active-`vat_records` search passed.
- Post-CIT hardening full DB regression passed 40 files / 434 tests after updating the POS CSV SKU fixture for the earlier sign-safe manual-inventory adjustment rule; follow-up TypeScript, diff check, and no-active-`vat_records` search passed.

Review focus:
- Filed loss-layer mutation and expired-loss forfeiture auditability.
- Exact TP form rendering remains incomplete.

### Phase 13 / Fixed Assets

Scope:
- Asset register, tax-life defaults, depreciation schedule/posting, disposal, roll-forward, CSV exports, GL tie-out for unique account mappings.
- Main areas: fixed-asset queries/pages/actions/export tests, fixed-assets E2E, docs.
- Fixed-asset depreciation posting-outbox review debt is now resolved: Claude found missing intangible/natural-resource GL mappings, disposal-vs-pending-depreciation race, silent monthly cron failures, and duplicate enqueue risks; fixes landed and follow-up review reported no blockers. Evidence: fixed-assets DB 26, GL DB 39, export/dispatch/report unit 11, fixed-assets Playwright 7, TypeScript, diff check, and no-active-`vat_records` search passed.

Review focus:
- Disposal clears posted depreciation only, future unposted rows do not post after disposal, locked GL period protection.
- Shared GL accounts intentionally suppress category-level false variances.

### Phase 14 / Analytics, FX, Cost Centers

Scope:
- AR/AP aging, cash forecast, DSO, concentration, profitability, close checklist, audit-pack queries, allocation rules, FX rate/revaluation surfaces, dashboard drilldowns.
- Main areas: analytics pages/query modules/tests, dashboard analytics overview, messages, docs.

Review focus:
- Bangkok-date period handling, FX exception visibility, drilldown link semantics, and allocation metadata coverage.
- Remaining bank/WHT FX, realized settlement FX, and remaining allocation metadata coverage are documented as incomplete.

### Phase 15 / Navigation

Scope:
- Tiered shell, mobile drawer, sidebar route cleanup, route smoke expansion.
- Main areas: layout components, route helper tests, sidebar/nav E2E, `DESIGN.md`, docs.

Review focus:
- Primary routes remain reachable on desktop/mobile.
- Broad namespace migration remains deferred.

### Phase 16 / Copilot

Scope:
- Read-only registry/UI/audit foundation, deterministic prompt router, draft preview/apply tool, safe write task tool, BYO provider settings.
- Main areas: copilot/AI settings routes/actions, AI settings query/tests, docs.
- BYO settings review debt is now closed: owner/admin verified-org gating, redacted allowlist audit payloads with secret-ref presence booleans, `org_ai_settings` export redaction, membership-role tool execution, env-backed live enablement, bounded validation, force-dynamic settings page, and Claude follow-up with no blockers. Historical evidence at that point: ai-settings/copilot DB 11, full-export unit 9, VAT actions unit 9, settings+copilot Playwright 6, broad `pnpm test:db` 40 files / 437 tests, `pnpm test` 56 files / 633 tests, `pnpm lint` 0 errors / 30 existing warnings before later mechanical cleanup, `pnpm build`, Drizzle check, TypeScript, diff check, and no-active-`vat_records` search passed.
- Full Playwright gate after BYO-Copilot hardening initially caught a `/sales` crash where aggregate date values from `getPosSalesWorkflowDashboard()` rendered as strings, not `Date` instances. `/sales` now uses a Date-or-string `dateOnly()` helper for channel balances and recent sales. Evidence: focused sales plus all-pages smoke passed 67 tests; full `pnpm test:e2e` passed 221 tests; TypeScript, diff check, and no-active-`vat_records` search passed after generated-artifact cleanup.
- Latest Playwright/package recovery after the sales regression added a fixed-assets import-result hardening pass: full `pnpm test:e2e` passed 223 tests, focused fixed-assets E2E passed 8 tests after Claude-reviewed malformed-URL/oversized-redirect fixes, focused fixed-assets DB passed 26 tests, and the broad package/DB gate passed with unit 633, DB 437, lint 0 errors / 30 warnings at that point, build, Drizzle, TypeScript, diff, and no-active-`vat_records`. Current lint baseline after mechanical cleanup is 0 errors / 3 TanStack warnings.

Review focus:
- Preview/confirmation/audit/RBAC/period-lock gates before mutation.
- Live model/provider orchestration remains incomplete.

## Current Stabilization Gates

Current baseline:

- Latest stabilization gate after `/sales` aggregate-date regression and fixed-assets import-result hardening:
  - `pnpm test:e2e` — 223 tests passed.
  - `pnpm test:e2e e2e/fixed-assets/fixed-assets.spec.ts` — 8 tests passed.
  - `pnpm vitest run --config vitest.config.db.ts src/lib/db/queries/fixed-assets.db.test.ts` — 26 tests passed.
  - `pnpm test:db` — 40 files / 437 tests passed.
  - `pnpm test` — 56 files / 633 tests passed.
  - `pnpm lint` — 0 errors, 30 warnings.
  - `pnpm build`, `pnpm exec drizzle-kit check`, `pnpm tsc --noEmit`, `git diff --check`, active-code no-`vat_records` search, and generated-artifact cleanup passed.

Prior stabilization gates, kept for history only:
- `pnpm tsc --noEmit`
- `pnpm exec drizzle-kit check`
- `pnpm db:migrate`
- `pnpm vitest run --config vitest.config.db.ts src/lib/db/queries/payroll.db.test.ts`
- `pnpm test:e2e e2e/payroll/payroll.spec.ts`
- `pnpm test:e2e e2e/smoke/all-pages.spec.ts`
- `pnpm test:e2e e2e/dashboard/page.spec.ts`
- `git diff --check`
- Active-code `vat_records|vatRecords|vat-records` search returned no hits outside docs/migrations/meta.
- Latest post-source-refresh lightweight gate passed: `pnpm tsc --noEmit`, `pnpm exec drizzle-kit check`, active-code no-`vat_records` search, and `git diff --check`.
- Full project commit/phase gate refresh passed after fixing a stale document-count Playwright assertion:
  - `pnpm build`
  - `pnpm test` — 56 files / 632 tests passed.
  - `pnpm lint` — 0 errors, 28 warnings.
  - `pnpm test:db` — 40 files / 401 tests passed.
  - `pnpm test:e2e` — initial run found one stale `documents shown` assertion; fixed to allow `documents+ shown`, targeted document E2E passed 11 tests, full rerun passed 219 tests.
  - Follow-up `rm -rf .next/dev/types`, `pnpm tsc --noEmit`, and `git diff --check` passed.
- Post-imports/full-E2E stabilization gate passed after hardening stateful E2E selectors:
  - `pnpm test:e2e` — 221 tests passed.
  - `pnpm test:db` — 40 files / 412 tests passed before the import payment unmatched-transaction guard; 40 files / 413 tests passed after the guard landed.
  - `pnpm test` — 56 files / 632 tests passed.
  - `pnpm lint` — 0 errors, 28 warnings.
  - `pnpm build` — passed with 82 app pages.
  - `pnpm tsc --noEmit`, `pnpm exec drizzle-kit check`, `git diff --check`, and active-code no-`vat_records` search passed.
- Phase 9 full-tax-invoice claimability focused gate passed:
  - `pnpm exec drizzle-kit check`
  - `pnpm db:migrate`
  - `pnpm vitest run --config vitest.config.db.ts src/lib/db/queries/vat-operations-ledger-schema.db.test.ts src/lib/db/queries/vat-operations-ledger.db.test.ts` — 38 tests passed.
  - `pnpm tsc --noEmit`
  - `git diff --check`
  - Claude Companion review flagged migration precheck, narrow negative coverage, and API error-message issues; fixes landed.
- Imports document/payment unlink and payment-picker focused gate passed:
  - `pnpm vitest run --config vitest.config.db.ts src/lib/db/queries/imports-schema.db.test.ts` — 27 tests passed for unlink/payment picker; 28 tests passed after the server-side unmatched-transaction guard landed; 29 tests passed after Claude Companion follow-up hardening for cross-month locked-GL reversals, posting-exception cleanup, and reversal subledger refs.
  - `pnpm vitest run --config vitest.config.db.ts src/lib/db/queries/general-ledger.db.test.ts` — 34 tests passed.
  - `pnpm test:e2e e2e/imports/imports.spec.ts` — 5 tests passed.
  - `pnpm test:e2e e2e/smoke/all-pages.spec.ts` — 65 routes passed.
  - Follow-up `.next/types` + `.next/dev/types` cleanup, `pnpm tsc --noEmit`, `git diff --check`, and active-code no-`vat_records` search passed.
  - Claude Companion review initially skipped because `claude` was not on PATH; once available, follow-up review found the cross-month locked-GL reversal, posting-exception FK cleanup, and dangling reversal subledger-reference risks; fixes landed, focused imports/GL DB gates passed, and Claude re-review approved with no new findings.
- Inventory movement posting/outbox hardening gate passed:
  - `pnpm vitest run --config vitest.config.db.ts src/lib/db/queries/inventory.db.test.ts` — 29 tests passed.
  - `pnpm vitest run --config vitest.config.db.ts src/lib/db/queries/general-ledger.db.test.ts` — 34 tests passed.
  - `pnpm test:e2e e2e/inventory/inventory.spec.ts` — 5 tests passed.
  - `pnpm test:e2e e2e/documents/review-learning.spec.ts --workers=1` — 6 tests passed after a combined parallel run showed unrelated toast/state flake.
  - Follow-up `.next/types` + `.next/dev/types` cleanup, `pnpm tsc --noEmit`, `git diff --check`, and active-code no-`vat_records` search passed.
  - Claude Companion initial review found blockers; final follow-up reported no blocking findings after fixes.
- Post-imports broader non-DB/build gate passed:
  - `pnpm test` — 56 files / 632 tests passed.
  - `pnpm lint` — 0 errors / 28 existing warnings.
  - `pnpm build` — passed; 82 static app pages generated.
  - Follow-up `.next/types` + `.next/dev/types` cleanup, `pnpm tsc --noEmit`, and `git diff --check` passed.

Important caveat:
- DB suites share/reset the same test database and should be run serially unless isolated.
- Playwright can race with `.next/dev/types`; rerun `pnpm tsc --noEmit` after Playwright exits.
