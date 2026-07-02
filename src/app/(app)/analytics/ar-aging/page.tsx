import { buildAgingSnapshot, summarizeAging } from "@/lib/analytics/aging";
import { getActiveOrgId } from "@/lib/utils/org-context";
import { Amount } from "@/components/ui/amount";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { StatCard } from "@/components/ui/stat-card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default async function ArAgingPage() {
  const orgId = await getActiveOrgId();
  const asOfDate = new Date().toISOString().slice(0, 10);
  const rows = orgId ? await buildAgingSnapshot(orgId, asOfDate, "ar") : [];
  const summary = summarizeAging(rows);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">AR Aging</h1>
        <p className="text-sm text-muted-foreground">
          Open income documents bucketed by due date as of {asOfDate}.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-5">
        <StatCard label="Current" value={<Amount value={summary.current} />} />
        <StatCard label="1-30" value={<Amount value={summary.days1To30} />} />
        <StatCard label="31-60" value={<Amount value={summary.days31To60} />} />
        <StatCard label="61-90" value={<Amount value={summary.days61To90} />} />
        <StatCard label="91+" value={<Amount value={summary.days91Plus} />} />
      </div>
      <Card>
        <CardHeader><CardTitle>Counterparties</CardTitle></CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <EmptyState size="sm" title="No invoices in this period." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead className="text-right tabular-nums">Current</TableHead>
                  <TableHead className="text-right tabular-nums">1-30</TableHead>
                  <TableHead className="text-right tabular-nums">31-60</TableHead>
                  <TableHead className="text-right tabular-nums">61-90</TableHead>
                  <TableHead className="text-right tabular-nums">91+</TableHead>
                  <TableHead className="text-right tabular-nums">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.counterpartyId ?? "unassigned"}>
                    <TableCell>{row.counterpartyName}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      <Amount value={row.current} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      <Amount value={row.days1To30} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      <Amount value={row.days31To60} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      <Amount value={row.days61To90} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      <Amount value={row.days91Plus} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      <Amount value={row.total} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
