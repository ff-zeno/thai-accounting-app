# Scope Reduction — Strip Long Tua Back to the Weekly Money Loop

Status: **Executed in the working tree 2026-08-03 — uncommitted, migration generated but NOT applied**
Owner decision date: 2026-08-03
Supersedes nothing; runs after the owner-mode UX reset (`owner-mode-ux-reset.md`), whose work is complete but uncommitted.

## Execution record (2026-08-03)

All eleven steps below are done in the working tree.
Nothing has been committed or pushed; no migration has been applied to any database.

| Measure | Before | After |
|---|---|---|
| Page routes | 82 | 39 |
| Database tables | 99 | 40 |
| Inngest functions | 20 | 7 |
| Items in "More" | 17 across 6 groups | menu removed; 5 top-level entries + Settings |
| Query modules | 60 | 28 |

Gate at every checkpoint and at the end: `pnpm build` compiles, `pnpm test` 535/535 pass, `pnpm lint` reports 0 errors (3 pre-existing `react-hooks/incompatible-library` warnings on TanStack tables, untouched by this work).

**Not verified:** the golden-path e2e has not been run at any checkpoint in this reduction.
It requires a live Neon database plus two long-running local servers (`E2E_FAKE_AI=1 pnpm dev` and `pnpm inngest:dev`), which is owner-gated.
Treat the pipeline as unverified end-to-end until that run happens.

**Owner-gated and deliberately not done:** applying `drizzle/0003_large_living_lightning.sql` (or the earlier `0002_bitter_sasquatch.sql`, which drops `user_nav_pins` and applies first), running `pnpm db:migrate`, committing, and pushing.

## Why

The owner reviewed the app live and reported that it is unusable through excess, not through defects.
Their words: "WAY TOO MUCH content and features, making it hard to follow", "the more section has dozens of things that are just not necessary to me", "so many elements that I don't know anything about", "suggesting AI went wild planning features without a human checking things, making something highly technical but not human usable".

The measurements support this.

| Metric | Now |
|---|---|
| Page routes | 82 |
| API routes | 14 |
| Database tables | 99 |
| Items in the "More" menu | 17, across 6 sub-groups |
| e2e spec files | 37 |
| e2e specs run in CI | **1** (golden path: expense → PP30) |

Only one end-to-end journey is protected by CI.
Roughly 80% of the application has never been treated as load-bearing, including by the plan that built it.

## Decisions taken (owner, 2026-08-03, via AskUserQuestion)

1. **Core = the weekly money loop.**
   Home, Documents (capture → AI extract → confirm), Bank (statements + reconciliation), Tax (VAT + withholding + calendar), Vendors, Settings.
2. **Depth = full removal, including database tables.**
   Routes, libraries, queries and tests are deleted; unused tables are dropped via their own migration.
   The migration is generated but **not applied** — running it against Neon requires separate explicit permission at the time.
3. **The hidden AI learning subsystem is cut back to plain extraction.**
   Upload → AI reads it → owner confirms. The self-teaching layer goes.

## What stays

The keep-set is everything the one CI-protected journey touches, plus the surfaces required to operate it.

```
Home        /dashboard, /capture
Documents   /documents/expenses, /income, /upload, /[docId]/review
Bank        /bank-accounts, /[accountId], /upload
            /reconciliation, /review, /ai-review, /insights
Tax         /tax, /tax/calendar, /tax/reports
            /tax/vat + 6 sub-routes
            /tax/withholding + 4 sub-routes
            /tax/wht-certificates, /tax/wht-credits-received
Vendors     /vendors, /vendors/[vendorId]
Settings    /settings, /settings/ai, /settings/reconciliation-rules
            /admin/extraction-health
```

Approximately 39 routes remain, down from 82.

## What goes

### Route directories (self-contained — verified, see Safety below)

| Area | Files | Lines |
|---|---|---|
| `(app)/accounting` — GL, journal, posting exceptions, balance sheet, P&L, trial balance | 10 | 1,847 |
| `(app)/analytics` — AP/AR aging, cash flow, concentration, FX, profitability | 7 | 943 |
| `(app)/inventory` — SKUs, counts, adjustments | 5 | 1,524 |
| `(app)/imports` — shipment/import tracking | 4 | 1,399 |
| `(app)/payroll` — employees, allowances, PND1, PND1-Kor, SSO, pay runs | 8 | 2,375 |
| `(app)/fixed-assets` — register, disposal, roll-forward, import | 8 | 1,684 |
| `(app)/year-end` — CIT workbench | 2 | 1,251 |
| `(app)/close` — close checklist | 2 | 417 |
| `(app)/reports` — FlowAccount / Peak / full data export | 4 | 713 |
| `(app)/sales` — POS (already gated off by `hasPosSales`) | 2 | 610 |
| `(app)/copilot` — accounting chatbot | 2 | 288 |
| `(app)/settings/{cost-centers,projects,allocation-rules}` | 6 | 587 |

