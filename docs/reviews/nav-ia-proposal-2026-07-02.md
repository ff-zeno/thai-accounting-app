# Navigation & IA Proposal — Guided Compliance Shell

**Date:** 2026-07-02 · **Source:** founder walkthrough feedback · **Status:** APPROVED 2026-07-02 (all four decisions)

> **Founder decisions (2026-07-02):** 1) Tier-1 structure approved as proposed (incl. Tax→Compliance,
> Sales & POS). 2) Both accordions AND Reports hub. 3) Real per-user pins (dynamic, user-based config).
> 4) Education greenlit and EXPANDED: a Help button on every page opening a right sidebar with
> English/Thai content, plus in-app flow charts (React Flow) for hard concepts — education is core product.
> Implementation notes: `/reports` is actually the data-exports page, so the Reports hub lives at
> `/accounting/reports` (new index route, no moves). `organizations` already has `is_vat_registered`
> and `has_pos_sales`; the tax profile adds `has_employees` + `has_imported_services` columns only.
**Mode:** Expansion — the goal is not menu cleanup but "the interface teaches a non-tax-professional what to do and when."

## The problem, restated

- 54 nav items total; "More" alone holds 29 across 6 unrelated groups. Settings hides between Vendors and Cost Centers.
- Home is a category with one item (Home → Home → Home).
- Tax is organized by tax *type* (correct for accountants) with no layer that explains *obligations* to a business owner.
- POS/sales is buried in "More > Tools" but is strategically important (integration with the founder's other app).
- North star: everything functional and available, but the default surface shows the monthly loop, not the whole ledger.

## Proposed tier-1 structure (7 categories + anchored Settings)

```
 ┌──────┐
 │ HOME │  Dashboard = compliance cockpit + user-pinned shortcuts
 │ BANK │  Accounts · Upload statement                     (unchanged)
 │ DOCS │  Expenses · Income · Upload · Capture            (unchanged)
 │ RECON│  Overview · AI Review · Review · Insights · Rules (unchanged)
 │ SALES│  Sales & POS — /sales today; POS integration + channel reporting later
 │ COMPL│  Compliance (was Tax) — This Month · VAT · WHT · Calendar · Reports
 │ OPS  │  Operations — collapsed groups: Accounting · Reports hub · Inventory
 │      │    & Imports · Payroll · Fixed Assets · Year-End · Master Data
 ├┄┄┄┄┄┄┤
 │ ⚙ SET│  Settings — anchored at the strip bottom (org, users, AI, admin tools)
 └──────┘
```

Key moves:
1. **Home = cockpit.** Tier-2 panel lists the user's pinned shortcuts; the page shows: this month's obligations (deadline engine already computes them), pipeline counts (docs awaiting review, unmatched transactions, AI suggestions pending), and the pinned tiles. New `user_nav_pins` table (org_id + user_id scoped, ordered).
2. **"More" dies.** Operations keeps the long tail but tier-2 groups become **collapsible accordions, default collapsed** (persisted open-state per user in localStorage). ~29 items → 7 headers at rest.
3. **Reports hub.** One `/reports` destination with a report switcher (tabs/select) absorbing trial balance, balance sheet, P&L, GL report, AR/AP aging, cash forecast, concentration, profitability, FX — 10 nav items → 1. Individual routes stay (deep-linkable, calendar/close links unaffected); the hub is the nav entry.
4. **Settings promoted and separated.** Gear icon anchored at the bottom of the icon strip (Slack/Linear pattern). Contains app/org settings, users, AI settings, extraction health (admin). Domain master data (vendors, cost centers, projects, allocation rules) moves to Operations > Master Data — the founder's complaint was exactly that app settings were buried *alongside* vendors.
5. **Sales & POS tier-1.** Seeded with `/sales`; roadmap slot for POS integration + channel reports.
6. **Tax → Compliance with education.** Structure within stays (VAT / WHT / planning groups tested fine); adds a **"This Month" obligations page** as the category landing: which forms this org must file (PP30, PP36, PND 1/3/53, SSO), each with plain-language "what/why/when/status" and a CTA into the right workbench. Reuses the close-checklist pattern + filing-calendar engine.
7. **Explainer layer.** Reusable `Explainer` component (popover with "what is this / why it matters / RD deadline rule") fed from a glossary content module; placed on the header of every compliance page. English copy now; Thai in the pre-launch i18n sweep (frozen split decision, 2026-07-02).

## What already exists (leverage map)

| Sub-problem | Existing code |
|---|---|
| Obligations & deadlines | `src/lib/tax/filing-calendar.ts`, `filing-deadlines.ts`, tax_config wiring |
| Guided checklist pattern | `/close` `CLOSE_ITEMS` + per-item deep links |
| Dashboard queries | `src/lib/db/queries/dashboard.ts` |
| Reports pages | All 10 report routes exist; hub is a switcher shell |
| POS seed | `/sales` (settlements, cash deposits) |
| Nav single source | `src/lib/nav/structure.ts` drives desktop + mobile |
| Glossary raw material | `docs/_ai_context/_glossary.md`, `thai-tax-compliance.html` |

## Phasing

- **Phase 1 — nav shell** (small): restructure `structure.ts` (7 categories + settings anchor), accordion tier-2 groups, en/th labels, Reports hub nav entry pointing at existing `/reports`. No route moves, no redirects needed.
- **Phase 2 — Home cockpit + pins**: `user_nav_pins` table + pin UI (star action in tier-2 rows + manage-on-Home), obligations/pipeline blocks on the dashboard, Reports hub switcher page.
- **Phase 3 — education layer**: org tax-profile settings (VAT-registered? employees? imports?) → obligations engine surface, Compliance "This Month" landing, `Explainer` + glossary content on compliance pages.

## Review notes (condensed)

- **Data flows:** pins — nil (no pins → default set: Upload, Reconciliation, VAT), empty org switch (pins are per org+user), stale pin to removed route (render check against `navCategories`, drop silently + log). Obligations — org without VAT registration must not show PP30 (profile-gated); no filings data → "not filed yet" state, never an error.
- **Security:** `user_nav_pins` scoped org_id + user_id (both from session, never client input); no new external surface. Explainer content is static — no injection path. Accordion state is localStorage only.
- **Edge cases:** mobile drawer must mirror accordions (same source of truth); keyboard nav across collapsed groups; active-route auto-expands its group; pin ordering is drag-free v1 (order = pin time) to avoid DnD complexity.
- **Tests:** structure.ts invariants (every href resolves to a real route — an existing gap worth a unit test), `getActiveNavCategory` with the new Settings anchor, pins CRUD org-scoping db test, obligations-gating unit tests per org profile.
- **Reversibility:** 4/5 — nav is one file; pins table is additive; no route moves in any phase.

## NOT in scope (deferred, explicit)

- Route moves/renames beyond nav grouping (none needed; avoids redirect debt while iterating).
- Drag-and-drop pin reordering (v1 = pin order).
- Thai copy for explainers (pre-launch sweep).
- Per-role nav (owner vs accountant modes) — revisit when a second persona actually uses the app.
- E2E-vs-dev data separation (dedicated e2e org/DB) — related infra decision, tracked separately from IA.

## Decisions needed from founder

1. Approve tier-1 structure above (incl. Tax→Compliance rename and Sales & POS promotion)?
2. Operations long tail: accordion groups + Reports hub (recommended) vs hub only vs accordion only?
3. Pins: build user_nav_pins in Phase 2 (recommended) vs static default shortcuts first?
4. Education layer: greenlight Phase 3 design now (recommended) vs park until nav ships?
