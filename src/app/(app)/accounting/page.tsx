import Link from "next/link";
import { AlertTriangle, BookOpen } from "lucide-react";
import { getActiveOrgId } from "@/lib/utils/org-context";
import { getGeneralLedgerDashboard } from "@/lib/db/queries/general-ledger";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  createManualJournalPairAction,
  lockGlPeriodAction,
  postOpeningBalancePairAction,
  reverseJournalEntryAction,
} from "./actions";

async function submitOpeningBalance(formData: FormData) {
  "use server";
  await postOpeningBalancePairAction(formData);
}

async function submitManualJournal(formData: FormData) {
  "use server";
  await createManualJournalPairAction(formData);
}

async function submitReversal(formData: FormData) {
  "use server";
  await reverseJournalEntryAction(formData);
}

async function submitGlPeriodLock(formData: FormData) {
  "use server";
  await lockGlPeriodAction(formData);
}

function amount(value: string | null | undefined) {
  return Number(value ?? 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default async function AccountingPage() {
  const orgId = await getActiveOrgId();
  const dashboard = orgId ? await getGeneralLedgerDashboard(orgId) : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">General Ledger</h1>
        <p className="text-sm text-muted-foreground">
          Chart of accounts, opening balances, journal entries, and trial-balance spine.
        </p>
      </div>

      {!orgId || !dashboard ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-2 py-12 text-center">
            <BookOpen className="size-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Select an organization to view the general ledger.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card className="border-amber-200 bg-amber-50 text-amber-950">
            <CardContent className="flex gap-3 py-4 text-sm">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <div>
                <p className="font-medium">General ledger is compact v1.</p>
                <p className="mt-1 text-amber-900">
                  Chart of accounts, paired opening balances, two-line manual journals, reversals,
                  posting queue, close readiness, CSV reports, and drill-through are testable.
                  Bulk opening balance import, advanced journal grids, richer statement drilldowns,
                  and full close workflow orchestration remain deferred.
                </p>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Accounts</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold">
                  {dashboard.summary.accountCount}
                </div>
                <p className="text-xs text-muted-foreground">
                  {dashboard.summary.postableAccountCount} postable.
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between gap-3 text-sm">
                  <span>Journal Entries</span>
                  <Link
                    href="/accounting/reports/trial-balance"
                    className="font-normal text-muted-foreground underline-offset-4 hover:underline"
                  >
                    Trial balance
                  </Link>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold">
                  {dashboard.summary.entryCount}
                </div>
                <p className="text-xs text-muted-foreground">
                  Balanced by database invariant.
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Opening Balance</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold">Ready</div>
                <p className="text-xs text-muted-foreground">
                  Posts paired debit/credit lines.
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Assets</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold">
                  {amount(dashboard.statements.balanceSheet.assets)}
                </div>
                <p className="text-xs text-muted-foreground">
                  As of {dashboard.statements.asOfDate}.
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Liabilities + Equity</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold">
                  {amount(
                    String(
                      Number(dashboard.statements.balanceSheet.liabilities) +
                        Number(dashboard.statements.balanceSheet.equity)
                    )
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Current net income shown separately.
                </p>
                <Link
                  href="/accounting/reports/balance-sheet"
                  className="mt-2 block text-xs text-muted-foreground underline-offset-4 hover:underline"
                >
                  Open balance sheet
                </Link>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Revenue</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold">
                  {amount(dashboard.statements.profitAndLoss.revenue)}
                </div>
                <p className="text-xs text-muted-foreground">Year-to-date.</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Net Income</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold">
                  {amount(dashboard.statements.profitAndLoss.netIncome)}
                </div>
                <p className="text-xs text-muted-foreground">
                  P&L summary from journal lines.
                </p>
                <Link
                  href="/accounting/reports/profit-loss"
                  className="mt-2 block text-xs text-muted-foreground underline-offset-4 hover:underline"
                >
                  Open profit and loss
                </Link>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Inventory 1160</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold">
                  {amount(dashboard.inventoryReconciliation.glInventoryBalance)}
                </div>
                <p className="text-xs text-muted-foreground">
                  GL inventory balance as of {dashboard.inventoryReconciliation.asOfDate}.
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">SKU Inventory</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold">
                  {amount(dashboard.inventoryReconciliation.skuCurrentValue)}
                </div>
                <p className="text-xs text-muted-foreground">
                  Sum of SKU current value.
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Inventory Variance</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold">
                  {amount(dashboard.inventoryReconciliation.variance)}
                </div>
                <p className="text-xs text-muted-foreground">
                  GL 1160 minus SKU value.
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Post Opening Balance Pair</CardTitle>
            </CardHeader>
            <CardContent>
              <form action={submitOpeningBalance} className="grid gap-4 md:grid-cols-5">
                <div className="space-y-2">
                  <Label htmlFor="asOfDate">As-of date</Label>
                  <Input id="asOfDate" name="asOfDate" type="date" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="debitAccountId">Debit account</Label>
                  <select
                    id="debitAccountId"
                    name="debitAccountId"
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                    defaultValue={dashboard.accounts[0]?.id}
                  >
                    {dashboard.accounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.accountCode} {account.nameEn}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="creditAccountId">Credit account</Label>
                  <select
                    id="creditAccountId"
                    name="creditAccountId"
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                    defaultValue={dashboard.accounts[1]?.id}
                  >
                    {dashboard.accounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.accountCode} {account.nameEn}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="amount">Amount</Label>
                  <Input id="amount" name="amount" inputMode="decimal" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="notes">Notes</Label>
                  <Input id="notes" name="notes" />
                </div>
                <div className="md:col-span-5">
                  <Button type="submit">Post Opening Balance</Button>
                </div>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Post Manual Journal Pair</CardTitle>
            </CardHeader>
            <CardContent>
              <form action={submitManualJournal} className="grid gap-4 md:grid-cols-5">
                <div className="space-y-2">
                  <Label htmlFor="entryDate">Entry date</Label>
                  <Input id="entryDate" name="entryDate" type="date" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="manualDebitAccountId">Debit account</Label>
                  <select
                    id="manualDebitAccountId"
                    name="manualDebitAccountId"
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                    defaultValue={dashboard.accounts[0]?.id}
                  >
                    {dashboard.accounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.accountCode} {account.nameEn}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="manualCreditAccountId">Credit account</Label>
                  <select
                    id="manualCreditAccountId"
                    name="manualCreditAccountId"
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                    defaultValue={dashboard.accounts[1]?.id}
                  >
                    {dashboard.accounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.accountCode} {account.nameEn}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="manualAmount">Amount</Label>
                  <Input id="manualAmount" name="manualAmount" inputMode="decimal" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Input id="description" name="description" required />
                </div>
                <div className="space-y-2 md:col-span-4">
                  <Label htmlFor="manualNotes">Notes</Label>
                  <Input id="manualNotes" name="manualNotes" />
                </div>
                <div className="flex items-end">
                  <Button type="submit">Post Manual Journal</Button>
                </div>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Reverse Journal Entry</CardTitle>
            </CardHeader>
            <CardContent>
              <form action={submitReversal} className="grid gap-4 md:grid-cols-4">
                <div className="space-y-2">
                  <Label htmlFor="journalEntryId">Journal entry</Label>
                  <select
                    id="journalEntryId"
                    name="journalEntryId"
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                    defaultValue={dashboard.recentEntries[0]?.id}
                  >
                    {dashboard.recentEntries
                      .filter((entry) => !entry.isReversal && !entry.reversedByEntryId)
                      .map((entry) => (
                        <option key={entry.id} value={entry.id}>
                          {entry.entryNumber} {entry.description}
                        </option>
                      ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reversalDate">Reversal date</Label>
                  <Input id="reversalDate" name="reversalDate" type="date" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reversalNotes">Notes</Label>
                  <Input id="reversalNotes" name="reversalNotes" />
                </div>
                <div className="flex items-end">
                  <Button
                    type="submit"
                    disabled={
                      dashboard.recentEntries.filter(
                        (entry) => !entry.isReversal && !entry.reversedByEntryId
                      ).length === 0
                    }
                  >
                    Reverse Journal
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between gap-3">
                <span>Close GL Period</span>
                <Link
                  href="/accounting/posting-exceptions"
                  className="text-sm font-normal text-muted-foreground underline-offset-4 hover:underline"
                >
                  Posting queue
                </Link>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <form action={submitGlPeriodLock} className="grid gap-4 md:grid-cols-4">
                <div className="space-y-2">
                  <Label htmlFor="periodYear">Year</Label>
                  <Input id="periodYear" name="periodYear" inputMode="numeric" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="periodMonth">Month</Label>
                  <Input id="periodMonth" name="periodMonth" inputMode="numeric" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lockReason">Reason</Label>
                  <Input id="lockReason" name="lockReason" defaultValue="manual_gl_close" />
                </div>
                <div className="flex items-end">
                  <Button type="submit">Close GL Period</Button>
                </div>
              </form>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Period</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dashboard.recentGlLocks.map((lock) => (
                    <TableRow key={lock.id}>
                      <TableCell>
                        {lock.periodYear}-{String(lock.periodMonth ?? 0).padStart(2, "0")}
                      </TableCell>
                      <TableCell>{lock.lockReason}</TableCell>
                      <TableCell>{lock.unlockedAt ? "Unlocked" : "Locked"}</TableCell>
                    </TableRow>
                  ))}
                  {dashboard.recentGlLocks.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="text-muted-foreground">
                        No GL period locks yet.
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between gap-3">
                  <span>Chart of Accounts</span>
                  <Link
                    href="/accounting/reports/general-ledger"
                    className="text-sm font-normal text-muted-foreground underline-offset-4 hover:underline"
                  >
                    GL detail
                  </Link>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Code</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Type</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dashboard.accounts.slice(0, 12).map((account) => (
                      <TableRow key={account.id}>
                        <TableCell>
                          <Link
                            href={`/accounting/reports/general-ledger?accountId=${account.id}`}
                            className="underline-offset-4 hover:underline"
                          >
                            {account.accountCode}
                          </Link>
                        </TableCell>
                        <TableCell>{account.nameEn}</TableCell>
                        <TableCell>{account.accountType}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between gap-3">
                  <span>Recent Journal Entries</span>
                  <Link
                    href="/accounting/journal"
                    className="text-sm font-normal text-muted-foreground underline-offset-4 hover:underline"
                  >
                    View all
                  </Link>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Number</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Debit</TableHead>
                      <TableHead>Credit</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dashboard.recentEntries.map((entry) => (
                      <TableRow key={entry.id}>
                        <TableCell>
                          <Link
                            href={`/accounting/journal/${entry.id}`}
                            className="underline-offset-4 hover:underline"
                          >
                            {entry.entryNumber}
                          </Link>
                        </TableCell>
                        <TableCell>{entry.entryDate}</TableCell>
                        <TableCell>{amount(entry.totalDebit)}</TableCell>
                        <TableCell>{amount(entry.totalCredit)}</TableCell>
                      </TableRow>
                    ))}
                    {dashboard.recentEntries.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-muted-foreground">
                          No journal entries yet.
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
