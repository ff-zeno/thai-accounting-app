"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, Menu, Puzzle } from "lucide-react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { OrgSwitcher } from "./org-switcher";
import { LocaleSwitcher } from "./locale-switcher";
import { CreateOrgDialog } from "./create-org-dialog";
import { cn } from "@/lib/utils";
import {
  getActiveNavCategory,
  isNavItemActive,
  navCategories,
  type NavCategory,
} from "@/lib/nav/structure";
import { resolvePinnedNavItems } from "@/lib/nav/pins";
import { useCollapsibleSections } from "./use-collapsible-sections";

interface Org {
  id: string;
  name: string;
  branchNumber: string;
}

interface MobileDrawerProps {
  orgs: Org[];
  activeOrgId: string | null;
  pinnedHrefs: string[];
}

export function MobileDrawer({
  orgs,
  activeOrgId,
  pinnedHrefs,
}: MobileDrawerProps) {
  const pathname = usePathname();
  const t = useTranslations("nav");
  const [open, setOpen] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const activeCategory = getActiveNavCategory(pathname);
  const [selectedCategoryKey, setSelectedCategoryKey] = useState(
    activeCategory.labelKey
  );

  const selectedCategory =
    navCategories.find((category) => category.labelKey === selectedCategoryKey) ??
    activeCategory;

  return (
    <>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger className="inline-flex items-center justify-center rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-accent-foreground md:hidden">
          <Menu className="size-5" />
          <span className="sr-only">Toggle menu</span>
        </SheetTrigger>
        <SheetContent
          side="left"
          className="data-[side=left]:w-[340px] gap-0 bg-sidebar p-0"
          showCloseButton={false}
        >
          <div className="flex h-full flex-col">
            <div className="border-b p-3">
              <Link
                href="/dashboard"
                onClick={() => setOpen(false)}
                className="mb-3 flex items-center gap-2.5 text-primary"
              >
                <Puzzle className="size-5" />
                <span className="text-lg font-semibold tracking-tight">
                  Long Dtua
                </span>
              </Link>
              <OrgSwitcher
                orgs={orgs}
                activeOrgId={activeOrgId}
                onCreateNew={() => setCreateDialogOpen(true)}
              />
            </div>

            <div className="border-b px-2 py-2">
              <div className="grid grid-cols-4 gap-1">
                {navCategories.map((category) => (
                  <MobileCategoryButton
                    key={category.labelKey}
                    category={category}
                    active={selectedCategory.labelKey === category.labelKey}
                    label={t(category.labelKey)}
                    onClick={() => setSelectedCategoryKey(category.labelKey)}
                  />
                ))}
              </div>
            </div>

            <MobileSectionList
              category={selectedCategory}
              pathname={pathname}
              pinnedHrefs={pinnedHrefs}
              onNavigate={() => setOpen(false)}
            />


            <div className="space-y-3 border-t p-3">
              <LocaleSwitcher />
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <CreateOrgDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
      />
    </>
  );
}

function MobileSectionList({
  category,
  pathname,
  pinnedHrefs,
  onNavigate,
}: {
  category: NavCategory;
  pathname: string;
  pinnedHrefs: string[];
  onNavigate: () => void;
}) {
  const t = useTranslations("nav");
  const { isOpen, toggle } = useCollapsibleSections(category, pathname);
  // No pin/unpin affordance on mobile — pins are managed on desktop or the
  // Home cockpit; here they only render as shortcuts in the Home category.
  const pinnedItems =
    category.labelKey === "home" ? resolvePinnedNavItems(pinnedHrefs) : [];

  return (
    <nav aria-label="Mobile navigation" className="flex-1 overflow-y-auto px-3 py-3">
      {category.sections.map((section) => {
        const open = isOpen(section);
        return (
          <section
            key={section.labelKey}
            className="mb-4 border-t pt-4 first:border-t-0 first:pt-0"
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
              <ul className="space-y-1">
                {section.items.map((item) => {
                  const active = isNavItemActive(pathname, item);
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={onNavigate}
                        className={cn(
                          "flex min-h-11 items-center gap-2.5 rounded-md px-2.5 py-2 text-sm",
                          active
                            ? "bg-accent font-semibold text-primary"
                            : "font-medium text-muted-foreground hover:bg-accent/60 hover:text-foreground"
                        )}
                      >
                        <item.icon className="size-4" />
                        {t(item.labelKey)}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}

      {pinnedItems.length > 0 && (
        <section className="mb-4 border-t pt-4">
          <div className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-foreground/70">
            Pinned
          </div>
          <ul className="space-y-1">
            {pinnedItems.map((item) => {
              const active = isNavItemActive(pathname, item);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    className={cn(
                      "flex min-h-11 items-center gap-2.5 rounded-md px-2.5 py-2 text-sm",
                      active
                        ? "bg-accent font-semibold text-primary"
                        : "font-medium text-muted-foreground hover:bg-accent/60 hover:text-foreground"
                    )}
                  >
                    <item.icon className="size-4" />
                    {t(item.labelKey)}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </nav>
  );
}

function MobileCategoryButton({
  category,
  active,
  label,
  onClick,
}: {
  category: NavCategory;
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex min-h-14 flex-col items-center justify-center gap-1 rounded-md px-1 text-[11px] font-medium",
        active
          ? "bg-accent text-primary"
          : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
      )}
    >
      <category.icon className="size-4" />
      <span className="max-w-full truncate">{label}</span>
    </button>
  );
}
