# Thai Accounting Platform — Roadmap & Next Steps

**Status:** Active
**Created:** 2026-03-18 (post CEO review)
**Last updated:** 2026-03-18

## Current Position

```
  COMPLETE               IN PROGRESS             UPCOMING
  ─────────              ───────────             ────────
  Phase 1a: Infra        Phase 2: Bank (~80%)    Phase 0: Validation (V2,V4,V5)
  Phase 1b: App Shell    Phase 3: Scaffolding    Phase 3: AI Pipeline (full)
  Schema (all tables)    P1 Safety Fixes         Phase 4: Reconciliation
                                                 Phase 5: WHT & Tax
                                                 Phase 6: VAT & Reporting
```

## Execution Sequence

### Sprint 1: Safety & Foundations (current)

These P1 items from the CEO review unblock everything else. They can run in parallel.

| # | Item | Effort | Status | Depends on |
|---|------|--------|--------|------------|
| 1.1 | Create `withOrgScope` query helper | S | Pending | — |
| 1.2 | Fix float parsing in KBank parser + operator precedence bug | S | Pending | — |
| 1.3 | Add cross-tenant isolation integration test | S | Pending | 1.1 |

**Exit criteria:** `withOrgScope` exists, KBank parser uses string amounts, isolation test passes.

### Sprint 2: Phase 0 Validation (blocks Phase 3+)

Run the three critical validations that were skipped. Results determine whether the plan needs revision.

| # | Validation | What | Blocks |
|---|-----------|------|--------|
| 2.1 | V2: DBD Open API | Test endpoint, document auth/rate limits/schema | Phase 3 Step 5 (vendor lookup) |
| 2.2 | V4: React-PDF Thai fonts | Build PoC 50 Tawi cert with Sarabun | Phase 5 (certificate generation) |
| 2.3 | V5: OpenRouter vision models | Test 3 models on Thai invoice extraction | Phase 3 Step 3 (AI extraction) |

**If V2 fails:** Phase 3 vendor lookup falls back to OpenCorporates only. Plan revision: remove DBD dependency.
**If V4 fails:** Phase 5 needs alternative PDF generator (puppeteer-based HTML→PDF). Significant pivot.
**If V5 fails:** Phase 3 AI pipeline needs different model provider or lower accuracy thresholds. Moderate pivot.

**Exit criteria:** All 3 validations documented with pass/fail. Plan revised if any fail.

### Sprint 3: Complete Phase 2

Audit (2026-03-18) found 6/8 checkpoint items passing. Phase 2 is ~85% complete.

**Already done:** Bank account CRUD, KBank CSV/PDF parsers, generic CSV parser + column mapping UI, transaction storage with dedup (partial unique index), transaction table with TanStack Table + sort/filter/search, CSV export, reconciliation status column, vendor CRUD with dedup, balance validation (warns but doesn't block).

| # | Remaining Item | Status | Effort |
|---|---------------|--------|--------|
| 3.1 | Wire cursor-based pagination to transaction table UI (backend exists at `queries/transactions.ts:79-134`, UI uses offset) | Checkpoint FAIL | S |
| 3.2 | Generic CSV parser tests (parser + column mapping UI exist, no tests) | Missing | S |
| 3.3 | AI fallback parser for unknown bank statement formats (infra ready at `src/lib/ai/`, no parser) | Not built | M |
| 3.4 | Balance validation unit tests (logic at `upload/actions.ts:263-274`, no tests) | Missing | S |
| 3.5 | Vendor CRUD integration tests (dedup constraint exists, no dedicated test suite) | Missing | S |
| 3.6 | E2E tests (Playwright) — defer to after Phase 3 when more flows exist | Deferred | L |

**Exit criteria:** Checkpoint items 5 (cursor pagination) and 7-8 (tests) pass. Items 3.3 and 3.6 can be deferred.

### Sprint 4: Phase 3 — Documents & AI Extraction

The core value proposition. Build the full 7-step Inngest pipeline with error classification.

**Key deliverables:**
1. Document upload flow (multi-image per document)
2. Mobile /capture route
3. Blob storage integration
4. AI extraction pipeline (7 Inngest steps) with error classification:
   - Retryable errors → let Inngest retry
   - Terminal errors → set pipeline_status to failed_*, stop
   - Needs-user-action → flag needs_review
5. Review UI (side-by-side: images + extracted data)
6. Model benchmark harness
7. All Phase 3 tests

**Depends on:** Sprint 2 (V5 confirms model choice), Sprint 3 (Phase 2 vendor CRUD complete)

**Exit criteria:** All items from Phase 3 checkpoint pass.

### Sprint 5: Phase 4 — Reconciliation

Post-review triggers, matching engine, manual reconciliation UI, audit log middleware.

**Key additions from CEO review:**
- Idempotent server actions on all mutations (double-click protection)
- Ambiguous match handling (flag for manual review, don't auto-pick)
- Audit log middleware (deferred from Phase 1 — now workflows are stable)

**Depends on:** Sprint 4 (confirmed documents exist to reconcile)

### Sprint 6: Phase 5 — WHT & Tax

50 Tawi certificate generation, PND filing prep, period locking, RD e-Filing CSV export.

**Depends on:** Sprint 2 (V4 confirms React-PDF Thai), Sprint 5 (payments populated)

### Sprint 7: Phase 6 — VAT & Reporting

PP 30, PP 36, VAT register, FlowAccount/Peak export, dashboard.

**Depends on:** Sprint 6 (WHT certificates and filing calendar exist)

## Dependency Graph

```
Sprint 1 (Safety) ──────────┐
                             ├──▶ Sprint 3 (Phase 2) ──┐
Sprint 2 (Validation) ──────┤                          ├──▶ Sprint 4 (Phase 3) ──▶ Sprint 5 (Phase 4) ──▶ Sprint 6 (Phase 5) ──▶ Sprint 7 (Phase 6)
                             │                          │
                             └──────────────────────────┘
```

Sprints 1 and 2 can run in parallel. Sprint 3 needs Sprint 1 (withOrgScope). Sprint 4 needs both Sprint 2 (validation results) and Sprint 3 (Phase 2 complete).

## Review Findings Integrated

The CEO review (2026-03-18, HOLD SCOPE mode) identified 7 CRITICAL gaps. These are wired into the sprints above:

| Finding | Integrated into |
|---------|----------------|
| Phase 0 skipped | Sprint 2 |
| No org isolation enforcement | Sprint 1 (withOrgScope + isolation test) |
| 11 unspecified AI pipeline error paths | Sprint 4 (error classification requirement) |
| Float parsing in KBank parser | Sprint 1 |
| Double-click / idempotency gaps | Sprint 5 (Phase 4 requirement) |
| Ambiguous reconciliation matches | Sprint 5 (Phase 4 requirement) |
| Stale plan status fields | Done (updated 2026-03-18) |

Full details in [TODOS.md](../../../TODOS.md).
