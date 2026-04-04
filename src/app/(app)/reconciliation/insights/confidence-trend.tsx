import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";

interface ConfidenceTrendRow {
  period: string;
  avgConfidence: number;
  matchCount: number;
}

interface Props {
  data: ConfidenceTrendRow[];
}

function formatWeek(period: string): string {
  const d = new Date(period);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function ConfidenceTrend({ data }: Props) {
  if (data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Confidence Trend</CardTitle>
          <CardDescription>Average match confidence per week</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="py-8 text-center text-sm text-muted-foreground">
            No match data yet
          </p>
        </CardContent>
      </Card>
    );
  }

  const maxCount = Math.max(...data.map((d) => d.matchCount), 1);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Confidence Trend</CardTitle>
        <CardDescription>Average match confidence per week</CardDescription>
      </CardHeader>
      <CardContent>
        {/* Bar chart with confidence overlay */}
        <div className="flex items-end gap-1" style={{ height: 160 }}>
          {data.map((row) => {
            const barHeight = (row.matchCount / maxCount) * 100;
            const confPct = row.avgConfidence * 100;
            const barColor =
              confPct >= 80
                ? "bg-green-500"
                : confPct >= 60
                  ? "bg-amber-500"
                  : "bg-red-500";

            return (
              <div
                key={row.period}
                className="group relative flex flex-1 flex-col items-center justify-end"
                style={{ height: "100%" }}
              >
                {/* Tooltip on hover */}
                <div className="pointer-events-none absolute -top-8 z-10 hidden rounded bg-popover px-2 py-1 text-xs shadow-md group-hover:block">
                  <span className="font-medium">{confPct.toFixed(0)}%</span>
                  <span className="text-muted-foreground"> ({row.matchCount})</span>
                </div>
                <div
                  className={`w-full rounded-t ${barColor} transition-all`}
                  style={{ height: `${Math.max(barHeight, 4)}%` }}
                />
              </div>
            );
          })}
        </div>

        {/* X-axis labels */}
        <div className="mt-1 flex gap-1">
          {data.map((row, i) => (
            <div key={row.period} className="flex-1 text-center">
              {i % Math.max(1, Math.floor(data.length / 6)) === 0 && (
                <span className="text-[10px] text-muted-foreground">
                  {formatWeek(row.period)}
                </span>
              )}
            </div>
          ))}
        </div>

        {/* Legend */}
        <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <span className="inline-block size-2 rounded-full bg-green-500" />
            High (80%+)
          </div>
          <div className="flex items-center gap-1">
            <span className="inline-block size-2 rounded-full bg-amber-500" />
            Medium (60-80%)
          </div>
          <div className="flex items-center gap-1">
            <span className="inline-block size-2 rounded-full bg-red-500" />
            Low (&lt;60%)
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
