"use client";

import { useTransition } from "react";
import { Check, Link2Off, Wallet } from "lucide-react";

import { Amount } from "@/components/ui/amount";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { TableCard } from "@/components/ui/table-card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ConfidenceBadge } from "@/components/reconciliation/confidence-badge";
import { getSimplifiedExplanation } from "@/lib/reconciliation/match-display";
import type { MatchMetadata } from "@/lib/reconciliation/matcher";
import {
  confirmPayoutMatchAction,
  rejectPayoutMatchAction,
} from "./actions";

export interface PayoutQueueRow {
  id: string;
  processor: string;
  externalId: string;
  periodEnd: Date | null;
  grossAmount: string;
  netPayout: string;
  reconciliationStatus: string;
  reconciliationDiscrepancy: string | null;
  matchConfidence: string | null;
  matchMetadata: unknown;
  transactionId: string | null;
  transactionDate: string | null;
  transactionAmount: string | null;
  transactionDescription: string | null;
  transactionCounterparty: string | null;
}

function explain(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const candidate = metadata as Partial<MatchMetadata>;
  if (typeof candidate.layer !== "string" || !candidate.signals) return null;
  return getSimplifiedExplanation(candidate as MatchMetadata);
}

function describeDeposit(row: PayoutQueueRow): string {
  const parts = [
    row.transactionDate,
    row.transactionCounterparty ?? row.transactionDescription,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : "—";
}

/**
 * The payout match queue.
 *
 * A settlement is only ever evidence that a deposit is explained. The gross
 * column stays on screen next to the net so the row cannot be read as an income
 * figure — output VAT is owed on gross, whatever the bank received.
 */
export function PayoutQueue({ rows }: { rows: PayoutQueueRow[] }) {
  const [isPending, startTransition] = useTransition();

  if (rows.length === 0) {
    return (
      <TableCard tone="bank">
        <EmptyState
          icon={<Wallet />}
          title="No payouts to match"
          description="Import a processor settlement report and its deposits will be claimed here."
        />
      </TableCard>
    );
  }

  function handleConfirm(id: string) {
    startTransition(async () => {
      await confirmPayoutMatchAction(id);
    });
  }

  function handleReject(id: string) {
    startTransition(async () => {
      await rejectPayoutMatchAction(id);
    });
  }

  return (
    <TableCard
      tone="bank"
      title="Payout matches"
      description="Which bank deposit each settlement explains"
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Settlement</TableHead>
            <TableHead className="text-right">Gross</TableHead>
            <TableHead className="text-right">Net to bank</TableHead>
            <TableHead>Deposit</TableHead>
            <TableHead className="text-right">Deposit amount</TableHead>
            <TableHead>Why</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Review</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const reason = explain(row.matchMetadata);
            return (
              <TableRow key={row.id}>
                <TableCell>
                  <div className="font-medium">{row.processor}</div>
                  <div className="text-muted-foreground text-xs">
                    {row.externalId}
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground text-right">
                  <Amount value={row.grossAmount} />
                </TableCell>
                <TableCell className="text-right font-medium">
                  <Amount value={row.netPayout} />
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {describeDeposit(row)}
                </TableCell>
                <TableCell className="text-right">
                  {row.transactionAmount ? (
                    <Amount value={row.transactionAmount} />
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground max-w-64 text-xs">
                  {reason ?? "—"}
                  {row.reconciliationDiscrepancy &&
                  row.reconciliationDiscrepancy !== "0.00" ? (
                    <div className="text-warning">
                      Off by <Amount value={row.reconciliationDiscrepancy} />
                    </div>
                  ) : null}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={row.reconciliationStatus} />
                    {row.matchConfidence ? (
                      <ConfidenceBadge confidence={row.matchConfidence} />
                    ) : null}
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  {row.reconciliationStatus === "suggested" ? (
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        disabled={isPending}
                        onClick={() => handleConfirm(row.id)}
                      >
                        <Check className="mr-1 size-4" />
                        Confirm
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={isPending}
                        onClick={() => handleReject(row.id)}
                      >
                        <Link2Off className="mr-1 size-4" />
                        Reject
                      </Button>
                    </div>
                  ) : row.transactionId ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={isPending}
                      onClick={() => handleReject(row.id)}
                    >
                      <Link2Off className="mr-1 size-4" />
                      Unmatch
                    </Button>
                  ) : (
                    <span className="text-muted-foreground text-xs">
                      No deposit found
                    </span>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableCard>
  );
}
