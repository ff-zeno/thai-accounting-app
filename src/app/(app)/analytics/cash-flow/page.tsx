import {
  computeCashForecast,
  computeCounterpartyConcentration,
} from "@/lib/analytics/kpi-engine";
import { getActiveOrgId } from "@/lib/utils/org-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function amount(value: string | number) {
  return Number(value).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

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
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Cash Forecast</h1>
        <p className="text-sm text-muted-foreground">
          THB cash, 30-day AR/AP forecast, runway, and concentration as of {asOfDate}.
        </p>
      </div>

      {!forecast ? (
        <Card>
          <CardContent className="py-10 text-sm text-muted-foreground">
            Select an organization to view cash forecast.
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader><CardTitle className="text-sm">Cash Balance</CardTitle></CardHeader>
              <CardContent><div className="text-xl font-semibold">{amount(forecast.cashBalance)}</div></CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-sm">30-day Inflows</CardTitle></CardHeader>
              <CardContent><div className="text-xl font-semibold">{amount(forecast.expected30DayInflows)}</div></CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-sm">30-day Outflows</CardTitle></CardHeader>
              <CardContent><div className="text-xl font-semibold">{amount(forecast.expected30DayOutflows)}</div></CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-sm">Payroll Outflows</CardTitle></CardHeader>
              <CardContent><div className="text-xl font-semibold">{amount(forecast.scheduledPayrollOutflows)}</div></CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-sm">Runway</CardTitle></CardHeader>
              <CardContent>
                <div className="text-xl font-semibold">
                  {forecast.runwayMonths === null ? "No burn" : `${forecast.runwayMonths} mo`}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader><CardTitle>Projected Cash</CardTitle></CardHeader>
            <CardContent>
              <div className="text-3xl font-semibold">
                {amount(forecast.projected30DayCash)}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Net monthly burn: {amount(forecast.netMonthlyBurn)}. Open AR: {amount(forecast.arTotal)}. Open AP: {amount(forecast.apTotal)}. Scheduled non-cash depreciation: {amount(forecast.scheduledDepreciationExpense)}.
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
                  <TableCell className="text-right font-mono">{amount(row.amount)}</TableCell>
                  <TableCell className="text-right font-mono">{pct(row.sharePct)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
