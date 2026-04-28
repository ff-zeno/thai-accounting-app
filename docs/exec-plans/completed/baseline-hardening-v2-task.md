# Baseline Hardening v2 Task

**Status:** temporary implementation source after compact
**Created:** 2026-04-28
**Mode:** implement before Phase 9+; no commits until user asks

## Purpose

Current baseline is improved but still not robust enough for wider accounting expansion. Implement this before Phase 9/10/10.5 work resumes.

Hard rule: do not start deeper product expansion until these blockers are fixed and verified.

## Guardrails

- Do not commit.
- Do not revert unrelated dirty worktree changes.
- Use `baseline-hardening.md` plus this file as source of truth.
- Keep scope to baseline correctness, not broad refactors or housekeeping.
- Prefer DB invariants for accounting facts.
- Regulated mutations must be transactional and auditable.
- Small-business UX stays approachable, but tax/accounting truth wins over convenience.

## P0 Implementation Order

### 1. Fix PP36 computation

Current bug: `src/lib/db/queries/vat-records.ts` still computes PP36 from foreign `documents.vatAmount`, usually `0`.

Implement:
- PP36 base = THB service/royalty/professional-fee base for foreign vendors.
- PP36 VAT = base x Thai VAT rate.
- Do not use foreign invoice `vat_amount`.
- Add or use a clear `is_pp36_subject` / category gate so goods imports are excluded.
- Add tests for TikTok/Meta/AWS-style foreign service invoice with `vatAmount=0`.

Acceptance:
- Foreign service invoice THB 107,000 with `vatAmount=0` creates PP36 obligation THB 7,490.
- Domestic vendor creates no PP36.
- Goods import creates no PP36.

### 2. Make input VAT eligibility explicit

Current bug: confirmation auto-infers `full_ti` from vendor VAT status, and PP30 input VAT includes any confirmed domestic VAT-registered vendor document.

Implement:
- `tax_invoice_subtype` must be explicit for VAT-bearing expense docs.
- User/reviewer can set `full_ti`, `e_tax_invoice`, `abb`, `not_a_ti`.
- Only `full_ti` and valid `e_tax_invoice` count as recoverable PP30 input VAT.
- ABB/not-a-TI moves to pending/non-recoverable state, not PP30 claim.
- Update confirmation validator and VAT query.
- Add UI field in document review where needed.

Acceptance:
- ABB expense with VAT is confirmed but excluded from recoverable input VAT.
- Full TI/e-tax expense with required vendor fields is included.
- Missing subtype blocks VAT-bearing input claim or parks as non-recoverable by explicit choice.

### 3. Move WHT to payment event

Current bug: `confirmDocumentAction` creates payment + WHT cert from document issue date. WHT period should follow payment date.

Implement:
- Stop creating payment/WHT certificate as unconditional side effect of document confirmation.
- Create WHT certificate/draft from actual payment or reconciliation event.
- Support partial payments at least defensively: WHT base must follow paid amount or explicit payment record.
- Payment date is source for WHT period.
- Existing confirm paths should not silently create filing facts.

Acceptance:
- Confirming invoice alone creates no WHT filing obligation.
- Payment/reconciliation on 2026-04-05 creates WHT in April even if invoice issue date is March.
- WHT filing aggregation uses actual payment dates.

### 4. Unify document confirmation workflow

Current bug: sidebar/list confirm only calls `confirmDocument()`, while review confirm also creates payment/WHT/event. Same `confirmed` status can mean different state.

Implement:
- One `confirmDocumentWorkflow()` or equivalent used by all confirm entry points.
- Workflow should be transactional where it mutates multiple rows.
- Add idempotency guards and unique active constraints where needed.
- Side effects that must happen after commit should use durable outbox/event pattern, not fire-and-forget inside half-finished workflow.

Acceptance:
- All confirm buttons produce same persisted state.
- Double-click/race does not duplicate downstream rows.
- Failure mid-flow cannot leave partially confirmed accounting state.

### 5. Make filing locks atomic and obligation-specific

Current bugs:
- VAT/WHT mark-filed update and `lockPeriod()` are separate operations.
- PP36 filed does not lock relevant source period.
- WHT locks only after all forms non-draft, leaving filed form sources mutable.
- `app.lock_override_user_id` bypass is too broad.

Implement:
- Wrap file + lock in one DB transaction.
- Lock by obligation/domain precise enough for PP30, PP36, PND3, PND53, PND54.
- Define whether this is separate domains (`vat_pp30`, `vat_pp36`, `wht_pnd3`, etc.) or domain+form metadata; pick one and make triggers match.
- Add row/advisory locks for period/form filing transitions.
- Restrict lock override to audited server-side workflow; no casual session-var bypass.

