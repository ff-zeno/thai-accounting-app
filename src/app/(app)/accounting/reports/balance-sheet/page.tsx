import Link from "next/link";
import { BookOpen } from "lucide-react";
import { getActiveOrgId } from "@/lib/utils/org-context";
import {
  buildFinancialStatementSummary,
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

export default async function BalanceSheetPage({
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
  const summary = orgId ? await buildFinancialStatementSummary(orgId, asOfDate) : null;
  const rows = summary
    ? [
        { label: "Assets", value: summary.balanceSheet.assets },
        { label: "Liabilities", value: summary.balanceSheet.liabilities },
        { label: "Equity", value: summary.balanceSheet.equity },
        {
          label: "Current year profit/loss",
          value: summary.balanceSheet.retainedEarningsCurrent,
        },
        { label: "Balance check", value: summary.balanceSheet.check },
      ]
    : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Balance Sheet</h1>
        <p className="text-sm text-muted-foreground">
          Assets, liabilities, equity, current-year result, and balance check from journal lines.
        </p>
      </div>

      {!orgId || !summary ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-2 py-12 text-center">
            <BookOpen className="size-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Select an organization to view balance sheet.
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
              <form className="grid gap-3 md:grid-cols-[1fr_auto]" action="/accounting/reports/balance-sheet">
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
                <span>Statement as of {asOfDate}</span>
                <Button
                  variant="outline"
                  size="sm"
                  render={
                    <Link
                      href={`/api/accounting/balance-sheet.csv?asOfDate=${asOfDate}`}
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
                    <TableHead>Line</TableHead>
                    <TableHead className="text-right tabular-nums">Amount</TableHead>
                    <TableHead>Drill-through</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.label}>
                      <TableCell className="font-medium">{row.label}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        <Amount value={row.value} />
                      </TableCell>
                      <TableCell>
                        {row.label === "Balance check" ? (
                          "control"
                        ) : (
                          <Link
                            href="/accounting/reports/general-ledger"
                            className="underline-offset-4 hover:underline"
                          >
                            Ledger detail
                          </Link>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
