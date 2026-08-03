# Plan: Design Refresh — Kit Selection

**Status:** Executed 2026-08-02 via the owner-mode UI reset implementation (single pass, merged with the standardization goals of `ui-consistency.md`); pending peer review + final `/design-review` audit.
The 4–5-direction bake-off was superseded twice: first by the single Quicken Simplifi reference direction (Task 1), then by owner-approved Lavish mockups that locked "Quicken Soft" surfaces with an **Ink Neutral** accent — the warm golden-brown palette is retired.
Evidence: `docs/reviews/owner-mode-ux-reset-approved-mockups-2026-08-01.html`; governing contract: `DESIGN.md`.
**Owner direction:** The app should stop feeling like a default AI-generated shadcn app. Owner wants 4–5 distinct design directions mocked up as real prototypes and will pick one.

## Problem

The app's visual identity is default-shadcn: stock spacing, stock palette, generic cards and tables. Functional, but generic — no personality, no Thai-market warmth, and it reads as machine-generated. A non-technical Thai business owner should find it approachable and trustworthy; today it looks like an internal admin tool.

## Requirements

- 4–5 visually distinct design directions, each presented as a working prototype (not static images) of the same 3 screens: Home dashboard, Documents inbox, Tax (VAT monthly workflow).
- Each direction defines: type scale + font pairing (must render Thai well — e.g. Sarabun, IBM Plex Thai, Noto Sans Thai, Anuphan), color system (light mode required; dark optional), density/spacing scale, border-radius/elevation language, table + badge + card treatment, and tone of voice for empty states.
- Directions must be meaningfully different (e.g. warm/paper-ledger, crisp fintech, soft consumer, dense professional, playful modern) — not five tints of the same theme.
- Owner reviews prototypes side by side and selects one (or a hybrid); the choice is codified in DESIGN.md and Tailwind theme tokens.
- Accessibility: AA contrast on all candidate palettes; Thai + EN strings in every mockup.

## Approach

Prototype in-app on a branch per direction, theming the real components from `ui-consistency.md` via Tailwind 4 theme tokens — so the chosen direction ships by merging tokens, not by re-implementing screens (rejected: Figma/static mockups — owner needs to feel interaction and real data density; rejected: building 5 full themes across all 78 pages — 3 representative screens is enough to choose). Use `/design-review` and screenshot tooling to produce a side-by-side comparison doc. The losing directions are deleted; the winner becomes the DESIGN.md authority.

## Tasks

- [x] **1. Direction brief.** Decided 2026-08-02 (Mobbin review with owner, supersedes the 4–5-direction bake-off): **Quicken Simplifi is the primary reference kit** for the general shell and global styles — buttons, menus, card anatomy (stat label + big number + tinted sub-panel), soft rounded surfaces, light-gray canvas.
  Supporting references: Midday (evidence-inbox IA, review states), Mercury/Attio (dense tables + side drawers), Wise (mobile actions), Etsy/Stripe (settlement gross→fee→net), Mixpanel (accountant report boards only).
  Structure and shapes only — palette stays DESIGN.md's warm golden-brown + neutrals (Quicken's violet is banned). Prototyping now targets this single direction on the 3 benchmark screens rather than 4–5 competing themes; the side-by-side comparison tasks below apply to this direction's desktop/mobile + Thai/EN states.
- [x] **2. Token infrastructure.** Executed 2026-08-02 in the UI reset (Stage 1): all themable values flow through Tailwind v4 `@theme` tokens in `src/app/globals.css` app-wide, not just on 3 benchmark screens; dead dark-mode and sidebar tokens deleted.
- [x] **3. Build prototypes.** Superseded: instead of per-direction branches, three Lavish mockup review rounds (`.lavish/shell-directions.html`, `.lavish/page-mockups.html`) prototyped the single approved direction across shell + representative pages, Thai + EN.
- [x] **4. Comparison pack.** Superseded by the exported mockup evidence `docs/reviews/owner-mode-ux-reset-approved-mockups-2026-08-01.html` (side-by-side shell directions reviewed with the owner in-browser).
- [x] **5. Owner selection session.** Done 2026-08-02: owner approved "Quicken Soft + Ink Neutral" ("Good, looks aligned now") plus four product decisions (POS placement, nav pins removal, top bar, brand "Long Tua").
- [x] **6. Codify.** Done 2026-08-02: DESIGN.md fully rewritten as the governing contract (tokens, nav model, route tabs, status registry, money rules, anti-patterns, decisions log); tokens live in `globals.css` (working tree, uncommitted — no branches to delete since no per-direction branches were created).
- [x] **7. Rollout pass.** Done 2026-08-02: all owner-mode surfaces swept in three batches (Home/Bank/Documents/Recon, Tax, More/Settings/Capture) — PageHeader everywhere, `Amount` as the only money path, status registry adoption, raw palette classes eliminated (documented exemptions in DESIGN.md); final `/design-review` audit is the remaining exit step.

## Verification

- [x] ~~4–5 prototypes exist~~ Superseded: single approved direction prototyped via Lavish mockups (see Task 3).
- [x] Mockups reviewed by owner across three rounds; decision recorded here and in `owner-mode-ux-reset.md`.
- [x] DESIGN.md updated; tokens landed in `globals.css`; raw-palette grep clean with documented exemptions (bank brand marks — see DESIGN.md Anti-Patterns).
- [x] AA contrast checked on the Ink Neutral token pairs during Stage 1; Thai rendering verified on /tax with locale switched.
- [x] `pnpm build && pnpm test && pnpm lint` green after every stage; nav/tax/smoke Playwright suites run locally per stage (pre-existing reds ledgered in the reset plan, none introduced by the rollout).
- [ ] Final `/design-review` audit + GPT 5.6 Sol peer review reach zero P1 findings (last open step, tracked in `owner-mode-ux-reset.md`).
