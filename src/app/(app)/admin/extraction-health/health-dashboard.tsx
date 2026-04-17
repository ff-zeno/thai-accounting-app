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
import { retireGlobalExemplarAction, forgetVendorExemplarsAction } from "./actions";
import type {
  PromotionTimelineEntry,
  VendorTierDistribution,
  RecentHighCritPromotion,
  PerVendorCard,
  GlobalExtractionHealth,
  ConsensusHealth,
  ReputationBucket,
  IdempotencyHealth,
  ShadowCanaryHealth,
  CompiledPatternHealth,
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
  perVendorCards: PerVendorCard[];
  globalHealth: GlobalExtractionHealth;
  consensusHealth: ConsensusHealth;
  reputationDistribution: ReputationBucket[];
  idempotencyHealth: IdempotencyHealth;
  shadowCanaryHealth: ShadowCanaryHealth;
  compiledPatternHealth: CompiledPatternHealth;
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
  perVendorCards,
  globalHealth,
  consensusHealth,
  reputationDistribution,
  idempotencyHealth,
  shadowCanaryHealth,
  compiledPatternHealth,
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

      {/* Global extraction health summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Global Extraction Health</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <p className="text-sm text-muted-foreground">Avg Tier</p>
              <p className="text-xl font-semibold">{globalHealth.avgTier.toFixed(1)}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Avg Cost/Doc</p>
              <p className="text-xl font-semibold">${globalHealth.costPerDocTrend.toFixed(4)}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Correction Rate</p>
              <p className="text-xl font-semibold">{(globalHealth.correctionRate * 100).toFixed(1)}%</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Consensus pipeline health */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Consensus Pipeline Health</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-4">
            <div>
              <p className="text-sm text-muted-foreground">In Shadow</p>
              <p className="text-xl font-semibold">{consensusHealth.candidatesInShadow}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Promoted (7d)</p>
              <p className="text-xl font-semibold">{consensusHealth.promotedThisWeek}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Demoted (7d)</p>
              <p className="text-xl font-semibold">{consensusHealth.demotedThisWeek}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Avg Days to Promote</p>
              <p className="text-xl font-semibold">{consensusHealth.avgTimeToPromote.toFixed(1)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Reputation distribution histogram */}
      {reputationDistribution.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Reputation Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-1" style={{ height: 120 }}>
              {(() => {
                const maxCount = Math.max(...reputationDistribution.map((b) => b.count), 1);
                return reputationDistribution.map((bucket) => (
                  <div
                    key={bucket.bucket}
                    className="flex flex-1 flex-col items-center gap-1"
                  >
                    <span className="text-xs text-muted-foreground">{bucket.count}</span>
                    <div
                      className="w-full rounded-t bg-primary"
                      style={{ height: `${(bucket.count / maxCount) * 80}px`, minHeight: 2 }}
                    />
                    <span className="text-xs text-muted-foreground">{bucket.bucket}</span>
                  </div>
                ));
              })()}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Per-vendor cards */}
      {perVendorCards.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Top Vendors by Volume</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vendor</TableHead>
                  <TableHead>Tax ID</TableHead>
                  <TableHead>Tier</TableHead>
                  <TableHead>Docs</TableHead>
                  <TableHead>Correction Rate (30d)</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {perVendorCards.map((v) => (
                  <TableRow key={`${v.vendorName}-${v.vendorTaxId}`}>
                    <TableCell className="max-w-[200px] truncate">{v.vendorName}</TableCell>
                    <TableCell className="font-mono text-xs">{v.vendorTaxId ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant={v.currentTier >= 2 ? "default" : "secondary"}>
                        Tier {v.currentTier}
                      </Badge>
                    </TableCell>
                    <TableCell>{v.docsProcessed}</TableCell>
                    <TableCell>{(v.correctionRate30d * 100).toFixed(1)}%</TableCell>
                    <TableCell>
                      <form action={() => forgetVendorExemplarsAction(v.vendorId)}>
                        <Button type="submit" variant="ghost" size="sm" className="text-destructive">
                          Forget
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

      {/* Idempotency health */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Idempotency
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{idempotencyHealth.duplicatesPrevented}</p>
            <p className="text-xs text-muted-foreground">duplicates prevented</p>
          </CardContent>
        </Card>

        {/* Shadow canary */}
        <Card className={shadowCanaryHealth.activeCanaries === 0 ? "opacity-50" : ""}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Shadow Canary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {shadowCanaryHealth.activeCanaries || "—"}
            </p>
            <p className="text-xs text-muted-foreground">
              {shadowCanaryHealth.activeCanaries > 0
                ? `${(shadowCanaryHealth.agreementRate * 100).toFixed(1)}% agreement`
                : "no active canaries"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Compiled patterns */}
      <Card className={compiledPatternHealth.active === 0 && compiledPatternHealth.shadow === 0 ? "opacity-50" : ""}>
        <CardHeader>
          <CardTitle className="text-base">
            Compiled Patterns
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-4">
            <div>
              <p className="text-sm text-muted-foreground">Active</p>
              <p className="text-xl font-semibold">{compiledPatternHealth.active || "—"}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Shadow</p>
              <p className="text-xl font-semibold">{compiledPatternHealth.shadow || "—"}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Retired</p>
              <p className="text-xl font-semibold">{compiledPatternHealth.retired || "—"}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Awaiting Review</p>
              <p className="text-xl font-semibold">{compiledPatternHealth.awaitingReview || "—"}</p>
            </div>
          </div>
        </CardContent>
      </Card>

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
