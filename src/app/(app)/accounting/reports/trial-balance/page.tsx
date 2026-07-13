import Link from "next/link";
import { BookOpen } from "lucide-react";
import { getActiveOrgId } from "@/lib/utils/org-context";
import { PageHeader } from "@/components/ui/page-header";
import { ReportSwitcher } from "@/components/reports/report-switcher";
import {
  buildTrialBalance,
  seedStandardGlAccounts,
} from "@/lib/db/queries/general-ledger";
import { Amount } from "@/components/ui/amount";
import { Button } from "@/components/ui/button";
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

function today() {
  return new Date().toISOString().slice(0, 10);
}

export default async function TrialBalancePage({
  searchParams,
}: {
  searchParams: Promise<{ asOfDate?: string }>;
}) {
  const [{ asOfDate: rawAsOfDate }, orgId] = await Promise.all([
    searchParams,
    getActiveOrgId(),
  ]);
  const asOfDate = /^\d{4}-\d{2}-\d{2}$/.test(rawAsOfDate ?? "")
    ? rawAsOfDate!
    : today();
  if (orgId) await seedStandardGlAccounts(orgId);
  const rows = orgId ? await buildTrialBalance(orgId, asOfDate) : [];
  const totals = rows.reduce(
    (acc, row) => ({
      debit: acc.debit + Number(row.debitTotal),
      credit: acc.credit + Number(row.creditTotal),
    }),
    { debit: 0, credit: 0 }
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Trial Balance"
        description="Account debit and credit totals derived from posted journal lines."
      >
        <ReportSwitcher current="/accounting/reports/trial-balance" />
      </PageHeader>

      {!orgId ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-2 py-12 text-center">
            <BookOpen className="size-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Select an organization to view trial balance.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Report Date</CardTitle>
            </CardHeader>
            <CardContent>
              <form className="grid gap-3 md:grid-cols-[1fr_auto]" action="/accounting/reports/trial-balance">
                <Input name="asOfDate" type="date" defaultValue={asOfDate} />
                <Button type="submit" variant="outline" size="sm">
                  Refresh
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between gap-3">
                <span>Accounts as of {asOfDate}</span>
                <Button
                  variant="outline"
                  size="sm"
                  render={
                    <Link
                      href={`/api/accounting/trial-balance.csv?asOfDate=${asOfDate}`}
                    />
                  }
                >
                  Download CSV
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Code</TableHead>
                    <TableHead>Account</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right tabular-nums">Debit</TableHead>
                    <TableHead className="text-right tabular-nums">Credit</TableHead>
                    <TableHead className="text-right tabular-nums">Net</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.accountId}>
                      <TableCell>
                        <Link
                          href={`/accounting/reports/general-ledger?accountId=${row.accountId}`}
                          className="font-medium underline-offset-4 hover:underline"
                        >
                          {row.accountCode}
                        </Link>
                      </TableCell>
                      <TableCell>{row.accountNameEn}</TableCell>
                      <TableCell>{row.accountType}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        <Amount value={row.debitTotal} />
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        <Amount value={row.creditTotal} />
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        <Amount value={row.netBalance} />
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow>
                    <TableCell colSpan={3} className="font-medium">
                      Total
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      <Amount value={totals.debit} />
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      <Amount value={totals.credit} />
                    </TableCell>
                    <TableCell />
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
