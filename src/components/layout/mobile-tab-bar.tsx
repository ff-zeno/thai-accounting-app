"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { UserButton } from "@clerk/nextjs";
import { Home, Landmark, MoreHorizontal, Plus, Receipt } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import {
  getActiveNavEntry,
  getVisibleNavEntries,
  isNavItemActive,
  settingsEntry,
  type NavGateFlags,
} from "@/lib/nav/structure";
import { OrgSwitcher } from "./org-switcher";
import { LocaleSwitcher } from "./locale-switcher";
import { CreateOrgDialog } from "./create-org-dialog";

interface Org {
  id: string;
  name: string;
  branchNumber: string;
}

interface MobileTabBarProps {
  orgs: Org[];
  activeOrgId: string | null;
  gateFlags: NavGateFlags;
}

/** Bottom-bar slots; every other destination lives in the More sheet. */
const directSlots: { labelKey: string; href: string; icon: LucideIcon }[] = [
  { labelKey: "home", href: "/dashboard", icon: Home },
  { labelKey: "bank", href: "/bank-accounts", icon: Landmark },
];
const trailingSlots: { labelKey: string; href: string; icon: LucideIcon }[] = [
  { labelKey: "tax", href: "/tax", icon: Receipt },
];
const slotEntryKeys = new Set(["home", "bank", "tax"]);

export function MobileTabBar({ orgs, activeOrgId, gateFlags }: MobileTabBarProps) {
  const pathname = usePathname();
  const t = useTranslations("nav");
  const [moreOpen, setMoreOpen] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const activeEntry = getActiveNavEntry(pathname);

  const moreActive =
    activeEntry !== null && !slotEntryKeys.has(activeEntry.labelKey);

  return (
    <>
      <nav
        aria-label="Mobile navigation"
        className="fixed inset-x-0 bottom-0 z-40 flex h-16 items-stretch border-t bg-card md:hidden"
      >
        {directSlots.map((slot) => (
          <TabSlot
            key={slot.href}
            href={slot.href}
            icon={slot.icon}
            label={t(slot.labelKey)}
            active={activeEntry?.labelKey === slot.labelKey}
          />
        ))}

        <div className="flex flex-1 items-center justify-center">
          <Link
            href="/capture"
            aria-label={t("capture")}
            className="-mt-4 flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg"
          >
            <Plus className="size-6" />
          </Link>
        </div>

        {trailingSlots.map((slot) => (
          <TabSlot
            key={slot.href}
            href={slot.href}
            icon={slot.icon}
            label={t(slot.labelKey)}
            active={activeEntry?.labelKey === slot.labelKey}
          />
        ))}

        <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
          <SheetTrigger
            className={cn(
              "flex flex-1 flex-col items-center justify-center gap-1 text-[11px]",
              moreActive
                ? "font-semibold text-primary"
                : "font-medium text-muted-foreground"
            )}
          >
            <MoreHorizontal className="size-5" />
            {t("more")}
          </SheetTrigger>
          <SheetContent
            side="bottom"
            className="max-h-[85dvh] gap-0 overflow-y-auto rounded-t-xl p-0"
          >
            <div className="space-y-3 p-4 pb-0">
              <OrgSwitcher
                orgs={orgs}
                activeOrgId={activeOrgId}
                onCreateNew={() => setCreateDialogOpen(true)}
              />
            </div>
            <MoreNavTree
              gateFlags={gateFlags}
              pathname={pathname}
              onNavigate={() => setMoreOpen(false)}
            />
            <Separator />
            <div className="flex items-center justify-between p-4 pb-6">
              <LocaleSwitcher />
              <UserButton />
            </div>
          </SheetContent>
        </Sheet>
      </nav>

      <CreateOrgDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
      />
    </>
  );
}

function TabSlot({
  href,
  icon: Icon,
  label,
  active,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex flex-1 flex-col items-center justify-center gap-1 text-[11px]",
        active
          ? "font-semibold text-primary"
          : "font-medium text-muted-foreground"
      )}
    >
      <Icon className="size-5" />
      {label}
    </Link>
  );
}

/** Full nav tree so every route stays reachable on mobile. */
function MoreNavTree({
  gateFlags,
  pathname,
  onNavigate,
}: {
  gateFlags: NavGateFlags;
  pathname: string;
  onNavigate: () => void;
}) {
  const t = useTranslations("nav");
  const entries = [...getVisibleNavEntries(gateFlags), settingsEntry];

  return (
    <nav aria-label="More navigation" className="px-4 py-3">
      <ul className="space-y-4">
        {entries.map((entry) => (
          <li key={entry.labelKey}>
            <TreeLink
              href={entry.href}
              icon={entry.icon}
              label={t(entry.labelKey)}
              active={pathname === entry.href}
              onNavigate={onNavigate}
              emphasized
            />
            {entry.children.length > 0 && (
              <div className="mt-1 ml-4 space-y-3 border-l pl-2">
                {entry.children.map((group, groupIndex) => (
                  <div key={group.labelKey ?? groupIndex}>
                    {group.labelKey && (
                      <div className="mb-1 px-2 text-[11px] font-semibold tracking-[0.08em] text-foreground/70 uppercase">
                        {t(group.labelKey)}
                      </div>
                    )}
                    <ul className="space-y-0.5">
                      {group.items.map((item) => (
                        <li key={item.href}>
                          <TreeLink
                            href={item.href}
                            icon={item.icon}
                            label={t(item.labelKey)}
                            active={isNavItemActive(pathname, item)}
                            onNavigate={onNavigate}
                          />
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </li>
        ))}
      </ul>
    </nav>
  );
}

function TreeLink({
  href,
  icon: Icon,
  label,
  active,
  onNavigate,
  emphasized,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
  active: boolean;
  onNavigate: () => void;
  emphasized?: boolean;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex min-h-11 items-center gap-2.5 rounded-md px-2.5 py-2 text-sm",
        active
          ? "bg-accent font-semibold text-accent-foreground"
          : emphasized
            ? "font-medium text-foreground"
            : "font-medium text-muted-foreground"
      )}
    >
      <Icon className="size-4 shrink-0" />
      <span className="truncate">{label}</span>
    </Link>
  );
}
