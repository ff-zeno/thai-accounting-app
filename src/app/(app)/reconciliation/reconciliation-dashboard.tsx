"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ArrowRight, ArrowUp, ArrowDown, Minus, Brain, FileText, GitCompareArrows, Landmark, Loader2, TrendingUp, Gauge, Undo2 } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Amount } from "@/components/ui/amount";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ConfidenceBadge } from "@/components/reconciliation/confidence-badge";
import { getSimplifiedExplanation } from "@/lib/reconciliation/match-display";
import type { MatchMetadata } from "@/lib/reconciliation/matcher";
import { toast } from "sonner";
import { getReconciliationDashboardData } from "./actions";
import { undoMatchAction } from "./review/actions";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Stats {
  totalTransactions: number;
  matchedTransactions: number;
  unmatchedTransactions: number;
  matchRate: number;
  unmatchedAmount: string;
}

interface UnmatchedTransaction {
  id: string;
  date: string;
  amount: string;
  type: string;
  description: string | null;
  counterparty: string | null;
  bankAccountId: string;
}

interface UnmatchedDocument {
  id: string;
  documentNumber: string | null;
  issueDate: string | null;
  totalAmount: string | null;
  currency: string | null;
  status: string;
  vendorName: string | null;
}

interface RecentMatch {
  id: string;
  matchType: string;
  confidence: string | null;
  matchMetadata: unknown;
  matchedAt: Date | null;
  txnDate: string;
  txnAmount: string;
  txnCounterparty: string | null;
  docNumber: string | null;
  docAmount: string | null;
  vendorName: string | null;
}

interface SuggestionCounts {
  pending: number;
  approved: number;
  rejected: number;
  total: number;
}

interface QualityScoreData {
  matchRate: number;
  avgAutoConfidence: number | null;
  falsePositivePct: number;
  aiApprovalRate: number | null;
  score: number;
}

interface Props {
  initialStats: Stats;
  initialUnmatchedTransactions: UnmatchedTransaction[];
  initialUnmatchedDocuments: UnmatchedDocument[];
  recentMatches: RecentMatch[];
  suggestionCounts: SuggestionCounts;
  qualityScore: QualityScoreData;
  prevQualityScore: QualityScoreData | null;
}

// ---------------------------------------------------------------------------
// Period helpers
// ---------------------------------------------------------------------------

type PeriodKey = "this-month" | "last-month" | "this-quarter" | "this-year" | "all";

// Base UI's SelectValue renders the raw value string unless given a
// formatter, so the trigger and the items share this one label map.
const PERIOD_LABELS: Record<PeriodKey, string> = {
  all: "All Time",
  "this-month": "This Month",
  "last-month": "Last Month",
  "this-quarter": "This Quarter",
  "this-year": "This Year",
};

