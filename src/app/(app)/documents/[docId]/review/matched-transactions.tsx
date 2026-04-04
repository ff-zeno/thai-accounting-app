"use client";

import Link from "next/link";
import { useTransition } from "react";
import { GitCompareArrows, Loader2, Undo2 } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfidenceBadge } from "@/components/reconciliation/confidence-badge";
import { toast } from "sonner";
import { undoMatchAction } from "@/app/(app)/reconciliation/review/actions";

interface MatchRow {
  id: string;
  matchedAmount: string | null;
  matchType: string;
  confidence: string | null;
  matchedBy: string;
  matchMetadata: unknown;
  matchedAt: Date | null;
  txnId: string;
  txnDate: string;
  txnAmount: string;
  txnType: string;
  txnCounterparty: string | null;
  txnDescription: string | null;
}

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

export function MatchedTransactions({ matches }: { matches: MatchRow[] }) {
  const totalMatched = matches.reduce(
    (sum, m) => sum + parseFloat(m.matchedAmount ?? "0"),
    0,
  );

  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle className="flex items-center gap-2 text-base">
          <GitCompareArrows className="size-4 text-muted-foreground" />
          Matched Transactions
          <Badge variant="secondary" className="ml-1">
            {matches.length}
          </Badge>
        </CardTitle>
        <CardDescription>
          Total matched: {totalMatched.toLocaleString(undefined, {
            minimumFractionDigits: 2,
          })} THB
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y">
          {matches.map((match) => (
            <div
              key={match.id}
              className="flex items-center justify-between gap-4 px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-medium">
                    {match.txnCounterparty || match.txnDescription || "Unknown"}
                  </p>
                  <Badge variant="outline" className="text-[10px]">
                    {match.matchType.replace("_", " ")}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {match.txnDate}
                  {match.matchedAt && (
                    <> · matched {new Date(match.matchedAt).toLocaleDateString()}</>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`whitespace-nowrap font-mono text-sm tabular-nums ${
                    match.txnType === "credit" ? "text-green-600" : "text-red-600"
                  }`}
                >
                  {match.txnType === "debit" ? "-" : "+"}
                  {parseFloat(match.txnAmount).toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                  })}
                </span>
                {match.confidence && (
                  <ConfidenceBadge confidence={match.confidence} />
                )}
                <UndoButton matchId={match.id} />
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
