"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { RejectionAnalysis as RejectionAnalysisData } from "@/lib/db/queries/reconciliation-metrics";

interface Props {
  data: RejectionAnalysisData;
}

export function RejectionAnalysis({ data }: Props) {
  const hasData = data.byLayer.length > 0 || data.byReason.length > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold">
          Rejection Analysis
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!hasData ? (
          <p className="text-sm text-muted-foreground">No rejections yet</p>
        ) : (
          <div className="space-y-6">
            {/* Rejections by layer */}
            {data.byLayer.length > 0 && (
              <div>
                <h4 className="mb-2 text-sm font-medium text-muted-foreground">
                  By Match Layer
                </h4>
                <div className="space-y-2">
                  {data.byLayer.map((row) => (
                    <div
                      key={row.layer}
                      className="flex items-center justify-between text-sm"
                    >
                      <span className="capitalize">
                        {row.layer === "unknown" ? "Unknown" : row.layer}
                      </span>
                      <span className="tabular-nums font-medium">
                        {row.rejectionCount}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Rejection reasons */}
            {data.byReason.length > 0 && (
              <div>
                <h4 className="mb-2 text-sm font-medium text-muted-foreground">
                  Top Rejection Reasons
                </h4>
                <div className="space-y-2">
                  {data.byReason.slice(0, 5).map((row) => (
                    <div
                      key={row.reason}
                      className="flex items-center justify-between text-sm"
                    >
                      <span>{row.reason}</span>
                      <span className="tabular-nums font-medium">
                        {row.count}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
