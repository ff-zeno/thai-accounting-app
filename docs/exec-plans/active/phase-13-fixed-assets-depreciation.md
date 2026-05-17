# Plan: Phase 13 — Fixed Asset Register, Depreciation, Disposals

**Status:** Implementation-active — foundation, document capitalization prompt, standalone/manual asset intake with tax-life warning, prior-register CSV import, standalone disposal UX, standalone roll-forward report, asset detail/depreciation-register UX, disposal register, roll-forward CSV export, manual/monthly depreciation posting through the standard posting outbox, disposal GL clearing, Phase 12a depreciation addback handoff, and owner-visible straight-line v1 scope caveat shipped; richer depreciation methods/impairment remain deferred
**Depends on:** Phase 10.5 (GL primitives) shipped — depreciation entries post to GL via Phase 13's own monthly cron through the standard posting engine (round-6: recurring-journal templates dropped from Phase 10.5)
**Authority reference:** `vat-info.md` §4 (CIT context); Thai Revenue Code §65 bis (depreciation methods + rates); TFRS for NPAEs (PPE section); BOI privileges if applicable.
**Source refresh:** Revenue Department corporate income tax depreciation table, `https://www.rd.go.th/english/6044.html`, retrieved 2026-05-16 and live-link checked 2026-05-17 with HTTP 200. Encoded only ordinary straight-line ceiling defaults: permanent buildings 5%/year (240 months), temporary buildings 100% (12 months), acquisition-cost-depleting natural resources 5%/year (240 months), lease/no-written-agreement and other limited-right intangibles 10%/year (120 months), computers/programs 33.33%/year (36 months), most other depreciable assets 20%/year (60 months), land non-depreciable.

## Problem

Every Thai juristic person owns fixed assets (computers, vehicles, office equipment, leasehold improvements). For CIT (PND.50) calculation, the platform needs:
1. **Asset register** — what we own, when acquired, original cost, useful life.
2. **Depreciation schedule** — monthly straight-line (per round-4 simplification; declining-balance / units-of-production deferred).
3. **Disposals** — gain/loss on sale, removal from register.
4. **Book vs tax depreciation** — round-5: book uses owner-chosen useful life; tax uses statutory minimum life from a small lookup table; auto book-tax adjustment flows to Phase 12a's PND.50 addbacks.

Today the platform has no asset table, no depreciation schedule, no disposal flow. CIT is structurally impossible. Auditor asks for the fixed-asset roll-forward; tenant has nothing.

## Requirements

### Schema

#### Asset register

- [x] New table `fixed_assets`:
  - `id uuid PK`
  - `org_id uuid NOT NULL`
  - `establishment_id uuid` — null for org-wide; set for branch-specific
  - `asset_code` text NOT NULL — sequential per org, e.g. `FA-2026-0001`
  - `name_th`, `name_en` text NOT NULL
  - `category` text NOT NULL — `building`, `equipment`, `vehicle`, `furniture_fixtures`, `computer_software`, `leasehold_improvement`, `intangible_other`, `land` (no depreciation)
  - `gl_account_id uuid` — FK to `gl_accounts` (e.g. 1330 Equipment for category=equipment)
  - `accumulated_depreciation_account_id uuid` — FK (e.g. 1331)
  - `depreciation_expense_account_id uuid` — FK (e.g. 6820)
  - `acquisition_date date NOT NULL`
  - `acquisition_document_id uuid` — FK to invoice/receipt
  - `original_cost numeric(14,2) NOT NULL`
  - `salvage_value numeric(14,2) DEFAULT 0`
  - `useful_life_months integer NOT NULL` — book depreciation life (owner-chosen). UI suggests defaults per category but does not enforce.
  - `tax_useful_life_months_minimum integer NOT NULL` — **statutory minimum life** per RD §65 Bis(2) + Royal Decree No.145. **Auto-set on insert by category trigger; cannot be overridden by owner without explicit accountant role + reason.** Round-5 fix:
    - Building: 240 months (5%/year max rate)
    - Vehicles: 60 months (20%/year)
    - Computer/equipment: 60 months (20%/year)
    - Computer software: 60 months (20%/year)
    - Furniture/fixtures: 60 months (20%/year)
    - Leasehold improvement: per lease term, no shorter than 60 months
  - `depreciation_method` text NOT NULL DEFAULT `straight_line` — `straight_line`, `not_depreciable` (land). Other methods deferred per round-4 simplification.
  - `depreciation_start_date date NOT NULL` — typically `acquisition_date`; first JE posts in the month after this
  - `disposed_at date`
  - `disposal_proceeds numeric(14,2)`
  - `disposal_document_id uuid` — sale invoice or write-off authorization
  - `gain_loss_on_disposal numeric(14,2)`
  - `boi_segment text` — `boi_promoted`, `non_boi`, `n_a`
  - `serial_number text`
  - `location text` — physical location reference
  - `assigned_to_employee_id uuid`
  - `notes text`
  - `created_at, updated_at, deleted_at`

