"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export interface RouteTab {
  href: string;
  label: string;
  /** Optional advisory work count rendered as a small pill. */
  badge?: number;
}

/**
 * Route-based section tab strip: links styled with the kit Tabs recipe,
 * deliberately NOT role="tab" — every tab is a real URL and deep links
 * preserve the active state. Owns the "Section navigation" landmark.
 */
export function RouteTabs({
  tabs,
  className,
}: {
  tabs: RouteTab[];
  className?: string;
}) {
  const pathname = usePathname();
  // Longest matching href wins so sibling prefixes (/tax/vat vs
  // /tax/vat/input) resolve to exactly one active tab.
  const active = tabs
    .filter(
      (tab) => pathname === tab.href || pathname.startsWith(`${tab.href}/`)
    )
    .sort((a, b) => b.href.length - a.href.length)[0];

  return (
    <nav
      aria-label="Section navigation"
      className={cn("overflow-x-auto", className)}
    >
      <div className="inline-flex w-fit items-center justify-center rounded-lg bg-muted p-1 text-muted-foreground">
        {tabs.map((tab) => {
          const isActive = active?.href === tab.href;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                // min-h-11 = the 44px touch-target floor from DESIGN.md.
                "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-all outline-none select-none",
                "hover:bg-card/50 hover:text-foreground",
                "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
                isActive && "bg-card text-foreground shadow"
              )}
            >
              {tab.label}
              {tab.badge !== undefined && tab.badge > 0 && (
                // aria-hidden keeps the tab link's accessible name stable
                // regardless of the advisory count (same rule as the sidebar).
                <span
                  aria-hidden="true"
                  className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold tabular-nums text-primary-foreground"
                >
                  {tab.badge > 99 ? "99+" : tab.badge}
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
