import { getActiveOrgId } from "@/lib/utils/org-context";
import { getBankAccountsByOrg } from "@/lib/db/queries/bank-accounts";
import { BankAccountList } from "./bank-account-list";

export default async function BankAccountsPage() {
  const orgId = await getActiveOrgId();
  if (!orgId) {
    return (
      <div className="py-20 text-center text-muted-foreground">
        Select an organization to view bank accounts.
      </div>
    );
  }

  const accounts = await getBankAccountsByOrg(orgId);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Bank Accounts</h1>
      <BankAccountList accounts={accounts} />
    </div>
  );
}
