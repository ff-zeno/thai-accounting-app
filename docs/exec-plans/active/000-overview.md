# Thai Accounting Platform — Plan Overview

**Status:** Active — Rev 3 (post round-2 review)
**Created:** 2026-03-14

## Quick Navigation

| Phase | Doc | Status |
|-------|-----|--------|
| Scope & Architecture | [000-overview.md](000-overview.md) (this file) | Final |
| Schema Reference | [001-schema.md](001-schema.md) | Final |
| Validation Sprint | [phase-0-validation.md](phase-0-validation.md) | Not started |
| Phase 1a: Infrastructure | [phase-1a-infrastructure.md](phase-1a-infrastructure.md) | Not started |
| Phase 1b: App Shell | [phase-1b-app-shell.md](phase-1b-app-shell.md) | Not started |
| Phase 2: Bank Statements | [phase-2-bank-statements.md](phase-2-bank-statements.md) | Not started |
| Phase 3: Documents & AI | [phase-3-documents-ai.md](phase-3-documents-ai.md) | Not started |
| Phase 4: Reconciliation | [phase-4-reconciliation.md](phase-4-reconciliation.md) | Not started |
| Phase 5: WHT & Tax | [phase-5-wht-tax.md](phase-5-wht-tax.md) | Not started |
| Phase 6: VAT & Reporting | [phase-6-vat-reporting.md](phase-6-vat-reporting.md) | Not started |

## Scope Definition

This is a **tax compliance and filing preparation tool**, not a full double-entry accounting system. It manages document ingestion, WHT/VAT calculation, certificate generation, and filing prep. It does NOT replace FlowAccount/Peak for journal entries, chart of accounts, or audited financials.

### Explicitly Out of Scope (V1)

- Double-entry bookkeeping / journal entries / chart of accounts
- CIT calculations (PND 50/51)
- Payroll (PND 1 employee salary WHT, SSO contributions)
- Stamp duty (Or. Sor. 9)
- DTA treaty rate application (default to statutory rates; DTA is V2)
- RD e-Filing portal automation (RPA/Playwright)
- Authentication, billing, user management (layered in later)
- Offline/PWA capabilities beyond basic mobile capture
- Cash transactions tracking (deferred to V2)
- MCP server (deferred to V2 — Inngest steps use direct DB calls)

## Architectural Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Multi-tenancy | Row-level isolation (org_id + application-level WHERE) | RLS deferred to auth phase; app-level scoping for now |
| ORM | Drizzle ORM | Type-safe, SQL-like, lightweight, Neon-native |
| Background jobs | Inngest | Step-based retry, Vercel-native, LLM offloading |
| Bank parsing | Format-specific parsers + AI fallback | Deterministic = testable; AI for unknowns |
| UI components | shadcn/ui + TanStack Table | Full control, Tailwind-native, data-heavy UI |
| AI model selection | Benchmark harness first | Data-driven tiering after testing 5 models |
| PDF generation | React-PDF (@react-pdf/renderer) | React components, Thai font support, server-side |
| AI integration | Vercel AI SDK + @openrouter/ai-sdk-provider | Streaming, generateObject, tool use |
| Blob storage | Abstracted interface (Vercel Blob initially) | 1 GB hobby limit; interface enables R2/S3 migration |
| Package manager | pnpm | User preference |
| Monitoring | Sentry + Inngest failure webhooks | Non-negotiable for financial software |
| Test DB | Docker Compose with local Postgres | Real Postgres for constraint/numeric testing |

