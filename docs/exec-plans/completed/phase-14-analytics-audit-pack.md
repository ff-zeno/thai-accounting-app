# Plan: Phase 14 — Analytics, FX Revaluation, Cost Center / Project, Close Checklist

**Status:** Implementation-active — foundation shipped 2026-05-16; AR/AP aging, cash forecast with payroll/depreciation signals, standalone concentration view, DSO, gross-margin by category, dashboard analytics widgets with drilldowns, close checklist, Phase 12b audit-pack query handoff, cost-center/project v1 UI, allocation-rule v1 UI, GL-account/vendor/category allocation application for current posting contexts, fixed-asset P&L allocation metadata, segmented profitability v1, BOT FX rate control surface, BOT API ingestion cron, AR/AP FX revaluation v1, owner-visible FX v1 scope caveat, explicit previous-month-end retry control, and month-end FX revaluation cron orchestration landed. Bank/WHT FX revaluation, realized settlement FX, and remaining posting-context allocation metadata coverage remain
**Depends on:** Phase 10.5 (GL primitives) shipped; Phase 12 (CIT) ideally shipped (so FX revaluation feeds period-end TB)
**Authority reference:** `vat-info.md` §5.4 (FX sales BOT rate); TFRS for NPAEs (FX revaluation guidance); Thai bookkeeping practice for AR/AP aging + close

## Problem

Phase 10.5 produces the GL spine. Phase 12 produces annual filings. But the day-to-day bookkeeper experience is missing:

1. **Aged AR / AP schedules** — what's owed to us / by us, by age bucket, by counterparty.
2. **Cash flow forecast** — short-term liquidity view from open invoices + recurring obligations.
3. **DSO / vendor concentration / customer concentration** — risk indicators.
4. **Gross margin by category / channel** — profitability views.
5. **Cash runway** — months of operations covered by current liquidity.
6. **Monthly close checklist with status** — orchestrates close per Thai accountant practice.
7. **FX revaluation** — month-end revalue foreign-currency receivables, payables, bank accounts at BOT reference rates; book FX gain/loss.
8. **Cost center / project / job-code dimension** — departmental P&L for management reporting.
9. **Audit-pack source data** — Phase 14 produces stable query exports (aging snapshots, concentration, close-checklist log) consumed by Phase 12b's audit-pack builder. No ZIP construction here.

Today's `dashboard.ts` queries cover totals + filing deadlines + reconciliation quality but miss the bookkeeper's daily KPIs.

## Requirements

### Aged schedules

- [ ] `src/lib/analytics/aged-receivables.ts`:
  - `buildArAging(orgId, asOfDate)` — pulls open AR sub-ledger (from `documents WHERE direction='income' AND status='confirmed' AND not paid` + `sales_transactions WHERE channel='b2b_credit' AND settlement_status='pending'`).
  - Buckets: current, 1-30 days, 31-60, 61-90, 91+ days past due.
  - Per customer + total.
  - Per establishment.
- [ ] `src/lib/analytics/aged-payables.ts`:
  - `buildApAging(orgId, asOfDate)` — pulls open AP from `documents WHERE direction='expense' AND status='confirmed' AND not paid`.
  - Same buckets.

### Concentration + KPI metrics

- [x] `src/lib/analytics/kpi-engine.ts`:
  - [x] `computeDso(orgId, asOfDate, lookbackDays=90)` — average days from invoice → payment.
  - [x] `computeVendorConcentration(orgId, periodStart, periodEnd)` / generic counterparty concentration — top-N vendors by spend with % of total.
  - [x] `computeCustomerConcentration(orgId, periodStart, periodEnd)` / generic counterparty concentration — top-N customers by revenue.
  - [x] `computeGrossMarginByCategory(orgId, periodStart, periodEnd)` — revenue minus COGS per category.
  - [x] `computeCashRunway(orgId, asOfDate)` / cash forecast v1 — current THB bank cash + 30-day AR inflows − 30-day AP outflows projection from open AR/AP, upcoming draft/approved payroll net pay, and scheduled non-cash depreciation signal.

