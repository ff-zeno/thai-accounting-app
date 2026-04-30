"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Landmark,
  FileText,
  Upload,
  GitCompareArrows,
  Receipt,
  Calendar,
  Users,
  BarChart3,
  Settings,
  Lightbulb,
  ChevronRight,
  Activity,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Nav data
// ---------------------------------------------------------------------------

interface NavItem {
  labelKey: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface NavGroup {
  labelKey: string;
  items: NavItem[];
}

const navGroups: NavGroup[] = [
  {
    labelKey: "overview",
    items: [
      { labelKey: "dashboard", href: "/dashboard", icon: LayoutDashboard },
    ],
  },
  {
    labelKey: "banking",
    items: [
      { labelKey: "bankAccounts", href: "/bank-accounts", icon: Landmark },
      { labelKey: "uploadStatement", href: "/bank-accounts/upload", icon: Upload },
    ],
  },
  {
    labelKey: "documents",
    items: [
      { labelKey: "expenses", href: "/documents/expenses", icon: FileText },
      { labelKey: "income", href: "/documents/income", icon: FileText },
      { labelKey: "upload", href: "/documents/upload", icon: Upload },
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
  {
    labelKey: "management",
    items: [
      { labelKey: "vendors", href: "/vendors", icon: Users },
      { labelKey: "reports", href: "/reports", icon: BarChart3 },
      { labelKey: "settings", href: "/settings", icon: Settings },
    ],
  },
  {
    labelKey: "admin",
    items: [
      { labelKey: "extractionHealth", href: "/admin/extraction-health", icon: Activity },
    ],
  },
];

// ---------------------------------------------------------------------------
// Active state detection
// ---------------------------------------------------------------------------

function isItemActive(
  pathname: string,
  item: NavItem,
  group: NavGroup,
): boolean {
  const isExact = pathname === item.href;
  const isPrefix =
    !isExact &&
    item.href !== "/dashboard" &&
    pathname.startsWith(item.href + "/");
  const hasSiblingMatch =
    isPrefix &&
    group.items.some(
      (sibling) =>
        sibling.href !== item.href &&
        sibling.href.startsWith(item.href + "/") &&
        (pathname === sibling.href ||
          pathname.startsWith(sibling.href + "/")),
    );
  return isExact || (isPrefix && !hasSiblingMatch);
}

function isGroupActive(pathname: string, group: NavGroup): boolean {
  return group.items.some((item) => isItemActive(pathname, item, group));
}

// ---------------------------------------------------------------------------
// Collapsible group
// ---------------------------------------------------------------------------

function NavGroupSection({
  group,
  pathname,
  t,
  expanded,
  onToggle,
}: {
  group: NavGroup;
  pathname: string;
  t: (key: string) => string;
  expanded: boolean;
  onToggle: () => void;
}) {
  const groupActive = isGroupActive(pathname, group);

  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          "flex w-full items-center justify-between rounded-md px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] transition-colors duration-150",
          groupActive
            ? "text-foreground/60"
            : "text-foreground/40 hover:text-foreground/60",
        )}
      >
        {t(group.labelKey)}
        <ChevronRight
          className={cn(
            "size-3 transition-transform duration-200",
            expanded && "rotate-90",
          )}
        />
      </button>

      <div
        className={cn(
          "grid transition-[grid-template-rows] duration-200 ease-in-out",
          expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <ul className="overflow-hidden">
          {group.items.map((item) => {
            const isActive = isItemActive(pathname, item, group);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    "flex min-h-[44px] items-center gap-2.5 rounded-md px-3 py-2.5 text-sm transition-colors duration-150",
                    isActive
                      ? "bg-accent font-semibold text-accent-foreground"
                      : "font-medium text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground",
                  )}
                >
                  <item.icon className="size-4 shrink-0" />
                  {t(item.labelKey)}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sidebar nav
// ---------------------------------------------------------------------------

export function SidebarNav() {
  const pathname = usePathname();
  const t = useTranslations("nav");

  // Track manually collapsed groups. Active groups are always expanded.
  const [manuallyCollapsed, setManuallyCollapsed] = useState<Record<string, boolean>>({});

  function toggleGroup(key: string) {
    setManuallyCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  return (
    <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-3">
      {navGroups.map((group) => {
        const active = isGroupActive(pathname, group);
        // Active groups are always expanded. Inactive groups default expanded
        // unless manually collapsed.
        const expanded = active || !manuallyCollapsed[group.labelKey];
        return (
          <NavGroupSection
            key={group.labelKey}
            group={group}
            pathname={pathname}
            t={t}
            expanded={expanded}
            onToggle={() => toggleGroup(group.labelKey)}
          />
        );
      })}
    </nav>
  );
}
