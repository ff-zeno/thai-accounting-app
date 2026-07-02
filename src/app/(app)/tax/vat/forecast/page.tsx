import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  getPp36ReclaimTracker,
  getVatForecastByPeriodRange,
} from "@/lib/db/queries/vat-operations-ledger";
import { getActiveOrgId } from "@/lib/utils/org-context";

function formatAmount(value: string | null): string {
  if (!value) return "0.00";
  return Number(value).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatStatus(value: string): string {
  return value.replaceAll("_", " ");
}

function formatPeriod(year: number | null, month: number | null): string {
  if (!year || !month) return "-";
  return `${String(month).padStart(2, "0")}/${year}`;
}

function formatDate(value: Date | null): string {
  if (!value) return "-";
  return value.toISOString().slice(0, 10);
}

export default async function VatForecastPage() {
  const orgId = await getActiveOrgId();
  const now = new Date();
  const [forecast, pp36Tracker] = orgId
    ? await Promise.all([
        getVatForecastByPeriodRange({
          orgId,
          startYear: now.getFullYear(),
          startMonth: now.getMonth() + 1,
          months: 6,
        }),
        getPp36ReclaimTracker({ orgId, limit: 50 }),
      ])
    : [[], []];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">VAT Forecast</h1>
        <p className="text-sm text-muted-foreground">
          Six-month advisory projection for PP 30, PP 36, expiring input VAT, and reclaim queues.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Projection</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Period</TableHead>
                <TableHead>PP 30</TableHead>
                <TableHead>PP 36</TableHead>
                <TableHead className="text-right">Expiring Input</TableHead>
                <TableHead className="text-right">PP36 Reclaim</TableHead>
                <TableHead className="text-right">Projected Payable</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {forecast.map((row) => (
                <TableRow key={`${row.period.year}-${row.period.month}`}>
                  <TableCell>
                    {String(row.period.month).padStart(2, "0")}/{row.period.year}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{formatStatus(row.pp30.status)}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{formatStatus(row.pp36.status)}</Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.expiringInputVat.count} / {formatAmount(row.expiringInputVat.vatAmount)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.pp36Reclaimable.count} / {formatAmount(row.pp36Reclaimable.vatAmount)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatAmount(row.pp30.netPayable)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p className="mt-3 text-xs text-muted-foreground">
            Forecast rows are advisory and never create filing state.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>PP36 Reclaim Tracker</CardTitle>
        </CardHeader>
        <CardContent>
          {pp36Tracker.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No PP36 obligations recorded yet.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>PP36 Period</TableHead>
                  <TableHead>Service</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Paid</TableHead>
                  <TableHead>Eligible</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead>PP30 Reclaim</TableHead>
                  <TableHead className="text-right">VAT</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pp36Tracker.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      {formatPeriod(row.pp36PeriodYear, row.pp36PeriodMonth)}
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">
                        {row.serviceDescription || "Foreign service"}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {row.vendorCountryCode || "non-TH"}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{formatStatus(row.status)}</Badge>
                    </TableCell>
                    <TableCell>{formatDate(row.pp36PaidAt)}</TableCell>
                    <TableCell>
                      {formatPeriod(
                        row.pp30ReclaimEligiblePeriodYear,
                        row.pp30ReclaimEligiblePeriodMonth
                      )}
                    </TableCell>
                    <TableCell>
                      {formatPeriod(
                        row.pp30ReclaimExpiryPeriodYear,
                        row.pp30ReclaimExpiryPeriodMonth
                      )}
                    </TableCell>
                    <TableCell>
                      {row.pp30ReclaimFilingId ? (
                        <Badge>Paired</Badge>
                      ) : row.status === "eligible_for_pp30_reclaim" ? (
                        <Badge variant="secondary">Available</Badge>
                      ) : (
                        <Badge variant="outline">Pending</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatAmount(row.vatAmount)}
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
