# Thai Accounting Platform — Roadmap & Exec-Plan Index

**Status:** Active source of truth
**Last updated:** 2026-05-17
**Purpose:** Keep the exec-plan table of contents, status, dependency order, and active residuals clear before Phase 9+ expansion work resumes.

## Vision

Build an audit-compliant Thai accounting platform that small-business owners can run day to day, while still producing records a Thai-licensed CPA can review and sign from.

This means:

- Real accounting spine: chart of accounts, double-entry GL, journal entries, trial balance, P&L, balance sheet, cash flow, period close, and audit trail.
- Thai compliance coverage: item-level VAT operations, PP30, PP36, PND.1/2/3/53/54, SSO, PND.51/50, DBD financial statements, TFRS for NPAEs audit pack, and §87 reports.
- Owner-usable UX: workflows explain business facts in plain language, but accounting and tax invariants are enforced in the database and reviewed by accountant-role gates.
- AI as an operating surface: users can ask questions, correct extraction, draft bulk actions, and eventually connect external AI clients through a safe tool/MCP layer.
- Every filed number must trace back to source evidence.

## Current State

Phases 0-7 and Phase 8.5 are completed and archived. Phase 8 is active/redesign after dogfood showed naive prompt exemplars are insufficient; the confirmed-candidate replay now shows weighted lift, but broader held-out vendor validation and residual regression fixes remain. Baseline hardening v2, the residual baseline-hardening pass, and today-gap remediation are completed and archived.

Phase 9+ implementation is now gated by the VAT operations ledger. FlowAccount workflow review showed that Thai VAT is a monthly operational compliance spine, not a report-only feature. The legacy `vat_records` rollup is no longer an active runtime source; Phase 8.5 ledger cutover supplies PP30/PP36 traceability, six-month PP30 input VAT claim management, PP36 exact-period declaration, PP36 paid-to-PP30-reclaim lifecycle, and filed-period immutability.

Phase 8.5 supersedes Phase 6 assumptions where they conflict, especially the old PP36 "pure cost / never reclaimable" language and report-centric `vat_records` filing source.

Thai operator feedback on 2026-05-15 added one more product requirement: tax screens must provide form-correct workflow control, not just totals. WHT must summarize by PND form so foreign/international WHT does not blend into PND.53, and VAT must forecast future reclaimable VAT, especially PP36 paid VAT that can later reduce PP30.

## Completed Exec Plans

Completed plans live in `docs/exec-plans/completed/`.

| Document | Notes |
|---|---|
| `000-overview.md` | Archived original overview |
| `001-schema.md` | Archived original schema plan |
| `001-thai-accounting-platform-monolith-archived.md` | Archived monolith plan |
| `phase-0-validation.md` | Completed |
| `phase-1a-infrastructure.md` | Completed |
| `phase-1b-app-shell.md` | Completed |
| `phase-2-bank-statements.md` | Completed |
| `phase-3-documents-ai.md` | Completed |
| `phase-4-reconciliation.md` | Completed |
| `phase-5-wht-tax.md` | Completed |
| `phase-6-vat-reporting.md` | Completed |
| `phase-7-ai-batch-matching.md` | Completed |
| `phase-7-learning-metrics.md` | Completed |
| `phase-7-ui-reconciliation.md` | Completed |
| `phase-8-5-vat-operations-ledger.md` | Completed 2026-05-16; clean VAT operations ledger cutover; no active `vat_records` runtime path |
| `phase-9-5-tax-workflow-control-tower.md` | Completed 2026-05-16; VAT workflow surfaces, WHT register/filings, centralized exceptions, PND.54 separation, and seeded VAT/WHT QA paths landed |
| `baseline-hardening-v2-task.md` | Completed 2026-04-28; implementation source for the hardening v2 slice |
| `baseline-hardening.md` | Completed 2026-04-29; residual tenant-isolation sweep, audit-log partitioning, audit metadata assignment, and final baseline gate |
| `today-gap-remediation.md` | Completed 2026-04-30; shipped-code VAT/WHT compliance patches |

## Active Exec Plans

All active plans live in `docs/exec-plans/active/`.

