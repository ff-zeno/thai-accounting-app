import type { LucideIcon } from "lucide-react";
import {
  Activity,
  BarChart3,
  Calendar,
  FileText,
  GitCompareArrows,
  Home,
  Landmark,
  Lightbulb,
  Receipt,
  Settings,
  Upload,
  Users,
} from "lucide-react";

export interface NavItem {
  labelKey: string;
  href: string;
  icon: LucideIcon;
}

export interface NavSection {
  labelKey: string;
  items: NavItem[];
}

export interface NavCategory {
  labelKey: string;
  icon: LucideIcon;
  href: string;
  sections: NavSection[];
}

export const navCategories: NavCategory[] = [
  {
    labelKey: "overview",
    icon: Home,
    href: "/dashboard",
    sections: [
      {
        labelKey: "overview",
        items: [{ labelKey: "dashboard", href: "/dashboard", icon: Home }],
      },
    ],
  },
  {
    labelKey: "documents",
    icon: FileText,
    href: "/documents/expenses",
    sections: [
      {
        labelKey: "documents",
        items: [
          { labelKey: "expenses", href: "/documents/expenses", icon: FileText },
          { labelKey: "income", href: "/documents/income", icon: FileText },
          { labelKey: "upload", href: "/documents/upload", icon: Upload },
        ],
      },
    ],
  },
  {
    labelKey: "banking",
    icon: Landmark,
    href: "/bank-accounts",
    sections: [
      {
        labelKey: "banking",
        items: [
          { labelKey: "bankAccounts", href: "/bank-accounts", icon: Landmark },
          { labelKey: "uploadStatement", href: "/bank-accounts/upload", icon: Upload },
        ],
      },
      {
        labelKey: "processing",
        items: [
          {
            labelKey: "reconciliation",
            href: "/reconciliation",
            icon: GitCompareArrows,
          },
          {
            labelKey: "insights",
            href: "/reconciliation/insights",
            icon: Lightbulb,
          },
        ],
      },
    ],
  },
  {
    labelKey: "taxFiling",
    icon: Receipt,
    href: "/tax/monthly-filings",
    sections: [
      {
        labelKey: "taxFiling",
        items: [
          {
            labelKey: "whtCertificates",
            href: "/tax/wht-certificates",
            icon: Receipt,
          },
          {
            labelKey: "whtCreditsReceived",
            href: "/tax/wht-credits-received",
            icon: Receipt,
          },
          {
            labelKey: "monthlyFilings",
            href: "/tax/monthly-filings",
            icon: FileText,
          },
          { labelKey: "vat", href: "/tax/vat", icon: Receipt },
          { labelKey: "calendar", href: "/tax/calendar", icon: Calendar },
        ],
      },
    ],
  },
  {
    labelKey: "management",
    icon: Users,
    href: "/vendors",
    sections: [
      {
        labelKey: "management",
        items: [
          { labelKey: "vendors", href: "/vendors", icon: Users },
          { labelKey: "reports", href: "/reports", icon: BarChart3 },
          { labelKey: "settings", href: "/settings", icon: Settings },
        ],
      },
    ],
  },
  {
    labelKey: "admin",
    icon: Activity,
    href: "/admin/extraction-health",
    sections: [
      {
        labelKey: "admin",
        items: [
          {
            labelKey: "extractionHealth",
            href: "/admin/extraction-health",
            icon: Activity,
          },
        ],
      },
    ],
  },
];

function isHrefActive(pathname: string, href: string): boolean {
  if (pathname === href) return true;
  if (href === "/dashboard") return false;
  return pathname.startsWith(`${href}/`);
}

export function getActiveNavItem(pathname: string): NavItem | null {
  const items = navCategories.flatMap((category) =>
    category.sections.flatMap((section) => section.items)
  );
  return (
    items
      .filter((item) => isHrefActive(pathname, item.href))
      .sort((a, b) => b.href.length - a.href.length)[0] ?? null
  );
}

export function getActiveNavCategory(pathname: string): NavCategory {
  const activeItem = getActiveNavItem(pathname);
  const category =
    activeItem &&
    navCategories.find((entry) =>
      entry.sections.some((section) =>
        section.items.some((item) => item.href === activeItem.href)
      )
    );

  return category ?? navCategories[0];
}

export function isNavItemActive(pathname: string, item: NavItem): boolean {
  return getActiveNavItem(pathname)?.href === item.href;
}
