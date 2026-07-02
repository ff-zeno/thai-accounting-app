# UI & Infrastructure Review — 2026-07-02

Post-hardening-merge deep review of UI consistency (design kit, ad hoc styling)
and app infrastructure (navigation, flows, mutation surface). Four parallel
audits: design-kit baseline, UI sweep of core money flows (62 files), UI sweep
of tax/back office (78 files), and an architecture/flow review. Report-only —
no fixes applied. Companion domain doc: `docs/_ai_context/accounting-structure-map.md`.

**Headline:** the shadcn kit in `src/components/ui/` is modern, coherent, and
token-clean, and the backend architecture is uniformly solid (verified org
scoping everywhere, no orphan Inngest sends, consistent server-action mutation
pattern). Drift lives almost entirely in page-land, driven by two root causes:

1. **DESIGN.md promises semantic success/warning/info tokens that don't exist**
   (`globals.css` defines only `--destructive`), so ~35 files improvise with raw
   Tailwind `green/amber/red/blue-*` (~127 usages), most without `dark:` variants.
2. **Five missing mid-level components** (PageHeader, StatCard, Alert/Callout,
   EmptyState, StatusBadge) + a shared Amount formatter forced ~40 pages to
   re-implement the same patterns with drifting details.

---

## 1. UI — root causes and highest-impact findings

### 1.1 Design tokens (systemic)

- No `--success` / `--warning` / `--info` tokens despite DESIGN.md specifying
  `#2e7d32` / `#f57c00` / `#1565c0`. Consequences:
  - Warning hue split: `amber-*` most places, `yellow-*` in
    `dashboard/filing-status-table.tsx:68`, `reconciliation/review/manual-match.tsx:365`,
    `settings/ai/ai-cost-analytics.tsx:126`.
  - Success hue split: `green-*` vs `emerald-*` (`close/page.tsx:238`, flash
    banners in fx-rates/allocation-rules/payroll filings, `imports/[id]/page.tsx:176`).
  - Dark mode inconsistently broken: same amber banner has `dark:` variants in
    `vat-view.tsx:478` but not in `payroll/page.tsx:120`, `imports/page.tsx:65`,
    `reconciliation-dashboard.tsx:356`, etc.
- Stock-shadcn blue/violet chart tokens (`--chart-2/4/5`, globals.css:70–73,
  104–108) violate DESIGN.md's "no purple/violet" rule; raw violet also leaks in
  `reconciliation/insights/layer-distribution.tsx:13-15` and
  `tax/calendar/page.tsx:41-46` icon tints.
- DESIGN.md page-heading spec (32px/700) vs de-facto standard everywhere
  (`text-2xl font-semibold`, 24px/600) — the doc is fiction; decide once.
- Numeric typography fork: `font-mono` in ~29 files (tax/payroll/analytics) vs
  DESIGN.md-mandated `tabular-nums` (reconciliation/VAT). Pick tabular-nums.
- Phantom class `cn-toast` applied in `ui/sonner.tsx:41`, defined nowhere.

### 1.2 HIGH-severity page findings

