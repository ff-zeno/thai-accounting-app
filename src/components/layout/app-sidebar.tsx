"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import {
  getActiveNavEntry,
  getVisibleNavEntries,
  isNavItemActive,
  settingsEntry,
  type NavChildGroup,
  type NavEntry,
  type NavGateFlags,
} from "@/lib/nav/structure";
import { OrgSwitcher } from "./org-switcher";
import { CreateOrgDialog } from "./create-org-dialog";

interface Org {
  id: string;
  name: string;
  branchNumber: string;
}

interface AppSidebarProps {
  orgs: Org[];
  activeOrgId: string | null;
  gateFlags: NavGateFlags;
  /**
   * Advisory badges keyed by NavEntry.badgeKey — numbers render as count
   * pills (hidden at 0, capped 99+), strings render verbatim (deadline chip).
   */
  badges?: Partial<Record<NonNullable<NavEntry["badgeKey"]>, number | string>>;
}

export function AppSidebar({
  orgs,
  activeOrgId,
  gateFlags,
  badges,
}: AppSidebarProps) {
  const pathname = usePathname();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const entries = getVisibleNavEntries(gateFlags);
  const activeEntry = getActiveNavEntry(pathname);

  // Roving tabindex over the top-level rows (entries + Settings): arrows
  // move focus without navigating, Enter activates, Home/End jump.
  const rowRefs = useRef<(HTMLAnchorElement | null)[]>([]);
  const rowCount = entries.length + 1;
  const [focusIndex, setFocusIndex] = useState<number | null>(null);

  function handleKeyDown(event: React.KeyboardEvent, index: number) {
    let target: number | null = null;
    if (event.key === "ArrowDown") target = (index + 1) % rowCount;
    else if (event.key === "ArrowUp") target = (index - 1 + rowCount) % rowCount;
    else if (event.key === "Home") target = 0;
    else if (event.key === "End") target = rowCount - 1;
    if (target === null) return;
    event.preventDefault();
    setFocusIndex(target);
    rowRefs.current[target]?.focus();
  }

  const activeIndex = activeEntry
    ? [...entries, settingsEntry].findIndex(
        (entry) => entry.labelKey === activeEntry.labelKey
      )
    : 0;
  const tabStop = focusIndex ?? (activeIndex === -1 ? 0 : activeIndex);

  return (
    <>
      <aside className="flex h-full w-60 flex-col border-r bg-card">
        <div className="space-y-3 p-3">
          <Link
            href="/dashboard"
            className="block px-1 text-lg font-semibold tracking-tight text-primary"
          >
            Long Tua
          </Link>
          <OrgSwitcher
            orgs={orgs}
            activeOrgId={activeOrgId}
            onCreateNew={() => setCreateDialogOpen(true)}
          />
        </div>

        <nav
          aria-label="Primary navigation"
          className="flex-1 overflow-y-auto border-t px-3 py-3"
        >
          <ul className="space-y-1">
            {entries.map((entry, index) => (
              <EntryRow
                key={entry.labelKey}
                entry={entry}
                pathname={pathname}
                expanded={activeEntry?.labelKey === entry.labelKey}
                badge={entry.badgeKey ? badges?.[entry.badgeKey] : undefined}
                linkRef={(el) => {
                  rowRefs.current[index] = el;
                }}
                tabIndex={index === tabStop ? 0 : -1}
                onKeyDown={(event) => handleKeyDown(event, index)}
                onFocus={() => setFocusIndex(index)}
              />
            ))}
          </ul>
        </nav>

        <div className="border-t px-3 py-3">
          <ul className="space-y-1">
            <EntryRow
              entry={settingsEntry}
              pathname={pathname}
              expanded={activeEntry?.labelKey === settingsEntry.labelKey}
              linkRef={(el) => {
                rowRefs.current[entries.length] = el;
              }}
              tabIndex={entries.length === tabStop ? 0 : -1}
              onKeyDown={(event) => handleKeyDown(event, entries.length)}
              onFocus={() => setFocusIndex(entries.length)}
            />
          </ul>
        </div>
      </aside>

      <CreateOrgDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
      />
    </>
  );
}

function EntryRow({
  entry,
  pathname,
  expanded,
  badge,
  linkRef,
  tabIndex,
  onKeyDown,
  onFocus,
}: {
  entry: NavEntry;
  pathname: string;
  expanded: boolean;
  badge?: number | string;
  linkRef: (el: HTMLAnchorElement | null) => void;
  tabIndex: number;
  onKeyDown: (event: React.KeyboardEvent) => void;
  onFocus: () => void;
}) {
  const t = useTranslations("nav");
  const isCurrent = pathname === entry.href;

  return (
    <li>
      <Link
        ref={linkRef}
        href={entry.href}
        aria-current={isCurrent ? "page" : undefined}
        tabIndex={tabIndex}
        onKeyDown={onKeyDown}
        onFocus={onFocus}
        className={cn(
          "flex min-h-10 items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors",
          expanded
            ? "bg-accent font-semibold text-accent-foreground"
            : "font-medium text-muted-foreground hover:bg-accent/60 hover:text-foreground"
        )}
      >
        <entry.icon className="size-4 shrink-0" />
        <span className="flex-1 truncate">{t(entry.labelKey)}</span>
        {badge !== undefined && (typeof badge === "string" || badge > 0) && (
          // aria-hidden keeps the link's accessible name stable ("Documents",
          // not "Documents 7"); the cockpit carries the authoritative counts.
          <span
            aria-hidden="true"
            className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold tabular-nums text-primary-foreground"
          >
            {typeof badge === "number" && badge > 99 ? "99+" : badge}
          </span>
        )}
      </Link>
      {expanded && entry.children.length > 0 && (
        <div className="mt-1 mb-2 ml-4 space-y-3 border-l pl-2">
          {entry.children.map((group, groupIndex) => (
            <ChildGroup
              key={group.labelKey ?? groupIndex}
              group={group}
              pathname={pathname}
            />
          ))}
        </div>
      )}
    </li>
  );
}

function ChildGroup({
  group,
  pathname,
}: {
  group: NavChildGroup;
  pathname: string;
}) {
  const t = useTranslations("nav");

  return (
    <div>
      {group.labelKey && (
        <div className="mb-1 px-2 text-[11px] font-semibold tracking-[0.08em] text-foreground/70 uppercase">
          {t(group.labelKey)}
        </div>
      )}
      <ul className="space-y-0.5">
        {group.items.map((item) => {
          const active = isNavItemActive(pathname, item);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-9 items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors",
                  active
                    ? "bg-accent font-semibold text-accent-foreground"
                    : "font-medium text-muted-foreground hover:bg-accent/60 hover:text-foreground"
                )}
              >
                <item.icon className="size-4 shrink-0" />
                <span className="truncate">{t(item.labelKey)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
