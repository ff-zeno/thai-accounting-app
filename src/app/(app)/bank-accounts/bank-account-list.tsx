"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Plus, Landmark } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createBankAccountAction } from "./actions";

const THAI_BANKS = [
  { code: "KBANK", name: "Kasikorn Bank" },
  { code: "SCB", name: "Siam Commercial Bank" },
  { code: "BBL", name: "Bangkok Bank" },
  { code: "KTB", name: "Krungthai Bank" },
  { code: "TMB", name: "TMBThanachart Bank" },
  { code: "BAY", name: "Bank of Ayudhya (Krungsri)" },
  { code: "GSB", name: "Government Savings Bank" },
  { code: "OTHER", name: "Other" },
];

interface Account {
  id: string;
  bankCode: string;
  accountNumber: string;
  accountName: string | null;
  currency: string | null;
  currentBalance: string | null;
}

export function BankAccountList({ accounts }: { accounts: Account[] }) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleCreate(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await createBankAccountAction(formData);
      if (result.error) {
        setError(result.error);
      } else {
        setDialogOpen(false);
      }
    });
  }

  const bankName = (code: string) =>
    THAI_BANKS.find((b) => b.code === code)?.name ?? code;

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {accounts.map((account) => (
          <Link key={account.id} href={`/bank-accounts/${account.id}`}>
            <Card className="transition-colors hover:bg-accent/50">
              <CardContent className="flex items-start gap-3 p-4">
                <Landmark className="mt-0.5 size-5 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{bankName(account.bankCode)}</p>
                  <p className="text-sm text-muted-foreground">
                    {account.accountNumber}
                  </p>
                  {account.accountName && (
                    <p className="truncate text-sm text-muted-foreground">
                      {account.accountName}
                    </p>
                  )}
                </div>
                <span className="text-xs text-muted-foreground">
                  {account.currency ?? "THB"}
                </span>
              </CardContent>
            </Card>
          </Link>
        ))}

        <button
          onClick={() => setDialogOpen(true)}
          className="flex items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 text-muted-foreground transition-colors hover:border-primary hover:text-primary"
        >
          <Plus className="size-5" />
          Add Bank Account
        </button>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Bank Account</DialogTitle>
          </DialogHeader>
          <form action={handleCreate} className="space-y-4">
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="space-y-2">
              <Label htmlFor="bankCode">Bank</Label>
              <Select name="bankCode" required>
                <SelectTrigger>
                  <SelectValue placeholder="Select a bank" />
                </SelectTrigger>
                <SelectContent>
                  {THAI_BANKS.map((bank) => (
                    <SelectItem key={bank.code} value={bank.code}>
                      {bank.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="accountNumber">Account Number</Label>
              <Input id="accountNumber" name="accountNumber" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="accountName">Account Name</Label>
              <Input id="accountName" name="accountName" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="currency">Currency</Label>
              <Input
                id="currency"
                name="currency"
                defaultValue="THB"
                maxLength={3}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? "Creating..." : "Add Account"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
