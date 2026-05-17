import { desc, eq, sql } from "drizzle-orm";
import { FileText } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { db } from "@/lib/db";
import {
  vatFilings,
  vatInputItems,
  vatOutputItems,
  vendors,
} from "@/lib/db/schema";
import { getVatFilingDrilldown } from "@/lib/db/queries/vat-operations-ledger";
import { getActiveOrgId } from "@/lib/utils/org-context";

function formatAmount(value: string | null): string {
  if (!value) return "0.00";
  return Number(value).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatPeriod(year: number | null, month: number | null): string {
  if (!year || !month) return "-";
  return `${String(month).padStart(2, "0")}/${year}`;
}

function formatStatus(status: string): string {
  return status.replaceAll("_", " ");
}

function NoOrgState({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-20 text-center">
      <FileText className="size-8 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">
        Select an organization to view {label}.
      </p>
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <p className="py-8 text-center text-sm text-muted-foreground">
      No {label} recorded yet.
    </p>
  );
}

export async function VatInputLedgerPage() {
  const orgId = await getActiveOrgId();
  if (!orgId) return <NoOrgState label="input VAT" />;

  const rows = await db
    .select({
      id: vatInputItems.id,
      taxInvoiceNo: vatInputItems.taxInvoiceNo,
      taxInvoiceDate: vatInputItems.taxInvoiceDate,
      vendorName: vendors.name,
      baseAmount: vatInputItems.baseAmount,
      vatAmount: vatInputItems.vatAmount,
      eligiblePeriodYear: vatInputItems.eligiblePeriodYear,
      eligiblePeriodMonth: vatInputItems.eligiblePeriodMonth,
      claimPeriodYear: vatInputItems.claimPeriodYear,
      claimPeriodMonth: vatInputItems.claimPeriodMonth,
      status: vatInputItems.status,
    })
    .from(vatInputItems)
    .leftJoin(vendors, eq(vendors.id, vatInputItems.vendorId))
    .where(
      sql`${vatInputItems.orgId} = ${orgId} AND ${vatInputItems.deletedAt} IS NULL`
    )
    .orderBy(desc(vatInputItems.createdAt))
    .limit(100);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Input VAT</h1>
        <p className="text-sm text-muted-foreground">
          Purchase-side VAT items, claim windows, allocation status, and filed claim periods.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Input VAT Items</CardTitle>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <EmptyState label="input VAT items" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tax Invoice</TableHead>
                  <TableHead>Vendor</TableHead>
                  <TableHead>Eligible</TableHead>
                  <TableHead>Claimed</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Base</TableHead>
                  <TableHead className="text-right">VAT</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <div className="font-medium">{row.taxInvoiceNo ?? "-"}</div>
                      <div className="text-xs text-muted-foreground">
                        {row.taxInvoiceDate ?? "-"}
                      </div>
                    </TableCell>
                    <TableCell>{row.vendorName ?? "Unknown"}</TableCell>
                    <TableCell>
                      {formatPeriod(row.eligiblePeriodYear, row.eligiblePeriodMonth)}
                    </TableCell>
                    <TableCell>
                      {formatPeriod(row.claimPeriodYear, row.claimPeriodMonth)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{formatStatus(row.status)}</Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {formatAmount(row.baseAmount)}
                    </TableCell>
                    <TableCell className="text-right font-mono">
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

export async function VatOutputLedgerPage() {
  const orgId = await getActiveOrgId();
  if (!orgId) return <NoOrgState label="output VAT" />;

  const rows = await db
    .select({
      id: vatOutputItems.id,
      taxInvoiceNo: vatOutputItems.taxInvoiceNo,
      taxInvoiceDate: vatOutputItems.taxInvoiceDate,
      customerName: vendors.name,
      taxPointDate: vatOutputItems.taxPointDate,
      outputPeriodYear: vatOutputItems.outputPeriodYear,
      outputPeriodMonth: vatOutputItems.outputPeriodMonth,
      baseAmount: vatOutputItems.baseAmount,
      vatAmount: vatOutputItems.vatAmount,
      status: vatOutputItems.status,
    })
    .from(vatOutputItems)
    .leftJoin(vendors, eq(vendors.id, vatOutputItems.customerId))
    .where(
      sql`${vatOutputItems.orgId} = ${orgId} AND ${vatOutputItems.deletedAt} IS NULL`
    )
    .orderBy(desc(vatOutputItems.createdAt))
    .limit(100);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Output VAT</h1>
        <p className="text-sm text-muted-foreground">
          Sales-side VAT items, tax-point periods, allocation status, and filed output VAT.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Output VAT Items</CardTitle>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <EmptyState label="output VAT items" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tax Invoice</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Tax Point</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Base</TableHead>
                  <TableHead className="text-right">VAT</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <div className="font-medium">{row.taxInvoiceNo ?? "-"}</div>
                      <div className="text-xs text-muted-foreground">
                        {row.taxInvoiceDate}
                      </div>
                    </TableCell>
                    <TableCell>{row.customerName ?? "Unknown"}</TableCell>
                    <TableCell>{row.taxPointDate}</TableCell>
                    <TableCell>
                      {formatPeriod(row.outputPeriodYear, row.outputPeriodMonth)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{formatStatus(row.status)}</Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {formatAmount(row.baseAmount)}
                    </TableCell>
                    <TableCell className="text-right font-mono">
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

export async function VatFilingsLedgerPage() {
  const orgId = await getActiveOrgId();
  if (!orgId) return <NoOrgState label="VAT filings" />;

  const rows = await db
    .select({
      id: vatFilings.id,
      filingType: vatFilings.filingType,
      filingKind: vatFilings.filingKind,
      periodYear: vatFilings.periodYear,
      periodMonth: vatFilings.periodMonth,
      status: vatFilings.status,
      outputVatTotal: vatFilings.outputVatTotal,
      inputVatTotal: vatFilings.inputVatTotal,
      pp36VatTotal: vatFilings.pp36VatTotal,
      pp36ReclaimTotal: vatFilings.pp36ReclaimTotal,
      carryforwardIn: vatFilings.carryforwardIn,
      carryforwardOut: vatFilings.carryforwardOut,
      netPayable: vatFilings.netPayable,
      paymentStatus: vatFilings.paymentStatus,
      filedAt: vatFilings.filedAt,
    })
    .from(vatFilings)
    .where(sql`${vatFilings.orgId} = ${orgId} AND ${vatFilings.deletedAt} IS NULL`)
    .orderBy(desc(vatFilings.periodYear), desc(vatFilings.periodMonth), desc(vatFilings.createdAt))
    .limit(100);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">VAT Filings</h1>
        <p className="text-sm text-muted-foreground">
          Draft and filed VAT returns, including ordinary filings and amendments.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filing Ledger</CardTitle>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <EmptyState label="VAT filings" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Payment</TableHead>
                  <TableHead className="text-right">Output</TableHead>
                  <TableHead className="text-right">Input</TableHead>
                  <TableHead className="text-right">PP36</TableHead>
                  <TableHead className="text-right">Net</TableHead>
                  <TableHead className="text-right">Drilldown</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <div className="font-medium">{row.filingType.toUpperCase()}</div>
                      <div className="text-xs text-muted-foreground">
                        {formatStatus(row.filingKind)}
                      </div>
                    </TableCell>
                    <TableCell>{formatPeriod(row.periodYear, row.periodMonth)}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{formatStatus(row.status)}</Badge>
                    </TableCell>
                    <TableCell>{formatStatus(row.paymentStatus)}</TableCell>
                    <TableCell className="text-right font-mono">
                      {formatAmount(row.outputVatTotal)}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {formatAmount(row.inputVatTotal)}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {formatAmount(row.pp36VatTotal ?? row.pp36ReclaimTotal)}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {formatAmount(row.netPayable)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        render={<Link href={`/tax/vat/filings/${row.id}`} />}
                      >
                        Open
                      </Button>
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

export async function VatRegisterLedgerPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">VAT Register</h1>
        <p className="text-sm text-muted-foreground">
          Official-style VAT evidence lists for purchase VAT, sales VAT, and filed returns.
        </p>
      </div>
      <VatOutputLedgerPage />
      <VatInputLedgerPage />
      <VatFilingsLedgerPage />
    </div>
  );
}

export async function VatFilingDrilldownLedgerPage({ filingId }: { filingId: string }) {
  const orgId = await getActiveOrgId();
  if (!orgId) return <NoOrgState label="VAT filing drilldown" />;

  const drilldown = await getVatFilingDrilldown({ orgId, filingId });
  const groups = Object.entries(drilldown.grouped);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">VAT Filing Drilldown</h1>
        <p className="text-sm text-muted-foreground">
          Frozen filing lines and source snapshots for {drilldown.filing.filingType.toUpperCase()}{" "}
          {formatPeriod(drilldown.filing.periodYear, drilldown.filing.periodMonth)}.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filing Header</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <DrilldownMetric label="Status" value={formatStatus(drilldown.filing.status)} />
            <DrilldownMetric label="Payment" value={formatStatus(drilldown.filing.paymentStatus)} />
            <DrilldownMetric label="Output" value={formatAmount(drilldown.filing.outputVatTotal)} />
            <DrilldownMetric label="Input" value={formatAmount(drilldown.filing.inputVatTotal)} />
            <DrilldownMetric label="PP36" value={formatAmount(drilldown.filing.pp36VatTotal)} />
            <DrilldownMetric label="Net" value={formatAmount(drilldown.filing.netPayable)} />
          </div>
        </CardContent>
      </Card>

      {groups.length === 0 ? (
        <EmptyState label="filing lines" />
      ) : (
        groups.map(([lineType, lines]) => (
          <Card key={lineType}>
            <CardHeader>
              <CardTitle>{formatStatus(lineType)} Lines</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Source</TableHead>
                    <TableHead>Snapshot Hash</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-right">VAT</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map((line) => (
                    <TableRow key={line.id}>
                      <TableCell className="font-mono text-xs">
                        {line.vatInputItemId ?? line.vatOutputItemId ?? line.pp36ObligationId ?? "-"}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {line.frozenSnapshotHash.slice(0, 16)}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatAmount(line.amount)}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatAmount(line.vatAmount)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}

function DrilldownMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 font-medium">{value}</div>
    </div>
  );
}
