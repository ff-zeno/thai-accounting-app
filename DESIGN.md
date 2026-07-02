# Design System — Long Dtua (ลงตัว)

## Product Context
- **What this is:** AI-powered Thai accounting platform — document management, bank reconciliation, WHT/VAT filing, Revenue Department compliance
- **Who it's for:** Thai business owners and accountants managing multi-company financials
- **Space/industry:** Thai accounting SaaS (peers: FlowAccount, Peak, Xero)
- **Project type:** Web app / dashboard with data-dense views

## Aesthetic Direction
- **Direction:** Industrial/Utilitarian — function-first, data-dense where needed, generous whitespace where it aids comprehension
- **Decoration level:** Minimal — typography and spacing do all the work. The warm accent (oklch hue 80) is the only decorative element and it marks actionable things
- **Mood:** Trustworthy, precise, calm. The app should feel like a reliable instrument, not a lifestyle brand. Financial data is serious; the UI respects that seriousness without being cold

## Typography
- **Display/Hero:** Geist Sans 700 — clean geometric sans with good Thai character pairing
- **Body:** Geist Sans 400/500 — readable at 14px, pairs naturally with Noto Sans Thai
- **UI/Labels:** Geist Sans 500/600 — same family, weight differentiation creates hierarchy
- **Data/Tables:** Geist Sans with `font-variant-numeric: tabular-nums` — critical for financial columns to align
- **Code:** Geist Mono — matches the sans-serif family for visual consistency
- **Thai glyphs:** Noto Sans Thai — full Unicode coverage, weight-matched to Geist
- **Loading:** Google Fonts via `next/font` (Geist bundled with Next.js, Noto Sans Thai from Google)
- **Scale:**
  - Page heading: 24px / 600 / -0.01em tracking (`text-2xl font-semibold tracking-tight` — use the `PageHeader` component)
  - Section heading: 18px / 600
  - Card heading: 16px / 500 (`CardTitle` default — do not override per page)
  - Body: 14px / 400
  - Caption: 12px / 400 — the smallest size; never `text-[10px]`
- **Financial numbers:** always `tabular-nums` (via the `Amount` component), right-aligned in tables. Geist Mono is reserved for identifiers (account numbers, tax IDs, references) — never for money.
  - Nav heading: 11px / 600 / uppercase / 0.08em tracking / text-foreground/70
  - Nav item: 14px / 500 / text-muted-foreground
  - Nav active: 14px / 600 / text-accent-foreground

## Color
- **Approach:** Restrained — one warm accent + neutrals. Color is rare and meaningful
- **Primary:** `oklch(0.45 0.12 80)` — warm golden-brown. Marks the brand and primary actions
- **Primary foreground:** `oklch(1 0 0)` — white text on primary
- **Ring/Focus:** `oklch(0.65 0.10 80)` — lighter warm tone for focus rings
- **Accent:** `oklch(0.96 0.02 80)` — light warm tint for hover/active states
- **Accent foreground:** `oklch(0.25 0.04 80)` — dark warm for text on accent
- **Neutrals:** Pure gray scale (chroma 0), warm to the eye because of the warm accent context
  - Background: `oklch(1 0 0)`
  - Sidebar: `oklch(0.985 0 0)`
  - Muted: `oklch(0.97 0 0)`
  - Border: `oklch(0.922 0 0)`
  - Muted foreground: `oklch(0.556 0 0)`
  - Foreground: `oklch(0.145 0 0)`
- **Semantic (implemented as tokens in `globals.css` — use these, never raw Tailwind palette classes):**
  - Success: `--success` `oklch(0.52 0.14 150)` — green
  - Warning: `--warning` `oklch(0.55 0.14 60)` — amber, darkened from `#f57c00` for AA text contrast
  - Error/Destructive: `--destructive` `oklch(0.577 0.245 27.325)` — red
  - Info: `--info` `oklch(0.47 0.14 255)` — blue
  - Soft usage via opacity modifiers: `bg-success/10 border-success/30 text-success`; solid usage pairs with `*-foreground`. Badge has `success`/`warning`/`info` variants; banners use the `Alert` component.
- **Charts:** warm lightness-stepped ramp `--chart-1..5` (hues 60–100) — never blue/violet series colors
- **Dark mode:** Invert lightness on neutrals, reduce saturation 10-20% on semantic colors. Surfaces use oklch lightness 0.17-0.28. Semantic tokens carry their own dark values — raw palette classes with hand-written `dark:` variants are a smell

## Spacing
- **Base unit:** 4px
- **Density:** Comfortable — financial data needs breathing room to be scannable
- **Scale:** 2xs(2) xs(4) sm(8) md(16) lg(24) xl(32) 2xl(48) 3xl(64)
- **Touch targets:** Minimum 44px height for interactive elements (already enforced in sidebar nav)

