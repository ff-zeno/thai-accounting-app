"use client";

import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { localeCookieName, type Locale } from "@/i18n/config";

export function LocaleSwitcher() {
  const locale = useLocale();
  const t = useTranslations("locale");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const nextLocale: Locale = locale === "en" ? "th" : "en";

  function switchLocale() {
    document.cookie = `${localeCookieName}=${nextLocale};path=/;max-age=31536000;samesite=lax`;
    startTransition(() => {
      router.refresh();
    });
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={switchLocale}
      disabled={isPending}
      className="w-full justify-start gap-2 text-muted-foreground"
      title={t("switchTo")}
    >
      <Globe className="size-4" />
      <span>{t(nextLocale)}</span>
    </Button>
  );
}
