import type { LucideIcon } from "lucide-react";
import {
  Bot,
  Calendar,
  CreditCard,
  FileSpreadsheet,
  GitCompareArrows,
  HandCoins,
  Home,
  Landmark,
  Percent,
  Receipt,
  Settings,
  Users,
} from "lucide-react";

import type { SectionTone } from "@/lib/ui/section-tone";

/**
 * Section identity hue, defined in `lib/ui/section-tone` so the UI kit can
 * carry the same tones onto cards without importing the nav graph. `NavTone`
 * stays as the nav-facing name for it.
 */
export type NavTone = SectionTone;

export interface NavItem {
  labelKey: string;
  href: string;
  icon: LucideIcon;
}

/** A labelled group of child links rendered under an expanded entry. */
export interface NavChildGroup {
  /** null renders the items without a group heading. */
  labelKey: string | null;
  items: NavItem[];
}

/**
 * Top-level sidebar entry. The entry itself is a link (its href is the
 * section home); children never repeat the section home.
 */
export interface NavEntry {
  labelKey: string;
  icon: LucideIcon;
  href: string;
  children: NavChildGroup[];
  /** Section identity hue; children inherit it. */
  tone: NavTone;
  /** Badge slot identifier, resolved to a count by the shell. */
  badgeKey?: "income" | "expenses" | "bank" | "tax";
}

/**
 * Six top-level entries following the money itself: what the bank did, what
 * came in, what went out, and what the Revenue Department wants for it.
 *
 * Income and Expenses were one "Documents" entry until 2026-08-05. They were
 * always two unrelated populations — `documents.direction` splits every query
 * already — so the entry named a table, not a thing the owner does. Anything
 * outside this loop was removed on 2026-08-03 and is recorded in
 * docs/deferred-features.md.
 */
export const navEntries: NavEntry[] = [
  {
    labelKey: "home",
    icon: Home,
    href: "/dashboard",
    tone: "home",
    children: [],
  },
  {
    labelKey: "bank",
    icon: Landmark,
    href: "/bank-accounts",
    tone: "bank",
    badgeKey: "bank",
    // Upload lives in the /bank-accounts tab strip; reconciliation's own
    // surfaces (review, AI review, insights) live in its tab strip. The
    // sidebar only carries the section home of the reconciliation subflow.
    children: [
      {
        labelKey: null,
        items: [
          { labelKey: "reconciliation", href: "/reconciliation", icon: GitCompareArrows },
        ],
      },
    ],
  },
  {
    labelKey: "income",
    icon: HandCoins,
    href: "/income",
    tone: "income",
    badgeKey: "income",
    // Invoices / Settlements are the /income tab strip; Upload is reached
    // from the list toolbar (with a BackLink out). Capture has the top-bar
    // button and the mobile FAB. No sidebar children needed.
    children: [],
  },
  {
    labelKey: "expenses",
    icon: CreditCard,
    href: "/expenses",
    tone: "expenses",
    badgeKey: "expenses",
    // No tab strip: Upload is reached from the list toolbar (with a
    // BackLink out), so the section is just its list.
    children: [],
  },
  {
    labelKey: "tax",
    icon: Receipt,
    href: "/tax",
    tone: "tax",
    badgeKey: "tax",
    // One child level only — VAT and WHT internals are those pages' tab
    // strips. The sidebar never gets deeper than "VAT".
    children: [
      {
        labelKey: null,
        items: [
          { labelKey: "taxVat", href: "/tax/vat", icon: Receipt },
          { labelKey: "withholdingTax", href: "/tax/withholding", icon: Percent },
          { labelKey: "taxCalendar", href: "/tax/calendar", icon: Calendar },
          { labelKey: "statutoryReports", href: "/tax/reports", icon: FileSpreadsheet },
        ],
      },
    ],
  },
  {
    labelKey: "vendors",
    icon: Users,
    href: "/vendors",
    tone: "vendors",
    children: [],
  },
];

/** Settings lives in the sidebar footer, below the main entries. */
export const settingsEntry: NavEntry = {
  labelKey: "settings",
  icon: Settings,
  href: "/settings",
  tone: "settings",
  children: [
    {
      labelKey: null,
      items: [
        { labelKey: "aiSettings", href: "/settings/ai", icon: Bot },
      ],
    },
  ],
};

export function isHrefActive(pathname: string, href: string): boolean {
  if (pathname === href) return true;
  if (href === "/dashboard") return false;
  return pathname.startsWith(`${href}/`);
}

function allNavItems(entries: NavEntry[]): NavItem[] {
  return entries.flatMap((entry) => [
    { labelKey: entry.labelKey, href: entry.href, icon: entry.icon },
    ...entry.children.flatMap((group) => group.items),
  ]);
}

/** Longest matching href wins, so deep links highlight the deepest item. */
export function getActiveNavItem(pathname: string): NavItem | null {
  const items = allNavItems([...navEntries, settingsEntry]);
  return (
    items
      .filter((item) => isHrefActive(pathname, item.href))
      .sort((a, b) => b.href.length - a.href.length)[0] ?? null
  );
}

export function isNavItemActive(pathname: string, item: NavItem): boolean {
  return getActiveNavItem(pathname)?.href === item.href;
}

/**
 * The entry that owns the current pathname — the one containing the active
 * item (longest global match), so overlapping hrefs (e.g. reconciliation
 * rules under Bank vs the Settings entry) resolve to a single owner.
 */
export function getActiveNavEntry(pathname: string): NavEntry | null {
  const active = getActiveNavItem(pathname);
  if (!active) return null;
  return (
    [...navEntries, settingsEntry].find(
      (entry) =>
        entry.href === active.href ||
        entry.children.some((group) =>
          group.items.some((item) => item.href === active.href)
        )
    ) ?? null
  );
}

/**
 * The section hue a page should carry (DESIGN.md 2026-08-05 — owner decision
 * F4: the primary card takes a top rule in its section's tone).
 *
 * Derived from the same entry the sidebar highlights, so a page can never
 * disagree with the nav about which section it is in. Routes outside the nav
 * tree — document review, capture — return null and render untoned; those
 * pages are direction-agnostic and would have to pick a tone from their data,
 * which is a per-page decision, not a routing one.
 */
export function getSectionTone(pathname: string): NavTone | null {
  return getActiveNavEntry(pathname)?.tone ?? null;
}