### Monthly close checklist

- [x] New table `close_checklists`:
  - `id, org_id, establishment_id, period_year, period_month, status` (`open`, `in_progress`, `closed`), `closed_at`
  - `created_at, updated_at`
- [x] New table `close_checklist_items`:
  - `id, checklist_id, sequence, item_key, description, status` (`pending`, `done`, `skipped`, `blocked`)
  - `assigned_to_user_id`, `completed_by_user_id`, `completed_at`
  - `notes`
  - Items seeded per close — typical Thai close:
    1. Bank reconciliation matched (per bank account)
    2. AR aging reviewed
    3. AP aging reviewed
    4. POS sales reconciled to processor settlements
    5. Cash deposit slips matched
    6. PP 30 prepared
    7. PND.x prepared
    8. SSO prepared
    9. Month-end accruals + adjustments posted (manual JEs)
    10. FX revaluation run
    11. Depreciation posted
    12. Sub-ledger ties verified
    13. Trial balance reviewed
    14. Period locked
- [x] UI dashboard surfaces the open checklist for current period at `/close`.

### FX revaluation

- [x] New table `fx_rates_bot`:
  - `id, rate_date, currency, buying_rate, selling_rate, mid_rate, source_url, fetched_at`
  - Source: BOT (Bank of Thailand) reference rates fetched daily via Inngest cron.
- [x] V1 rate control surface:
  - `src/lib/db/queries/fx-rates-bot.ts` records/upserts official-source rates, lists recent rates, summarizes coverage, and selects latest rate on or before valuation date.
  - `/analytics/fx-rates` exposes admin/accountant-only manual source-backed rate entry, manual AR/AP revaluation run control, and coverage table with user-visible validation messages.
  - Manual writes insert immutable `audit_log` rows and preserve existing buying/selling rates when correcting only the mid-rate.
  - Automatic BOT API ingestion is wired through `src/lib/inngest/functions/fetch-bot-fx-rates.ts`, using `BOT_FX_API_AUTHORIZATION`, `BOT_FX_API_TOKEN`, or `BOT_FX_API_HEADERS_JSON`, optional `BOT_FX_API_URL_TEMPLATE`, `BOT_FX_CURRENCIES`, and required `BOT_FX_AUDIT_ORG_ID` for immutable audit rows. It skips without credentials/audit org and leaves manual entry as fallback.
  - Revaluation refuses rates older than five calendar days from the valuation date so stale BOT coverage cannot silently drive FX gains/losses.
  - `/analytics/fx-rates` shows an owner-visible AR/AP v1 caveat: manual BOT rates, coverage checks, previous-month retry, and fully unpaid foreign AR/AP revaluation are testable, while partially paid documents, bank-account FX, WHT-credit FX, and realized settlement FX remain deferred. Evidence: `pnpm test:e2e e2e/analytics/analytics.spec.ts`; `.next/types` + `.next/dev/types` cleanup; `pnpm tsc --noEmit`; `git diff --check`.
- [x] `src/lib/analytics/fx-revaluation.ts`:
  - `runFxRevaluation(orgId, asOfDate)`:
    1. Identify foreign-currency open, fully unpaid AR/AP documents with immutable original THB carrying values. Partially paid documents are deferred until realized settlement FX is implemented. Bank accounts and WHT credits remain pending until acquisition/carrying-value inputs are explicit.
    2. For each, compute current THB equivalent at stored BOT mid-rate vs latest valuation/original booked THB equivalent.
    3. Difference = unrealized FX gain/loss.
    4. Post a single JE per run when there are nonzero deltas:
       ```
       Dr/Cr  6870 FX loss / 4330 FX gain
           Cr/Dr Asset/liability THB carrying value adjustment
       ```
    5. Records the new THB carrying value in `fx_valuation_layers` (round-4 fix — original mutated `documents.totalAmountThb`, which corrupts VAT/PP 36 bases that depend on the original-rate THB amount). **Source documents are immutable.** Reporting (BS, P&L) reads the current carrying value via the latest `fx_valuation_layers` row joined per monetary item.
