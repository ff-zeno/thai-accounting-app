# Plan: Phase 15 — UI navigation refactor (two-tier Gamma-style)

**Status:** Draft — captured 2026-04-27 (round-4 user direction, image reference attached)
**Position:** Independent of all other plans. Ships when convenient. Should ship before Phase 10 / 10.5 land because nav real estate is already crowded; without this, every new phase compounds the problem.
**Authority reference:** `DESIGN.md`; user-provided Gamma reference image; current sidebar implementation `src/components/layout/sidebar-nav.tsx`

## Problem

The current sidebar is a single vertical list with 6 collapsible groups + 16 items, and the platform is on track to add at least these in coming phases:

- Phase 10: Sales (POS, settlements, deposits, vouchers), Establishments
- Phase 10.5: Accounting (COA, journal, trial balance, P&L, BS, period close, opening balances)
- Phase 10.6 + imports: Inventory (SKUs, movements, counts, adjustments), Imports (packets, audit trail)
- Phase 11: Payroll (employees, allowances, pay runs, slips, PND.1, SSO, provident fund)
- Phase 12a: CIT (PND.50, PND.51, transfer pricing, year-end close)
- Phase 12b: Financial statements (BS, P&L, equity, cash flow, notes), DBD package, audit pack
- Phase 13: Fixed assets (assets, schedule, disposals)
- Phase 14: Analytics (aging, KPIs, FX revaluation, cost centers, projects, close checklist)

Conservatively that's 50+ navigable destinations. A flat collapsible sidebar at this size becomes unscannable. User reference is the **Gamma layout**: thin icon-only primary nav (~64px) + secondary text panel (~240px) showing items inside the selected primary category + main content area with a clean white card and prominent action buttons.

## Goals

1. **Two-tier left navigation.** Tier 1 = icon strip with top-level categories. Tier 2 = text panel showing secondary nav inside the selected primary.
2. **Active-category persistence.** When user clicks `Documents → Upload`, both the Documents tier-1 icon and the Upload tier-2 item show as active.
3. **Mobile parity.** Existing mobile sheet sidebar replaced with stacked tier-1 → tier-2 drawer.
4. **Route grouping.** App routes regrouped under tier-1 namespaces so the URL reflects the nav (`/documents/upload`, `/accounting/journal`, `/inventory/imports`, etc.).
5. **No mid-route breakage.** Existing URLs (`/dashboard`, `/bank-accounts`, `/tax/wht-certificates`, etc.) keep working — either by being canonical or via `next/redirect` shims.

## Non-goals

- **Visual redesign of pages themselves.** Pages keep their current shadcn/ui patterns; only the shell changes.
- **Search / command palette.** Useful eventually; deferred to a follow-up.
- **Customizable nav per role.** Single nav layout for all users in v1; role-based hiding deferred.
- **Internationalization changes.** Existing `useTranslations("nav")` keys carry over with renames; new keys for new tier-1 categories.

## Proposed structure

| Tier 1 (icon ~64px) | Tier 2 (text panel ~240px) | URL prefix |
|---|---|---|
| **Home** | Dashboard, Tasks, Calendar | `/` and `/calendar` |
| **Documents** | All, Upload, Pending review, Foreign, By vendor | `/documents` |
| **Sales** | POS sales, Settlements, Cash deposits, Vouchers, Establishments | `/sales` |
| **Banking** | Bank accounts, Statements, Reconciliation, AI review, Rules, Insights | `/banking` |
| **Tax** | VAT (PP 30), VAT (PP 36), WHT (PND 3/53/54), CIT (PND 50/51), Filing calendar | `/tax` |
| **Accounting** | Chart of accounts, Journal entries, Manual JE, Trial balance, P&L, Balance sheet, Cash flow, Period close, Opening balances | `/accounting` |
| **Inventory** | SKUs, Movements, Imports, Counts, Adjustments | `/inventory` |
| **Payroll** | Employees, Pay runs, Pay slips, PND.1, SSO, Provident fund | `/payroll` |

