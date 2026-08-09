# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

**Whoever keeps the books of a Thai SME.**
That may be a solo founder doing everything themselves, or a founder working alongside an accountant.
The product does not model which of them performs which task and must not assume a division of labour: any user may capture, confirm, reconcile, or file.

The one thing that does vary is **access**.
Multiple people may hold their own login to the same organization, and which areas a login can reach may differ by user type.

The role vocabulary is already decided suite-wide and is not Long Tua's to invent: `owner`, `admin`, `manager`, `staff`, `accountant`, `viewer`, defined once in platform core, with each app mapping them to its own capabilities (`020` §Identity & Access).
Identity is Clerk, suite-wide, already shipped here; authorization lives in our own database on Long Tua's `users` (clerk_id) + `org_memberships` (role) pattern, which the suite adopted as its standard.
What is *not* settled is Long Tua's local adoption of that model — consolidating onto platform core is a dedicated migration project with its own exec plan (`090` item 1), covering Clerk instance consolidation and a dual-write or view-compat phase for org/user tables.
Do not design around that consolidation or prejudge it; flag work that would.

What every user shares: they know their own transactions better than they know Thai tax rules, they capture evidence as it happens rather than in a sitting, and they reconcile in passes rather than continuously.

## Product Purpose

Long Tua (ลงตัว) uses AI and automation to make monthly accounting tractable for a Thai SME: collecting the documents, pulling the data out of them, reconciling against the sources of truth, and holding the business to Thai VAT and accounting standards.

Success is a month that closes with every bank movement explained, every input-VAT claim backed by a captured tax invoice, every withholding certificate issued, and every return filed on time — including the nil filings that are easy to forget precisely because nothing happened.

**The stakes are why this exists.**
Thai VAT penalties are heavy and the rules are genuinely confusing.
Failure is also silent, not loud: a missed PP 36 obligation, an input-VAT claim without the supplier's tax invoice, output VAT computed on a net payout instead of the gross sale — none of these announce themselves at the time.
The product's job is to make those failures structurally hard rather than to catch them at the deadline.

**Most v1 tenants will not be VAT-registered, and that must not feel like a stripped-down product.**
The decided target segment is solo founders and businesses under about five staff, typically below the ฿1.8M VAT-registration threshold (`090` item 7).
For them there is no PP 30, no §87 report, no abbreviated-tax-invoice apparatus — the working surface is income and expenses, documents, bank reconciliation, and withholding tax.
VAT is capability-gated and lights up when the tenant's flag flips.
So the VAT machinery above is what the product must get exactly right *when it applies*, not the default experience: a non-VAT tenant should experience a complete product, not a locked one.

**Teaching is part of the product, not documentation around it.**
Users should come to understand Thai tax compliance by doing the work in the interface, not by reading a manual first.
The stated ambition is to gamify Thai tax compliance — to make a confusing statutory obligation something a person learns naturally and even enjoys getting right.
The specific mechanics of that are not yet decided and must not be assumed.

## Positioning

**The sources of truth are the spine, not the invoice pile.**
Money in and money out are anchored to records the business did not author — bank statements, and incoming POS/sales data.
Every baht that moved must be explained by evidence — a supplier tax invoice, a customer invoice, or a merchant settlement — through a matching cascade that runs seven ordered layers and, when two candidates are equally good, refuses to pick and flags the ambiguity instead.

Tax output is *derived* from that reconciled evidence rather than typed in beside it.
A filing can therefore never be more confident than the reconciliation underneath it, and periods lock once filed so the evidence behind a submitted return cannot drift afterward.

**AI is the bootstrap; codified rules are the steady state.**
AI reads what has no parser yet and proposes what has no rule yet, and what it learns is progressively hardened into deterministic, cheap, fast paths — a bank-specific parser beside the generic one, a confirmed vendor alias, a reconciliation rule suggested after the same manual match recurs.
The intended trajectory is that a given customer's recurring work gets cheaper and faster over time rather than paying full AI cost forever.
This is a product goal with only partial implementation today: alias learning and rule suggestion exist in reconciliation, while the extraction-side learning loop was removed in the 2026-08 reduction.

