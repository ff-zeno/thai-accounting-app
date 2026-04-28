# Thai Accounting Platform — Roadmap & Exec-Plan Index

**Status:** Active source of truth
**Last updated:** 2026-04-29
**Purpose:** Keep the exec-plan table of contents, status, dependency order, and active residuals clear before Phase 9+ expansion work resumes.

## Vision

Build an audit-compliant Thai accounting platform that small-business owners can run day to day, while still producing records a Thai-licensed CPA can review and sign from.

This means:

- Real accounting spine: chart of accounts, double-entry GL, journal entries, trial balance, P&L, balance sheet, cash flow, period close, and audit trail.
- Thai compliance coverage: PP30, PP36, PND.1/2/3/53/54, SSO, PND.51/50, DBD financial statements, TFRS for NPAEs audit pack, and §87 reports.
- Owner-usable UX: workflows explain business facts in plain language, but accounting and tax invariants are enforced in the database and reviewed by accountant-role gates.
- Every filed number must trace back to source evidence.

## Current State

Phases 0-7 are completed and archived. Phase 8 is active/dogfood. Baseline hardening v2 and the residual baseline-hardening pass are completed and archived. One shipped-code compliance residual plan remains active:

- `today-gap-remediation.md` remains active because several compliance patches are still open.

No Phase 9+ implementation should start until the active residuals are either implemented or explicitly deferred with owner/accountant sign-off.

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
| `baseline-hardening-v2-task.md` | Completed 2026-04-28; implementation source for the hardening v2 slice |
| `baseline-hardening.md` | Completed 2026-04-29; residual tenant-isolation sweep, audit-log partitioning, audit metadata assignment, and final baseline gate |

## Active Exec Plans

All active plans live in `docs/exec-plans/active/`.

| Status | Document | Role | Move-to-completed condition |
|---|---|---|---|
| Active residual | `today-gap-remediation.md` | Shipped-code compliance gaps | Open P0/P1/P2 gaps implemented or explicitly folded into later phases |
| Active/dogfood | `phase-8-extraction-learning-loop.md` | AI extraction learning loop | Dogfood complete; Tier 4 either planned separately or deferred |
| Active reference | `chart-of-accounts.md` | Thai COA design | Keep active until Phase 10.5 GL account implementation is done |
| Research spike | `dbd-tfrs-research-spike.md` | DBD/TFRS validation | CPA/DBD Builder-validated schema and notes taxonomy produced |
| Draft | `phase-9-foreign-vendor-tax.md` | Foreign-vendor VAT/WHT | Implemented and verified |
| Draft | `phase-10-pos-and-cash-flow.md` | POS, cash flow, §87 reports | Implemented and Lumera cutover complete |
| Draft | `phase-10-5-gl-primitives.md` | GL spine | Implemented, opening balances entered, first close completed |
| Draft | `phase-10-6-imports.md` | Import module | Implemented and connected to inventory/GL outputs |
| Draft | `phase-10-6-inventory-cogs-imports.md` | Inventory + COGS | Implemented and reconciled to GL |
| Draft | `phase-11-payroll.md` | Payroll + SSO + PND.1 | Implemented and posted to GL |
| Draft | `phase-12a-cit-engine.md` | CIT engine | Implemented and year-end ordering verified |
| Draft/blocked | `phase-12b-tfrs-dbd-audit-pack.md` | FS, DBD, audit pack | Requires DBD/TFRS spike output; implemented and Builder-validated |
| Draft | `phase-13-fixed-assets-depreciation.md` | Fixed assets | Implemented and depreciation posts to GL |
| Draft | `phase-14-analytics-audit-pack.md` | Analytics, FX, cost centers | Implemented; FX engine feeds CIT/year-end |
| Draft | `phase-15-ui-nav-refactor.md` | Navigation reset | Implemented before deep Phase 10+ UX expansion |

## Cross-Cutting Specs

| Document | Role |
|---|---|
| `docs/_ai_context/period-lock-protocol.md` | Canonical `period_locks` table, lock trigger, and override protocol |
| `docs/_ai_context/pnd-filings-migration-protocol.md` | Staged migration from WHT monthly filings to unified PND filings |

## Immediate Work Order

1. Close or explicitly defer active residuals.
   - `today-gap-remediation.md`: finish PP30 POS/channel guard, VAT-period override constraint/workflow, foreign-vendor review, §3.4 WHT snapshots, annual below-1000 WHT exemption, Thai holiday calendar, PND.2, exception queues, below-default foreign WHT gate, and WHT reissue/received tracking.
2. Run the DBD/TFRS research spike early.
   - This is the highest calendar-risk dependency because CPA/DBD Builder validation can take weeks even if engineering effort is small.
3. Finish Phase 8 dogfood decisions.
   - Decide whether Tier 4 becomes its own plan or stays deferred.
4. Ship Phase 15 before deep Phase 10+ UX work.
   - The nav model should be stable before adding POS, GL, inventory, payroll, CIT, and audit-pack screens.
5. Start expansion in dependency order.
   - Phase 9, then Phase 10, then Phase 10.5, then Phase 10.6a/10.6b, then Phase 11/13/14, then Phase 12a/12b.

## Dependency Order

```text
Today-gap residuals
  -> Phase 9 foreign-vendor tax
  -> Phase 10 POS + cash flow + §87 reports
  -> Phase 10.5 GL primitives
  -> Phase 10.6a imports
  -> Phase 10.6b inventory + COGS
  -> Phase 11 payroll
  -> Phase 13 fixed assets
  -> Phase 14 analytics + FX + cost centers
  -> Phase 12a CIT engine
  -> Phase 12b TFRS/DBD/audit pack

DBD/TFRS research spike
  -> blocks Phase 12b

Phase 15 UI nav refactor
  -> should happen before Phase 10+ screen proliferation
```

## Baseline Gate

Before starting complex expansion, confirm:

- DB tenant boundaries and current period locks are enforced. Baseline hardening passed on 2026-04-29.
- Confirmed/filed source data cannot mutate silently.
- VAT/WHT/document confirmation paths share the hardened baseline workflow.
- Reconciliation cannot over-allocate.
- Current app checks are green.
- Remaining residuals in `today-gap-remediation.md` are either done or consciously deferred.

## Deferred, Not Scheduled

- Phase 8 Tier 4 autonomous drift detection.
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
