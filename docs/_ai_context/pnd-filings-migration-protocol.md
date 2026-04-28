# pnd_filings Migration Protocol

**Status:** Active reference
**Created:** 2026-04-27 (round-4 review found referenced-but-missing)
**Applies to:** Phase 11 Week 1 — replace `wht_monthly_filings` with unified `pnd_filings`

## Why a staged migration

Today's schema has `wht_monthly_filings` covering only PND.3 / PND.53. Phase 11 introduces PND.1, PND.1 Kor, and (foreign-payment) PND.54 in the same conceptual table. The clean answer is one `pnd_filings` table with a `form_type` discriminator. But:

- Code paths read `wht_monthly_filings` today (queries, filing-deadlines, dashboards, reports).
- Direct DROP + RENAME risks a deploy interruption between schema changes and code changes leaving production unable to read or write either table.
- A failed mid-deploy state is a **money-bug class risk**: WHT certificates owe RD remittance; a broken filing pipeline can mean missed deadlines + §8.1 penalties.

This protocol enforces a four-state staged rollout where every interruption point is a working state.

## States

```
        ┌────────────────────┐    ┌────────────────────┐    ┌─────────────────────┐    ┌──────────────────┐
START → │ STATE 1            │ →  │ STATE 2            │ →  │ STATE 3             │ →  │ STATE 4          │ → DONE
        │ legacy_read        │    │ dual_write         │    │ verified_read_new   │    │ legacy_locked    │
        │                    │    │                    │    │                     │    │                  │
        │ Read & write       │    │ Read legacy.       │    │ Read pnd_filings.   │    │ Read & write     │
        │ wht_monthly_       │    │ Write to BOTH      │    │ Write to BOTH (if   │    │ pnd_filings ONLY.│
        │ filings only.      │    │ wht_monthly_       │    │ rolling back, can   │    │ wht_monthly_     │
        │                    │    │ filings + pnd_     │    │ flip back to STATE  │    │ filings frozen   │
        │ pnd_filings        │    │ filings under one  │    │ 2). Background     │    │ + read-only.     │
        │ table EXISTS but   │    │ transaction.       │    │ verification cron   │    │                  │
        │ EMPTY.             │    │ Backfill cron      │    │ runs continuously.  │    │ wht_monthly_     │
        │                    │    │ copies historical  │    │                     │    │ filings retained │
        │                    │    │ rows into          │    │                     │    │ for audit (10yr  │
        │                    │    │ pnd_filings.       │    │                     │    │ retention).      │
        └────────────────────┘    └────────────────────┘    └─────────────────────┘    └──────────────────┘
```

Each transition is gated by a feature flag in `app_config` (or environment): `pnd_filings_migration_state` ∈ `{1,2,3,4}`. Code reads the flag at request time; a single config flip switches state.

### Flag values

```
pnd_filings_migration_state = 1   -- legacy_read (default before Phase 11)
                            = 2   -- dual_write
                            = 3   -- verified_read_new
                            = 4   -- legacy_locked (terminal state)
```

## Required code paths to support every state

For STATES 2 and 3, every WRITE site (filing creation, filing update, filing delete) must:

```typescript
async function saveWhtFiling(filing: WhtFiling) {
  return db.transaction(async (tx) => {
    if (state >= 1) {
      await tx.insert(legacyWhtMonthlyFilings).values(legacyShape(filing));
    }
    if (state >= 2) {
      await tx.insert(pndFilings).values(unifiedShape(filing));
    }
    return; // both rows committed atomically OR neither
  });
}
```

For STATES 1 and 2, every READ site reads `wht_monthly_filings`. For STATES 3 and 4, every READ site reads `pnd_filings`.

A single transaction failure during dual-write rolls both rows back. Inconsistency between the two tables is impossible by construction.

## Backfill (during STATE 2)

A one-shot backfill cron copies every existing `wht_monthly_filings` row into `pnd_filings` with `form_type` derived from `legacy_form` and `legacy_wht_monthly_filing_id` preserved as FK.

