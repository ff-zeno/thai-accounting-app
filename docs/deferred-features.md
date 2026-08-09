# Deferred Features Register

Features removed from Long Tua on 2026-08-03 to strip the app back to the weekly money loop.
Nothing here was broken. It was removed because it was built before anyone needed it.

**Restore point: `819c63f` — "refactor(ui): reset app shell onto centralized kit and Ink Neutral system"**

Every feature below exists in full at that commit, already restyled onto the current design system.
To bring one back:

```bash
git checkout 819c63f -- <paths listed for that feature>
```

Then restore its tables (see the migration note at the bottom) and re-add its nav entry to `src/lib/nav/structure.ts`.

> Use `819c63f`, not the commit before it. `819c63f` is the last commit where these features exist *and* carry the current Ink Neutral styling, so a restored page drops straight back in without needing a re-skin.

---

## Why these went

The app had 82 routes, 99 database tables and 17 items in one menu, while CI protected exactly one end-to-end journey: expense → PP30.
The owner's review was blunt: "so many elements that I don't know anything about... AI went wild planning features without a human checking things, making something highly technical but not human usable."

The keep-set is the loop an owner actually runs weekly.
Everything below serves a bookkeeping practice, not an owner.

---

## Accounting / General Ledger

**What it did.** Full double-entry bookkeeping: chart of accounts, journal entries and lines, a posting outbox that turned business events into journal entries, a posting-exception queue for events that failed to post, and four statutory reports (balance sheet, profit & loss, trial balance, general ledger detail) with CSV export.

**Why deferred.** Double-entry is what an accountant needs at year-end, not what an owner needs weekly. The owner's accountant can produce these from exported source data.

**Paths.** `src/app/(app)/accounting/`, `src/app/api/accounting/*.csv/`, `src/lib/gl/`, `src/lib/db/queries/{general-ledger,posting-outbox}.ts`, `e2e/accounting/`

**Tables.** `gl_accounts`, `gl_opening_balances`, `journal_entries`, `journal_lines`, `posting_outbox`, `posting_exceptions`

**Known consequence.** `vat-operations-ledger.ts` used to insert a `postingOutbox` row so VAT operations became journal entries. That insert was removed. **VAT operations no longer generate double-entry records.** This is the single real capability lost in the whole reduction. If accounting is ever restored, that insert must be restored with it.

---

## Analytics

**What it did.** Six dashboards: AP aging, AR aging, cash flow, customer/vendor concentration, FX rates, and segmented profitability. Plus an audit-pack exporter.

**Why deferred.** Not reachable from the nav even before this cut. Built, never wired up, never used.

**Paths.** `src/app/(app)/analytics/`, `src/lib/analytics/`, `src/lib/db/queries/fx-rates-bot.ts`, `e2e/analytics/`

**Tables.** `fx_rates_bot`, `fx_valuation_layers`

**Inngest.** `processMonthEndFxRevaluation`, `fetchBotFxRates`

---

## Inventory

**What it did.** SKU register, stock counts and count items, movement ledger, manual adjustments, statutory overhead components, aged-stock and roll-forward CSV reports, plus the Thai statutory inventory-movement report.

**Why deferred.** Only relevant to a business holding physical stock. Reinstate if and when that is true.

**Paths.** `src/app/(app)/inventory/`, `src/app/api/inventory/*.csv/`, `src/app/api/tax/inventory-movement-report.csv/`, `src/lib/inventory/`, `src/lib/tax/inventory-movement-report*.ts`, `src/lib/db/queries/inventory.ts`, `e2e/inventory/`

**Tables.** `skus`, `inventory_counts`, `inventory_count_items`, `inventory_movements`, `inventory_statutory_overhead_components`

---

## Imports

**What it did.** Import shipment tracking: import documents, goods lines, charge lines, and import payments, for landed-cost allocation on goods brought into Thailand.

**Why deferred.** Same as inventory. Only applies to a business importing goods.

**Paths.** `src/app/(app)/imports/`, `src/lib/db/queries/imports.ts`, `e2e/imports/`

**Tables.** `imports`, `import_documents`, `import_goods_lines`, `import_charge_lines`, `import_payments`

---

## Payroll

**What it did.** Employee register with allowances, pay runs and pay slips, personal income tax brackets and standard deductions, and three statutory filings: PND 1, PND 1 Kor, and Social Security (SSO).

