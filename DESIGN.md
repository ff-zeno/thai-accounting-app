# Design System — Long Tua (ลงตัว)

This document governs all visual and UI decisions.
It reflects the owner-approved 2026-08 UX reset ("Quicken Soft" surfaces + Ink Neutral accent), the money-flow nav restructure, and the ledger-table + panel-doctrine decisions of 2026-08-05.
Approval evidence: `docs/reviews/owner-mode-ux-reset-approved-mockups-2026-08-01.html` (Lavish review rounds, owner sign-off "Good, looks aligned now") and `docs/reviews/design-kit-directions-approved-2026-08-05.html` (2026-08-05 kit decisions A–D).
Do not deviate without explicit owner approval.
In QA mode, flag any code that does not match this document.

## Product Context
- **What this is:** AI-powered Thai accounting platform — document management, bank reconciliation, WHT/VAT filing, Revenue Department compliance
- **Who it's for:** Thai business owners first (owner mode is the default experience), accountants second
- **Space/industry:** Thai accounting SaaS (peers: FlowAccount, Peak, Xero)
- **Project type:** Web app / dashboard with data-dense views
- **Brand:** "Long Tua" (ลงตัว — "everything falls into place"). The romanization is exactly `Long Tua` everywhere it renders.

## Aesthetic Direction — "Quicken Soft" + Ink Neutral
- **Direction:** Calm instrument. Soft gray canvas, white rounded cards, one near-black ink accent. Typography and spacing do the work; color is rare and always means something.
- **Reference kit (owner-approved):** Quicken Simplifi for the general shell and global styles — app frame, buttons, menus, card anatomy (stat label + big number + tinted sub-panel for detail).
  Supporting references: Midday (evidence-inbox workflow IA, review states), Mercury/Attio (dense tables + side drawers), Wise (mobile action patterns), Etsy/Stripe (settlement gross→fee→net presentation), Mixpanel (report/chart boards only).
  We take structure, spacing, and component shapes from references — never their palettes. Quicken's violet is explicitly banned.
- **Mood:** Trustworthy, precise, calm. Financial data is serious; the UI respects that without being cold.
- **Process — Mobbin as flow reference:** when building or reworking an individual UI flow (search, onboarding, capture review, filing wizard, etc.), pull real-product flow references from Mobbin first (`mcp__mobbin__search_flows` / `search_screens`), pick a reference pattern, and record it in the Decisions Log. Shell and kit primitives are already decided here and are not re-litigated per flow.

## Typography
- **Families:** Geist Sans (Latin), Noto Sans Thai (Thai glyphs, weight-matched), Geist Mono (identifiers only). Loaded via `next/font`.
- **Scale:**
  - Page heading: 24px / 600 / tracking-tight (`text-2xl font-semibold tracking-tight` — always via `PageHeader`).
    **Composite-header exception:** a page whose header row must compose inline context around the title (back link + identifier + status + tabs + actions, e.g. bank-account detail, document review) may render its own `<h1>` with these exact classes instead of `PageHeader`; the typography is still frozen.
  - Section heading: 18px / 600
  - Card heading: 16px / 500 (`CardTitle` default — never override per page)
  - Body: 14px / 400
  - Caption: 12px / 400 — the smallest size; never `text-[10px]`
  - Nav item: 14px / 500 `text-muted-foreground`; active: 14px / 600 `text-accent-foreground`
  - Nav icon: per-section tone via `<NavIcon>` — see the 2026-08-03 tone-tile decision, which supersedes the earlier accent-tint rule. `nav-icon.tsx` is the only place tones are read.
  - Nav group label: 11px / 600 / uppercase / 0.08em tracking / `text-foreground/70` (sidebar only — a legacy exception to the 12px floor; new group labels use the 12px caption rule below)
  - Column header / sub-nav group label: 12px / 500 / uppercase / `tracking-wide` / `text-muted-foreground` — the caption-case convention shared by `TableHead` and `SubNav`
- **Financial numbers:** always `tabular-nums`, always rendered through the `Amount` component, right-aligned in tables.
  Geist Mono is reserved for identifiers (account numbers, tax IDs, references) — never for money.
