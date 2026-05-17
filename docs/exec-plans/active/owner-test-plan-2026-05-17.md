# Owner Test Plan — 2026-05-17

**Status:** Active post-merge manual QA guide for PR #1.

Use this after merging PR #1 and starting the app locally. It focuses on owner/accountant workflows that should now be testable from the UI. It deliberately separates "owner-testable v1" from known remaining gaps so manual QA does not confuse unfinished roadmap items with regressions.

## Remaining Blockers

Track the full checklist in `docs/exec-plans/active/completion-control.md`. For manual QA, the important blockers are:

- [ ] Run this walkthrough against the merged baseline, not the pre-merge branch preview only.
- [ ] Treat CPA/DBD Builder validation, SSO production configuration, live Blob/Inngest WHT storage QA, exact RD/SSO exports, employee 50 Tawi production format, and exact TP form rendering as blocked until external evidence exists.
- [ ] Treat imports direct-clear/backfill/reversal depth, inventory FIFO/specific-ID/statutory true-up, richer count approvals, bank/WHT/realized FX, payroll receipt/reconciliation/bank matching, DBD/TFRS fileable packets, and Copilot live-model orchestration as known remaining product gaps unless a tested flow below says otherwise.
- [ ] File manual QA findings by workflow area. Do not reopen the PR-splitting plan unless a concrete regression makes a targeted rollback safer than a follow-up fix.

## Preflight

Local launch:

```bash
pnpm db:migrate
pnpm dev
```

Open `http://localhost:3015`, which is the port pinned by the current `package.json` `dev` script, unless the dev server reports a different port. Use the normal local Clerk/dev account for manual QA. If auth or seeded data is missing, run the automated route smoke first and treat data-dependent owner checks as blocked, not failed.

Minimal run before manual testing:

```bash
pnpm db:migrate
pnpm tsc --noEmit
pnpm test:e2e e2e/smoke/all-pages.spec.ts
```

Latest full local gate recorded on 2026-05-17:

```bash
pnpm test
pnpm lint
pnpm build
pnpm test:db
pnpm test:e2e
pnpm exec drizzle-kit check
```

Current evidence: unit tests passed 56 files / 633 tests, lint passed with 0 errors / 3 existing TanStack/React Compiler warnings, build passed with 81 static app pages, DB tests passed 40 files / 437 tests, full E2E passed 223 tests, focused fixed-assets E2E passed 8 tests after dashboard-create race hardening, focused inventory E2E passed 5 tests after count-link race hardening, Drizzle check passed, TypeScript/diff checks passed, generated artifact status was clean, and no active `vat_records` runtime path was found outside excluded docs/migrations/meta/test-results.

Known local warnings that are not test blockers:

- `Invalid Sentry Dsn: REPLACE_ME`
- Next.js middleware/proxy deprecation warning
- `NO_COLOR` ignored because `FORCE_COLOR` is set

## VAT Operations Ledger

Routes:

- `/tax/vat`
- `/tax/vat/input`
- `/tax/vat/output`
- `/tax/vat/register`
- `/tax/vat/filings`
- `/tax/vat/forecast`

Owner checks:

- Load a VAT period and confirm the dashboard shows ledger-backed PP30 totals.
- Open input/output/register pages and confirm rows show item-level status instead of legacy rollups.
- Build and inspect PP30/PP36 drafts if seeded data is available.
- In forecast, confirm PP36 reclaim tracker shows paid-to-reclaim lifecycle.
- Confirm abbreviated tax invoices (`abb`) and non-tax-invoice evidence are not claimable input VAT. Claimable PP30 input VAT should require full/e-tax invoice subtype plus invoice number and date.

Expected v1 behavior:

- No active `vat_records` path.
- Filed lines should be immutable; source edits should be blocked or amendment-safe.
- ABB/non-TI VAT can be reviewed or held, but it must not enter PP30 claimable/allocated/filed input VAT.

## WHT and Foreign Vendor Tax

Routes:

- `/tax/withholding`
- `/tax/withholding/incoming`
- `/tax/withholding/outgoing`
- `/tax/withholding/register`
- `/tax/withholding/filings`
- `/tax/calendar`
- `/tax/wht-certificates`
- `/tax/wht-credits-received`

Owner checks:

- Confirm incoming and outgoing WHT lanes are visibly separate.
- Confirm PND.54 is separate from PND.53 in filing tabs and calendar lanes.
- Generate/check foreign-payee certificate behavior from existing seeded workflow where available.
- Confirm domestic PND.53 still uses the normal default-rate/PDF/reissue path.
- Confirm `/tax/wht-certificates` and `/tax/withholding/outgoing` show the live Blob/Inngest storage QA caveat before relying on uploaded certificate links.

