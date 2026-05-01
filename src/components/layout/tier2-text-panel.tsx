"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { isNavItemActive, type NavCategory } from "@/lib/nav/structure";

interface Tier2TextPanelProps {
  category: NavCategory;
  pathname: string;
}

export function Tier2TextPanel({ category, pathname }: Tier2TextPanelProps) {
  const t = useTranslations("nav");

  return (
    <nav aria-label="Section navigation" className="flex-1 overflow-y-auto px-3 py-3">
      <div className="mb-3 px-2 text-sm font-semibold text-foreground">
        {t(category.labelKey)}
      </div>

      <div className="space-y-5">
        {category.sections.map((section) => (
          <section key={section.labelKey}>
            {category.sections.length > 1 && (
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
          </section>
        ))}
      </div>
    </nav>
  );
}