#### Depreciation schedule

- [x] New table `depreciation_schedule`:
  - `id uuid PK`
  - `org_id uuid NOT NULL`
  - `fixed_asset_id uuid NOT NULL`
  - `period_year integer NOT NULL`
  - `period_month integer NOT NULL`
  - `depreciation_amount numeric(14,2) NOT NULL` — book depreciation (owner-chosen useful life)
  - `tax_depreciation_capped_amount numeric(14,2) NOT NULL` — round-5 fix: depreciation computed at the LOWER of (book amount) and (statutory ceiling at `tax_useful_life_months_minimum`). When `useful_life_months < tax_useful_life_months_minimum`, this is capped per RD §65 Bis. Auto-feeds Phase 12a `book_tax_adjustments` so CIT reflects the statutory ceiling, not the owner's faster book number.
  - `book_tax_difference numeric(14,2) GENERATED ALWAYS AS (depreciation_amount - tax_depreciation_capped_amount) STORED` — positive when owner over-depreciates vs RD; this amount is the addback on PND.50.
  - `accumulated_depreciation_after numeric(14,2) NOT NULL`
  - `book_value_after numeric(14,2) NOT NULL`
  - `journal_entry_id uuid` — FK to the posted JE (Phase 10.5)
  - `posted_at timestamptz`
  - `is_partial_month boolean DEFAULT false`
  - `created_at, updated_at`
  - Unique on `(org_id, fixed_asset_id, period_year, period_month)`

### Engines

#### Depreciation engine

- [x] `src/lib/db/queries/fixed-assets.ts` first-slice schedule builder:
  - `computeDepreciationForPeriod(orgId, periodYear, periodMonth)` — for every active asset, compute monthly depreciation based on method:
    - Straight-line: `(original_cost − salvage_value) ÷ useful_life_months`
    - Double-declining: `book_value × (2 ÷ useful_life_months)` floor at salvage value
    - Units of production: `(original_cost − salvage_value) × (period_units ÷ total_estimated_units)`
  - Inserts `depreciation_schedule` rows.
  - Idempotent — re-running for same asset returns no-op for existing periods.
- Manual period GL posting now queues selected periods through `posting_outbox`; the standard outbox consumer posts unposted schedule rows into balanced `auto_depreciation` journal entries.

- [x] Inngest cron `process-monthly-depreciation` (1st of each month at 02:00):
  - Calls `computeDepreciationForPeriod` for the prior month.
  - Per org. Each posts to GL.
  - Surfaces failures in dashboard.

#### Disposal engine

- [x] `src/lib/db/queries/fixed-assets.ts` disposal posting:
  - `disposeAsset({ assetId, disposalDate, proceeds, documentId, reason })`:
    1. Compute book value at disposal date from posted depreciation only (book_value = original_cost − posted accumulated_depreciation).
    2. Compute gain/loss = proceeds − book_value.
    3. Post JE:
       ```
       Dr  1xxx Cash/Bank (proceeds)
       Dr  14xx Accumulated depreciation (clears the contra)
       Dr  6880 Loss on disposal (if loss)
           Cr  14xx Asset cost (clears the asset)
           Cr  4340 Gain on disposal (if gain)
       ```
    4. Update `fixed_assets.disposed_at`, `disposal_proceeds`, `gain_loss_on_disposal`.
    5. Stop future depreciation accruals.
  - Evidence: `pnpm vitest run --config vitest.config.db.ts src/lib/db/queries/fixed-assets.db.test.ts`; `pnpm exec drizzle-kit check`; `pnpm tsc --noEmit`.

