"use client";

import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { KeyboardEvent } from "react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { HelpSidebar } from "@/components/help/help-sidebar";
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
  const mainCategories = categories.filter((c) => c.anchor !== "bottom");
  const bottomCategories = categories.filter((c) => c.anchor === "bottom");

  function handleKeyDown(
    event: KeyboardEvent<HTMLAnchorElement>,
    index: number
  ) {
    const keyToIndex: Record<string, number> = {
      ArrowDown: (index + 1) % mainCategories.length,
      ArrowRight: (index + 1) % mainCategories.length,
      ArrowUp: (index - 1 + mainCategories.length) % mainCategories.length,
      ArrowLeft: (index - 1 + mainCategories.length) % mainCategories.length,
      Home: 0,
      End: mainCategories.length - 1,
    };
    const nextIndex = keyToIndex[event.key];
    if (nextIndex === undefined) return;
    event.preventDefault();
    router.push(mainCategories[nextIndex].href);
  }

  function renderIcon(category: NavCategory, index?: number) {
    const active = activeCategory.labelKey === category.labelKey;
    const label = t(category.labelKey);
    return (
      <Tooltip key={category.labelKey}>
        <TooltipTrigger
          render={
            <Link
              href={category.href}
              aria-label={label}
              aria-current={active ? "page" : undefined}
              onKeyDown={
                index === undefined
                  ? undefined
                  : (event) => handleKeyDown(event, index)
              }
              className={cn(
                "flex size-11 items-center justify-center rounded-lg text-muted-foreground transition-colors",
                active
                  ? "bg-accent text-primary"
                  : "hover:bg-accent/60 hover:text-foreground"
              )}
            />
          }
        >
          <category.icon className="size-5" />
        </TooltipTrigger>
        <TooltipContent side="right" sideOffset={8}>
          {label}
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <div className="flex h-full w-16 shrink-0 flex-col items-center border-r bg-background py-3">
      <div className="flex size-10 items-center justify-center">
        <UserButton />
      </div>
      <div className="my-3 h-px w-9 bg-border" />

      <TooltipProvider delay={200} closeDelay={0}>
        <nav
          aria-label="Primary navigation"
          className="flex flex-1 flex-col items-center px-2"
        >
          <div className="flex flex-1 flex-col items-center gap-1 overflow-y-auto">
            {mainCategories.map((category, index) => renderIcon(category, index))}
          </div>
          <HelpSidebar />
          {bottomCategories.length > 0 && (
            <div className="mt-1 flex flex-col items-center gap-1 border-t pt-2">
              {bottomCategories.map((category) => renderIcon(category))}
            </div>
          )}
        </nav>
      </TooltipProvider>
    </div>
  );
}
