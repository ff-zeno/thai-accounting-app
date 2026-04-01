# Phase 7: Learning Feedback Loop & Reconciliation Metrics

**Status:** Planned
**Dependencies:** Phase 4 (reconciliation engine, matcher, manual match UI, audit_log middleware)
**Blocked by:** None -- all infrastructure exists

> **Cross-phase note:** This plan owns the canonical approve/reject/learn server actions. `phase-7-ui-reconciliation` and `phase-7-ai-batch-matching` depend on the server actions defined here (`rejectAndRematchAction`, `approveMatchAction`). Those plans should call into these actions rather than reimplementing the flows.

## Prerequisites

| Item | Detail |
|------|--------|
| **Migration 0010: partial unique index on `recon_txn_doc`** | The unique constraint on `reconciliation_matches(transaction_id, document_id)` has been converted to a partial unique index `WHERE deleted_at IS NULL`. This allows soft-delete + re-insert of the same transaction-document pair. This migration must be applied before any Phase 7 work begins. |
| **`upsertAlias()` vendor conflict fix** | `upsertAlias()` has been fixed to update `vendor_id` and reset `matchCount` when the vendor changes on conflict. The rejection learning flow now correctly overrides wrong aliases. |

## Goal

Close the reconciliation feedback loop. When users approve or reject matches, the system learns from their decisions: growing the alias table, recording rejection patterns, and surfacing metrics on match quality. Add a metrics query layer and dashboard section so operators can see how well the engine is performing and where it needs tuning.

**Not in scope:** AI model retraining, real-time websocket updates, match quality alerts/notifications (email/Slack).

## Existing Infrastructure

| Component | Location | State |
|-----------|----------|-------|
| Vendor bank aliases | `src/lib/db/queries/vendor-aliases.ts` | `upsertAlias()` ready (with vendor-change conflict handling), auto-confirms at 3 occurrences |
| Reconciliation matches | `src/lib/db/queries/reconciliation.ts` | `createMatch()`, `updateTransactionReconStatus()`, `getReconciliationStats()` |
| AI match suggestions | `src/lib/db/queries/ai-suggestions.ts` | `rejectSuggestion()`, `approveSuggestion()`, `getPendingSuggestions()`, `getSuggestionCounts()` already implemented |
| Reconciliation rules | `src/lib/db/queries/reconciliation-rules.ts` | CRUD ready, `matchCount` tracked, `isAutoSuggested` flag |
| Audit log | `src/lib/db/helpers/audit-log.ts` | `auditMutation()` non-blocking, used in all reconciliation mutations |
| Matcher | `src/lib/reconciliation/matcher.ts` | 7-layer cascade with `MatchMetadata` (layer, signals, scores) |
| Manual match action | `src/app/(app)/reconciliation/review/actions.ts` | `createManualMatchAction()` -- no learning wired yet |
| Inngest reconciliation | `src/lib/inngest/functions/reconcile-document.ts` | Creates matches, flags ambiguous |

## Deliverables

### Phase 7a: Rejection Feedback Loop

When a user rejects a match (auto or AI-suggested) and manually selects a different transaction:

**1. Soft-delete the rejected match (inside transaction)**
- Set `deleted_at` on the existing `reconciliation_matches` row
- **Recompute** transaction status from remaining active matches (see `recomputeTransactionStatus()` below)
- Audit log entry with `action: 'delete'` and `oldValue` containing the original match

**2. Record rejection on AI suggestions (inside transaction)**
- If the rejected match originated from `ai_match_suggestions`, update:
  - `status` -> `'rejected'`
  - `reviewed_at` -> now
  - `reviewed_by` -> current user
  - `rejection_reason` -> user-provided reason (validated: `z.string().max(500).optional()`, with common presets: "wrong vendor", "wrong amount", "wrong date", "duplicate")