Known remaining gap:

- Live Blob/Inngest upload timing and browser/storage inspection still need manual QA against real storage.

## Sales, POS, and Cash Flow

Routes:

- `/sales`
- `/analytics/cash-flow`
- `/tax/reports`

Owner checks:

- Review channel balance cards, manual sale capture, processor settlement capture, and cash deposit capture.
- Confirm `/sales` says sales controls are manual/CSV v1 and that processor matching, cash variance resolution, cash-slip OCR/bank matching, connector imports, and Excel/PDF statutory exports remain deferred.
- Open Section 87 reports and verify output/input/goods tabs or report sections expose source traceability.
- Confirm `/tax/reports` says reports are CSV-first v1 workpapers and that Excel/PDF, branch-level input propagation, processor-fee VAT lanes, and PP36 reclaim lanes remain deferred.
- Open cash-flow analytics and confirm scheduled payroll and depreciation signals are visible.

Known remaining gaps:

- Richer processor matching, cash variance resolution, cash slip OCR/bank matching, connector imports, and Excel/PDF exports.

## GL and Accounting

Routes:

- `/accounting`
- `/accounting/journal`
- `/accounting/posting-exceptions`
- `/accounting/reports/general-ledger`
- `/accounting/reports/trial-balance`
- `/accounting/reports/profit-loss`
- `/accounting/reports/balance-sheet`
- `/close`

Owner checks:

- Confirm chart of accounts, recent journal entries, manual/opening/reversal controls, posting queue, and close checklist render.
- Download CSV reports where available.
- Verify posting queue readiness appears in close workflow.
- Confirm `/accounting` says the general ledger is compact v1 and that bulk opening balance import, advanced journal grids, richer statement drilldowns, and full close workflow orchestration remain deferred.

Known remaining gaps:

- Richer P&L/balance sheet drilldowns, bulk opening-balance import, advanced JE grid, and richer period close workflow.

## Imports and Inventory

Routes:

- `/imports`
- `/inventory`
- `/inventory/adjustments/new`
- `/tax/reports`

Owner checks:

- Create or inspect import packets, linked document/evidence/payment sections, broker charge classifier, and finalize-to-inventory status.
- Confirm open import packets can edit reference/declaration/port/notes and that empty open packets can be deleted.
- Confirm open goods and broker/customs charge lines can be deleted only before finalization, with a browser confirmation.
- Confirm open linked documents can be unlinked only before finalization, with a browser confirmation, and that documents used by charge lines remain protected.
- Confirm the payment-link form offers unmatched debit bank transactions as candidates, and open payment links can be unlinked only before finalization with a browser confirmation and visible GL reversal/audit trail.
- Confirm non-empty or finalized import packets cannot be deleted from normal owner workflow.
- Confirm `/imports` says imports are v1 packet controls and that direct-clear customs depth, historical backfill/reversal tooling, and richer picker UX remain deferred.
- Open inventory register, SKU detail movement history/profile edit, count detail, roll-forward, aged inventory, and goods report source-line drilldowns.
- Create a sign-safe manual inventory adjustment from `/inventory/adjustments/new` and confirm outflows are entered as positive quantities but recorded as negative movements.
- Confirm `/inventory` says inventory valuation is weighted-average v1 and that FIFO, specific-ID costing, statutory true-up automation, demand forecasting, and adjustment approval workflow remain deferred/accountant-review cases.

Known remaining gaps:

- Direct-clear/backfill posting outbox migration, richer picker UX, FIFO/specific-ID engines, statutory true-up, richer count editing, demand forecasting, and adjustment approval workflow.

## Payroll

Routes:

- `/payroll`
- `/payroll/employees`
- `/payroll/filings/pnd1`
- `/payroll/filings/pnd1-kor`
- `/payroll/filings/sso`
- employee allowance detail links from `/payroll/employees`
- pay-run detail links from `/payroll`

Owner checks:

- Create/review employee master data and allowance declarations.
- Build/review draft pay runs.
- Open pay-run detail and verify slip preview totals.
- Open PND.1, PND.1 Kor, and SSO filing lists; for seeded draft rows, test submit/accept status transitions with RD/SSO references. On accepted PND.1 and SSO rows, confirm the Pay control appears in the same filing-list workflow.
- Confirm `/payroll` says payroll is workflow-testable v1 and that production filing still needs current SSO config validation, exact RD/SSO exports, employee 50 Tawi, receipt attachment, reconciliation hooks, and bank matching.
- On `/payroll/filings/sso`, confirm the SSO Rate Check shows either active rate/cap/source evidence or the no-active-config fail-closed warning.
- Confirm national ID/bank fields are not exposed on current detail pages.
- Confirm salary/allowance/slip detail reads are audited by the new `read_pii` audit action.

