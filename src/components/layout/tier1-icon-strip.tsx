"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { useTranslations } from "next-intl";
import { Puzzle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { NavCategory } from "@/lib/nav/structure";

interface Tier1IconStripProps {
  categories: NavCategory[];
  activeCategory: NavCategory;
}

export function Tier1IconStrip({
  categories,
  activeCategory,
}: Tier1IconStripProps) {
  const t = useTranslations("nav");
  const isDesktop = useDesktopMediaQuery();

  return (
    <div className="flex h-full w-16 shrink-0 flex-col items-center border-r bg-background py-3">
      <Link
        href="/dashboard"
        className="mb-4 flex size-10 items-center justify-center rounded-lg text-primary hover:bg-accent"
        aria-label="Long Dtua"
      >
        <Puzzle className="size-5" />
      </Link>

      <nav
        aria-label="Primary navigation"
        className="flex flex-1 flex-col items-center gap-1 overflow-y-auto px-2"
      >
        {categories.map((category) => {
          const active = activeCategory.labelKey === category.labelKey;
          return (
            <Link
              key={category.labelKey}
              href={category.href}
              title={t(category.labelKey)}
              aria-label={t(category.labelKey)}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex size-11 items-center justify-center rounded-lg text-muted-foreground transition-colors",
                active
                  ? "bg-accent text-primary"
                  : "hover:bg-accent/60 hover:text-foreground"
              )}
            >
              <category.icon className="size-5" />
            </Link>
          );
        })}
      </nav>

      {isDesktop && (
        <div className="mt-3 flex size-10 items-center justify-center">
          <UserButton />
        </div>
      )}
    </div>
  );
}

function useDesktopMediaQuery() {
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(min-width: 768px)");
    const update = () => setIsDesktop(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return isDesktop;
}
