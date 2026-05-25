"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, Puzzle } from "lucide-react";
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

interface Org {
  id: string;
  name: string;
  branchNumber: string;
}

interface MobileDrawerProps {
  orgs: Org[];
  activeOrgId: string | null;
}

export function MobileDrawer({ orgs, activeOrgId }: MobileDrawerProps) {
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
                  Long Tua
                </span>
              </Link>
              <OrgSwitcher
                orgs={orgs}
                activeOrgId={activeOrgId}
                onCreateNew={() => setCreateDialogOpen(true)}
              />
            </div>

            <div className="border-b px-2 py-2">
              <div className="grid grid-cols-5 gap-1">
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

            <nav aria-label="Mobile navigation" className="flex-1 overflow-y-auto px-3 py-3">
              {selectedCategory.sections.map((section) => (
                <section key={section.labelKey} className="mb-5">
                  {selectedCategory.sections.length > 1 && (
                    <div className="mb-1.5 px-2 text-[11px] font-semibold uppercase text-muted-foreground">
                      {t(section.labelKey)}
                    </div>
                  )}
                  <ul className="space-y-1">
                    {section.items.map((item) => {
                      const active = isNavItemActive(pathname, item);
                      return (
                        <li key={item.href}>
                          <Link
                            href={item.href}
                            onClick={() => setOpen(false)}
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
              ))}
            </nav>

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
