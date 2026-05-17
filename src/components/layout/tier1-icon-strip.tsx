"use client";

import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { KeyboardEvent } from "react";
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
  const router = useRouter();

  function handleKeyDown(
    event: KeyboardEvent<HTMLAnchorElement>,
    index: number
  ) {
    const keyToIndex: Record<string, number> = {
      ArrowDown: (index + 1) % categories.length,
      ArrowRight: (index + 1) % categories.length,
      ArrowUp: (index - 1 + categories.length) % categories.length,
      ArrowLeft: (index - 1 + categories.length) % categories.length,
      Home: 0,
      End: categories.length - 1,
    };
    const nextIndex = keyToIndex[event.key];
    if (nextIndex === undefined) return;
    event.preventDefault();
    router.push(categories[nextIndex].href);
  }

  return (
    <div className="flex h-full w-16 shrink-0 flex-col items-center border-r bg-background py-3">
      <div className="flex size-10 items-center justify-center">
        <UserButton />
      </div>
      <div className="my-3 h-px w-9 bg-border" />

      <nav
        aria-label="Primary navigation"
        className="flex flex-1 flex-col items-center gap-1 overflow-y-auto px-2"
      >
        {categories.map((category, index) => {
          const active = activeCategory.labelKey === category.labelKey;
          const label = t(category.labelKey);
          return (
            <Link
              key={category.labelKey}
              href={category.href}
              title={label}
              aria-label={label}
              aria-current={active ? "page" : undefined}
              onKeyDown={(event) => handleKeyDown(event, index)}
              className={cn(
                "group relative flex size-11 items-center justify-center rounded-lg text-muted-foreground transition-colors",
                active
                  ? "bg-accent text-primary"
                  : "hover:bg-accent/60 hover:text-foreground"
              )}
            >
              <category.icon className="size-5" />
              <span className="pointer-events-none absolute left-[calc(100%+8px)] z-50 hidden whitespace-nowrap rounded-md border bg-popover px-2 py-1 text-xs font-medium text-popover-foreground shadow-md group-hover:block group-focus-visible:block">
                {label}
              </span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
