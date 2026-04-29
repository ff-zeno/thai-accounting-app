# Thai Accounting App

## Rules

1. Do not commit or push without explicit permission
2. Run build, test, and lint before every commit: `pnpm build && pnpm test && pnpm lint`
3. Use conventional commits: `type(scope): description`
4. All monetary values use `NUMERIC(14, 2)` for amounts, `NUMERIC(5, 4)` for rates — never floating point
5. Every database query must include `org_id` scoping — no cross-tenant data leaks
6. AI suggests, humans confirm — never auto-commit AI-extracted data without a reviewable state
7. Check the verification checklist at the end of this file before completing work

## System Overview

| Component | Technology | Location |
|-----------|-----------|----------|
| Framework | Next.js 16 (App Router) | `src/app/` |
| Language | TypeScript (strict) | `*.ts`, `*.tsx` |
| Styling | Tailwind CSS 4 + shadcn/ui | `src/components/ui/` |
| Database | Neon Postgres + Drizzle ORM | `src/lib/db/` |
| Blob storage | Abstracted (Vercel Blob initially) | `src/lib/storage/` |
| Monitoring | Sentry + Inngest webhooks | — |
| AI/LLM | Vercel AI SDK + OpenRouter | `src/lib/ai/` |
| Background jobs | Inngest | `src/lib/inngest/` |
| PDF generation | @react-pdf/renderer | `src/lib/pdf/` |
| Bank parsers | Custom per-bank + AI fallback | `src/lib/parsers/` |
| Tax engine | WHT rates, VAT calc, filing | `src/lib/tax/` |
| Testing | Vitest + Playwright | `src/tests/` |
| Package manager | pnpm | — |

## Build, Test & Lint

```bash
pnpm dev          # Dev server (Turbopack)
pnpm build        # Production build
pnpm test         # Vitest unit tests
pnpm test:db      # Integration tests (requires Docker Postgres)
pnpm lint         # ESLint
pnpm db:generate  # Generate Drizzle migrations
pnpm db:migrate   # Run migrations (uses DATABASE_URL_UNPOOLED)
pnpm db:seed      # Seed WHT rates and tax config
pnpm db:studio    # Drizzle Studio
```

## Git Workflow

- Branch from `main`, PR back to `main`
- Remote: `https://github.com/ff-zeno/thai-accounting-app.git`

## Context Map

| Working on... | Read these |
|---------------|-----------|
| Any code work | `docs/_ai_context/code-quality-guidelines.md` |
| Plan overview | `docs/exec-plans/active/000-overview.md` |
| Roadmap | `docs/exec-plans/active/roadmap.md` |
| Schema reference | `docs/exec-plans/active/001-schema.md` |
| Thai tax rules | `thai-tax-compliance.html` |
| Database schema | `src/lib/db/schema.ts` |
| DB queries | `src/lib/db/queries/` (documents, transactions, payments, vendors, wht-certificates, vat-records, reconciliation, reconciliation-metrics, reconciliation-rules, wht-filings, wht-rates, dashboard, ai-suggestions, ai-settings, vendor-aliases, bank-accounts, organizations, document-files) |
| DB helpers | `src/lib/db/helpers/org-scope.ts` (org isolation), `src/lib/db/helpers/audit-log.ts` (mutation logging), `src/lib/db/helpers/learn-alias.ts` (batched alias learning from matches) |
| AI extraction | `src/lib/ai/schemas/` (invoice + ID card), `src/lib/ai/extract-document.ts`, `src/lib/ai/extract-id-card.ts` |
| AI reconciliation | `src/lib/ai/prompts/reconciliation-batch.ts` (prompt builder), `src/lib/ai/schemas/reconciliation-match.ts` (index-based schema), `src/lib/ai/reconciliation-cost-tracker.ts` (separate budget) |
| Inngest pipeline | `src/lib/inngest/functions/process-document.ts` (7-step extraction), `src/lib/inngest/functions/reconcile-document.ts` (7-layer match cascade), `suggest-rules.ts` (auto-rule suggestion), `ai-reconciliation-dispatcher.ts` (hourly cron), `ai-reconciliation-batch.ts` (per-org AI matching), `match-imported-transactions.ts` (transaction-first) |
| Bank parsers | `src/lib/parsers/` (KBank CSV/PDF, generic CSV, balance validation) |
| Tax engine | `src/lib/tax/` (filing-deadlines, filing-calendar, rd-csv-export, vat-register, service-categories) |
| WHT rates | `src/lib/db/queries/wht-rates.ts` (reads from DB `wht_rates` table) |
| Reconciliation | `src/lib/reconciliation/matcher.ts` (7-layer cascade: reference, alias, exact, rule, multi-signal, split, ambiguous), `match-display.ts` (explanations + confidence), `templates/` (industry rule templates) |
| Recon rules | `src/lib/db/queries/reconciliation-rules.ts` (CRUD + dedup), `src/app/(app)/settings/reconciliation-rules/` (management UI) |
| Vendor aliases | `src/lib/db/queries/vendor-aliases.ts` (auto-learn from manual matches, auto-confirm at 3 occurrences) |
| Recon insights | `src/app/(app)/reconciliation/insights/` (metrics dashboard, confidence trend, PDF export), `src/lib/db/queries/reconciliation-metrics.ts` (11 aggregation queries incl. quality score + confidence trend) |
| AI review | `src/app/(app)/reconciliation/ai-review/` (approve/reject AI suggestions), `src/app/(app)/reconciliation/review/actions.ts` (approve/reject/rematch server actions) |
| Data exports | `src/lib/export/` (FlowAccount, Peak, full data export) |
| External APIs | `src/lib/api/dbd-client.ts` (Thai DBD company lookup, no auth) |
| PDF generation | `src/lib/pdf/fifty-tawi.tsx` (50 Tawi WHT certificate), `src/lib/pdf/reconciliation-summary.tsx` (monthly recon PDF), `src/app/api/reconciliation-summary/route.ts` (PDF download API) |
| Debugging | `docs/_ai_context/debugging-methodology.md` |
| Domain terms | `docs/_ai_context/_glossary.md` |
| Recon architecture | `docs/_ai_context/reconciliation-architecture.md` |