- [x] Inngest cron `process-month-end-fx-revaluation` runs on day 1 at 04:00 after depreciation, targets previous Bangkok month-end, processes each org with per-org failure isolation, and reuses the locked-period guard in `runFxRevaluation`.

### Cost center / project dimension

- [x] New table `cost_centers`:
  - `id, org_id, code, name_th, name_en, parent_id, is_active`
- [x] New table `projects`:
  - `id, org_id, code, name_th, name_en, customer_vendor_id, start_date, end_date, status, is_active`
- [x] Already in `journal_lines` schema (Phase 10.5): `cost_center_id`, `project_id`. Phase 14 wires UI + reports.
- [ ] Documents and sales optionally tagged with cost_center / project at confirm/save.
- [x] Reports: P&L by cost center, P&L by project, project profitability v1 (revenue, COGS, expenses, gross margin, operating profit from tagged GL lines).

### Audit pack — owned by Phase 12b

Round-4 review found Phase 14 still defined an audit-pack builder. Phase 12b is the canonical owner of the audit firm exchange package. Phase 14 contributes the analytics inputs (aging, concentration, KPI snapshots) — the canonical builder reads from Phase 14's outputs but lives in Phase 12b.

- [x] Provide stable query exports from Phase 14 that Phase 12b's audit-pack builder consumes:
  - `getAgingSnapshot(orgId, asOfDate, kind: 'ar' | 'ap')` — point-in-time aging snapshot for any quarter-end.
  - `getConcentrationAnalysis(orgId, taxYear)` — top-10 customers / vendors by revenue / spend over the organization's fiscal year ending in `taxYear`.
  - `getCloseChecklistLog(orgId, taxYear)` — closed monthly close sign-offs over the organization's fiscal year ending in `taxYear`.
- [x] No `audit-pack-builder.ts` in Phase 14. Delete the stub if any was prototyped earlier.

### UI

- [x] `src/app/(app)/dashboard/page.tsx` — extended with KPI widgets for projected 30-day cash, runway, open AR/AP aging totals, DSO, payroll outflow, and depreciation signal.
- [x] `src/app/(app)/analytics/ar-aging/page.tsx`
- [x] `src/app/(app)/analytics/ap-aging/page.tsx`
- [x] `src/app/(app)/analytics/cash-flow/page.tsx` — 30-day cash forecast plus customer/vendor concentration v1.
- [x] `src/app/(app)/analytics/concentration/page.tsx` — standalone date-range vendor + customer concentration.
- [x] `src/app/(app)/analytics/profitability/page.tsx` — GL segmented P&L by cost center and project.
- [x] `src/app/(app)/analytics/cash-flow/page.tsx` — runway view.
- [x] `src/app/(app)/close/page.tsx` — close checklist orchestrator.
- [x] `src/app/(app)/settings/cost-centers/page.tsx`
- [x] `src/app/(app)/settings/projects/page.tsx`

## Approach

### Sequencing (4 weeks)

**Week 1 — Aged schedules + KPIs**
1. AR/AP aging modules + UI.
2. KPI engine (DSO, concentration, margin, runway).
3. Dashboard widgets.

**Week 2 — FX revaluation + BOT rate ingestion**
1. BOT rate fetcher cron.
2. FX revaluation engine.
3. Month-end revaluation cron.
4. GL postings.

**Week 3 — Close checklist + cost center / project**
1. Close checklist schema + orchestrator UI.
2. Cost center + project tables + UI.
3. P&L by cost center + project reports.

**Week 4 — Polish + Phase 12b query handoff**
1. Stable query exports for aging snapshots, concentration, close checklist log.
2. Audit_log expansion if needed (to be consumed by Phase 12b builder).
3. Verification with Phase 12b consumer (or stub) that exports satisfy the audit-pack contract.

## Critical files

