"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { deleteBankAccountAction } from "./actions";
import { toast } from "sonner";

export function DeleteAccountButton({
  accountId,
  hasStatements,
}: {
  accountId: string;
  hasStatements: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteBankAccountAction(accountId);
      setOpen(false);
      if ("error" in result) {
        toast.error(result.error);
      } else {
        toast.success("Bank account deleted");
        router.push("/bank-accounts");
      }
    });
  }

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
        onClick={() => setOpen(true)}
        disabled={hasStatements}
        title={
          hasStatements
            ? "Delete all statements first"
            : "Delete this bank account"
        }
      >
        <Trash2 className="mr-1 size-4" />
        Delete Account
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Bank Account</DialogTitle>
            <DialogDescription>
              This will remove this bank account and all its data. You must
              delete all statements first. The account can be re-created later
              if needed.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={isPending}
            >
              {isPending ? (
                <>
                  <Loader2 className="mr-1 size-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete Account"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
