# Plan: Phase 9.5 — Tax Workflow Control Tower

**Status:** Completed 2026-05-16 — VAT ledger workflow surfaces, WHT form workflow routes, source-linked WHT register, centralized tax exception read model, data-backed PND.54 separation UI smoke, and seeded manual QA scenarios landed
**Depends on:** Phase 8.5 VAT operations ledger, Phase 9 foreign-vendor tax, Phase 15 tax/navigation IA
**Blocks:** Comfortable owner-facing tax workflows before Phase 10+ screen expansion
**Priority:** High user-trust layer after VAT/WHT data correctness

## Problem

The platform now has separate VAT and WHT navigation, but the deeper workflow still needs to answer the questions Thai operators actually ask every month:

- What WHT did we withhold this month, and which RD form does each amount belong to?
- What WHT did customers withhold from payments to us, and do we have their 50 Tawi evidence?
- Which VAT amounts are ready for PP30, which are held, and which are close to expiry?
- Which PP36 payments can later reduce PP30, and when?
- Which source expenses, sales, bank transactions, receipts, and certificates are inside a specific filing?
- What will our likely VAT payable/refundable position be in future months if current documents stay as-is?

FlowAccount has useful filing steps, but feedback says it misses two control needs: WHT form-correct summaries and VAT planning for PP36 paid VAT becoming future PP30 input VAT. This phase turns those needs into workflow screens and read models.

## Scope

This phase does not invent new tax source-of-truth tables. It builds user-facing workflow surfaces over:

- Phase 8.5 VAT ledgers: `vat_input_items`, `vat_output_items`, `pp36_obligations`, `vat_filings`, `vat_filing_lines`, `tax_payment_events`, and VAT credit carryforward state.
- Phase 9 WHT state: WHT certificates, WHT credits received, WHT monthly filings, foreign WHT rate audit fields, and PND.54 routing.
- Phase 15 navigation structure: generic menu labels with form-specific detail inside pages.

## 2026-05-16 Implementation Checkpoint

Current implemented surfaces:

- VAT dashboard loads from the Phase 8.5 VAT operations ledger read model.
- VAT register, input, output, filings, filing drilldown, and forecast routes are live under `/tax/vat`.
- VAT filing drilldown shows frozen filing-line state from ledger filings.
- WHT dashboard route `/tax/withholding` separates incoming WHT, outgoing WHT, register, and filings workflows.
- Incoming WHT route `/tax/withholding/incoming` reuses the WHT credits received workflow.
- Outgoing WHT route `/tax/withholding/outgoing` reuses the WHT certificates workflow.
- WHT filings route `/tax/withholding/filings` exposes monthly PND.2, PND.3, PND.53, and PND.54 tabs after period load.
- Phase 15 navigation includes VAT Forecast and WHT workflow destinations.

Current gaps:

- WHT register is now a source-linked tabular read model over incoming WHT credits and outgoing WHT certificates, with form, period, filing status, evidence status, source document IDs, and PND.54 separation coverage.
- Owner-facing exception aggregation (`getTaxWorkflowExceptions`) is centralized for unresolved system exceptions, incoming WHT credits missing certificate evidence, and outgoing WHT certificates not linked to filings.
- VAT forecast is advisory and ledger-backed, but richer planning notes remain deferred.
- Manual QA scenarios for PP36 payment-to-reclaim forecast and mixed incoming/outgoing WHT still need seeded data.

## Required Screens

### VAT dashboard

Show current and future VAT position:

- Current PP30 estimate: output VAT, local input VAT, PP36 reclaims, carryforward, net payable/refundable.
- Current PP36 obligations and payment status.
- Forecast by future month for at least the next six months.
- Expiring input VAT and expiring PP36 reclaim windows.
- Exceptions: missing full tax invoice, unpaid PP36, late PP36, source hash drift, missing receipt evidence.

### VAT forecasting

Purpose: help the user understand future claim potential before filings are built.

Rows should include:

- Source document/vendor/customer.
- VAT amount.
- VAT type: local input, output, PP36 reclaim, carryforward.
- Eligible period.
- Expiry period where applicable.
- Planned filing period if user has set one.
- Current status and blocking reason.
- Links to source document, filing, payment event, and evidence.

Rules:

- Forecasting is advisory. It must not mark an item filed or reclaimed.
- A forecast can create a draft plan or note, but actual status changes happen only through filing builder/server actions.
- The view must show what will expire if the current plan is not changed.

### VAT filings drilldown

Every PP30/PP36 filing detail page must provide:

- A line-level table grouped by output VAT, input VAT, PP36 obligations, PP36 reclaims, carryforward, and adjustments.
- Frozen amount totals that reconcile to the filing header.
- Source links back to documents, document lines, bank transactions, payment events, and uploaded RD receipts.
- State chips: draft, filed, paid, amended, held, excluded, expired, voided by amendment.

