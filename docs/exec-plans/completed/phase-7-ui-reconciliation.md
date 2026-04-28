# Phase 7: Reconciliation UI — Rules, Match Explanations & AI Review

**Status:** Planned
**Dependencies:** Phase 4 (reconciliation engine, `reconciliation_matches` with `match_metadata`), Phase 7A-7E backend (matching cascade, rule engine, templates, `ai_match_suggestions`, `vendor_bank_aliases`, `reconciliation_rules` tables), **phase-7-learning-metrics** (owns all approve/reject/learn server actions — this phase only consumes them)
**Destination:** `src/app/(app)/settings/reconciliation-rules/`, `src/app/(app)/reconciliation/`, `src/lib/reconciliation/`, `src/lib/db/queries/`

## Dependencies

| Dependency | What it provides | What this phase consumes |
|------------|-----------------|------------------------|
| Phase 4 | `reconciliation_matches` table with `match_metadata` JSONB | Match data for display |
| Phase 7A-7E backend | Rule engine, templates, `ai_match_suggestions`, `vendor_bank_aliases`, `reconciliation_rules` tables | DB schema and query layer |
| **phase-7-learning-metrics** | `approveMatchAction`, `rejectMatchAction`, `approveSuggestionAction`, `rejectSuggestionAction`, `bulkApproveHighConfidenceAction` | This phase imports and calls these actions from its UI components. It does NOT define them. |

## Standard Patterns

All server actions in this phase must follow these conventions (consistent with existing codebase patterns in `src/app/(app)/bank-accounts/`):

1. **Revalidation:** Call `revalidatePath()` for all affected routes after mutations.
2. **Return type:** Return `{ success: true, ... }` on success or `{ error: string }` on failure. Never throw from server actions.
3. **Audit logging:** Pass `actorId` from `getCurrentUserId()` to `auditMutation()` for every mutation.
4. **Org scoping:** Use `getVerifiedOrgId()` for all actions. Return `{ error: "No organization selected" }` if null.
5. **Read-side data:** Fetch in server components (in `page.tsx`), not via server actions. Reserve server actions for mutations only.

## Goal

Surface the reconciliation engine's intelligence to users. Let them select industry rule templates during onboarding, manage rules from settings, understand WHY matches were made, review AI suggestions, and (for admins) inspect full signal-level debug data. All backend data structures exist -- this phase is purely UI/server-actions wiring.

**Not in scope:** Building the AI match Inngest function itself (that is a separate task). Not modifying the matching cascade logic. Not adding new matching layers. Not defining approve/reject/learn actions (owned by phase-7-learning-metrics).

## Deliverables

### 7.1 Business Nature Onboarding

User selects their business type to seed `reconciliation_rules` from industry templates. This is a one-time setup action, also accessible from settings.

**Onboarding entry point:** After org creation, redirect to `/settings/reconciliation-rules`. If the org has zero reconciliation rules, show a "Set up your business type" prompt card at the top of the page (above any empty rule list). This card contains the template picker inline. No separate onboarding route required.

**UI: Card grid selector**
- Rendered within the prompt card on `/settings/reconciliation-rules`, also openable from "Import Template" button
- 4 cards in a 2x2 grid (mobile: single column):
  - Common Thai Business (building-2 icon) -- `common` template
  - Restaurant / F&B (utensils icon) -- `restaurant` template
  - Professional Services / Consulting (briefcase icon) -- `consulting` template
  - E-commerce / Marketplace (shopping-cart icon) -- `ecommerce` template
- Each card shows: icon, English name, Thai name (`nameTh`), description, rule count badge
- Single-click selects and highlights (bg-accent). "Apply Template" button creates rules
- If org already has rules from a template (check `template_id` on existing rules), show warning: "You already have N rules from this template. Apply again to add missing rules."
- Applying a template: for each `TemplateRule` in the template, `createRule()` with `templateId = template.id`, skip rules where a rule with matching `(orgId, templateId, name)` already exists (idempotent)

**UI states:**
- **Loading:** Skeleton cards during template application, disable "Apply Template" button
- **Success:** Toast notification with "N rules created, M skipped"
- **Error:** Inline error message below the prompt card

**Server action:** `applyBusinessTemplateAction(templateId: string)`
- Validates `templateId` exists in `templateRegistry`
- Uses `getVerifiedOrgId()` for org scoping
- Calls `createRule()` for each template rule (dedup by name + templateId)
- Calls `revalidatePath("/settings/reconciliation-rules")`
- Returns `{ success: true, rulesCreated: number, rulesSkipped: number }` or `{ error: string }`
- Audit log entry: action `create`, entity_type `reconciliation_rules`, newValue includes templateId, actorId from `getCurrentUserId()`