Known remaining gaps:

- Exact RD/SSO exports, employee 50 Tawi, receipt attachment, reconciliation hooks, and bank matching.

## Fixed Assets

Routes:

- `/fixed-assets`
- `/fixed-assets/new`
- `/fixed-assets/import`
- `/fixed-assets/reports/roll-forward`
- asset detail and disposal links from `/fixed-assets`

Owner checks:

- Create a standalone asset.
- Import a prior asset register CSV.
- Open asset detail and depreciation register.
- Dispose of an asset and inspect gain/loss.
- Open roll-forward and verify GL tie-out fields appear only where category-to-account mapping is unique.
- Confirm `/fixed-assets` says fixed assets are straight-line v1 and that declining-balance, units-of-production, impairment workflow, and method changes remain deferred/accountant-review cases.

Known remaining gap:

- Richer depreciation methods and impairment remain deferred.

## Analytics, FX, and Cost Centers

Routes:

- `/analytics/ar-aging`
- `/analytics/ap-aging`
- `/analytics/cash-flow`
- `/analytics/concentration`
- `/analytics/profitability`
- `/analytics/fx-rates`
- `/settings/cost-centers`
- `/settings/projects`
- `/settings/allocation-rules`

Owner checks:

- Confirm dashboard analytics cards drill into cash flow and AR aging.
- Confirm secondary dashboard drilldowns link to payroll, fixed assets, concentration, and profitability.
- Configure cost centers/projects/allocation rules.
- Review segmented profitability and manual FX rate/revaluation controls.
- Confirm `/analytics/fx-rates` says FX revaluation is AR/AP v1 and that partially paid documents, bank-account FX, WHT-credit FX, and realized settlement FX remain deferred.

Known remaining gaps:

- Bank/WHT FX revaluation and realized settlement FX.

## CIT and Audit Prep

Routes:

- `/year-end/cit`
- `/close`

Owner checks:

- Review PND.51/PND.50 draft sections, loss layers, manual book-tax adjustments, TP threshold flag, CIT accrual/payment posting, and year-end close readiness.
- Confirm `/year-end/cit` says CIT is working-paper v1 and that richer book-tax adjustment catalog automation plus exact RD transfer-pricing form rendering/submission remain deferred.
- Confirm close blocks on incomplete readiness where applicable.
- Confirm `/year-end/cit` and `/close` show that DBD/TFRS financial statements, notes, Builder packet, and auditor ZIP are blocked pending CPA/DBD Builder validation.

Known remaining gaps:

- Exact RD transfer-pricing form rendering/submission.
- DBD/TFRS financial statements, notes, Builder packet, and auditor ZIP remain blocked on CPA/DBD Builder validation.

## Copilot

Routes:

- `/copilot`
- `/settings/ai`

Owner checks:

- Run read-only tools from `/copilot`.
- Use deterministic prompt router for document/vendor/account search and tax-position summaries.
- Preview document recodes before applying.
- Confirm `apply_recode_documents` requires accountant role and exact `APPLY RECODE` confirmation.
- Confirm `/settings/ai` stores provider-key references only, not raw keys.
- Confirm `/settings/ai` and `/copilot` say live model orchestration is preview-only and current prompts route through deterministic audited tools.

Known remaining gaps:

- Live model/provider orchestration and richer correction proposals.

## Recommended Stop Criteria for Manual QA

Stop and file a bug if any of these happen:

- A route in the 65-route smoke manifest 500s.
- A filed/locked VAT, payroll, GL, import, inventory, CIT, or fixed-asset period can be mutated without an explicit override/amendment-safe path.
- ABB/non-TI evidence appears as claimable, allocated, or filed PP30 input VAT.
- A source document or posting can cross tenant/org boundaries.
- National ID, bank account, or similarly sensitive payroll fields appear on current v1 payroll detail pages.
- A Copilot write tool mutates accounting data without role gate, preview/confirmation, audit event, and period-lock checks.
- WHT certificate generation reports success but the stored PDF URL does not resolve, the upload MIME type is not `application/pdf`, or the page hides the live Blob/Inngest storage-readiness caveat.
- `/payroll/filings/sso` lacks an active SSO rate/config warning when production config is missing or unverified.
- `/year-end/cit` or `/close` stops showing the DBD/TFRS blocked-state warning before CPA plus authenticated DBD Builder validation is complete.