### WHT dashboard

Show two different directions clearly:

- Incoming WHT: customers paid us net and issued/owe us 50 Tawi evidence. These are credits received for later CIT/year-end use.
- Outgoing WHT: we paid vendors net, withheld tax, issued/owe 50 Tawi certificates, and owe RD monthly filing/payment.

Show monthly totals by form:

- PND.2
- PND.3
- PND.53
- PND.54

Foreign/international WHT must appear in PND.54 and must not be blended into PND.53.

### WHT register

Tabular evidence register:

- Direction: incoming or outgoing.
- Counterparty.
- Payment date.
- Gross amount.
- WHT rate and amount.
- Certificate status.
- Filing form.
- Filing period and filing status.
- Source document/payment link.

### WHT filings

Workflow-focused page with form-specific sections inside:

- Monthly period selector.
- Form cards/tabs for PND.2, PND.3, PND.53, PND.54.
- Certificate count, base amount, withheld amount, filing status, payment status.
- Drilldown by payee/certificate.
- Exceptions for missing certificate evidence, foreign payee classification conflicts, or below-default foreign WHT rate acknowledgment.

## Read Models

Add read models or query helpers, not independent accounting ledgers:

- `getVatForecastByPeriodRange(orgId, startPeriod, endPeriod)`
- `getVatFilingDrilldown(orgId, filingId)`
- `getWhtMonthlySummaryByForm(orgId, period)`
- [x] `getWhtRegisterRows(orgId, filters)`
- [x] `getTaxWorkflowExceptions(orgId, periodRange)`

Each read model must be tenant-scoped at query boundaries and should return source links needed by the UI.

## Acceptance Criteria

- [x] VAT forecasting shows local input VAT, PP36 reclaim potential, carryforward use, expiry risk, and net projected PP30 position by month.
- [x] Forecast planning does not mutate filing state.
- [x] PP30 and PP36 filings can be opened to see ledger filing rows.
- [x] WHT monthly summary/register is grouped by PND form and prevents foreign WHT from appearing under PND.53 in a data-backed DB test.
- [x] Incoming WHT and outgoing WHT are visibly separate workflows.
- [x] Register rows link back to source evidence workflows and carry source document/certificate IDs in the read model.
- [x] Tax workflow exception panel surfaces unresolved system exceptions, incoming missing-certificate evidence, and outgoing unfiled certificates on the WHT dashboard.
- [x] Screens preserve generic nav labels while showing legal form names inside the workflow.

## Verification

- [x] Unit/query tests for VAT forecast buckets, expiry windows, PP36 reclaim eligibility, and totals. Covered by Phase 8.5 VAT ledger DB/action suites.
- [x] Unit/query tests for WHT form routing, including foreign corporate payee -> PND.54. Covered by WHT certificates and foreign-vendor tax suites.
- [x] Route-render Playwright smoke for VAT dashboard, VAT forecasting, VAT filing drilldown, WHT dashboard, WHT register placeholder, and WHT filings shell. Evidence: `pnpm test:e2e e2e/tax/vat.spec.ts`; `pnpm test:e2e e2e/tax/monthly-filings.spec.ts e2e/tax/calendar.spec.ts e2e/tax/wht-certificates.spec.ts e2e/tax/withholding-workflow.spec.ts`.
- [x] Data-backed DB test for WHT register rows grouped by form, including PND.54, plus Playwright route smoke for the real register table.
- [x] Data-backed DB test for centralized tax workflow exceptions plus WHT dashboard smoke. Evidence: `pnpm vitest run --config vitest.config.db.ts src/lib/db/queries/tax-workflow-exceptions.db.test.ts`; `pnpm test:e2e e2e/tax/withholding-workflow.spec.ts`.
- [x] Data-backed Playwright WHT filings test seeds current-period PND.53 and PND.54 certificates and verifies each remains visible only in its own tab. Evidence: `pnpm test:e2e e2e/tax/withholding-workflow.spec.ts`.
- [x] Manual QA seed with a foreign service payment: PP36 obligation -> PP36 filing -> PP36 payment -> future PP30 reclaim forecast. Evidence: `pnpm test:e2e e2e/tax/vat.spec.ts`.
- [x] Manual QA with incoming and outgoing WHT in the same month: dashboard separates them and WHT filings group outgoing amounts by form. Evidence: `pnpm test:e2e e2e/tax/withholding-workflow.spec.ts`.

## Deferred

- Direct RD e-submission.
- Automated treaty-rate correctness.
- AI agent write tools that change filing state.
- Cross-entity consolidated tax forecasting.
