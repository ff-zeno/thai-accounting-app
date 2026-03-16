import { notFound } from "next/navigation";
import { getActiveOrgId } from "@/lib/utils/org-context";
import { getBankAccountById } from "@/lib/db/queries/bank-accounts";
import {
  getTransactions,
  getStatementsByAccount,
} from "@/lib/db/queries/transactions";
import { TransactionTable } from "./transaction-table";
import { StatementUpload } from "./statement-upload";
import { Badge } from "@/components/ui/badge";

const BANK_NAMES: Record<string, string> = {
  KBANK: "Kasikorn Bank",
  SCB: "Siam Commercial Bank",
  BBL: "Bangkok Bank",
  KTB: "Krungthai Bank",
  TMB: "TMBThanachart Bank",
  BAY: "Bank of Ayudhya",
  GSB: "Government Savings Bank",
};

export default async function BankAccountDetailPage({
  params,
}: {
  params: Promise<{ accountId: string }>;
}) {
  const { accountId } = await params;
  const orgId = await getActiveOrgId();
  if (!orgId) notFound();

  const account = await getBankAccountById(orgId, accountId);
  if (!account) notFound();

  const [{ data: txns, hasMore }, statements] = await Promise.all([
    getTransactions({ orgId, bankAccountId: accountId }),
    getStatementsByAccount(orgId, accountId),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">
          {BANK_NAMES[account.bankCode] ?? account.bankCode}
        </h1>
        <p className="text-muted-foreground">
          {account.accountNumber}
          {account.accountName && ` — ${account.accountName}`}
        </p>
      </div>

      <div className="flex items-center gap-2">
        <Badge variant="secondary">
          {statements.length} statement{statements.length !== 1 ? "s" : ""}
        </Badge>
        <Badge variant="secondary">
          {txns.length}
          {hasMore ? "+" : ""} transactions
        </Badge>
      </div>

      <StatementUpload bankAccountId={accountId} />

      <TransactionTable
        transactions={txns}
        hasMore={hasMore}
        bankAccountId={accountId}
      />
    </div>
  );
}