### API routes

`api/accounting/{balance-sheet,general-ledger,profit-loss,trial-balance}.csv`,
`api/inventory/{aged,roll-forward}.csv`,
`api/fixed-assets/roll-forward.csv`,
`api/tax/inventory-movement-report.csv`.

Kept: `api/files/[fileId]`, `api/inngest`, `api/reconciliation-summary`, `api/tax/{input,output}-tax-report.csv`, `api/webhooks/clerk`.

### Libraries

`lib/gl` (940), `lib/analytics` (2,823), `lib/export` (2,249), `lib/payroll` (375), `lib/inventory` (191), `lib/cit` (161), `lib/fixed-assets` (79), `lib/copilot` (74), `components/reports` (153).

Also `lib/tax/foreign-wht.ts` — zero importers, already dead.

### Database queries

`general-ledger`, `posting-outbox`, `inventory`, `imports`, `payroll`, `fixed-assets`, `cit-filings`, `close-checklists`, `copilot-tools`, `cost-centers`, `projects`, `allocation-rules`, `fx-rates-bot`, `pos-sales-ledger`, and their `.db.test.ts` files.

### Inngest functions

`processMonthlyDepreciation`, `processMonthEndFxRevaluation`, `processPostingOutbox`, `fetchBotFxRates`.
Deregistered from `api/inngest/route.ts`.

### e2e suites

`accounting`, `analytics`, `inventory`, `imports`, `payroll`, `fixed-assets`, `year-end`, `copilot`, `reports`, `sales`.

### Tables dropped (~49 of 99)

```
GL          gl_accounts, gl_opening_balances, journal_entries, journal_lines,
            posting_outbox, posting_exceptions
Inventory   skus, inventory_counts, inventory_count_items, inventory_movements,
            inventory_statutory_overhead_components
Imports     imports, import_documents, import_goods_lines, import_charge_lines,
            import_payments
Payroll     employees, employee_allowances, pay_runs, pay_slips, sso_config,
            sso_filings, pit_brackets, pit_standard_deductions
Assets      fixed_assets, fixed_asset_depreciation_periods, depreciation_schedule,
            tax_min_life_by_category
Year-end    cit_filings, cit_brackets, book_tax_adjustments,
            loss_carry_forward_layers, transfer_pricing_disclosures
Close       close_checklists, close_checklist_items
Copilot     copilot_sessions, copilot_messages, copilot_tool_events
FX          fx_rates_bot, fx_valuation_layers
Master data cost_centers, projects, allocation_rules, allocation_rule_targets
POS         sales_transactions, voucher_sales, cash_deposits, processor_settlements
Dead        recurring_payment_patterns  (zero importers today)
```

**Total removed: 48,418 lines.**

## Safety analysis (already performed)

A full import-graph scan (`scratchpad/dep-scan.mjs`) resolved every `@/…` and relative import across `src/`.

- **Zero** keep-set files import from any cut route directory. The route dirs are genuinely self-contained.
- Cross-area `lib/` coupling is negligible: `lib/accounting` 0 external importers, `lib/imports` 0, `lib/closing` 0, `lib/inventory` 3, `lib/payroll` 2, `lib/fixed-assets` 1, `lib/cit` 1.

Four tables that look like cut candidates are **load-bearing for VAT and must stay**:

| Table | Kept because |
|---|---|
| `exception_queue` | `tax-workflow-exceptions.ts` (core Tax) |
| `period_locks` | `vat-operations-ledger.ts` (core Tax) |
| `establishments` | PP30 branch codes; `tax/reports`, `output-tax-report` |
| `tax_treatment_decisions` | `vat-operations-ledger.ts`, `foreign-vendor-tax.ts` |

One behavioural change is unavoidable:
`vat-operations-ledger.ts:1031` inserts into `postingOutbox`, a fire-and-forget event that generates journal entries.
With the ledger gone, that insert is removed.
**Consequence: VAT operations will no longer produce double-entry journal entries.**
That is consistent with deleting the entire accounting surface, but it is a real loss of function and is recorded here so it is not discovered later.

## The AI learning subsystem (decision 3)

