# Plan: Phase 13 — Fixed Asset Register, Depreciation, Disposals

**Status:** Draft — captured 2026-04-26
**Depends on:** Phase 10.5 (GL primitives) shipped — depreciation entries post to GL via Phase 13's own monthly cron through the standard posting engine (round-6: recurring-journal templates dropped from Phase 10.5)
**Authority reference:** `vat-info.md` §4 (CIT context); Thai Revenue Code §65 bis (depreciation methods + rates); TFRS for NPAEs (PPE section); BOI privileges if applicable

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

- [ ] New table `fixed_assets`:
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

- [ ] New table `depreciation_schedule`:
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

- [ ] `src/lib/fixed-assets/depreciation-engine.ts`:
  - `computeDepreciationForPeriod(orgId, periodYear, periodMonth)` — for every active asset, compute monthly depreciation based on method:
    - Straight-line: `(original_cost − salvage_value) ÷ useful_life_months`
    - Double-declining: `book_value × (2 ÷ useful_life_months)` floor at salvage value
    - Units of production: `(original_cost − salvage_value) × (period_units ÷ total_estimated_units)`
  - Inserts `depreciation_schedule` row + posts JE via Phase 10.5 posting engine.
  - Idempotent — re-running for same period returns no-op if already posted.

- [ ] Inngest cron `process-monthly-depreciation` (1st of each month at 02:00):
  - Calls `computeDepreciationForPeriod` for the prior month.
  - Per org. Each posts to GL.
  - Surfaces failures in dashboard.

#### Disposal engine

- [ ] `src/lib/fixed-assets/disposal-engine.ts`:
  - `disposeAsset({ assetId, disposalDate, proceeds, documentId, reason })`:
    1. Compute book value at disposal date (book_value = original_cost − accumulated_depreciation).
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

### From acquisition document → asset register

- [ ] When a confirmed `documents` row has `document_category` matching a fixed-asset class (computer, vehicle, equipment, furniture, etc.) AND amount above tenant-configurable threshold (default ฿5,000 expense vs capitalize per Thai tax practice):
  - Surface "Capitalize as fixed asset?" prompt at confirm time.
  - On confirm: create `fixed_assets` row with sensible defaults (category, useful life from category default, depreciation start = invoice date).
  - Allow user to adjust before save.

### UI

- [ ] `src/app/(app)/fixed-assets/page.tsx` — register list, filter by category, location, status.
- [ ] `src/app/(app)/fixed-assets/new/page.tsx` — manual asset entry.
- [ ] `src/app/(app)/fixed-assets/[id]/page.tsx` — asset detail with depreciation schedule + disposal action.
- [ ] `src/app/(app)/fixed-assets/[id]/dispose/page.tsx` — disposal flow.
- [ ] `src/app/(app)/fixed-assets/reports/roll-forward/page.tsx` — fixed asset roll-forward report (opening + additions − disposals − depreciation = closing) per category.
- [ ] `src/app/(app)/fixed-assets/import/page.tsx` — CSV import from prior accounting system on onboarding.

### Reports

- [ ] **Fixed asset roll-forward** — per category, per fiscal year:
  - Opening cost + additions − disposals = closing cost
  - Opening accumulated depreciation + period depreciation − disposed accumulated = closing accumulated
  - Closing book value = closing cost − closing accumulated
- [ ] **Depreciation register** — month-by-month per asset.
- [ ] **Disposal register** — disposals in period with gain/loss summary.

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

- [ ] Asset acquired 2026-03-15, ฿120,000 computer, 60-month SL → ฿2,000/month depreciation; first JE posted for April 2026 (full month).
- [ ] (DDB example removed per round-4 simplification — only straight-line shipped.)
- [ ] Disposal 2026-12-31 of asset with book value ฿80,000, sold for ฿100,000 → gain ฿20,000 booked to 4340.
- [ ] Roll-forward: opening cost ฿1M + additions ฿200k − disposals ฿120k = closing ฿1.08M; matches GL 1330 balance.
- [ ] Org isolation, audit log entries on every disposal.
- [ ] Land assets have `depreciation_method='not_depreciable'` and never accrue.

## Risks

- **Method changes mid-life.** Out of scope per round-4 simplification (only straight-line shipped). Tenants who need DDB / UoP dispose + re-acquire workaround.
- **Component depreciation** (TFRS allows component-level depreciation for major assets like buildings). Out of v1; default whole-asset depreciation.
- **Impairment testing.** TFRS for NPAEs allows simpler treatment. v1: tenant manually adjusts via book-tax adjustment on PND.50; full impairment workflow deferred.
- **Threshold for capitalize vs expense.** Thai practice: ฿5,000 default; configurable per tenant. Below threshold → expense to 6xxx.