### From acquisition document → asset register

- [x] When a confirmed `documents` row has `document_category` matching a fixed-asset class (computer, vehicle, equipment, furniture, etc.) AND amount above tenant-configurable threshold (default ฿5,000 expense vs capitalize per Thai tax practice):
  - Surface "Capitalize as fixed asset?" prompt after document confirm on the review screen.
  - Create `fixed_assets` row with sensible defaults (category, useful life from category default, depreciation start = invoice date).
  - Allow user to adjust before save.

### UI

- [x] `src/app/(app)/fixed-assets/page.tsx` — register list foundation, manual create form, schedule build action, summary cards, roll-forward table, and CSV export button.
- [x] Manual `/fixed-assets` depreciation posting control for a selected year/month.
- [x] `/documents/[docId]/review` — confirmed expense purchases over ฿5,000 can create a linked fixed-asset row.
- [x] `src/app/(app)/fixed-assets/new/page.tsx` — standalone manual asset entry with success redirect to asset detail, validation error surfacing, and Playwright coverage.
- [x] `src/app/(app)/fixed-assets/[id]/page.tsx` — asset detail with depreciation schedule + disposal action.
- [x] `src/app/(app)/fixed-assets/[id]/dispose/page.tsx` — standalone disposal flow with asset snapshot, validation error surfacing, and redirect back to disposed asset detail.
- [x] `src/app/(app)/fixed-assets/reports/roll-forward/page.tsx` — fixed asset roll-forward report (opening + additions − disposals − depreciation = closing) per category, with year filter and CSV link.
- [x] `src/app/(app)/fixed-assets/import/page.tsx` — CSV import from prior accounting system on onboarding with row-numbered validation, all-or-nothing insertion, and Playwright coverage.

### Reports

- [x] **Fixed asset roll-forward** — per category, per fiscal year:
  - Opening cost + additions − disposals = closing cost
  - Opening accumulated depreciation + period depreciation − disposed accumulated = closing accumulated
  - Closing book value = closing cost − closing accumulated
- [x] **Depreciation register** — month-by-month per asset on `/fixed-assets/[id]`.
- [x] **Disposal register** — disposals in current year with book value, proceeds, and gain/loss summary on `/fixed-assets`.

## Approach

### Sequencing (3 weeks)

**Week 1 — Schema + asset register CRUD**
1. Migrations.
2. Asset register UI (manual creation, list, edit).
3. CSV import from prior systems.
4. Default tax rates seeded per category.

**Week 2 — Depreciation engine + monthly cron**
1. `depreciation-engine.ts` for straight-line only (round-4 simplification dropped DDB / UoP). Computes both `book` and `tax_capped` amounts each period.
2. Inngest cron `process-monthly-depreciation`.
3. Backfill: post depreciation for prior periods of existing assets (idempotent).
4. GL posting integration.

**Week 3 — Disposals + reports + acquisition flow**
1. `disposal-engine.ts` + UI.
2. Roll-forward report.
3. Document → fixed-asset capitalize prompt at confirm.
4. First-tenant onboarding: Lumera enters opening register; reconciles to opening BS.

### Dependencies

- **Phase 10.5 (GL primitives)** — required for posting.
- **Phase 12 (CIT)** — book-tax depreciation differences feed CIT calc.
- **Phase 14 (audit pack)** — fixed asset roll-forward feeds the auditor ZIP.

## Critical files

- `src/lib/fixed-assets/depreciation-engine.ts`
- `src/lib/fixed-assets/disposal-engine.ts`
- `src/lib/fixed-assets/asset-categorizer.ts` — category → useful life defaults
- `src/lib/db/queries/fixed-assets.ts`
- `src/lib/db/queries/depreciation-schedule.ts`
- `src/lib/inngest/functions/process-monthly-depreciation.ts`
- `src/app/(app)/fixed-assets/**`

## Verification

