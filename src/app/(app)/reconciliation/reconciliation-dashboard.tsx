"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ArrowRight, FileText, Landmark, Loader2, TrendingUp } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getReconciliationDashboardData } from "./actions";

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

interface Props {
  initialStats: Stats;
  initialUnmatchedTransactions: UnmatchedTransaction[];
  initialUnmatchedDocuments: UnmatchedDocument[];
}

// ---------------------------------------------------------------------------
// Period helpers
// ---------------------------------------------------------------------------

type PeriodKey = "this-month" | "last-month" | "this-quarter" | "this-year" | "all";

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
// Formatting
// ---------------------------------------------------------------------------

function formatAmount(amount: string | null, currency?: string | null): string {
  if (!amount) return "--";
  return `${parseFloat(amount).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ${currency || "THB"}`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ReconciliationDashboard({
  initialStats,
  initialUnmatchedTransactions,
  initialUnmatchedDocuments,
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
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Reconciliation</h1>
          <p className="text-sm text-muted-foreground">
            Match bank transactions to confirmed documents
          </p>
        </div>
        <div className="flex items-center gap-3">
          {isPending && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
          <Select value={period} onValueChange={handlePeriodChange}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Time</SelectItem>
              <SelectItem value="this-month">This Month</SelectItem>
              <SelectItem value="last-month">Last Month</SelectItem>
              <SelectItem value="this-quarter">This Quarter</SelectItem>
              <SelectItem value="this-year">This Year</SelectItem>
            </SelectContent>
          </Select>
          <Button render={<Link href="/reconciliation/review" />}>
            Manual Match
            <ArrowRight className="ml-1 size-4" />
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
              {formatAmount(stats.unmatchedAmount)} total
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
                      <span
                        className={`whitespace-nowrap font-mono text-sm ${
                          txn.type === "credit"
                            ? "text-green-600"
                            : "text-red-600"
                        }`}
                      >
                        {txn.type === "debit" ? "-" : "+"}
                        {parseFloat(txn.amount).toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                        })}
                      </span>
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
                      <span className="whitespace-nowrap font-mono text-sm">
                        {formatAmount(doc.totalAmount, doc.currency)}
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
    </div>
  );
}
