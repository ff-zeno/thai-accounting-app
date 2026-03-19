"use client";

import { useState, useTransition, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft,
  Check,
  AlertTriangle,
  Landmark,
  FileText,
  Loader2,
} from "lucide-react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { createManualMatchAction, getUnmatchedItemsAction } from "./actions";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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
  initialTransactions: UnmatchedTransaction[];
  initialDocuments: UnmatchedDocument[];
}

// ---------------------------------------------------------------------------
// Helpers
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

export function ManualMatch({ initialTransactions, initialDocuments }: Props) {
  const searchParams = useSearchParams();
  const preselectedTxnId = searchParams.get("txnId");
  const preselectedDocId = searchParams.get("docId");

  const [transactions, setTransactions] = useState(initialTransactions);
  const [documents, setDocuments] = useState(initialDocuments);
  const [selectedTxnIds, setSelectedTxnIds] = useState<Set<string>>(() => {
    if (preselectedTxnId && initialTransactions.some((t) => t.id === preselectedTxnId)) {
      return new Set([preselectedTxnId]);
    }
    return new Set();
  });
  const [selectedDocId, setSelectedDocId] = useState<string | null>(
    preselectedDocId && initialDocuments.some((d) => d.id === preselectedDocId)
      ? preselectedDocId
      : null
  );
  const [isPending, startTransition] = useTransition();

  // Compute totals for selected items
  const selectedTxnTotal = useMemo(() => {
    let total = 0;
    for (const id of selectedTxnIds) {
      const txn = transactions.find((t) => t.id === id);
      if (txn) total += parseFloat(txn.amount);
    }
    return total;
  }, [selectedTxnIds, transactions]);

  const selectedDoc = useMemo(() => {
    return documents.find((d) => d.id === selectedDocId) ?? null;
  }, [selectedDocId, documents]);

  const selectedDocTotal = selectedDoc
    ? parseFloat(selectedDoc.totalAmount || "0")
    : 0;

  // Amount difference warning
  const amountDifference =
    selectedTxnIds.size > 0 && selectedDoc
      ? Math.abs(selectedTxnTotal - selectedDocTotal)
      : 0;
  const amountDiffPercent =
    selectedDocTotal > 0 ? (amountDifference / selectedDocTotal) * 100 : 0;
  const hasAmountWarning = amountDiffPercent > 1 && selectedTxnIds.size > 0 && selectedDoc;

  const canMatch = selectedTxnIds.size > 0 && selectedDoc !== null;

  function toggleTransaction(id: string) {
    setSelectedTxnIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function toggleDocument(id: string) {
    setSelectedDocId((prev) => (prev === id ? null : id));
  }

  function handleCreateMatch() {
    if (!canMatch || !selectedDoc) return;

    startTransition(async () => {
      // Build amounts map: each transaction contributes its full amount
      const amounts: Record<string, string> = {};
      for (const txnId of selectedTxnIds) {
        const txn = transactions.find((t) => t.id === txnId);
        if (txn) {
          amounts[txnId] = txn.amount;
        }
      }

      const result = await createManualMatchAction({
        transactionIds: Array.from(selectedTxnIds),
        documentId: selectedDoc.id,
        amounts,
      });

      if ("error" in result) {
        toast.error(result.error);
        return;
      }

      toast.success("Match created successfully");

      // Remove matched items from the lists
      setTransactions((prev) =>
        prev.filter((t) => !selectedTxnIds.has(t.id))
      );
      setDocuments((prev) => prev.filter((d) => d.id !== selectedDoc.id));
      setSelectedTxnIds(new Set());
      setSelectedDocId(null);

      // Refresh data from server
      const fresh = await getUnmatchedItemsAction();
      setTransactions(fresh.transactions as UnmatchedTransaction[]);
      setDocuments(fresh.documents as UnmatchedDocument[]);
    });
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="mb-6 flex items-center gap-4">
        <Button variant="ghost" size="icon" render={<Link href="/reconciliation" />}>
          <ArrowLeft className="size-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Manual Reconciliation
          </h1>
          <p className="text-sm text-muted-foreground">
            Select transaction(s) on the left and a document on the right to
            create a match
          </p>
        </div>
      </div>

      {/* Side-by-side panels */}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Left: Unmatched Transactions */}
        <Card className="flex flex-col overflow-hidden">
          <CardHeader className="border-b">
            <CardTitle className="flex items-center gap-2 text-base">
              <Landmark className="size-4 text-muted-foreground" />
              Unmatched Transactions
              <Badge variant="secondary" className="ml-auto">
                {transactions.length}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto p-0">
            {transactions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Landmark className="mb-2 size-8 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">
                  No unmatched transactions
                </p>
              </div>
            ) : (
              <div className="divide-y">
                {transactions.map((txn) => {
                  const isSelected = selectedTxnIds.has(txn.id);
                  return (
                    <button
                      key={txn.id}
                      type="button"
                      onClick={() => toggleTransaction(txn.id)}
                      className={`flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-muted/50 ${
                        isSelected
                          ? "bg-primary/5 ring-1 ring-inset ring-primary/20"
                          : ""
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          {isSelected && (
                            <div className="flex size-5 items-center justify-center rounded-full bg-primary">
                              <Check className="size-3 text-primary-foreground" />
                            </div>
                          )}
                          <p className="truncate text-sm font-medium">
                            {txn.description || txn.counterparty || "No description"}
                          </p>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {txn.date}
                        </p>
                      </div>
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
                    </button>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Right: Unmatched Documents */}
        <Card className="flex flex-col overflow-hidden">
          <CardHeader className="border-b">
            <CardTitle className="flex items-center gap-2 text-base">
              <FileText className="size-4 text-muted-foreground" />
              Unmatched Documents
              <Badge variant="secondary" className="ml-auto">
                {documents.length}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto p-0">
            {documents.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <FileText className="mb-2 size-8 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">
                  No unmatched documents
                </p>
              </div>
            ) : (
              <div className="divide-y">
                {documents.map((doc) => {
                  const isSelected = selectedDocId === doc.id;
                  return (
                    <button
                      key={doc.id}
                      type="button"
                      onClick={() => toggleDocument(doc.id)}
                      className={`flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-muted/50 ${
                        isSelected
                          ? "bg-primary/5 ring-1 ring-inset ring-primary/20"
                          : ""
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          {isSelected && (
                            <div className="flex size-5 items-center justify-center rounded-full bg-primary">
                              <Check className="size-3 text-primary-foreground" />
                            </div>
                          )}
                          <p className="truncate text-sm font-medium">
                            {doc.vendorName || "Unknown vendor"}
                            {doc.documentNumber && (
                              <span className="ml-2 text-muted-foreground">
                                #{doc.documentNumber}
                              </span>
                            )}
                          </p>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {doc.issueDate || "No date"}
                        </p>
                      </div>
                      <span className="whitespace-nowrap font-mono text-sm">
                        {formatAmount(doc.totalAmount, doc.currency)}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Match Action Bar */}
      {(selectedTxnIds.size > 0 || selectedDoc) && (
        <div className="mt-4 rounded-lg border bg-card p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6">
              {/* Selected transactions summary */}
              <div>
                <p className="text-xs font-medium text-muted-foreground">
                  Selected Transactions ({selectedTxnIds.size})
                </p>
                <p className="font-mono text-lg font-semibold">
                  {formatAmount(selectedTxnTotal.toFixed(2))}
                </p>
              </div>

              {/* Selected document summary */}
              <div>
                <p className="text-xs font-medium text-muted-foreground">
                  Selected Document
                </p>
                <p className="font-mono text-lg font-semibold">
                  {selectedDoc
                    ? formatAmount(selectedDoc.totalAmount, selectedDoc.currency)
                    : "--"}
                </p>
              </div>

              {/* Difference */}
              {selectedTxnIds.size > 0 && selectedDoc && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground">
                    Difference
                  </p>
                  <p
                    className={`font-mono text-lg font-semibold ${
                      amountDifference < 0.01
                        ? "text-green-600"
                        : hasAmountWarning
                          ? "text-destructive"
                          : "text-yellow-600"
                    }`}
                  >
                    {formatAmount(amountDifference.toFixed(2))}
                  </p>
                </div>
              )}
            </div>

            <div className="flex items-center gap-3">
              {hasAmountWarning && (
                <div className="flex items-center gap-1.5 text-sm text-yellow-600">
                  <AlertTriangle className="size-4" />
                  <span>
                    Amounts differ by {amountDiffPercent.toFixed(1)}%
                  </span>
                </div>
              )}

              <Button
                disabled={!canMatch || isPending}
                onClick={handleCreateMatch}
              >
                {isPending ? (
                  <>
                    <Loader2 className="mr-1 size-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Check className="mr-1 size-4" />
                    Create Match
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
