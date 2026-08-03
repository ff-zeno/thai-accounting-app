# Thai Accounting Platform — Roadmap and Exec-Plan Index

**Status:** Active table of contents and remaining-work map.
**Last updated:** 2026-08-02 (design gate exited; the owner-mode shell/kit implementation is executed in the working tree, pending peer review; `design-refresh.md` and the visual half of `ui-consistency.md` were merged into that pass).
**Current baseline:** PR #1 merged to `main` at `f89b7f420f4daeb80e89d631e1336be5644512d8`; Vercel Production deploy succeeded; post-merge `pnpm db:migrate`, `pnpm tsc --noEmit`, and 65-route smoke passed.

This file is the first place to read before planning more work. It separates:

- Active plans: documents that drive the next work.
- Completed evidence: shipped phase plans and historical audits.
- Remaining work: the actual blockers/gaps still worth scheduling.

## Active Exec Plans

Only keep documents here when they drive current or next work.

| Document | Role | Done condition |
|---|---|---|
| `owner-mode-ux-reset.md` | **Authoritative active plan, design gate exited 2026-08-02:** reset the owner foreground around truth documents and reconciliation. The shell/kit implementation (Ink Neutral tokens, 5-item nav, route tabs, page sweeps, legacy rip-out) is executed in the working tree and awaits peer review; the documents-first workflow stages and VAT read-model gate remain. | Peer review + `/design-review` reach zero P1; then the dual-source intake, evidence-provenance reconciliation, VAT truth contract, and progressive disclosure are implemented and accepted. |
| `engineering-hardening.md` | Reliability backbone: CI, golden-path E2E, money-math hardening, effective-dated tax config, 2027 holidays, payroll test coverage, in-flight VAT commit, external-validation kickoff | CI gates every PR, golden-path E2E green, no float money math, tax config centralized and date-safe, dirty tree cleared |
| `ui-consistency.md` | Partially executed 2026-08-02 (status registry, DESIGN.md rules, and header/empty-state/money furniture landed via the UI reset); remaining scope is the shared data-table, table migrations, and react-hook-form adoption | Owner-mode tables use the shared data-table; one form approach documented and exemplified |
| `design-refresh.md` | Executed 2026-08-02 via the owner-mode UI reset (single approved direction "Quicken Soft + Ink Neutral" replaced the 4–5-direction bake-off); kept as evidence until the review loop closes | Final `/design-review` + peer review reach zero P1, then move to `completed/` |
| `completion-control.md` | Live checklist for holistic app completion after PR #1 merge, now oriented around the owner-mode reset | Owner-mode reset shipped, external blockers closed or explicitly deferred, and remaining product gaps either shipped or accepted as post-v1 |
| `dbd-tfrs-research-spike.md` | CPA/DBD Builder validation blocker for fileable DBD/TFRS output | CPA-reviewed schema/notes taxonomy and authenticated Builder validation available |
| `phase-12b-tfrs-dbd-audit-pack.md` | Remaining DBD/TFRS/audit-pack implementation plan | Fileable financial statements, notes, Builder packet, and auditor ZIP implemented and Builder-validated |
| `roadmap.md` | This table of contents and current-state index | Replaced by a newer roadmap |

## Completed Evidence

Completed plans live in `docs/exec-plans/completed/`. They are historical evidence for what landed, not the current work queue.

| Group | Documents |
|---|---|
| Original platform and baseline | `000-overview.md`, `001-schema.md`, `001-thai-accounting-platform-monolith-archived.md`, `baseline-hardening-v2-task.md`, `baseline-hardening.md`, `today-gap-remediation.md` |
| Early app phases | `phase-0-validation.md`, `phase-1a-infrastructure.md`, `phase-1b-app-shell.md`, `phase-2-bank-statements.md`, `phase-3-documents-ai.md`, `phase-4-reconciliation.md`, `phase-5-wht-tax.md`, `phase-6-vat-reporting.md`, `phase-7-ai-batch-matching.md`, `phase-7-learning-metrics.md`, `phase-7-ui-reconciliation.md` |
| Merged PR #1 baseline evidence | `dirty-tree-checkpoint-2026-05-17.md`, `goal-completion-audit-2026-05-17.md`, `overnight-completion-control.md`, `owner-test-plan-2026-05-17.md` |
| Shipped operational v1 phase plans | `chart-of-accounts.md`, `phase-8-5-vat-operations-ledger.md`, `phase-8-extraction-learning-loop.md`, `phase-9-foreign-vendor-tax.md`, `phase-9-5-tax-workflow-control-tower.md`, `phase-10-pos-and-cash-flow.md`, `phase-10-5-gl-primitives.md`, `phase-10-6-imports.md`, `phase-10-6-inventory-cogs-imports.md`, `phase-11-payroll.md`, `phase-12a-cit-engine.md`, `phase-13-fixed-assets-depreciation.md`, `phase-14-analytics-audit-pack.md`, `phase-15-ui-nav-refactor.md`, `phase-16-ai-copilot-tool-layer.md` |

## Current State

