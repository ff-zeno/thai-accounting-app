import { computeCounterpartyConcentration } from "@/lib/analytics/kpi-engine";
import { formatBangkokDate } from "@/lib/tax/filing-deadlines";
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

function parseDateParam(value: string | undefined, fallback: string) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : fallback;
}

export default async function ConcentrationPage({
  searchParams,
}: {
  searchParams?: Promise<{ from?: string; to?: string }>;
}) {
  const params = searchParams ? await searchParams : {};
  const orgId = await getActiveOrgId();
  const today = formatBangkokDate(new Date());
  const periodStart = parseDateParam(params.from, `${today.slice(0, 4)}-01-01`);
  const periodEnd = parseDateParam(params.to, today);
  const [customers, vendors] = orgId
    ? await Promise.all([
        computeCounterpartyConcentration({
          orgId,
          periodStart,
          periodEnd,
          direction: "income",
          limit: 10,
        }),
        computeCounterpartyConcentration({
          orgId,
          periodStart,
          periodEnd,
          direction: "expense",
          limit: 10,
        }),
      ])
    : [[], []];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Concentration</h1>
        <p className="text-sm text-muted-foreground">
          Top customers by confirmed revenue and top vendors by confirmed spend from {periodStart} to {periodEnd}.
        </p>
      </div>

      <form className="flex flex-wrap items-end gap-3" action="/analytics/concentration">
        <label className="grid gap-1 text-sm">
          <span className="text-muted-foreground">From</span>
          <input
            className="h-9 rounded-md border bg-background px-3 font-mono text-sm"
            type="date"
            name="from"
            defaultValue={periodStart}
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-muted-foreground">To</span>
          <input
            className="h-9 rounded-md border bg-background px-3 font-mono text-sm"
            type="date"
            name="to"
            defaultValue={periodEnd}
          />
        </label>
        <button className="h-9 rounded-md border bg-background px-3 text-sm font-medium" type="submit">
          Apply
        </button>
      </form>

      {!orgId ? (
        <Card>
          <CardContent className="py-10 text-sm text-muted-foreground">
            Select an organization to view concentration.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          <ConcentrationTable title="Customer Concentration" rows={customers} />
          <ConcentrationTable title="Vendor Concentration" rows={vendors} />
        </div>
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