Acceptance:
- If lock insert fails, filing status does not change.
- Filed PP36 prevents source mutation for relevant PP36 documents.
- Filed PND3 prevents mutating PND3 source certs even if PND53 is still draft.
- Override requires reason/actor and audit row.

### 6. Make audit transaction-aware

Current bug: `auditMutation()` uses global DB and swallows failures.

Implement:
- `auditMutation` accepts optional transaction handle.
- Regulated mutations use same transaction.
- For accounting/tax/filing/lock/reconciliation mutations, audit failure fails transaction or writes durable audit outbox in same transaction.
- Actor should be mandatory for user-initiated regulated actions where available.

Acceptance:
- Rollback does not leave phantom audit.
- Audit insert failure blocks regulated filing/lock/amendment mutation.
- Tests cover audit inside transaction.

### 7. Fix reconciliation allocation races

Current bug: app and DB trigger sum existing matches without locking; concurrent inserts can over-allocate.

Implement:
- Add row/advisory locks or serializable transaction around transaction/document/payment allocation.
- DB trigger should lock parent rows or use advisory key.
- Verify `payment_id` belongs to same `document_id` as match.

Acceptance:
- Concurrent match inserts cannot exceed transaction/document/payment cap.
- Payment from same org but different document is rejected.

### 8. Patch boundary/permission holes

Implement:
- Bank import verifies `bankAccountId` belongs to active org before statement/transaction writes.
- Admin/legal actions require admin/accountant role, not only membership:
  - org tax profile changes
  - AI settings/budget/model settings
  - reconciliation rule changes
  - VAT/WHT mark-filed/void/amendment actions
- Confirmed/filed document delete becomes blocked or void/amendment workflow.

Acceptance:
- Cross-org bank account UUID cannot be imported into active org.
- Regular member cannot file VAT/WHT or mutate org-level tax/AI/rule settings.
- Confirmed/filed docs cannot be soft-deleted into inconsistent downstream state.

### 9. Validate hardened constraints

Current caveat: migrations added many `NOT VALID` constraints.

Implement:
- Add preflight SQL/report for existing violations.
- Clean or exception-queue existing bad rows.
- Add follow-up migration with `VALIDATE CONSTRAINT` for constraints that should become fully trusted.
- Add drift/protection test for raw-SQL-managed period-lock indexes/triggers.

Acceptance:
- Constraint validation succeeds in test DB.
- Known raw SQL invariants are documented and tested.

## P1 Plan Cleanup After Code Hardening

Patch exec plans before Phase 9+ starts:

- Clean `phase-10-5-gl-primitives.md` contradictions:
  - JSON `journal_lines.dimension` kept vs dropped.
  - `posting_kind='pp30_close'` vs `vat_settlement_pp30`.
  - `exception_queue` vs `posting_exceptions`.
- Add Phase 9 Week 1 BOT FX fetcher if PP36 foreign services ships before Phase 14.
- Fix POS posting rule:
  - cash -> `1110`
  - card/QR/marketplace -> `1142`
  - voucher redemption -> `2160`
- Fix inventory true-up contradiction:
  - use per-import/per-lot landed-cost/statutory overhead component ledger.
  - remove day-1 reversal if policy says no reversal.
- Resequence Phase 15 as pre-Phase-10 nav gate or rename Phase 9.5.
- Patch Phase 12b for versioned FS/DBD packages and first-year comparative import.
- Patch COA/import plans so landed-cost components are always stored, even if owner-facing UX period-expenses them until year-end review.

## Verification Commands

Run after implementation:

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

Add focused tests for:
- PP36 foreign service base x VAT rate.
- ABB excluded from PP30 input VAT.
- Payment-date WHT period.
- Unified confirm workflow entry points.
- Atomic file+lock transaction rollback.
- Concurrent reconciliation over-allocation prevention.
- Cross-org bank import rejection.
- member vs admin filing/settings permission.
- confirmed/filed document deletion rejection.

## Exit Criteria

- No known P0 tax correctness bugs remain.
- Filing/lock/audit mutations are atomic.
- Source evidence cannot be silently hidden after filing.
- Reconciliation cannot over-allocate under concurrency.
- Tenant and role boundaries are tested.
- Verification suite green.
- Phase plans patched so next agent cannot implement stale contradictory specs.