## Layout
- **Approach:** Mobile-first
- **Philosophy:** Every component is designed for 320px viewport FIRST, then expanded with responsive utilities. Desktop is the progressive enhancement, not the default
- **Grid:** Single column mobile, 2-column tablet, sidebar + content desktop
- **Breakpoints:** `sm(640px)` `md(768px)` `lg(1024px)` `xl(1280px)`
- **Desktop shell:** Persistent two-tier left nav, 304px total width: 64px primary icon strip + 240px secondary text panel. Main content is fluid and scrolls independently.
- **Mobile shell:** 56px header with hamburger + workspace actions. Navigation opens in a left Sheet that stacks the same tier-1 categories above the selected tier-2 section links.
- **Max content width:** Fluid within the main area, tables scroll horizontally on mobile
- **Border radius:** Hierarchical — sm: `calc(0.625rem * 0.6)`, md: `calc(0.625rem * 0.8)`, lg: `0.625rem`, full: `9999px`

## Navigation
- **Desktop:** Gamma-style two-tier shell. Tier 1 is icon-first category navigation (7 main categories + a Settings gear anchored at the strip bottom); Tier 2 shows grouped links for the active category. Workspace/org controls sit at the top of Tier 2.
- **Long-tail groups:** Operations tier-2 sections are collapsible accordions, default collapsed; the section containing the active route auto-opens. Openness is derived state (user override wins), no persistence in v1.
- **Mobile:** Hamburger menu opens a Sheet with tier categories (4-column grid) and section links; it must expose the same destinations as desktop, including the accordions.
- **Active state:** Category and item active states are route-derived. Use longest-prefix style behavior so sibling paths such as `/tax/vat` and `/tax/vat/forecast` do not mis-highlight.
- **Keyboard:** Tier-1 navigation supports arrow keys plus Home/End. Focus states must remain visible and use the shared ring token.
- **Heading hierarchy:** Section headings use `text-foreground/40` (subordinate labels), clickable items use `text-muted-foreground` (interactive), active items use `bg-accent text-accent-foreground font-semibold`
- **Group separation:** Use subtle `border-border` separators between tier panels and section groups; avoid heavy background blocks.

## Motion
- **Approach:** Minimal-functional — only transitions that aid comprehension
- **Easing:** enter: `ease-out`, exit: `ease-in`, move: `ease-in-out`
- **Duration:** micro(50-100ms) short(150-250ms) medium(250-400ms)
- **Where used:** Color transitions on hover (150ms), sheet open/close (200ms), page transitions

## Anti-Patterns (Never Do These)
- Purple/violet gradients as accent
- 3-column feature grid with icons in colored circles
- Gradient buttons as primary CTA
- Uniform bubbly border-radius on everything
- Generic stock-photo hero sections
- Left-border active indicators on sidebar nav (use bg + font-weight instead)

## Decisions Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-04-01 | Initial design system created | Created by /design-consultation based on product context |
| 2026-04-01 | Nav headings use text-foreground/40 | Distinguish from interactive items which use text-muted-foreground |
| 2026-04-01 | Mobile sheet uses bg-sidebar | Prevent white background bleed from bg-background mismatch |
| 2026-04-01 | Mobile-first as core layout principle | Prevent desktop-first debt accumulation |
| 2026-04-01 | App renamed to Long Dtua (ลงตัว) | "Everything falls into place" — product identity |
| 2026-04-01 | No left-border nav indicators | User preference — use bg highlight + font-weight for active state |
| 2026-05-16 | Two-tier navigation shell adopted | Keeps 50+ accounting/tax destinations scannable while preserving existing route compatibility |
| 2026-07-02 | Semantic success/warning/info tokens implemented | UI review found ~127 raw palette usages across 26 files with inconsistent dark mode; tokens + Alert/Badge variants replace them |
| 2026-07-02 | Page heading standardized at 24px/600 | The de-facto standard on all 49 pages; doc updated to match reality instead of forcing a 32px retrofit |
| 2026-07-02 | tabular-nums mandated for money; mono reserved for IDs | Review found a 29-file font-mono / 12-file tabular-nums split on financial columns |
| 2026-07-02 | Kit primitives added: PageHeader, StatCard, Alert, EmptyState, StatusBadge, Amount | Review found the same patterns hand-rolled on ~40 pages with drifting details |
| 2026-07-02 | Nav group headers darkened to text-foreground/70 + border-t separators between tier-2 groups | Founder walkthrough: tax menu group headers read weaker than items, groups blurred together; separators were already specified but never implemented |
| 2026-07-02 | Tier-1 tooltips via portal-based kit Tooltip (Base UI) | Old absolutely-positioned hover span was clipped by the icon strip's scroll container, so labels never appeared |
| 2026-07-02 | Guided-compliance shell: Sales & POS and Compliance tier-1, Operations accordion replaces 29-item More, Settings gear anchored at strip bottom | Founder-approved IA proposal (docs/reviews/nav-ia-proposal-2026-07-02.md) — non-professionals see the monthly loop, not the whole ledger |
