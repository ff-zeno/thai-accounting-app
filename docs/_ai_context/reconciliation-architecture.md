# Reconciliation Architecture

How bank transactions get matched to accounting documents.

## Overview

```
Bank Statement Import
        │
        ▼
┌─── Document-Centric Flow ───┐    ┌─── Transaction-First Flow ───┐
│ Triggered: document/confirmed│    │ Triggered: transactions/imported │
│ Inngest: reconcile-document  │    │ Inngest: match-imported-txns     │
│                              │    │                                  │
│ 7-Layer Matching Cascade     │    │ Check unmatched → trigger AI     │
│   L0: Reference              │    └──────────────┬───────────────────┘
│   L1: Alias                  │                   │
│   L2: Exact                  │                   ▼
│   L3: Rule                   │    ┌─── AI Batch Matching ───────────┐
│   L4: Multi-Signal           │    │ Inngest: ai-recon-dispatcher    │
│   L5: Split                  │    │   (hourly cron, fans out per org)│
│   L6: Ambiguous              │    │ Inngest: ai-recon-batch         │
│                              │    │   (LLM → ai_match_suggestions)  │
│ No match? → queue for AI ────┼───►│                                  │
└──────────────────────────────┘    └──────────────────────────────────┘
                                                   │
                                                   ▼
                                    ┌─── Human Review ────────────────┐
                                    │ /reconciliation/ai-review       │
                                    │ Approve → create match + alias  │
                                    │ Reject → record reason + learn  │
                                    └──────────────────────────────────┘
```

## 7-Layer Matching Cascade

Located in `src/lib/reconciliation/matcher.ts`. Each layer either produces a match or passes to the next.

| Layer | Name | How it works | Confidence |
|-------|------|-------------|------------|
| L0 | Reference | Invoice number, tax ID, or vendor name found in transaction description | 0.95-1.00 |
| L1 | Alias | Counterparty text matched via `vendor_bank_aliases` (confirmed at 3+ occurrences) | 0.90-0.95 |
| L2 | Exact | Amount matches exactly, date within ±7 days | 1.00 |
| L3 | Rule | Reconciliation rule conditions match (counterparty contains, amount range, etc.) | 0.85-0.95 |
| L4 | Multi-Signal | Weighted score from 6 signals: amount(0.35), counterparty(0.25), date(0.15), direction(0.10), bank(0.10), channel(0.05). Auto-match threshold: 0.85 | 0.60-0.95 |
| L5 | Split | 2-3 transactions whose sum equals the payment amount | 0.90 |
| L6 | Ambiguous | Multiple candidates score equally — flagged for manual resolution, never auto-picked | N/A |

## Learning Feedback Loop

When users approve or reject matches, the system learns:

**Approval:** `approveMatchAction()` in `review/actions.ts`
- Confirms match as human-reviewed (`matchedBy: "manual"`)
- Updates AI suggestion status if applicable
- Calls `upsertAlias()` — maps counterparty → vendor (auto-confirms at 3 occurrences)

**Rejection:** `rejectAndRematchAction()` in `review/actions.ts`
- Soft-deletes old match (inside `db.transaction()`)
- Rejects AI suggestion with reason if applicable
- Recomputes transaction status from remaining active matches (split-safe)
- Creates new manual match
- Calls `upsertAlias()` with corrected mapping (`source: "rejection_correction"`)
- Fires Inngest event for auto-rule suggestion

**Auto-Rule Suggestion:** `suggest-rules.ts` Inngest function
- Debounced (10 min per user per org)
- Analyzes recent manual matches for counterparty patterns
- Creates draft rules when 3+ matches share the same pattern
- Dedup against existing rules (active + inactive)

## Reconciliation Rules

Stored in `reconciliation_rules` table, managed at `/settings/reconciliation-rules`.

**Sources:**
- Industry templates (common Thai business, restaurant, consulting, ecommerce) — `src/lib/reconciliation/templates/`
- Manual creation via settings UI
- Auto-suggested from matching patterns (Inngest)

**Structure:** Each rule has conditions (field/operator/value) and actions (assign_vendor, assign_category, auto_match, etc.). Rules are evaluated in Layer 3 of the cascade, ordered by priority.

## AI Batch Matching

Two Inngest functions implement a dispatcher + per-org processor pattern.

**Dispatcher** (`ai-reconciliation-dispatcher.ts`): Hourly cron collects orgs with unmatched transactions and remaining budget, emits one `reconciliation/ai-batch-requested` event per org.

**Per-Org Processor** (`ai-reconciliation-batch.ts`):
1. Budget guard — `NonRetriableError` if exhausted
2. Collect unmatched transactions (24h cooldown) + candidate documents (with payment details)
3. Build batches (max 10 txns/batch, max 5 docs/txn, max 5 batches/run)
4. AI call via `generateObject()` with index-based IDs (T1/D1)
5. Filter matches by confidence (>0.3), map indices back to UUIDs
6. Store as `ai_match_suggestions` with `onConflictDoNothing` (idempotent)

**Budget:** Separate from extraction budget. Default $1.00/month. Tracked in `ai_match_suggestions.ai_cost_usd`. Model default: `google/gemini-2.0-flash-001`.

**Triggers:**
- Hourly cron via dispatcher
- Bank statement import → `match-imported-transactions.ts` → immediate AI trigger
- Document reconciliation no-match fallback → queues for AI
- Manual trigger via `/reconciliation` dashboard (rate-limited: 1 per 10 min)

## Key Tables

| Table | Purpose |
|-------|---------|
| `reconciliation_matches` | Stores all matches (auto, manual, AI). Soft-delete for rejections. `match_metadata` JSONB stores layer, signals, scores |
| `ai_match_suggestions` | AI-generated match suggestions. Lifecycle: pending → approved/rejected. Cost tracked per suggestion |
| `vendor_bank_aliases` | Learned counterparty → vendor mappings. Auto-confirms at 3 occurrences |
| `reconciliation_rules` | User/template/auto-suggested rules with conditions and actions |
| `org_ai_settings` | Per-org AI configuration: models, extraction budget, reconciliation budget |

## Key Files

| Area | Files |
|------|-------|
| Matching engine | `src/lib/reconciliation/matcher.ts` |
| Match display | `src/lib/reconciliation/match-display.ts` |
| Rule templates | `src/lib/reconciliation/templates/` |
| DB queries | `src/lib/db/queries/reconciliation.ts`, `reconciliation-metrics.ts`, `reconciliation-rules.ts`, `vendor-aliases.ts`, `ai-suggestions.ts` |
| Server actions | `src/app/(app)/reconciliation/review/actions.ts` (approve/reject/rematch), `actions.ts` (dashboard data + manual AI trigger) |
| Settings | `src/app/(app)/settings/reconciliation-rules/` (rule management + template picker) |
| Insights | `src/app/(app)/reconciliation/insights/` (metrics dashboard) |
| AI review | `src/app/(app)/reconciliation/ai-review/` (suggestion review) |
| AI prompt | `src/lib/ai/prompts/reconciliation-batch.ts` |
| AI cost | `src/lib/ai/reconciliation-cost-tracker.ts` |
| Inngest | `src/lib/inngest/functions/reconcile-document.ts`, `suggest-rules.ts`, `ai-reconciliation-dispatcher.ts`, `ai-reconciliation-batch.ts`, `match-imported-transactions.ts` |