- `src/lib/analytics/aged-receivables.ts`
- `src/lib/analytics/aged-payables.ts`
- `src/lib/analytics/kpi-engine.ts`
- `src/lib/analytics/segmented-profitability.ts`
- `src/lib/analytics/fx-revaluation.ts`
- `src/lib/analytics/audit-pack-exports.ts` — stable query exports for Phase 12b consumer (NOT a builder; Phase 12b owns the ZIP)
- `src/lib/db/queries/cost-centers.ts`
- `src/lib/db/queries/projects.ts`
- `src/lib/db/queries/close-checklists.ts`
- `src/lib/db/queries/fx-rates-bot.ts`
- `src/lib/inngest/functions/fetch-bot-fx-rates.ts`
- `src/lib/inngest/functions/process-month-end-fx-revaluation.ts`
- `src/app/(app)/analytics/**`
- `src/app/(app)/close/**`
- `src/app/(app)/settings/cost-centers/**`
- `src/app/(app)/settings/projects/**`

## Verification

- [x] AR aging: open AR ฿500k aged 45 days → bucket 31-60; partially paid invoices age only the net unpaid balance.
- [x] DSO: lookback 90 days, sample data → matches manual calc.
- [x] Vendor concentration: top vendor 100% of test spend → share 1.0000.
- [x] Cash forecast: ฿2M cash + ฿500k 30-day AR − ฿300k 30-day AP → projected ฿2.2M.
- [x] Close checklist: all items done → period closes; any blocked/pending → cannot close until resolved.
- [x] BOT FX rate control surface: source-backed manual rate entry, coverage summary, latest-on-or-before lookup, DB tests, and Playwright smoke.
- [x] FX revaluation v1: USD AP invoice USD 5,000 at original THB 175k carrying → at month-end rate 36.00 (THB 180k) → ฿5k FX loss posted, valuation layer recorded, source document THB base unchanged.
- [ ] FX revaluation remaining: bank accounts / WHT credits with explicit carrying-value inputs and realized settlement FX.
- [x] Gross margin by category: revenue ฿1,000 and SKU sale-out cost ฿200 → gross margin ฿800 / 80%.
- [x] Cost center/project master data UI: create/list routes render under Settings with DB tests and Playwright smoke.
- [x] Allocation-rule v1: split-rule tables, same-org target guardrails, 100% total validation, settings UI, full export, DB tests, and Playwright smoke.
- [x] Segmented P&L v1: tagged revenue/COGS/expense GL lines summarize by cost center/project with tenant isolation and no zero-value segment rows.
- [x] GL-account allocation-rule P&L: salary/rent GL account ฿100k allocated 60% to "Operations" + 40% to "Admin" → split journal lines post correctly and feed segmented P&L.
- [x] Vendor/category allocation-rule P&L: vendor/category source metadata routes to the same split engine for supported posting contexts. Evidence: domestic inventory purchase postings pass source document vendor/category metadata to cost-bearing inventory lines, vendor rules outrank category/GL fallback, VAT recoverable and AP liability lines remain unsegmented, and `source_key` supports category string matching.
- [x] Audit-pack inputs (verified by Phase 14 DB contract tests; Phase 12b consumer integration still pending): net aging snapshots queryable for any quarter-end; concentration analysis returns top-10 vendors / customers for the fiscal year; close-checklist log returns closed monthly sign-offs with `closed_at`. (Phase 12b owns the ZIP; Phase 14 owns the data sources.)

## Implementation evidence — 2026-05-16 foundation slice

