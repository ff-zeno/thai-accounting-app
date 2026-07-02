"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { LayerMatchRate } from "@/lib/db/queries/reconciliation-metrics";

const LAYER_COLORS: Record<string, string> = {
  exact: "bg-chart-1",
  fuzzy: "bg-chart-2",
  reference: "bg-chart-3",
  alias: "bg-chart-4",
  pattern: "bg-chart-5",
  rule: "bg-chart-1",
  multi_signal: "bg-chart-2",
  split: "bg-chart-3",
  manual: "bg-muted-foreground",
  unknown: "bg-muted-foreground",
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
                    className={`h-2 rounded-full transition-all ${LAYER_COLORS[row.layer] ?? "bg-muted-foreground"}`}
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
