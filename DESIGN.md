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
  - Page heading: 32px / 700 / -0.02em tracking
  - Section heading: 24px / 600 / -0.01em tracking
  - Card heading: 18px / 600
  - Body: 14px / 400 / 1.7 line-height
  - Caption: 12px / 400
  - Nav heading: 11px / 600 / uppercase / 0.08em tracking / text-foreground/40
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
- **Semantic:** 
  - Success: `#2e7d32` (green)
  - Warning: `#f57c00` (amber)
  - Error/Destructive: `oklch(0.577 0.245 27.325)` (red)
  - Info: `#1565c0` (blue)
- **Dark mode:** Invert lightness on neutrals, reduce saturation 10-20% on semantic colors. Surfaces use oklch lightness 0.17-0.28

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
- **Sidebar:** Fixed 256px (w-64) on desktop (md+), sheet overlay on mobile
- **Max content width:** Fluid within the main area, tables scroll horizontally on mobile
- **Border radius:** Hierarchical — sm: `calc(0.625rem * 0.6)`, md: `calc(0.625rem * 0.8)`, lg: `0.625rem`, full: `9999px`

## Navigation
- **Desktop:** Persistent left sidebar with grouped nav items
- **Mobile:** Hamburger menu triggering a Sheet (slide-from-left), same Sidebar component
- **Heading hierarchy:** Section headings use `text-foreground/40` (subordinate labels), clickable items use `text-muted-foreground` (interactive), active items use `bg-accent text-accent-foreground font-semibold`
- **Group separation:** Non-first nav groups have a subtle `border-t border-border/40` with spacing above and below

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