- Added `drizzle/0042_phase14_analytics_close_foundation.sql`.
- Added `drizzle/0045_phase14_close_closed_at.sql` to preserve the monthly close sign-off timestamp separately from row update churn.
- Added Drizzle tables `close_checklists`, `close_checklist_items`, `cost_centers`, `projects`, `fx_rates_bot`, and `fx_valuation_layers`.
- Added same-org guardrails for close checklist items, cost-center parents, project vendors, close establishments, and FX valuation journal entries.
- Added `src/lib/analytics/aging.ts` for AR/AP aging snapshots and summary buckets, net of payment events as of the snapshot date.
- Added `src/lib/analytics/kpi-engine.ts` for cash forecast v1 and customer/vendor concentration. Cash forecast now includes upcoming draft/approved payroll net-pay outflows and a separate non-cash scheduled depreciation signal.
- Added DSO and gross-margin-by-category read models to `src/lib/analytics/kpi-engine.ts`, with DB coverage in `src/lib/analytics/aging.db.test.ts`.
- Added `src/lib/db/queries/close-checklists.ts` with idempotent checklist seeding, item update, `closed_at` stamping, and close-if-complete guard.
- Added `src/lib/db/queries/cost-centers.ts`, `src/lib/db/queries/projects.ts`, `/settings/cost-centers`, and `/settings/projects` for v1 master-data management. Verified with `src/lib/db/queries/cost-centers-projects.db.test.ts` and `e2e/settings/cost-centers-projects.spec.ts`.
- Added `drizzle/0046_phase14_allocation_rules.sql`, `src/lib/db/queries/allocation-rules.ts`, `/settings/allocation-rules`, and full-export coverage for v1 split-rule master data. Verified with `src/lib/db/queries/allocation-rules.db.test.ts`, `src/lib/export/full-export.test.ts`, and `e2e/settings/cost-centers-projects.spec.ts`.
- Added GL-account allocation-rule application in `src/lib/db/queries/general-ledger.ts`: untagged matching journal lines split by active allocation targets, explicit tags are preserved, line descriptions cite the rule, and reversals remain segment-safe. Verified with `src/lib/db/queries/general-ledger.db.test.ts`.
- Added vendor/category allocation-rule application for posting contexts that carry source metadata: `allocation_rules.source_key` supports normalized category keys, allocation matching priority is vendor → category → GL account, domestic inventory purchase postings allocate only the cost-bearing 1160 line while leaving 1251 input VAT and 2110 AP unsegmented, and rule creation now rejects inert missing-source rules plus dead/cross-org targets before insert. Claude Companion flagged the VAT/AP segmentation bug and it was fixed. Verified with `src/lib/db/queries/allocation-rules.db.test.ts`, `src/lib/db/queries/general-ledger.db.test.ts`, `src/lib/db/queries/inventory.db.test.ts`, `src/lib/export/full-export.test.ts`, `pnpm exec drizzle-kit check`, `pnpm db:migrate`, `pnpm test:e2e e2e/settings/cost-centers-projects.spec.ts`, and `pnpm tsc --noEmit`.
- Added `src/lib/analytics/segmented-profitability.ts` and `/analytics/profitability` for date-range GL-line segmented P&L by cost center and project. DB coverage verifies revenue/COGS/expense math, unassigned project rows, zero-row suppression, deleted-segment rollup, reversal segment preservation, and tenant isolation. Route smoke added to `e2e/analytics/analytics.spec.ts`.
- Added fixed-asset posting allocation metadata: depreciation expense and disposal gain/loss lines carry `fixed_asset:<category>` for category allocation rules; bank, asset-cost, and accumulated-depreciation control lines remain unsegmented. Evidence: `pnpm vitest run --config vitest.config.db.ts src/lib/db/queries/fixed-assets.db.test.ts`; `pnpm vitest run --config vitest.config.db.ts src/lib/db/queries/general-ledger.db.test.ts`; `pnpm vitest run --config vitest.config.db.ts src/lib/db/queries/allocation-rules.db.test.ts`; `pnpm tsc --noEmit`.
- Added `src/lib/db/queries/fx-rates-bot.ts` and `/analytics/fx-rates` for manual BOT-rate control plus manual revaluation run control. Claude Companion found and fixed global-rate write hardening gaps: admin/accountant guard, audit log rows, optional-rate preservation on partial upserts, and visible validation errors. Verified with `src/lib/db/queries/fx-rates-bot.db.test.ts` and `e2e/analytics/analytics.spec.ts`.
- Added `src/lib/integrations/bot/fx-rates.ts` and `src/lib/inngest/functions/fetch-bot-fx-rates.ts` for configurable BOT API ingestion. Current official source: Bank of Thailand Exchange Rates API portal, retrieved 2026-05-16, `https://portal.api.bot.or.th/portal/catalogue-products/exchange-rates-1`; live-link checked 2026-05-17 with GET HTTP 200 (`HEAD` returns 405 while advertising GET/POST). The runtime uses explicit env-configured headers/template to avoid freezing unvalidated portal credentials or endpoint details into compliance behavior; cron upserts require `BOT_FX_AUDIT_ORG_ID` and write `audit_log` rows.
- Added `src/lib/analytics/fx-revaluation.ts` for fully unpaid AR/AP document FX revaluation v1 using stored BOT rates, immutable document THB bases, single JE per run, valuation layers, same-date additive reruns, idempotency, and missing-rate failures. Partially paid documents are deliberately excluded until realized settlement FX exists. Verified with `src/lib/analytics/fx-revaluation.db.test.ts`; the manual route action is exposed through `/analytics/fx-rates`.
- Added `src/lib/inngest/functions/process-month-end-fx-revaluation.ts` and registered it in the Inngest route. The cron targets previous Bangkok month-end, reuses AR/AP FX revaluation v1, isolates per-org failures, and has DB coverage for date targeting plus mixed success/failure org processing.
- Added `/analytics/ar-aging`, `/analytics/ap-aging`, `/analytics/cash-flow`, `/analytics/concentration`, and `/close` route surfaces, nav/i18n labels, full export coverage, DB tests, and Playwright route smoke.
- Added dashboard analytics widgets backed by existing Phase 14 read models: projected 30-day cash, runway, open AR/AP totals, DSO, payroll outflow, and depreciation signal. Verified with dashboard Playwright smoke.
- Added first dashboard analytics drilldowns: cash cards link to `/analytics/cash-flow`, open AR/AP and DSO link to `/analytics/ar-aging`, with route-link Playwright coverage. Evidence: `pnpm test:e2e e2e/dashboard/page.spec.ts`; `pnpm tsc --noEmit`.
- Expanded dashboard analytics drilldowns to secondary owner workflows: payroll outflows link to `/payroll`, depreciation links to `/fixed-assets/reports/roll-forward`, concentration links to `/analytics/concentration`, and profitability links to `/analytics/profitability`. The secondary links use real anchor semantics from the server component and have route-link Playwright coverage. Evidence: `pnpm test:e2e e2e/dashboard/page.spec.ts`; `pnpm tsc --noEmit`; `git diff --check`.
- Extended allocation metadata to payroll accrual expense lines: gross salary debits carry `payroll:gross_salary` and employer SSO expense debits carry `payroll:employer_sso`; PIT, SSO payable, and net-pay payable control lines remain unsegmented. Evidence: `pnpm vitest run --config vitest.config.db.ts src/lib/db/queries/payroll.db.test.ts`; serial rerun of `pnpm vitest run --config vitest.config.db.ts src/lib/db/queries/general-ledger.db.test.ts` and `pnpm vitest run --config vitest.config.db.ts src/lib/db/queries/allocation-rules.db.test.ts`; `pnpm tsc --noEmit`.
- Added `src/lib/analytics/audit-pack-exports.ts` with Phase 12b-facing `getAgingSnapshot`, `getConcentrationAnalysis`, and `getCloseChecklistLog` APIs. The handoff uses explicit DTO types, fiscal-year windows from org settings, and closed-only checklist logs. Verified with `src/lib/analytics/audit-pack-exports.db.test.ts`.
- Claude Companion follow-up found and fixed concentration share denominator and full-export `closed_at` coverage: `sharePct` now divides by period grand total rather than top-N subtotal, and `close_checklists.csv` includes `closed_at`.
- Claude Companion FX-cron/dashboard review found and fixed silent month-end FX failure visibility, Bangkok period mismatch on dashboard metrics, over-eager PP36 dashboard deadlines, and untranslated dashboard analytics labels. FX cron now creates an open `exception_queue` row for each failed org while preserving per-org isolation.
- FX behavior deliberately still excludes bank-account revaluation without prior carrying layers, WHT credit revaluation, partially paid documents, and realized settlement FX.
- Current verified gate: `pnpm tsc --noEmit`; `pnpm exec drizzle-kit check`; `pnpm db:migrate`; `pnpm vitest run --config vitest.config.db.ts src/lib/db/queries/general-ledger.db.test.ts src/lib/db/queries/close-checklists.db.test.ts src/lib/analytics/aging.db.test.ts src/lib/analytics/audit-pack-exports.db.test.ts src/lib/analytics/segmented-profitability.db.test.ts src/lib/analytics/fx-revaluation.db.test.ts src/lib/db/queries/fx-rates-bot.db.test.ts src/lib/db/queries/cost-centers-projects.db.test.ts src/lib/db/queries/allocation-rules.db.test.ts`; `pnpm vitest run src/lib/export/full-export.test.ts`; `pnpm test:e2e e2e/analytics/analytics.spec.ts e2e/settings/cost-centers-projects.spec.ts`. Latest focused allocation gates re-ran `pnpm vitest run --config vitest.config.db.ts src/lib/db/queries/allocation-rules.db.test.ts src/lib/db/queries/general-ledger.db.test.ts src/lib/db/queries/inventory.db.test.ts`, `pnpm vitest run src/lib/export/full-export.test.ts`, `pnpm exec drizzle-kit check`, `pnpm db:migrate`, `pnpm test:e2e e2e/settings/cost-centers-projects.spec.ts`, and `pnpm tsc --noEmit`.