| Finding | Locations (representative) |
|---|---|
| **Accounting area has ZERO right-aligned numeric columns** — debit/credit/amount left-aligned plain text across all 7 financial-report pages | `accounting/reports/trial-balance/page.tsx:126-137`, `journal/page.tsx:79-80`, `reports/general-ledger/page.tsx:175-179`, `accounting/page.tsx:547-548` |
| **49 raw native `<select>` elements** in 4 divergent styles (most with no focus ring), next to kit `Select` on sibling pages | 11 in core sweep (`documents/[docId]/review/extraction-form.tsx:343,475,670,740`, `document-detail-sidebar.tsx:523,556,587`, `copilot/page.tsx:104`, `sales/page.tsx:224,240`, `document-table.tsx:866`); 38 in back office (`accounting/page.tsx` ×5, `inventory/page.tsx` ×7, `year-end/cit/page.tsx` ×6, `vat-view.tsx` ×3, …) |
| **Zero `loading.tsx` / `error.tsx` in the entire app** — `Skeleton` kit exists but is imported nowhere; multi-query RSC pages block on blank screens and hard-crash on query errors | all of `src/app/(app)/` |
| `/tax/vat/register` renders **four stacked h1s/page headers** (composes 3 ledger pages each with own chrome) | `tax/vat/_components/vat-ledger-pages.tsx:344-357` |
| Hand-rolled `<table>` shells vs kit `Table` — two visibly different table chromes across sibling list pages | `documents/document-table.tsx:909`, `vendors/vendor-list.tsx:440`, `bank-accounts/[accountId]/transaction-table.tsx:569`, `smart-upload-form.tsx:627`, `settings/ai/ai-cost-analytics.tsx:296` |
| Hand-rolled buttons duplicating `Button variant="outline"` (4 re-implementations), incl. verbatim copied `buttonVariants` class strings | `accounting/reports/*` ×4, `posting-exceptions/page.tsx:99`, `tax/reports/page.tsx:315,415,497`, `tax/calendar/page.tsx:241-255`, `dashboard/page.tsx:145`, `analytics-overview.tsx:124` |
| Status concept rendered as styled Badge on tax pages but unstyled lowercase text on payroll/accounting/CIT/close | `payroll/page.tsx:449,524,588`, `year-end/cit/page.tsx:619`, `close/page.tsx:279`, `posting-exceptions/page.tsx:228` vs `certificate-table.tsx:240`, `calendar/page.tsx:316` |
| Double page gutter (`p-6` inside layout's `p-6`) | `reconciliation/insights/page.tsx:81`, `reconciliation/ai-review/page.tsx`, `bank-accounts/upload/page.tsx`, `admin/extraction-health/page.tsx:53` |
| Document review split-pane desktop-only (`w-1/2` + `h-[calc(100vh-8rem)]`, no responsive fallback) — DESIGN.md mandates mobile-first | `documents/[docId]/review/document-review.tsx:80-86` |

### 1.3 Duplicated ad hoc patterns (extract-a-component list)

| Pattern | Copies | Notes |
|---|---|---|
| Amber "v1 caveat"/warning banner | ~17 app-wide, 3 rival stylings | only 1 copy dark-mode-aware |
| Stat/KPI card | ~20 pages, 6+ variants | value typography lottery: `text-xl/2xl` × `font-bold/semibold` × mono/tabular |
| Page header row (h1 + subtitle + actions) | ~13+ pages | breakpoints and `tracking-tight` drift |
| Local `amount()` money formatter | ~50 files | `formatAmountThb` exists in `src/lib/utils/money.ts` |
| Empty state | ~26 sites, 3 grammars | prototype worth promoting: `vat-ledger-pages.tsx:43-59` |
| "Select an organization" no-org state | ~20 pages, 5 variants | `NoOrgGate` exists in layout components |
| status→Badge variant switch | 4 re-implementations | `calendar/page.tsx:53`, `filing-view.tsx:105`, `vat-view.tsx:223`, `certificate-table.tsx:71` |
| Flash message pair (error + success from searchParams) | 6 verbatim copies | fx-rates, allocation-rules, payroll filings ×3, fixed-assets/import |
| Period selector card (year/month + Load) | 2 verbatim copies | `vat-view.tsx:404-463`, `filing-view.tsx:188-242`; also paradigm-splits with SSR searchParams siblings |
| Dropzone dashed panel | 4 copies | differing min-heights |
| Delete-confirm dialog | 5 near-identical + 1 `window.confirm` outlier | `imports/delete-line-button.tsx:18` |
| UndoButton | 2 verbatim copies | `reconciliation-dashboard.tsx:163`, `matched-transactions.tsx:34` |
| Confidence/score green-amber-red threshold coloring | 4+ implementations | `match-display.ts:82`, `reconciliation-dashboard.tsx:187`, `confidence-trend.tsx:55`, `health-summary.tsx:55` |

### 1.4 Other notables

- **Six dead dashboard components** (`metric-cards.tsx`, `analytics-overview.tsx`,
  `exception-review-list.tsx`, `filing-status-table.tsx`, `period-comparison.tsx`,
  `quick-links.tsx`) — none imported; `dashboard/page.tsx` re-inlines "Needs
  Attention" duplicating one of them.
- **i18n split:** dashboard/documents/capture/reports use `next-intl`; the rest
  hardcodes English — half the app won't translate (Thai-first product).
- **Sign-in/sign-up are stock unthemed Clerk** — default blue, no brand carryover.
- `settings/layout.tsx` hand-rolls a third tab style + unique `max-w-4xl` shell.
- Brand copy drift: layout says "Long Tua", DESIGN.md says "Long Dtua (ลงตัว)"
  (`(app)/layout.tsx:64`).
- `text-[10px]` below the 12px caption floor in ~9 files; arbitrary Select
  widths `w-[120–170px]` ×5 values.
- Raw `<input type="checkbox">` (`payroll/page.tsx:248,252`,
  `ai-settings-form.tsx:361,369`) and raw `<textarea>` (`certificate-table.tsx:349`)
  next to kit equivalents.

### 1.5 Area grades (design-system conformance)

| Area | Grade | | Area | Grade |
|---|---|---|---|---|
| reports | B+ | | copilot | C+ |
| imports, sales | B | | analytics | C+ |
| reconciliation, payroll, fixed-assets, inventory, settings, vendors, capture | B− | | close, admin | C+ |
| bank-accounts | C | | tax | C+ |
| dashboard | C+ | | year-end (cit) | C |
| documents | C− | | accounting | C− |
| | | | sign-in/up | C |

---

## 2. Infrastructure & flows

Backend fundamentals are clean: single nav source of truth
(`src/lib/nav/structure.ts`) shared desktop/mobile; zero client-component pages;
server actions for all mutations, API routes only for GET/webhooks; every API
route resolves org via `getVerifiedOrgId()` (httpOnly cookie + membership
validation) — **no security findings**; complete Inngest event graph.

### HIGH

1. **WHT route aliasing → stale-render bug.**
   `/tax/withholding/{filings,incoming,outgoing}/page.tsx` are 1-line re-exports
   of `monthly-filings`, `wht-credits-received`, `wht-certificates` pages, but
   their server actions `revalidatePath()` the raw paths while users browse the
   aliases — mutations (e.g. `reissueCertificateAction`) can render stale. Pick
   one canonical route per page and redirect the other.
2. **Core loop has no forward guidance.** Bank import "done" dead-ends at
   "Upload another" (`smart-upload-form.tsx:286-315`); document confirm ends at
   a toast (`extraction-form.tsx:204-216`); close checklist items are unlinked
   text (one deep link total, `close/page.tsx:112`). The Inngest chain is wired;
   the UI chain is not.
3. **`/payroll/filings/pnd1-kor` is unreachable** (zero inbound links; its build
   form sits on `/payroll:318` but Submit/Accept live only on the unlinked page),
   and payroll home's "Pay" shortcut (`payroll/page.tsx:532`) bypasses the
   Submit→Accept state machine that `/payroll/filings/pnd1:139-181` enforces —
   two mutation paths with different rigor over the same filing.

### MEDIUM

4. **Tax calendar deep links drop the period.** `tax/calendar/page.tsx:198-221`
   links `?year&month`, but `vat-view.tsx:238-240` and `filing-view.tsx:144-146`
   ignore `searchParams` and init from `new Date()`.
5. **IA misweights the workflow.** Reconciliation (the pivot step) is buried in
   a 29-item "More" menu; `/reconciliation/ai-review` isn't in nav at all — only
   a conditional banner. "Accounting & Reports" mixes 14 items; Sales sits under
   Tools/Admin. Un-navved routes make `getActiveNavCategory` highlight Home.
6. **`/close` and `/year-end/cit` mutually isolated** despite operating on the
   same GL; year-end readiness shows `evidenceId` as plain text.
7. **Orphans:** `/capture` (fully built, zero inbound links);
   `bank-accounts/[accountId]/upload/page.tsx` ("Coming in Phase 2" stub —
   delete; real upload is the Statements tab).

### LOW

8. Document lists never link to the full review page — the client
   `DocumentDetailSidebar` is a parallel, reduced editing surface with its own
   confirm action (two confirm paths, different capabilities).
9. VAT dashboard duplicates register/forecast surfaces inline
   (`vat-view.tsx:706-735`) vs standalone routes; one giant client component
   among server-component siblings.
10. Dead surface: `hello-world.ts` + `backfill-vendor-tax-id.ts` Inngest
    registrations, duplicate `WhtRegisterPage` export
    (`wht-workflow-pages.tsx:105-164`), unused i18n nav keys (`capture`,
    `monthlyFilings`, `whtCertificates`, `whtCreditsReceived`), 7 action files
    with inline `db.*` writes against the service-layer convention.
11. Pipeline feedback is a 5s poll (`document-table.tsx:382-417`);
    `process-document.ts` emits no completion event. Acceptable v1.

Deeper domain gaps (documents→VAT-ledger materialization, documents/payments→GL
posting, period-lock protocol drift, TFRS/DBD stubs, payroll output files) are
catalogued in `docs/_ai_context/accounting-structure-map.md` §5.

---

## 3. Prioritized action plan

Phase 1 — tokens & primitives (unblocks everything):
1. Add `--success/--warning/--info` (+foreground/surface, light & dark) to
   `globals.css`; replace violet/blue `--chart-*` stock values with the warm ramp.
2. Ship `ui/alert.tsx`, `StatCard`, `PageHeader`, `EmptyState` (+ no-org preset),
   `StatusBadge` (domain registry), `<Amount>` (wraps `formatAmountThb`,
   `tabular-nums`). Reconcile DESIGN.md heading spec with reality (pick 24/600).

Phase 2 — mechanical migrations (safe, high-visibility):
3. Right-align + `tabular-nums` all monetary columns (accounting area first).
4. Replace 49 raw selects with kit `Select`/shared `NativeSelect`; raw
   tables/buttons/checkboxes/textareas with kit equivalents.
5. Migrate ~50 local money formatters to `<Amount>`; codemod `font-mono` →
   `tabular-nums` on numeric cells.
6. Add per-area `loading.tsx` (Skeleton) + `error.tsx`; remove double `p-6`;
   fix the 4-h1 register page.

Phase 3 — flow & IA fixes:
7. Fix WHT route aliasing (canonical route + redirect) and calendar deep links
   (read searchParams).
8. Add forward CTAs: import-done → reconciliation; confirm → next step; close
   checklist items → resolving pages; link `/close` ↔ `/year-end/cit`.
9. Link or remove `/capture`; link pnd1-kor; unify payroll pay path through the
   filing state machine; delete the Phase-2 stub + dead dashboard components.
10. Promote Reconciliation in the nav; add ai-review as a nav item with badge.

Phase 4 — polish:
11. Theme Clerk auth screens via `appearance`; fix "Long Tua" brand string;
    settle the i18n strategy; desktop nav touch targets to 44px; calendar
    component tokens; remove phantom `cn-toast`.