---

## Post-round-3-review hardening (added 2026-04-26)

### Day-proration for tax depreciation per RD §65 Bis(2) + Royal Decree No.145

**Round-4 user direction: simplify operationally; round-5 ROUND-5 fix: enforce statutory ceiling automatically.** Round-4 dropped day-proration + RD No.145 seed table. Round-5 review (both reviewers) flagged that "owner-chosen useful life with no enforcement" is a CIT-underpayment ship-blocker. Fix: keep the simple owner-facing UX, but compute tax depreciation at the **statutory cap automatically**.

- [ ] Single depreciation method per asset: `straight_line_monthly`. No declining-balance / UoP (deferred).
- [ ] `fixed_assets.useful_life_months integer NOT NULL` — **book** depreciation life. Owner enters; defaults suggested by category.
- [ ] `fixed_assets.tax_useful_life_months_minimum integer NOT NULL` — **statutory minimum** per RD §65 Bis(2) + Royal Decree No.145, auto-set per category at insert (trigger). Owner cannot reduce without elevated permission.
- [ ] **Two depreciation amounts computed each period:**
  - Book: `depreciation_amount = (cost − salvage_value) ÷ useful_life_months`
  - Tax-capped: `tax_depreciation_capped_amount = min(book_amount, (cost − salvage_value) ÷ tax_useful_life_months_minimum)`
- [ ] First/last month: full-month convention (no day-proration per round-4).
- [ ] **Auto book-tax difference** flows to Phase 12a's book-tax adjustments at year-end — NOT manual.
- [ ] UI surfaces the cap when owner picks a useful life shorter than statutory min: shows both book vs tax depreciation projected over asset life, makes the addback transparent.
- [ ] Asset categories carry **statutory minimum lives** in a small lookup table (this IS the round-4 dropped table, restored by round-5 minimal form):
  - `tax_min_life_by_category(category, tax_useful_life_months_minimum, source_citation)` — seeds: building 240m / vehicles 60m / computer/equipment 60m / software 60m / furniture 60m / leasehold-improvement 60m.

### Depreciation posting cron (round-6 superseded recurring-journal consolidation)

Round-6 user direction dropped recurring-journal templates from Phase 10.5. Phase 13 owns its own monthly cron, which writes to `posting_outbox` like every other source.

- [ ] Inngest cron `process-monthly-depreciation` runs day-1 of each month: scans active `fixed_assets` with `depreciation_start_date <= today AND fully_depreciated_at IS NULL AND disposed_at IS NULL`, computes period book + tax-capped depreciation per asset, writes one `posting_outbox` row per asset per period.
- [ ] Idempotency key: `(asset_id, period_year, period_month)` — re-runs are safe.
- [ ] Disposal action sets `disposed_at`; subsequent runs skip the asset.
- [ ] Settlement: posting-outbox consumer creates the JE per the standard posting engine (Phase 10.5).

### `depreciation_schedule` ties to GL via Phase 10.5 outbox

- [ ] Each scheduled depreciation entry posts via `posting_outbox` per Phase 10.5 hardening — never synchronous-blocking.
- [ ] Failure mode: scheduled row stays unposted; surfaces in `exception_queue`; period close blocked.

### Verification additions

- [ ] Asset acquired 2026-09-15, ฿120,000 computer, owner sets useful life = 36 months (faster than RD min of 60 months):
  - Book monthly depreciation = 120,000 ÷ 36 = ฿3,333.33.
  - Tax-capped monthly depreciation = min(3,333.33, 120,000 ÷ 60) = ฿2,000.00.
  - Book-tax difference per month = ฿1,333.33 (auto-flows to Phase 12a).
  - First posting: 2026-10-01.
  - 2026 totals: book ฿10,000; tax ฿6,000; PND.50 addback ฿4,000.
  - 2027 totals: book ฿40,000; tax ฿24,000; PND.50 addback ฿16,000.
  - When book schedule fully depreciates at month 36 (Sep 2029), tax depreciation continues to month 60 (Sep 2031). Phase 12a then has negative addbacks (deduct) in years 4-5.
  - Book-tax difference flows to Phase 12a.
- [ ] Disposal 2027-04-30: tax depreciation 2027 = 120,000 × 0.3333 × (120 ÷ 365) = ฿13,150.68. After disposal, `disposed_at` set; subsequent monthly cron passes skip the asset.