## Risks

- **BOT rate ingestion fragility.** BOT website format changes. Mitigate: scrape with retry + fallback to manual rate entry.
- **Cost center over-allocation.** Tenants may want allocation rules (rent split 60/40 between two cost centers). Round-3 pulled allocation rules into v1 (see hardening below) — keep an eye on rule-engine complexity creep.
- **Project profitability complexity.** Cross-period revenue recognition (e.g. milestone billing) requires more than tagging. v1: simple aggregation; complex revenue recognition deferred.
- **Audit pack size.** Large tenants → ZIP could be hundreds of MB. Stream generation; chunked download.

## Open questions

- **Cost-center mandatory vs optional.** Default: optional. Tenants enable when they want segmented P&L. Some accountants want it required.
- **Allocation rules engine.** When 1 invoice covers multiple cost centers (shared utilities). v1 split at line-item entry; v2 adds rule engine.
- **Real-time KPIs vs daily refresh.** Real-time queries can be expensive. v1: daily materialized refresh for heavy KPIs; on-demand for aging schedules.

---

## Post-round-3-review hardening (added 2026-04-26)

### FX revaluation: NO auto-reversal

Round-3 review found the original v1 plan auto-reversed FX revaluation on day 1 of next month. **This is wrong.** Per TFRS / IAS 21 + Revenue Code §65 Bis(5):
- Monetary items (cash, AR/AP, loans) stay remeasured at month-end rate.
- FX gain/loss is recognized in P&L at the moment it arises (month-end revaluation OR settlement, whichever is earlier).
- No reversal on day 1 of next month — the new carrying value is the basis going forward.