| Status | Document | Role | Move-to-completed condition |
|---|---|---|---|
| Active/redesign | `phase-8-extraction-learning-loop.md` | Corrective extraction learning loop | Confirmed-candidate replay shows weighted lift; post-Claude harness hardening fixed representative seed selection, per-field hints, prompt leakage, rationale sanitization, and stale output cleanup; deterministic vendor/customer anchoring and anchor-aware replay landed with raw `90.2% -> 96.1%` and weighted `87.0% -> 97.2%`; broader held-out FedEx/Photoism validation is data-blocked by local singletons while Tier 4 stays deferred |
| Active reference | `chart-of-accounts.md` | Thai COA design | Keep active until Phase 10.5 GL account implementation is done |
| Research spike / external validation | `dbd-tfrs-research-spike.md` | DBD/TFRS validation | CPA/DBD Builder-validated schema and notes taxonomy produced |
| Implementation-active | `phase-9-foreign-vendor-tax.md` | Foreign-vendor VAT/WHT | Country extraction, PND.54 routing, PP36 ledger materialization, foreign WHT default resolver, below-default WHT payment/certificate gate with UI evidence, workflow controls, tax-calendar PP30/PP36/PND54 separation, and bilingual foreign-payee 50 Tawi renderer landed; remaining UX/backfill/manual PDF QA remain |
| Implementation-active | `phase-10-pos-and-cash-flow.md` | POS, cash flow, §87 reports | Source-ledger schema, `/sales` UI with channel balances, generic POS CSV import, cash deposit capture, processor settlement capture, manual/POS-CSV-to-VAT/GL posting with posting-outbox coverage, manual settlement/cash-deposit GL posting with posting-outbox coverage, and first owner-visible Section 87 output/input/goods report workbench landed, with CSV downloads and goods roll-forward summary; richer settlement matching, cash slip OCR/bank matching, connectors, branch-level input propagation, and Excel/PDF report exports remain |
| Implementation-active | `phase-10-5-gl-primitives.md` | GL spine | Storage spine, DB invariants, opening-balance/manual-JE/reversal posting, GL period close, posting queue/operator surface with manual drain, close-checklist queue readiness, minute-level posting-outbox cron consumer with row-claim locking, per-drain retry burn-down guard, org-queue truncation signal, typed `posting_kind` enum/idempotency guards, static outbox event to posting-kind dispatch validation, P&L/balance-sheet summaries, `/accounting` UI, journal-entry and date-filtered ledger-line drill-through v1, trial-balance/P&L/balance-sheet report routes, GL report CSV exports, POS sale/settlement/cash-deposit posting-outbox producer/handler coverage, import-payment posting-outbox producer/handler coverage, inventory movement sale COGS/purchase/count-variance posting-outbox producer/handler coverage, PP30/PP36 tax-payment posting with posting-outbox producer/handler coverage, payroll net-payment/PND.1/SSO remittance posting-outbox producer/handler coverage, CIT accrual/payment posting-outbox producer/handler coverage, PP36 self-assessment/reclaim-transfer posting, and first WHT credit posting-outbox vertical landed; remaining automated posting engine and richer close/report workflows remain |
| Implementation-active | `phase-10-6-imports.md` | Import module | Foundation schema/guardrails/export/tests, list/detail UI, document/payment linkage, broker charge classifier, open-import aging, audit trail, open-packet header edit/delete controls, child-line delete, document/payment unlink, payment picker, finalize-to-inventory, broker/import charge GL posting with posting-outbox coverage, import payment clearing GL posting, unmatched-payment guard, and adversarial hardening landed; direct-clear customs/backfill reversal depth and richer picker/classifier UX remain |
| Implementation-active | `phase-10-6-inventory-cogs-imports.md` | Inventory + COGS | SKU/movement/count/statutory-overhead foundation, UI, customs-date import consumption, confirmed-document domestic purchase receipt hookup, POS CSV SKU-line sale-out hookup, weighted-average sale COGS GL posting, document purchase inventory/AP/VAT posting, count-variance GL posting, inventory movement posting-outbox coverage, accounting inventory/1160 variance visibility, count reconciliation, count detail read-only page, standalone sign-safe adjustment page, configurable low-stock watch from per-SKU reorder points, SKU detail movement history/profile edit v1, roll-forward, aged inventory, §87 goods report with source-line movement drilldown, and CSV exports landed; statutory true-up, richer count edit/adjustment approval workflow, richer POS multi-line schema/UI, line-level SKU assignment, and demand forecasting automation remain |
| Implementation-active | `phase-11-payroll.md` | Payroll + SSO + PND.1 | Payroll schema foundation, salary master data v1, employee intake/list/allowance UI, pay-run detail/slip preview UI, PIT/SSO calculators, draft pay-run generation/approval/payment with GL accrual and net-payment posting, PND.1/PND.1 Kor/SSO draft filing builders plus PND.1/SSO remittance posting, payroll filing list pages with audited submit/accept status transitions, payroll payment/remittance posting-outbox producer/handler coverage, sensitive-read audit, export/tests landed; exact file exports, employee 50 Tawi, receipt attachment, reconciliation, and bank matching remain |
| Implementation-active | `phase-12a-cit-engine.md` | CIT engine | CIT brackets/schema, projected and actual-H1 PND.51 UI, manual-profit and GL-derived PND.50 drafts with WHT/prepayment/loss consumption, audited manual book-tax adjustments, audited submit/accept workflow, filed loss-layer disclosure/mutation, audited expired-loss forfeiture control, idempotent CIT accrual/payment JEs, TP threshold/disclosure draft, `/close` year-end CIT readiness/posting, fixed-asset depreciation addback sync, loss carry-forward entry/consumption helper, export/tests landed; exact TP form rendering remains |
| Draft/blocked | `phase-12b-tfrs-dbd-audit-pack.md` | FS, DBD, audit pack | Move only after CPA-reviewed DBD/TFRS spike output exists, implementation lands, and authenticated DBD Builder validation passes |
| Implementation-active | `phase-13-fixed-assets-depreciation.md` | Fixed assets | Asset register, RD-sourced tax-life lookup, schedule builder, document capitalization prompt, standalone/manual asset intake with tax-life warning, prior-register CSV import, standalone disposal UX, standalone roll-forward report with GL variance, manual/monthly depreciation posting-outbox enqueue/handler coverage, posted-only disposal clearing JE, Phase 12a depreciation addback handoff, asset detail/depreciation-register UX, disposal register, roll-forward CSV export, UI/export/tests landed; richer depreciation methods/impairment remain deferred |
| Implementation-active | `phase-14-analytics-audit-pack.md` | Analytics, FX, cost centers | AR/AP aging, cash forecast with payroll/depreciation signals, standalone concentration view, DSO, gross margin by category, dashboard analytics widgets with drilldowns to cash flow, AR aging, payroll, fixed-asset roll-forward, concentration, and profitability, close checklist UI, Phase 12b audit-pack query exports, cost-center/project schema and v1 UI, allocation-rule v1 UI, GL-account/vendor/category allocation application for current posting contexts including inventory purchases, fixed-asset P&L lines, and payroll accrual expense lines, segmented profitability v1, FX storage/manual rate control, configurable BOT API ingestion cron, manual AR/AP revaluation run control plus explicit previous-month-end retry, AR/AP FX revaluation v1, month-end FX revaluation cron orchestration, export/tests landed; bank/WHT FX revaluation, realized settlement FX, and any remaining posting-context allocation metadata gaps remain |
| Implementation-active | `phase-15-ui-nav-refactor.md` | Navigation reset | Two-tier shell, mobile drawer, VAT forecast nav, tier-1 keyboard navigation, dead legacy sidebar removal, and DESIGN.md shell alignment landed; broad namespace migration remains deferred |
| Implementation-active | `phase-16-ai-copilot-tool-layer.md` | AI chat, safe tool registry, MCP action layer | Read-only typed tool registry, deterministic natural-language prompt router, first draft preview/apply recode tools (`preview_recode_documents`, `apply_recode_documents`), first safe write task tool (`create_accountant_review_task`), central role enforcement, failed-attempt auditing, locked-period recode blocking, audited tool events, `/copilot` UI, BYO Copilot provider settings, export/tests landed; live model orchestration, confirmed/posted source writes, and MCP remain |
| Active control surface | `overnight-completion-control.md` | Goal-mode phase queue, research/review/test gates, and completion checklist | Retire once all listed phases are implemented, verified, and archived |

