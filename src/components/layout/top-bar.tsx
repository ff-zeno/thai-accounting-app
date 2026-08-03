"use client";

import Link from "next/link";
import { Camera } from "lucide-react";
import { UserButton } from "@clerk/nextjs";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/tooltip";
import { HelpSidebar } from "@/components/help/help-sidebar";
import { LocaleSwitcher } from "./locale-switcher";

/**
 * Thin desktop top bar: capture, help, locale, user menu. Search and the
 * month picker are deliberate future slots — do not add placeholders.
 */
export function TopBar() {
  const t = useTranslations("nav");

  return (
    <header className="hidden h-12 shrink-0 items-center justify-end gap-1.5 border-b bg-card px-4 md:flex">
      <Button
        variant="outline"
        size="sm"
        render={<Link href="/capture" />}
      >
        <Camera data-icon="inline-start" />
        {t("capture")}
      </Button>
      <TooltipProvider delay={200} closeDelay={0}>
        <HelpSidebar />
      </TooltipProvider>
      <LocaleSwitcher />
      <UserButton />
    </header>
  );
}
