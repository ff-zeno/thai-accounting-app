import Link from "next/link";
import { BookOpen } from "lucide-react";
import { getActiveOrgId } from "@/lib/utils/org-context";
import {
  getGeneralLedgerDetail,
  getGlAccounts,
  seedStandardGlAccounts,
} from "@/lib/db/queries/general-ledger";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function amount(value: string | null | undefined) {
  return Number(value ?? 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function dateParam(value: string | undefined) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value ?? "") ? value : undefined;
}

function signedLineAmount(row: {
  accountType: string;
  debitAmount: string;
  creditAmount: string;
}) {
  const debit = Number(row.debitAmount);
  const credit = Number(row.creditAmount);
  if (["liability", "equity", "revenue", "contra_asset"].includes(row.accountType)) {
    return credit - debit;
  }
  return debit - credit;
}

export default async function GeneralLedgerReportPage({
  searchParams,
}: {
  searchParams: Promise<{ accountId?: string; startDate?: string; endDate?: string }>;
}) {
  const [{ accountId, startDate: rawStartDate, endDate: rawEndDate }, orgId] =
    await Promise.all([searchParams, getActiveOrgId()]);
  const startDate = dateParam(rawStartDate);
  const endDate = dateParam(rawEndDate);
  const rows = orgId
    ? await getGeneralLedgerDetail(orgId, { accountId, startDate, endDate })
    : [];
  if (orgId) await seedStandardGlAccounts(orgId);
  const accounts = orgId ? await getGlAccounts(orgId) : [];
  const selectedAccount = accounts.find((account) => account.id === accountId);
  const exportParams = new URLSearchParams();
  if (accountId) exportParams.set("accountId", accountId);
  if (startDate) exportParams.set("startDate", startDate);
  if (endDate) exportParams.set("endDate", endDate);
  const exportHref = `/api/accounting/general-ledger.csv${
    exportParams.size ? `?${exportParams.toString()}` : ""
  }`;
  let running = 0;
  const runningBalances = new Map<string, string>();
  if (selectedAccount) {
    for (const row of rows) {
      running += signedLineAmount(row);
      runningBalances.set(row.lineId, running.toFixed(2));
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">General Ledger Detail</h1>
        <p className="text-sm text-muted-foreground">
          Line-level ledger detail with journal and source references.
        </p>
      </div>

      {!orgId ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-2 py-12 text-center">
            <BookOpen className="size-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Select an organization to view ledger detail.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Account Filter</CardTitle>
            </CardHeader>
            <CardContent>
              <form
                className="grid gap-3 md:grid-cols-[minmax(0,1fr)_repeat(2,10rem)_auto]"
                action="/accounting/reports/general-ledger"
              >
                <select
                  name="accountId"
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                  defaultValue={accountId ?? ""}
                >
                  <option value="">All accounts</option>
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.accountCode} {account.nameEn}
                    </option>
                  ))}
                </select>
                <Input name="startDate" type="date" defaultValue={startDate ?? ""} />
                <Input name="endDate" type="date" defaultValue={endDate ?? ""} />
                <button
                  type="submit"
                  className="h-9 rounded-md border border-input px-3 text-sm hover:bg-muted"
                >
                  Filter
                </button>
              </form>
              {selectedAccount ? (
                <p className="mt-2 text-sm text-muted-foreground">
                  Showing {selectedAccount.accountCode} {selectedAccount.nameEn}.
                </p>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between gap-3">
                <span>Ledger Lines</span>
                <Link
                  href={exportHref}
                  className="text-sm font-normal text-muted-foreground underline-offset-4 hover:underline"
                >
                  Download CSV
                </Link>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Journal</TableHead>
                    <TableHead>Account</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Debit</TableHead>
                    <TableHead>Credit</TableHead>
                    <TableHead>Running balance</TableHead>
                    <TableHead>Source</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.lineId}>
                      <TableCell>{row.entryDate}</TableCell>
                      <TableCell>
                        <Link
                          href={`/accounting/journal/${row.journalEntryId}`}
                          className="font-medium underline-offset-4 hover:underline"
                        >
                          {row.entryNumber}
                        </Link>
                      </TableCell>
                      <TableCell>
                        {row.accountCode} {row.accountNameEn}
                      </TableCell>
                      <TableCell>{row.description ?? "n/a"}</TableCell>
                      <TableCell>{amount(row.debitAmount)}</TableCell>
                      <TableCell>{amount(row.creditAmount)}</TableCell>
                      <TableCell>
                        {selectedAccount ? amount(runningBalances.get(row.lineId)) : "Select account"}
                      </TableCell>
                      <TableCell>
                        {row.subledgerEntityType
                          ? `${row.subledgerEntityType}:${row.subledgerEntityId ?? ""}`
                          : row.sourceEntityType
                            ? `${row.sourceEntityType}:${row.sourceEntityId ?? ""}`
                            : row.postingKind ?? "manual"}
                      </TableCell>
                    </TableRow>
                  ))}
                  {rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-muted-foreground">
                        No ledger lines yet.
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
