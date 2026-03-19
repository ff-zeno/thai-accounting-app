"use client";

import { useState, useTransition, useMemo } from "react";
import Link from "next/link";
import { Plus, Landmark, Search } from "lucide-react";
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
import { toast } from "sonner";
import {
  validateBankAccountNumber,
  validateName,
  formatBankAccountNumber,
  COMMON_CURRENCIES,
} from "@/lib/utils/validators";

// ---------------------------------------------------------------------------
// Bank catalog with colors for visual identification
// ---------------------------------------------------------------------------

const THAI_BANKS = [
  { code: "KBANK", name: "Kasikorn Bank", nameTh: "กสิกรไทย", color: "bg-green-600" },
  { code: "SCB", name: "Siam Commercial Bank", nameTh: "ไทยพาณิชย์", color: "bg-purple-600" },
  { code: "BBL", name: "Bangkok Bank", nameTh: "กรุงเทพ", color: "bg-blue-700" },
  { code: "KTB", name: "Krungthai Bank", nameTh: "กรุงไทย", color: "bg-sky-600" },
  { code: "TMB", name: "TMBThanachart Bank", nameTh: "ทหารไทยธนชาต", color: "bg-orange-500" },
  { code: "BAY", name: "Bank of Ayudhya", nameTh: "กรุงศรี", color: "bg-yellow-500" },
  { code: "GSB", name: "Government Savings Bank", nameTh: "ออมสิน", color: "bg-pink-600" },
  { code: "CIMB", name: "CIMB Thai", nameTh: "ซีไอเอ็มบี ไทย", color: "bg-red-700" },
  { code: "UOB", name: "UOB Thailand", nameTh: "ยูโอบี", color: "bg-blue-900" },
  { code: "LHBANK", name: "Land and Houses Bank", nameTh: "แลนด์ แอนด์ เฮ้าส์", color: "bg-emerald-600" },
  { code: "OTHER", name: "Other", nameTh: "อื่นๆ", color: "bg-gray-500" },
] as const;

function BankIcon({ code, size = "md" }: { code: string; size?: "sm" | "md" }) {
  const bank = THAI_BANKS.find((b) => b.code === code);
  const color = bank?.color ?? "bg-gray-500";
  const sizeClass = size === "sm" ? "size-6 text-[10px]" : "size-8 text-xs";
  // Show first 2-3 chars as abbreviation
  const abbr = code.length <= 3 ? code : code.slice(0, 2);

  return (
    <span
      className={`inline-flex items-center justify-center rounded-md font-bold text-white ${color} ${sizeClass}`}
    >
      {abbr}
    </span>
  );
}

function bankName(code: string) {
  return THAI_BANKS.find((b) => b.code === code)?.name ?? code;
}

// ---------------------------------------------------------------------------
// Account number input with digit-only + auto-format
// ---------------------------------------------------------------------------

function AccountNumberInput({
  value,
  onChange,
  error,
}: {
  value: string;
  onChange: (v: string) => void;
  error?: string;
}) {
  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    // Only allow digits, dashes, spaces
    const raw = e.target.value.replace(/[^\d\s-]/g, "");
    onChange(raw);
  }

  const formatted = value ? formatBankAccountNumber(value) : "";

  return (
    <div className="space-y-1">
      <Input
        id="accountNumber"
        name="accountNumber"
        required
        value={value}
        onChange={handleChange}
        placeholder="e.g. 123-4-56789-0"
        inputMode="numeric"
      />
      {value && formatted !== value.replace(/\D/g, "") && (
        <p className="text-xs text-muted-foreground">
          Formatted: {formatted}
        </p>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Searchable bank picker
// ---------------------------------------------------------------------------

function BankPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(
    () =>
      THAI_BANKS.filter(
        (b) =>
          !search ||
          b.name.toLowerCase().includes(search.toLowerCase()) ||
          b.nameTh.includes(search) ||
          b.code.toLowerCase().includes(search.toLowerCase())
      ),
    [search]
  );

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search banks..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>
      <div className="grid max-h-[200px] gap-1 overflow-y-auto rounded-md border p-1">
        {filtered.map((bank) => (
          <button
            key={bank.code}
            type="button"
            onClick={() => {
              onChange(bank.code);
              setSearch("");
            }}
            className={`flex items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-accent ${
              value === bank.code
                ? "bg-accent font-medium"
                : ""
            }`}
          >
            <BankIcon code={bank.code} size="sm" />
            <div className="flex-1">
              <p className="font-medium">{bank.name}</p>
              <p className="text-xs text-muted-foreground">{bank.nameTh}</p>
            </div>
            {value === bank.code && (
              <span className="size-2 rounded-full bg-primary" />
            )}
          </button>
        ))}
        {filtered.length === 0 && (
          <p className="py-4 text-center text-xs text-muted-foreground">
            No banks found
          </p>
        )}
      </div>
      {/* Hidden input for form submission */}
      <input type="hidden" name="bankCode" value={value} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

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
  const [bankCode, setBankCode] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountNumError, setAccountNumError] = useState<string | null>(null);

  function resetForm() {
    setBankCode("");
    setAccountNumber("");
    setAccountNumError(null);
    setError(null);
  }

  function handleCreate(formData: FormData) {
    setError(null);

    // Client-side validation
    if (!bankCode) {
      setError("Please select a bank");
      return;
    }

    const acctValidation = validateBankAccountNumber(accountNumber);
    if (!acctValidation.valid) {
      setAccountNumError(acctValidation.message!);
      return;
    }

    const nameVal = formData.get("accountName") as string;
    if (nameVal) {
      const nameValidation = validateName(nameVal);
      if (!nameValidation.valid) {
        setError(nameValidation.message!);
        return;
      }
    }

    startTransition(async () => {
      const result = await createBankAccountAction(formData);
      if (result.error) {
        setError(result.error);
      } else {
        setDialogOpen(false);
        resetForm();
        toast.success("Bank account added");
      }
    });
  }

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {accounts.map((account) => (
          <Link key={account.id} href={`/bank-accounts/${account.id}`}>
            <Card className="cursor-pointer transition-colors hover:bg-accent/50">
              <CardContent className="flex items-start gap-3 p-4">
                <BankIcon code={account.bankCode} />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{bankName(account.bankCode)}</p>
                  <p className="font-mono text-sm text-muted-foreground">
                    {formatBankAccountNumber(account.accountNumber)}
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
          onClick={() => {
            resetForm();
            setDialogOpen(true);
          }}
          className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 text-muted-foreground transition-colors hover:border-primary hover:bg-accent/50 hover:text-primary"
        >
          <Plus className="size-5" />
          Add Bank Account
        </button>
      </div>

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) resetForm();
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Bank Account</DialogTitle>
          </DialogHeader>
          <form action={handleCreate} className="space-y-4">
            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="space-y-2">
              <Label>Bank</Label>
              <BankPicker value={bankCode} onChange={setBankCode} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="accountNumber">Account Number</Label>
              <AccountNumberInput
                value={accountNumber}
                onChange={(v) => {
                  setAccountNumber(v);
                  setAccountNumError(null);
                }}
                error={accountNumError ?? undefined}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="accountName">Account Name</Label>
              <Input id="accountName" name="accountName" placeholder="e.g. Main Business Account" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="currency">Currency</Label>
              <Select name="currency" defaultValue="THB">
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COMMON_CURRENCIES.map((code) => (
                    <SelectItem key={code} value={code}>
                      {code}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