Corrected design:

- [ ] **Remove** the "reverses on first day of next month" pattern. Period-end JE stands.
- [x] New table `fx_valuation_layers`:
  - `id, org_id, monetary_item_type` (`bank_account`, `ar_invoice`, `ap_invoice`, `loan`, `wht_credit_received`)
  - `monetary_item_id uuid`
  - `original_amount numeric(14,2)`
  - `original_currency text`
  - `valuation_date date NOT NULL`
  - `valuation_rate numeric(18,8)`
  - `valued_thb_amount numeric(14,2)`
  - `prior_valuation_id uuid` — FK back-pointer for revaluation chain
  - `journal_entry_id uuid` — FK to JE that booked the change
  - `realized boolean DEFAULT false` — true on settlement
- [x] At month-end/run date, for each supported foreign-currency AR/AP monetary item:
  - Compute valuation at BOT month-end rate.
  - If different from prior valuation → post FX gain/loss JE for the delta.
  - Record `fx_valuation_layers` row.
- [ ] Extend item coverage to bank accounts and WHT credits once carrying-value inputs are explicit.
- [ ] At settlement, realized FX gain/loss = settlement_thb_amount − latest_valuation_thb_amount; book to FX gain/loss; mark prior layers `realized=true`.

### FX revaluation ownership — confirmed Phase 14

