"use client";

import { useState, useTransition } from "react";
import { Brain, Check, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfidenceBadge } from "@/components/reconciliation/confidence-badge";
import {
  approveSuggestionAction,
  rejectSuggestionAction,
  bulkApproveHighConfidenceAction,
} from "@/app/(app)/reconciliation/review/actions";

interface Suggestion {
  id: string;
  transactionId: string;
  documentId: string;
  suggestedAmount: string | null;
  confidence: string;
  explanation: string | null;
  aiModelUsed: string | null;
  txnDate: string;
  txnAmount: string;
  txnCounterparty: string | null;
  txnDescription: string | null;
  docNumber: string | null;
  docAmount: string | null;
  vendorName: string | null;
}

interface Props {
  suggestions: Suggestion[];
}

export function AiSuggestionList({ suggestions }: Props) {
  const [isPending, startTransition] = useTransition();
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [bulkResult, setBulkResult] = useState<string | null>(null);

  function handleApprove(id: string) {
    startTransition(async () => {
      await approveSuggestionAction(id);
    });
  }

  function handleReject(id: string) {
    startTransition(async () => {
      await rejectSuggestionAction(id, rejectReason || undefined);
      setRejectingId(null);
      setRejectReason("");
    });
  }

  function handleBulkApprove() {
    setBulkResult(null);
    startTransition(async () => {
      const res = await bulkApproveHighConfidenceAction("0.90");
      if ("success" in res) {
        setBulkResult(`${res.approvedCount} suggestion${res.approvedCount !== 1 ? "s" : ""} approved`);
      }
    });
  }

  if (suggestions.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <Brain className="mb-3 size-10 text-muted-foreground/40" />
          <p className="text-sm font-medium text-muted-foreground">
            No AI suggestions pending
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            AI suggestions appear when the matching engine finds potential matches
            that need human confirmation.
          </p>
        </CardContent>
      </Card>
    );
  }

  const highConfCount = suggestions.filter(
    (s) => parseFloat(s.confidence) >= 0.9,
  ).length;

  return (
    <div className="space-y-4">
      {/* Bulk actions */}
      {highConfCount > 0 && (
        <div className="flex items-center gap-3">
          <Button onClick={handleBulkApprove} disabled={isPending}>
            Approve All High-Confidence ({highConfCount})
          </Button>
          {bulkResult && (
            <p className="text-sm text-green-600">{bulkResult}</p>
          )}
        </div>
      )}

      {/* Suggestion cards */}
      {suggestions.map((s) => (
        <Card key={s.id} className={isPending ? "opacity-60" : ""}>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold">
                {s.vendorName ?? s.txnCounterparty ?? "Unknown"}
              </CardTitle>
              <ConfidenceBadge confidence={s.confidence} />
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Transaction + Document side by side */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-md border p-3">
                <p className="mb-1 text-xs font-medium text-muted-foreground">
                  Transaction
                </p>
                <p className="text-sm font-medium">
                  {s.txnDescription || s.txnCounterparty || "No description"}
                </p>
                <div className="mt-1 flex gap-3 text-xs text-muted-foreground">
                  <span>{s.txnDate}</span>
                  <span className="tabular-nums font-medium">
                    {parseFloat(s.txnAmount).toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                    })}{" "}
                    THB
                  </span>
                </div>
              </div>
              <div className="rounded-md border p-3">
                <p className="mb-1 text-xs font-medium text-muted-foreground">
                  Document
                </p>
                <p className="text-sm font-medium">
                  {s.vendorName ?? "Unknown vendor"}
                  {s.docNumber && (
                    <span className="ml-1 text-muted-foreground">
                      #{s.docNumber}
                    </span>
                  )}
                </p>
                {s.docAmount && (
                  <p className="mt-1 text-xs tabular-nums text-muted-foreground">
                    {parseFloat(s.docAmount).toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                    })}{" "}
                    THB
                  </p>
                )}
              </div>
            </div>

            {/* AI explanation */}
            {s.explanation && (
              <p className="text-sm text-muted-foreground">{s.explanation}</p>
            )}

            {/* Model used */}
            {s.aiModelUsed && (
              <p className="text-xs text-muted-foreground/60">
                Model: {s.aiModelUsed}
              </p>
            )}

            {/* Reject reason input */}
            {rejectingId === s.id && (
              <div className="flex gap-2">
                <Input
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Rejection reason (optional)"
                  maxLength={500}
                  className="flex-1"
                />
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={isPending}
                  onClick={() => handleReject(s.id)}
                >
                  Confirm Reject
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setRejectingId(null);
                    setRejectReason("");
                  }}
                >
                  Cancel
                </Button>
              </div>
            )}

            {/* Action buttons */}
            {rejectingId !== s.id && (
              <div className="flex gap-2">
                <Button
                  size="sm"
                  disabled={isPending}
                  onClick={() => handleApprove(s.id)}
                >
                  <Check className="mr-1.5 size-3.5" />
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={isPending}
                  onClick={() => setRejectingId(s.id)}
                >
                  <X className="mr-1.5 size-3.5" />
                  Reject
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
