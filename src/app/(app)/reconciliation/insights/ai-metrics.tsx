"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { AiSuggestionMetrics } from "@/lib/db/queries/reconciliation-metrics";

interface Props {
  data: AiSuggestionMetrics;
}

export function AiMetrics({ data }: Props) {
  const reviewed = data.approved + data.rejected;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold">
          AI Suggestion Performance
        </CardTitle>
      </CardHeader>
      <CardContent>
        {data.totalSuggestions === 0 ? (
          <p className="text-sm text-muted-foreground">
            No AI suggestions yet
          </p>
        ) : (
          <div className="space-y-4">
            {/* Status breakdown */}
            <div className="grid grid-cols-3 gap-4">
              <div>
                <div className="text-2xl font-bold tabular-nums text-success">
                  {data.approved}
                </div>
                <p className="text-xs text-muted-foreground">Approved</p>
              </div>
              <div>
                <div className="text-2xl font-bold tabular-nums text-destructive">
                  {data.rejected}
                </div>
                <p className="text-xs text-muted-foreground">Rejected</p>
              </div>
              <div>
                <div className="text-2xl font-bold tabular-nums text-warning">
                  {data.pending}
                </div>
                <p className="text-xs text-muted-foreground">Pending</p>
              </div>
            </div>

            {/* Approval rate bar */}
            {reviewed > 0 && (
              <div className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Approval Rate</span>
                  <span className="tabular-nums font-medium">
                    {data.approvalRate?.toFixed(1) ?? 0}%
                  </span>
                </div>
                <div className="flex h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="bg-success transition-all"
                    style={{
                      width: `${(data.approved / reviewed) * 100}%`,
                    }}
                  />
                  <div
                    className="bg-destructive transition-all"
                    style={{
                      width: `${(data.rejected / reviewed) * 100}%`,
                    }}
                  />
                </div>
              </div>
            )}

            {/* Average confidence */}
            <div className="grid grid-cols-2 gap-4 border-t pt-3">
              <div>
                <p className="text-xs text-muted-foreground">
                  Avg Confidence (Approved)
                </p>
                <p className="tabular-nums font-medium">
                  {data.avgApprovedConfidence?.toFixed(2) ?? "N/A"}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">
                  Avg Confidence (Rejected)
                </p>
                <p className="tabular-nums font-medium">
                  {data.avgRejectedConfidence?.toFixed(2) ?? "N/A"}
                </p>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