**3. Create the new manual match (inside transaction)**
- Call existing `createMatch()` with `matchType: 'manual'`, `matchedBy: 'manual'`
- Update new transaction's `reconciliation_status` to `'matched'`

**4. Auto-learn from correction (outside transaction, non-blocking)**
- Extract counterparty from the **newly selected** transaction
- Call `upsertAlias()` with `{ counterparty -> document's vendor, source: 'rejection_correction' }`
- Non-blocking: wrap in try/catch, log failures, never block the main rejection flow

**DB transaction requirement:** Steps 1-3 MUST be wrapped in `db.transaction()`. This ensures atomicity: soft-delete old match, update AI suggestion status, create new manual match -- all succeed or all fail. Alias learning (step 4) remains outside the transaction as it is non-critical.

**`recomputeTransactionStatus()` helper:** Do not blindly set "unmatched" on rejection. Instead, query remaining active (non-deleted) matches for the transaction:
- If any active matches exist with full coverage -> `"matched"`
- If any active matches exist with partial coverage -> `"partially_matched"`
- If no active matches remain -> `"unmatched"`

This is critical for **split match status rollback**: when rejecting one match from a split, other split matches may remain active. If yes, keep `"partially_matched"`. Only set `"unmatched"` if ALL matches are soft-deleted.

**Query function pattern:** New query functions (`softDeleteMatch`, `getMatchById`, `recomputeTransactionStatus`) should accept an optional `tx?: DbConnection` parameter so they can participate in the caller's transaction or run standalone.

**Server action:** `rejectAndRematchAction()` in `src/app/(app)/reconciliation/review/actions.ts`

**Files modified:**

| File | Change |
|------|--------|
| `src/app/(app)/reconciliation/review/actions.ts` | Add `rejectAndRematchAction()` server action |
| `src/lib/db/queries/reconciliation.ts` | Add `softDeleteMatch()`, `getMatchById()`, `recomputeTransactionStatus()` query functions (all accept optional `tx` param) |
| `src/lib/db/queries/ai-suggestions.ts` | **Modify** (file already exists): no new exports needed -- `rejectSuggestion()` already implemented. May need to add optional `tx` parameter support. |

### Phase 7b: Approval Flow

When a user approves a suggested match (auto or AI):

**1. Finalize the match**
- If match already exists in `reconciliation_matches` (auto-created during reconciliation), update `matchedBy` to confirm human review
- If from `ai_match_suggestions` only, create the `reconciliation_matches` row

**2. Update statuses**
- Transaction `reconciliation_status` -> `'matched'`
- If AI suggestion: `ai_match_suggestions.status` -> `'approved'`, set `reviewed_at` and `reviewed_by`

**3. Auto-learn from approval**
- Extract counterparty from the matched transaction
- Call `upsertAlias()` with `{ counterparty -> document's vendor, source: 'approval' }`
- Non-blocking, same pattern as rejection

**Server action:** `approveMatchAction()` in `src/app/(app)/reconciliation/review/actions.ts`

**Files modified:**

| File | Change |
|------|--------|
| `src/app/(app)/reconciliation/review/actions.ts` | Add `approveMatchAction()` server action |
| `src/lib/db/queries/reconciliation.ts` | Add `updateMatchConfirmation()` query function |
| `src/lib/db/queries/ai-suggestions.ts` | **Modify** (file already exists): `approveSuggestion()` already implemented. May need to add optional `tx` parameter support. |

### Phase 7c: Reconciliation Metrics Query Layer

Pure query functions -- no UI yet. All queries use GROUP BY at the SQL level, no in-memory aggregation.

**Migration required:** Add index for metrics layer queries:
```sql
CREATE INDEX recon_matches_layer
  ON reconciliation_matches ((match_metadata->>'layer'))
  WHERE deleted_at IS NULL;
```

**Match Rate by Layer:**

