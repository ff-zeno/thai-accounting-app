# Round 2 Product/CTO Review — Rev 2 Plan

**Date:** 2026-03-14
**Reviewer:** Sonnet (Round 2)
**Verdict:** No critical issues. 3 important, 4 minor. Fix findings 1, 3, 6 before implementation.

---

## Findings

### 1 — IMPORTANT: Async UI state undefined after pipeline and post-confirm operations
User uploads document → pipeline runs async → no defined mechanism for UI to learn it's done. Same after confirm → WHT cert + payment + reconciliation fire async. No polling, SSE, or optimistic UI strategy specified.
**Fix:** Add async feedback strategy to Phase 3/4: optimistic UI ("Processing..." badge), poll via SWR every 5s until status stabilizes.

### 2 — MINOR: Combined payment semantics undocumented
`payments.document_id` is 1:1 but combined payments need multiple payment rows per transaction. Schema supports this but interpretation is not stated.
**Fix:** Add clarifying sentence: "One payment row per document per payment event. Combined payments produce multiple payment rows linked via reconciliation_matches."

### 3 — IMPORTANT: Phase 1 scope too large for solo developer
15 deliverables spanning infra, tooling, UI shell, and business logic. 4-6 weeks with no intermediate checkpoint.
**Fix:** Split into Phase 1a (pure infra, ~1 week) and Phase 1b (app shell, ~3-4 days) with separate completion criteria.

### 4 — MINOR: `/capture` mobile route has 4 unspecified product decisions
- (a) How does user set expense vs income? → URL param `/capture?type=expense`
- (b) "Queue uploads" implies offline — change to "upload immediately"
- (c) Post-capture destination undefined
- (d) Multi-page support on mobile undefined
**Fix:** 4 bullet points in the plan.

### 5 — MINOR: WHT sequence counter can start simpler
MAX+1 query with unique constraint is sufficient for single-user MVP. Full counter table with advisory locks is V2 multi-user concern.
**Fix:** Note in Phase 5: implement MAX+1 initially, harden only when concurrent issuance is real.

### 6 — IMPORTANT: Missing operational prerequisites
No env vars listed anywhere. Missing:
- `DATABASE_URL` vs `DATABASE_URL_UNPOOLED` (Neon pooled vs direct — migrations REQUIRE unpooled)
- `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY`
- `OPENROUTER_API_KEY`, `BLOB_READ_WRITE_TOKEN`, `SENTRY_DSN`
No seed data path/command for WHT rates. No Thai font sourcing instructions. No timezone specification (Thailand UTC+7, Vercel runs UTC — deadline calculator will be wrong without explicit `Asia/Bangkok` handling).
**Fix:** Add Environment Setup section covering all of the above.

### 7 — MINOR: Plan readability improvements
- Add phase-jump anchor table at top
- Move Unvalidated Assumptions Tracker next to Validation Sprint
- Extract WHT rate reference tables to separate file

### Bonus: `documents.amount_paid`/`balance_due` are denormalized
Must stay in sync with `payments` table. No sync mechanism specified. Either compute from payments (remove fields) or specify exactly where sync write happens.
**Fix:** Decide before Phase 4.