**Files:**

| File | Action | Description |
|------|--------|-------------|
| `src/app/(app)/settings/reconciliation-rules/template-picker.tsx` | Create | Card grid component for template selection + onboarding prompt card |
| `src/app/(app)/settings/reconciliation-rules/actions.ts` | Create | Server actions for template apply, rule CRUD |
| `src/lib/db/queries/reconciliation-rules.ts` | Modify | Add `getRulesByTemplateId()`, `getAllRules()` (include inactive, exclude deleted) |

**Verification:**
- [ ] Selecting a template creates the correct number of rules
- [ ] Re-applying the same template does not create duplicate rules
- [ ] Rules created with correct `templateId`, `priority`, `conditions`, `actions`
- [ ] Audit log entry created for template application
- [ ] All actions use `getVerifiedOrgId()` -- no cross-tenant leaks
- [ ] Onboarding prompt card shown when org has zero rules
- [ ] Prompt card hidden once rules exist
- [ ] Loading/error states render correctly during template application

---

### 7.2 Rule Management Settings Page

Full CRUD for reconciliation rules at `/settings/reconciliation-rules`.

**UI layout:**
- New tab in settings layout: "Reconciliation Rules" (add to `tabs` array in `src/app/(app)/settings/layout.tsx`)
- Page header: "Reconciliation Rules" with "Import Template" button (opens template picker dialog) and "Create Rule" button
- Rules list: Card-based list (not a data table -- rules are low-volume, 5-30 per org)
  - Each rule card shows: name, description, priority badge, active/inactive toggle (Switch), match count, last matched date
  - Condition pills: visual representation of each condition (e.g., "counterparty contains กรมสรรพากร")
  - Action pills: visual representation of each action (e.g., "Category: tax_payment", "Auto-match")
  - Actions dropdown (DropdownMenu): Edit, Delete (soft-delete)
  - Priority reorder: Up/Down buttons on each card (swap priority values with adjacent rule)
- "Suggested Rules" section (below active rules):
  - Filter: `isAutoSuggested = true AND isActive = false`
  - Same card layout but with "Activate" button instead of toggle
  - Description: "Rules suggested based on your transaction patterns"
  - If none: section hidden entirely

**Rule edit dialog (detailed spec):**
- Dialog/Sheet with `react-hook-form` and Zod validation schema
- **Validation rules:**
  - Name: required, max 100 characters
  - Description: optional, max 500 characters
  - Priority: required, integer >= 1
  - Conditions: minimum 1 condition required
  - Actions: minimum 1 action required
- **Form fields:**
  - Name (text input)
  - Description (text input, optional)
  - Priority (number input, lower = higher priority)
  - Conditions: dynamic list of condition rows (useFieldArray)
    - Field selector: dropdown with options from `RuleCondition['field']` type
    - Operator selector: dropdown **dynamically filtered by field type:**
      - Text fields (counterparty, description, category): `contains`, `starts_with`, `ends_with`, `equals`, `regex`
      - Numeric fields (amount): `gt`, `lt`, `between`, `equals`
      - Date fields: `gt`, `lt`, `between`
    - Value input: text input for most operators. For `between` operator: two number inputs, **serialized as a JSON array of two numbers** `[min, max]` in the stored condition value
    - Add/remove condition buttons (minimum 1 enforced)
  - Actions: dynamic list of action rows (useFieldArray)
    - Action type selector: dropdown with options from `RuleAction['type']` type
    - Value input: text input (or dropdown for known categories)
    - Add/remove action buttons (minimum 1 enforced)
- Save button calls `updateRuleAction()` or `createRuleAction()`

**UI states:**
- **Loading (rule list):** Skeleton cards while page loads (server component handles this)
- **Empty (no rules):** Show onboarding prompt card from 7.1
- **Loading (save/delete):** Disable form buttons, show spinner on submit button
- **Error (save/delete):** Inline error message in dialog or toast
- **Loading (reorder):** Optimistic UI -- immediately swap cards, revert on error

