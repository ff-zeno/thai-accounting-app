# Plan: Phase 10.6b — Inventory, COGS, Asset Visibility

**Status:** Draft — captured 2026-04-26
**Position:** After Phase 10.6a Imports and Phase 10.5 GL primitives; before Phase 11/12a for inventory tenants. PND.50 gross profit cannot be computed without this.
**Authority reference:** `vat-info.md` §2.6 (goods/raw-materials report), §5.4 (deemed supply implications); Thai Revenue Code §65 bis (inventory costing methods); TFRS for NPAEs Section 8 (Inventories)

## Problem

Round-3 review found that **inventory accounting is in nobody's lane**. Phase 10.5 has accounts (1160 Inventory, 5110 COGS) but no posting rules. Phase 10's §87 inventory report is "totals only — manual reconciliation required." A retail tenant cannot file PND.50 without correct COGS — gross profit is wrong.

User-elaborated business case (Lumera, Japan importer):
- We have inventory and we make our own SKUs.
- Purchases (often **import invoices**) give us SKUs with associated COGS.
- POS systems sell SKUs → inventory decrements → COGS hits the books.
- Asset visibility: owner should see inventory value alongside cash on the balance sheet view.

**Round-4 scope simplification (user direction):** import overhead (duty, freight, insurance, broker, inland) is **expensed as period cost, NOT capitalized** into inventory carrying value. This trades per-SKU margin precision for simpler accounting that matches owner workflow. Import overhead still hits P&L (so CIT is correct) — just as period expense rather than allocated to inventory units.

**Round-5 TFRS-compliance addition (year-end true-up reclassification):** TFRS for NPAEs Section 8 requires inventory to carry "all costs of purchase, costs of conversion, and other costs incurred in bringing the inventories to their present location and condition" — which includes import duty, freight inwards, and non-recoverable taxes. Pure round-4 simplification breaks Section 8 for ending-inventory carrying value. **Resolution:** keep the simple period-expense path for daily ops; run a year-end **true-up reclassification JE** that capitalizes the proportion of period-expensed import overhead corresponding to **unsold ending inventory** as of fiscal year-end.

- [ ] Year-end engine: `computeImportOverheadTrueUp(orgId, fiscalYear)`:
  1. Sum period-expensed import overhead for the year (broker fees, freight, insurance, duty, etc., excluding import VAT recoverable).
  2. Compute the proportion of imported goods still on hand (by quantity-weighted-average across SKU movements): `unsold_ratio = ending_inventory_qty ÷ (opening_inventory_qty + imported_qty_during_year)`.
  3. True-up amount = `period_expensed_overhead × unsold_ratio`.
  4. Post year-end JE:
     ```
     Dr  1160 Inventory                              [true_up_amount]   -- capitalize the unsold portion
         Cr  5150 Customs duty / 5160 Inbound freight & brokerage (proportional, per source ledger)
                                                     [true_up_amount]   -- reverse from period expense
     ```
     Posted on the last day of the fiscal year, before P&L close (in the year-end orchestration ordering per Phase 10.5).
- [ ] Do **not** auto-reverse statutory year-end inventory carrying value on day 1. That would make opening BS differ from the prior signed closing FS. Instead:
  - Store `inventory_statutory_overhead_component` by SKU/lot/source import.
  - Relieve the statutory overhead component through COGS as the related units sell.
  - Keep owner-facing daily management reports goods-value-only if needed, but statutory GL/FS basis remains continuous.
- [ ] Phase 12b's TFRS notes engine adds disclosure: "Inventory carrying value reflects landed-cost true-up at fiscal year-end per TFRS NPAEs Section 8. Interim-period inventory may understate by import-overhead component." This makes the platform's accounting policy transparent.

The standalone import module (multi-invoice line-item linkage with mixed VAT treatment) lives in `phase-10-6-imports.md` and is now Phase 10.6a. This inventory plan is Phase 10.6b and consumes finalized import outputs (`imports`, `import_goods_lines`, `import_charge_lines`, and resulting `inventory_movements`). It does not rebuild import schema, import wizard, or a landed-cost allocator.

## Goals

