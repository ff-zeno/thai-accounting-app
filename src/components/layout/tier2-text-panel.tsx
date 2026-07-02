"use client";

import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { isNavItemActive, type NavCategory, type NavSection } from "@/lib/nav/structure";
import { useCollapsibleSections } from "./use-collapsible-sections";

interface Tier2TextPanelProps {
  category: NavCategory;
  pathname: string;
}

export function Tier2TextPanel({ category, pathname }: Tier2TextPanelProps) {
  const t = useTranslations("nav");
  const { isOpen, toggle } = useCollapsibleSections(category, pathname);

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
              {open && <SectionItems section={section} pathname={pathname} />}
            </section>
          );
        })}
      </div>
    </nav>
  );
}

function SectionItems({
  section,
  pathname,
}: {
  section: NavSection;
  pathname: string;
}) {
  const t = useTranslations("nav");

  return (
    <ul className="space-y-1">
      {section.items.map((item) => {
        const active = isNavItemActive(pathname, item);
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-10 items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors",
                active
                  ? "bg-accent font-semibold text-primary"
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
  );
}
