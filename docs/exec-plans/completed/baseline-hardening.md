# Plan: Baseline Hardening Residuals

**Status:** Completed
**Created:** 2026-04-28 after adversarial baseline review
**Rewritten:** 2026-04-28 after baseline hardening v2 completion
**Owner:** Engineering + founder review
**Position:** Complete this residual pass before Phase 9 / 10 / 10.5 implementation, unless a specific item is explicitly deferred with owner/accountant sign-off.

## Purpose

Baseline hardening v2 fixed the immediate correctness holes: period locks, current VAT/WHT lock enforcement, confirmation gates, PP36 base calculation, ABB input-VAT exclusion, WHT payment-date behavior, reconciliation allocation races, key permission boundaries, transactional audit support, and validation constraints.

This file now tracks only the remaining baseline-hardening work that v2 did not close. It is not the original broad hardening checklist anymore.

## Already Completed In Baseline V2

- Tenant-isolation triggers and same-org checks for current high-risk relations.
- Canonical `period_locks` table and `check_period_lock(...)` trigger function.
- Obligation-specific locks for `vat_pp30`, `vat_pp36`, `wht_pnd3`, `wht_pnd53`, and `wht_pnd54`.
- Period-lock triggers for current document, VAT record, WHT certificate, and WHT filing paths.
- Shared document confirmation workflow and confirmation validation for current required fields.
- Explicit `documents.tax_invoice_subtype`: `full_ti`, `abb`, `e_tax_invoice`, `not_a_ti`.
- ABB/not-a-TI exclusion from recoverable PP30 input VAT.
- `documents.is_pp36_subject` gate and PP36 base x Thai VAT rate calculation.
- WHT certificate creation moved out of document confirmation and tied to payment/reconciliation timing.
- Transaction-aware `auditMutation(..., tx)` support.
- Reconciliation allocation locking and payment-document consistency checks.
- Bank import org check and admin/accountant gates for sensitive actions.
- Confirmed/filed document delete guard.
- Constraint validation migration for v2 constraints.
- Verification gate passed: TypeScript, lint, unit tests, build, Drizzle check, DB tests, and diff whitespace check.

## Residual Workstreams

### 1. Tenant-Isolation Full Sweep

**Problem:** v2 added targeted same-org triggers for current high-risk paths. That is good enough to stop known defects, but the schema has grown beyond the original list. Before GL/POS/payroll/inventory expansion, we need an inventory of every org-scoped relationship and an explicit decision for each one.

**Goal:** every org-scoped child relation is protected by either:

- a composite FK to `(id, org_id)`, or
- a documented same-org trigger/check where composite FK ergonomics are poor, or
- a documented exemption for global/cross-org learning data.

**Implementation steps:**

1. Inventory all tables in `src/lib/db/schema.ts` with `org_id`.
2. Inventory every FK-like column on those tables: `*_id`, `vendor_id`, `document_id`, `transaction_id`, `payment_id`, `filing_id`, `bank_account_id`, `rule_id`, `exemplar_id`, and future-like relations.
3. Classify each relation:
   - `protected_by_fk`
   - `protected_by_same_org_trigger`
   - `protected_by_query_only`
   - `global_reference`
   - `intentional_cross_org_learning`
4. Add missing constraints/triggers only for true risk paths.
5. Add DB tests that attempt cross-org linkage for each newly protected relation.
6. Document intentional exceptions inline in the test or migration comments.

**Caution:** do not blindly add composite FKs everywhere. Drizzle and existing generated migrations may make some composite FKs noisy; same-org triggers are acceptable where they are simpler and tested.

**Exit criteria:**

- A written schema inventory exists in this plan or a linked doc.
- No unclassified org-scoped relation remains.
- Cross-org insertion/update attempts fail for all regulated data paths.

**2026-04-28 inventory result:**

