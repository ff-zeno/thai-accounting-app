# Consolidated Review Findings

**Date:** 2026-03-14
**Sources:** Opus (Engineering) + Sonnet (Product/Business)
**Plan:** docs/exec-plans/active/001-thai-accounting-platform.md

---

## Consensus: What Both Reviews Agreed On

Both reviewers independently identified the same core structural problems, which gives high confidence these are real issues:

1. **Reconciliation is broken for WHT-bearing invoices** — The payment amount ≠ invoice amount after WHT deduction, and the schema has no way to model this
2. **1:1 transaction-document model is wrong** — Must be M:N junction table
3. **WHT certificates have no link to source documents** — Cannot trace or audit
4. **No audit timestamps or change tracking** — Non-negotiable for financial software
5. **50 Tawi sequence numbering is underspecified** — Needs year-scoping, form-scoping, void handling
6. **PP 36 reverse-charge VAT must never offset PP 30 input VAT** — Compliance risk
7. **Pipeline reconciliation runs before WHT is confirmed** — Will always fail for service invoices
8. **Annual filings absent** — PND 1 Gor, fiscal year config missing
9. **Export formats unverified** — RD, FlowAccount, Peak formats assumed but not researched
10. **Multiple unvalidated assumptions** — DBD API, KBank format, React-PDF Thai rendering

---

## Unified Issue List (Deduplicated, Ranked)

### CRITICAL — Must Fix Before Phase 1 Schema Ships

| # | Issue | Source | Action |
|---|-------|--------|--------|
| C1 | **Missing `payments` table** — WHT deduction means bank txn ≠ invoice total. Core reconciliation breaks. | Both | Add `payments` table: `gross_amount`, `wht_withheld`, `net_paid`, `payment_method`, FKs to document + transaction |
| C2 | **Reconciliation must be M:N** — Split payments, batch payments, bank fees all break 1:1 model | Both | Replace `transactions.reconciled_doc_id` with `reconciliation_matches` junction table |
| C3 | **WHT certificates need document traceability** — Cannot audit, correct, or generate PND 1 Gor without it | Both | Add `wht_certificate_items` detail table linking certificates to document line items |
| C4 | **No audit timestamps on any table** — 5-year retention requirement, cannot prove when records were created | Opus | Add `created_at`, `updated_at` to every table. Add `audit_log` table for mutations |
| C5 | **Pipeline not idempotent** — Retries create duplicate documents, certificates, VAT entries | Opus | Use `document_files.id` as idempotency key. DB transactions in write steps. Upsert pattern |
| C6 | **PND 54 rate table incomplete** — Dividends default to 10%, not 15%. Over-withholding is compliance error | Opus | Expand to all 7 foreign payment types with correct default rates |
| C7 | **50 Tawi sequence needs year/form scoping + void handling** — Legal requirement for running sequence | Both | Format: `{form_type}/{year}/{N}`. Counter table with DB lock. Never delete, void instead |

### HIGH — Must Fix Before Relevant Phase Begins

