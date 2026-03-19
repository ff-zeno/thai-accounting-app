"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Languages, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { translateDocumentAction } from "./actions";

interface TranslationOverlayProps {
  vendorName?: string | null;
  lineDescriptions?: string[];
  detectedLanguage?: string | null;
}

export function TranslationOverlay({
  vendorName,
  lineDescriptions,
  detectedLanguage,
}: TranslationOverlayProps) {
  const tr = useTranslations("review");
  const [translating, setTranslating] = useState(false);
  const [translations, setTranslations] = useState<Record<string, string>>({});

  const textsToTranslate = [
    vendorName,
    ...(lineDescriptions ?? []),
  ].filter((t): t is string => !!t && t.length > 0);

  if (textsToTranslate.length === 0 || detectedLanguage === "en") {
    return null;
  }

  const targetLang = detectedLanguage === "th" ? "en" : "th";

  const handleTranslate = async () => {
    setTranslating(true);
    try {
      const results: Record<string, string> = {};
      for (const text of textsToTranslate) {
        if (translations[text]) continue;
        const result = await translateDocumentAction(text, targetLang as "en" | "th");
        results[text] = result.translated;
      }
      setTranslations((prev) => ({ ...prev, ...results }));
    } catch {
      // Translation failure is non-fatal
    } finally {
      setTranslating(false);
    }
  };

  const hasTranslations = Object.keys(translations).length > 0;

  return (
    <div className="space-y-3 rounded-md border p-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">
          <Languages className="mr-1 inline size-4" />
          {tr("translateDocument")}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={handleTranslate}
          disabled={translating}
        >
          {translating && <Loader2 className="mr-1 size-3 animate-spin" />}
          {tr("translateDocument")}
        </Button>
      </div>

      {hasTranslations && (
        <div className="space-y-2">
          {textsToTranslate.map((text) =>
            translations[text] ? (
              <div key={text} className="rounded bg-muted/50 p-2 text-sm">
                <span className="text-muted-foreground">{text}</span>
                <span className="mx-2">→</span>
                <span className="font-medium">{translations[text]}</span>
              </div>
            ) : null
          )}
        </div>
      )}
    </div>
  );
}