## Cross-Cutting Specs

| Document | Role |
|---|---|
| `docs/exec-plans/active/overnight-completion-control.md` | Authoritative unattended-work runbook: phase queue, research protocol, review protocol, test gates, stop conditions |
| `docs/_ai_context/period-lock-protocol.md` | Canonical `period_locks` table, lock trigger, and override protocol |
| `docs/_ai_context/pnd-filings-migration-protocol.md` | Staged migration from WHT monthly filings to unified PND filings |

## Immediate Work Order

Use `docs/exec-plans/active/overnight-completion-control.md` as the operative runbook for goal-mode implementation. It owns the current phase queue, research protocol, review protocol, standard test gates, and remaining review debt.

Current post-gate order after the 2026-05-17 stabilization pass:

1. Keep the tree reviewable before more feature expansion.
   - Current dirty tree is intentionally large: use `dirty-tree-checkpoint-2026-05-17.md` to split control docs, migrations/schema, VAT ledger, extraction learning, WHT/foreign-vendor tax, GL/posting, POS/tax reports, imports/inventory, payroll, fixed assets/CIT/analytics/copilot/nav/settings into reviewable slices.
2. Close external-validation blockers before claiming production compliance.
   - DBD/TFRS remains blocked on CPA plus authenticated DBD Builder validation; WHT certificate upload storage still needs live Blob/Inngest QA; payroll production filing still needs current SSO config validation and exact RD/SSO exports.