**Server actions in `actions.ts`:**
- `applyBusinessTemplateAction(templateId: string)` -- from 7.1
- `createRuleAction(data)` -- creates new rule, audit log, `revalidatePath`
- `updateRuleAction(ruleId, data)` -- updates rule fields, audit log, `revalidatePath`
- `toggleRuleActiveAction(ruleId, isActive)` -- wraps existing `toggleRuleActive()`, `revalidatePath`
- `deleteRuleAction(ruleId)` -- wraps existing `deleteRule()` (soft-delete), audit log, `revalidatePath`
- `reorderRuleAction(ruleId, direction: 'up' | 'down')` -- swap priority with adjacent rule, `revalidatePath`

Note: `getAllRulesAction` is NOT a server action. Rules are fetched server-side in `page.tsx` and passed as props.

**Files:**

| File | Action | Description |
|------|--------|-------------|
| `src/app/(app)/settings/reconciliation-rules/page.tsx` | Create | Server component: fetch rules, render list |
| `src/app/(app)/settings/reconciliation-rules/rule-list.tsx` | Create | Client component: rule cards with toggle, reorder, actions |
| `src/app/(app)/settings/reconciliation-rules/rule-edit-dialog.tsx` | Create | Client component: create/edit rule form with react-hook-form + Zod |
| `src/app/(app)/settings/reconciliation-rules/template-picker.tsx` | Create | From 7.1 -- reused here as dialog content |
| `src/app/(app)/settings/reconciliation-rules/actions.ts` | Create | Mutation-only server actions for rule management |
| `src/app/(app)/settings/layout.tsx` | Modify | Add "Reconciliation Rules" tab |
| `src/lib/db/queries/reconciliation-rules.ts` | Modify | Add `getAllRules()`, `updateRule()`, `getRulesByTemplateId()`, `swapRulePriorities()` |

**Verification:**
- [ ] Rules list shows all non-deleted rules ordered by priority
- [ ] Toggle updates `isActive` immediately (optimistic UI with revalidation)
- [ ] Creating a rule adds it to the list
- [ ] Editing a rule updates all fields correctly
- [ ] Form validates minimum 1 condition + 1 action
- [ ] `between` operator stores value as `[min, max]` array
- [ ] Operator dropdown filters correctly by field type
- [ ] Deleting a rule soft-deletes (sets `deleted_at`)
- [ ] Priority reorder swaps values correctly
- [ ] Suggested rules section shows auto-suggested inactive rules
- [ ] Condition/action pills render correctly for all types
- [ ] Settings tab navigation works -- "Reconciliation Rules" tab appears and routes correctly
- [ ] All mutations logged to audit_log
- [ ] Empty/loading/error states render correctly

---

### 7.3 Match Explanation Display

Show users WHY a match was made. Two contexts: reconciliation dashboard (list view) and transaction detail view. This section is **display-only** -- approve/reject actions are owned by phase-7-learning-metrics and imported where needed.

**Simplified explanation (default for all users):**
- Map `match_metadata.layer` to human-readable text:
  - `reference` -> "Matched by invoice number" or "Matched by tax ID" or "Matched by vendor name" (read `signals.referenceFound.detail` to determine which)
  - `alias` -> "Matched by known counterparty alias"
  - `exact` -> "Exact amount match within {N} days"
  - `rule` -> "Matched by rule: {ruleName}" (read `signals.ruleMatch.detail`)
  - `multi_signal` -> "Matched by amount and vendor similarity" (simplified)
  - `split` -> "Split payment: {N} transactions totaling {amount}"
  - `ai` -> "AI-suggested match"
- Confidence indicator: colored badge using DESIGN.md semantic tokens:
  - High (>= 0.90): Success color (`#2e7d32` green)
  - Medium (>= 0.70): Warning color (`#f57c00` amber)
  - Low (< 0.70): Destructive color (`oklch(0.577 0.245 27.325)` red)

**UI integration points:**

1. **Reconciliation dashboard (`reconciliation-dashboard.tsx`):** Add a "Recent Matches" section below the existing unmatched lists. Each match row shows: document info, transaction info, simplified explanation, confidence badge. No approve/reject buttons here -- this is a read-only summary.

2. **Transaction detail (bank account transaction table):** When a transaction is matched, show a small "Matched" badge. Click to expand inline match explanation.

**New component: `MatchExplanation`**
- Props: `matchMetadata: MatchMetadata`, `adminMode: boolean`
- Default (adminMode=false): simplified one-line explanation + confidence badge
- Admin mode (adminMode=true): full signal breakdown (see 7.5)

**UI states:**
- **Loading (recent matches):** Skeleton rows in the recent matches section
- **Empty (no recent matches):** "No recent matches" with descriptive text
- **Error:** Inline error banner

