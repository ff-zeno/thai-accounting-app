import { buildAgingSnapshot, summarizeAging } from "@/lib/analytics/aging";
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

export default async function ApAgingPage() {
  const orgId = await getActiveOrgId();
  const asOfDate = new Date().toISOString().slice(0, 10);
  const rows = orgId ? await buildAgingSnapshot(orgId, asOfDate, "ap") : [];
  const summary = summarizeAging(rows);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">AP Aging</h1>
        <p className="text-sm text-muted-foreground">
          Open expense documents bucketed by due date as of {asOfDate}.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-5">
        <Card>
          <CardHeader><CardTitle className="text-sm">Current</CardTitle></CardHeader>
          <CardContent><div className="text-xl font-semibold">{amount(summary.current)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">1-30</CardTitle></CardHeader>
          <CardContent><div className="text-xl font-semibold">{amount(summary.days1To30)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">31-60</CardTitle></CardHeader>
          <CardContent><div className="text-xl font-semibold">{amount(summary.days31To60)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">61-90</CardTitle></CardHeader>
          <CardContent><div className="text-xl font-semibold">{amount(summary.days61To90)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">91+</CardTitle></CardHeader>
          <CardContent><div className="text-xl font-semibold">{amount(summary.days91Plus)}</div></CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader><CardTitle>Counterparties</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Vendor</TableHead>
                <TableHead>Current</TableHead>
                <TableHead>1-30</TableHead>
                <TableHead>31-60</TableHead>
                <TableHead>61-90</TableHead>
                <TableHead>91+</TableHead>
                <TableHead>Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.counterpartyId ?? "unassigned"}>
                  <TableCell>{row.counterpartyName}</TableCell>
                  <TableCell>{amount(row.current)}</TableCell>
                  <TableCell>{amount(row.days1To30)}</TableCell>
                  <TableCell>{amount(row.days31To60)}</TableCell>
                  <TableCell>{amount(row.days61To90)}</TableCell>
                  <TableCell>{amount(row.days91Plus)}</TableCell>
                  <TableCell>{amount(row.total)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