3. Preserve the green commit gate.
   - Latest evidence: full `pnpm test:e2e` passed 223 tests after the `/sales` string-date render fix, fixed-assets import-result recovery, and final fixed-assets/inventory E2E race hardening; focused fixed-assets E2E passed 8 tests and focused inventory E2E passed 5 tests; `pnpm test:db` passed 40 files / 437 tests; `pnpm test` passed 56 files / 633 tests; `pnpm lint` now passes with 0 errors / 3 existing TanStack/React Compiler warnings after mechanical unused-code cleanup; `pnpm build` passed; `pnpm tsc --noEmit`, `pnpm exec drizzle-kit check`, `git diff --check`, and no-active-`vat_records` search passed. Unit/build/full-DB/full-E2E/lint/Drizzle/TypeScript/diff/no-active-`vat_records` were refreshed after lint cleanup.
4. Resolve or explicitly accept review debt.
   - Claude Companion is now available for follow-up slices. Recent review debt closed for imports payment unlink / GL reversal, close/posting readiness, POS/cash posting, inventory movement posting/outbox, payroll payment/remittance outbox, CIT accrual/payment posting-outbox, fixed-asset depreciation posting-outbox, and BYO-Copilot settings hardening; any remaining historic skipped reviews must be resolved or explicitly accepted before PR-ready status.
5. Choose remaining feature slices only after the packaging/review surface is stable.
   - Smallest remaining owner-testable gaps are imports direct-clear/backfill/reversal depth, richer inventory count/approval/statutory true-up workflows, payroll employee 50 Tawi and receipt/reconciliation flows, bank/WHT/realized FX revaluation, exact TP form rendering, and Copilot live model/MCP orchestration.

## Dependency Order

```text
Hardened shipped-code baseline
  -> Phase 8.5 VAT operations ledger
  -> Phase 9 foreign-vendor tax
  -> Phase 9.5 tax workflow control tower
  -> Phase 10.5 GL primitives for tax settlement postings
  -> Phase 10 POS + cash flow + §87 reports
  -> Phase 10.6a imports
  -> Phase 10.6b inventory + COGS
  -> Phase 11 payroll
  -> Phase 13 fixed assets
  -> Phase 14 analytics + FX + cost centers
  -> Phase 12a CIT engine
  -> Phase 12b TFRS/DBD/audit pack
  -> Phase 16 AI copilot + tool/MCP action layer

DBD/TFRS research spike
  -> blocks Phase 12b

Phase 15 UI nav refactor
  -> should happen before Phase 10+ screen proliferation

Phase 8 corrective learning
  -> provides the first narrow AI correction-chat pattern
  -> informs Phase 16 copilot/tool confirmation model

Phase 8.5 VAT operations ledger
  -> blocks Phase 9 PP36/P.N.D.54 work
  -> feeds Phase 9.5 VAT forecasting and filing drilldowns
  -> blocks reliable Phase 10 §87 reports
  -> emits tax payment / settlement outbox events for Phase 10.5 PP30/PP36 GL settlement postings

Phase 9 foreign-vendor tax
  -> feeds Phase 9.5 WHT form-correct summaries and PND.54 workflow surfaces
```

## Baseline Gate

Before starting complex expansion, confirm:

- DB tenant boundaries and current period locks are enforced. Baseline hardening passed on 2026-04-29.
- Confirmed/filed source data cannot mutate silently.
- VAT/WHT/document confirmation paths share the hardened baseline workflow.
- VAT filings have item-level immutable snapshots; monthly rollups are derived from filing lines, not live document scans.
- PP30 input VAT claim workflow supports six-month expiry, hold/do-not-claim, and oldest-eligible-first default allocation.
- Filed PP30 credit carryforward is tracked separately from expiring unclaimed input VAT.
- PP36 obligations are fixed to their required month and cannot be silently carried forward.
- PP36 remittance is recorded before later PP30 reclaim eligibility.
- VAT forecasting exposes future reclaimable VAT, expiry windows, and PP36 paid-to-PP30 reclaim timing.
- WHT summaries are grouped by actual filing form, including PND.54 as a separate lane from PND.53.
- Reconciliation cannot over-allocate.
- Current app checks are green.
- Today-gap remediation is completed and archived.

## Deferred, Not Scheduled

- Phase 8 Tier 4 autonomous drift detection.
- Public MCP write tools before app-side confirmation protocol exists.
- Autonomous AI agents that mutate accounting data without user confirmation.
- Multi-entity consolidation.
- Direct RD e-Submission.
- e-Tax Invoice / e-Receipt issuance.
- Marketplace and delivery connectors.
- FlowAccount POS connector.
- Bilingual payslips, severance formula automation, and provident fund integration.
- Manufacturing/BOM, multi-warehouse transfers, lot/serial tracking, and expiry.
- Audit-firm-specific exchange formats.
- Specific Business Tax and excise tax.
- Thai-domiciled hosting if scale, latency, or data-sovereignty needs demand it.