**Data queries (fetched in server components, NOT server actions):**
- `getRecentMatches(orgId, limit)` in `reconciliation.ts` -- SELECT from `reconciliation_matches` JOIN `transactions` JOIN `documents`, include `match_metadata`, ordered by `matched_at` DESC

**Files:**

| File | Action | Description |
|------|--------|-------------|
| `src/components/reconciliation/match-explanation.tsx` | Create | Reusable match explanation component (simple + admin modes) |
| `src/components/reconciliation/confidence-badge.tsx` | Create | Color-coded confidence indicator badge using DESIGN.md semantic tokens |
| `src/lib/reconciliation/match-display.ts` | Create | Pure utility: `getSimplifiedExplanation(metadata)`, `getLayerLabel(layer)`, `getConfidenceLevel(confidence)`, `SIGNAL_TO_WEIGHT_KEY` mapping |
| `src/app/(app)/reconciliation/page.tsx` | Modify | Add `recentMatches` and `suggestionCounts` fetches, pass as props to dashboard |
| `src/app/(app)/reconciliation/reconciliation-dashboard.tsx` | Modify | Add "Recent Matches" section with explanations; accept new props |
| `src/lib/db/queries/reconciliation.ts` | Modify | Add `getRecentMatches()` query |
| `src/app/(app)/bank-accounts/[accountId]/transaction-table.tsx` | Modify | Add "Matched" badge with expandable explanation |

**Updated `ReconciliationDashboard` Props interface:**
```typescript
interface Props {
  initialStats: Stats;
  initialUnmatchedTransactions: UnmatchedTransaction[];
  initialUnmatchedDocuments: UnmatchedDocument[];
  recentMatches: RecentMatch[];       // NEW — from getRecentMatches()
  suggestionCounts: SuggestionCounts;  // NEW — from getSuggestionCounts()
}
```

**Updated `page.tsx` data fetching:**
```typescript
const [stats, unmatchedTxns, unmatchedDocs, recentMatches, suggestionCounts] = await Promise.all([
  getReconciliationStats(orgId),
  getUnmatchedTransactions(orgId, 10),
  getUnmatchedDocuments(orgId, 10),
  getRecentMatches(orgId, 10),
  getSuggestionCounts(orgId),
]);
```

**Verification:**
- [ ] Each match type displays correct simplified explanation
- [ ] Confidence badge uses correct color thresholds from DESIGN.md semantic tokens
- [ ] Recent matches section loads on reconciliation dashboard
- [ ] Transaction table shows match status indicator
- [ ] `match_metadata` JSONB is correctly parsed and rendered
- [ ] All queries scoped by org_id
- [ ] Loading/empty/error states render correctly for recent matches
- [ ] No approve/reject actions defined here (display-only)

---

### 7.4 AI Suggestions Review

Banner + list view for reviewing AI-generated match suggestions from `ai_match_suggestions` table. Approve/reject actions are **imported from phase-7-learning-metrics**, not defined here.

**UI:**
- Banner on reconciliation dashboard: "AI has {N} suggested matches ready for review" (Warning color background, only shown when `pendingCount > 0`). `suggestionCounts` are passed as props from `page.tsx` (see 7.3 Props update).
- Click banner -> navigate to `/reconciliation/ai-review`
- AI review page layout:
  - Header: "AI Match Suggestions" with count
  - Bulk actions bar: "Approve All High-Confidence" button (approves all suggestions with confidence >= 0.90)
  - List of suggestion cards, each showing:
    - Transaction info (date, amount, counterparty, description)
    - Document info (vendor, document number, amount)
    - AI explanation text (from `explanation` column)
    - Confidence badge (reuse from 7.3)
    - AI model used (small caption text)
    - Approve / Reject buttons (call actions imported from phase-7-learning-metrics)
    - Reject requires optional reason text input (shown inline on reject click)
  - Empty state: "No AI suggestions pending" with explanation text
  - Error state: Inline error banner if action fails

**UI states:**
- **Loading (suggestion list):** Skeleton cards while page loads
- **Empty:** "No AI suggestions pending" with illustration and explanatory text
- **Loading (approve/reject):** Disable buttons on the affected card, show spinner
- **Error (approve/reject):** Toast with error message, re-enable buttons
- **Optimistic removal:** Card fades out on approve/reject, reverts on error