| Relation group | Current protection | Classification |
|---|---|---|
| `bank_statements.bank_account_id` | same-org trigger in `0016` | `protected_by_same_org_trigger` |
| `transactions.bank_account_id`, `transactions.statement_id` | same-org triggers in `0016` | `protected_by_same_org_trigger` |
| `documents.vendor_id`, `documents.related_document_id` | same-org triggers in `0016`; related-document FK added in `0017` | `protected_by_same_org_trigger` |
| `document_line_items.document_id`, `document_files.document_id` | same-org triggers in `0016` | `protected_by_same_org_trigger` |
| `payments.document_id` | same-org trigger in `0016` | `protected_by_same_org_trigger` |
| `reconciliation_matches.transaction_id`, `document_id`, `payment_id` | same-org triggers in `0016`; allocation/payment-document guard in `0019` | `protected_by_same_org_trigger` |
| `wht_certificates.payee_vendor_id`, `filing_id` | same-org triggers in `0016` | `protected_by_same_org_trigger` |
| `wht_certificates.replacement_cert_id` | added in residual migration `0021` | `protected_by_same_org_trigger` |
| `wht_certificate_items.certificate_id`, `document_id`, `line_item_id` | same-org triggers in `0016` | `protected_by_same_org_trigger` |
| `ai_match_suggestions.transaction_id`, `document_id`, `payment_id` | same-org triggers in `0016` | `protected_by_same_org_trigger` |
| `vendor_bank_aliases.vendor_id`, `recurring_payment_patterns.vendor_id` | same-org triggers in `0016` | `protected_by_same_org_trigger` |
| `extraction_exemplars.vendor_id`, `document_id` | same-org triggers in `0016` | `protected_by_same_org_trigger` |
| `extraction_log.document_id`, `vendor_id` | same-org triggers in `0016` | `protected_by_same_org_trigger` |
| `extraction_log.exemplar_ids` | same-org trigger added in residual migration `0023` | `protected_by_same_org_trigger` |
| `extraction_review_outcome.document_id` | same-org trigger in `0016` | `protected_by_same_org_trigger` |
| `extraction_review_outcome.extraction_log_id` | added in residual migration `0021` | `protected_by_same_org_trigger` |
| `vendor_tier.vendor_id` with `scope_kind='org'` | added in residual migration `0021` | `protected_by_same_org_trigger` |
| `vendor_tier` with `scope_kind='global'` | `org_id IS NULL` enforced in residual migration `0021`; global use is design debt because it still points at an org-scoped vendor row | `intentional_cross_org_learning` |
| `period_locks.establishment_id` | nullable future reference; no `establishments` table exists yet | `future_reference_until_phase_10` |
| `org_memberships.user_id` | normal FK only | `global_identity_rbac_relation` |
| actor/reviewer fields: `documents.created_by`, `audit_log.actor_id`, `ai_match_suggestions.reviewed_by`, `ai_batch_runs.triggered_by`, `extraction_review_outcome.reviewed_by_user_id` | normal FK/text only | `actor_metadata_not_accounting_relation` |
| `audit_log.entity_id` | polymorphic UUID | `polymorphic_audit_reference` |
| global learning tables: `org_reputation`, `exemplar_consensus`, `global_exemplar_pool`, `extraction_compiled_patterns` global scope | no tenant-child relation by design | `intentional_cross_org_learning` |

**Residual notes:**

- `vendor_tier.scope_kind='global'` should probably be redesigned away from `vendor_id` and toward `vendor_key` if global tiering becomes real product behavior. Current code uses org-scoped vendor tiers; the residual migration prevents org-scoped cross-org rows without blocking legacy/global shape.
- `period_locks.establishment_id` is intentionally not constrained until Phase 10 creates the establishment/location model. When that table exists, add the FK and same-org guard in the same migration that first writes non-null establishment locks.
- `wht_certificate_items.line_item_id` is same-org protected, but it does not yet prove the line item belongs to the same `document_id` on the row. That is data-integrity hardening, not tenant isolation; keep it for a later WHT integrity pass unless it blocks current work.

### 2. Audit-Log Partitioning Design

**Problem:** `audit_log` is still a normal heap table. The roadmap expects partitioning for high-volume audit data, and converting after millions of rows is painful.

**Important constraint:** Postgres partitioned tables cannot enforce a unique or primary key that excludes the partition key. Current schema uses a shared `id uuid primary key` helper. If `audit_log` is partitioned by `created_at`, the table cannot keep `PRIMARY KEY (id)` alone. We need an explicit key/index design before writing the migration.

**Selected design:**

1. Partition key: `created_at`, monthly `RANGE` partitions.
2. Primary key: `PRIMARY KEY (id, created_at)`.
   - Reason: Postgres requires every unique/primary key on a partitioned table to include the partition key.
   - `id` remains a UUID generated by `gen_random_uuid()`, but DB uniqueness is now per `(id, created_at)`.
   - Current code does not rely on `audit_log.id` as an FK target; no inbound FK blocker was found.
3. Query indexes on the partitioned parent:
   - `(org_id, created_at DESC)`
   - `(org_id, entity_type, entity_id, created_at DESC)`
   - optional later: `(actor_id, created_at DESC)` when actor audit UI needs it.
