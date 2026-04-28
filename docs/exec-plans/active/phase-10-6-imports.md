# Plan: Phase 10.6a — Imports Module (mixed-treatment lines + paper-trail linkage)

**Status:** Draft — captured 2026-04-27 (round-4 user direction)
**Position:** Runs before `phase-10-6-inventory-cogs-imports.md` (now Phase 10.6b). Imports plan owns import-side documents, payments, mixed-treatment line classification, FX, import VAT/duty/brokerage postings, and paper-trail linkage. Inventory plan owns SKU-side movements, statutory overhead component tracking, and COGS posting after consuming this plan's finalized import outputs. Imports must still store per-import/per-lot landed-cost components from day 1, even if owner-facing daily UX expenses overhead until statutory true-up.
**Authority reference:** `vat-info.md` §3 (import VAT recoverability), §5 (input VAT register); Thai Customs Code (import duty + import VAT computation on CIF + duty + excise); TFRS for NPAEs Section 8 (Inventories — when round-4 simplification permits)

## Problem

Round-3 captured imports as a single header table with aggregate cost columns (duty/freight/insurance/broker totals) and an allocator that distributed overhead to SKUs. Round-4 user direction changed two things:

1. **Landed cost = period expense, not capitalized.** Inventory carrying value = goods value only. Drop the allocator.
2. **Import-related invoices have mixed-treatment lines.** A UPS or FedEx bill is not "service VAT % over total" — each line has its own VAT treatment. Some lines have service VAT charged on them; some lines are pass-through (customs duty); one line IS the import VAT itself (a recoverable input VAT, not a service charge).

