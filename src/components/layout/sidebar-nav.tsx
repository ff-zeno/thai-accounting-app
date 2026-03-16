"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const navGroups: NavGroup[] = [
  {
    label: "Overview",
    items: [
      { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    ],
  },
  {
    label: "Banking",
    items: [
      { label: "Bank Accounts", href: "/bank-accounts", icon: Landmark },
    ],
  },
  {
    label: "Documents",
    items: [
      { label: "Expenses", href: "/documents/expenses", icon: FileText },
      { label: "Income", href: "/documents/income", icon: FileText },
      { label: "Upload", href: "/documents/upload", icon: Upload },
      { label: "Capture", href: "/capture", icon: Camera },
    ],
  },
  {
    label: "Processing",
    items: [
      {
        label: "Reconciliation",
        href: "/reconciliation",
        icon: GitCompareArrows,
      },
    ],
  },
  {
    label: "Tax & Filing",
    items: [
      {
        label: "WHT Certificates",
        href: "/tax/wht-certificates",
        icon: Receipt,
      },
      {
        label: "Monthly Filings",
        href: "/tax/monthly-filings",
        icon: FileText,
      },
      { label: "VAT", href: "/tax/vat", icon: Receipt },
      { label: "Calendar", href: "/tax/calendar", icon: Calendar },
    ],
  },
  {
    label: "Management",
    items: [
      { label: "Vendors", href: "/vendors", icon: Users },
      { label: "Reports", href: "/reports", icon: BarChart3 },
      { label: "Settings", href: "/settings", icon: Settings },
    ],
  },
];

export function SidebarNav() {
  const pathname = usePathname();

  return (
    <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-4">
      {navGroups.map((group) => (
        <div key={group.label}>
          <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {group.label}
          </p>
          <ul className="space-y-1">
            {group.items.map((item) => {
              const isActive =
                pathname === item.href ||
                (item.href !== "/dashboard" &&
                  pathname.startsWith(item.href + "/"));
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={cn(
                      "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                      isActive
                        ? "bg-accent text-accent-foreground"
                        : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                    )}
                  >
                    <item.icon className="size-4" />
                    {item.label}
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
