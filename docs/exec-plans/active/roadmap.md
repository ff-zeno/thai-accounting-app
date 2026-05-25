# Thai Accounting Platform — Roadmap and Exec-Plan Index

**Status:** Active table of contents and remaining-work map.
**Last updated:** 2026-05-17.
**Current baseline:** PR #1 merged to `main` at `f89b7f420f4daeb80e89d631e1336be5644512d8`; Vercel Production deploy succeeded; post-merge `pnpm db:migrate`, `pnpm tsc --noEmit`, and 65-route smoke passed.

This file is the first place to read before planning more work. It separates:

- Active plans: documents that drive the next work.
- Completed evidence: shipped phase plans and historical audits.
- Remaining work: the actual blockers/gaps still worth scheduling.

## Active Exec Plans

Only keep documents here when they drive current or next work.

| Document | Role | Done condition |
|---|---|---|
| `owner-mode-ux-reset.md` | Current selected implementation slice: reset the product around owner workflow, bank-first reconciliation, documents, VAT, and WHT | Owner-mode nav and core workflows are simplified; advanced/accountant areas are demoted; VAT lines show source-to-filing lifecycle status |
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

This is not production/fileable complete. The immediate gap is no longer "add more accounting features." The immediate gap is a product reset around the owner workflow: Home, Bank, Documents, Tax, and More, with advanced accounting/audit modules hidden or demoted.

The active product model is:

- Bank is the source of truth.
- Documents, POS exports, payroll, imports, and optional feeds explain bank movement.
- Reconciliation confirms every bank line has source evidence or an explicit explanation.
- Tax consumes reconciled and classified lines for monthly VAT and WHT compliance.

## Remaining Work

### UX reset

- Ship `owner-mode-ux-reset.md` before scheduling additional feature expansion.
- Default navigation to owner mode: Home, Bank, Documents, Tax, More.
- Demote GL/accounting internals, analytics, CIT/year-end, fixed assets, imports control, advanced settings, admin, and Copilot tool runner.
- Rework Home into "what needs attention" and "this month's filings."
- Rework Bank and Documents around upload, AI extraction/coding, matching, and exception review.
- Rework Tax around monthly VAT/WHT readiness and line-level lifecycle status.

### External validation

- CPA/accountant review of statutory assumptions and filing/readiness workflows.
- Authenticated DBD Builder validation for TFRS/DBD statements, notes, Builder packet, and auditor ZIP.
- Production SSO rate/cap and submission-format validation.
- Live Blob/Inngest WHT certificate storage QA.
- Exact RD/SSO export fixtures and employee 50 Tawi production-format validation.
- Exact transfer-pricing form rendering validation.

### Product gaps to schedule after QA

- Owner-mode UX: bank-first reconciliation, unified document inbox, monthly VAT/WHT checklist, VAT line lifecycle, WHT line lifecycle.
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