## Workflow Skills (scoped to what this project actually uses)

| Phase | Skill | Mode |
|-------|-------|------|
| Product thinking | `/plan-ceo-review` | Founder/CEO — find the 10-star product |
| Engineering design | `/plan-eng-review` | Eng manager — architecture, diagrams, edge cases |
| Design plan review | `/plan-design-review` | Designer — UI/UX gaps before implementation |
| Visual audit | `/design-review` | Designer — post-ship visual QA |
| Browser testing | `/browse` | QA engineer — headless Chromium for live URLs |
| Cookie import | `/setup-browser-cookies` | Import real browser sessions for auth testing |

Browser skills (`/browse`, `/setup-browser-cookies`) require the compiled binary. Build with: `cd .claude/skills/gstack && ./setup`

## Design System
Always read DESIGN.md before making any visual or UI decisions.
All font choices, colors, spacing, and aesthetic direction are defined there.
Do not deviate without explicit user approval.
In QA mode, flag any code that doesn't match DESIGN.md.

## Verification Checklist

Before marking work as complete, verify:
- [ ] Code builds without errors (`pnpm build`)
- [ ] Tests pass (`pnpm test`)
- [ ] Lint passes (`pnpm lint`)
- [ ] No TODO placeholders remain in completed code
- [ ] Changes are scoped to what was requested
- [ ] All DB queries include org_id scoping
- [ ] Monetary math uses NUMERIC(14,2) for amounts, NUMERIC(5,4) for rates
- [ ] New AI interactions have confidence scores and review flags
- [ ] Mutations are logged to audit_log
- [ ] Financial records use soft-delete (deleted_at), never hard-delete
- [ ] Inngest steps are idempotent (safe to retry)
- [ ] PP 36 VAT is NOT mixed into PP 30 input VAT calculations

## Skill routing

When the user's request matches an available skill, ALWAYS invoke it using the Skill
tool as your FIRST action. Do NOT answer directly, do NOT use other tools first.
The skill has specialized workflows that produce better results than ad-hoc answers.

Key routing rules:
- Strategy / scope / "think bigger" / rethink a plan → invoke plan-ceo-review
- Architecture review / "lock in the plan" / engineering review → invoke plan-eng-review
- Design plan review / UI plan critique before implementation → invoke plan-design-review
- Visual audit / design polish / "does it look good" → invoke design-review
- Browser testing / open URL / live-site QA → invoke browse
- Import browser cookies / authenticated browser testing → invoke setup-browser-cookies