```sql
SELECT
  (match_metadata->>'layer')::text AS layer,
  COUNT(*) AS match_count,
  ROUND(COUNT(*)::numeric / SUM(COUNT(*)) OVER () * 100, 2) AS pct
FROM reconciliation_matches
WHERE org_id = ? AND deleted_at IS NULL
GROUP BY match_metadata->>'layer'
ORDER BY match_count DESC;
```

**Match Rate Trend (weekly/monthly):**

```sql
SELECT
  date_trunc('week', matched_at) AS period,
  COUNT(*) FILTER (WHERE deleted_at IS NULL) AS matches,
  COUNT(*) FILTER (WHERE match_metadata->>'layer' = 'exact' AND deleted_at IS NULL) AS exact_matches
FROM reconciliation_matches
WHERE org_id = ? AND matched_at >= ? AND matched_at < ?
GROUP BY period
ORDER BY period;
```

Note: The `exact_matches` FILTER clause must include `AND deleted_at IS NULL` to avoid counting rejected matches that were later soft-deleted.

**Time-to-Match by Type:**

```sql
SELECT
  (m.match_metadata->>'layer')::text AS match_type,
  AVG(m.matched_at - d.created_at) AS avg_time_to_match,
  COUNT(*) AS sample_size
FROM reconciliation_matches m
JOIN documents d ON d.id = m.document_id
WHERE m.org_id = ? AND m.deleted_at IS NULL
GROUP BY match_type;
```

**Alias Conflict Rate:**

```sql
SELECT
  alias_text,
  COUNT(DISTINCT vendor_id) AS vendor_count
FROM vendor_bank_aliases
WHERE org_id = ? AND deleted_at IS NULL
GROUP BY alias_text
HAVING COUNT(DISTINCT vendor_id) > 1;
```

**False-Positive Proxy:**

```sql
SELECT
  COUNT(*) FILTER (WHERE deleted_at IS NOT NULL) AS soft_deleted,
  COUNT(*) AS total,
  ROUND(
    COUNT(*) FILTER (WHERE deleted_at IS NOT NULL)::numeric /
    NULLIF(COUNT(*), 0) * 100, 2
  ) AS false_positive_pct
FROM reconciliation_matches
WHERE org_id = ? AND matched_by = 'auto';
```

**Alias Growth:**

```sql
SELECT
  COUNT(*) AS total_aliases,
  COUNT(*) FILTER (WHERE is_confirmed = true) AS confirmed_aliases,
  COUNT(*) FILTER (WHERE created_at >= date_trunc('month', now())) AS created_this_month
FROM vendor_bank_aliases
WHERE org_id = ? AND deleted_at IS NULL;
```

**Rule Effectiveness:**

```sql
SELECT
  id, name, match_count, is_active, is_auto_suggested,
  last_matched_at
FROM reconciliation_rules
WHERE org_id = ? AND deleted_at IS NULL
ORDER BY match_count DESC;
```

**AI Suggestion Metrics:**

```sql
SELECT
  COUNT(*) AS total_suggestions,
  COUNT(*) FILTER (WHERE status = 'approved') AS approved,
  COUNT(*) FILTER (WHERE status = 'rejected') AS rejected,
  COUNT(*) FILTER (WHERE status = 'pending') AS pending,
  ROUND(
    COUNT(*) FILTER (WHERE status = 'approved')::numeric /
    NULLIF(COUNT(*) FILTER (WHERE status IN ('approved', 'rejected')), 0) * 100, 2
  ) AS approval_rate,
  ROUND(AVG(confidence::numeric) FILTER (WHERE status = 'approved'), 4) AS avg_approved_confidence,
  ROUND(AVG(confidence::numeric) FILTER (WHERE status = 'rejected'), 4) AS avg_rejected_confidence
FROM ai_match_suggestions
WHERE org_id = ? AND deleted_at IS NULL;
```

**Rejection Analysis:**

