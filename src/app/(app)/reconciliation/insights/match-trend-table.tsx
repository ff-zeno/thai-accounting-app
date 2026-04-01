"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { MatchRateTrendRow } from "@/lib/db/queries/reconciliation-metrics";

interface Props {
  data: MatchRateTrendRow[];
}

export function MatchTrendTable({ data }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold">
          Weekly Match Trend
        </CardTitle>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className="text-sm text-muted-foreground">No trend data yet</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Period</TableHead>
                <TableHead className="text-right">Total Matches</TableHead>
                <TableHead className="text-right">Exact Matches</TableHead>
                <TableHead className="text-right">Exact %</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((row) => {
                const pct =
                  row.matches > 0
                    ? ((row.exactMatches / row.matches) * 100).toFixed(1)
                    : "0.0";
                return (
                  <TableRow key={row.period}>
                    <TableCell className="font-medium">
                      {new Date(row.period).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </TableCell>
                    <TableCell className="tabular-nums text-right">
                      {row.matches}
                    </TableCell>
                    <TableCell className="tabular-nums text-right">
                      {row.exactMatches}
                    </TableCell>
                    <TableCell className="tabular-nums text-right">
                      {pct}%
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
