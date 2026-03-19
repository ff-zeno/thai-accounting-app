"use client";

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
  Camera,
} from "lucide-react";

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
];

export function SidebarNav() {
  const pathname = usePathname();
  const t = useTranslations("nav");

  return (
    <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-4">
      {navGroups.map((group) => (
        <div key={group.labelKey}>
          <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t(group.labelKey)}
          </p>
          <ul className="space-y-1">
            {group.items.map((item) => {
              // Exact match always wins. For prefix match, only activate
              // if no sibling nav item is a more specific prefix match.
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
                      pathname.startsWith(sibling.href + "/"))
                );
              const isActive = isExact || (isPrefix && !hasSiblingMatch);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={cn(
                      "flex min-h-[44px] items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors duration-150",
                      isActive
                        ? "bg-accent text-accent-foreground font-semibold"
                        : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                    )}
                  >
                    <item.icon className="size-4" />
                    {t(item.labelKey)}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