```sql
-- Most rejected layers
SELECT
  (m.match_metadata->>'layer')::text AS layer,
  COUNT(*) AS rejection_count
FROM reconciliation_matches m
WHERE m.org_id = ? AND m.deleted_at IS NOT NULL
GROUP BY m.match_metadata->>'layer'
ORDER BY rejection_count DESC;

-- Common AI rejection reasons
SELECT
  rejection_reason,
  COUNT(*) AS count
FROM ai_match_suggestions
WHERE org_id = ? AND status = 'rejected' AND rejection_reason IS NOT NULL
GROUP BY rejection_reason
ORDER BY count DESC;
```

**Files created/modified:**

| File | Description |
|------|-------------|
| `src/lib/db/queries/reconciliation-metrics.ts` | All metric query functions: `getMatchRateByLayer()`, `getMatchRateTrend()`, `getTimeToMatchByType()`, `getAliasConflictRate()`, `getFalsePositiveRate()`, `getAliasGrowthMetrics()`, `getRuleEffectiveness()`, `getAiSuggestionMetrics()`, `getRejectionAnalysis()` |
| Migration file | `CREATE INDEX recon_matches_layer` on `(match_metadata->>'layer') WHERE deleted_at IS NULL` |

### Phase 7d: Metrics Dashboard Section

Add a "Reconciliation Insights" section to the existing reconciliation dashboard page.

**Layout:**
- Summary cards row: overall match rate, alias count, AI approval rate, active rules
- Match distribution chart: horizontal bar chart showing matches per layer (use existing Tailwind-based bar rendering, no chart library)
- Match trend: simple table with weekly match counts (chart library deferred)
- Rule effectiveness table: rule name, match count, last matched, active/inactive toggle
- AI suggestion stats: approved/rejected/pending counts with approval rate
- Top rejection reasons: simple list
- Time-to-match by type: table showing average resolution time per match layer
- False-positive rate: single metric card for auto-match false-positive percentage
- Alias conflict alert: count of alias texts mapped to multiple vendors

**Server action:** `getReconciliationInsightsAction()` in `src/app/(app)/reconciliation/actions.ts`

**Files modified/created:**

| File | Change |
|------|--------|
| `src/app/(app)/reconciliation/actions.ts` | Add `getReconciliationInsightsAction()` |
| `src/app/(app)/reconciliation/insights/page.tsx` | New page: reconciliation insights dashboard |
| `src/app/(app)/reconciliation/insights/metrics-cards.tsx` | Summary cards component |
| `src/app/(app)/reconciliation/insights/layer-distribution.tsx` | Match distribution by layer |
| `src/app/(app)/reconciliation/insights/rule-effectiveness-table.tsx` | Rule effectiveness table |
| `src/components/layout/sidebar-nav.tsx` | Add "Insights" sub-nav under Reconciliation |

### Phase 7e: Auto-Rule Suggestion (Deferred Inngest)

After a manual matching session (3+ manual matches by the same user within 10 minutes), an Inngest function analyzes patterns and suggests rules.

**Trigger:** `reconciliation/manual-match-session` event, sent from `createManualMatchAction()` and `rejectAndRematchAction()` after each manual match. Debounced via Inngest's `debounce` configuration:

```typescript
debounce: {
  key: "event.data.orgId + '-' + event.data.userId",
  period: "10m",
}
```

**Inngest function steps:**

**Step 1: Collect recent manual matches**
- Query `reconciliation_matches` for the org where `matched_by = 'manual'` and `created_at` within last **30 minutes** (widened from 10 to account for debounce delay)
- Exclude matches created within 60 seconds after a rejection of the same transaction (avoids learning from immediate correction noise)
- If fewer than 3, stop

**Step 2: Analyze patterns**
- Group manual matches by the matched transaction's counterparty
- For each counterparty group with **3+ matches** (minimum threshold):
  - Extract common conditions: counterparty text, amount range, bank account, transaction type
  - Build a `RuleCondition[]` array from the shared pattern

