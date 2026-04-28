# Plan: Phase 14 — Analytics, FX Revaluation, Cost Center / Project, Close Checklist

**Status:** Draft — captured 2026-04-26
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

- [ ] `src/lib/analytics/kpi-engine.ts`:
  - `computeDso(orgId, asOfDate, lookbackDays=90)` — average days from invoice → payment.
  - `computeVendorConcentration(orgId, periodStart, periodEnd)` — top-N vendors by spend with % of total.
  - `computeCustomerConcentration(orgId, periodStart, periodEnd)` — top-N customers by revenue.
  - `computeGrossMarginByCategory(orgId, periodStart, periodEnd)` — revenue minus COGS per category.
  - `computeCashRunway(orgId, asOfDate)` — current cash + 30-day inflows − 30-day outflows projection from open AR/AP plus scheduled depreciation/payroll obligations.

### Monthly close checklist

- [ ] New table `close_checklists`:
  - `id, org_id, establishment_id, period_year, period_month, status` (`open`, `in_progress`, `closed`)
  - `created_at, updated_at`
- [ ] New table `close_checklist_items`:
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
- [ ] UI dashboard surfaces the open checklist for current period.

### FX revaluation

- [ ] New table `fx_rates_bot`:
  - `id, rate_date, currency, buying_rate, selling_rate, mid_rate, source_url, fetched_at`
  - Source: BOT (Bank of Thailand) reference rates fetched daily via Inngest cron.
- [ ] `src/lib/analytics/fx-revaluation.ts`:
  - `runFxRevaluation(orgId, asOfDate)`:
    1. Identify foreign-currency monetary accounts: `bank_accounts WHERE currency != 'THB'`, `documents WHERE currency != 'THB' AND not paid` (AR/AP), `wht_credits_received WHERE original_currency != 'THB'`.
    2. For each, compute current THB equivalent at BOT rate vs booked THB equivalent.
    3. Difference = FX gain/loss.
    4. Post a single JE per period:
       ```
       Dr/Cr  6870 FX loss / 4330 FX gain
           Cr/Dr Asset/liability THB carrying value adjustment
       ```
    5. Records the new THB carrying value in `fx_valuation_layers` (round-4 fix — original mutated `documents.totalAmountThb`, which corrupts VAT/PP 36 bases that depend on the original-rate THB amount). **Source documents are immutable.** Reporting (BS, P&L) reads the current carrying value via the latest `fx_valuation_layers` row joined per monetary item.
- [ ] Inngest cron `process-month-end-fx-revaluation` runs at month-end after period-close lock + before financial statement gen.

### Cost center / project dimension

- [ ] New table `cost_centers`:
  - `id, org_id, code, name_th, name_en, parent_id, is_active`
- [ ] New table `projects`:
  - `id, org_id, code, name_th, name_en, customer_vendor_id, start_date, end_date, status, is_active`
- [ ] Already in `journal_lines` schema (Phase 10.5): `cost_center_id`, `project_id`. Phase 14 wires UI + reports.
- [ ] Documents and sales optionally tagged with cost_center / project at confirm/save.
- [ ] Reports: P&L by cost center, P&L by project, project profitability (revenue vs cost-of-project across multiple GL accounts).

### Audit pack — owned by Phase 12b

Round-4 review found Phase 14 still defined an audit-pack builder. Phase 12b is the canonical owner of the audit firm exchange package. Phase 14 contributes the analytics inputs (aging, concentration, KPI snapshots) — the canonical builder reads from Phase 14's outputs but lives in Phase 12b.

- [ ] Provide stable query exports from Phase 14 that Phase 12b's audit-pack builder consumes:
  - `getAgingSnapshot(orgId, asOfDate, kind: 'ar' | 'ap')` — point-in-time aging snapshot for any quarter-end.
  - `getConcentrationAnalysis(orgId, taxYear)` — top-10 customers / vendors by revenue / spend.
  - `getCloseChecklistLog(orgId, taxYear)` — every monthly close sign-off.
- [ ] No `audit-pack-builder.ts` in Phase 14. Delete the stub if any was prototyped earlier.

### UI

- [ ] `src/app/(app)/dashboard/page.tsx` — extend with KPIs, aged AR/AP top-line, runway, oldest unreconciled.
- [ ] `src/app/(app)/analytics/ar-aging/page.tsx`
- [ ] `src/app/(app)/analytics/ap-aging/page.tsx`
- [ ] `src/app/(app)/analytics/concentration/page.tsx` — vendor + customer.
- [ ] `src/app/(app)/analytics/profitability/page.tsx` — gross margin by category / channel / project.
- [ ] `src/app/(app)/analytics/cash-flow/page.tsx` — runway view.
- [ ] `src/app/(app)/close/page.tsx` — close checklist orchestrator.
- [ ] `src/app/(app)/settings/cost-centers/page.tsx`
- [ ] `src/app/(app)/settings/projects/page.tsx`

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