**Why deferred.** Gated behind `hasEmployees` and unused. Payroll is usually the last thing an owner brings in-house.

**Paths.** `src/app/(app)/payroll/`, `src/lib/payroll/`, `src/lib/db/queries/payroll.ts`, `e2e/payroll/`

**Tables.** `employees`, `employee_allowances`, `pay_runs`, `pay_slips`, `pnd_filings`, `sso_config`, `sso_filings`, `pit_brackets`, `pit_standard_deductions`

**Kept.** The `organizations.has_employees` flag stays, and `src/lib/tax/obligations.ts` still uses it to tell the owner that PND 1 and SSO are due each month. Awareness without machinery: the Tax section names the obligation and the deadline, and the owner files it wherever they file it today.

---

## Fixed Assets

**What it did.** Asset register with acquisition, disposal, bulk import, monthly depreciation schedules and periods, Thai minimum-life-by-category rules, and a roll-forward report with CSV export.

**Why deferred.** Depreciation is an annual accountant task, not a weekly owner task.

**Paths.** `src/app/(app)/fixed-assets/`, `src/app/api/fixed-assets/roll-forward.csv/`, `src/lib/fixed-assets/`, `src/lib/db/queries/fixed-assets.ts`, `e2e/fixed-assets/`

**Tables.** `fixed_assets`, `fixed_asset_depreciation_periods`, `depreciation_schedule`, `tax_min_life_by_category`

**Inngest.** `processMonthlyDepreciation`

---

## Year-End: Corporate Income Tax

**What it did.** CIT workbench: corporate income tax brackets, book-to-tax adjustments, loss carry-forward layers, and transfer-pricing disclosures.

**Why deferred.** Annual, and almost always done with an accountant.

**Paths.** `src/app/(app)/year-end/`, `src/lib/cit/`, `src/lib/db/queries/cit-filings.ts`, `e2e/year-end/`

**Tables.** `cit_filings`, `cit_brackets`, `book_tax_adjustments`, `loss_carry_forward_layers`, `transfer_pricing_disclosures`

---

## Close Checklist

**What it did.** Month-end close checklists with per-item sign-off.

**Why deferred.** A process tool for a finance team. Note that `period_locks` was **kept** — the VAT ledger uses it.

**Paths.** `src/app/(app)/close/`, `src/lib/db/queries/close-checklists.ts`

**Tables.** `close_checklists`, `close_checklist_items`

---

## Exports

**What it did.** Export to FlowAccount, export to Peak, and a full data export.

**Why deferred.** Bundled into the accepted defer list.

**Recommended as the first restore.** Full data export is the owner's escape hatch from vendor lock-in, and it is cheap to bring back on its own: `git checkout 819c63f -- src/lib/export/full-export.ts src/lib/export/csv-utils.ts` plus a small Settings action. It has no dedicated tables.

**Paths.** `src/app/(app)/reports/`, `src/lib/export/`, `src/components/reports/`, `e2e/reports/`

**Tables.** none

---

## Sales / POS

> **Partly restored on 2026-08-06.** `processor_settlements` came back with the money-flow IA work and is live again — see "Merchant settlements: what came back, what did not" below. Everything else in this entry is still deferred.

**What it did.** Point-of-sale transactions, voucher sales, cash deposits, and payment-processor settlements.

**Why deferred.** Already gated off behind `hasPosSales` and not part of the keep-set.

**Paths.** `src/app/(app)/sales/`, `src/lib/db/queries/pos-sales-ledger.ts`, `e2e/sales/`

**Tables.** `sales_transactions`, `voucher_sales`, `cash_deposits`

---

## Merchant settlements: what came back, what did not

A merchant payout has two halves, and the 2026-08-06 money-flow work built only the first.

| Leg | What it links | Status |
|---|---|---|
| **A. Settlement → bank deposit** | The stated net payout against the credit line on the statement | **Built.** `/income/settlements` (register) and `/reconciliation/payouts` (match queue) |
| **B. Sales → settlement** | Which individual POS sales composed the batch | **Deferred** — it needs the POS ingest that is not landing yet |

Three follow-ups are deliberately not built, in the order they become worth building:

