# Phase 16 — AI Copilot and Tool/MCP Action Layer

**Status:** Draft
**Date:** 2026-05-01
**Depends on:** Phase 8 corrective learning, Phase 10.5 GL primitives, Phase 15 UI nav refactor, hardened audit/period-lock baseline
**Related:** `phase-8-extraction-learning-loop.md`, `phase-10-5-gl-primitives.md`, `phase-14-analytics-audit-pack.md`

## 1. Purpose

Make AI a first-class operating surface in the accounting app, not only a background extractor.

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
2. `preview_recode_documents` for account-code changes.
3. App-side confirmation for applying a recode to unlocked draft documents.
4. Audit log for chat, tool calls, preview, confirmation, and mutation.
5. BYO model-key configuration with org admin controls.

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
