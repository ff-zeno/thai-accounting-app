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
    <header className="hidden h-14 shrink-0 items-center justify-end gap-2 border-b bg-card px-4 md:flex">
      {/* h-9 + px-3.5 on every control: the `sm` variant's
          has-data-[icon=inline-start]:pl-1.5 rule squeezed the leading edge to
          6px, which read as unpadded next to the 32px Clerk avatar
          (owner review 2026-08-03). */}
      <Button
        variant="outline"
        className="h-9 px-3.5 has-data-[icon=inline-start]:pl-3"
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
