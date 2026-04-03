# TODOs

## P1 — Data Integrity

- **Add rate-limit lock for manual AI trigger** — `triggerAiBatchAction` checks `max(createdAt)` from `ai_match_suggestions`, which returns NULL when zero suggestions exist (letting the rate limit pass). Concurrent requests also race past the check. **Fix:** Use a DB advisory lock or a dedicated `ai_batch_runs` table that records every trigger attempt regardless of output. Found by Codex review 2026-04-03.
- **Add amount validation to `createManualMatchAction`** — Client-supplied `amounts` dict has no Zod validation: values could be negative, exceed transaction amount, or be malformed strings. `rejectAndRematchAction` already validates with `numericAmount` regex but `createManualMatchAction` skips it. **Fix:** Add same `z.string().regex(/^\d+(\.\d{1,2})?$/)` validation + bounds check against transaction amount. Found by Codex review 2026-04-03.

## P2 — Auth & Multi-tenancy

(No open items.)

## Completed (2026-03-19 session)

- ~~**Handle NULL external_ref in txn_dedup**~~ — Resolved. Investigation confirmed no parser can produce NULL `external_ref` (TypeScript types enforce `externalRef: string`, and all three parsers always generate refs). Added defensive safety net in `importTransactions()` that computes a deterministic SHA256 hash fallback if `externalRef` is ever falsy. Extracted `generateTransactionRef()` as a shared utility in `csv-parser.ts`.
- ~~**Scope org access to user membership**~~ — Done. Clerk auth added (`@clerk/nextjs`), `orgMemberships` junction table, `getOrganizationsByUserId()`, `getVerifiedOrgId()` on all mutations, `actorId` in audit logs, UserButton in sidebar. Migration: `drizzle/0006_strange_gargoyle.sql`.

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