| # | Issue | Source | Phase | Action |
|---|-------|--------|-------|--------|
| H1 | **PP 36 VAT must not offset PP 30** — Compliance violation if mixed | Both | P1 | Rename to `input_vat_pp30`. Separate `pp36_amount`. Explicit formula |
| H2 | **Reconciliation runs before WHT confirmed** — Pipeline step 7 uses unconfirmed WHT | Sonnet | P3 | Move reconciliation to post-review trigger, not upload pipeline |
| H3 | **Missing org branch_number** — Required on 50 Tawi and PND forms | Opus | P1 | Add `branch_number VARCHAR(5) DEFAULT '00000'` |
| H4 | **No exchange rate on documents** — PND 54 foreign currency needs THB conversion | Opus | P1 | Add `exchange_rate NUMERIC(12,6)` + `total_amount_thb` |
| H5 | **No RD payment type codes** — RD CSV needs Section 40 codes, not labels | Opus | P1 | Add `rd_payment_type_code` or lookup table |
| H6 | **WHT rate lookup needed in Phase 3 but built in Phase 5** — Pipeline step 6 depends on it | Opus | P3 | Extract core rate lookup function into Phase 3 |
| H7 | **e-WHT reduced rates not modeled** — 3%→1% for e-WHT, may be extended to 2026 | Both | P5 | Make rates configurable via table with effective dates |
| H8 | **No pipeline failure recovery** — No dead letter queue, no retry UI, no partial completion status | Opus | P3 | Add `pipeline_status` to `document_files`. Manual retry button |
| H9 | **Reconciliation concurrency** — Concurrent uploads could double-match same transaction | Opus | P4 | Inngest concurrency controls + unique constraint on matches |
| H10 | **Mobile UX not designed** — Core stated need unmet. Desktop sidebar app only | Sonnet | P3 | Add `/capture` route. PWA manifest. Camera input |
| H11 | **No integration test for Inngest pipeline** — Most complex subsystem untested as a whole | Opus | P3 | Mock AI+Blob, real test DB, test happy+failure+dedup paths |
| H12 | **Vercel Blob 1 GB limit** — ~1,000 docs then hard block | Opus | P1 | Abstract blob storage behind interface. Plan R2/S3 migration |
| H13 | **WHT certificate void/correction workflow missing** — Cannot void and reissue | Both | P5 | Add `voided`/`replaced` statuses, `replacement_certificate_id` FK |
| H14 | **Annual filings absent** — PND 1 Gor, fiscal year config | Both | P5 | Add `fiscal_year_start_month/day` to orgs. PND 1 Gor in Phase 5 |
| H15 | **VAT records no audit trail to source** — PP 30 register requires per-invoice detail | Both | P1 | Compute from source `documents` data, not stored aggregates |
| H16 | **DTA treaty handling undesigned** — 61+ treaties, DTR pre-filing required | Both | P5 | MVP: default to statutory rates. Document DTA as V2 |

### MEDIUM — Should Fix, Can Be Addressed Iteratively

| # | Issue | Source | Action |
|---|-------|--------|--------|
| M1 | No soft delete mechanism | Opus | Add `deleted_at` to tables, or use status fields |
| M2 | Credit/debit notes have no parent reference | Both | Add `related_document_id FK` to documents |
| M3 | Missing indexes specification | Opus | Define indexes in Phase 1. Unique on `vendors(org_id, tax_id)` |
| M4 | `numeric(12,2)` insufficient for rate precision | Opus | Use `numeric(5,4)` for rates, `numeric(14,2)` for amounts |
| M5 | No fiscal year end configuration | Opus | Add to organizations table |
| M6 | No vendor contact/email/payment terms | Sonnet | Add fields to vendors table |
| M7 | WHT monthly filings won't generate correct RD CSV | Sonnet | Generate dynamically from certificates, not stored blob |
| M8 | Nil PP 30 filing not tracked | Sonnet | Add nil filing tracking, calendar shows every month |
| M9 | No user roles/permissions placeholder | Opus | Add `users` stub, nullable `created_by` FKs |
| M10 | AI cost tracking per extraction | Opus | Add `ai_cost_tokens`, `ai_model_used` to `document_files` |
| M11 | Image quality detection underspecified | Opus | Preprocessing step for resolution/quality check |
| M12 | `organizations.is_sme` is static but changes yearly | Sonnet | Consider per-fiscal-year tracking |
| M13 | No data export/backup mechanism | Opus | Full data export feature in Phase 6 |
| M14 | MCP server has no authentication | Opus | Add API key check even in MVP |
| M15 | No monitoring/alerting (Sentry) | Opus | Add error tracking in Phase 1 |

### LOW — Backlog / V2

| # | Issue | Source | Action |
|---|-------|--------|--------|
| L1 | MCP over-engineered for MVP | Sonnet | Defer to V2, use direct DB calls in Inngest |
| L2 | Benchmark harness no stopping criterion | Sonnet | Define: >90% accuracy clean, >75% photos. Timebox 2 days |
| L3 | Thai localization not addressed | Opus | Thai fonts for PDF in Phase 5 |
| L4 | No journal entries / double-entry bookkeeping | Sonnet | Scope as "tax compliance tool" not "accounting system". Add nullable `account_code` for future |
| L5 | Inngest setup should be in Phase 1 not Phase 3 | Opus | Move setup to Phase 1 |
| L6 | Vendor CRUD should precede Phase 3 | Opus | Basic vendor management in Phase 2 |