1. **SKU master** — canonical product list with current stock, unit cost (goods-value-only), valuation method.
2. **Perpetual inventory** — purchases and POS sales increment/decrement stock per SKU in real time.
3. **Inventory valuation methods** — weighted average on goods value only (default), FIFO (option), specific-identification (option for high-value items).
4. **COGS posting** — every POS sale of an inventoriable SKU posts COGS to GL alongside revenue (= goods unit cost × quantity).
5. **Inventory adjustments** — physical count variance, shrinkage, write-downs.
6. **Asset visibility** — balance sheet view shows inventory value as an asset alongside cash.
7. **§87 inventory report** completed (Phase 10's deferred per-SKU view delivered here).

## Non-goals (deferred / external)

- **Manufacturing/work-in-progress.** Lumera doesn't manufacture today; a separate phase if needed.
- **Multi-warehouse / location stock transfers.** v1: single inventory pool per `establishment_id`.
- **Lot tracking / serial numbers / expiry.** Defer; high-value items use specific-identification valuation but not lot tracking.
- **Demand forecasting / reorder point automation.** Surface low-stock indicators, no automation.
- **Bills of materials.** Defer until manufacturing in scope.

## Requirements

### Schema

#### SKU master

- [ ] New table `skus`:
  - `id uuid PK`
  - `org_id uuid NOT NULL`
  - `establishment_id uuid` — null = available across all branches
  - `sku_code` text NOT NULL — canonical, set by tenant or imported from POS
  - `barcode_ean13` text
  - `name_th`, `name_en` text
  - `description text`
  - `category text` — tenant-defined
  - `valuation_method` text NOT NULL DEFAULT 'weighted_average' — `weighted_average`, `fifo`, `specific_identification`
  - `unit_of_measure` text — `pcs`, `kg`, `liter`, etc.
  - `current_quantity numeric(14,4)` — perpetual; updated by every inventory movement
  - `current_avg_cost numeric(14,4)` — running weighted-avg COGS per unit (for `weighted_average`)
  - `current_value numeric(14,2)` — `current_quantity × current_avg_cost`; cached for fast BS aggregation
  - `last_movement_at timestamptz`
  - `is_inventoriable` boolean DEFAULT true — false for services, intangibles
  - `gl_inventory_account_id uuid` — FK to `gl_accounts` (default 1160)
  - `gl_cogs_account_id uuid` — FK to `gl_accounts` (default 5110)
  - `gl_revenue_account_id uuid` — FK to `gl_accounts` (default 4110)
  - `notes text`
  - `created_at, updated_at, deleted_at`
  - Unique on `(org_id, sku_code)` (org-wide uniqueness; can sell same SKU at multiple branches)

#### Inventory movements (the canonical ledger)

- [ ] New table `inventory_movements`:
  - `id uuid PK`
  - `org_id uuid NOT NULL`
  - `establishment_id uuid NOT NULL`
  - `sku_id uuid NOT NULL`
  - `movement_at timestamptz NOT NULL`
  - `movement_type` text NOT NULL — `purchase_in`, `import_in`, `sale_out`, `return_in`, `return_out`, `adjustment_in`, `adjustment_out`, `transfer_in`, `transfer_out`, `count_variance_in`, `count_variance_out`, `shrinkage`, `revaluation`
  - `quantity numeric(14,4)` NOT NULL — positive for in, negative for out (DB CHECK aligns sign with movement_type)
  - `unit_cost numeric(14,4)` — for in-movements: the landed cost per unit. For out-movements: the cost-flow-method-derived cost (weighted avg / FIFO layer).
  - `total_cost numeric(14,2)` NOT NULL — `abs(quantity × unit_cost)`
  - `running_quantity_after numeric(14,4)` — snapshot of `skus.current_quantity` after this movement
  - `running_avg_cost_after numeric(14,4)` — snapshot of `skus.current_avg_cost` after (relevant for weighted-avg)
  - `running_value_after numeric(14,2)`
  - `source_entity_type text` — `documents` (purchase), `imports` (import_costing row), `sales_transactions` (POS sale), `inventory_counts` (count adjustment), `manual` (admin override)
  - `source_entity_id uuid`
  - `journal_entry_id uuid` — FK to GL JE posted via Phase 10.5
  - `notes text`
  - `created_at, deleted_at` (soft-delete; in practice movements are immutable)
  - Index on `(org_id, sku_id, movement_at)` for per-SKU history
  - Index on `(org_id, source_entity_type, source_entity_id)` for traceability

#### Imports (delegated to phase-10-6-imports.md)

The full import-module schema (multi-invoice packets, mixed-treatment lines, paper-trail linkage to original purchase invoice, customs declaration document, shipper invoice with mixed VAT treatment, etc.) lives in **`phase-10-6-imports.md`** (separate plan).

This plan only needs the inventory-side hook from imports:

- [ ] On `imports.is_finalized = true`, the imports module emits one `inventory_movements` row per line item with:
  - `movement_type='import_in'`
  - `quantity` from the import line
  - `unit_cost_thb` = goods value only (`unit_price_original × fx_rate_at_arrival`) — **NOT** including duty/freight/VAT/broker (those expense to P&L)
  - Updates SKU running average per the cost-flow engine.
- [ ] `inventory_movements.source_entity_type = 'import_lines'`, `source_entity_id` = the line ID, for FK back to the originating import.
- [ ] Round-4 simplification: no per-line allocation, no `landed_unit_cost`, no `cost_allocation_method`. The user has accepted that per-SKU margin is overstated; period overhead still reaches P&L via the import module's expense JEs (Phase 10.6-imports posts those).

#### Domestic purchases (simpler path)

- [ ] When a confirmed `documents` row has `direction='expense'` AND lines reference SKUs (when extracted with line-item detail):
  - Create `inventory_movements` row(s) with `movement_type='purchase_in'`, `unit_cost = line.unit_price` (already in THB), `quantity = line.quantity`.
  - Update `skus.current_quantity`, `current_avg_cost`, `current_value` per `valuation_method`.
  - Post GL JE: `Dr 1160 Inventory + Cr 2110 AP / 1110 Bank`.

#### Inventory counts

- [ ] New table `inventory_counts`:
  - `id uuid PK`
  - `org_id uuid NOT NULL`
  - `establishment_id uuid NOT NULL`
  - `count_date date NOT NULL`
  - `count_type` text — `full`, `cycle`, `spot`
  - `status` text — `draft`, `submitted`, `reconciled`
  - `submitted_at, reconciled_at timestamptz`
  - `reconciled_by_user_id text`
  - `total_variance_value_thb numeric(14,2)` — sum of all SKU variances
  - `notes text`
  - `created_at, updated_at`

- [ ] New table `inventory_count_items`:
  - `id, count_id, sku_id`
  - `system_quantity numeric(14,4)` — what the perpetual ledger says
  - `counted_quantity numeric(14,4)` — physical count
  - `variance numeric(14,4)` — counted − system
  - `variance_value_thb numeric(14,2)` — `variance × current_avg_cost`
  - `variance_reason` text — `shrinkage`, `damage`, `count_error`, `unrecorded_sale`, `other`
- On reconcile, creates `inventory_movements` rows with `movement_type='count_variance_in/out'`.

### Cost-flow method engines

- [ ] `src/lib/inventory/weighted-average.ts`:
  - On `purchase_in` / `import_in`: `new_avg_cost = ((old_quantity × old_avg_cost) + (quantity_in × unit_cost_in)) ÷ (old_quantity + quantity_in)`
  - On `sale_out`: `unit_cost_out = current_avg_cost`; total COGS = `quantity × current_avg_cost`
  - **Negative inventory cost-basis policy (round-4 fix).** When quantity would go negative, the system MUST still post a non-zero COGS to avoid silently understating P&L:
    1. **Suspense path:** post `unit_cost_out = sku.last_known_avg_cost` (from before the stockout) OR `sku.standard_cost` (if maintained); whichever is non-null and most recent.
    2. If neither is available (genuinely zero-history SKU sold before any purchase), use the org-level fallback: `org_config.zero_history_cogs_policy` ∈ `{block_sale, post_at_zero_with_alert, post_at_estimated_with_alert}`. Default = `block_sale`.
    3. **Exception queue.** Every negative-inventory event writes to `exception_queue` with the SKU, quantity, suspense unit cost used, and a flag for accountant review.
    4. **Period close blocks** if any unresolved negative-inventory exception exists for that period. Accountant must (a) backdate the missing purchase document, (b) accept the suspense COGS as final, or (c) reverse the sale.
  - Cleanup: when a backdated purchase lands resolving the negative quantity, the suspense COGS is reversed via JE and the correct COGS posted from the new layer.
- [ ] `src/lib/inventory/fifo.ts`:
  - Maintain layer table `fifo_layers`: per SKU, `(layer_date, original_quantity, remaining_quantity, unit_cost)`
  - On purchase_in: push new layer
  - On sale_out: consume layers oldest-first, compute weighted COGS over consumed layers
- [ ] `src/lib/inventory/specific-identification.ts`:
  - Each unit tracked individually (lot/serial); out-of-scope for v1 except for high-value items where tenant manually picks the layer.

### Import cost allocation engine — REMOVED (round-4 user direction)

The landed-cost allocation engine and per-line overhead allocation have been removed. Per user direction, import overhead is expensed as period cost rather than capitalized. The imports plan (`phase-10-6-imports.md`) handles the overhead expense JEs; this plan only consumes the resulting `inventory_movements` rows for goods value.

The original landed-cost allocator spec is intentionally not preserved inline because its stale account codes kept leaking into implementation reviews. Historical context: round-4 removed per-SKU landed-cost allocation from daily ops; round-5 added the fiscal-year-end true-up above for TFRS inventory presentation.

(End of removed allocation engine. See `phase-10-6-imports.md` for the replacement.)

### POS sale → COGS posting

- [ ] When a `sales_transactions` row is created with `event_role='pos_primary'` AND line items reference inventoriable SKUs:
  - For each line: create `inventory_movements` row (`movement_type='sale_out'`, `unit_cost=current_avg_cost` for weighted-avg, or per-method).
  - Update SKU quantities.
  - Post GL JE (companion to the sale-revenue JE from Phase 10.5):
    ```
    Dr  5110 COGS (sum of unit_cost × quantity per line)
        Cr  1160 Inventory
    ```
  - Single combined JE per sale (revenue + COGS), or two coupled JEs — implementation detail; both must commit atomically with the sale.

### UI

- [ ] `src/app/(app)/inventory/page.tsx` — SKU list with current stock, value, recent movements.
- [ ] `src/app/(app)/inventory/skus/[id]/page.tsx` — SKU detail with movement history + chart.
- [ ] `src/app/(app)/inventory/skus/new/page.tsx` — manual SKU creation.
- [ ] Imports list + wizard live in the **imports plan** (`phase-10-6-imports.md`); the inventory page links into them. This plan does not own the import wizard UI.
- [ ] `src/app/(app)/inventory/counts/page.tsx` — count list.
- [ ] `src/app/(app)/inventory/counts/[id]/page.tsx` — count entry per SKU + reconcile.
- [ ] `src/app/(app)/inventory/adjustments/new/page.tsx` — manual adjustment with reason + audit log.
- [ ] Dashboard widget: total inventory value alongside cash; low-stock alerts.

### Reports

- [ ] **Inventory roll-forward** per SKU per period: opening qty + purchases − sales − adjustments = closing qty; same for value.
- [ ] **Aged inventory** — slow-moving stock (no sales 60/90/180 days).
- [ ] **§87 goods/raw-materials report** (รายงานสินค้าและวัตถุดิบ) — completes Phase 10's placeholder. Inventory in/out per tax month per `establishment_id`, per SKU.

## Approach

### Sequencing (4 weeks)

**Week 1 — SKU master + perpetual ledger + weighted-avg engine**
1. Schema migrations.
2. SKU CRUD UI + import from CSV.
3. Inventory movements ledger.
4. Weighted-average engine.
5. Domestic purchase → inventory hookup (when document line items have SKU references).
6. Backfill: existing tenants enter opening inventory.

**Week 2 — Import output integration**
1. Consume finalized Phase 10.6a import packets.
2. Convert import goods lines into inventory receipts / opening cost basis.
3. Link import charge lines to statutory overhead component tracking for year-end TFRS carrying value.
4. Verify import VAT/duty/brokerage postings are owned by Phase 10.6a and not duplicated here.
5. GL posting here is limited to inventory movement / COGS entries.

**Week 3 — POS sale → COGS + inventory counts**
1. Sales-side hookup: sales_transactions with SKU lines → inventory_movements with sale_out + COGS posting.
2. Inventory count flow + reconciliation.
3. Adjustment workflow.
4. FIFO engine (option for tenants who select it).

**Week 4 — Reports + dashboard + balance sheet visibility**
1. Inventory roll-forward report.
2. Aged inventory report.
3. §87 goods/raw-materials report.
4. Dashboard widget for inventory value alongside cash.
5. Balance sheet integration (inventory value rolls into 1160 BS line).
6. First-tenant validation: Lumera enters opening inventory + processes one import + one POS day → all numbers tie.

### Dependencies

- **Phase 10.5 (GL primitives)** must ship first — every inventory event posts a JE.
- **Phase 10 (POS)** must ship first — sales_transactions with line items needed.
- **Phase 9 (foreign-vendor + WHT)** for foreign supplier classification and any manually selected PND.54 treatment. No automated treaty database.
- **Phase 13 (fixed assets)** — separate concern; expensive equipment is fixed asset, not inventory.
- **Phase 14 (FX revaluation)** — import goods are non-monetary once landed; no revaluation. Import payables in original currency are monetary; revalued by Phase 14.

## Critical files

- `src/lib/inventory/weighted-average.ts`
- `src/lib/inventory/fifo.ts`
- `src/lib/inventory/specific-identification.ts`
- `src/lib/inventory/import-output-adapter.ts`
- `src/lib/inventory/sku-master.ts`
- `src/lib/inventory/inventory-counts.ts`
- `src/lib/inventory/cogs-poster.ts`
- `src/lib/db/queries/skus.ts`
- `src/lib/db/queries/inventory-movements.ts`
- `src/lib/db/queries/imports.ts`
- `src/lib/db/queries/inventory-counts.ts`
- `src/lib/ai/schemas/import-invoice.ts`
- `src/lib/ai/schemas/customs-declaration.ts`
- `src/app/(app)/inventory/**`

## Verification

- [ ] Weighted-avg: open 100 units @ ฿10 avg = ฿1,000 value. Buy 100 @ ฿15 → new avg = ฿12.50, qty 200, value ฿2,500. Sell 50 → COGS ฿625, qty 150, value ฿1,875.
- [ ] FIFO: open layer 100 @ ฿10. Buy layer 100 @ ฿15. Sell 150 → COGS = (100×10) + (50×15) = ฿1,750; remaining layer 50 @ ฿15.
- [ ] Import daily ops: 100 units @ $10 USD invoice; FX 35 → goods THB 35,000. Inventory movement unit cost = ฿350. Import overhead posts separately through `5150/5151/5160`; import VAT posts to `1251`. No per-SKU landed-cost allocation during daily ops.
- [ ] Import year-end true-up: if 40 of those 100 imported units remain unsold and total import overhead was ฿6,000, true-up = ฿2,400. Post Dr `1160` / Cr `5150/5151/5160` proportionally on fiscal year-end, then reverse on day 1 of next fiscal year.
- [ ] POS sale of import line item: revenue + VAT JE from Phase 10; COGS JE from this phase. Balance sheet: 1160 decreases by COGS; 5110 increases.
- [ ] Inventory count variance: system says 100, count says 95 → variance −5 × current_avg → loss ฿62.50 posted to `5120 Inventory adjustments` (or `5130 Inventory write-offs` when damage/obsolescence is documented).
- [ ] §87 inventory report: matches per-SKU movements for the tax month.
- [ ] Balance sheet: 1160 Inventory line equals sum of `skus.current_value`.
- [ ] Multi-establishment: SKU available at branch A and branch B with separate movements; aggregate at org level.
- [ ] All movements auto-post JE; failure mode: posting outbox queue (per Phase 10.5 hardening).

## Risks

- **Negative inventory.** POS feed lags behind purchase data → POS sale of SKU we haven't recorded receiving. Mitigate: allow negative `current_quantity` with explicit `negative_inventory_event` in exception_queue; do not block sales (POS is source of truth for what happened).
- **Import VAT confusion.** Easy to accidentally include import VAT in COGS. Schema + engine explicitly exclude it; tests cover.
- **Allocation method changes mid-period.** Switching weighted-avg to FIFO recomputes prior periods. Out of scope; tenant locks method per SKU at creation.
- **AI extraction of customs forms.** Thai customs declarations are heavily structured Thai-language documents. Extraction may need a dedicated schema + tier-1 examples; treat as a Phase 8 learning loop case study.
- **Backfill for existing tenants.** Lumera has historical purchases without SKU references. Mitigate: opening inventory entry is manual one-time exercise; future purchases auto-track once SKU master is set up.
- **Specific-identification UX.** High-value items (jewelry, electronics) where each unit has its own cost. v1: tenant manually picks the layer at sale. v2: barcode scan integration.

## Open questions

- **Multi-warehouse stock transfers.** Some tenants split inventory across branches. v1: SKUs single-pool per `establishment_id`; transfers as `transfer_out` + `transfer_in` movements. Allocation across stock pools deferred.
- **Bills of materials for own-SKU production.** Lumera "makes our own SKUs" — does this mean assembly from components (BOM)? Or just labeling/reselling? Clarify before Phase 10.6 ships. If real assembly: defer to a Phase 10.7 manufacturing module.
- **Lot tracking / expiry dates.** Out of v1; flag if a tenant needs (e.g. food, pharma, cosmetics).
- **Promotion / bundle SKUs.** "Buy 2 get 1 free" pulls 3 units against 2 paid. Configurable promotion-SKU vs separate movement adjustments. v1: separate adjustments.