Owner-elaborated workflow (Lumera, Japan importer):
- Foreign supplier invoice (Japanese vendor → Lumera): JPY value of the goods.
- Customs declaration form (ใบขนสินค้าขาเข้า) — official declaration of CIF value, duty, import VAT computed on (CIF + duty + excise).
- UPS / FedEx / customs broker invoice with mixed lines:
  - Customs declaration fee (with 7% service VAT)
  - Brokerage / handling fees (with 7% service VAT)
  - Customs duty (pass-through, no VAT line — broker advances to customs)
  - **Import VAT line — the line itself IS the recoverable input VAT** (paid by broker on Lumera's behalf to customs at clearance)
  - Disbursement / govt fees (pass-through)

The system needs to model each invoice line's tax treatment independently and link the whole packet (foreign supplier invoice + customs declaration + broker invoice) to the same import event for paper-trail integrity.

## Goals

1. **Import packet** — one logical unit linking foreign supplier invoice + customs declaration + one or more broker / shipper invoices.
2. **Mixed-treatment line items** — every invoice line carries its own `vat_treatment` enum.
3. **Pass-through accounting** — customs duty and government disbursements expense without VAT.
4. **Recoverable import VAT** — the broker-passed import VAT line goes to 1251 input VAT recoverable, not expense.
5. **Paper-trail linkage** — every doc references the parent import; reports show every dollar/yen/baht traced from foreign vendor → goods received → broker bill → bank payment.
6. **Inventory hook** — emit `inventory_movements` rows for each SKU at goods-value-only (per round-4 simplification), consumed by `phase-10-6-inventory-cogs-imports.md`.
7. **FX handling** — capture FX rate at clearance; THB amounts derived once; preserved as immutable original on each line.

## Non-goals

- **Per-SKU daily landed cost / overhead allocation.** Removed per round-4 for owner-facing daily ops. Goods value capitalizes; overhead expenses in daily management view. However statutory component data is not optional: duty, freight, brokerage, non-recoverable VAT/tax, and other import overhead must be stored per import/lot for Phase 10.6b year-end inventory carrying-value true-up.
- **Automated CIF computation.** Customs computes CIF from invoice + freight + insurance per Customs Code; we capture what the customs declaration says, not recompute it.
- **Treaty/VAT exemption assessment.** If the goods qualify for duty exemption / reduced rate under FTA, customs already applies it on the declaration; we capture the declared duty.
- **Multi-supplier consolidation in one packet.** v1 = one foreign supplier per import packet. Multiple foreign suppliers shipping under one BL → multiple packets.

## Requirements

### Schema

#### `imports` table (rewritten from v3)

- [ ] Header table:
  - `id uuid PK`
  - `org_id uuid NOT NULL`
  - `establishment_id uuid NOT NULL`
  - `import_reference text` — owner-assigned label (e.g. "JP-2026-001")
  - `supplier_vendor_id uuid` — FK to `vendors` (the foreign supplier)
  - `customs_declaration_number text` — official customs reference (เลขที่ใบขนสินค้าขาเข้า)
  - `arrival_port text` — Suvarnabhumi, Laem Chabang, etc.
  - `arrival_date date NOT NULL`
  - `customs_clearance_date date NOT NULL` — used for VAT period assignment
  - `original_currency text NOT NULL` — JPY, USD, etc.
  - `fx_rate_at_clearance numeric(18,8) NOT NULL` — customs-declared rate (immutable)
  - `cif_original numeric(14,2)` — Cost + Insurance + Freight in original currency, per customs declaration
  - `cif_thb numeric(14,2)` — converted at fx_rate_at_clearance
  - `customs_assessed_duty_thb numeric(14,2) DEFAULT 0` — customs declaration line, pass-through expense
  - `customs_assessed_excise_thb numeric(14,2) DEFAULT 0`
  - `customs_assessed_import_vat_thb numeric(14,2) DEFAULT 0` — recoverable input VAT
  - `is_finalized boolean DEFAULT false` — once finalized, packet is immutable; movements + JEs created
  - `finalized_at timestamptz`
  - `notes text`
  - `created_at, updated_at, deleted_at`

#### `import_documents` linkage

- [ ] New table `import_documents`:
  - `id uuid PK`
  - `import_id uuid NOT NULL`
  - `document_id uuid NOT NULL` — FK to existing `documents`
  - `document_role text NOT NULL` — `foreign_supplier_invoice`, `customs_declaration`, `broker_invoice`, `shipping_invoice`, `insurance_invoice`, `bank_remittance_advice`, `other`
  - `notes text`
  - Unique on `(import_id, document_id)` — same doc can't be linked twice
  - Multiple `broker_invoice` rows allowed (a single import may have UPS bill + customs broker bill + freight forwarder bill)

#### `import_goods_lines` — what's in the box

- [ ] New table `import_goods_lines`:
  - `id uuid PK`
  - `import_id uuid NOT NULL`
  - `sku_id uuid NOT NULL`
  - `quantity numeric(14,4) NOT NULL`
  - `unit_price_original numeric(14,4) NOT NULL` — supplier's invoice price per unit, in original currency
  - `goods_value_original numeric(14,2)` — `quantity × unit_price_original`
  - `goods_value_thb numeric(14,2)` — `goods_value_original × fx_rate_at_clearance` (immutable once finalized)
  - `weight_kg numeric(14,4)` — informational only (no longer drives allocation)
  - `lot_sequence integer NOT NULL DEFAULT 1` — round-5 fix: same SKU may appear at different unit prices on a single import (mid-shipment supplier price change, partial backorder fulfillment at higher cost). Each price-distinct shipment is its own lot; lot_sequence increments. Weighted-average COGS engine consumes each lot separately.
  - `notes text`
  - Unique on `(import_id, sku_id, lot_sequence)` — multiple lots per SKU permitted.

#### `import_charge_lines` — every charge from every linked invoice (THE KEY TABLE)

- [ ] New table `import_charge_lines`:
  - `id uuid PK`
  - `import_id uuid NOT NULL`
  - `source_document_id uuid NOT NULL` — FK to `documents` (the broker bill / shipper invoice / etc. this line came from)
  - `line_description text NOT NULL` — "Customs duty advanced", "Brokerage handling fee", "Import VAT", "Disbursement", "Inland freight", etc.
  - `amount_thb numeric(14,2) NOT NULL` — line amount, always THB
  - **Multi-currency capture (round-5 fix):**
    - `original_currency text NOT NULL DEFAULT 'THB'` — JPY/USD/etc. when broker bill is non-THB
    - `original_amount numeric(14,2) NOT NULL` — line amount in original currency (= amount_thb when same)
    - `fx_rate_applied numeric(18,8)` — null when currency = THB; otherwise the rate used to derive amount_thb
    - `fx_source text` — 'BOT_reference', 'broker_invoice_rate', 'manual'
    - `fx_date date` — date of the rate
  - `vat_treatment text NOT NULL` — enum (round-5 expanded):
    - `service_with_vat_pct` — normal service charge with VAT % applied (e.g. brokerage fee + 7% VAT). The 7% is in `vat_amount_thb`.
    - `service_with_vat_zero` — zero-rated service (e.g. international freight legs that qualify for 0% per §80/1). Recoverable input VAT (zero); audit-distinct from pass-through.
    - `service_vat_exempt` — VAT-exempt service (e.g. some financial fees). Not VAT-able; expense only.
    - `is_import_vat` — **the line IS the recoverable input VAT** (broker-advanced to customs). Posts to 1251.
    - `is_pass_through` — strictly "advanced on behalf of" amounts (customs duty advance, govt disbursement, port fee). Expense, no VAT.
    - `excise_pass_through` — broker-advanced excise. Expense, no VAT.
  - `vat_amount_thb numeric(14,2) DEFAULT 0` — for `service_with_vat_pct`: the VAT amount. Zero for other treatments.
  - `expense_account_id uuid` — for `is_pass_through` / `service_with_vat_pct` / `service_with_vat_zero` / `service_vat_exempt`: the GL account to debit. Null for `is_import_vat` (always 1251).
  - **VAT period override (round-5 critical fix):**
    - `vat_period_override text` — YYYY-MM. **Required for `vat_treatment='is_import_vat'` lines.** Set automatically to `imports.customs_clearance_date` truncated to month, NOT the broker invoice date. Per `vat-info.md` §2.2 + §5.1: import VAT is recoverable in the month of customs clearance regardless of when the broker bill arrives.
    - For other vat_treatments: null (uses the source document's normal VAT period).
    - `buildInputTaxReport` (Phase 10) reads this override field for `is_import_vat` lines. Without it, late-arriving broker bills push import VAT into the wrong PP 30 — silent wrong-number bug.
    - **Late broker bill within 6-month window (`vat-info.md` §82/3 + §96):** if the broker bill arrives after the original PP 30 was filed but within 6 months of customs clearance, owner can claim in any PP 30 within the window. UI offers two paths:
      - (a) "Claim in original month" → triggers period unlock + PP 30 ก amendment workflow per period-lock-protocol.
      - (b) "Claim in current month" → set `vat_period_override` to the current open VAT month; capture `late_claim_reason` + "within 6-month window per §82/3" audit note.
  - `late_claim_reason text` — populated when (b) is chosen.
  - `notes text`
  - Index on `(import_id, source_document_id)` for invoice-side roll-ups.
  - Index on `(import_id, vat_treatment)` for fast import-VAT roll-up.

  **Per-import unique constraint fix (round-5):**
  - **Replaced** the round-4 over-restrictive uniqueness `UNIQUE(import_id) WHERE vat_treatment='is_import_vat'` with the correct invariant:
    - `UNIQUE(import_id, source_document_id) WHERE vat_treatment='is_import_vat'` — at most ONE import-VAT line per source broker bill, but multiple broker bills per packet may each carry their own import-VAT line.
    - Cross-line aggregate consistency check at finalize: `SUM(amount_thb WHERE vat_treatment='is_import_vat') = imports.customs_assessed_import_vat_thb`. If unequal → reject finalize with the diff surfaced.

#### `import_payments` — bank-side linkage

- [ ] New table `import_payments`:
  - `id uuid PK`
  - `import_id uuid NOT NULL`
  - `bank_transaction_id uuid NOT NULL` — FK to existing `transactions`
  - `payment_role text NOT NULL` — `foreign_supplier_payment`, `broker_settlement`, `shipper_settlement`, `customs_direct_payment`
  - `amount_thb numeric(14,2) NOT NULL`
  - Index on `(import_id, payment_role)` for "have we paid the broker yet" queries.

### Posting engine

The imports module emits multiple JEs at finalize time, all coordinated through one logical "import finalize" event. All go through `posting_outbox` per Phase 10.5 hardening (async; never blocks finalize).

#### Foreign-supplier-invoice JE (when supplier invoice confirmed)

```
Dr  1160 Inventory                    [SUM(import_goods_lines.goods_value_thb)]
    Cr  2110 AP — foreign supplier        [SUM(import_goods_lines.goods_value_thb)]
```

This is the inventory recognition. Goods value only. Mirrors a normal AP recognition for a domestic purchase. Phase 10.6-inventory-cogs-imports also emits `inventory_movements` rows at `unit_cost_thb = unit_price_original × fx_rate_at_clearance`.

#### Customs declaration JE (when customs declaration confirmed)

```
Dr  5150 Customs duty (expense)       [customs_assessed_duty_thb]
Dr  5151 Import excise and government charges [customs_assessed_excise_thb]
Dr  1251 Input VAT recoverable        [customs_assessed_import_vat_thb]
    Cr  2190 Other current liabilities [customs_assessed_duty_thb + customs_assessed_excise_thb + customs_assessed_import_vat_thb]
```

The credit is to an accrued-customs liability that gets cleared when the broker bill (which includes these advances) is recognized. Alternative: skip this JE entirely and let the broker bill's `is_pass_through` / `is_import_vat` lines absorb the customs side. **Recommended path: skip the standalone customs JE; let broker invoices be the canonical posting source.** Reasoning: in practice, the broker advances the duty + VAT to customs and then bills the importer. The customs-declaration document is informational — the cash flow is via the broker. Captures cleaner audit trail.

#### Broker invoice JE (per broker invoice; one JE per source_document_id)

```
For each charge line on the invoice:
  IF vat_treatment = 'service_with_vat_pct':
    Dr  <expense_account_id>            [amount_thb]
    Dr  1251 Input VAT recoverable      [vat_amount_thb]
  IF vat_treatment = 'is_import_vat':
    Dr  1251 Input VAT recoverable      [amount_thb]
  IF vat_treatment = 'is_pass_through' OR 'excise_pass_through':
    Dr  <expense_account_id>            [amount_thb]

Cr  2110 AP — broker / shipper          [SUM of all line amount_thb + service vat_amount_thb]
```

The same JE shape is used for UPS / FedEx / customs broker / freight forwarder invoices — only the line composition differs. This is the **mixed-treatment** core requirement.

#### Bank settlement JE (when broker payment hits bank)

```
Dr  2110 AP — broker / shipper        [import_payments.amount_thb]
    Cr  1111 Bank                         [import_payments.amount_thb]
```

Standard AP settlement, nothing import-specific. Reconciliation links via existing matcher.

### Worked example — UPS bill ฿18,640

UPS sends a single invoice for an import. Lines:

| Line | Amount | VAT treatment | Expense account |
|---|---|---|---|
| Customs declaration fee | ฿500 | `service_with_vat_pct`, vat=฿35 | 5160 Inbound freight & brokerage |
| Brokerage handling | ฿1,500 | `service_with_vat_pct`, vat=฿105 | 5160 Inbound freight & brokerage |
| Customs duty | ฿2,000 | `is_pass_through` | 5150 Customs duty |
| Import VAT | ฿14,000 | `is_import_vat` | (1251) |
| Disbursement (port fee) | ฿500 | `is_pass_through` | 5160 Inbound freight & brokerage |
| **Subtotal of line amounts** | **฿18,500** | | |
| **+ Service VAT (35+105)** | **฿140** | | |
| **Total invoice** | **฿18,640** | | |

Posted JE for this single broker invoice:

```
Dr  5160 Inbound freight & brokerage     2,500.00     -- 500 + 1,500 + 500
Dr  5150 Customs duty                    2,000.00
Dr  1251 Input VAT recoverable          14,140.00     -- 14,000 import VAT + 140 service VAT
    Cr  2110 AP — UPS                                  18,640.00
```

Balanced: 18,640 = 18,640. Inventory unchanged (goods JE separate from supplier invoice). P&L expensed: 4,500 (brokerage + duty + port). Recoverable VAT recognized: 14,140.

### UI

- [ ] `src/app/(app)/imports/page.tsx` — import list with status (`open`, `finalized`).
- [ ] `src/app/(app)/imports/new/page.tsx` — start a new import packet:
  1. Select foreign supplier (existing vendor or create new).
  2. Upload foreign supplier invoice (AI extracts goods + values + currency).
  3. Upload customs declaration (AI extracts CIF + duty + import VAT + customs ref).
  4. Add SKU lines (review extracted, fill quantity / unit price). Map to existing SKUs or create new.
  5. Save as `open` packet.
- [ ] `src/app/(app)/imports/[id]/page.tsx` — packet detail view:
  - Foreign supplier invoice card (totals, FX rate, link to source doc).
  - Customs declaration card (CIF, duty, import VAT, link to source doc).
  - Goods lines table (SKU × qty × unit price × THB value).
  - Broker / shipper invoices section (each invoice = one card with mixed-treatment line breakdown):
    - Add invoice → upload doc → AI extracts lines → user classifies each line's `vat_treatment` (radio buttons: service+VAT / pass-through / IS the VAT / excise pass-through).
    - Inline preview of resulting JE.
  - Payments section — link existing bank transactions to roles (foreign supplier / broker / etc.).
  - Finalize button (only when foreign invoice + customs decl + at least one broker invoice are linked, and all packet lines are classified). Posts all JEs to outbox; emits `inventory_movements`.
  - **Pre-finalize period-lock guard (round-5):** before finalize, check `period_locks` for `(org_id, establishment_id, 'vat', customs_clearance_year, customs_clearance_month)`. If locked: block direct finalize and surface the **amendment workflow path** — owner must (a) acknowledge PP 30 ก amendment is required, (b) review surcharge/penalty estimate, (c) trigger unlock + re-lock per period-lock-protocol. This matches the same pattern Phase 10 uses for late-arriving sales transactions in locked VAT periods.
- [ ] `src/app/(app)/imports/[id]/audit-trail.tsx` — show every linked document + every payment + every JE in chronological order. The "paper trail" view.

### Reports

- [ ] **Import register** — every finalized import with totals (CIF, duty, VAT, broker fees, total period cost). Useful for tax-audit support.
- [ ] **Per-import margin trace** — for each SKU sold from an import: revenue per unit − goods unit cost (no overhead allocated). Surfaces the round-4 simplification's impact: margin shown does NOT include period overhead from the import.
- [ ] **Open imports aging** — packets in `open` status with foreign supplier invoice received but no broker bills yet → SLA breach alert.

## Approach

### Sequencing (3 weeks, ships after Phase 10.5)

**Week 1 — Schema + base UI**
1. Migrations for `imports`, `import_documents`, `import_goods_lines`, `import_charge_lines`, `import_payments`.
2. Read-only imports list page.
3. New-packet wizard skeleton (steps 1-3: supplier + foreign invoice + customs declaration).

**Week 2 — Mixed-treatment line classification**
1. Broker invoice upload + AI line extraction.
2. Per-line `vat_treatment` classifier UI (radio buttons + expense-account picker).
3. JE preview component (live render of the JE that finalize will post).
4. Default expense-account suggestions per common line description (heuristic).

**Week 3 — Finalize + posting + Lumera dogfood**
1. Finalize action: emit foreign-supplier JE + per-broker-invoice JEs to `posting_outbox`.
2. Inventory movement emission (consumed by Phase 10.6-inventory).
3. Payment linkage UI.
4. Audit-trail page.
5. Run with Lumera's existing Japan imports as dogfood; iterate.

### Dependencies

- **Phase 10.5 (GL primitives)** — must ship first. JE posting via `posting_outbox`; expense accounts seeded.
- **Phase 10.6b inventory/COGS** — downstream plan; consumes finalized import outputs and resulting `inventory_movements` from this plan.
- **Phase 9 hardening** — not a blocker for import mechanics. Foreign vendor concept and manual PND.54 treatment are handled there when relevant.

## Critical files

- `src/lib/db/queries/imports.ts`
- `src/lib/db/queries/import-charge-lines.ts`
- `src/lib/db/queries/import-payments.ts`
- `src/lib/imports/import-finalize.ts` — orchestrates JE emission to outbox
- `src/lib/imports/charge-line-classifier.ts` — heuristics + AI suggestions for `vat_treatment`
- `src/lib/imports/audit-trail.ts` — paper-trail query
- `src/app/(app)/imports/**`

## Verification

- [ ] Worked example: ฿18,640 UPS bill posts the exact JE above; balanced; inventory untouched.
- [ ] Finalize a Lumera Japan import end-to-end: foreign supplier invoice + customs declaration + UPS bill + bank payments all linked → `inventory_movements` lands → SKU `current_avg_cost` correctly reflects goods-value-only.
- [ ] Audit trail page shows all 4-6 linked documents + their roles + every JE + every payment in time order.
- [ ] §87 input tax report includes the broker invoice's recoverable VAT (1251) for the correct VAT period (`customs_clearance_date`).
- [ ] Period-lock trigger: attempting to edit a finalized import in a locked VAT period raises Postgres exception (per period-lock-protocol §"Source tables").
- [ ] Reverse a finalized import (rare, but for genuine errors): generates reversal JEs per the soft-delete reversal date rule (open period default; locked period via amendment workflow).

## Risks

- **Owner classification fatigue.** Each broker line needs a `vat_treatment` choice. Mitigate: AI-suggested default + heuristics from line description ("Customs duty" → `is_pass_through`, "Import VAT" → `is_import_vat`, etc.). Owner only intervenes on edge cases.
- **Mid-classification packet abandonment.** Owner starts a packet, doesn't finish. v1: list shows `open` packets; remind cron after 7 days.
- **Customs declaration vs broker bill double-counting.** Both surface duty + import VAT. Recommended posting path is broker-only (customs decl is informational). Defense (round-5 corrected): finalize-time aggregate check `SUM(import_charge_lines.amount_thb WHERE vat_treatment='is_import_vat') == imports.customs_assessed_import_vat_thb`. If user enters duty/VAT both on customs decl AND broker bill, the aggregate check catches the double-count.
- **Multi-currency broker bills.** UPS bills in THB always. FedEx may bill in USD. Round-5: `import_charge_lines` carries multi-currency capture (`original_currency`, `original_amount`, `fx_rate_applied`, `fx_source`, `fx_date`) per line; THB amount is derived. Phase 14 FX revaluation reads original-currency fields when remeasuring outstanding broker AP.

## Open questions

- **Direct-clear customs (no broker) — v1 path (round-5).** Owner clears at customs themselves; no broker bill exists. Without a broker invoice as the JE source, the v3 plan blocked finalize. Round-5 fix: the **customs declaration document** becomes the canonical posting source when there is no broker invoice. The customs declaration JE template (originally specified at "Customs declaration JE" then deprecated) is **reactivated** for the direct-clear path:
  ```
  Dr  5150 Customs duty                     [customs_assessed_duty_thb]
  Dr  5151 Import excise and government charges [customs_assessed_excise_thb]
  Dr  1251 Input VAT recoverable            [customs_assessed_import_vat_thb] -- vat_period_override = customs_clearance_date
      Cr  1111 Bank                             [customs_assessed_*]   -- when paid same day
      OR Cr 2190 Other current liabilities      [customs_assessed_*]   -- when not yet paid
  ```
  When ANY broker invoice is later linked to the same `import_id`, the engine reverses the standalone customs JE and re-posts via the broker-canonical path to avoid double-count. The aggregate consistency check at finalize ensures the import VAT only lands once regardless of path.
- **Inventory cost without goods invoice?** If goods arrive but supplier invoice is delayed: estimate or block? v1 = block finalize (must have invoice).
- **Partial shipments under one customs declaration?** Sometimes a single declaration covers two arrivals. v1 = one packet per declaration; user creates separate packets if a single declaration spans two physical events.
