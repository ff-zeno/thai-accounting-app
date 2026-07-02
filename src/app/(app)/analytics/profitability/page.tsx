import {
  getProfitabilityByCostCenter,
  getProfitabilityByProject,
  type ProfitabilitySegmentRow,
} from "@/lib/analytics/segmented-profitability";
import { formatBangkokDate } from "@/lib/tax/filing-deadlines";
import { getActiveOrgId } from "@/lib/utils/org-context";
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

function pct(value: string | number | null) {
  if (value === null) return "n/a";
  return `${(Number(value) * 100).toFixed(1)}%`;
}

export default async function ProfitabilityPage({
  searchParams,
}: {
  searchParams?: Promise<{ from?: string; to?: string }>;
}) {
  const params = searchParams ? await searchParams : {};
  const orgId = await getActiveOrgId();
  const today = formatBangkokDate(new Date());
  const periodStart = parseDateParam(params.from, `${today.slice(0, 4)}-01-01`);
  const periodEnd = parseDateParam(params.to, today);
  const [costCenterRows, projectRows] = orgId
    ? await Promise.all([
        getProfitabilityByCostCenter({ orgId, periodStart, periodEnd }),
        getProfitabilityByProject({ orgId, periodStart, periodEnd }),
      ])
    : [[], []];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Profitability</h1>
        <p className="text-sm text-muted-foreground">
          GL revenue, COGS, expenses, margin, and operating profit from {periodStart} to {periodEnd}.
        </p>
      </div>

      <form className="flex flex-wrap items-end gap-3" action="/analytics/profitability">
        <label className="grid gap-1 text-sm">
          <span className="text-muted-foreground">From</span>
          <Input type="date" name="from" defaultValue={periodStart} />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-muted-foreground">To</span>
          <Input type="date" name="to" defaultValue={periodEnd} />
        </label>
        <Button type="submit" variant="outline" size="sm">
          Apply
        </Button>
      </form>

      {!orgId ? (
        <Card>
          <CardContent className="py-10 text-sm text-muted-foreground">
            Select an organization to view profitability.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          <ProfitabilityTable title="By Cost Center" rows={costCenterRows} />
          <ProfitabilityTable title="By Project" rows={projectRows} />
        </div>
      )}
    </div>
  );
}

function parseDateParam(value: string | undefined, fallback: string) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : fallback;
}

function ProfitabilityTable({
  title,
  rows,
}: {
  title: string;
  rows: ProfitabilitySegmentRow[];
}) {
  return (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No posted P&amp;L journal lines in this period.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Segment</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
                <TableHead className="text-right">COGS</TableHead>
                <TableHead className="text-right">Gross Margin</TableHead>
                <TableHead className="text-right">GM%</TableHead>
                <TableHead className="text-right">Expenses</TableHead>
                <TableHead className="text-right">Operating Profit</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={`${row.segmentKind}-${row.segmentId ?? "unassigned"}`}>
                  <TableCell>
                    <div className="font-medium">{row.segmentCode}</div>
                    <div className="text-xs text-muted-foreground">{row.segmentName}</div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    <Amount value={row.revenue} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    <Amount value={row.cogs} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    <Amount value={row.grossMargin} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{pct(row.grossMarginPct)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    <Amount value={row.expenses} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    <Amount value={row.operatingProfit} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