---

## Unvalidated Assumptions (Must Resolve Before Building)

| # | Assumption | Risk | Action | Blocking Phase |
|---|-----------|------|--------|---------------|
| U1 | KBank CSV/PDF format is known | HIGH | Download actual statement | Phase 2 |
| U2 | DBD Open API is accessible | HIGH | Test the endpoint, register | Phase 3 |
| U3 | RD e-Filing CSV format is known | HIGH | Obtain from portal or accountant | Phase 5 |
| U4 | React-PDF renders Thai 50 Tawi correctly | MEDIUM | Build proof-of-concept | Phase 5 |
| U5 | Inngest + Next.js 16 integration works | MEDIUM | Build minimal PoC | Phase 1 |
| U6 | FlowAccount/Peak import formats | MEDIUM | Obtain sample templates | Phase 6 |
| U7 | OpenRouter vision models available | MEDIUM | Verify 3+ models with pricing | Phase 3 |
| U8 | Vercel Blob sufficient (1 GB hobby) | CONSTRAINED | Plan migration path | Phase 1 |
| U9 | Neon free tier sufficient (0.5 GB, cold starts) | CONSTRAINED | Budget for Launch tier ($19/mo) | Phase 1 |
| U10 | VAT rate stays 7% | VALIDATED thru Sep 2026 | Make configurable, not hardcoded |
| U11 | e-Filing +8 day extension applies | VALIDATED thru Jan 2027 | Make configurable |
| U12 | e-WHT reduced rates extended to 2026 | UNCONFIRMED | Verify, make configurable | Phase 5 |

---

## Recommended Pre-Implementation Sprint (2-3 Days)

Before writing Phase 1 code, resolve the top blockers:

**Day 1: Validation**
- [ ] Test DBD Open API endpoint (U2)
- [ ] Download KBank CSV/PDF statement sample (U1) — ask user if they have one
- [ ] Build PoC: Next.js 16 + Inngest hello-world on Vercel (U5)
- [ ] Build PoC: React-PDF with Thai font (Sarabun) rendering 50 Tawi template (U4)

**Day 2: Schema Revision**
- [ ] Apply all C1-C7 critical fixes to Drizzle schema
- [ ] Apply H1-H5 high fixes to schema
- [ ] Apply M1-M5 medium schema fixes
- [ ] Define all indexes and constraints (M3)

**Day 3: Plan Update**
- [ ] Revise execution plan with findings
- [ ] Update pipeline: remove auto-reconciliation from upload flow (H2)
- [ ] Extract WHT rate lookup into Phase 3 scope (H6)
- [ ] Add mobile `/capture` route to Phase 3 (H10)
- [ ] Document explicit out-of-scope items (DTA, CIT, payroll, journal entries)
- [ ] Move Inngest + vendor CRUD setup to Phase 1/2 (L5, L6)

---

## Issues Unique to Each Review (Not Overlapping)

**Opus found that Sonnet missed:**
- Pipeline idempotency (C5) — retries creating duplicates
- Neon cold start risk with Inngest step execution (A-1)
- Image quality preprocessing before AI (P-3)
- MCP server authentication (M14)
- Monitoring/alerting strategy (M15)
- AI cost tracking per extraction (M10)

**Sonnet found that Opus missed:**
- The specific payment workflow math (invoice 10,700 → WHT 300 → transfer 10,400) making reconciliation structurally broken
- Mobile `/capture` route as a core unmet user need (H10)
- Period locking after filing (preventing edits to filed months)
- Document amendment workflow (void + reissue vs edit)
- Nil PP 30 filing obligation tracking (M8)
- Scoping clarity: "tax compliance tool" vs "accounting system" (L4)