- [x] Asset acquired 2026-03-15, ฿120,000 computer, 60-month book SL → ฿2,000/month depreciation; first schedule row for April 2026 (full month).
- [x] Asset acquired 2026-01-01, ฿120,000 equipment, February 2026 depreciation posts one balanced JE: Dr 6821 ฿2,000 / Cr 1331 ฿2,000; schedule row receives `journal_entry_id`; rerun no-ops; locked GL period blocks posting.
- [ ] (DDB example removed per round-4 simplification — only straight-line shipped.)
- [x] Disposal posting: asset cost is cleared, posted accumulated depreciation is debited, proceeds debit 1111, and gain/loss posts to 4340/6880. Current DB coverage includes no-posted-depreciation, sequential posted-depreciation, non-sequential posted-depreciation, locked-period, and post-disposal future-depreciation blocking cases.
- [x] Roll-forward: opening cost + additions − disposals = closing cost, with GL asset-account closing balance and variance surfaced in the report/CSV when the category maps to a unique asset account in the report. Shared-account categories intentionally show blank GL tie-out fields to avoid false per-category variances. Current DB coverage proves equipment closing cost ties to GL account 1330 when unique, and that equipment + leasehold sharing 1330 does not emit fake category variances.
- [x] Org isolation and audit log entries on every disposal, including disposal JE id. Evidence: `pnpm vitest run --config vitest.config.db.ts src/lib/db/queries/fixed-assets.db.test.ts`.
- [x] Land assets have `depreciation_method='not_depreciable'` and never accrue.

## Implementation evidence — 2026-05-16 foundation slice

