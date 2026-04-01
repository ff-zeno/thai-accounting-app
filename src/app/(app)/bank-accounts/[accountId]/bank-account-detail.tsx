"use client";

import { useState, useRef, useEffect } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Pencil, Check, X } from "lucide-react";
import { TransactionTable } from "./transaction-table";
import { StatementUpload } from "./statement-upload";
import { StatementTable } from "./statement-table";
import { DeleteAccountButton } from "./delete-account-button";
import { renameAccountAction } from "./actions";
import type { Transaction, Statement } from "./types";

interface BankAccountDetailProps {
  bankAccountId: string;
  bankName: string;
  accountNumber: string;
  accountName: string | null;
  transactions: Transaction[];
  totalCount: number;
  hasMore: boolean;
  nextCursor: { date: string; id: string } | null;
  statements: Statement[];
}

function InlineRename({
  bankAccountId,
  accountName,
}: {
  bankAccountId: string;
  accountName: string | null;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(accountName ?? "");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    const result = await renameAccountAction(bankAccountId, name);
    setSaving(false);
    if ("success" in result) {
      setEditing(false);
    }
  }

  function handleCancel() {
    setName(accountName ?? "");
    setEditing(false);
  }

  if (editing) {
    return (
      <span className="flex items-center gap-1">
        <span>—</span>
        <Input
          ref={inputRef}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSave();
            if (e.key === "Escape") handleCancel();
          }}
          className="h-7 w-56 text-sm"
          placeholder="Account name"
          disabled={saving}
        />
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7"
          onClick={handleSave}
          disabled={saving || !name.trim()}
        >
          <Check className="h-3.5 w-3.5" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7"
          onClick={handleCancel}
          disabled={saving}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </span>
    );
  }

  return (
    <span className="flex items-center gap-1">
      {accountName && <span>— {accountName}</span>}
      <Button
        size="icon"
        variant="ghost"
        className="h-7 w-7 text-muted-foreground hover:text-foreground"
        onClick={() => setEditing(true)}
        title="Rename account"
      >
        <Pencil className="h-3.5 w-3.5" />
      </Button>
    </span>
  );
}

export function BankAccountDetail({
  bankAccountId,
  bankName,
  accountNumber,
  accountName,
  transactions,
  totalCount,
  hasMore,
  nextCursor,
  statements,
}: BankAccountDetailProps) {
  return (
    <Tabs defaultValue="transactions" className="space-y-6">
      {/* Header row: bank info | tabs | delete button */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-6">
          <div>
            <h1 className="text-2xl font-semibold">{bankName}</h1>
            <div className="flex items-center gap-2 text-muted-foreground">
              <span>{accountNumber}</span>
              <InlineRename bankAccountId={bankAccountId} accountName={accountName} />
            </div>
          </div>
          <TabsList>
            <TabsTrigger value="transactions">Transactions</TabsTrigger>
            <TabsTrigger value="statements">Statements</TabsTrigger>
          </TabsList>
        </div>
        <DeleteAccountButton
          accountId={bankAccountId}
          hasStatements={statements.length > 0}
        />
      </div>

      {/* Badges */}
      <div className="flex items-center gap-2">
        <Badge variant="secondary">
          {statements.length} statement{statements.length !== 1 ? "s" : ""}
        </Badge>
        <Badge variant="secondary">
          {totalCount} transaction{totalCount !== 1 ? "s" : ""}
        </Badge>
      </div>

      {/* Tab content */}
      <TabsContent value="transactions">
        <TransactionTable
          transactions={transactions}
          totalCount={totalCount}
          hasMore={hasMore}
          nextCursor={nextCursor}
          bankAccountId={bankAccountId}
        />
      </TabsContent>

      <TabsContent value="statements">
        <div className="space-y-4">
          <StatementUpload bankAccountId={bankAccountId} />
          <StatementTable statements={statements} />
        </div>
      </TabsContent>
    </Tabs>
  );
}
