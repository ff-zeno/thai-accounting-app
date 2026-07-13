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
      <div className="flex items-center gap-1.5 rounded-md bg-success/10 px-2.5 py-1.5 text-xs text-success">
        <Zap className="size-3.5 shrink-0" />
        <span>
          AI used a compiled pattern for this vendor
        </span>
      </div>
    );
  }

  if (tierUsed === 2) {
    return (
      <div className="flex items-center gap-1.5 rounded-md bg-info/10 px-2.5 py-1.5 text-xs text-info">
        <Globe className="size-3.5 shrink-0" />
        <span>
          AI used community patterns for this vendor
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 rounded-md bg-warning/10 px-2.5 py-1.5 text-xs text-warning">
      <Sparkles className="size-3.5 shrink-0" />
      <span>
        AI learned from your {exemplarCount} previous correction{exemplarCount !== 1 ? "s" : ""}
      </span>
    </div>
  );
}
