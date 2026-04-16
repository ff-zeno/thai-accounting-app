"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { retireGlobalExemplarAction } from "./actions";
import type {
  PromotionTimelineEntry,
  VendorTierDistribution,
  RecentHighCritPromotion,
} from "@/lib/db/queries/extraction-health";

interface HealthDashboardProps {
  poolStats: { active: number; retired: number };
  consensusStats: { total: number; candidates: number; promoted: number; retired: number };
  orgReputation: {
    score: string;
    correctionsTotal: number;
    correctionsAgreed: number;
    correctionsDisputed: number;
    docsProcessed: number;
    eligible: boolean;
  } | null;
  promotionTimeline: PromotionTimelineEntry[];
  tierDistribution: VendorTierDistribution[];
  highCritPromotions: RecentHighCritPromotion[];
}

function criticalityColor(c: string) {
  switch (c) {
    case "high":
      return "destructive";
    case "medium":
      return "default";
    case "low":
      return "secondary";
    default:
      return "outline";
  }
}

export function HealthDashboard({
  poolStats,
  consensusStats,
  orgReputation,
  promotionTimeline,
  tierDistribution,
  highCritPromotions,
}: HealthDashboardProps) {
  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Global Pool Size
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{poolStats.active}</p>
            <p className="text-xs text-muted-foreground">
              {poolStats.retired} retired
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Org Reputation
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {orgReputation ? parseFloat(orgReputation.score).toFixed(2) : "—"}
            </p>
            <p className="text-xs text-muted-foreground">
              {orgReputation?.eligible ? "Eligible" : "Not eligible"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Corrections Made
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {orgReputation?.correctionsTotal ?? 0}
            </p>
            <p className="text-xs text-muted-foreground">
              {orgReputation?.correctionsAgreed ?? 0} agreed /{" "}
              {orgReputation?.correctionsDisputed ?? 0} disputed
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Tier Coverage
            </CardTitle>
          </CardHeader>
          <CardContent>
            {tierDistribution.length > 0 ? (
              <div className="space-y-1">
                {tierDistribution.map((t) => (
                  <div key={t.tier} className="flex justify-between text-sm">
                    <span>Tier {t.tier}</span>
                    <span className="font-medium">{t.count}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No extractions yet</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Consensus stats */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Consensus Pipeline</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-4">
            <div>
              <p className="text-sm text-muted-foreground">Total Entries</p>
              <p className="text-xl font-semibold">{consensusStats.total}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Candidates</p>
              <p className="text-xl font-semibold">{consensusStats.candidates}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Promoted</p>
              <p className="text-xl font-semibold">{consensusStats.promoted}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Retired</p>
              <p className="text-xl font-semibold">{consensusStats.retired}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* High-criticality promotions with retire button */}
      {highCritPromotions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Recent High-Criticality Promotions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vendor Tax ID</TableHead>
                  <TableHead>Field</TableHead>
                  <TableHead>Value</TableHead>
                  <TableHead>Promoted</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {highCritPromotions.map((p) => (
                  <TableRow key={p.poolId}>
                    <TableCell className="font-mono text-xs">
                      {p.vendorKey}
                    </TableCell>
                    <TableCell>{p.fieldName}</TableCell>
                    <TableCell className="max-w-[200px] truncate">
                      {p.canonicalValue}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(p.promotedAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <form action={() => retireGlobalExemplarAction(p.poolId)}>
                        <Button
                          type="submit"
                          variant="outline"
                          size="sm"
                        >
                          Retire
                        </Button>
                      </form>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Promotion/retirement timeline */}
      {promotionTimeline.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Promotion / Retirement Timeline
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vendor Tax ID</TableHead>
                  <TableHead>Field</TableHead>
                  <TableHead>Value</TableHead>
                  <TableHead>Criticality</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Orgs</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {promotionTimeline.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="font-mono text-xs">
                      {entry.vendorKey}
                    </TableCell>
                    <TableCell>{entry.fieldName}</TableCell>
                    <TableCell className="max-w-[200px] truncate">
                      {entry.normalizedValue}
                    </TableCell>
                    <TableCell>
                      <Badge variant={criticalityColor(entry.fieldCriticality)}>
                        {entry.fieldCriticality}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          entry.status === "promoted" ? "default" : "secondary"
                        }
                      >
                        {entry.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{entry.agreeingOrgCount}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
