import { Badge } from "@/components/ui/badge";
import { getConfidenceLevel, getConfidenceColor } from "@/lib/reconciliation/match-display";
import { cn } from "@/lib/utils";

interface Props {
  confidence: string | number;
  className?: string;
}

export function ConfidenceBadge({ confidence, className }: Props) {
  const level = getConfidenceLevel(confidence);
  const color = getConfidenceColor(level);
  const pct =
    typeof confidence === "string"
      ? (parseFloat(confidence) * 100).toFixed(0)
      : (confidence * 100).toFixed(0);

  return (
    <Badge variant="outline" className={cn("text-xs tabular-nums", color, className)}>
      {pct}%
    </Badge>
  );
}