function getPeriodRange(key: PeriodKey): { start: string; end: string } | undefined {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-indexed

  switch (key) {
    case "this-month": {
      const start = new Date(year, month, 1);
      const end = new Date(year, month + 1, 0);
      return {
        start: start.toISOString().split("T")[0],
        end: end.toISOString().split("T")[0],
      };
    }
    case "last-month": {
      const start = new Date(year, month - 1, 1);
      const end = new Date(year, month, 0);
      return {
        start: start.toISOString().split("T")[0],
        end: end.toISOString().split("T")[0],
      };
    }
    case "this-quarter": {
      const qStart = Math.floor(month / 3) * 3;
      const start = new Date(year, qStart, 1);
      const end = new Date(year, qStart + 3, 0);
      return {
        start: start.toISOString().split("T")[0],
        end: end.toISOString().split("T")[0],
      };
    }
    case "this-year": {
      return {
        start: `${year}-01-01`,
        end: `${year}-12-31`,
      };
    }
    case "all":
      return undefined;
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function UndoButton({ matchId }: { matchId: string }) {
  const [pending, startUndo] = useTransition();
  return (
    <Button
      variant="ghost"
      size="xs"
      disabled={pending}
      onClick={() =>
        startUndo(async () => {
          const result = await undoMatchAction(matchId);
          if ("error" in result) toast.error(result.error);
        })
      }
      title="Undo match"
    >
      {pending ? (
        <Loader2 className="size-3.5 animate-spin" />
      ) : (
        <Undo2 className="size-3.5" />
      )}
    </Button>
  );
}

function getScoreColor(score: number): string {
  if (score >= 70) return "text-success";
  if (score >= 40) return "text-warning";
  return "text-destructive";
}

function getScoreBg(score: number): string {
  if (score >= 70) return "bg-success/10 border-success/30";
  if (score >= 40) return "bg-warning/10 border-warning/40";
  return "bg-destructive/10 border-destructive/30";
}

function getScoreLabel(score: number): string {
  if (score >= 80) return "Excellent";
  if (score >= 70) return "Good";
  if (score >= 50) return "Fair";
  if (score >= 30) return "Needs Work";
  return "Poor";
}

export function ReconciliationDashboard({
  initialStats,
  initialUnmatchedTransactions,
  initialUnmatchedDocuments,
  recentMatches,
  suggestionCounts,
  qualityScore,
  prevQualityScore,
}: Props) {
  const [stats, setStats] = useState(initialStats);
  const [unmatchedTxns, setUnmatchedTxns] = useState(initialUnmatchedTransactions);
  const [unmatchedDocs, setUnmatchedDocs] = useState(initialUnmatchedDocuments);
  const [period, setPeriod] = useState<PeriodKey>("all");
  const [isPending, startTransition] = useTransition();

  function handlePeriodChange(value: string | null) {
    if (!value) return;
    const key = value as PeriodKey;
    setPeriod(key);
    startTransition(async () => {
      const range = getPeriodRange(key);
      const data = await getReconciliationDashboardData(range);
      setStats(data.stats);
      setUnmatchedTxns(data.unmatchedTransactions as UnmatchedTransaction[]);
      setUnmatchedDocs(data.unmatchedDocuments as UnmatchedDocument[]);
    });
  }

  const matchRatePercent = (stats.matchRate * 100).toFixed(1);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reconciliation"
        description="Match bank transactions to confirmed documents"
      >
        {isPending && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
        <Select value={period} onValueChange={handlePeriodChange}>
          <SelectTrigger className="w-[160px]" aria-label="Period">
            <SelectValue>
              {(value: PeriodKey) => PERIOD_LABELS[value]}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(PERIOD_LABELS) as PeriodKey[]).map((key) => (
              <SelectItem key={key} value={key}>
                {PERIOD_LABELS[key]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button render={<Link href="/reconciliation/review" />}>
          Manual Match
          <ArrowRight className="ml-1 size-4" />
        </Button>
      </PageHeader>

      {/* Quality Score + Summary Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Card size="sm" className={`border ${getScoreBg(qualityScore.score)}`}>
          <CardHeader>
            <CardDescription className="flex items-center gap-1.5">
              <Gauge className="size-3.5" />
              Quality Score
            </CardDescription>
            <CardTitle className={`text-3xl tabular-nums ${getScoreColor(qualityScore.score)}`}>
              {qualityScore.score}
              <span className="text-sm font-normal text-muted-foreground">/100</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-1.5">
              <span className={`text-xs font-medium ${getScoreColor(qualityScore.score)}`}>
                {getScoreLabel(qualityScore.score)}
              </span>
              {prevQualityScore && (() => {
                const delta = qualityScore.score - prevQualityScore.score;
                if (delta > 0) return <ArrowUp className="size-3 text-success" />;
                if (delta < 0) return <ArrowDown className="size-3 text-destructive" />;
                return <Minus className="size-3 text-muted-foreground" />;
              })()}
              {prevQualityScore && (
                <span className="text-xs text-muted-foreground">
                  vs last month
                </span>
              )}
            </div>
          </CardContent>
        </Card>

        <Card size="sm">
          <CardHeader>
            <CardDescription>Total Transactions</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {stats.totalTransactions.toLocaleString()}
            </CardTitle>
          </CardHeader>
        </Card>

        <Card size="sm">
          <CardHeader>
            <CardDescription>Matched</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {stats.matchedTransactions.toLocaleString()}
              {stats.totalTransactions > 0 && (
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  ({matchRatePercent}%)
                </span>
              )}
            </CardTitle>
          </CardHeader>
        </Card>

        <Card size="sm">
          <CardHeader>
            <CardDescription>Unmatched</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {stats.unmatchedTransactions.toLocaleString()}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              <Amount value={stats.unmatchedAmount} /> THB total
            </p>
          </CardContent>
        </Card>

        <Card size="sm">
          <CardHeader>
            <CardDescription>Match Rate</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{matchRatePercent}%</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${Math.min(100, stats.matchRate * 100)}%` }}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* AI Suggestions Banner */}
      {suggestionCounts.pending > 0 && (
        <Alert variant="warning">
          <Brain />
          <AlertTitle className="flex items-center justify-between gap-3">
            <span>
              AI has {suggestionCounts.pending} suggested match{suggestionCounts.pending !== 1 ? "es" : ""} ready for review
            </span>
            <Button
              size="sm"
              variant="outline"
              render={<Link href="/reconciliation/ai-review" />}
            >
              Review
              <ArrowRight className="ml-1 size-3.5" />
            </Button>
          </AlertTitle>
        </Alert>
      )}

      {/* Unmatched Lists */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Unmatched Transactions */}
        <Card>
          <CardHeader className="border-b">
            <CardTitle className="flex items-center gap-2">
              <Landmark className="size-4 text-muted-foreground" />
              Recent Unmatched Transactions
            </CardTitle>
            <CardDescription>
              {unmatchedTxns.length === 0
                ? "No unmatched transactions"
                : `Top ${unmatchedTxns.length} unmatched bank transactions`}
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {unmatchedTxns.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <TrendingUp className="mb-2 size-8 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">
                  All transactions are matched!
                </p>
              </div>
            ) : (
              <div className="divide-y">
                {unmatchedTxns.map((txn) => (
                  <div
                    key={txn.id}
                    className="flex items-center justify-between px-4 py-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {txn.description || txn.counterparty || "No description"}
                      </p>
                      <p className="text-xs text-muted-foreground">{txn.date}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <Amount
                        signed
                        value={txn.type === "debit" ? `-${txn.amount}` : txn.amount}
                        className="whitespace-nowrap text-sm"
                      />
                      <Button
                        variant="outline"
                        size="xs"
                        render={
                          <Link
                            href={`/reconciliation/review?txnId=${txn.id}`}
                          />
                        }
                      >
                        Match
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Unmatched Documents */}
        <Card>
          <CardHeader className="border-b">
            <CardTitle className="flex items-center gap-2">
              <FileText className="size-4 text-muted-foreground" />
              Recent Unmatched Documents
            </CardTitle>
            <CardDescription>
              {unmatchedDocs.length === 0
                ? "No unmatched documents"
                : `Top ${unmatchedDocs.length} confirmed documents without matches`}
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {unmatchedDocs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <TrendingUp className="mb-2 size-8 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">
                  All documents are matched!
                </p>
              </div>
            ) : (
              <div className="divide-y">
                {unmatchedDocs.map((doc) => (
                  <div
                    key={doc.id}
                    className="flex items-center justify-between px-4 py-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {doc.vendorName || "Unknown vendor"}
                        {doc.documentNumber && (
                          <span className="ml-2 text-muted-foreground">
                            #{doc.documentNumber}
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {doc.issueDate || "No date"}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="whitespace-nowrap text-sm">
                        <Amount value={doc.totalAmount} /> {doc.currency || "THB"}
                      </span>
                      <Button
                        variant="outline"
                        size="xs"
                        render={
                          <Link
                            href={`/reconciliation/review?docId=${doc.id}`}
                          />
                        }
                      >
                        Match
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Matches */}
      <Card>
        <CardHeader className="border-b">
          <CardTitle className="flex items-center gap-2">
            <GitCompareArrows className="size-4 text-muted-foreground" />
            Recent Matches
          </CardTitle>
          <CardDescription>
            {recentMatches.length === 0
              ? "No matches yet"
              : `Last ${recentMatches.length} reconciliation matches`}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {recentMatches.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <GitCompareArrows className="mb-2 size-8 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">
                No matches yet. Start by uploading statements and documents.
              </p>
            </div>
          ) : (
            <div className="divide-y">
              {recentMatches.map((match) => {
                const metadata = match.matchMetadata as MatchMetadata | null;
                const explanation = metadata
                  ? getSimplifiedExplanation(metadata)
                  : match.matchType;
                return (
                  <div
                    key={match.id}
                    className="flex items-center justify-between gap-4 px-4 py-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-medium">
                          {match.vendorName ?? match.txnCounterparty ?? "Unknown"}
                        </p>
                        {match.docNumber && (
                          <span className="text-xs text-muted-foreground">
                            #{match.docNumber}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">{explanation}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="whitespace-nowrap text-sm">
                        <Amount value={match.txnAmount} />
                      </span>
                      {match.confidence && (
                        <ConfidenceBadge confidence={match.confidence} />
                      )}
                      <UndoButton matchId={match.id} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
