# Period Lock Protocol — Shared Cross-Cutting Primitive

**Status:** Active reference
**Created:** 2026-04-26 after round-3 review found three different lock primitives across plans
**Applies to:** All filing tables, the GL, and every source table that feeds filed numbers. See the full trigger list under "Single trigger function" below — round-4 review found that source-table coverage was the biggest gap, so the canonical list now includes `documents`, `sales_transactions`, `processor_settlements`, `inventory_movements`, `imports`, `cash_deposits`, and `pay_slips` in addition to filing tables.

## Problem this solves

Round-3 review found three different period-lock concepts in the active plans:
- `today-gap-remediation.md` P0-3: trigger on `vat_records` + `wht_monthly_filings` with session var `unlock_authorized_by_user_id`
- `phase-10-pos-and-cash-flow.md`: per-org `pp30_data_source` flag with `period_locked` boolean
- `phase-10-5-gl-primitives.md`: `gl_period_locks` table with session var `gl_lock_override_user_id`

All three correctly identify the same need (immutable closed periods with audited unlock path) but implement it differently. They will collide when settling PP 30 (VAT lock + GL lock + WHT lock all fire).

This document is the canonical specification. **Every plan that touches period locking must reference and conform to this protocol.**

## The single primitive

### Schema

- [ ] One table: `period_locks` — replaces every plan-specific lock table.
  ```
  id uuid PK
  org_id uuid NOT NULL
  establishment_id uuid           -- null = org-wide; set = branch-scoped
  domain text NOT NULL            -- 'vat', 'wht', 'gl', 'payroll', 'cit', 'sso'
  period_year integer NOT NULL
  period_month integer            -- null for annual (CIT, PND.1 Kor)
  locked_at timestamptz NOT NULL
  locked_by_user_id text NOT NULL
  lock_reason text NOT NULL       -- 'routine_close', 'vat_filed', 'cit_filed', 'audit_in_progress'
  unlocked_at timestamptz
  unlocked_by_user_id text
  unlock_reason text
  created_at, updated_at
  ```
  - Active-lock uniqueness via partial unique **index** (table-level UNIQUE constraint cannot reference COALESCE expressions):
    ```sql
    CREATE UNIQUE INDEX period_locks_active_uniq
      ON period_locks (
        org_id,
        COALESCE(establishment_id, '00000000-0000-0000-0000-000000000000'::uuid),
        domain,
        period_year,
        COALESCE(period_month, 0)
      )
      WHERE unlocked_at IS NULL;
    ```
  - Index on `(org_id, domain, period_year, period_month)` for fast lookup.

### Single trigger function

- [ ] One Postgres function `check_period_lock(p_org_id, p_establishment_id, p_domain, p_period_year, p_period_month)`:
  - Returns true if locked AND no override session var set; raises exception.
  - Session var: `app.lock_override_user_id` — single canonical name. Set via `SET LOCAL app.lock_override_user_id = '<clerk_user_id>'` from server actions that are explicitly performing an authorized unlock.
- [ ] Apply via BEFORE INSERT/UPDATE/DELETE triggers on every table with period semantics. Mutations on locked periods raise an exception unless `app.lock_override_user_id` is set in the transaction.

  **Filing tables (domain matches the form):**
  - `vat_records` — domain `vat`
  - `wht_certificates` (issuance) — domain `wht`, period from `payment_date`
  - `pnd_filings` — domain `wht` (or `payroll` for PND.1 / PND.1 Kor)
  - `sso_filings` — domain `payroll`
  - `cit_filings` — domain `cit`

  **Sub-ledger / GL tables:**
  - `journal_entries` — domain `gl` (period from `entry_date`)
  - `journal_lines` — inherits from parent JE; trigger blocks UPDATE/DELETE on lines whose JE falls in a locked GL period
  - `pay_runs` — domain `payroll`
  - `pay_slips` — domain `payroll` (period from parent pay_run)
  - `depreciation_schedule` — domain `gl` (depreciation runs are GL-side)

  **Source tables that feed filed numbers (CRITICAL — round-4 found these missing):**
  - `documents` — domain `vat` (period from `vat_period` or `issue_date`); blocks edits to documents whose VAT period is locked. Status transitions to `void`/`amended` allowed only via amendment workflow.
  - `sales_transactions` — domain `vat` (period from `sold_at`); also domain `gl` if GL period for that month is locked
  - `processor_settlements` — domain `vat` (period from `settled_at`); processor fee TI dates can drag a settlement into a locked VAT period
  - `inventory_movements` — domain `gl` (period from `movement_date`); inventory directly affects COGS in P&L
  - `imports` — domain `vat` + `gl` (period from `customs_clearance_date`); finalize after lock requires unlock
  - `cash_deposits` — domain `gl` (period from `deposit_date`); deposit reconciliation feeds bank ledger

