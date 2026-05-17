import Link from "next/link";
import { BookOpen } from "lucide-react";
import { getActiveOrgId } from "@/lib/utils/org-context";
import {
  buildFinancialStatementSummary,
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

function today() {
  return new Date().toISOString().slice(0, 10);
}

function amount(value: string | null | undefined) {
  return Number(value ?? 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default async function ProfitLossPage({
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
        { label: "Revenue", value: summary.profitAndLoss.revenue, linkPrefix: "4" },
        { label: "Cost of goods sold", value: summary.profitAndLoss.cogs, linkPrefix: "5" },
        { label: "Gross profit", value: summary.profitAndLoss.grossProfit },
        { label: "Expenses", value: summary.profitAndLoss.expenses, linkPrefix: "6" },
        { label: "Net income", value: summary.profitAndLoss.netIncome },
      ]
    : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Profit and Loss</h1>
        <p className="text-sm text-muted-foreground">
          Revenue, COGS, expense, gross-profit, and net-income summary from journal lines.
        </p>
      </div>

      {!orgId || !summary ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-2 py-12 text-center">
            <BookOpen className="size-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Select an organization to view profit and loss.
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
              <form className="grid gap-3 md:grid-cols-[1fr_auto]" action="/accounting/reports/profit-loss">
                <Input name="asOfDate" type="date" defaultValue={asOfDate} />
                <button
                  type="submit"
                  className="h-9 rounded-md border border-input px-3 text-sm hover:bg-muted"
                >
                  Refresh
                </button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between gap-3">
                <span>Statement as of {asOfDate}</span>
                <Link
                  href={`/api/accounting/profit-loss.csv?asOfDate=${asOfDate}`}
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
                    <TableHead>Line</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Drill-through</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.label}>
                      <TableCell className="font-medium">{row.label}</TableCell>
                      <TableCell>{amount(row.value)}</TableCell>
                      <TableCell>
                        {row.linkPrefix ? (
                          <Link
                            href="/accounting/reports/general-ledger"
                            className="underline-offset-4 hover:underline"
                          >
                            Ledger detail
                          </Link>
                        ) : (
                          "summary"
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
