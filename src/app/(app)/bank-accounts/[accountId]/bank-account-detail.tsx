"use client";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { TransactionTable } from "./transaction-table";
import { StatementUpload } from "./statement-upload";
import { StatementTable } from "./statement-table";
import { DeleteAccountButton } from "./delete-account-button";
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
            <p className="text-muted-foreground">
              {accountNumber}
              {accountName && ` — ${accountName}`}
            </p>
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