- Added `drizzle/0040_fixed_assets_foundation.sql` and `0041_fixed_asset_tax_life_source_correction.sql`.
- Added Drizzle tables `tax_min_life_by_category`, `fixed_assets`, and `depreciation_schedule`.
- Added same-org guardrails for establishments, GL accounts, acquisition/disposal documents, employee assignees, and depreciation schedules.
- Added disposal action in `src/lib/db/queries/fixed-assets.ts` and `/fixed-assets`: sets `disposed_at`, `disposal_proceeds`, and `gain_loss_on_disposal` from posted book value through disposal month; posts the disposal clearing JE; blocks locked GL periods, duplicate disposals, future schedule posting, and further depreciation schedule builds.
- Added manual period depreciation posting in `src/lib/db/queries/fixed-assets.ts`: seeds required depreciation COA accounts, locks the org/period posting attempt, posts unposted rows to `auto_depreciation` GL entries, links schedule rows to the created journal entry, blocks locked GL periods, and writes an audit-log row.
- Added Phase 14 allocation metadata on fixed-asset P&L postings: depreciation expense and disposal gain/loss lines carry `fixed_asset:<category>` for category allocation; asset-cost, bank, and accumulated-depreciation control lines stay unsegmented.
- Added monthly depreciation automation: `processDepreciationForPeriod`, `enqueueDepreciationPostingForPeriod`, `processMonthlyDepreciationForAllOrgs`, Bangkok previous-month targeting, standard posting-outbox enqueue/handler coverage, and registered Inngest cron `process-monthly-depreciation`. Claude-reviewed hardening now covers intangible/natural-resource category GL mappings, same-period disposal blocking while depreciation outbox rows are pending/retrying/failed, audited per-org cron failures, and duplicate enqueue reuse under an org-period advisory lock.
- Added `/fixed-assets` manual "Queue Depreciation" control and server action.
- Added document-to-asset capitalization prompt/action on the review screen, guarded by confirmed expense status, default threshold, same-org document lookup, and duplicate acquisition-document check.
- Added Phase 12a handoff: generated CIT book-tax adjustment sync sums yearly positive `book_tax_difference` into one depreciation addback row.
- Added a category roll-forward read model, CSV export route, and `/fixed-assets` table for opening cost, additions, disposals, period depreciation, closing cost, GL asset-account balance, and GL variance; depreciation stops at disposal month even when a full future schedule already exists. GL tie-out fields are blank for shared or unmapped asset-account categories rather than reporting misleading variances.
- Added asset detail read model and `/fixed-assets/[id]` UI with profile, original cost, accumulated depreciation, book value, book-tax addback, schedule-build action, disposal action, per-period depreciation register, and JE trace IDs.
- Added disposal-register read model and `/fixed-assets` table for current-year disposals, including disposal date, asset link, book value at disposal, proceeds, gain/loss, category, and branch.
- Added owner-visible `/fixed-assets` v1 caveat: straight-line register/schedule/roll-forward/disposal/GL/CSV import are testable; declining-balance, units-of-production, impairment workflow, and method changes remain deferred/accountant-review cases. Evidence: `pnpm test:e2e e2e/fixed-assets/fixed-assets.spec.ts`; `.next/types` + `.next/dev/types` cleanup; `pnpm tsc --noEmit`; `git diff --check`.
- Added owner-visible CSV import result links on `/fixed-assets/import`: successful imports now redirect with up to 50 created asset IDs, render direct links to imported assets, ignore malformed URL IDs, and preserve imported-row order in the confirmation list, so owners can inspect imported rows even when the capped dashboard register is polluted by older E2E/manual data. Claude Companion found malformed-UUID and oversized-redirect risks; fixes landed and follow-up review approved with no blockers. Evidence: `pnpm test:e2e e2e/fixed-assets/fixed-assets.spec.ts` passed 8 tests; full `pnpm test:e2e` passed 223 tests after the Claude follow-up hardening; focused fixed-assets DB tests passed 26 tests; `pnpm tsc --noEmit`; `git diff --check`.
- Verification added: `src/lib/db/queries/fixed-assets.db.test.ts` covers disposal gain/loss, posted-only accumulated depreciation clearing, future depreciation blocking after disposal, disposed-asset blocking, balanced GL depreciation posting, intangible/natural-resource depreciation mappings, depreciation posting-outbox enqueue/handler linkage including late-asset requeue after an already-posted period and duplicate open-period enqueue reuse, same-period disposal blocking while depreciation is queued, audited monthly cron failure visibility, roll-forward-to-GL asset-account tie-out, monthly processing idempotency, Bangkok cron targeting, posting idempotency, and GL-period lock blocking; `src/lib/fixed-assets/fixed-asset-report-export.test.ts` covers roll-forward CSV serialization; `e2e/fixed-assets/fixed-assets.spec.ts` creates an asset and verifies disposal/export/queue controls render; `e2e/documents/review-learning.spec.ts` verifies a confirmed asset purchase can create a linked fixed asset.
- Added `src/lib/db/queries/fixed-assets.ts` with dashboard, manual asset creation, and idempotent full-month straight-line schedule builder.
- Added `/fixed-assets` UI, nav/i18n labels, full export coverage, DB tests, and Playwright route smoke.
- Current verified gate: `pnpm tsc --noEmit`; `pnpm exec drizzle-kit check`; `pnpm db:migrate`; `pnpm vitest run --config vitest.config.db.ts src/lib/db/queries/fixed-assets.db.test.ts`; `pnpm vitest run --config vitest.config.db.ts src/lib/db/queries/fixed-assets.db.test.ts src/lib/db/queries/general-ledger.db.test.ts`; `pnpm vitest run src/lib/export/full-export.test.ts`; `pnpm test:e2e e2e/fixed-assets/fixed-assets.spec.ts`. Latest Claude-reviewed fixed-asset depreciation/import-result gates: fixed-assets DB 26, GL DB 39, export/dispatch/report unit 11, fixed-assets Playwright 8, TypeScript, diff check, and no-active-`vat_records` search passed.

## Risks

- **Method changes mid-life.** Out of scope per round-4 simplification (only straight-line shipped). Tenants who need DDB / UoP dispose + re-acquire workaround.
- **Component depreciation** (TFRS allows component-level depreciation for major assets like buildings). Out of v1; default whole-asset depreciation.
- **Impairment testing.** TFRS for NPAEs allows simpler treatment. v1: tenant manually adjusts via book-tax adjustment on PND.50; full impairment workflow deferred.
- **Threshold for capitalize vs expense.** Thai practice: ฿5,000 default; configurable per tenant. Below threshold → expense to 6xxx.

---

## Post-round-3-review hardening (added 2026-04-26)

### Tax depreciation cap per RD §65 Bis(2) (full-month convention, day-proration deferred)