The app is now a broad non-production baseline, but the primary UX is too complex for the intended user. The merged stack includes VAT operations ledger, WHT/foreign-vendor tax, tax workflow surfaces, GL/accounting, POS/sales, imports, inventory, payroll, fixed assets, analytics/FX/cost centers, CIT/year-end readiness, navigation shell, and Copilot preview/settings.

This is not production/fileable complete. The immediate gap is no longer "add more accounting features." The immediate gap is a product-design-approved documents-first reset around Home, Bank, Documents, Tax, and More, with advanced accounting/audit modules hidden or demoted.

The proposed documents-first product model is:

- Bank statements and transactions are money/cash truth.
- POS sales data is customer-transaction truth for gross/net sales, VAT, SKU effects, and settlement/cash-deposit provenance.
- Expense receipts and supplier tax invoices are VAT-bearing evidence reconciled against bank outflows.
- Reconciliation confirms each bank movement has source evidence, a POS settlement/cash explanation, or an explicit exception.
- Tax consumes authoritative VAT/WHT lifecycle records after their source-of-truth contract is resolved.

## Remaining Work

### Engineering reliability (see `engineering-hardening.md` and `docs/reviews/engineering-review-2026-06-12.md`)

- No CI exists; add GitHub Actions gates before further feature work.
- No golden-path E2E proving statement → document → extraction → reconciliation → PP30 draft.
- Float money math in `src/lib/reconciliation/matcher.ts` and `src/lib/tax/vat-register.ts`.
- Tax config date bombs: 2026-only holiday calendar, VAT 7% hardcoded in 4 places (rate validated only through Sep 2026), static deadline constants, WHT rate duplication.
- Uncommitted branch-scoped VAT PP30 work (13 files, migrations 0072/0073) needs gates + commit.
- Payroll and reconciliation-rule test coverage gaps; no Inngest failed-run audit trail.

### UI consistency and design (see `ui-consistency.md`)

- Done 2026-08-02 via the UI reset: visual identity ("Quicken Soft + Ink Neutral"), status-badge registry, PageHeader/EmptyState/Amount standardization, raw-palette elimination.
- Still open: shared data-table over the bespoke table implementations, and one form approach (react-hook-form + zod) for the 9 ad-hoc forms.

### Documents-first UX reset — design gate exited 2026-08-02, shell implemented

- The shell/nav/visual-kit half is executed (working tree, pending peer review); the workflow stages (dual-source intake, evidence-provenance reconciliation, Tax lifecycle) remain per `owner-mode-ux-reset.md`.
- Default navigation to owner mode: Home, Bank, Documents, Tax, More.
- Demote GL/accounting internals, analytics, CIT/year-end, fixed assets, imports control, advanced settings, admin, and Copilot tool runner.
- Rework Home into "what needs attention" and "this month's filings."
- Rework Bank and Documents around the two starting truth inputs, AI extraction/coding, matching, money location, sales provenance, and exception review.
- Resolve the VAT read-model/source-of-truth contract before Tax lifecycle tables or diagrams; then rework Tax around monthly readiness and line-level lifecycle status.

### External validation

- CPA/accountant review of statutory assumptions and filing/readiness workflows.
- Authenticated DBD Builder validation for TFRS/DBD statements, notes, Builder packet, and auditor ZIP.
- Production SSO rate/cap and submission-format validation.
- Live Blob/Inngest WHT certificate storage QA.
- Exact RD/SSO export fixtures and employee 50 Tawi production-format validation.
- Exact transfer-pricing form rendering validation.

### Product gaps to schedule after QA

- Owner-mode UX: approved documents-first Bank/POS/expense-evidence intake, reconciliation, monthly VAT/WHT checklist, VAT line lifecycle, WHT line lifecycle.
- Imports: direct-clear customs, backfill/reversal depth, richer document/payment picker UX, richer charge classifier UX.
- Inventory: FIFO/specific-ID/statutory true-up, richer count edit/approval, line-level SKU assignment, demand/reorder automation.
- Sales/POS: connectors, richer settlement matching, cash slip OCR, bank matching, branch/establishment propagation, Excel/PDF section 87 exports.
- Payroll: exact file exports, employee 50 Tawi production flow, receipt attachments, reconciliation, bank matching.
- Analytics/FX: bank/WHT FX revaluation, realized settlement FX, remaining posting-context allocation metadata.
- DBD/TFRS: fileable statements, notes, Builder packet, and auditor ZIP after CPA/Builder validation.
- Copilot: live model orchestration, MCP, and confirmed/posted source writes beyond current guarded preview/apply tools.
- Extraction learning: richer correction assistant and broader FedEx/Photoism held-out validation when more samples exist.

## Planning Rules

- `active/` is the current queue. Keep it small.
- `completed/` is evidence. Do not treat a completed phase doc as the next plan just because it still lists future enhancements.
- Promote a residual item from this roadmap into a dedicated active plan only when it becomes the selected next slice.
- Do not schedule new broad accounting surface before the owner-mode UX reset.
- For compliance behavior, verify official or primary sources before encoding rules.
- For library/framework/API docs, use `ctx7` per `AGENTS.md`.
- Do not claim production/fileable completeness until the external blockers above are closed or explicitly deferred by the owner.

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
- Thai-domiciled hosting unless scale, latency, or data-sovereignty needs demand it.