**Data queries (fetched in server components):**
- `getPendingSuggestionsWithDetails(orgId, limit)` in `ai-suggestions.ts` -- JOIN with `transactions` and `documents` for display data. Called in `ai-review/page.tsx` server component.
- `getSuggestionCounts(orgId)` in `ai-suggestions.ts` -- for banner. Called in `reconciliation/page.tsx` server component (see 7.3).

**Actions imported from phase-7-learning-metrics:**
- `approveSuggestionAction(suggestionId: string)` -- creates actual `reconciliation_matches` row, updates transaction status
- `rejectSuggestionAction(suggestionId: string, reason?: string)` -- sets status to `rejected`
- `bulkApproveHighConfidenceAction(minConfidence: string)` -- approve all pending with confidence >= threshold

**Files:**

| File | Action | Description |
|------|--------|-------------|
| `src/app/(app)/reconciliation/ai-review/page.tsx` | Create | Server component: fetch suggestions via query, render list |
| `src/app/(app)/reconciliation/ai-review/ai-suggestion-list.tsx` | Create | Client component: suggestion cards with approve/reject (imports actions from phase-7-learning-metrics) |
| `src/app/(app)/reconciliation/page.tsx` | Modify | Pass `suggestionCounts` as props to dashboard (part of 7.3 update) |
| `src/app/(app)/reconciliation/reconciliation-dashboard.tsx` | Modify | Add AI suggestions banner using `suggestionCounts` prop |
| `src/lib/db/queries/ai-suggestions.ts` | Modify | Add `getPendingSuggestionsWithDetails()`, `getSuggestionCounts()` |
| `src/components/reconciliation/ai-suggestion-banner.tsx` | Create | Reusable banner component for AI suggestion count |

**Verification:**
- [ ] Banner appears only when pending suggestions exist
- [ ] Banner shows correct count
- [ ] Each suggestion displays transaction + document + explanation + confidence
- [ ] Approve creates a `reconciliation_matches` row and updates transaction status (via imported action)
- [ ] Reject sets suggestion status to `rejected` with optional reason (via imported action)
- [ ] Bulk approve only affects suggestions at or above the confidence threshold (via imported action)
- [ ] All mutations logged to audit_log (by phase-7-learning-metrics actions)
- [ ] Empty/loading/error states render correctly
- [ ] Approving a suggestion that was already handled (race condition) fails gracefully
- [ ] No approve/reject/learn actions defined in this phase's files

---

### 7.5 Admin Debug Mode

Full signal-level match metadata, hidden behind `?debug=true`. Regular users see simplified explanations (7.3). Admin mode shows the full breakdown.

**Feature flag implementation:**
- MVP approach: `?debug=true` URL search param only. No schema change, no role check in V1 (single-user per org assumption). Add role-based gating in auth phase.

**Signal-to-weight key mapping:**

The `match_metadata.signals` keys map to `SIGNAL_WEIGHTS` keys in `matcher.ts`. The `match-display.ts` utility includes this mapping:

| Signal key (in metadata) | Weight key (in SIGNAL_WEIGHTS) | Weight |
|--------------------------|-------------------------------|--------|
| `amountMatch` | `amount` | 0.35 |
| `dateProximity` | `date` | 0.15 |
| `counterpartyMatch` | `counterpartyVendor` | 0.25 |
| `directionMatch` | `direction` | 0.10 |
| `bankAffinity` | `bankAffinity` | 0.10 |
| `channelMatch` | `channel` | 0.05 |

This mapping is exported as `SIGNAL_TO_WEIGHT_KEY` from `match-display.ts` and used by the signal breakdown table to display correct weight values.

**Admin mode UI (extension of `MatchExplanation` component):**
- When `adminMode=true`, show expandable section below simplified explanation:
  - **Layer**: which matching layer produced this result (reference/alias/exact/rule/multi_signal/split)
  - **Candidate count**: how many candidates were evaluated
  - **Selected rank**: which candidate was chosen (1 of N)
  - **Signal breakdown table**: one row per signal from `match_metadata.signals`
    - Signal name (amountMatch, dateProximity, counterpartyMatch, directionMatch, bankAffinity, channelMatch)
    - Score (0.00 - 1.00) with visual bar
    - Detail text
    - Weight (from `SIGNAL_TO_WEIGHT_KEY` mapping, if multi_signal layer)
    - Weighted contribution (score * weight)
  - **Total score**: sum of weighted contributions (for multi_signal matches)
  - **Raw JSON toggle**: collapsible raw `match_metadata` JSON view for debugging

**Files:**