- **Satang de-emphasis:** `Amount` renders the decimal half at `max(12px, 0.85em)` and `opacity-70` so a column of figures scans on the baht.
  The step is relative so it holds from a caption to a 30px stat; the floor keeps it at or above the 12px minimum.
  The two halves are adjacent text nodes and must always concatenate back to `formatAmount(value)` exactly — that invariant is what keeps copy-paste and screen readers reading one whole number, and it is unit-tested in `money.test.ts`.
  The split lives in `splitAmountParts()` in `src/lib/utils/money.ts`, never in JSX.
- **Non-money numbers (documented exemptions to the Amount rule):**
  counts and quantities may use `toLocaleString` (transaction counts, token counts, document counts);
  4-decimal inventory figures (quantities, unit costs) render via a local `quantity()` helper;
  USD AI micro-costs (`ai-cost-analytics`) use a local `formatUsd` (6 decimals below one cent — `Amount`'s 2-decimal THB format cannot express them);
  text-only contexts that cannot hold an element (e.g. `<option>` labels) call `formatAmount()` from `src/lib/utils/money.ts` — the same function `Amount` renders.
  Money math is always integer satang via `src/lib/utils/money.ts` (`sumAmounts`, `toSatangOrZero`, `fromSatang`) — never float arithmetic.

## Color — Ink Neutral (token source: `src/app/globals.css`)
- **Approach:** one ink accent + cool grays. Semantic colors are the only saturated colors on screen.
- **Canvas / background:** `oklch(0.972 0.003 260)` — soft cool gray; the page is never white
- **Card:** `oklch(1 0 0)` white — content sits on white cards over the gray canvas
- **Foreground:** `oklch(0.145 0 0)`
- **Primary (ink):** `oklch(0.22 0.01 260)`; primary-foreground white. Marks the single primary action per view.
- **Accent (brand-soft):** `oklch(0.945 0.012 260)`; accent-foreground `oklch(0.22 0.02 260)`. Used for hover/active nav states and tinted sub-panels.
- **Muted:** `oklch(0.97 0 0)`; muted-foreground `oklch(0.556 0 0)`
- **Border:** `oklch(0.94 0 0)`; input border `oklch(0.90 0 0)`; ring `oklch(0.55 0.02 260)`
- **Semantic (tokens only — never raw Tailwind palette classes):**
  - Success: `--success` `oklch(0.52 0.14 150)`
  - Warning: `--warning` `oklch(0.55 0.14 60)`
  - Error/Destructive: `--destructive` `oklch(0.577 0.245 27.325)`
  - Info: `--info` `oklch(0.47 0.14 255)`
  - Soft usage via opacity modifiers: `bg-success/10 border-success/30 text-success`; solid usage pairs with `*-foreground`. Badge has `success`/`warning`/`info` variants; banners use `Alert`.
- **Charts:** neutral ink lightness ramp `--chart-1..5` for series data; evaluative charts (good/at-risk/bad) use success/warning/destructive directly. Never blue/violet series colors.
- **Bank-brand exemption:** Thai bank identity colors (KBank green, SCB purple, …) in the bank-account list and statement-upload bank picker are brand marks, not UI semantics — they are the only permitted raw palette classes and live only in `bank-account-list.tsx` and `smart-upload-form.tsx`.
- **Dark mode:** removed. There is no `.dark` block, no `dark:` variants, no theme switching. Reintroducing dark mode is a product decision, not a styling tweak.
- **Retired:** the warm golden-brown accent (oklch hue 80) and all `--sidebar-*` tokens.

## Surfaces
- **Card anatomy:** white `bg-card`, `border border-border`, `shadow-xs` (`0 1px 2px oklch(0 0 0 / 0.05)`), `rounded-xl` (14px). No rings, no heavier shadows.
- **Tinted sub-panel** (detail block inside a card): inline `rounded-lg bg-accent p-4` — usage pattern, not a component.
- **Ledger table:** a table is data on paper, not a boxed widget.
  No header fill, no zebra striping, no inner grid lines.
  Structure comes from hairline row rules, caption-case column headers on the card surface, a `hover:bg-accent/45` row wash, and a selected-row 2px ink bar drawn as an inset shadow on the first cell so selection costs no width.
  Every table lives inside a card — `TableCard` for a standalone table, or `Card` + `CardContent` when it is one part of a larger card.
  A table must never be wrapped in a bare bordered div: that gives an 8px radius against the card's 14px, no `bg-card`, and no shadow.
- **Full-bleed table region:** when a table is the only content of its card, its row rules run to the card border rather than stopping short and drawing a second box inside the first.
  `CardContent` does this automatically via `:has(> [data-slot=table-container]:only-child)`; `Table` re-applies the card's padding to its first and last columns so text still lines up with the card title.
  A card that also holds filters or a summary keeps its padding.
- **Ruled total:** a totals row takes a single rule above it and a double rule (`border-b-[3px] border-double`) closing the final line, the way a ledger rules one.
  `TableFooter` carries both; it sits on the card surface, not a grey band.
- **Section tone rule:** a page's primary card may take a 2px top rule in its section's identity hue via `Card`'s `tone` prop (`sectionToneVar` → `var(--nav-*)`).
  One toned card per page — a tone on every card turns identity into noise.
  A tone is never a status signal.
- **White vs canvas:** after the gray canvas, `bg-background` means gray. Anything that must read as a raised white surface uses `bg-card` (active tab pill, outline button, sheets, popovers).
- **Border radius:** `--radius: 0.625rem`; hierarchical sm/md/lg from it; cards are `rounded-xl` = 14px exactly. Do not invent new radii.

## Spacing
- **Base unit:** 4px; scale 2xs(2) xs(4) sm(8) md(16) lg(24) xl(32) 2xl(48) 3xl(64)
- **Density:** comfortable — financial data needs breathing room to scan
- **Touch targets:** minimum 44px height for anything reachable by touch — tab strips (they render on mobile), the mobile tab bar, and the mobile More sheet. The desktop-only sidebar and top bar are pointer-driven and may be denser (rows and controls ≥36px).

## Layout & Shell
- **Desktop shell:** labelled left sidebar (~240px, `bg-card`, border-right) + thin top bar + fluid main content on the gray canvas.
  - Sidebar: brand + org switcher in the header; 6 top-level items; Settings pinned in the footer.
    Labelled, not an icon rail — the sections are domain terms a business owner should not have to decode from a glyph.
  - Top bar: capture button, help trigger, locale switcher, user menu. No search, no month picker (future flows — search will be Mobbin-guided when built; a persistent global period context is an explicit non-goal).
- **Mobile shell:** bottom tab bar — Home, Income, ＋ capture FAB (center, routes to `/capture`), Expenses, More.
  The FAB sits between the two sides of the money flow, which reads correctly: what you capture lands in one or the other.
  Bank and Tax live in the More sheet, which exposes the full nav tree so every route stays reachable. No hamburger, no drawer.
- **Panel doctrine** (three distinct things — do not conflate them):
  - **Overlay detail panel:** a temporary view of one record opens as a right-side `Sheet` at `z-50`, over the page.
    It must not resize or reflow the content underneath — the row it describes stays exactly where it was.
    Scrim is `bg-black/10` and there is deliberately **no backdrop blur**: the panel is about the row behind it, so that row has to stay legible.
    This is the rule for every overlay in the app, dialogs included — one scrim treatment, no exceptions.
  - **Context panel:** a persistent left column carrying section state (account balances, saved views and their counts, the active tax period).
    It is collapsible and the collapsed state persists.
  - **Sub-nav column:** grouped navigation links with uppercase group headings, rendered by `SubNav`, replacing the tab strip where a section has enough destinations to need grouping.
    Like tab strips it is a `nav[aria-label="Section navigation"]` of real links, never `role="tab"`.
- **Breakpoints:** `sm(640px)` `md(768px)` `lg(1024px)` `xl(1280px)`; mobile-first — components are designed at 320px first.
- **Max content width:** fluid within the main area; tables scroll horizontally on mobile.

## Navigation
- **Top level (exactly six):** Home, Bank, Income, Expenses, Tax, Vendors — plus Settings in the sidebar footer.
  The order follows the money: what the bank did, what came in, what went out, and what the Revenue Department wants for it.
  There is no profile gate on any entry.
- **Groups expand in place** (accordion; the active section auto-opens): Bank ▾ Reconciliation; Tax ▾ VAT / Withholding / Calendar / Reports.
  Income, Expenses, Vendors and Home have no sidebar children — their sub-destinations are tab strips.
- **URLs move only when a section genuinely splits, never for cosmetics.**
  The rule this replaces ("URLs never move for IA reasons") existed so deep links always work, which redirect stubs preserve.
  A route move requires a redirect stub for every old path in the same diff.
  `/documents/[docId]/review` deliberately did not move when Documents split: it is direction-agnostic and deep-linked from four places, so it stopped being a nav section and became what it already was — a stable resource URL.
- **Depth budget: max 2 nav levels ever** — sidebar parent → (sidebar child | in-page tab). Anything deeper is a drawer, dialog, or drill-down row inside the page.
- **In-page tabs are route-based:** a tab strip is a `nav[aria-label="Section navigation"]` of links styled as tabs, rendered by a nested `layout.tsx`. Deep links always work; the URL is the state. Genuine content tabs inside one route (e.g. PND 2/3/53/54 form panels) use the Base UI `Tabs` component.
- **Strip vs column:** a tab strip is the default for a handful of peer destinations.
  Switch to a `SubNav` column when the destinations need grouping or no longer fit one line — a strip caps out around four and cannot say that two of them belong together.
  Both carry the same landmark and the same longest-prefix active rule, so the test contract is identical.
- **Active state:** route-derived, longest-prefix; rendered as `bg-accent text-accent-foreground font-semibold` plus `aria-current="page"`. No left-border indicators.
- **Badges carry "why go here":** counts on Documents/Bank (same query as the dashboard cockpit — numbers must never disagree) and the next filing deadline chip on Tax. Badges are advisory and eventually consistent — they refresh per navigation, never by polling. Badge pills are `aria-hidden` so a link's accessible name never churns with data ("Documents", never "Documents 7"); the cockpit carries the authoritative, accessible counts.
- **Keyboard:** sidebar uses roving tabindex — arrow keys move focus, Enter activates, Home/End jump. Focus rings use the shared ring token and must stay visible.

## Domain Display Rules
- **Settlement strip (sales/POS money):** Gross − Discounts (may be 0) → VAT (7/107 of the discounted total) → − Fees → **Net-to-bank**. Net is what reconciliation matches against statements. Rendered with the `FlowStrip` component; every figure through `Amount`.
- **Gross and net never appear apart.** Output VAT is owed on the gross sale price, not on the net that lands in the bank after processor fees — so any surface showing a net payout shows the gross beside it.
  A ฿1,070 card sale that deposits ฿1,048.60 still owes VAT on ฿1,070; a row showing only the net reads as an income figure and is a compliance defect waiting to happen.
  This governs the settlement register (`/income/settlements`) and the payout queue (`/reconciliation/payouts`) alike.
- **PP30 computation strip:** the VAT dashboard renders the PP30 math the same way — Output VAT − Input VAT − PP36 reclaim − Carryforward = **Net VAT payable** — via `FlowStrip` (`src/components/ui/flow-strip.tsx`); the equals-step gets `bg-accent` emphasis.
- **Tax IA:** the Compliance Calendar is a pure awareness hub linking into VAT and WHT sections. PP36 is never mixed into PP30 input VAT. อย่างย่อ (abbreviated) receipts cannot claim input VAT.
- **Status rendering:** every domain status has exactly one bilingual rendering, defined in the status registry (`src/lib/ui/status-registry.ts`) and rendered by `StatusBadge`. No page-local status colors or labels.
- **Workflow explainer graphs:** clean n8n-style node canvases (never sketch/whiteboard styling), English labels, click-a-node → explainer sidebar. Explanatory only — an ordered-text equivalent must exist for accessibility.
- **AI posture:** AI suggests, humans confirm. Every AI-derived value shows confidence and a review affordance; nothing auto-commits.

## Motion
- **Approach:** minimal-functional — only transitions that aid comprehension
- **Easing:** enter `ease-out`, exit `ease-in`, move `ease-in-out`
- **Duration:** micro(50-100ms) short(150-250ms) medium(250-400ms)
- **Where used:** hover color transitions (150ms), sheet open/close (200ms), accordion expand

## Test Contract (accessibility layer — no test IDs)
- e2e asserts roles, names, and ARIA — never `data-testid`.
- Fixed landmarks: `nav[aria-label="Primary navigation"]` (sidebar), `nav[aria-label="Section navigation"]` (tab strips), `nav[aria-label="Mobile navigation"]` (bottom bar), `nav[aria-label="More navigation"]` (full nav tree inside the mobile More sheet); every route renders a visible `<main>`.
- **Heading-text freeze:** rendered page-heading accessible names are byte-frozen; changing one requires updating the corresponding spec in the same diff.
- Active nav state is asserted via `aria-current="page"` (primary) with the `bg-accent` class as canary.

## Anti-Patterns (Never Do These)
- Purple/violet as accent; any raw Tailwind palette class (`bg-green-500`, `text-blue-600`, …) — semantic tokens only (sole exemption: bank brand marks, see Color)
- `font-mono` or `toLocaleString` for money — `Amount` is the only money path (non-money exemptions listed under Typography)
- `dark:` variants or theme providers — dark mode does not exist
- Left-border active indicators on nav
- Stateful in-page tabs for navigation (tabs that don't change the URL) — section tabs are links
- 3-column feature grids with icons in colored circles, gradient buttons, uniform bubbly radii, stock-photo heroes
- `data-testid` attributes — the accessibility layer is the test contract
- Tables in a bare `rounded-md border` div — every table lives in a card (see Surfaces)
- Grey table header bands, zebra striping, or inner grid lines
- Backdrop blur behind **any** overlay — sheet, dialog, popover. A scrim dims; it never blurs. The page behind an overlay is usually the context the overlay is about
- A detail panel that pushes or resizes the page underneath it

## Decisions Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-04-01 | Initial design system created | /design-consultation baseline |
| 2026-04-01 | Mobile-first as core layout principle | Prevent desktop-first debt |
| 2026-04-01 | No left-border nav indicators | Owner preference — bg + weight for active state |
| 2026-05-16 | Two-tier navigation shell adopted | Superseded 2026-08-02 by the single-sidebar shell |
| 2026-07-02 | Semantic success/warning/info tokens; Alert/Badge variants | ~127 raw palette usages replaced |
| 2026-07-02 | Page heading standardized at 24px/600 | De-facto standard across all pages |
| 2026-07-02 | tabular-nums mandated for money; mono reserved for IDs | 29-file font-mono / 12-file tabular-nums split found |
| 2026-07-02 | Kit primitives: PageHeader, StatCard, Alert, EmptyState, StatusBadge, Amount | Same patterns hand-rolled on ~40 pages |
| 2026-08-02 | Quicken Simplifi = primary shell/global-style reference; Midday/Mercury/Attio/Wise/Stripe supporting | Owner selection from Mobbin review |
| 2026-08-02 | **Ink Neutral palette adopted; warm golden-brown retired** | Owner-approved mockups (Lavish rounds 1–3): gray canvas, white cards, ink accent |
| 2026-08-02 | **Single sidebar, 5 top-level items + gated Sales; owner/pro toggle rejected; depth budget ≤2; in-page tabs route-based** | Owner: "no owner/pro toggle — minimise menu items and fold complexity inside pages" |
| 2026-08-02 | Dark mode removed entirely | Dead code — never activated; owner-mode reset ships light-only |
| 2026-08-02 | Nav pins feature removed (`user_nav_pins` dropped) | Doesn't fit the minimal 5-item nav; owner decision |
| 2026-08-02 | Brand romanization standardized to "Long Tua" | Owner decision (RTGS romanization) |
| 2026-08-02 | Thin desktop top bar (capture/help/locale/user); search + month slots deliberately absent | Search is a future Mobbin-guided flow; global period context is a non-goal |
| 2026-08-02 | Mobbin recorded as the flow-reference process for future flows | Owner instruction during reset planning |
| 2026-08-02 | Composite-header exception codified (inline `<h1>`, frozen typography) | Bank-account detail + document review need inline back-link/tabs/actions |
| 2026-08-02 | Money-formatting exemptions codified: counts/quantities, 4-decimal inventory figures, USD AI micro-costs, `<option>` text | Stage 5 sweep — `Amount` covers all THB money; satang lib mandated for money math |
| 2026-08-02 | Bank brand colors exempted from the raw-palette ban | Brand identity marks, not UI semantics |
| 2026-08-02 | FlowStrip extended to the PP30 computation strip | Same gross→net display rule as settlement math |
| 2026-08-02 | **Sidebar children de-duplicated against tab strips** — Tax ▾ VAT / Withholding Tax / Compliance Calendar / Statutory Reports; Bank ▾ Reconciliation only; Documents has no children. A destination appears in the sidebar OR a tab strip, never both | Sol pass (b) P1: sidebar duplicated every tab strip, breaking the depth budget; approved mockup shows one child level |
| 2026-08-02 | Tab-strip links get `min-h-11` (44px touch-target floor applies to tab strips, not just nav/mobile bar) | Sol pass (b) P1: 36px tabs vs the documented 44px minimum |
| 2026-08-02 | "Compliance Calendar" is the one name for /tax/calendar (page title + EN nav; TH stays ปฏิทินภาษี) | Sol pass (b) P2: three names in flight (Tax Calendar / Filing Calendar / Compliance Calendar) |
| 2026-08-02 | Document-side reconciliation badges (documents table + detail sidebar) route through the status registry; localized labels stay via the `label` prop | /design-review audit P1: matched/partial/unmatched rendered as default/outline/secondary locally while the transaction table used registry variants for the same statuses |
| 2026-08-03 | **`--accent` chroma raised 0.012 → 0.032; `--accent-foreground` 0.22/0.02 → 0.33/0.075** | Owner review: "the menu items could have more colour". At 0.012 chroma the active nav pill was a 5% lightness step off a white sidebar and the whole shell read monochrome. Ripples consistently to every selected/highlighted surface (menu highlight, selected model/account rows, FlowStrip equals-step, help topic) |
| 2026-08-03 | ~~Nav icons carry the accent hue (`/55` idle, full when active)~~ — superseded the same day by the per-section tones below | First attempt at the owner's "more colour" note; tinting one hue onto monochrome glyphs was not what the mockups showed |
| 2026-08-03 | **Six `--nav-*` section identity hues + `<NavIcon>` coloured tiles.** Top-level rows render a 28px `rounded-lg` tile at a 14% tint of the section hue with the glyph at full hue, solid-filled when the section is active; children render the parent's hue as a bare glyph; the mobile bottom bar renders bare glyphs (a tile would crowd the FAB). All six tones live in `globals.css`; `src/components/layout/nav-icon.tsx` is the only place they are read | Owner review: "menu items have lame icons, could be colourful, rich icons like in earlier mockups". The approved Lavish mockups got ALL their colour from emoji glyphs on an otherwise neutral shell — so per-section coloured icons honour both the Ink Neutral palette and the owner's memory. Vector, not emoji, so it renders identically on every OS and in print. **Nav tones are identity, never status** — they answer "which section", not "is this OK"; status colour stays with success/warning/destructive. Tones resolve through inline `color-mix` on `var(--nav-*)` because Tailwind cannot statically scan a runtime-built `bg-nav-${tone}` class. Active-state contract (`bg-accent` + `font-semibold` + `aria-current`) unchanged |
| 2026-08-03 | `--muted-foreground` darkened 0.556 → 0.48 and given the ink hue | Adjacent defect found while adding nav colour: pure-gray 0.556 on white is ~3.5:1, below the AA 4.5:1 floor this doc requires. Now ~4.6:1 on white |
| 2026-08-03 | Tab strips get `gap-1` between tabs, `px-4` per tab, and an `bg-accent/70` track | Owner review: "selectors to swap between internal tabs lack padding/separation". The `bg-muted` track was a 3% step off the white active pill, so tabs ran together with no visible boundary |
| 2026-08-03 | Desktop top-bar controls standardized at h-9 with explicit horizontal padding; header h-12 → h-14; help trigger 44px → 36px | Owner review: "some small buttons in the top strip lack padding". The `sm` button variant's `has-data-[icon=inline-start]:pl-1.5` rule cut the leading edge to 6px whenever a button had an icon. Fixed per-instance in the top bar, not in the shared `sm` variant, to avoid rippling across every small button in the app |
| 2026-08-05 | **Nav restructured around the money flow: six top-level entries — Home, Bank, Income, Expenses, Tax, Vendors.** Mobile bar becomes Home / Income / ＋ / Expenses / More | Owner: "income/sales needs to be a primary menu item (likewise with expenses) … The sections need to align with the flow chart of money flow". "Documents" was two unrelated populations wearing one label — `documents.direction` already split every query — so the entry named a table, not a thing the owner does |
| 2026-08-05 | **"URLs never move for IA reasons" amended** to "URLs move only when a section genuinely splits, never for cosmetics", with a mandatory redirect stub per old path | The rule's purpose is that deep links always work, which redirects preserve. Documents splitting into Income/Expenses is a real IA change, not a reshuffle. `/documents/[docId]/review` stays put — direction-agnostic and deep-linked from four places |
| 2026-08-05 | **Ledger table (T1) adopted as the data surface: table lives in a card, no header fill, no zebra, no inner grid, hairline rules, caption-case heads, full-bleed rows, ruled + double-ruled total.** New `TableCard` primitive; `Card` gains full-bleed handling | Owner report: "tables on many pages lack a background". Root cause was not styling taste — 5 call sites wrapped `Table` in `rounded-md border`, giving an 8px radius against the card's 14px, no `bg-card` and no shadow, so tables were the one major surface that never joined the card system. Direction from Mobbin: Quicken renders almost no true tables — its account lists are cards of rows with hairline rules and right-aligned money |
| 2026-08-05 | **Panel doctrine split into three (P1/P2/P3): overlay detail panel, persistent context panel, sub-nav column.** Overlay panels are `z-50` over the page, must not resize it, take a `bg-black/10` scrim and **no blur**. Context panel is collapsible with persisted state. `SubNav` replaces the settings tab strip | Owner: "by design I prefer to use sidebars for exposing specific items settings, deeper info". On the overlay, verbatim: "it should be over the top of the UI -- high z-index, not causing the underlying page to resize … it can have a mild e.g. 5-10% dark overlay underneath it, but avoid blurring content when the sidebar opens". The `Sheet` backdrop's `supports-backdrop-filter:backdrop-blur-xs` was removed to comply |
| 2026-08-05 | **Domain flavour moves adopted (F1/F2/F4/F5), all spending zero colour budget:** satang-split money, ruled + double-ruled totals, section tone as a card top-rule, 12px tracked card over-line labels | Owner: "I don't want the app to look like every other AI app with no flavour". The generic look is grey canvas + white rounded cards + one neutral accent + Geist + Lucide, i.e. default shadcn. The palette is right for financial data — what was missing is a *domain* signature, so the four chosen moves are accounting conventions rather than decoration. A Thai-script brandmark (F3) was offered and not selected |
| 2026-08-05 | Satang halves must recompose to `formatAmount()` exactly; split logic lives in `splitAmountParts()` in `money.ts`, not JSX | The halves render as adjacent text nodes, so copy-paste and screen readers see whatever they concatenate to. Vitest only includes `src/**/*.test.ts` (no jsdom, no `.tsx` tests), so putting the logic in a pure module is also the only way to get it under test |
| 2026-08-05 | `SectionTone` union defined in `src/lib/ui/section-tone.ts`, import-free; `NavTone` aliases it | The UI kit needs the tone union for card top-rules, and routing it through `lib/nav/structure` would pull the whole nav graph — lucide icons included — into every `Card`. The union stays closed because a tone with no matching `--nav-*` token renders colourless silently, with no type or runtime error |
| 2026-08-06 | **Merchant settlements split across two surfaces: the register at `/income/settlements` (Income), the match queue at `/reconciliation/payouts` (Bank).** Settlements are not duplicated into both | They answer different questions. The register says what the processor claims it paid and whether it landed; the queue says which bank deposit each payout explains. Putting a settlement in both sections would make Income look like it owns a reconciliation workflow |
| 2026-08-06 | **Gross stays on screen next to net on every payout surface**, and the payout queue renders the gross column even though the matcher never compares it | The matcher compares only `net_payout`, so gross is display-only there — which is exactly why it is easy to drop. A row showing only net reads as an income figure, and output VAT is owed on gross. The column is the guard-rail, not decoration |
| 2026-08-06 | **Settlement match rate is its own stat on the Payouts page, deliberately not folded into the reconciliation insights dashboard** | `getMatchRateByLayer` groups over `reconciliation_matches.match_metadata->>'layer'` and settlements never write there. Blending the two would make one headline number mean two different things — a document match and a payout claim are not the same event |
| 2026-08-06 | `suggested` added to the status registry as `info` (settlement claimed a deposit, human has not confirmed) | Settlement matching introduced a state the document side has no word for. Registry-first per the status rendering rule — a page-local badge for it would have been the fourth place statuses get their own colours |
