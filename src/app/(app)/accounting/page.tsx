import Link from "next/link";
import { AlertTriangle, BookOpen } from "lucide-react";
import { getActiveOrgId } from "@/lib/utils/org-context";
import { getGeneralLedgerDashboard } from "@/lib/db/queries/general-ledger";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Amount } from "@/components/ui/amount";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { StatCard } from "@/components/ui/stat-card";
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
          <Alert variant="warning">
            <AlertTriangle />
            <AlertTitle>General ledger is compact v1.</AlertTitle>
            <AlertDescription>
              Chart of accounts, paired opening balances, two-line manual journals, reversals,
              posting queue, close readiness, CSV reports, and drill-through are testable.
              Bulk opening balance import, advanced journal grids, richer statement drilldowns,
              and full close workflow orchestration remain deferred.
            </AlertDescription>
          </Alert>

          <div className="grid gap-4 md:grid-cols-3">
            <StatCard
              label="Accounts"
              value={dashboard.summary.accountCount}
              hint={`${dashboard.summary.postableAccountCount} postable.`}
            />
            <StatCard
              label={
                <span className="flex items-center justify-between gap-3">
                  <span>Journal Entries</span>
                  <Link
                    href="/accounting/reports/trial-balance"
                    className="font-normal text-muted-foreground underline-offset-4 hover:underline"
                  >
                    Trial balance
                  </Link>
                </span>
              }
              value={dashboard.summary.entryCount}
              hint="Balanced by database invariant."
            />
            <StatCard
              label="Opening Balance"
              value="Ready"
              hint="Posts paired debit/credit lines."
            />
          </div>

          <div className="grid gap-4 md:grid-cols-4">
            <StatCard
              label="Assets"
              value={<Amount value={dashboard.statements.balanceSheet.assets} />}
              hint={`As of ${dashboard.statements.asOfDate}.`}
            />
            <StatCard
              label="Liabilities + Equity"
              value={
                <Amount
                  value={
                    Number(dashboard.statements.balanceSheet.liabilities) +
                    Number(dashboard.statements.balanceSheet.equity)
                  }
                />
              }
              hint={
                <>
                  Current net income shown separately.
                  <Link
                    href="/accounting/reports/balance-sheet"
                    className="mt-2 block underline-offset-4 hover:underline"
                  >
                    Open balance sheet
                  </Link>
                </>
              }
            />
            <StatCard
              label="Revenue"
              value={<Amount value={dashboard.statements.profitAndLoss.revenue} />}
              hint="Year-to-date."
            />
            <StatCard
              label="Net Income"
              value={<Amount value={dashboard.statements.profitAndLoss.netIncome} />}
              hint={
                <>
                  P&L summary from journal lines.
                  <Link
                    href="/accounting/reports/profit-loss"
                    className="mt-2 block underline-offset-4 hover:underline"
                  >
                    Open profit and loss
                  </Link>
                </>
              }
            />
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <StatCard
              label="Inventory 1160"
              value={
                <Amount value={dashboard.inventoryReconciliation.glInventoryBalance} />
              }
              hint={`GL inventory balance as of ${dashboard.inventoryReconciliation.asOfDate}.`}
            />
            <StatCard
              label="SKU Inventory"
              value={<Amount value={dashboard.inventoryReconciliation.skuCurrentValue} />}
              hint="Sum of SKU current value."
            />
            <StatCard
              label="Inventory Variance"
              value={<Amount value={dashboard.inventoryReconciliation.variance} />}
              hint="GL 1160 minus SKU value."
            />
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
                  <NativeSelect
                    id="debitAccountId"
                    name="debitAccountId"
                    className="w-full"
                    defaultValue={dashboard.accounts[0]?.id}
                  >
                    {dashboard.accounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.accountCode} {account.nameEn}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="creditAccountId">Credit account</Label>
                  <NativeSelect
                    id="creditAccountId"
                    name="creditAccountId"
                    className="w-full"
                    defaultValue={dashboard.accounts[1]?.id}
                  >
                    {dashboard.accounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.accountCode} {account.nameEn}
                      </option>
                    ))}
                  </NativeSelect>
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
                  <NativeSelect
                    id="manualDebitAccountId"
                    name="manualDebitAccountId"
                    className="w-full"
                    defaultValue={dashboard.accounts[0]?.id}
                  >
                    {dashboard.accounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.accountCode} {account.nameEn}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="manualCreditAccountId">Credit account</Label>
                  <NativeSelect
                    id="manualCreditAccountId"
                    name="manualCreditAccountId"
                    className="w-full"
                    defaultValue={dashboard.accounts[1]?.id}
                  >
                    {dashboard.accounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.accountCode} {account.nameEn}
                      </option>
                    ))}
                  </NativeSelect>
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
                  <NativeSelect
                    id="journalEntryId"
                    name="journalEntryId"
                    className="w-full"
                    defaultValue={dashboard.recentEntries[0]?.id}
                  >
                    {dashboard.recentEntries
                      .filter((entry) => !entry.isReversal && !entry.reversedByEntryId)
                      .map((entry) => (
                        <option key={entry.id} value={entry.id}>
                          {entry.entryNumber} {entry.description}
                        </option>
                      ))}
                  </NativeSelect>
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
                      <TableHead className="text-right tabular-nums">Debit</TableHead>
                      <TableHead className="text-right tabular-nums">Credit</TableHead>
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
                        <TableCell className="text-right tabular-nums">
                          <Amount value={entry.totalDebit} />
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          <Amount value={entry.totalCredit} />
                        </TableCell>
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