**Compliance is taught, not just enforced.**
The rules the engine encodes are also the curriculum, surfaced at the moment they apply rather than in a help centre.

The differentiation is in the compliance details a general-purpose bookkeeping tool gets wrong by default:

- PP 36 reverse-charge VAT is declared as its own exact-period obligation and is never mixed into PP 30 input VAT.
- `fee_vat` on a processor settlement is only claimable once the processor's own tax invoice is captured — enforced as a database constraint, not a reminder.
- Output VAT is owed on the gross sale price, never on the net that lands in the bank after processor fees.
- Buddhist Era dates, Section 40 income classification, and RD form formats are native, not a localization layer bolted onto a Western ledger.

## Operating Context

**The weekly money loop** is the unit of use:
capture documents → AI extracts → a human confirms → bank statements import → the reconciliation cascade matches → exceptions get resolved by hand.

**The monthly filing cycle** sits on top:
VAT (PP 30) and withholding (PND 3 / 53 / 54) returns, 50 Tawi certificates for payees, RD CSV exports, and a compliance calendar that must account for Thai public holidays.

Real inputs the product is built around:

- Bank statements from KasikornBank (K-BIZ) as CSV and PDF, plus generic CSV from any other bank via a column mapper.
- POS/sales data as the money-in source of truth, arriving either from a sibling product in the suite or imported by the user from their own POS. Both paths are expected to exist; neither is a fallback for the other.
- Merchant processor settlement reports as CSV, which explain otherwise-mysterious deposits as `gross − fee − fee VAT = net`.
- Photographed or scanned supplier tax invoices and receipts, frequently captured on a phone away from a desk.

The interface is Thai and English, and any user may work in either.

## Capabilities and Constraints

**Confirmed and built:** document capture with AI extraction under an explicit human-confirmation gate; bank statement import and a seven-layer reconciliation cascade with learned vendor aliases and user rules; merchant settlement import and payout-to-deposit matching; VAT and withholding tax engines with a compliance calendar, filing lifecycle, and period locking; vendor records with Thai DBD company lookup.

**Part of a startup suite, on a decided data spine.**
Long Tua is both a standalone product and the suite's financial backbone (`090`).
The spine is not one mechanism but four layers, all decided and partly built in `/Users/zeno/Dev/startup-suite` — that repo is the source of truth and is read-only from here:

- **Shared database as substrate.** One physical cluster, one logical schema per domain — `core`, `pos`, `staff`, `crm`, `bi`, `acct`. Long Tua owns `acct`.
- **Schema ownership for writes.** Each app writes only its own schema plus `core` usage events. No app ever runs DDL on another schema.
- **Versioned published contracts for cross-app reads** — views or internal APIs in `@suite/contracts`, never raw foreign tables. A schema owner may refactor freely as long as the published views hold.
- **A transactional outbox for cross-schema effects** (Portable SQL Contract item 6), which is also how sale-critical usage metering flows.

Per-tenant isolation is **row-level `org_id`, not schema-per-tenant** — the target is thousands of small Thai retailers, not dozens of enterprises.

Long Tua is the *donor* of this shape, not a latecomer to it.
Its `org-scope.ts` pattern, audit-log convention, and soft-delete discipline became the suite standard, hardened in `@suite/db-core` into `forOrg()` — a handle that cannot be constructed without an org id, refuses cross-tenant inserts at runtime, and makes append-only tables fail to typecheck under `update()`.
`org_id` scoping and the audit log are therefore settled and built; that decision landed before the schema, not after it.

**Long Tua is the suite's single tax authority.**
VAT, WHT, and filing rules live here and are never forked into another app.
POS produces ledger *facts* — gross, base, VAT at the rate charged — and never filings.
Release cadence is deliberately not coupled to suite launches; contracts are versioned so Long Tua upgrades on its own schedule.

