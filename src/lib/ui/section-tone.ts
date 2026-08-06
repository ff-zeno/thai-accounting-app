/**
 * Section identity hues — the single definition of the tone union.
 *
 * The shell stays Ink Neutral and all of its colour comes from these six
 * section hues (DESIGN.md 2026-08-03). They answer "which section", never
 * "is this OK" — status colour stays with success/warning/destructive.
 *
 * This module deliberately imports nothing. Both the nav (`lib/nav/structure`)
 * and the UI kit (`components/ui/card`) depend on the tone union, and routing
 * it through the nav module would pull the whole nav graph — icons included —
 * into every card.
 *
 * The union is closed on purpose: consumers interpolate the tone into
 * `var(--nav-${tone})`, so a tone with no matching token in globals.css yields
 * an invalid custom property and renders with no colour at all — silently,
 * with no type or runtime error. Add tone and token together.
 */
export type SectionTone =
  | "home"
  | "bank"
  | "income"
  | "expenses"
  | "tax"
  | "vendors"
  | "settings";

/** The CSS custom property holding a tone's hue. */
export function sectionToneVar(tone: SectionTone): string {
  return `var(--nav-${tone})`;
}