## System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        THAI ACCOUNTING APP                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌──────────┐  ┌──────────────┐  ┌───────────────┐  ┌───────────┐ │
│  │  Org      │  │  Bank        │  │  Document     │  │  Tax &    │ │
│  │  Switcher │  │  Statements  │  │  Upload &     │  │  Filing   │ │
│  │  & Mgmt   │  │  & Txns      │  │  AI Extract   │  │  Engine   │ │
│  └─────┬─────┘  └──────┬───────┘  └───────┬───────┘  └─────┬─────┘ │
│        │               │                  │                │       │
│        └───────┬───────┴──────────┬───────┴────────┬───────┘       │
│                │                  │                │                │
│         ┌──────▼──────┐   ┌──────▼──────┐  ┌──────▼──────┐        │
│         │ Reconcil-   │   │ Vendor      │  │ Reporting   │        │
│         │ iation      │   │ Registry    │  │ & Export    │        │
│         │ Engine      │   │ (DBD API)   │  │ (RD/FA/PA)  │        │
│         └─────────────┘   └─────────────┘  └─────────────┘        │
│                                                                     │
│  ═══════════════════════════════════════════════════════════════    │
│         Neon Postgres (Drizzle) — org_id scoping on all queries    │
│  ═══════════════════════════════════════════════════════════════    │
│                                                                     │
│  ┌────────────┐ ┌──────────┐ ┌─────────┐ ┌──────────────┐         │
│  │ OpenRouter  │ │ Blob     │ │ Inngest │ │ DBD Open API │         │
│  │ (AI/LLM)   │ │ Storage  │ │ (Jobs)  │ │ (Company DB) │         │
│  └────────────┘ └──────────┘ └─────────┘ └──────────────┘         │
└─────────────────────────────────────────────────────────────────────┘
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router, Turbopack) |
| Language | TypeScript (strict) |
| Styling | Tailwind CSS 4 |
| Components | shadcn/ui, TanStack Table, react-hook-form + zod |
| Database | Neon Postgres (Launch tier $19/mo for prod) |
| ORM | Drizzle ORM + drizzle-kit |
| Blob storage | Abstracted (Vercel Blob → R2/S3) |
| AI/LLM | Vercel AI SDK + @openrouter/ai-sdk-provider |
| Background jobs | Inngest |
| PDF generation | @react-pdf/renderer + Sarabun font |
| Testing | Vitest + Playwright + Docker Postgres |
| Monitoring | Sentry |

## Conventions

- **Money:** `NUMERIC(14,2)` for amounts, `NUMERIC(5,4)` for rates. Never floating point.
- **Timestamps:** `TIMESTAMPTZ` stores UTC. `DATE` columns are Thai local dates. UI displays in `Asia/Bangkok` (UTC+7, no DST).
- **Buddhist Era:** Thai tax forms use พ.ศ. (Gregorian + 543). Internal storage uses Gregorian. Display/export converts via `toBuddhistYear()`. Certificate sequence counters store Gregorian year.
- **Soft delete:** All tables have `deleted_at TIMESTAMPTZ` EXCEPT `audit_log` (immutable) and `wht_sequence_counters` (never deleted).
- **Audit:** All mutations logged to `audit_log`. Middleware deferred to Phase 4 when workflows stabilize; table created in Phase 1.
- **Org scoping:** Every query includes `WHERE org_id = ?` at the application level. RLS deferred to auth phase.
- **Pipeline idempotency:** One Inngest function per document (not per file). Event idempotency key = `document.id`. Steps use `document_files.id` in step names. All writes use UPSERT.
- **WHT certificates:** Voided, never deleted. Sequence numbers never reused. Format: `{form_type}/{gregorian_year}/{seq}`.
- **VAT:** `net_vat_payable = output_vat - input_vat_pp30`. PP 36 reverse charge is SEPARATE — never offsets PP 30. Different deadline (15th vs 23rd).
- **Async UI:** Optimistic UI on user actions ("Processing..." badge), poll via SWR/React Query every 5s until status stabilizes.

## Key Design Principles

1. **Bank statements are the source of truth.**
2. **AI suggests, humans confirm.** Reconciliation triggers AFTER user confirms WHT in review UI.
3. **Deterministic where possible.** AI only for: OCR, unknown format parsing, reconciliation ranking, service type classification.
4. **Multi-tenant from day one.** Every query scoped by org_id.
5. **Auditable.** Soft-delete, audit log, voided certificates preserved.
6. **Configurable tax parameters.** VAT rate, e-filing extension, e-WHT validity in DB, not code.
7. **Idempotent pipelines.** Safe to retry without duplicates.
8. **PP 36 is never PP 30.** Separate obligation, separate deadline, never offsets.
9. **Tests at every layer.** Parsers, tax calcs, AI accuracy benchmarks, E2E.

## Reviews

| Round | Engineering | Product | Consolidated |
|-------|------------|---------|-------------|
| 1 | [review-engineering](../../reviews/review-engineering-2026-03-14.md) | [review-product](../../reviews/review-product-business-2026-03-14.md) | [consolidated](../../reviews/consolidated-findings-2026-03-14.md) |
| 2 | [round2-engineering](../../reviews/review-round2-engineering-2026-03-14.md) | [round2-product](../../reviews/review-round2-product-2026-03-14.md) | (this revision) |