**The Portable SQL Contract binds new work here, and only new work.**
Long Tua predates the contract and currently exceeds it — FKs, partial indexes, and trigger-based period locks are load-bearing — so it sits explicitly *outside* the portable boundary today (`020`), converging progressively (`090` items 6 and 21) rather than by retrofit.
Three rules follow, and they govern design decisions, not just schema files:

1. **New tables conform now:** app-generated UUIDv7/ULID keys, no reliance on FK enforcement or cascades, every unique key `org_id`-leading and expressible as a plain unique index, a `unique_scope` discriminator instead of a partial index, no triggers or stored procedures or RLS in required paths, write patterns correct under READ COMMITTED.
2. **Do not retrofit existing nonconformances.** A big-bang re-key of a working compliance product is riskier than staged conformance. Re-key opportunistically, when already touching a table.
3. **Do not deepen the nonconformance.** New FK-dependent logic, new partial indexes, and new trigger-based period locks each create future conformance work. Where a lock is needed, use the portable recipe — a `period_locks` row read `SELECT ... FOR UPDATE` inside the writing transaction, or an optimistic `lock_epoch` re-checked at commit — never a new trigger.

**Deliberately removed on 2026-08-03** and registered in `docs/deferred-features.md`: general ledger and chart of accounts, POS/sales ingest, inventory, payroll, fixed assets, analytics, corporate income tax and year-end, imports, the AI copilot, and the AI self-teaching layer.
The application was cut from 82 routes to 39 because the owner found it unusable through excess rather than through defects.
Nothing from that register returns without the owner using the reduced application and asking for it by name.

Three entries on that register are now known to be returning rather than merely deferred, and their timing is the open question, not their fate:

- **POS/sales ingest** — suite POS publishes `pos_primary` rows and settlements through the contract outbox (`090` item 2), while the CSV and connector lanes stay for tenants on a third-party POS. That lane *is* Long Tua's standalone market, not a fallback.
- **Payroll** — Long Tua consumes the immutable versioned `payroll_run.finalized` snapshot when both apps are enabled, and remains the full payroll UI for accounting-only tenants. Statutory authority sits with Long Tua whenever it is enabled (`090` item 4).
- **The extraction learning loop** — which the AI-then-codify goal above depends on.

**Hard technical invariants** (see `CLAUDE.md` for the enforceable list): monetary amounts are `NUMERIC(14,2)` and rates `NUMERIC(5,4)`, never floating point; every database query is scoped by `org_id`; financial records are soft-deleted, never destroyed; every mutation is written to an audit log; background pipeline steps are idempotent.

**Explicitly undecided — do not invent:**

- **The `audit_log` carve-out — a live suite-level question, pending owner sign-off. Do not resolve it locally.** `020` authorizes each app to write its own schema plus core *usage events*, but `audit_log` also lives in `core` and is mandated suite-wide on financial-path mutations without being named in that carve-out. On a SingleStore-family engine, `core` is a separate database with no cross-database transaction, so an audit write cannot share a transaction with the mutation it audits. Until this is settled, Long Tua's audit writes stay inside Long Tua's own schema, and no cross-schema audit write is added.
- Long Tua's local adoption of platform core identity — a dedicated migration project (`090` item 1), not a design task. See Users above.
- Whether different user types see different screens or the same screens with different emphasis. The role vocabulary is decided; the surface treatment is not.
- Commercial specifics. The metered unit is decided — documents processed per month — and the packaging *direction* is free-with-usage-limits, then a base monthly subscription bundling cross-app quotas, then per-product upgrades. The numbers are the owner's to set and are not set.
- What "gamified" means concretely. Learning by doing is confirmed as a product function; progress mechanics, scoring, streaks, or any specific device are not.
- When Long Tua joins the spine. This is a roadmap question governed by `090` items 1 and 6 and by `docs/exec-plans/active/roadmap.md` — not an architecture question, and not one to answer inside a feature.

