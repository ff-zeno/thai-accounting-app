# Phase 16 — AI Copilot and Tool/MCP Action Layer

**Status:** Implementation-active; read-only typed tool registry, deterministic natural-language prompt router, first draft preview/apply tool, first safe write task tool, audited tool events, BYO Copilot provider settings, export coverage, and `/copilot` UI landed
**Date:** 2026-05-01
**Depends on:** Phase 8 corrective learning, Phase 10.5 GL primitives, Phase 15 UI nav refactor, hardened audit/period-lock baseline
**Related:** `phase-8-extraction-learning-loop.md`, `phase-10-5-gl-primitives.md`, `phase-14-analytics-audit-pack.md`

## 1. Purpose

Make AI a first-class operating surface in the accounting app, not only a background extractor.

## Implementation Snapshot — 2026-05-16

Landed MVP foundation:

- Internal typed read-tool registry in `src/lib/copilot/tool-registry.ts`.
- Audited persistence tables: `copilot_sessions`, `copilot_messages`, and `copilot_tool_events`.
- Read-only tools: `search_documents`, `search_vendors`, `search_accounts`, `list_open_exceptions`, and `get_tax_position`.
- First draft/preview tool: `preview_recode_documents`, which resolves a target GL account, previews candidate document recodes, marks non-draft rows blocked, and records a draft-risk audited tool event without mutating records.
- First guarded apply tool: `apply_recode_documents`, which requires `APPLY RECODE`, enforces accountant-role execution, updates only unlocked draft document line `account_code` values, skips confirmed/paid/posted/locked-period documents, and records a bulk-write audited tool event.
- First safe write tool: `create_accountant_review_task`, which creates an open exception-queue review task and records a write-risk audited tool event. It does not mutate accounting source records.
- Tool executor hardening: registry `requiredRole` is enforced centrally, malformed/failed tool attempts are persisted as failed tool events with raw input, and `/copilot` admin action invokes accountant-scoped tools explicitly.
- Deterministic natural-language prompt router: `/copilot` "Ask Copilot" maps prompts to the existing typed tool contracts for document/vendor/account search, tax-position summaries, open exceptions, safe review-task creation, and preview-only document recode. It does not call a live model yet and does not add a new mutation path; write-capable actions still use existing role, preview, confirmation, audit, and period-lock gates.
- `/copilot` authenticated route with compact tool runner and recent tool-event table.
- BYO Copilot provider configuration on `/settings/ai`: owner/admin provider/model controls, secret-reference-only API key storage, last-four audit hint, monthly budget, live-model enablement, and write-tool enablement flags.
- Preview-only live-model status is now visible in both `/settings/ai` and `/copilot`, so owners do not mistake provider settings for finished live orchestration. The UI states that prompts currently route through deterministic audited tools and write-capable tools still require preview, role checks, confirmation, period-lock checks, and audit events.
- Full export includes copilot tables.
- Tests: `src/lib/db/queries/copilot-tools.db.test.ts`, `src/lib/db/queries/ai-settings.db.test.ts`, `src/lib/export/full-export.test.ts`, `e2e/copilot/copilot.spec.ts`, and `e2e/settings/ai.spec.ts`.
- Verification: `pnpm tsc --noEmit`, `pnpm exec drizzle-kit check`, `git diff --check`, focused Copilot DB/export/E2E tests, and the overnight broad serial DB/export/Playwright gate passed on 2026-05-16. Post-Claude hardening gate passed again with `pnpm tsc --noEmit`, `pnpm vitest run --config vitest.config.db.ts src/lib/db/queries/copilot-tools.db.test.ts`, `pnpm vitest run src/lib/export/full-export.test.ts`, `pnpm test:e2e e2e/copilot/copilot.spec.ts`, `pnpm exec drizzle-kit check`, and `git diff --check`. Additional 2026-05-17 safety coverage proves staff-role attempts to run `apply_recode_documents` fail before mutating draft line items while still writing a failed bulk-write tool event; `/copilot` Playwright smoke and post-Playwright TypeScript also passed.
- BYO settings gate passed on 2026-05-16: `pnpm test:e2e e2e/settings/ai.spec.ts`, `pnpm tsc --noEmit`, `pnpm vitest run --config vitest.config.db.ts src/lib/db/queries/ai-settings.db.test.ts`, `pnpm vitest run src/lib/export/full-export.test.ts`, `pnpm exec drizzle-kit check`, and `git diff --check`. Self-review added raw-provider-key rejection for the secret-reference field.
- BYO settings Claude review debt closed on 2026-05-17: settings reads/mutations use verified-org owner/admin gating, AI settings mutations write redacted allowlist audit payloads with secret-ref presence booleans, `org_ai_settings` export excludes Copilot secret refs/last-four values from JSON and CSV, Copilot tool execution maps the caller's membership role instead of hardcoding accountant, live enablement requires provider/model/secret ref plus a present server env var, model/budget inputs are bounded, and `/settings/ai` is force-dynamic. Evidence: `pnpm vitest run --config vitest.config.db.ts src/lib/db/queries/ai-settings.db.test.ts src/lib/db/queries/copilot-tools.db.test.ts`; `pnpm vitest run src/lib/export/full-export.test.ts`; `pnpm vitest run src/app/\(app\)/tax/vat/actions.test.ts`; `pnpm test:e2e e2e/settings/ai.spec.ts e2e/copilot/copilot.spec.ts`; `pnpm tsc --noEmit`; `git diff --check`; active-code no-`vat_records` search. Claude Companion follow-up reported no blockers.
- Preview-only status gate passed on 2026-05-17: `pnpm test:e2e e2e/settings/ai.spec.ts e2e/copilot/copilot.spec.ts`, `.next/dev/types` cleanup, `pnpm tsc --noEmit`, and `git diff --check`.