Unlike the route directories, this one **is** coupled to the core.
`process-document.ts` (the pipeline the golden-path test protects) runs a four-tier extraction ladder:

```
Tier 0  no vendor known           → plain AI extraction
Tier 1  known vendor              → inject that vendor's corrected exemplars into the prompt
Tier 2  tax ID matches globally   → inject exemplars from the global pool
Tier 3  compiled pattern exists   → run generated JS in a sandbox instead of calling the AI
```

Removing the layer collapses every document to Tier 0.

**This is safe because Tier 0 is not new.**
`extract-document.ts:116` already short-circuits when `ctx.tier < 1`, and every document from an unknown vendor takes that path today.
The removal deletes three branches from a ladder whose bottom rung is already the common case.

Cut: `lib/ai/compiled-patterns/` (AST validator, TS compiler, sandbox runner), exemplar consensus and decay, shadow validation and canary, org reputation scoring.
Queries: `extraction-exemplars`, `global-exemplar-pool`, `compiled-patterns`, `exemplar-consensus`, `org-reputation`, `review-exemplars`, `extraction-learning-candidates`.
Inngest: `consensusRecompute`, `exemplarDecay`, `compileVendorPattern`, `shadowValidatePattern`, `shadowCanary`, `backfillVendorTaxId`.
Tables: `extraction_exemplars`, `global_exemplar_pool`, `exemplar_consensus`, `extraction_compiled_patterns`, `extraction_correction_sessions`, `extraction_learning_candidates`, `extraction_review_outcome`, `org_reputation`.

Surgery required, not just deletion:
- `process-document.ts` — replace the tier-resolution block (roughly lines 290-510) with a fixed Tier 0 context.
- `extract-document.ts` — remove exemplar prompt injection.
- `admin/extraction-health` — currently reads org reputation and exemplar stats. Reduced to plain extraction logs, or removed if nothing useful remains.

**Verification caveat:** the golden-path e2e runs under `E2E_FAKE_AI=1`, so it exercises the pipeline's plumbing but *fakes* the extraction call.
It will prove the pipeline still runs. It will not prove extraction quality is unchanged.
Real-extraction confidence needs one manual upload against a live model after the cut.

## Execution order

Each step ends green on `pnpm build && pnpm test && pnpm lint`.
Nothing is committed without separate explicit permission.
Safe bulk deletion runs first and is verified green *before* the risky surgery starts, so a failure in the latter is isolated and cheap to revert.

1. **Write `docs/deferred-features.md`** — the register. Every removed feature, what it did, why it went, the restoring commit SHA, and the tables it needs. Written *first*, so the record exists before the code stops existing.
2. **Nav + i18n** — reduce `lib/nav/structure.ts` to the five keep entries; drop the six "More" groups; prune dead `nav` keys from `en.json` and `th.json` in parity.
3. **Delete route dirs + API routes**, with their e2e suites.
4. **Delete libs, queries, Inngest functions.** Deregister from `api/inngest/route.ts`. Remove the `postingOutbox` insert from `vat-operations-ledger.ts`.
5. **Prune `smoke/all-pages.spec.ts`** to surviving routes; update `sidebar/nav.spec.ts`.
6. **Verify green.** Build, test, lint, plus the golden-path e2e. *Checkpoint — the safe half is done here.*
7. **AI learning layer surgery** (decision 3). Isolated deliberately.
8. **Verify green again**, golden path included.
9. **Schema + migration** — remove the ~57 table definitions from `schema.ts`; `pnpm db:generate`. Migration is **generated only**. Applying it is a separate, separately-authorised step.
10. **Docs truth-up** — CLAUDE.md context map, `roadmap.md`, `000-overview.md`, DESIGN.md nav model.
11. **UI polish** (owner's live-review findings, deferred to here because they touch files steps 2-3 rewrite):
    - nav items need more colour
    - top-strip small buttons lack padding
    - in-page tab selectors lack padding and separation

## Rollback

Steps 1-7 are pure git. `git revert` restores everything, and the register in step 1 names the SHA.
Step 6's migration, once applied, destroys data in the dropped tables and is **not** reversible.
That is why it is gated separately.

## Explicitly NOT in scope

- The AI learning subsystem (exemplar consensus, compiled patterns, shadow validation, canary — 2,371 lines in `lib/ai`). Invisible in the nav, so it does not contribute to the owner's stated complaint. Raised separately as an open question.
- Any change to the extraction pipeline, reconciliation matcher, or tax engine behaviour beyond the `postingOutbox` removal.
- Re-adding anything. Restoration is a future decision, informed by the register.
