"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { LayerMatchRate } from "@/lib/db/queries/reconciliation-metrics";

const LAYER_COLORS: Record<string, string> = {
  exact: "bg-green-600",
  fuzzy: "bg-blue-500",
  reference: "bg-violet-500",
  alias: "bg-amber-500",
  pattern: "bg-cyan-500",
  rule: "bg-indigo-500",
  multi_signal: "bg-pink-500",
  split: "bg-orange-500",
  manual: "bg-gray-500",
  unknown: "bg-gray-400",
};

const LAYER_LABELS: Record<string, string> = {
  exact: "Exact Match",
  fuzzy: "Fuzzy Match",
  reference: "Reference Match",
  alias: "Alias Lookup",
  pattern: "Pattern Match",
  rule: "Rule-Based",
  multi_signal: "Multi-Signal",
  split: "Split Match",
  manual: "Manual",
  unknown: "Unknown",
};

interface Props {
  data: LayerMatchRate[];
}

export function LayerDistribution({ data }: Props) {
  const maxCount = Math.max(...data.map((d) => d.matchCount), 1);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold">
          Match Distribution by Layer
        </CardTitle>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className="text-sm text-muted-foreground">No match data yet</p>
        ) : (
          <div className="space-y-3">
            {data.map((row) => (
              <div key={row.layer} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">
                    {LAYER_LABELS[row.layer] ?? row.layer}
                  </span>
                  <span className="tabular-nums text-muted-foreground">
                    {row.matchCount} ({row.pct}%)
                  </span>
                </div>
                <div className="h-2 w-full rounded-full bg-muted">
                  <div
                    className={`h-2 rounded-full transition-all ${LAYER_COLORS[row.layer] ?? "bg-gray-400"}`}
                    style={{
                      width: `${(row.matchCount / maxCount) * 100}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