4. Initial partition set:
   - all historical months present in `audit_log`;
   - previous month;
   - current month;
   - next 12 months.
5. Emergency default partition:
   - create `audit_log_default` as a default partition.
   - Reason: audit writes are transaction-critical; missing a future partition should not take down filings, locks, or regulated mutations.
   - Maintenance must alert if the default partition has rows; rows are moved into proper monthly partitions after creating the missing partition.
6. Drizzle impact:
   - implementation must update `src/lib/db/schema.ts` for `auditLog` so `id` is not declared via the shared primary-key helper.
   - Use an audit-specific `id: uuid("id").defaultRandom().notNull()` plus `primaryKey({ columns: [id, createdAt] })`.
   - Raw SQL migration remains the source of truth for partition DDL and partition creation.
7. Archive policy:
   - retention target remains 10 years unless legal/accountant review changes it.
   - Future archive flow: detach old monthly partition, export detached table to WORM/blob storage with manifest, verify export, then drop detached table only after retention/export policy allows.

**Exit criteria:**

- Design note in this file is updated with selected PK/index strategy. Done.
- Migration plan is reviewed before any destructive table swap.
- Rollback path is explicit in the implementation migration notes.

### 3. Audit-Log Partitioning Implementation

**Goal:** convert `audit_log` to declarative monthly partitions without losing audit rows.

**2026-04-28 implementation result:**

- Implemented in `drizzle/0022_partition_audit_log.sql`.
- `src/lib/db/schema.ts` now models `auditLog` with `PRIMARY KEY (id, created_at)` and audit-history indexes.
- Migration keeps `audit_log_old` after the table swap for rollback/verification.
- Migration creates monthly partitions for all historical months, previous month, current month, next 12 months, plus `audit_log_default`.
- Migration adds `ensure_audit_log_partition_for_month(target_month date)` and `ensure_audit_log_monthly_partitions(months_ahead integer DEFAULT 12)`.
- If default-partition rows exist for a missing month, maintenance creates a standalone monthly table, moves those default rows into it, deletes them from `audit_log_default`, then attaches the table as the proper monthly partition.
- DB tests in `src/lib/db/helpers/audit-log-partition.db.test.ts` verify monthly routing, default fallback, default-row rehoming, and bounded-query partition pruning.
- Verification passed: TypeScript, Drizzle check, diff whitespace check, and DB suite.

**Implementation steps:**

1. Preflight:
   - count existing audit rows by month;
   - check for duplicate `id` values;
   - check whether anything references `audit_log.id`.
2. Update Drizzle schema for the audit table shape:
   - remove shared `id` helper from `auditLog`;
   - define audit-specific `id uuid DEFAULT gen_random_uuid() NOT NULL`;
   - define composite PK `(id, created_at)` with Drizzle `primaryKey({ columns: [...] })`.
3. Create partitioned replacement table using selected key strategy.
   - candidate name during migration: `audit_log_new`;
   - partitioned by `RANGE (created_at)`;
   - constraints/FKs to `organizations` and `users` preserved.
4. Create partitions:
   - one partition for every historical month from preflight;
   - previous month;
   - current month;
   - next 12 months;
   - `audit_log_default`.
5. Copy existing rows into the partitioned table.
6. Verify row counts and month counts match old table.
7. Swap names inside a migration window:
   - rename old table to `audit_log_old`;
   - rename new table to `audit_log`;
   - keep `audit_log_old` until verification passes.
8. Recreate indexes on parent so they propagate:
   - `(org_id, created_at DESC)`;
   - `(org_id, entity_type, entity_id, created_at DESC)`.
   - Raw SQL migration is the source of truth for DESC index direction; Drizzle schema models the same logical indexes without direction metadata for drift checking.
9. Add helper SQL/function or scheduled job to ensure future partitions exist.
10. Add DB tests for insert routing, default-partition fallback, and partition pruning.
11. Add a post-migration cleanup task to drop `audit_log_old` only after verification and backup/export are complete.

**Verification:**

- Insert into `audit_log` routes to the expected monthly partition.
- Insert outside known partition range routes to `audit_log_default`, and maintenance can move it after creating the proper partition.
- Query by `org_id` + bounded `created_at` shows the expected monthly partition in `EXPLAIN` and excludes `audit_log_default`.
- Existing `auditMutation()` and `getAuditHistory()` behavior still passes.
- `drizzle-kit check` remains clean or has documented raw-SQL partition exceptions.