Round-4 review found a contradiction: an earlier round-3 patch tried to relocate FX to Phase 12a Week 2, but the roadmap continued sequencing FX in Phase 14 and Phase 12a depends on FX existing for year-end TB. The roadmap is canonical: **FX engine + BOT rate ingestion ship in this phase (Phase 14), Week 2**, and Phase 14 ships before Phase 12a in the runway. Phase 12a inherits the engine.

If the runway ever flips Phase 12a ahead of Phase 14, this section needs to flip with it — but the dependency graph forbids that ordering today.

### Cost center allocation rules engine (NOT deferred to v2)

Round-3 review found cost-center allocation deferred but day-1 need (rent split between cost centers). Pulled into Phase 14 v1:

- [x] New table `allocation_rules`:
  - `id, org_id, rule_name, source_type` (`gl_account`, `vendor`, `category`)
  - `source_id uuid` — the gl_account or vendor when source_type matches
  - `is_active boolean DEFAULT true`
  - `effective_from, effective_to date`
- [x] New table `allocation_rule_targets`:
  - `id, allocation_rule_id, cost_center_id, project_id`
  - `percentage numeric(5,4)` — sums to 1.0 across rule's targets
  - `notes text`
- [x] When posting a JE that matches a `gl_account` allocation rule:
  - Generate split journal_lines per target percentage (instead of one line for the full amount).
  - Posted automatically with rule reference in line description.
- [x] Vendor/category allocation rules need posting-context wiring from document/vendor/category source metadata before they can apply automatically. First supported context landed for domestic inventory purchase postings; broader document/payment posting contexts still need metadata wiring as those posters mature.
- [x] UI: allocation rule editor v1 (up to two targets, validated to total 1.0000).
- [x] Common case: a shared expense GL account → 60% Operations + 40% Admin. Rule master data and automatic JE splitting cover it for `gl_account` rules; vendor/category rules now apply where source metadata is supplied, with vendor-specific rules taking priority over category and GL fallback.

### Audit pack canonical builder is in Phase 12b

Round-3 review found Phase 12 + Phase 14 each had an audit-pack builder with different specs. Single canonical implementation in Phase 12b. Phase 14's contribution:
- Aged AR/AP snapshots
- Concentration analysis
- Close checklist completion log
- KPI history

Phase 14 adds these as **inputs** to Phase 12b's `buildAuditPackage()`. Single builder, single ZIP layout.

### Inngest cron back-pressure

Round-3 review found that monthly depreciation cron (Phase 13) + monthly FX revaluation (Phase 14) + posting-outbox drain all dogpile against one Neon at month-end. Round-6 dropped recurring-journal cron, leaving fewer collisions but the staggering pattern still applies.

- [ ] All month-end crons run as Inngest **batch jobs** with concurrency cap (per env config, default 5 orgs in parallel). Current FX cron is sequential per-org v1 with failure isolation.
- [x] Stagger: depreciation runs day-1 02:00, FX revaluation runs day-1 04:00. Avoids dogpile.
- [x] Per-org idempotency: FX valuation layers are unique by `(org_id, monetary_item_type, monetary_item_id, valuation_date)` in behavior, so retries skip existing items and can pick up newly eligible same-date items.
- [x] Failure handling: failed orgs surface in `exception_queue`; manual previous-month-end retry is exposed on `/analytics/fx-rates`.