Deliberately not landed yet:

- Live model/provider calls.
- Confirmed/posted accounting-source write tools and MCP exposure.
- Free-form model orchestration. Current UI supports deterministic prompt-to-tool routing and explicit typed tools.

Users should be able to ask questions and request actions in plain language:

- "Find all cash invoices from this vendor and recode them to account 6120."
- "These invoices were posted to the wrong account. Show me what would change if we move them."
- "Why is withholding tax showing on this payment?"
- "Which invoices are still missing tax invoice numbers?"
- "Explain whether this vendor payment needs PND.53 or PND.54."

The AI should answer with app-aware context and, where appropriate, prepare a safe action plan. It must not silently mutate accounting data.

## 2. Product Contract

The user talks to AI in natural language. The system converts intent into structured tool calls, previews, confirmations, and audited mutations.

The AI can:

- Search and summarize accounting records.
- Explain Thai tax/accounting concepts using app state.
- Draft bulk actions.
- Propose journal/document/account-code corrections.
- Explain why a period lock, tax filing, or confirmation gate blocks an action.
- Help correct document extraction and feed Phase 8 corrective learning.

The AI cannot:

- Bypass RBAC, period locks, confirmation gates, or audit requirements.
- Mutate filed/confirmed/locked data without the same override paths a human user would need.
- Execute high-impact bulk changes without preview and explicit confirmation.
- Invent accounting policy when the app has no rule; it must surface uncertainty.
- Use raw user prompts as durable automation rules.

## 3. Architecture

### 3.1 In-App Copilot

Add an authenticated chat panel/page inside the app. It is org-scoped and user-scoped.

Core capabilities:

- Context-aware Q&A over current org data.
- Document/invoice/vendor/account search.
- Read-only explanations by default.
- Action drafts shown as reviewable plans.
- Confirmation gates for write actions.
- Full audit trail of prompt, tool calls, preview, confirmation, and mutation result.

The chat UX should be practical, not decorative: search results, proposed changes, affected-row tables, and confirmation buttons matter more than long prose.

### 3.2 Tool Registry

Build an internal typed tool registry before exposing any MCP server. The copilot and MCP server should call the same tool contracts.

Tool shape:

```ts
type AccountingTool<I, O> = {
  name: string;
  description: string;
  inputSchema: z.ZodType<I>;
  outputSchema: z.ZodType<O>;
  requiredRole: "owner" | "accountant" | "staff";
  risk: "read" | "draft" | "write" | "bulk_write" | "filing_impact";
  previewRequired: boolean;
  execute(input: I, ctx: ToolContext): Promise<O>;
};
```

Every write tool must support preview mode. Bulk-write and filing-impact tools require explicit confirmation after preview.

### 3.3 MCP Server

Expose a tenant-safe MCP server only after the internal tool registry is stable.

Use cases:

- Power users connect Claude Desktop, ChatGPT, or custom agents to their own accounting workspace.
- External AI clients can read/search/analyze data through scoped tools.
- External clients can draft bulk actions, but high-risk writes still require app-side confirmation unless we later build a signed confirmation protocol.

MCP safety rules:

- OAuth/session auth tied to app user and org.
- Tool responses always respect RBAC and org scope.
- No raw SQL tools.
- No "execute arbitrary mutation" tool.
- All write tools go through the same application services as the UI.
- All write tools create audit events.
- Period locks and filed-data guards remain enforced at DB level.

## 4. Initial Tool Set

### Read Tools

- `search_documents`
- `get_document`
- `search_vendors`
- `search_accounts`
- `get_account_activity`
- `get_tax_position`
- `explain_period_lock`
- `list_open_exceptions`

