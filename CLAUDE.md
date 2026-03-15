# Thai Accounting App

## Rules

1. Do not commit or push without explicit permission
2. Run build, test, and lint before every commit: `pnpm build && pnpm test && pnpm lint`
3. Use conventional commits: `type(scope): description`
4. All monetary values use `NUMERIC(14, 2)` for amounts, `NUMERIC(5, 4)` for rates — never floating point
5. Every database query must include `org_id` scoping — no cross-tenant data leaks
6. AI suggests, humans confirm — never auto-commit AI-extracted data without a reviewable state
7. PP 36 reverse-charge VAT NEVER offsets PP 30 input VAT — they are separate obligations with separate deadlines
8. Financial records are soft-deleted, never hard-deleted. WHT certificates are voided, never removed
9. Check the verification checklist at the end of this file before completing work

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
| Schema reference | `docs/exec-plans/active/001-schema.md` |
| Current phase | `docs/exec-plans/active/phase-*.md` (see overview for index) |
| Thai tax rules | `thai-tax-compliance.html` |
| Database schema | `src/lib/db/schema.ts` |
| AI extraction | `src/lib/ai/schemas/` |
| Bank parsers | `src/lib/parsers/` |
| WHT rates | `src/lib/tax/wht-rates.ts` (reads from DB `wht_rates` table) |
| Debugging | `docs/_ai_context/debugging-methodology.md` |
| Domain terms | `docs/_ai_context/_glossary.md` |

## gstack Workflow Skills

| Phase | Skill | Mode |
|-------|-------|------|
| Product thinking | `/plan-ceo-review` | Founder/CEO — find the 10-star product |
| Engineering design | `/plan-eng-review` | Eng manager — architecture, diagrams, edge cases |
| Code review | `/review` | Staff engineer — bugs that pass CI but break prod |
| Ship | `/ship` | Release engineer — sync, test, push, PR |
| QA | `/qa` | QA lead — diff-aware, full, quick, regression modes |
| Browser testing | `/browse` | QA engineer — headless Chromium for live URLs |
| Cookie import | `/setup-browser-cookies` | Import real browser sessions for auth testing |
| Retrospective | `/retro` | Eng manager — weekly metrics and team analysis |

Browser skills (`/browse`, `/qa`, `/setup-browser-cookies`) require the compiled binary. Build with: `cd .claude/skills/gstack && ./setup`

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
