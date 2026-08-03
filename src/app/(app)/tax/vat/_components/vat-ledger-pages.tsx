import { desc, eq, sql } from "drizzle-orm";
import Link from "next/link";
import { Amount } from "@/components/ui/amount";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, NoOrgState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { StatusBadge } from "@/components/ui/status-badge";
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

function formatPeriod(year: number | null, month: number | null): string {
  if (!year || !month) return "-";
  return `${String(month).padStart(2, "0")}/${year}`;
}

function formatStatus(status: string): string {
  return status.replaceAll("_", " ");
}

async function VatInputLedgerSection() {
  const orgId = await getActiveOrgId();
  if (!orgId) return <NoOrgState>Select an organization to view input VAT.</NoOrgState>;

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
    <Card>
      <CardHeader>
        <CardTitle>Input VAT Items</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <EmptyState size="sm" title="No input VAT items recorded yet." />
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
                    <StatusBadge status={row.status} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    <Amount value={row.baseAmount} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    <Amount value={row.vatAmount} />
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

export async function VatInputLedgerPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Input VAT"
        description="Purchase-side VAT items, claim windows, allocation status, and filed claim periods."
      />
      <VatInputLedgerSection />
    </div>
  );
}

async function VatOutputLedgerSection() {
  const orgId = await getActiveOrgId();
  if (!orgId) return <NoOrgState>Select an organization to view output VAT.</NoOrgState>;

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
    <Card>
      <CardHeader>
        <CardTitle>Output VAT Items</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <EmptyState size="sm" title="No output VAT items recorded yet." />
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
                    <StatusBadge status={row.status} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    <Amount value={row.baseAmount} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    <Amount value={row.vatAmount} />
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

export async function VatOutputLedgerPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Output VAT"
        description="Sales-side VAT items, tax-point periods, allocation status, and filed output VAT."
      />
      <VatOutputLedgerSection />
    </div>
  );
}

async function VatFilingsLedgerSection() {
  const orgId = await getActiveOrgId();
  if (!orgId) return <NoOrgState>Select an organization to view VAT filings.</NoOrgState>;

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
    <Card>
      <CardHeader>
        <CardTitle>Filing Ledger</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <EmptyState size="sm" title="No VAT filings recorded yet." />
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
                    <StatusBadge status={row.status} />
                  </TableCell>
                  <TableCell><StatusBadge status={row.paymentStatus} /></TableCell>
                  <TableCell className="text-right tabular-nums">
                    <Amount value={row.outputVatTotal} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    <Amount value={row.inputVatTotal} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    <Amount value={row.pp36VatTotal ?? row.pp36ReclaimTotal} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    <Amount value={row.netPayable} />
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
  );
}

export async function VatFilingsLedgerPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="VAT Filings"
        description="Draft and filed VAT returns, including ordinary filings and amendments."
      />
      <VatFilingsLedgerSection />
    </div>
  );
}

export async function VatRegisterLedgerPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="VAT Register"
        description="Official-style VAT evidence lists for purchase VAT, sales VAT, and filed returns."
      />
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Output VAT</h2>
        <VatOutputLedgerSection />
      </section>
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Input VAT</h2>
        <VatInputLedgerSection />
      </section>
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">VAT Filings</h2>
        <VatFilingsLedgerSection />
      </section>
    </div>
  );
}

export async function VatFilingDrilldownLedgerPage({ filingId }: { filingId: string }) {
  const orgId = await getActiveOrgId();
  if (!orgId) return <NoOrgState>Select an organization to view VAT filing drilldown.</NoOrgState>;

  const drilldown = await getVatFilingDrilldown({ orgId, filingId });
  const groups = Object.entries(drilldown.grouped);

  return (
    <div className="space-y-6">
      <PageHeader
        title="VAT Filing Drilldown"
        description={
          <>
            Frozen filing lines and source snapshots for{" "}
            {drilldown.filing.filingType.toUpperCase()}{" "}
            {formatPeriod(drilldown.filing.periodYear, drilldown.filing.periodMonth)}.
          </>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Filing Header</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <StatCard label="Status" value={<StatusBadge status={drilldown.filing.status} />} />
            <StatCard label="Payment" value={<StatusBadge status={drilldown.filing.paymentStatus} />} />
            <StatCard label="Output" value={<Amount value={drilldown.filing.outputVatTotal} />} />
            <StatCard label="Input" value={<Amount value={drilldown.filing.inputVatTotal} />} />
            <StatCard label="PP36" value={<Amount value={drilldown.filing.pp36VatTotal} />} />
            <StatCard label="Net" value={<Amount value={drilldown.filing.netPayable} />} />
          </div>
        </CardContent>
      </Card>

      {groups.length === 0 ? (
        <EmptyState size="sm" title="No filing lines recorded yet." />
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
                      <TableCell className="text-right tabular-nums">
                        <Amount value={line.amount} />
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        <Amount value={line.vatAmount} />
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
