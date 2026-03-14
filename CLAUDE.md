# Thai Accounting App

## Rules

1. Do not commit or push without explicit permission
2. Run build and lint before every commit: `pnpm build && pnpm lint`
3. Use conventional commits: `type(scope): description`
4. Verify execution paths before refactoring — trace from entrypoints first
5. Do not leave TODO placeholders in completed code
6. Use `/browse` for all web browsing — never use `mcp__claude-in-chrome__*` tools

## System Overview

| Component | Technology | Location |
|-----------|-----------|----------|
| Framework | Next.js 16 (App Router) | `src/app/` |
| Language | TypeScript | `*.ts`, `*.tsx` |
| Styling | Tailwind CSS v4 | `globals.css` |
| UI | React 19 | Components in `src/` |

## Build, Test & Lint

```bash
pnpm build    # Next.js production build
pnpm lint     # ESLint
pnpm dev      # Dev server (localhost:3000)
```

## Git Workflow

- Branch from `main`, PR back to `main`
- Remote: `https://github.com/ff-zeno/thai-accounting-app.git`

## Context Map

| Working on... | Read these |
|---------------|-----------|
| Any code work | `docs/_ai_context/code-quality-guidelines.md` |
| Debugging | `docs/_ai_context/debugging-methodology.md` |
| Planning work | `docs/_ai_context/work-planning-process.md` |
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
- [ ] Lint passes (`pnpm lint`)
- [ ] No TODO placeholders remain
- [ ] Changes are scoped to what was requested