**Step 3: Create draft rules**
- For each identified pattern, call `createRule()` with:
  - `isAutoSuggested: true`
  - `isActive: false` (requires user activation)
  - `name: "Auto-suggested: {counterparty pattern}"`
  - `actions: [{ type: 'auto_match', value: vendorId }]`
- Deduplicate against **both active and inactive** existing rules (including previously auto-suggested rules that were deactivated). Skip creation if equivalent rule conditions already exist.

**Step 4: Notify (lightweight)**
- No external notifications in V1
- Suggested rules surface in the rule management UI with an "Auto-suggested" badge
- Count of pending suggestions shown in the insights dashboard

**Files created/modified:**

| File | Change |
|------|--------|
| `src/lib/inngest/functions/suggest-rules.ts` | New Inngest function: `suggestReconciliationRules` |
| `src/lib/inngest/client.ts` | Register new function (no change needed -- Inngest auto-discovers) |
| `src/app/(app)/reconciliation/review/actions.ts` | Add Inngest event send after manual matches |
| `src/lib/db/queries/reconciliation-rules.ts` | Add `findSimilarRule()` deduplication query (checks active AND inactive rules) |

## Tests

### Rejection Feedback Loop (Vitest + integration)

- Reject a match: `reconciliation_matches.deleted_at` is set, transaction status recomputed from remaining active matches
- Reject then rematch: new match created, old match soft-deleted, both audit logged, all within a single DB transaction
- Rejection triggers `upsertAlias()` with correct counterparty from the new transaction (outside transaction, non-blocking)
- After 3 rejection corrections for the same counterparty, alias becomes confirmed
- AI suggestion rejection: `ai_match_suggestions.status` = `'rejected'`, `rejection_reason` recorded
- Rejection reason validated: strings over 500 chars are rejected with validation error
- Rejection with no new match (dismiss): only soft-delete, no alias learning
- Learning failure does not block the rejection (try/catch verified)
- **Split match rollback**: rejecting one match of a split leaves others active with `"partially_matched"` status; only sets `"unmatched"` when all matches are soft-deleted
- Transaction failure: if any step inside the transaction fails, no partial writes occur (old match not deleted, no new match created)

### Approval Flow (Vitest + integration)

- Approve auto match: `reconciliation_matches` status confirmed, transaction marked matched
- Approve AI suggestion: creates `reconciliation_matches` row, updates `ai_match_suggestions.status` to `'approved'`
- Approval triggers `upsertAlias()` with correct counterparty
- Double approval (idempotent): second call is a no-op
- Learning failure does not block approval

### Metrics Queries (integration, Docker Postgres)

- `getMatchRateByLayer()`: returns correct counts after seeding matches from different layers
- `getMatchRateTrend()`: weekly grouping with correct period boundaries; `exact_matches` excludes soft-deleted rows
- `getTimeToMatchByType()`: returns average time per match layer with correct join to documents
- `getAliasConflictRate()`: detects alias texts mapped to multiple vendors
- `getFalsePositiveRate()`: correctly computes percentage of auto-matches later soft-deleted
- `getAliasGrowthMetrics()`: counts include only non-deleted aliases, confirmed flag correct
- `getRuleEffectiveness()`: sorted by match_count descending, includes zero-match rules
- `getAiSuggestionMetrics()`: approval rate calculation handles zero-denominator (no reviewed suggestions)
- `getRejectionAnalysis()`: counts soft-deleted matches by layer, groups AI rejection reasons
- All metrics queries include `org_id` scoping (cross-tenant isolation)
- Deleted matches excluded from active metrics but included in rejection analysis

### Auto-Rule Suggestion (Vitest + integration)