- [ ] AR aging: open AR ฿500k aged 45 days → bucket 31-60.
- [ ] DSO: lookback 90 days, sample data → matches manual calc.
- [ ] Vendor concentration: top vendor 35% of spend → flagged.
- [ ] Cash runway: ฿2M cash, ฿500k/month net burn → 4 months.
- [ ] Close checklist: all items done → period closes; any blocked → cannot close until resolved.
- [ ] FX revaluation: USD bank account ฿5,000 USD at acquisition rate 35.00 (THB 175k carrying) → at month-end rate 36.00 (THB 180k) → ฿5k FX gain posted.
- [ ] Cost center P&L: rent ฿100k allocated 60% to "Operations" + 40% to "Admin" → splits correctly.
- [ ] Audit-pack inputs (verified by Phase 12b consumer): aging snapshots queryable for any quarter-end; concentration analysis returns top-10 vendors / customers; close-checklist log returns every monthly close sign-off. (Phase 12b owns the ZIP; Phase 14 owns the data sources.)

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
- [ ] New table `fx_valuation_layers`:
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
- [ ] At month-end, for each foreign-currency monetary item:
  - Compute valuation at BOT month-end rate.
  - If different from prior valuation → post FX gain/loss JE for the delta.
  - Record `fx_valuation_layers` row.
- [ ] At settlement, realized FX gain/loss = settlement_thb_amount − latest_valuation_thb_amount; book to FX gain/loss; mark prior layers `realized=true`.

### FX revaluation ownership — confirmed Phase 14

Round-4 review found a contradiction: an earlier round-3 patch tried to relocate FX to Phase 12a Week 2, but the roadmap continued sequencing FX in Phase 14 and Phase 12a depends on FX existing for year-end TB. The roadmap is canonical: **FX engine + BOT rate ingestion ship in this phase (Phase 14), Week 2**, and Phase 14 ships before Phase 12a in the runway. Phase 12a inherits the engine.

If the runway ever flips Phase 12a ahead of Phase 14, this section needs to flip with it — but the dependency graph forbids that ordering today.

### Cost center allocation rules engine (NOT deferred to v2)

Round-3 review found cost-center allocation deferred but day-1 need (rent split between cost centers). Pulled into Phase 14 v1:

- [ ] New table `allocation_rules`:
  - `id, org_id, rule_name, source_type` (`gl_account`, `vendor`, `category`)
  - `source_id uuid` — the gl_account or vendor when source_type matches
  - `is_active boolean DEFAULT true`
  - `effective_from, effective_to date`
- [ ] New table `allocation_rule_targets`:
  - `id, allocation_rule_id, cost_center_id, project_id`
  - `percentage numeric(5,4)` — sums to 1.0 across rule's targets
  - `notes text`
- [ ] When posting a JE that matches an allocation rule:
  - Generate split journal_lines per target percentage (instead of one line for the full amount).
  - Posted automatically with rule reference in line description.
- [ ] UI: allocation rule editor (matrix: source → cost centers with percentages).
- [ ] Common case: rent paid to landlord via vendor X → 60% Operations + 40% Admin. Rule covers it.

### Audit pack canonical builder is in Phase 12b

Round-3 review found Phase 12 + Phase 14 each had an audit-pack builder with different specs. Single canonical implementation in Phase 12b. Phase 14's contribution:
- Aged AR/AP snapshots
- Concentration analysis
- Close checklist completion log
- KPI history

Phase 14 adds these as **inputs** to Phase 12b's `buildAuditPackage()`. Single builder, single ZIP layout.

### Inngest cron back-pressure

Round-3 review found that monthly depreciation cron (Phase 13) + monthly FX revaluation (Phase 14) + posting-outbox drain all dogpile against one Neon at month-end. Round-6 dropped recurring-journal cron, leaving fewer collisions but the staggering pattern still applies.

- [ ] All month-end crons run as Inngest **batch jobs** with concurrency cap (per env config, default 5 orgs in parallel).
- [ ] Stagger: depreciation runs day-1, FX revaluation day-1 hour-4. Avoids dogpile.
- [ ] Per-org idempotency: each cron has unique key `(org_id, period_year, period_month, cron_type)`; safe to retry.
- [ ] Failure handling: failed orgs surface in `exception_queue`; manual retry from dashboard.
