# Plan: UI Kit & Consistency

**Status:** Active. Documented 2026-06-12, execution not started.
**Source findings:** `docs/reviews/engineering-review-2026-06-12.md` (F10).
**Sequencing:** Audit (Tasks 1–3) can start anytime. Standardization (Tasks 4–8) lands after `owner-mode-ux-reset.md` Slice 1, so we standardize the surviving owner surface first, not pages about to be demoted. Precedes `design-refresh.md` — pick a visual direction only after components are unified, or the redesign multiplies across 7 table implementations.

## Problem

The app uses shadcn/ui primitives but composes them inconsistently: 7 bespoke table implementations, 9 bespoke forms with no form framework, fragmented status-badge vocabulary (VAT lifecycle alone has 8 statuses, each surface rendering status its own way), and unaudited variation in empty states, loading states, error handling, confirmation dialogs, and filter bars. The result feels stitched-together and "AI-generated" even where individual screens are fine.

## Requirements

- One documented inventory of every reusable UI pattern and where each page deviates.
- A shared data-table component covering sorting, filtering, selection, bulk actions, pagination, empty/loading states — adopted by owner-mode surfaces first.
- One status-badge system: a single component + a registry mapping every domain status (pipeline, reconciliation, VAT lifecycle, WHT lifecycle, filing) to label, color, and icon, in EN and TH.
- One form approach (validation, errors, dirty/submit state) used by all new forms; existing forms migrate opportunistically.
- Consistent UX furniture: empty state, loading skeleton, destructive-confirm dialog, toast usage, filter bar, page header. Documented in DESIGN.md.
- No visual redesign in this plan — structure and consistency only (visual direction belongs to `design-refresh.md`).

## Approach

Audit before building: catalogue what exists, grade consistency per pattern, then standardize from evidence rather than taste. Build the shared data-table as a thin composition over the existing shadcn `table.tsx` + TanStack Table (headless, already idiomatic with shadcn; rejected: AG Grid/heavyweight grid — overweight, restyles poorly; rejected: keep bespoke tables — bulk-action/selection logic is already triplicated and the design refresh would have to restyle 7 implementations). Forms standardize on react-hook-form + zod resolver, matching the zod validation already used in server actions (rejected: keep ad-hoc forms — 9 divergent validation/error patterns is the main source of UX inconsistency). Migrate owner-mode surfaces (Bank, Documents, Tax) first; accountant/admin pages opportunistically.

## Tasks

- [ ] **1. Pattern inventory.** Audit all 78 pages; produce `docs/_ai_context/ui-pattern-inventory.md`: tables, forms, badges, empty/loading/error states, dialogs, toasts, filter bars, page headers — with per-pattern consistency grade and worst offenders. (Use `/design-review` tooling for screenshots where useful.)
- [ ] **2. Status vocabulary map.** Enumerate every domain status enum rendered in UI (pipeline, reconciliation, VAT input/output lifecycle, WHT lifecycle, filing, payroll run) and current rendering. Output: proposed unified registry table (status → label EN/TH → tone → icon) appended to the inventory doc for owner sign-off.
- [ ] **3. Update DESIGN.md** with the agreed component rules: when to use which table density, badge tones, empty-state copy pattern, confirm-dialog rules, toast rules. DESIGN.md remains the single authority per CLAUDE.md.
- [ ] **4. Build `src/components/ui/data-table/`** (TanStack Table + shadcn table): column defs, sorting, filtering, row selection, bulk-action slot, pagination, empty + loading states. Unit tests for selection/bulk-action state.
- [ ] **5. Build `src/components/ui/status-badge.tsx`** + `src/lib/ui/status-registry.ts` implementing the Task 2 registry. Replace `confidence-badge.tsx` consumers or wrap it.
- [ ] **6. Migrate owner-mode tables** to the shared data-table: `documents/document-table.tsx` (1,048 lines — also splits the embedded state machine), bank `transaction-table.tsx` (824), the VAT/WHT lifecycle tables from owner-mode Slice 5, `certificate-table.tsx`. One table per commit; screenshot before/after.
- [ ] **7. Adopt react-hook-form + zod** for forms: add the dependency, write one exemplar migration (`vendor-edit-form.tsx`, smallest), document the pattern in `docs/_ai_context/code-quality-guidelines.md`. Remaining forms migrate when next touched; `smart-upload-form.tsx`/`extraction-form.tsx` get dedicated follow-up tasks here when scheduled.
- [ ] **8. UX furniture pass on owner surfaces.** Apply standard empty states, loading skeletons, destructive-confirm dialogs, and filter bars across Home, Bank, Documents, Tax pages. Record deviations found-but-deferred as checklist items here.

## Verification

- [ ] Inventory doc exists and owner has signed off on the status registry.
- [ ] Owner-mode pages (Home, Bank, Documents, Tax) use shared data-table and status-badge — verified by grep for old table components and by `/design-review` screenshot pass.
- [ ] No page renders a domain status outside the registry (grep for ad-hoc badge variants on owner surfaces).
- [ ] `pnpm build && pnpm test && pnpm lint` green; Playwright nav/tax smoke green; no functional regressions in migrated tables (selection, bulk actions, filters exercised in e2e).
