"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export interface SubNavItem {
  href: string;
  label: string;
  /** Optional advisory work count rendered as a small pill. */
  badge?: number;
}

export interface SubNavGroup {
  /** null renders the items with no group heading. */
  label: string | null;
  items: SubNavItem[];
}

/**
 * Grouped sub-navigation column (DESIGN.md 2026-08-05 — owner decision P3).
 *
 * A tab strip is a flat row that has to fit on one line, so it caps out at
 * about four destinations and cannot say that two of them belong together.
 * A column has no width limit and can carry group headings, which is what a
 * settings surface actually needs as it grows.
 *
 * Like `RouteTabs` this is deliberately NOT `role="tab"`: every entry is a
 * real URL, so deep links and the back button keep the active state. It uses
 * the same longest-match rule so sibling prefixes resolve to exactly one
 * active link.
 */
export function SubNav({
  groups,
  ariaLabel = "Section navigation",
  className,
}: {
  groups: SubNavGroup[];
  ariaLabel?: string;
  className?: string;
}) {
  const pathname = usePathname();
  const active = groups
    .flatMap((group) => group.items)
    .filter(
      (item) => pathname === item.href || pathname.startsWith(`${item.href}/`)
    )
    .sort((a, b) => b.href.length - a.href.length)[0];

  return (
    <nav aria-label={ariaLabel} className={cn("space-y-5", className)}>
      {groups.map((group, groupIndex) => (
        <div key={group.label ?? groupIndex}>
          {group.label && (
            <div className="mb-1.5 px-2.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              {group.label}
            </div>
          )}
          <ul className="space-y-0.5">
            {group.items.map((item) => {
              const isActive = active?.href === item.href;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={isActive ? "page" : undefined}
                    className={cn(
                      // min-h-11 = the 44px touch-target floor from DESIGN.md.
                      "flex min-h-11 items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-sm transition-colors outline-none",
                      "focus-visible:ring-3 focus-visible:ring-ring/50",
                      isActive
                        ? "bg-accent font-semibold text-accent-foreground"
                        : "font-medium text-muted-foreground hover:bg-accent/60 hover:text-foreground"
                    )}
                  >
                    <span className="truncate">{item.label}</span>
                    {item.badge !== undefined && item.badge > 0 && (
                      // aria-hidden keeps the link's accessible name stable
                      // regardless of the advisory count (same rule as the
                      // sidebar and the tab strip).
                      <span
                        aria-hidden="true"
                        className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-semibold tabular-nums text-primary-foreground"
                      >
                        {item.badge > 99 ? "99+" : item.badge}
                      </span>
                    )}
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
