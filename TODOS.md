# TODOs

## P1 — Data Integrity

### Handle NULL external_ref in txn_dedup
The `txn_dedup` partial unique index uses `external_ref` as a dedup key. In Postgres, NULLs are distinct in unique indexes — so transactions with NULL `external_ref` are never treated as duplicates. If a future parser (e.g., generic CSV without reference numbers) produces NULL refs, uploading the same file twice would double-import those transactions.

**Fix:** Add a COALESCE or generated column that produces a deterministic hash (e.g., SHA256 of date|description|amount) when `external_ref` is NULL. Alternatively, make `external_ref` NOT NULL with the hash as default.

**Investigate first:** Which parsers can produce NULL `external_ref`? Currently KBank CSV and PDF parsers always generate refs. The generic CSV parser (`csv-parser.ts:47`) generates a SHA256 hash fallback, so this may already be handled — but verify edge cases.

**Depends on:** Nothing. **Blocked by:** Nothing.

## P2 — Auth & Multi-tenancy

### Scope org access to user membership
`getAllOrganizations()` in `src/lib/db/queries/organizations.ts` returns every non-deleted org in the system. The org switcher uses this, meaning any user can see and switch to any org. For multi-tenant SaaS, users should only see orgs they belong to.

**Fix:** When auth layer is added, replace with `getOrgsByUser(userId)` that joins through user-org membership. The `users` table already has `orgId`, but a proper many-to-many membership table may be needed for users belonging to multiple orgs.

**Depends on:** Auth phase implementation. **Blocked by:** No auth layer yet.

## Completed (2026-03-18 session)

All items below were completed during the Phase 0–6 implementation session.

- ~~**Wire up audit_log for all mutations**~~ — Done. `auditMutation` helper at `src/lib/db/helpers/audit-log.ts`, integrated with document confirm/reject, vendor CRUD, statement deletion, and all Phase 4+ mutations.
- ~~**Run Phase 0 validation sprint**~~ — Done. V2 (DBD API, no auth), V4 (React-PDF Thai), V5 (OpenRouter 3 models). All pass. Results in `phase-0-validation.md`.
- ~~**Add cross-tenant isolation integration test**~~ — Done. 28 tests at `src/lib/db/queries/org-isolation.db.test.ts`.
- ~~**Create withOrgScope query helper**~~ — Done. `orgScope()` and `orgScopeAlive()` at `src/lib/db/helpers/org-scope.ts`. Used across all query files.
- ~~**Add error classification to Phase 3 AI pipeline steps**~~ — Done. Retryable vs terminal classification in `process-document.ts`. Budget guard ($0.50/doc).
- ~~**Fix floating-point amount parsing in KBank parser**~~ — Done. `parseKBankAmount` returns string, no `parseFloat`. Operator precedence bug fixed.
- ~~**Add idempotency guards to mutation server actions**~~ — Done. `confirmDocumentAction` checks for existing payment/cert before creating.
- ~~**Handle ambiguous reconciliation matches**~~ — Done. Returns `type: 'ambiguous'` with all candidates, flags for manual review.
- ~~**Update plan status fields**~~ — Done. All phase docs updated with current status.