## Brand Commitments

**Name:** Long Tua — ลงตัว.
The Thai word means *settled, fitting, balanced, come out even*; it is what a reconciled month feels like, and the product name should not be treated as an arbitrary label.

**Bilingual parity is binding.**
Every user-facing string exists in both `src/i18n/messages/en.json` and `src/i18n/messages/th.json`.
Thai is not a translation of an English product — Thai script, Buddhist Era dates, and official RD form names (ภ.พ.30, ภ.ง.ด.53, 50 ทวิ) are the primary vocabulary of the domain.

**Phone-first capture is binding.**
Photographing a receipt on a phone is a primary entry path, not a desktop convenience. The capture flow and the mobile navigation that reaches it are load-bearing.

**AI suggests, humans confirm, is binding.**
No AI-extracted or AI-matched value becomes a record without a reviewable confirmation state.
This holds for future surfaces as well as existing ones; a surface that quietly commits an AI result breaks the product, not just a rule.

**The name is decided suite-wide.** Long Tua stands across all suite copy, Portal app-launcher naming, and package names; the earlier "Longdo" name is retired.

Visual direction is governed separately and completely by `DESIGN.md` and is out of scope for this document.
Note that `DESIGN.md` is upstream of the suite, not downstream: it seeds `@suite/ui`, and the pending `ui-consistency.md` work lands on that shared package (`090` item 3). A visual decision made here propagates to five other products.

## Evidence on Hand

- `thai-tax-compliance.html` and `vat-info.md` — the compiled Thai tax rules the engine encodes.
- `docs/_ai_context/_glossary.md` — the authoritative domain vocabulary, term by term, with the code that implements each.
- `docs/deferred-features.md` — the register of what was removed in the 2026-08 reduction, why, and what restoring it would cost.
- `docs/reviews/` — owner-approved design mockups and sign-off evidence for the 2026-08 UX reset.
- `benchmarks/` — extraction benchmark harness and fixtures.

**Absences future work must not paper over:** there are no customers, no testimonials, no case studies, no pricing, no usage data, and no production track record.
Statutory assumptions have **not** been reviewed by a CPA, and the DBD/TFRS output has not been validated against the authenticated Builder.
The golden-path end-to-end journey is the only one protected by CI.

## Product Principles

1. **Nothing is explained by assertion.** A number in a filing traces back to a matched bank movement and a captured document, or it does not appear. Confidence is inherited from evidence, never asserted on top of it — and the trace must be legible to a reader who did not capture the evidence and cannot ask anyone what happened.
2. **Refuse rather than guess.** When the system cannot tell two candidates apart it says so and hands the decision to a human. An ambiguous match surfaced is a success; an ambiguous match silently resolved is a defect.
3. **Compliance failures are silent, so make them structural.** Where a rule can be enforced by a constraint, a type, or the absence of a code path, enforce it there rather than in a warning a user can dismiss.
4. **Earn every surface.** The application was cut in half because unused features made the used ones unfindable. A new screen must be reachable in the weekly loop or the monthly close, or it does not ship.
5. **Explain at the point of consequence.** The user learns the rule where it bites — on the transaction, the claim, the deadline — not in documentation they would have to know to go looking for. Understanding is a deliverable, equal to the number being right.
6. **Every AI answer is a candidate for retirement.** What AI figures out once should become a parser, an alias, or a rule, so the same work is not re-bought every month. Cost and latency falling over a customer's lifetime is a product outcome, not an optimization.

## Accessibility & Inclusion

Thai and English are equal first-class languages, including Thai script rendering, Thai numerals where conventional, and Buddhist Era dates on anything that mirrors an official form.

Capture must work one-handed on a phone, in poor light, away from a desk — that is the real scene in which most evidence enters the system.

No formal conformance standard has been established for this product.
