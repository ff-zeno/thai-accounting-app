"use client";

import { useState, useTransition } from "react";
import { BarChart3 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getAiAnalyticsAction } from "./actions";
import type { BudgetStatus } from "@/lib/ai/cost-tracker";

type Period = "7d" | "30d" | "90d";

interface AnalyticsData {
  summary: {
    totalCost: string;
    totalFiles: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    avgCost: string;
  };
  byDay: { date: string; cost: string; files: number }[];
  byModel: { model: string | null; cost: string; files: number }[];
  byPurpose: { purpose: string | null; cost: string; files: number }[];
  recent: {
    id: string;
    originalFilename: string | null;
    aiModelUsed: string | null;
    aiPurpose: string | null;
    aiInputTokens: number | null;
    aiOutputTokens: number | null;
    aiCostUsd: string | null;
    createdAt: Date;
  }[];
}

interface AiCostAnalyticsProps {
  budgetStatus: BudgetStatus;
  initialData: AnalyticsData | null;
}

function formatUsd(value: string | number): string {
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (num < 0.01 && num > 0) return `$${num.toFixed(6)}`;
  return `$${num.toFixed(2)}`;
}

function PercentBar({
  value,
  max,
  label,
  color = "bg-primary",
}: {
  value: number;
  max: number;
  label: string;
  color?: string;
}) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span>{label}</span>
        <span className="text-muted-foreground">{formatUsd(value)}</span>
      </div>
      <div className="h-2 rounded-full bg-muted">
        <div
          className={`h-full rounded-full ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function AiCostAnalytics({
  budgetStatus,
  initialData,
}: AiCostAnalyticsProps) {
  const [period, setPeriod] = useState<Period>("30d");
  const [data, setData] = useState<AnalyticsData | null>(initialData);
  const [isPending, startTransition] = useTransition();

  function loadPeriod(p: Period) {
    setPeriod(p);
    startTransition(async () => {
      const result = await getAiAnalyticsAction(p);
      setData(result);
    });
  }

  const maxDailyCost =
    data?.byDay.reduce((m, d) => Math.max(m, parseFloat(d.cost)), 0) ?? 0;

  const totalModelCost =
    data?.byModel.reduce((s, m) => s + parseFloat(m.cost), 0) ?? 0;

  const totalPurposeCost =
    data?.byPurpose.reduce((s, p) => s + parseFloat(p.cost), 0) ?? 0;

  return (
    <div className="space-y-6">
      {/* Budget card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Monthly Budget</CardTitle>
        </CardHeader>
        <CardContent>
          {budgetStatus.budgetUsd !== null ? (
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span>
                  {formatUsd(budgetStatus.spentUsd)} of{" "}
                  {formatUsd(budgetStatus.budgetUsd)}
                </span>
                <span className="text-muted-foreground">
                  {budgetStatus.percentUsed !== null
                    ? `${(budgetStatus.percentUsed * 100).toFixed(0)}%`
                    : "0%"}
                </span>
              </div>
              <div className="h-3 rounded-full bg-muted">
                <div
                  className={`h-full rounded-full transition-all ${
                    budgetStatus.isOverBudget
                      ? "bg-destructive"
                      : budgetStatus.isNearBudget
                        ? "bg-yellow-500"
                        : "bg-primary"
                  }`}
                  style={{
                    width: `${Math.min(
                      (budgetStatus.percentUsed ?? 0) * 100,
                      100
                    )}%`,
                  }}
                />
              </div>
              {budgetStatus.remainingUsd !== null && (
                <p className="text-xs text-muted-foreground">
                  {budgetStatus.isOverBudget
                    ? `Over budget by ${formatUsd(Math.abs(budgetStatus.remainingUsd))}`
                    : `${formatUsd(budgetStatus.remainingUsd)} remaining`}
                </p>
              )}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">
              <p>
                Spent {formatUsd(budgetStatus.spentUsd)} this month — no budget
                limit set
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Period selector */}
      <div className="flex gap-1">
        {(["7d", "30d", "90d"] as const).map((p) => (
          <Button
            key={p}
            variant={period === p ? "default" : "outline"}
            size="sm"
            onClick={() => loadPeriod(p)}
            disabled={isPending}
          >
            {p === "7d" ? "7 days" : p === "30d" ? "30 days" : "90 days"}
          </Button>
        ))}
      </div>

      {/* Summary */}
      {data && (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Card>
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground">Total Cost</p>
                <p className="text-lg font-semibold">
                  {formatUsd(data.summary.totalCost)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground">Files Processed</p>
                <p className="text-lg font-semibold">
                  {data.summary.totalFiles}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground">Avg Cost/File</p>
                <p className="text-lg font-semibold">
                  {formatUsd(data.summary.avgCost)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground">Total Tokens</p>
                <p className="text-lg font-semibold">
                  {(
                    data.summary.totalInputTokens +
                    data.summary.totalOutputTokens
                  ).toLocaleString()}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Daily cost chart */}
          {data.byDay.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Cost Over Time</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-end gap-px" style={{ height: 120 }}>
                  {data.byDay.map((d) => {
                    const cost = parseFloat(d.cost);
                    const heightPct =
                      maxDailyCost > 0
                        ? Math.max((cost / maxDailyCost) * 100, 2)
                        : 2;
                    return (
                      <div
                        key={d.date}
                        className="group relative flex-1"
                        style={{ height: "100%" }}
                      >
                        <div
                          className="absolute bottom-0 w-full rounded-t bg-primary transition-colors group-hover:bg-primary/80"
                          style={{ height: `${heightPct}%` }}
                        />
                        <div className="absolute -top-6 left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded bg-popover px-1.5 py-0.5 text-[10px] shadow group-hover:block">
                          {d.date}: {formatUsd(cost)} ({d.files} files)
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Cost by model */}
          {data.byModel.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Cost by Model</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {data.byModel.map((m) => (
                  <PercentBar
                    key={m.model ?? "unknown"}
                    value={parseFloat(m.cost)}
                    max={totalModelCost}
                    label={m.model ?? "Unknown"}
                  />
                ))}
              </CardContent>
            </Card>
          )}

          {/* Cost by purpose */}
          {data.byPurpose.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Cost by Function</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {data.byPurpose.map((p) => (
                  <PercentBar
                    key={p.purpose ?? "unknown"}
                    value={parseFloat(p.cost)}
                    max={totalPurposeCost}
                    label={
                      p.purpose
                        ? p.purpose.charAt(0).toUpperCase() + p.purpose.slice(1)
                        : "Unknown"
                    }
                  />
                ))}
              </CardContent>
            </Card>
          )}

          {/* Recent usage */}
          {data.recent.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Recent AI Usage</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-xs text-muted-foreground">
                        <th className="pb-2 pr-4">Date</th>
                        <th className="pb-2 pr-4">File</th>
                        <th className="pb-2 pr-4">Model</th>
                        <th className="pb-2 pr-4">Purpose</th>
                        <th className="pb-2 pr-4 text-right">Tokens (In/Out)</th>
                        <th className="pb-2 text-right">Cost</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.recent.map((r) => (
                        <tr key={r.id} className="border-b last:border-0">
                          <td className="py-2 pr-4 whitespace-nowrap">
                            {new Date(r.createdAt).toLocaleDateString()}
                          </td>
                          <td className="py-2 pr-4 max-w-[200px] truncate">
                            {r.originalFilename ?? "—"}
                          </td>
                          <td className="py-2 pr-4 whitespace-nowrap">
                            {r.aiModelUsed?.split("/")[1] ?? "—"}
                          </td>
                          <td className="py-2 pr-4 capitalize">
                            {r.aiPurpose ?? "—"}
                          </td>
                          <td className="py-2 pr-4 text-right whitespace-nowrap">
                            {r.aiInputTokens?.toLocaleString() ?? "—"} /{" "}
                            {r.aiOutputTokens?.toLocaleString() ?? "—"}
                          </td>
                          <td className="py-2 text-right whitespace-nowrap">
                            {r.aiCostUsd ? formatUsd(r.aiCostUsd) : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Empty state */}
          {data.summary.totalFiles === 0 && (
            <Card>
              <CardContent className="flex flex-col items-center py-12 text-center">
                <div className="mb-3 flex size-12 items-center justify-center rounded-full bg-primary/10">
                  <BarChart3 className="size-6 text-primary" />
                </div>
                <p className="font-medium text-foreground">No AI usage data yet</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Process some documents to see analytics here.
                </p>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