| File | Action | Description |
|------|--------|-------------|
| `src/components/reconciliation/match-explanation.tsx` | Modify | Add admin mode signal breakdown |
| `src/components/reconciliation/signal-breakdown.tsx` | Create | Table component showing per-signal scores with bars |
| `src/lib/reconciliation/match-display.ts` | Modify | Add `SIGNAL_TO_WEIGHT_KEY` mapping, `getWeightedContribution()` helper |

**Verification:**
- [ ] Default view (no debug param) shows simplified explanation only
- [ ] `?debug=true` shows full signal breakdown
- [ ] Signal bars render proportionally to scores (0-100% width)
- [ ] Signal-to-weight mapping correctly maps all 6 signal keys to their weights
- [ ] Weighted contributions shown only for multi_signal layer matches
- [ ] Raw JSON toggle works and displays valid JSON
- [ ] No sensitive data exposed (no internal IDs beyond what is already visible)

---

## Tests

### Rule Template Application (Vitest)

- Apply `common` template: creates 8 rules (or however many are in the template)
- Re-apply same template: no duplicates created, returns `rulesSkipped` count
- Apply `restaurant` template after `common`: both template's rules exist, no conflicts
- Invalid template ID: returns error

### Rule CRUD (Vitest)

- Create rule with valid conditions/actions: stored correctly
- Create rule with zero conditions: validation rejects
- Create rule with zero actions: validation rejects
- `between` operator stores value as `[min, max]` array
- Update rule name and priority: reflected in `getAllRules()` result
- Toggle rule active/inactive: `isActive` flag changes
- Soft-delete rule: `deleted_at` set, excluded from `getAllRules()`
- Priority reorder: swapping two adjacent rules changes their priority values

### Match Explanation Rendering (Vitest)

- `getSimplifiedExplanation()` for each layer type returns correct string
- `getConfidenceLevel()` returns "high" for >= 0.90, "medium" for >= 0.70, "low" for < 0.70
- Signal breakdown with multi_signal metadata: correct weighted contributions computed
- `SIGNAL_TO_WEIGHT_KEY` mapping covers all 6 signal keys

### AI Suggestion Flow (integration, Docker Postgres)

- Create suggestion, approve it: creates `reconciliation_matches` row, updates transaction status
- Create suggestion, reject it: sets status to `rejected`, no match created
- Bulk approve with threshold 0.90: only approves suggestions at or above threshold
- Approve already-approved suggestion: no error, no duplicate match
- `getSuggestionCounts()`: returns correct counts per status

### Server Action Org Scoping (integration)

- All server actions return error or empty when `getVerifiedOrgId()` returns null
- Actions with org A cannot read/modify org B data

## Checkpoint

Phase 7 is complete when:

1. User can select a business nature template and create reconciliation rules from it
2. Re-applying the same template is idempotent (no duplicate rules)
3. Settings page shows all rules with toggle, edit, delete, and priority reorder
4. Creating and editing rules with arbitrary conditions/actions works via the dialog (with validation: min 1 condition + 1 action)
5. Reconciliation dashboard shows recent matches with simplified explanations
6. `page.tsx` fetches `recentMatches` and `suggestionCounts` server-side and passes as props
7. Each match type (reference, alias, exact, rule, multi_signal, split) displays a correct human-readable explanation
8. Confidence badges use DESIGN.md semantic tokens (Success, Warning, Destructive)
9. AI suggestions banner shows pending count and links to review page
10. AI suggestion review page allows approve/reject via actions imported from phase-7-learning-metrics
11. Bulk approve handles high-confidence suggestions correctly
12. Admin debug mode (`?debug=true`) shows full signal breakdown with per-signal scores and correct weight mapping
13. All server actions use `getVerifiedOrgId()` for org scoping
14. All mutations logged to audit_log with `actorId`
15. Financial records use soft-delete only
16. All loading/empty/error states implemented for key UI sections
17. All tests pass

## Implementation Order

Build in this sequence -- each step produces a testable increment:

1. **7.1 + 7.2**: Template picker + rule management (settings page). These are self-contained and testable without any reconciliation data.
2. **7.3**: Match explanation component + `match-display.ts` utility + dashboard integration (including `page.tsx` data flow updates). Requires existing `reconciliation_matches` data.
3. **7.4**: AI suggestion review. Requires existing `ai_match_suggestions` data. Depends on phase-7-learning-metrics for approve/reject actions.
4. **7.5**: Admin debug mode. Pure UI enhancement on top of 7.3. Modifies `match-display.ts` and `match-explanation.tsx`.