- 3 manual matches with same counterparty within 30 min: rule suggested with correct conditions
- 2 manual matches: no rule suggested (below threshold of 3)
- Manual matches with different counterparties: no rule suggested
- Duplicate rule detection: if equivalent rule exists (active OR inactive), skip creation
- Matches immediately following a rejection of the same transaction are excluded from pattern analysis
- Suggested rule created with `isAutoSuggested: true`, `isActive: false`
- Suggested rule conditions match the counterparty pattern from manual matches

### E2E Tests (Playwright)

- Reject an auto match in review UI, select different transaction, verify alias created
- Approve a suggested match, verify transaction status changes
- Navigate to insights page, verify metric cards render with correct data
- View rule effectiveness table, see auto-suggested rules with badge

## Checkpoint

Phase 7 is complete when:

1. Rejecting a match soft-deletes the old match, creates a new manual match, and calls `upsertAlias()` for the correction -- all core steps wrapped in `db.transaction()`
2. Transaction status is recomputed from remaining active matches (not blindly set to "unmatched") via `recomputeTransactionStatus()`
3. Split match rejection correctly preserves `"partially_matched"` status when other split matches remain active
4. AI suggestion rejections record reason (validated `max(500)`) in `ai_match_suggestions` with `reviewed_by`
5. Approving a match finalizes the `reconciliation_matches` row and calls `upsertAlias()`
6. All learning operations are non-blocking (failures logged, never block the user action)
7. `getMatchRateByLayer()` returns correct distribution across all 7 layers
8. `getMatchRateTrend()` returns weekly/monthly grouped match counts (soft-deleted rows excluded from `exact_matches`)
9. `getTimeToMatchByType()` returns average resolution time per match layer
10. `getAliasConflictRate()` detects aliases mapped to multiple vendors
11. `getFalsePositiveRate()` tracks auto-match false-positive percentage
12. `getAliasGrowthMetrics()` returns total, confirmed, and this-month alias counts
13. `getRuleEffectiveness()` returns per-rule match counts ordered by effectiveness
14. `getAiSuggestionMetrics()` returns approval/rejection rates with average confidence scores
15. `getRejectionAnalysis()` shows which layers produce the most rejected matches
16. Insights dashboard page renders all metrics sections
17. Auto-rule suggestion Inngest function uses `debounce` (not `idempotency`), triggers after 3+ manual matches, and creates draft rules
18. Auto-rule deduplication checks both active and inactive existing rules
19. All mutations logged to `audit_log`
20. All queries include `org_id` scoping
21. Migration for `recon_matches_layer` index is applied
22. All tests pass

## Execution Order

```
Phase 7a (Rejection Loop) --+
                             +--> Phase 7c (Metrics Queries) --> Phase 7d (Dashboard)
Phase 7b (Approval Flow) ---+                                         |
                                                                       |
                             Phase 7e (Auto-Rule Suggestion) ----------+
```

- 7a and 7b are independent and can be built in parallel
- 7c depends on 7a/7b (needs rejection/approval data to query)
- 7d depends on 7c (needs query functions to render)
- 7e can start after 7a/7b (needs manual match event wiring) but dashboard integration needs 7d
- `phase-7-ui-reconciliation` and `phase-7-ai-batch-matching` depend on 7a/7b server actions

## Effort Estimate

| Sub-phase | Effort | Notes |
|-----------|--------|-------|
| 7a: Rejection loop | M | Server action + 3 new query functions + alias wiring + `db.transaction()` + `recomputeTransactionStatus()` |
| 7b: Approval flow | S | Server action + 1 query function + alias wiring |
| 7c: Metrics queries | M | 9 query functions (was 6, added time-to-match, alias conflict, false-positive), all SQL-based aggregation + migration for layer index |
| 7d: Metrics dashboard | M | New page + 4 components + server action + additional metric cards |
| 7e: Auto-rule suggestion | M | Inngest function with `debounce` config + pattern analysis + dedup logic (active+inactive) |

(S = small / half day, M = medium / 1-2 days, L = large / 3+ days)