- [ ] Trigger function looks up `period_locks` for the relevant `(org_id, establishment_id, domain, period_year, period_month)`. If found and not unlocked: raise exception unless override session var matches a user with elevated permission.

- [ ] **Mutations vs reads:** triggers fire on INSERT/UPDATE/DELETE only. Reads are always permitted (audit, reporting, amendment computation all need to read locked periods).

### Server-action contract

- [ ] All server actions that close periods must:
  1. Verify pre-close validations (sub-ledger ties, etc. — domain-specific).
  2. Insert `period_locks` row with appropriate `domain` + `lock_reason`.
  3. Audit log entry.
- [ ] All server actions that unlock must:
  1. Validate user has permission (manager / accountant role).
  2. Set `app.lock_override_user_id` for the transaction.
  3. Update existing `period_locks` row (set `unlocked_at`, `unlocked_by_user_id`, `unlock_reason`).
  4. Audit log entry with full context (what's being unlocked, why).
  5. After making period-locked changes, optionally re-lock (insert new `period_locks` row) or leave open for further amendment work.

### Domain interaction matrix

When are locks placed across domains for the same period?

| Workflow | VAT lock | WHT lock | GL lock | Payroll lock | CIT lock |
|---|---|---|---|---|---|
| PP 30 filed | ✓ | | | | |
| PND.x filed | | ✓ | | | |
| PND.1 / SSO filed | | | | ✓ | |
| Period close (GL) | | | ✓ | | |
| Annual close | ✓ | ✓ | ✓ | ✓ | ✓ |

GL lock typically follows VAT/WHT/payroll locks (you can't close GL until sub-ledgers are closed). CIT lock applies only at annual filing; semi-annual PND.51 prepayment doesn't lock the year.

### Amendment workflow uses unlock + re-lock

To amend a filed PP 30:
1. Owner / accountant initiates `amendPeriodFiling(orgId, period, domain, reason)`.
2. System sets `app.lock_override_user_id`.
3. System creates new filing row with `is_amendment=true, amends_filing_id=<original>`.
4. System updates `period_locks.unlocked_at` for that domain × period.
5. Amendment posted (may trigger GL reversal + new posting via Phase 10.5).
6. On submission of amendment: system inserts new `period_locks` row to re-lock.
7. Audit log captures the entire flow with timestamps.

### Migration plan

This protocol replaces the lock primitives in:
- `today-gap-remediation.md` P0-3: re-spec to use `period_locks` shared table instead of per-table session var.
- `phase-10-pos-and-cash-flow.md`: `pp30_data_source` cutover uses `period_locks` rows for VAT.
- `phase-10-5-gl-primitives.md`: drop `gl_period_locks`; references `period_locks` filtering on `domain='gl'`.

### Anti-patterns to avoid

- **Don't** add a `period_locked` boolean to filing tables. Source of truth is `period_locks`. Filings can have a derived/cached `is_period_locked` view if performance demands.
- **Don't** create domain-specific lock tables. The domain is a column.
- **Don't** allow application-layer-only enforcement. The Postgres trigger is the canonical guard. App-layer checks are belt-and-braces UX, not security.
- **Don't** reset locks on filing void. Voiding a filing is itself an amendment — same workflow.
