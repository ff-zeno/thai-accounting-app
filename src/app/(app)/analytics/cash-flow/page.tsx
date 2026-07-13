import {
  computeCashForecast,
  computeCounterpartyConcentration,
} from "@/lib/analytics/kpi-engine";
import { getActiveOrgId } from "@/lib/utils/org-context";
import { PageHeader } from "@/components/ui/page-header";
import { ReportSwitcher } from "@/components/reports/report-switcher";
import { Amount } from "@/components/ui/amount";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function pct(value: string | number) {
  return `${(Number(value) * 100).toFixed(1)}%`;
}

export default async function CashFlowPage() {
  const orgId = await getActiveOrgId();
  const asOfDate = new Date().toISOString().slice(0, 10);
  const [forecast, customers, vendors] = orgId
    ? await Promise.all([
        computeCashForecast({ orgId, asOfDate }),
        computeCounterpartyConcentration({
          orgId,
          periodStart: `${asOfDate.slice(0, 4)}-01-01`,
          periodEnd: asOfDate,
          direction: "income",
          limit: 5,
        }),
        computeCounterpartyConcentration({
          orgId,
          periodStart: `${asOfDate.slice(0, 4)}-01-01`,
          periodEnd: asOfDate,
          direction: "expense",
          limit: 5,
        }),
      ])
    : [null, [], []];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cash Forecast"
        description={`THB cash, 30-day AR/AP forecast, runway, and concentration as of ${asOfDate}.`}
      >
        <ReportSwitcher current="/analytics/cash-flow" />
      </PageHeader>

      {!forecast ? (
        <Card>
          <CardContent className="py-10 text-sm text-muted-foreground">
            Select an organization to view cash forecast.
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <StatCard
              label="Cash Balance"
              value={<Amount value={forecast.cashBalance} />}
            />
            <StatCard
              label="30-day Inflows"
              value={<Amount value={forecast.expected30DayInflows} />}
            />
            <StatCard
              label="30-day Outflows"
              value={<Amount value={forecast.expected30DayOutflows} />}
            />
            <StatCard
              label="Payroll Outflows"
              value={<Amount value={forecast.scheduledPayrollOutflows} />}
            />
            <StatCard
              label="Runway"
              value={
                forecast.runwayMonths === null ? "No burn" : `${forecast.runwayMonths} mo`
              }
            />
          </div>

          <Card>
            <CardHeader><CardTitle>Projected Cash</CardTitle></CardHeader>
            <CardContent>
              <div className="text-3xl font-semibold">
                <Amount value={forecast.projected30DayCash} />
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Net monthly burn: <Amount value={forecast.netMonthlyBurn} />. Open AR:{" "}
                <Amount value={forecast.arTotal} />. Open AP:{" "}
                <Amount value={forecast.apTotal} />. Scheduled non-cash depreciation:{" "}
                <Amount value={forecast.scheduledDepreciationExpense} />.
              </p>
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <ConcentrationTable title="Customer Concentration" rows={customers} />
            <ConcentrationTable title="Vendor Concentration" rows={vendors} />
          </div>
        </>
      )}
    </div>
  );
}

function ConcentrationTable({
  title,
  rows,
}: {
  title: string;
  rows: Array<{
    counterpartyId: string | null;
    counterpartyName: string;
    amount: string;
    sharePct: string;
  }>;
}) {
  return (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No confirmed activity.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Counterparty</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right">Share</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.counterpartyId ?? row.counterpartyName}>
                  <TableCell>{row.counterpartyName}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    <Amount value={row.amount} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{pct(row.sharePct)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
