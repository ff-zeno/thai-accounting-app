"use client";

import { useState, useTransition } from "react";
import { Trash2, Loader2, FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { deleteStatementAction } from "./actions";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import type { Statement } from "./types";

function statusBadge(status: string | null) {
  if (!status) return <Badge variant="secondary" className="text-xs">—</Badge>;
  return (
    <StatusBadge
      status={status}
      className="text-xs"
      label={status === "completed_with_warning" ? "Warning" : undefined}
    />
  );
}

export function StatementTable({
  statements,
}: {
  statements: Statement[];
}) {
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  if (statements.length === 0) {
    return (
      <EmptyState
        size="sm"
        icon={<FileText />}
        title="No statements yet"
        description="Upload a bank statement above to get started."
      />
    );
  }

  function handleDelete(statementId: string) {
    startTransition(async () => {
      const result = await deleteStatementAction(statementId);
      setConfirmId(null);
      if ("error" in result) {
        toast.error(result.error);
      } else {
        toast.success("Statement deleted");
        router.refresh();
      }
    });
  }

  const confirmStmt = statements.find((s) => s.id === confirmId);

  return (
    <>
      <div className="overflow-hidden rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Period</TableHead>
              <TableHead>Uploaded</TableHead>
              <TableHead>Parser</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Transactions</TableHead>
              <TableHead className="w-[60px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {statements.map((stmt) => (
              <TableRow key={stmt.id}>
                <TableCell className="text-sm">
                  {stmt.periodStart} — {stmt.periodEnd}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {stmt.createdAt.toLocaleDateString()}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {stmt.parserUsed ?? "—"}
                </TableCell>
                <TableCell>{statusBadge(stmt.importStatus)}</TableCell>
                <TableCell className="text-right text-sm tabular-nums">
                  {stmt.txnCount}
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => setConfirmId(stmt.id)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!confirmId} onOpenChange={(open) => !open && setConfirmId(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Statement</DialogTitle>
            <DialogDescription>
              This will remove the statement and its{" "}
              {confirmStmt?.txnCount ?? 0} transaction
              {confirmStmt?.txnCount !== 1 ? "s" : ""}. You can re-import the
              statement later by uploading the file again.
            </DialogDescription>
          </DialogHeader>
          {confirmStmt && (
            <div className="rounded-md bg-muted p-3 text-sm">
              <p>
                <span className="font-medium">Period:</span>{" "}
                {confirmStmt.periodStart} to {confirmStmt.periodEnd}
              </p>
              <p>
                <span className="font-medium">Transactions:</span>{" "}
                {confirmStmt.txnCount}
              </p>
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setConfirmId(null)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => confirmId && handleDelete(confirmId)}
              disabled={isPending}
            >
              {isPending ? (
                <>
                  <Loader2 className="mr-1 size-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete Statement"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
