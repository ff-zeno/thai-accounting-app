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
  navEntries,
  isNavItemActive,
  settingsEntry,
  type NavTone,
} from "@/lib/nav/structure";
import { OrgSwitcher } from "./org-switcher";
import { NavIcon } from "./nav-icon";
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
}

/** Bottom-bar slots; every other destination lives in the More sheet. */
type Slot = { labelKey: string; href: string; icon: LucideIcon; tone: NavTone };
const directSlots: Slot[] = [
  { labelKey: "home", href: "/dashboard", icon: Home, tone: "home" },
  { labelKey: "bank", href: "/bank-accounts", icon: Landmark, tone: "bank" },
];
const trailingSlots: Slot[] = [
  { labelKey: "tax", href: "/tax", icon: Receipt, tone: "tax" },
];
const slotEntryKeys = new Set(["home", "bank", "tax"]);

export function MobileTabBar({ orgs, activeOrgId }: MobileTabBarProps) {
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
            tone={slot.tone}
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
            tone={slot.tone}
            label={t(slot.labelKey)}
            active={activeEntry?.labelKey === slot.labelKey}
          />
        ))}

        <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
          <SheetTrigger
            className={cn(
              "flex flex-1 flex-col items-center justify-center gap-1 text-[11px]",
              moreActive
                ? "font-semibold text-accent-foreground"
                : "font-medium text-muted-foreground"
            )}
          >
            <MoreHorizontal
              className={cn(
                "size-5",
                moreActive
                  ? "text-accent-foreground"
                  : "text-accent-foreground/55"
              )}
            />
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
  icon,
  tone,
  label,
  active,
}: {
  href: string;
  icon: LucideIcon;
  tone: NavTone;
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
          ? "font-semibold text-accent-foreground"
          : "font-medium text-muted-foreground"
      )}
    >
      <NavIcon icon={icon} tone={tone} variant="bare" active={active} />
      {label}
    </Link>
  );
}

/** Full nav tree so every route stays reachable on mobile. */
function MoreNavTree({
  pathname,
  onNavigate,
}: {
  pathname: string;
  onNavigate: () => void;
}) {
  const t = useTranslations("nav");
  const entries = [...navEntries, settingsEntry];

  return (
    <nav aria-label="More navigation" className="px-4 py-3">
      <ul className="space-y-4">
        {entries.map((entry) => (
          <li key={entry.labelKey}>
            <TreeLink
              href={entry.href}
              icon={entry.icon}
              tone={entry.tone}
              variant="tile"
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
                            tone={entry.tone}
                            variant="glyph"
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
  icon,
  tone,
  variant,
  label,
  active,
  onNavigate,
  emphasized,
}: {
  href: string;
  icon: LucideIcon;
  tone: NavTone;
  /** tile for section rows, glyph for their children. */
  variant: "tile" | "glyph";
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
      <NavIcon icon={icon} tone={tone} variant={variant} active={active} />
      <span className="truncate">{label}</span>
    </Link>
  );
}
