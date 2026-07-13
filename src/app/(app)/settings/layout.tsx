"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const tabs = [
  { href: "/settings", label: "Organization" },
  { href: "/settings/ai", label: "AI Models & Usage" },
  { href: "/settings/reconciliation-rules", label: "Reconciliation Rules" },
  { href: "/settings/cost-centers", label: "Cost Centers" },
  { href: "/settings/projects", label: "Projects" },
  { href: "/settings/allocation-rules", label: "Allocation Rules" },
];

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      {/* Route-based nav styled with the kit Tabs recipe (ui/tabs.tsx). */}
      <nav className="inline-flex h-9 w-fit items-center justify-center rounded-lg bg-muted p-1 text-muted-foreground">
        {tabs.map((tab) => {
          const isActive =
            tab.href === "/settings"
              ? pathname === "/settings"
              : pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-all outline-none select-none",
                "hover:bg-background/50 hover:text-foreground",
                "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
                isActive && "bg-background text-foreground shadow"
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
      {children}
    </div>
  );
}
