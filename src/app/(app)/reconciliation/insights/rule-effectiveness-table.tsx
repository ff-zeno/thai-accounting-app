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
import { Badge } from "@/components/ui/badge";
import type { RuleEffectivenessRow } from "@/lib/db/queries/reconciliation-metrics";

interface Props {
  data: RuleEffectivenessRow[];
}

export function RuleEffectivenessTable({ data }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold">
          Rule Effectiveness
        </CardTitle>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className="text-sm text-muted-foreground">No rules configured yet</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Rule Name</TableHead>
                <TableHead className="text-right">Matches</TableHead>
                <TableHead>Last Matched</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((rule) => (
                <TableRow key={rule.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{rule.name}</span>
                      {rule.isAutoSuggested && (
                        <Badge variant="outline" className="text-xs">
                          Auto-suggested
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="tabular-nums text-right">
                    {rule.matchCount}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {rule.lastMatchedAt
                      ? new Date(rule.lastMatchedAt).toLocaleDateString()
                      : "Never"}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={rule.isActive ? "default" : "secondary"}
                    >
                      {rule.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
