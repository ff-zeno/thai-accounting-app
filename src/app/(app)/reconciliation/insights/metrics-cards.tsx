"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Activity, BookCheck, Brain, Cog } from "lucide-react";

interface Props {
  overallMatchRate: number;
  totalMatches: number;
  aliasCount: number;
  confirmedAliases: number;
  aiApprovalRate: number | null;
  aiTotal: number;
  activeRules: number;
  autoSuggestedRules: number;
}

export function MetricsCards({
  overallMatchRate,
  totalMatches,
  aliasCount,
  confirmedAliases,
  aiApprovalRate,
  aiTotal,
  activeRules,
  autoSuggestedRules,
}: Props) {
  const cards = [
    {
      title: "Match Rate",
      icon: Activity,
      value: `${(overallMatchRate * 100).toFixed(1)}%`,
      sub: `${totalMatches} total matches`,
    },
    {
      title: "Vendor Aliases",
      icon: BookCheck,
      value: String(aliasCount),
      sub: `${confirmedAliases} confirmed`,
    },
    {
      title: "AI Approval Rate",
      icon: Brain,
      value: aiApprovalRate != null ? `${aiApprovalRate.toFixed(1)}%` : "N/A",
      sub: `${aiTotal} suggestions`,
    },
    {
      title: "Active Rules",
      icon: Cog,
      value: String(activeRules),
      sub: `${autoSuggestedRules} auto-suggested`,
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((c) => (
        <Card key={c.title}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {c.title}
            </CardTitle>
            <c.icon className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums">{c.value}</div>
            <p className="mt-1 text-xs text-muted-foreground">{c.sub}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
