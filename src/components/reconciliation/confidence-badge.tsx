import { Badge } from "@/components/ui/badge";
import {
  getConfidenceLevel,
  type ConfidenceLevel,
} from "@/lib/reconciliation/match-display";
import { cn } from "@/lib/utils";

const LEVEL_VARIANTS: Record<
  ConfidenceLevel,
  "success" | "warning" | "destructive"
> = {
  high: "success",
  medium: "warning",
  low: "destructive",
};

interface Props {
  confidence: string | number;
  className?: string;
}

export function ConfidenceBadge({ confidence, className }: Props) {
  const level = getConfidenceLevel(confidence);
  const pct =
    typeof confidence === "string"
      ? (parseFloat(confidence) * 100).toFixed(0)
      : (confidence * 100).toFixed(0);

  return (
    <Badge
      variant={LEVEL_VARIANTS[level]}
      className={cn("text-xs tabular-nums", className)}
    >
      {pct}%
    </Badge>
  );
}