**Round-4 user direction: simplify operationally; round-5 ROUND-5 fix: enforce statutory ceiling automatically.** Round-4 dropped day-proration + RD No.145 seed table. Round-5 review (both reviewers) flagged that "owner-chosen useful life with no enforcement" is a CIT-underpayment ship-blocker. Fix: keep the simple owner-facing UX, but compute tax depreciation at the **statutory cap automatically**.

- [x] Single depreciation method per asset: `straight_line`. No declining-balance / UoP (deferred).
- [x] `fixed_assets.useful_life_months integer NOT NULL` — **book** depreciation life. Owner enters; defaults suggested by category.
- [x] `fixed_assets.tax_useful_life_months_minimum integer NOT NULL` — **ordinary statutory ceiling life** from `tax_min_life_by_category`; app sets it on create. Elevated override workflow remains deferred.
- [x] **Two depreciation amounts computed each period:**
  - Book: `depreciation_amount = (cost − salvage_value) ÷ useful_life_months`
  - Tax-capped: `tax_depreciation_capped_amount = min(book_amount, (cost − salvage_value) ÷ tax_useful_life_months_minimum)`
- [x] First/last month: full-month convention (no day-proration per round-4).
- [x] **Auto book-tax difference** flows to Phase 12a's book-tax adjustments through an idempotent generated addback sync.
- [x] UI surfaces the cap when owner picks a useful life shorter than statutory min: standalone asset intake shows the tax minimum and warns that excess book depreciation is tracked as a PND.50 addback. Full projected book-vs-tax schedule remains visible after schedule build on asset detail.
- [x] Asset categories carry **ordinary statutory ceiling lives** in a small lookup table:
  - `tax_min_life_by_category(category, tax_useful_life_months_minimum, source_citation)` — seeds from RD page retrieved 2026-05-16: permanent building 240m, temporary building 12m, natural-resource depletion rights 240m, lease/no-written-agreement and other limited-right intangibles 120m, computers/programs 36m, most other depreciable property 60m, land 0m.

### Depreciation posting cron (round-6 superseded recurring-journal consolidation)

Round-6 user direction dropped recurring-journal templates from Phase 10.5. Phase 13 owns its own monthly cron, which writes to `posting_outbox` like every other source.

- [x] Inngest cron `process-monthly-depreciation` runs day-1 of each month: scans active `fixed_assets` for the prior Bangkok month, builds missing schedule rows, and queues unposted period rows through `posting_outbox`.
- [x] Idempotency key: `(asset_id, period_year, period_month)` schedule uniqueness plus posted-row filtering makes re-runs safe.
- [x] Disposal action sets `disposed_at`; subsequent runs skip the asset.
- [x] Settlement: standard posting-outbox consumer handles `fixed_asset_depreciation_period:post`, posts `posting_kind='depreciation'`, marks the period posted, and links the resulting journal entry.

### `depreciation_schedule` ties to GL via Phase 10.5 outbox

- [x] Each scheduled depreciation period posts via `posting_outbox` per Phase 10.5 hardening — never synchronous-blocking for the owner/monthly workflow.
- [x] Failure mode: scheduled row stays unposted; the outbox row can move to `retrying`/`failed` and surface in `posting_exceptions`; period close remains blocked by pending/failed posting rows.
- [x] Self-review finding fixed: late assets added to an already-posted period now create a fresh depreciation period source row/outbox event instead of reusing a posted outbox row. Claude Companion review was rerun after the CLI became available; blocker findings were fixed and follow-up reported no blockers.

### Verification additions

- [x] Asset acquired 2026-01-01, ฿120,000 equipment, owner sets useful life = 24 months (faster than RD ordinary ceiling life of 60 months):
  - Book monthly depreciation = 120,000 ÷ 24 = ฿5,000.00.
  - Tax-capped monthly depreciation = min(5,000.00, 120,000 ÷ 60) = ฿2,000.00.
  - Book-tax difference per month = ฿3,000.00 (stored for Phase 12a).
  - First schedule period: February 2026.
  - Phase 12a annual flow remains deferred.
- [ ] Disposal 2027-04-30: current v1 uses full-month depreciation convention, not day-proration. After disposal, `disposed_at` is set and subsequent monthly cron passes skip the asset.
