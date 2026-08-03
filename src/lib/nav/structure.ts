import type { LucideIcon } from "lucide-react";
import {
  Activity,
  BarChart3,
  Bot,
  BookOpen,
  Boxes,
  Calendar,
  ClipboardList,
  FileText,
  FolderKanban,
  GitCompareArrows,
  Home,
  Landmark,
  Layers3,
  LockKeyhole,
  MoreHorizontal,
  PackageSearch,
  Receipt,
  Settings,
  ShoppingCart,
  SplitSquareVertical,
  Upload,
  Users,
  UsersRound,
} from "lucide-react";

/** Org profile flags that gate nav visibility. */
export interface NavGateFlags {
  hasPosSales: boolean;
  hasEmployees: boolean;
}

export interface NavItem {
  labelKey: string;
  href: string;
  icon: LucideIcon;
  /** Item only renders when the org profile flag is true. */
  gate?: keyof NavGateFlags;
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
  /** Entry only renders when the org profile flag is true. */
  gate?: keyof NavGateFlags;
  /** Badge slot identifier, resolved to a count by the shell (Stage 3). */
  badgeKey?: "documents" | "bank" | "tax";
}

export const navEntries: NavEntry[] = [
  {
    labelKey: "home",
    icon: Home,
    href: "/dashboard",
    children: [],
  },
  {
    labelKey: "bank",
    icon: Landmark,
    href: "/bank-accounts",
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
    labelKey: "documents",
    icon: FileText,
    href: "/documents/expenses",
    badgeKey: "documents",
    // Expenses / Income / Upload are the /documents tab strip; Capture has
    // the top-bar button and the mobile FAB. No sidebar children needed.
    children: [],
  },
  {
    labelKey: "tax",
    icon: Receipt,
    href: "/tax",
    badgeKey: "tax",
    // One child level only — VAT and WHT internals are those pages' tab
    // strips. The sidebar never gets deeper than "VAT".
    children: [
      {
        labelKey: null,
        items: [
          { labelKey: "taxVat", href: "/tax/vat", icon: Receipt },
          { labelKey: "withholdingTax", href: "/tax/withholding", icon: Receipt },
          { labelKey: "taxCalendar", href: "/tax/calendar", icon: Calendar },
          { labelKey: "statutoryReports", href: "/tax/reports", icon: FileText },
        ],
      },
    ],
  },
  {
    labelKey: "sales",
    icon: ShoppingCart,
    href: "/sales",
    gate: "hasPosSales",
    children: [],
  },
  {
    labelKey: "more",
    icon: MoreHorizontal,
    href: "/vendors",
    children: [
      {
        labelKey: "masterData",
        items: [
          { labelKey: "vendors", href: "/vendors", icon: Users },
          { labelKey: "costCenters", href: "/settings/cost-centers", icon: Layers3 },
          { labelKey: "projects", href: "/settings/projects", icon: FolderKanban },
          { labelKey: "allocationRules", href: "/settings/allocation-rules", icon: SplitSquareVertical },
        ],
      },
      {
        labelKey: "accounting",
        items: [
          { labelKey: "generalLedger", href: "/accounting", icon: BookOpen },
          { labelKey: "journal", href: "/accounting/journal", icon: BookOpen },
          { labelKey: "postingExceptions", href: "/accounting/posting-exceptions", icon: Activity },
          { labelKey: "reports", href: "/accounting/reports", icon: BarChart3 },
        ],
      },
      {
        labelKey: "inventoryImports",
        items: [
          { labelKey: "inventoryControl", href: "/inventory", icon: Boxes },
          { labelKey: "importsControl", href: "/imports", icon: PackageSearch },
        ],
      },
      {
        labelKey: "payrollAssets",
        items: [
          { labelKey: "payrollControl", href: "/payroll", icon: UsersRound, gate: "hasEmployees" },
          { labelKey: "fixedAssetRegister", href: "/fixed-assets", icon: ClipboardList },
          { labelKey: "fixedAssetRollForward", href: "/fixed-assets/reports/roll-forward", icon: ClipboardList },
        ],
      },
      {
        labelKey: "yearEndClose",
        items: [
          { labelKey: "closeChecklist", href: "/close", icon: LockKeyhole },
          { labelKey: "citWorkbench", href: "/year-end/cit", icon: Landmark },
        ],
      },
      {
        labelKey: "toolsAdmin",
        items: [
          { labelKey: "accountingCopilot", href: "/copilot", icon: Bot },
          { labelKey: "exports", href: "/reports", icon: Upload },
        ],
      },
    ],
  },
];

/** Settings lives in the sidebar footer, below the main entries. */
export const settingsEntry: NavEntry = {
  labelKey: "settings",
  icon: Settings,
  href: "/settings",
  children: [
    {
      labelKey: null,
      items: [
        { labelKey: "aiSettings", href: "/settings/ai", icon: Bot },
        { labelKey: "extractionHealth", href: "/admin/extraction-health", icon: Activity },
      ],
    },
  ],
};

/** Filters entries and items by org profile gates. */
export function getVisibleNavEntries(flags: NavGateFlags): NavEntry[] {
  return navEntries
    .filter((entry) => !entry.gate || flags[entry.gate])
    .map((entry) => ({
      ...entry,
      children: entry.children
        .map((group) => ({
          ...group,
          items: group.items.filter((item) => !item.gate || flags[item.gate]),
        }))
        .filter((group) => group.items.length > 0),
    }));
}

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
