"use client";

import { Sparkles, Globe, Zap } from "lucide-react";

interface LearningIndicatorProps {
  tierUsed: number;
  exemplarCount: number;
}

export function LearningIndicator({
  tierUsed,
  exemplarCount,
}: LearningIndicatorProps) {
  if (tierUsed === 0 || (tierUsed < 3 && exemplarCount === 0)) return null;

  if (tierUsed >= 3) {
    return (
      <div className="flex items-center gap-1.5 rounded-md bg-emerald-50 px-2.5 py-1.5 text-xs text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
        <Zap className="size-3.5 shrink-0" />
        <span>
          AI used a compiled pattern for this vendor
        </span>
      </div>
    );
  }

  if (tierUsed === 2) {
    return (
      <div className="flex items-center gap-1.5 rounded-md bg-blue-50 px-2.5 py-1.5 text-xs text-blue-700 dark:bg-blue-950 dark:text-blue-300">
        <Globe className="size-3.5 shrink-0" />
        <span>
          AI used community patterns for this vendor
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 rounded-md bg-amber-50 px-2.5 py-1.5 text-xs text-amber-700 dark:bg-amber-950 dark:text-amber-300">
      <Sparkles className="size-3.5 shrink-0" />
      <span>
        AI learned from your {exemplarCount} previous correction{exemplarCount !== 1 ? "s" : ""}
      </span>
    </div>
  );
}