**1. POS Sales as the third Income area.**
The owner named it as one, and it is the next Income tab when sales data starts arriving.
It ships as a tab with a route, not an empty shell: a dead surface is exactly what the 2026-08-03 reduction removed.
Restoring it means `sales_transactions` plus an ingest path, then a tab in `src/app/(app)/income/layout.tsx`.

**2. Leg B — which sales made up this payout.**
Blocked on the same ingest.
The seam is clean rather than stubbed: `processor_settlements` already carries `payload` (the processor's raw row) and `establishment_id`, so a join table between sales and settlements is additive.
Nothing in leg A needs changing to build it.

**3. Zero-setup parsers for named processors.**
Ingest today is a generic CSV column mapper (`src/lib/parsers/settlement-csv.ts`) whose mapping is remembered per processor, so the second import of a given format is a straight upload.
A named parser per provider — the way `kbank-parser.ts` sits beside the generic bank CSV parser — is worth writing once real files from a known processor exist to build against.
Guessing at formats before then produces parsers nobody can test.

**Not built and not planned: GL posting for settlements.**
The original design posted settlements to accounts 1111/1142/6411/1251.
All four ledger tables went in the reduction, so there is no ledger to post to.
A settlement is a source record and reconciliation evidence, nothing more.

**Not built and never to be built as described: net payout as a VAT figure.**
Output VAT is owed on the gross sale price, not on what the bank received after fees.
The wire from net payout to any output-VAT path does not exist, and that is the enforcement mechanism.

---

## Accounting Copilot

**What it did.** A chat assistant with tool access over accounting data, with session and message history and a tool-event log.

**Why deferred.** A second way to ask questions the app should answer directly.

**Paths.** `src/app/(app)/copilot/`, `src/lib/copilot/`, `src/lib/db/queries/copilot-tools.ts`, `e2e/copilot/`

**Tables.** `copilot_sessions`, `copilot_messages`, `copilot_tool_events`

**Also removed: the "Copilot Controls" panel in `/settings/ai`.** Seven fields — provider, model, an API-key secret reference plus its last-4 display, a separate monthly budget, and two feature switches (live model, write tools) — asking the owner to hand-configure a second LLM provider for a feature that had no visible entry point. Gone from the form (`ai-settings-form.tsx`), its server action and validation (`settings/ai/actions.ts`), the query input type (`queries/ai-settings.ts`), and the `org_ai_settings.copilot_*` columns. The model and budget settings that drive *extraction* are untouched.

---

## Cost Centres, Projects, Allocation Rules

**What it did.** Dimensional tagging of transactions by cost centre and project, with rules to split a single expense across several of them by percentage.

**Why deferred.** Management accounting for an organisation with departments.

**Paths.** `src/app/(app)/settings/{cost-centers,projects,allocation-rules}/`, `src/lib/db/queries/{cost-centers,projects,allocation-rules}.ts`, `e2e/settings/cost-centers-projects.spec.ts`

**Tables.** `cost_centers`, `projects`, `allocation_rules`, `allocation_rule_targets`

---

## AI Extraction Self-Learning Layer

**What it did.** The most elaborate thing in the codebase, and entirely invisible in the UI.

Extraction ran a four-tier ladder:

```
Tier 0  unknown vendor          → plain AI extraction
Tier 1  known vendor            → inject that vendor's past corrections into the prompt
Tier 2  tax ID matches globally → inject exemplars from a cross-org pool
Tier 3  compiled pattern exists → run generated JavaScript in a sandbox, skipping the AI
```

Supporting it: exemplar storage and decay, cross-org consensus voting on field values, per-org reputation scoring, a TypeScript compiler with an AST validator and a sandboxed runner for the generated parsers, and a shadow-validation and canary system to test generated patterns against live traffic before promoting them.

Around it sat three more surfaces, all removed with it:

- **`/admin/extraction-health`** — a dashboard reporting on the ladder's own performance. The only page in the app that existed to observe machinery rather than money.
- **The "Correction note" field** on the document review form, whose only consumer was the correction-interpreter that turned owner prose into learning candidates. Reviewing a document no longer asks the owner to explain themselves to a model.
- **`benchmarks/dogfood/`** — a ten-file A/B harness that scored tier-0 against tier-1 extractions. Every file in it imported a learning module, so it went with them.

**Why deferred.** Nobody asked for it, nobody could see it, and no evidence was gathered that it improved an extraction. It is the clearest instance of the pattern the owner objected to.

**What replaced it.** Nothing. Extraction collapsed to Tier 0, which was already the path every unknown-vendor document took. Vendor *aliases* learned from reconciliation matches are **kept** — that learning is simple, visible, and demonstrably useful.

**Also kept: the party-identity anchor.** When the vendor probe matches a known vendor, `process-document.ts` still loads that vendor record and the org's own record and passes both into the prompt, so the model can tell seller fields from buyer fields on a bilingual Thai tax invoice. That is a deterministic lookup of two rows the app already has — not a learned signal — and it is the reason `ExtractionContext` still exists. Its prompt-injection defences (`hasInstructionLikeText`, the 13-digit tax-ID and 5-digit branch validation, the length caps) are unchanged.

**Paths.** `src/lib/ai/compiled-patterns/`, `src/lib/ai/{consensus-thresholds,correction-interpreter,field-criticality,field-normalization}.ts`, `src/lib/db/queries/{extraction-exemplars,global-exemplar-pool,compiled-patterns,exemplar-consensus,org-reputation,review-exemplars,vendor-tier,extraction-correction-sessions,extraction-learning-candidates,extraction-review-outcome,extraction-health}.ts`, `src/lib/inngest/functions/{consensus-recompute,exemplar-decay,compile-vendor-pattern,shadow-validate-pattern,shadow-canary,backfill-vendor-tax-id,review-saved-handler,review-confirmed-handler}.ts`, `src/app/(app)/admin/extraction-health/`, `benchmarks/dogfood/`

**Tables.** `extraction_exemplars`, `global_exemplar_pool`, `exemplar_consensus`, `extraction_compiled_patterns`, `extraction_correction_sessions`, `extraction_learning_candidates`, `extraction_review_outcome`, `org_reputation`, `vendor_tier`

**Columns.** `extraction_log.tier_used`, `extraction_log.exemplar_ids`. The `extraction_log` table itself stays — it is the per-document record of which model ran, what it cost and how long it took, and the duplicate-extraction exception it raises still feeds the Home "Needs your attention" list.

**If restoring:** the tier-resolution block in `process-document.ts` and the exemplar prompt injection in `extract-document.ts` were removed, not just their imports. Restore both from `819c63f`.

---

## Tables that were never wired to anything

Two tables existed in the schema with no query, no page and no job reading or writing them. They are listed here so their intent is not lost, but nothing was removed alongside them because nothing was ever built.

- **`thai_business_calendar`** — Thai public holidays, presumably meant to shift a filing deadline that lands on one. `src/lib/tax/filing-deadlines.ts` does calendar-day math today and does not consult it. If deadline-vs-holiday handling is ever wanted, this is the shape it was going to take.
- **`recurring_payment_patterns`** — detected repeat payments (rent, subscriptions), presumably to pre-empt reconciliation or forecast cash. The reconciliation cascade never read it.

---

## Restoring tables

The drop migration is `drizzle/0003_premium_doctor_doom.sql`. It is **generated but not applied** — 58 `DROP TABLE`, 14 `DROP TYPE`, and 10 `DROP COLUMN` statements, and nothing else. Applying it is a separate, deliberate act.

> It replaced an earlier `0003_large_living_lightning.sql`, which dropped 59 tables including `processor_settlements`. Both were unapplied, so the clean fix when settlements were restored on 2026-08-06 was to delete that file and regenerate rather than write a compensating migration that re-created what `0003` had just dropped.

- **If it has not been applied**, the tables and all their data are still in the database. Restoring a feature only needs the code.
- **If it has been applied**, the tables are gone and their data with them. Restoring needs the table definitions back in `src/lib/db/schema.ts` (from `819c63f`), a fresh `pnpm db:generate`, and `pnpm db:migrate`. The historical data is not recoverable.

Check with `git log drizzle/` and the `__drizzle_migrations` table before assuming either way.

Two notes for whoever applies it:

- `drizzle/0001_seed_reference_data.sql` still seeds `cit_brackets`, `tax_min_life_by_category` and `thai_business_calendar`, which `0003` then drops. On a fresh database that is wasted work, not a failure. `0001` is an applied baseline and was left alone rather than rewritten under a database that already ran it.
- `drizzle/0002_bitter_sasquatch.sql` (the `user_nav_pins` drop) is also generated and unapplied. `0002` and `0003` apply in order.
