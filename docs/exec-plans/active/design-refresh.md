# Plan: Design Refresh — Kit Selection

**Status:** Queued (documented 2026-06-12). Starts after `ui-consistency.md` standardization lands — restyling 7 bespoke tables would multiply the work; restyling one shared kit is cheap.
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

- [ ] **1. Direction brief.** With owner: agree the 4–5 named directions, reference apps for each (Thai and international), and the 3 benchmark screens. Capture in this doc.
- [ ] **2. Token infrastructure.** Ensure all themable values (fonts, palette, radius, spacing density, shadows) flow through Tailwind theme tokens / CSS variables, not hardcoded classes, on the 3 benchmark screens. (Largely delivered by `ui-consistency.md`; close gaps here.)
- [ ] **3. Build prototypes.** One branch per direction: theme tokens + any direction-specific component variants for Home, Documents inbox, Tax VAT. Seeded demo data, Thai + EN.
- [ ] **4. Comparison pack.** Screenshot each direction (desktop + mobile widths) and assemble `docs/reviews/design-directions-<date>.md` with annotated side-by-sides and per-direction notes (contrast check results, Thai rendering check).
- [ ] **5. Owner selection session.** Owner picks direction or hybrid; record decision + rationale here.
- [ ] **6. Codify.** Update DESIGN.md (fonts, palette, radius, density, component treatments, tone). Merge winning tokens to main; delete losing branches.
- [ ] **7. Rollout pass.** Apply the chosen system across remaining owner-mode surfaces; `/design-review` audit to catch stragglers; fix flagged inconsistencies.

## Verification

- [ ] 4–5 prototypes exist and render the 3 benchmark screens with real components and demo data.
- [ ] Comparison pack reviewed by owner; decision recorded in this doc.
- [ ] DESIGN.md updated; Tailwind tokens merged; no hardcoded colors/fonts on owner-mode surfaces (grep + `/design-review` pass).
- [ ] AA contrast verified on shipped palette; Thai text renders correctly in all chosen fonts (PDF surfaces unaffected or separately verified).
- [ ] `pnpm build && pnpm lint` green; nav/tax Playwright smoke green after rollout.