```sql
INSERT INTO pnd_filings (id, org_id, form_type, ..., legacy_wht_monthly_filing_id)
SELECT
  gen_random_uuid(),
  org_id,
  CASE legacy_form WHEN 'PND.3' THEN 'pnd3' WHEN 'PND.53' THEN 'pnd53' END,
  ...,
  id
FROM wht_monthly_filings
WHERE id NOT IN (SELECT legacy_wht_monthly_filing_id FROM pnd_filings WHERE legacy_wht_monthly_filing_id IS NOT NULL)
ON CONFLICT DO NOTHING;
```

Re-runnable. Idempotent via `legacy_wht_monthly_filing_id`.

## Verification cron (STATE 2 + STATE 3)

Continuously validates dual-write parity. Per org per period:

- `legacyTotalWht = SUM(wht_monthly_filings.total_wht)` for matching key
- `unifiedTotalWht = SUM(pnd_filings.total_wht)` for matching key
- If different → alert + halt state transition + dump diff to `exception_queue`

Without this cron, a dual-write bug ships silently and the migration accepts divergence as truth.

## Transition gates

### STATE 1 → STATE 2

- [ ] `pnd_filings` schema migration applied (table exists, empty).
- [ ] All WRITE sites updated to dual-write (gated by flag `>= 2`).
- [ ] All READ sites still read legacy.
- [ ] Deploy completed.
- [ ] Flip flag → 2. Monitor: no errors on filing save.
- [ ] Run backfill cron. Wait for completion.
- [ ] Verification cron green for 7 days.

### STATE 2 → STATE 3

- [ ] All READ sites updated to read `pnd_filings` when `flag >= 3`. Tested in staging.
- [ ] Verification cron green ≥ 7 days continuously.
- [ ] Flip flag → 3. Monitor: dashboards still show correct numbers, filing list pages render correctly.
- [ ] If anything breaks: flip back to 2 (READ paths fall back to legacy). No data loss.

### STATE 3 → STATE 4

- [ ] STATE 3 stable for ≥ 30 days. (One full month of filings written via the unified path, read via the unified path, verification cron green.)
- [ ] All audit/reporting queries verified against `pnd_filings`.
- [ ] Block writes to `wht_monthly_filings` via DB trigger; allow only `audit_archive` user.
- [ ] Flip flag → 4. Single-table writes from this point forward.

## Rollback safety

| From state | Rollback target | Action |
|------------|-----------------|--------|
| 2 | 1 | Flip flag → 1. WRITE stops dual-writing; new filings only land in legacy. New `pnd_filings` rows from STATE 2 are ignored (legacy is authoritative). |
| 3 | 2 | Flip flag → 2. READ falls back to legacy. WRITE continues dual-writing. Inconsistencies that emerged in STATE 3 (writes that hit unified but not legacy) are caught by verification cron and replayed manually. |
| 4 | 3 | Hard rollback — block writes to `wht_monthly_filings` is reversed. Re-enable dual-write to legacy. Filings written in STATE 4 must be replayed into legacy by a one-shot script before flipping flag back to 3. |

STATE 4 → 3 rollback is the most risky and should be reserved for true emergencies. Once STATE 3 has been stable for 30 days, STATE 4 is generally safe.

## Mid-deploy interruption recovery

If a deploy is killed at any point during a transition (e.g. STATE 1 → STATE 2):

- The flag is still at the source state until manually flipped, so code is consistent with the previous state.
- Schema migration is idempotent (CREATE TABLE IF NOT EXISTS).
- Code changes for STATE 2 are deployed but inactive (gated by flag). Effectively a dark deploy.
- Resume by flipping the flag at any later time.

This is the core property: **transitions are a single feature-flag flip, not a multi-step deploy. Code for both states ships simultaneously and gates on the flag.**

## Cleanup (post-STATE-4 + 90 days)

Optional terminal cleanup (do not rush):

- [ ] Drop `wht_monthly_filings` write paths from code (delete dual-write branches).
- [ ] Mark `wht_monthly_filings` table as `DEPRECATED` in schema comments.
- [ ] Eventually (audit retention permitting): drop the table. **Not before 10-year retention window expires.**

## Audit log requirements

Every state transition logs an `audit_log` entry: `{type: 'pnd_filings_migration', from_state, to_state, actor_user_id, timestamp, verification_cron_status}`. Auditor-grade trail for any future investigation of mid-migration filings.
