"use client";

import Link from "next/link";
import { useTransition } from "react";
import { ChevronDown, Star } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import {
  isNavItemActive,
  type NavCategory,
  type NavItem,
  type NavSection,
} from "@/lib/nav/structure";
import { resolvePinnedNavItems } from "@/lib/nav/pins";
import {
  pinNavItemAction,
  unpinNavItemAction,
} from "@/app/(app)/nav-pins-actions";
import { EmptyState } from "@/components/ui/empty-state";
import { useCollapsibleSections } from "./use-collapsible-sections";

interface Tier2TextPanelProps {
  category: NavCategory;
  pathname: string;
  pinnedHrefs: string[];
}

export function Tier2TextPanel({
  category,
  pathname,
  pinnedHrefs,
}: Tier2TextPanelProps) {
  const t = useTranslations("nav");
  const { isOpen, toggle } = useCollapsibleSections(category, pathname);
  const pinnedSet = new Set(pinnedHrefs);

  return (
    <nav aria-label="Section navigation" className="flex-1 overflow-y-auto px-3 py-3">
      <div className="mb-3 px-2 text-sm font-semibold text-foreground">
        {t(category.labelKey)}
      </div>

      <div className="space-y-4">
        {category.sections.map((section) => {
          const open = isOpen(section);
          return (
            <section
              key={section.labelKey}
              className="border-t pt-4 first:border-t-0 first:pt-0"
            >
              {category.sections.length > 1 &&
                (section.collapsible ? (
                  <button
                    type="button"
                    onClick={() => toggle(section)}
                    aria-expanded={open}
                    className="mb-2 flex w-full items-center justify-between rounded-md px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-foreground/70 hover:bg-accent/60 hover:text-foreground"
                  >
                    {t(section.labelKey)}
                    <ChevronDown
                      className={cn(
                        "size-3.5 transition-transform",
                        !open && "-rotate-90"
                      )}
                    />
                  </button>
                ) : (
                  <div className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-foreground/70">
                    {t(section.labelKey)}
                  </div>
                ))}
              {open && (
                <SectionItems
                  section={section}
                  pathname={pathname}
                  pinnedSet={pinnedSet}
                />
              )}
            </section>
          );
        })}

        {category.labelKey === "home" && (
          <PinnedSection pinnedHrefs={pinnedHrefs} pathname={pathname} />
        )}
      </div>
    </nav>
  );
}

function PinnedSection({
  pinnedHrefs,
  pathname,
}: {
  pinnedHrefs: string[];
  pathname: string;
}) {
  const t = useTranslations("nav");
  const pinnedItems = resolvePinnedNavItems(pinnedHrefs);

  return (
    <section className="border-t pt-4">
      <div className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-foreground/70">
        Pinned
      </div>
      {pinnedItems.length === 0 ? (
        <EmptyState
          size="sm"
          icon={<Star />}
          title="No pins yet"
          description="Hover any nav item and tap its star to pin it here."
        />
      ) : (
        <ul className="space-y-1">
          {pinnedItems.map((item) => (
            <li key={item.href} className="group/navrow relative flex items-center">
              <NavItemLink item={item} pathname={pathname} label={t(item.labelKey)} />
              <PinStarButton href={item.href} pinned />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function SectionItems({
  section,
  pathname,
  pinnedSet,
}: {
  section: NavSection;
  pathname: string;
  pinnedSet: Set<string>;
}) {
  const t = useTranslations("nav");

  return (
    <ul className="space-y-1">
      {section.items.map((item) => (
        <li key={item.href} className="group/navrow relative flex items-center">
          <NavItemLink item={item} pathname={pathname} label={t(item.labelKey)} />
          <PinStarButton href={item.href} pinned={pinnedSet.has(item.href)} />
        </li>
      ))}
    </ul>
  );
}

function NavItemLink({
  item,
  pathname,
  label,
}: {
  item: NavItem;
  pathname: string;
  label: string;
}) {
  const active = isNavItemActive(pathname, item);
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex min-h-10 flex-1 items-center gap-2.5 rounded-md px-2.5 py-2 pr-9 text-sm transition-colors",
        active
          ? "bg-accent font-semibold text-primary"
          : "font-medium text-muted-foreground hover:bg-accent/60 hover:text-foreground"
      )}
    >
      <item.icon className="size-4 shrink-0" />
      <span className="truncate">{label}</span>
    </Link>
  );
}

/**
 * Ghost star toggle rendered as a sibling of the row Link (never nested in
 * the anchor). Hidden until the row is hovered or focused; pinned stars stay
 * visible and filled.
 */
function PinStarButton({ href, pinned }: { href: string; pinned: boolean }) {
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={isPending}
      aria-label={pinned ? "Unpin from Home" : "Pin to Home"}
      aria-pressed={pinned}
      onClick={() =>
        startTransition(async () => {
          if (pinned) {
            await unpinNavItemAction(href);
          } else {
            await pinNavItemAction(href);
          }
        })
      }
      className={cn(
        "absolute right-1.5 inline-flex size-7 items-center justify-center rounded-md transition-colors outline-none hover:bg-accent focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50",
        pinned
          ? "text-primary"
          : "text-muted-foreground opacity-0 hover:text-foreground group-hover/navrow:opacity-100 group-focus-within/navrow:opacity-100"
      )}
    >
      <Star className={cn("size-3.5", pinned && "fill-current")} />
    </button>
  );
}
