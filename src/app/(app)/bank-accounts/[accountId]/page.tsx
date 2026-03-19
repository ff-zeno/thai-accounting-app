import { notFound } from "next/navigation";
import { getActiveOrgId } from "@/lib/utils/org-context";
import { getBankAccountById } from "@/lib/db/queries/bank-accounts";
import {
  getTransactions,
  countTransactions,
  getStatementsWithTxnCount,
} from "@/lib/db/queries/transactions";
import { BankAccountDetail } from "./bank-account-detail";

const BANK_NAMES: Record<string, string> = {
  KBANK: "Kasikorn Bank",
  SCB: "Siam Commercial Bank",
  BBL: "Bangkok Bank",
  KTB: "Krungthai Bank",
  TMB: "TMBThanachart Bank",
  BAY: "Bank of Ayudhya",
  GSB: "Government Savings Bank",
};

const PAGE_SIZE = 50;

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

  const filters = { orgId, bankAccountId: accountId };

  const [{ data: txns, hasMore, nextCursor }, txnCount, statements] = await Promise.all([
    getTransactions(filters, { limit: PAGE_SIZE }),
    countTransactions(filters),
    getStatementsWithTxnCount(orgId, accountId),
  ]);

  return (
    <BankAccountDetail
      bankAccountId={accountId}
      bankName={BANK_NAMES[account.bankCode] ?? account.bankCode}
      accountNumber={account.accountNumber}
      accountName={account.accountName}
      transactions={txns}
      totalCount={txnCount}
      hasMore={hasMore}
      nextCursor={nextCursor}
      statements={statements}
    />
  );
}