### Draft/Preview Tools

- `preview_recode_documents`
- `preview_bulk_vendor_update`
- `preview_bulk_document_category_update`
- `preview_journal_reclass`
- `preview_wht_treatment`
- `preview_vat_treatment`

### Write Tools

- `apply_recode_documents`
- `apply_bulk_vendor_update`
- `apply_document_corrections`
- `create_exception_note`
- `create_accountant_review_task`

Write tools are not part of the first public MCP slice unless app-side confirmation is implemented.

## 5. Bulk Action Safety

Bulk actions must follow this sequence:

1. Interpret user request.
2. Search candidate records.
3. Show affected records and reason each row matched.
4. Run validation:
   - org scope,
   - RBAC,
   - period locks,
   - filing/confirmation status,
   - tax impact,
   - accounting balance impact,
   - row count and amount thresholds.
5. Produce a preview diff.
6. Require explicit user confirmation.
7. Execute in a transaction.
8. Write audit log and optional before/after export.

For high-risk actions, require accountant-role confirmation even if the requester is owner.

## 6. BYO Model Keys

Users may connect their own OpenAI, Anthropic, OpenRouter, or other supported keys. That reduces platform token-cost exposure, but it does not remove product responsibility:

- Show per-org model configuration.
- Track token usage and estimated cost where providers expose it.
- Let org admins set monthly limits.
- Let org admins disable write-capable AI tools.
- Never send cross-tenant data to a model.
- Log which provider/model handled each copilot request.

BYO keys mean users pay for usage. They do not mean we can skip safety, audit, or rate-limit controls.

## 7. Relationship to Phase 8

Phase 8 owns document extraction corrective learning.

Phase 16 owns the broader AI action surface:

- Chat UX.
- Tool registry.
- MCP exposure.
- Bulk actions.
- App-wide Q&A.
- AI-assisted accounting workflow operations.

The two phases share infrastructure:

- confirmed correction events,
- tool audit logs,
- model/provider configuration,
- org-scoped AI memory,
- safe preview/confirmation patterns.

Extraction correction chat should be implemented in Phase 8 first as a narrow use case. The general copilot should reuse the same patterns later.

## 8. MVP Scope

Do not start with unrestricted chat actions.

MVP should ship:

1. Read-only copilot over documents, vendors, accounts, VAT/WHT filings, and exceptions.
2. `preview_recode_documents` for account-code changes. First apply slice landed for draft document line `account_code` only; confirmed/posted/locked-period documents remain blocked.
3. App-side confirmation plus accountant-role enforcement for applying a recode to unlocked draft documents.
4. Audit log for chat, tool calls, preview, confirmation, and mutation.
5. Deterministic prompt-to-tool routing as a no-model first step toward natural-language chat.
6. BYO model-key configuration with owner/admin controls. Landed as settings-only configuration; live provider calls remain disabled until orchestration is implemented.

Out of MVP:

- Public MCP write tools.
- Autonomous scheduled agents.
- Actions against filed/confirmed/locked periods.
- Cross-org/global AI memory.
- Direct RD/DBD filing actions.

## 9. Success Criteria

- Users can ask operational accounting questions and get answers grounded in their org data.
- Users can safely preview and apply a small set of bulk corrections.
- Every mutation is reproducible from audit logs.
- The same action cannot bypass rules whether invoked from UI, copilot, MCP, or API.
- No high-risk write can execute without explicit confirmation.

## 10. Risks

| Risk | Severity | Mitigation |
|---|---|---|
| AI performs broad destructive edits | Critical | Preview-first tools, confirmations, row/amount thresholds, transactions, audit logs, period locks |
| MCP leaks tenant data | Critical | Org-scoped auth, no raw SQL, typed tools only, RBAC at service and DB layers |
| User over-trusts tax advice | High | Ground answers in app rules, cite source records, surface uncertainty, route high-impact advice to accountant review |
| Prompt injection from uploaded docs | High | Tool allowlist, no direct tool execution from document text, model output must pass schemas and confirmations |
| BYO keys create invisible costs | Medium | Usage logs, org limits, admin controls |
| Copilot duplicates business logic | High | Tools call existing application services; no separate mutation path |

## 11. Open Questions

1. Should public MCP writes ever be allowed, or should MCP be read/preview-only with app-side confirmation forever?
2. What role model should control AI write tools: owner-only, accountant-only, or per-tool permission grants?
3. Should accounting/tax answers cite internal help docs, official Thai sources, or both?
4. How should we store chat history for audit without retaining excessive sensitive content?
5. Should each org be able to choose provider/model per task class, or only one default model provider?