**Rollback approach:**

- Before dropping `audit_log_old`, rollback is table rename:
  - drop/rename partitioned `audit_log`;
  - rename `audit_log_old` back to `audit_log`;
  - restore original primary key/index names if needed.
- After `audit_log_old` is dropped, rollback requires restoring from backup/export. Do not drop it in the same migration that performs the swap.

### 4. Audit Metadata Gaps

**Problem:** v2 made audit writes transaction-aware for regulated mutations it touched, but the platform still lacks structured metadata for several future/regulatory workflows.

**2026-04-28 baseline implementation result:**

- Added `isAuditActorId(...)` and central `auditMutation(...)` sanitization in `src/lib/db/helpers/audit-log.ts` so audit rows only set `actor_id` when the value has DB-user UUID shape; the existing FK remains responsible for proving the row exists.
- `lockPeriod(...)` audit rows now include:
  - `actor_id` when `lockedByUserId` is a DB-user UUID;
  - `new_value.auditContext.event = 'period_lock_created'`;
  - `actorUserId`, target entity type/id, lock domain, period, and reason.
- `markPp30Filed(...)`, `markPp36Filed(...)`, and `markFilingAsFiled(...)` audit rows now include:
  - `actor_id` when the filing actor is a DB-user UUID;
  - `new_value.auditContext.event = 'filing_marked_filed'`;
  - filing type, lock domain, period, lock reason, and actor user ID.

**Assigned out of baseline:**

| Gap | Owner plan | Reason |
|---|---|---|
| VAT-period override actor/reason/timestamp | `today-gap-remediation.md` P0-2 | Requires new document override columns, DB constraint/trigger, and UI workflow. |
| Filing amendment actor/reason/RD reference | Phase 10 cross-cutting amendment primitives + `period-lock-protocol.md` | Amendment fields are planned across VAT/WHT/SSO/CIT filing tables, not just baseline. |
| WHT rate override actor/default-rate/selected-rate/rationale | `phase-9-foreign-vendor-tax.md` | Foreign WHT defaults and below-default gate belong to Phase 9 schema and payment flow. |
| Reconciliation allocation edit reason | later reconciliation review hardening | Current app has soft-delete audit context but no reason-capture UI; reason field should ship with edit/delete workflow UX. |
| PII/read-event audit | `phase-11-payroll.md` / `phase-10-pos-and-cash-flow.md` | Needs new action enum or separate access log for sensitive reads; not needed for baseline mutation audit. |

**Coordination:** if a field belongs naturally to `today-gap-remediation.md` or a later phase plan, move it there instead of duplicating it here.

**Exit criteria:**

- Each metadata gap is either implemented, moved into a specific active plan, or explicitly deferred. Done.
- No generic "audit fields later" item remains. Done.

### 5. Final Baseline Gate

**2026-04-29 result:** Passed after sub-agent adversarial review and cleanup. This residual baseline-hardening plan is implementation-complete.

Run after residual implementation:

```bash
rtk pnpm exec tsc --noEmit --incremental false
rtk pnpm lint
rtk pnpm test
rtk pnpm build
rtk pnpm exec drizzle-kit check
rtk docker compose -f docker-compose.test.yml up -d postgres
rtk pnpm test:db
rtk git diff --check
rtk docker compose -f docker-compose.test.yml down
```

**Exit criteria:**

- Tenant-isolation inventory has no unknowns. Done.
- New high-risk cross-org paths are DB-protected and tested. Done.
- Audit-log partitioning is implemented or explicitly deferred with a written reason. Done.
- Audit metadata gaps are assigned to this plan, `today-gap-remediation.md`, or a later phase. Done.
- Baseline checks pass. Done.

**Verification run on 2026-04-29:**

- `rtk pnpm exec tsc --noEmit --incremental false` passed.
- `rtk pnpm lint` passed with 27 existing warnings, 0 errors.
- `rtk pnpm test` passed: 39 files, 562 tests.
- `rtk pnpm build` passed.
- `rtk pnpm exec drizzle-kit check` passed.
- `rtk pnpm test:db` passed: 11 files, 112 tests.
- `rtk git diff --check` passed.

## Recommended Execution Order

1. Tenant-isolation full sweep.
2. Audit-log partitioning design.
3. Audit-log partitioning implementation.
4. Audit metadata gap assignment/implementation.
5. Final verification.

Do not start by coding partitioning. The partition key/primary-key decision must happen first because it changes the migration shape.