**PND.1 / SSO ownership:** Payroll owns operational filing flows (computation, submission, certificates). The Tax → Filing calendar tier-2 page surfaces all upcoming deadlines including PND.1/SSO with deep links into Payroll for action. No duplicate UI.
| **Fixed assets** | Assets, Schedule, Disposals | `/assets` |
| **Reports** | §87 reports, Aged AR/AP, Concentration, Cost center P&L, Project P&L, Audit pack | `/reports` |
| **Settings** | Org, Vendors, Users, AI, Tax config, Reconciliation rules, Cost centers, Projects | `/settings` |

The **Admin** category (extraction health, etc.) appears only when user has admin role.

User profile + org switcher live above the tier-1 strip, matching the Gamma pattern (workspace avatar + name at top).

## Visual spec (matches reference image)

- **Tier 1 icon strip:** 64px wide, white background, dark gray icons, active icon background = light blue (#E8F0FE-ish). Hover = light gray. Icon only with 11px label below.
- **Tier 2 text panel:** 240px wide, white background, items as 13px text with leading icon. Active item: light blue background, dark blue text. Hover: light gray. Section headers within the panel (e.g. "FOLDERS" in the reference image) for grouping when needed.
- **Main content area:** flex-1, white, 24-32px padding all around. Page title bar with action buttons (e.g. "Create new", "Import") prominent at the top. Content cards below.
- **Borders:** subtle 1px dividers between tier-1 strip ↔ tier-2 panel ↔ main content. No heavy backgrounds.
- **Typography:** matches DESIGN.md (Sarabun for Thai, Inter for English).

## Approach

### Sequencing (2 weeks)

**Week 1 — Shell rewrite + route grouping**

- [ ] Create `src/components/layout/two-tier-sidebar.tsx`:
  - Icon strip component (left, 64px).
  - Text panel component (right of strip, 240px).
  - Both consume one shared `navStructure` config (typed array of `{tier1, items: tier2[]}`).
  - Active-state detection by URL prefix matching.
- [ ] Replace existing `src/components/layout/sidebar.tsx` and `sidebar-nav.tsx` usage in `src/app/(app)/layout.tsx`.
- [ ] Mobile: replace `mobile-sidebar.tsx` with a tier-aware drawer that shows tier-1 → tier-2 stacked.
- [ ] **Route migration (back-compat):**
  - Add new route segments (`/sales/**`, `/accounting/**`, `/inventory/**`, `/payroll/**`, `/assets/**`).
  - Keep legacy URLs working via `next.config.ts` `redirects()`:
    ```ts
    redirects: async () => [
      { source: '/bank-accounts/:path*', destination: '/banking/accounts/:path*', permanent: true },
      { source: '/reconciliation/:path*', destination: '/banking/reconciliation/:path*', permanent: true },
      // ... etc
    ]
    ```
  - **Comprehensive path-reference grep + replace (round-5 critical scope addition):**
    - `<Link href=...>` (~30 components)
    - `router.push("...")` and `router.replace("...")` (~15 client components)
    - `redirect("...")` from `next/navigation` (server components and server actions)
    - `revalidatePath("...")` (~30+ server-action call sites — `redirects()` does NOT transitively invalidate the new path's cache; missed updates produce stale-data-after-mutation bugs)
    - Email templates and PDF templates referencing routes
    - Hard-coded route constants in shared utilities (`src/lib/routes.ts` if any)
    - `audit_log` row construction that includes route paths
    - Test fixtures referencing routes
  - Grep commands run pre-merge:
    - `grep -rn "revalidatePath\|router\.push\|router\.replace\|redirect(" src/`
    - `grep -rn "/bank-accounts\|/reconciliation\|/tax\|/vendors\|/documents/expenses\|/documents/income" src/`
  - Verification matrix: after creating/updating each entity (vendor, document, WHT cert, monthly filing, reconciliation rule, etc.), navigate to the new-URL list page and verify the change reflects without manual reload. Catches missed `revalidatePath` calls.
- [ ] Update `next-intl` `messages/<locale>.json` `nav` namespace with new tier-1 + tier-2 keys.

**Week 2 — Polish + verification**

- [ ] All existing pages render correctly inside new shell.
- [ ] Active-state test matrix: navigate to each tier-2 destination, verify tier-1 icon + tier-2 item both highlight.
- [ ] Keyboard nav: tab through icon strip → arrow keys to switch tier-1; tier-2 panel updates.
- [ ] Mobile: drawer opens, tier-1 selection swaps tier-2 panel.
- [ ] Visual regression check: take Playwright screenshots of dashboard, documents/upload, tax/wht-certificates, settings → compare to design spec.
- [ ] DESIGN.md updated with new shell description.
- [ ] Old sidebar files deleted (`sidebar.tsx`, `sidebar-nav.tsx`, `mobile-sidebar.tsx` replaced).

### Critical files

To be created:
- `src/components/layout/two-tier-sidebar.tsx`
- `src/components/layout/tier1-icon-strip.tsx`
- `src/components/layout/tier2-text-panel.tsx`
- `src/components/layout/mobile-drawer.tsx` (replaces mobile-sidebar.tsx)
- `src/lib/nav/structure.ts` — single source of truth for nav config
- `messages/en.json` updates (and any other locales)

To be modified:
- `src/app/(app)/layout.tsx` — swap shell
- `next.config.ts` — add `redirects()`
- All page-level `<Link>` to new URLs (~30 files)
- Most route folders renamed under new namespaces

To be deleted (after migration):
- `src/components/layout/sidebar.tsx`
- `src/components/layout/sidebar-nav.tsx`
- `src/components/layout/mobile-sidebar.tsx`

### Dependencies

- None — pure UI / routing change.

## Verification

- [ ] All current URLs resolve (legacy redirects work).
- [ ] All new URLs resolve.
- [ ] Tier-1 + tier-2 active state correct on every page (matrix test).
- [ ] Mobile drawer works on iOS Safari + Android Chrome (manual QA).
- [ ] No console errors on shell render.
- [ ] Lighthouse score not regressed on dashboard / documents / settings.
- [ ] DESIGN.md alignment: spacing, typography, color tokens match.
- [ ] `pnpm build && pnpm test && pnpm lint` clean.

## Risks

- **Route migration breakage.** A missed `<Link href=...>` or hardcoded URL in a server action breaks navigation. Mitigate: grep for all hrefs before merge; redirects catch external links (bookmarks, emails).
- **Active-state edge cases.** A user on `/banking/reconciliation/insights` should highlight Banking → Insights. Sub-routes need careful **longest-prefix** matching: a path `/reports/audit-pack` must NOT mis-highlight `/reports/audit` if both items exist. Mitigate: assign each nav item a stable `routeId` and a `pathPrefix` regex; selector picks the item with the longest matching prefix. Borrow the sibling-overlap fix from current sidebar-nav.tsx and add the longest-match resolution.
- **Mobile UX.** Two-tier on a phone = stacked drawer; some users prefer a single flat list on small screens. Mitigate: usability test with Lumera; iterate if needed.
- **Phase 10/10.5/etc. plans reference current routes.** They mention paths like `/sales/**` and `/accounting/**` — those are already aligned with the new structure, so no plan-doc rewriting needed beyond a cross-reference note.

## Open questions

- **Tier-1 icon strip — collapsible to icons-only on hover?** Reference image shows always-visible. v1 = always visible.
- **Search bar placement — top of tier-2 panel or in main content header?** Reference image shows search inside tier-2 panel ("Search Ctrl+K"). v1 follows reference.
- **Workspace switcher above tier-1 or above tier-2?** Reference shows it above tier-2. v1 follows reference.
- **Settings as tier-1 vs. as a profile-menu item?** Image shows Settings as tier-1. Keep there for v1; revisit if cluttered.
