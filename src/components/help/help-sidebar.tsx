"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  resolveHelpEntry,
  type HelpEntry,
  type HelpLang,
} from "@/lib/help/content";
import { HELP_GLOSSARY } from "@/lib/help/glossary";

// Flows (React Flow + its stylesheet) only load when a help entry with a
// diagram is actually opened.
const FlowViewer = dynamic(() => import("./flows/flow-viewer"), {
  ssr: false,
  loading: () => (
    <div className="h-80 w-full animate-pulse rounded-lg border bg-muted/40" />
  ),
});

const LANG_STORAGE_KEY = "help-sidebar-lang";

/**
 * Read the persisted language preference. Guarded for SSR: the server
 * renders with "en", which is safe because the sheet body (the only
 * lang-dependent DOM) never renders before user interaction.
 */
function readStoredLang(): HelpLang {
  if (typeof window === "undefined") return "en";
  try {
    return window.localStorage.getItem(LANG_STORAGE_KEY) === "th"
      ? "th"
      : "en";
  } catch {
    return "en";
  }
}

function LangToggle({
  lang,
  onSelect,
}: {
  lang: HelpLang;
  onSelect: (lang: HelpLang) => void;
}) {
  const segment = (value: HelpLang, label: string) => (
    <button
      type="button"
      aria-pressed={lang === value}
      onClick={() => onSelect(value)}
      className={cn(
        "rounded-sm px-2.5 py-1.5 text-xs font-medium transition-colors",
        lang === value
          ? "bg-accent text-accent-foreground"
          : "text-muted-foreground hover:text-foreground"
      )}
    >
      {label}
    </button>
  );
  return (
    <div
      role="group"
      aria-label="Help language"
      className="inline-flex shrink-0 rounded-md border p-0.5"
    >
      {segment("en", "EN")}
      {segment("th", "ไทย")}
    </div>
  );
}

function HelpBody({ entry, lang }: { entry: HelpEntry; lang: HelpLang }) {
  const glossaryEntries = (entry.terms ?? [])
    .map((key) => ({ key, glossary: HELP_GLOSSARY[key] }))
    .filter((item) => item.glossary !== undefined);

  return (
    <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 pb-6">
      {entry.sections.map((section) => (
        <section key={section.heading.en}>
          <h3 className="text-sm font-semibold text-foreground">
            {section.heading[lang]}
          </h3>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            {section.body[lang]}
          </p>
        </section>
      ))}

      {entry.flowId && (
        <section>
          <h3 className="mb-2 text-sm font-semibold text-foreground">
            {lang === "en" ? "How it fits together" : "ภาพรวมขั้นตอน"}
          </h3>
          <FlowViewer flowId={entry.flowId} lang={lang} />
        </section>
      )}

      {glossaryEntries.length > 0 && (
        <footer className="border-t pt-4">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-foreground/70">
            {lang === "en" ? "Glossary" : "อภิธานศัพท์"}
          </h3>
          <dl className="mt-2 space-y-3">
            {glossaryEntries.map(({ key, glossary }) => (
              <div key={key}>
                <dt className="text-xs font-medium text-foreground">
                  {glossary.term[lang]}
                </dt>
                <dd className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                  {glossary.definition[lang]}
                </dd>
              </div>
            ))}
          </dl>
        </footer>
      )}
    </div>
  );
}

/**
 * Help trigger + right-side sheet. The trigger matches the tier-1 icon
 * strip styling (size-11, tooltip) and expects an ambient TooltipProvider.
 * Content is picked from the help registry by the current pathname.
 */
export function HelpSidebar() {
  const pathname = usePathname();
  const [lang, setLang] = useState<HelpLang>(readStoredLang);

  const entry = resolveHelpEntry(pathname ?? "/");

  function selectLang(next: HelpLang) {
    setLang(next);
    try {
      window.localStorage.setItem(LANG_STORAGE_KEY, next);
    } catch {
      // Persistence is best-effort; private mode may block storage.
    }
  }

  return (
    <Sheet>
      <Tooltip>
        <TooltipTrigger
          render={
            <SheetTrigger
              aria-label="Help"
              className="flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent/60 hover:text-accent-foreground"
            />
          }
        >
          <HelpCircle className="size-5" />
        </TooltipTrigger>
        <TooltipContent side="right" sideOffset={8}>
          Help
        </TooltipContent>
      </Tooltip>
      <SheetContent
        side="right"
        className="data-[side=right]:w-full data-[side=right]:sm:w-[27.5rem] data-[side=right]:sm:max-w-[27.5rem]"
      >
        <SheetHeader className="border-b">
          <div className="flex items-center justify-between gap-2 pr-8">
            <SheetTitle>{entry.title[lang]}</SheetTitle>
            <LangToggle lang={lang} onSelect={selectLang} />
          </div>
          <SheetDescription>
            {lang === "en"
              ? "What this page is for and how it fits your monthly loop."
              : "หน้านี้มีไว้ทำอะไร และเกี่ยวข้องกับวงจรงานรายเดือนอย่างไร"}
          </SheetDescription>
        </SheetHeader>
        <HelpBody entry={entry} lang={lang} />
      </SheetContent>
    </Sheet>
  );
}
