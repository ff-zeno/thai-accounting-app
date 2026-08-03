import { AlertTriangle, FileText } from "lucide-react";
import { getActiveOrgId } from "@/lib/utils/org-context";
import { getPosSalesWorkflowDashboard } from "@/lib/db/queries/pos-sales-ledger";
import { buildOutputTaxReport } from "@/lib/tax/output-tax-report";
import { buildInputTaxReport } from "@/lib/tax/input-tax-report";
import { buildInventoryMovementReport } from "@/lib/tax/inventory-movement-report";
import { formatBangkokDate } from "@/lib/tax/filing-deadlines";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Amount } from "@/components/ui/amount";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { PageHeader } from "@/components/ui/page-header";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type ReportsPageProps = {
  searchParams: Promise<{
    year?: string;
    month?: string;
    establishmentId?: string;
  }>;
};

function quantity(value: string | null | undefined) {
  return Number(value ?? 0).toLocaleString("en-US", {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  });
}

function parseMonth(value: string | undefined, fallback: number) {
  const parsed = value ? Number.parseInt(value, 10) : fallback;
  return parsed >= 1 && parsed <= 12 ? parsed : fallback;
}

function parseYear(value: string | undefined, fallback: number) {
  const parsed = value ? Number.parseInt(value, 10) : fallback;
  return parsed >= 2000 && parsed <= 2100 ? parsed : fallback;
}

function shortId(value: string | null | undefined) {
  return value ? value.slice(0, 8) : "-";
}

function sourceLabel(sourceEntityType: string | null | undefined) {
  switch (sourceEntityType) {
    case "documents":
      return "Document";
    case "import_packets":
      return "Import";
    case "import_goods_lines":
      return "Import line";
    case "inventory_counts":
      return "Count";
    case "sales_transactions":
      return "Sale";
    case "manual":
      return "Manual";
    default:
      return sourceEntityType ?? "Manual";
  }
}

function sourceHref(
  sourceEntityType: string | null | undefined,
  sourceEntityId: string | null | undefined
) {
  if (!sourceEntityType || !sourceEntityId) return null;
  switch (sourceEntityType) {
    case "documents":
      return `/documents/${sourceEntityId}/review`;
    case "import_packets":
      return `/imports/${sourceEntityId}`;
    case "inventory_counts":
      return "/inventory";
    case "sales_transactions":
      return "/sales";
    default:
      return null;
  }
}

function SourceCell({
  sourceEntityType,
  sourceEntityId,
}: {
  sourceEntityType: string | null | undefined;
  sourceEntityId: string | null | undefined;
}) {
  const label = sourceLabel(sourceEntityType);
  const href = sourceHref(sourceEntityType, sourceEntityId);
  if (!href) {
    return (
      <div>
        <div>{label}</div>
        <div className="text-xs text-muted-foreground">{shortId(sourceEntityId)}</div>
      </div>
    );
  }

  return (
    <a className="font-medium underline-offset-4 hover:underline" href={href}>
      <span>{label}</span>
      <span className="block text-xs text-muted-foreground">
        {shortId(sourceEntityId)}
      </span>
    </a>
  );
}

export default async function TaxReportsPage({ searchParams }: ReportsPageProps) {
  const params = await searchParams;
  const orgId = await getActiveOrgId();
  const today = formatBangkokDate(new Date());
  const fallbackYear = Number(today.slice(0, 4));
  const fallbackMonth = Number(today.slice(5, 7));
  const selectedYear = parseYear(params.year, fallbackYear);
  const selectedMonth = parseMonth(params.month, fallbackMonth);

  const dashboard = orgId ? await getPosSalesWorkflowDashboard(orgId) : null;
  const selectedEstablishment =
    params.establishmentId
      ? dashboard?.establishments.find(
          (entry) => entry.id === params.establishmentId
        ) ?? null
      : dashboard?.establishments.find((entry) => entry.isHeadOffice) ??
        dashboard?.establishments[0] ??
        null;
  const outputReport =
    orgId && selectedEstablishment
      ? await buildOutputTaxReport({
          orgId,
          establishmentId: selectedEstablishment.id,
          periodYear: selectedYear,
          periodMonth: selectedMonth,
        })
      : null;
  const inputReport = orgId
    ? await buildInputTaxReport({
        orgId,
        periodYear: selectedYear,
        periodMonth: selectedMonth,
      })
    : null;
  const inventoryReport =
    orgId && selectedEstablishment
      ? await buildInventoryMovementReport({
          orgId,
          establishmentId: selectedEstablishment.id,
          periodYear: selectedYear,
          periodMonth: selectedMonth,
        })
      : null;
  const outputExportHref =
    selectedEstablishment
      ? `/api/tax/output-tax-report.csv?year=${selectedYear}&month=${selectedMonth}&establishmentId=${selectedEstablishment.id}`
      : "#";
  const inputExportHref = `/api/tax/input-tax-report.csv?year=${selectedYear}&month=${selectedMonth}`;
  const inventoryExportHref =
    selectedEstablishment
      ? `/api/tax/inventory-movement-report.csv?year=${selectedYear}&month=${selectedMonth}&establishmentId=${selectedEstablishment.id}`
      : "#";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Statutory Tax Reports"
        description="Section 87 output tax report by Bangkok tax month and place of business."
      />

      <Alert variant="warning">
        <AlertTriangle />
        <AlertDescription>
          Statutory reports are CSV-first v1 workpapers. Excel/PDF formats,
          branch-level input propagation, processor-fee VAT lanes, and PP36 reclaim
          lanes remain deferred until source establishment mapping is complete.
        </AlertDescription>
      </Alert>

      {!orgId || !dashboard || !selectedEstablishment || !outputReport || !inputReport || !inventoryReport ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-2 py-12 text-center">
            <FileText className="size-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Select an organization to view statutory tax reports.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Report Filters</CardTitle>
            </CardHeader>
            <CardContent>
              <form className="grid gap-4 md:grid-cols-4">
                <div className="space-y-2">
                  <Label htmlFor="year">Year</Label>
                  <Input
                    id="year"
                    name="year"
                    type="number"
                    min="2000"
                    max="2100"
                    defaultValue={selectedYear}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="month">Month</Label>
                  <Input
                    id="month"
                    name="month"
                    type="number"
                    min="1"
                    max="12"
                    defaultValue={selectedMonth}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="establishmentId">Place of business</Label>
                  <NativeSelect
                    id="establishmentId"
                    name="establishmentId"
                    className="w-full"
                    defaultValue={selectedEstablishment.id}
                  >
                    {dashboard.establishments.map((establishment) => (
                      <option key={establishment.id} value={establishment.id}>
                        {establishment.branchNumber}{" "}
                        {establishment.nameEn ?? establishment.nameTh ?? ""}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
                <div className="flex items-end">
                  <Button type="submit">Apply</Button>
                </div>
              </form>
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Report Rows</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold">
                  {outputReport.totals.saleCount}
                </div>
                <p className="text-xs text-muted-foreground">
                  POS-primary rows only.
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Tax Base</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold">
                  <Amount value={outputReport.totals.taxBaseExVat} />
                </div>
                <p className="text-xs text-muted-foreground">
                  Before output VAT.
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Output VAT</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold">
                  <Amount value={outputReport.totals.vatAmount} />
                </div>
                <p className="text-xs text-muted-foreground">
                  Ties to PP30 output VAT.
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Gross Sales</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold">
                  <Amount value={outputReport.totals.amountIncludingVat} />
                </div>
                <p className="text-xs text-muted-foreground">
                  VAT-inclusive POS amount.
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle>Output Tax Report</CardTitle>
                <Button
                  variant="outline"
                  size="sm"
                  render={<a href={outputExportHref} />}
                >
                  Download Output CSV
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {outputReport.rows.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No reportable POS sales for this period.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tax date</TableHead>
                      <TableHead>Branch</TableHead>
                      <TableHead>Invoice</TableHead>
                      <TableHead>Channel</TableHead>
                      <TableHead className="text-right">Base</TableHead>
                      <TableHead className="text-right">VAT</TableHead>
                      <TableHead className="text-right">Gross</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {outputReport.rows.map((row) => (
                      <TableRow key={row.saleId}>
                        <TableCell>{row.taxDate}</TableCell>
                        <TableCell>{row.branchNumber}</TableCell>
                        <TableCell>
                          {row.taxInvoiceType} {row.taxInvoiceNumber}
                        </TableCell>
                        <TableCell>{row.channel}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          <Amount value={row.taxBaseExVat} />
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          <Amount value={row.vatAmount} />
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          <Amount value={row.amountIncludingVat} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Daily Totals</CardTitle>
            </CardHeader>
            <CardContent>
              {outputReport.dailySummary.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No daily totals for this period.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tax date</TableHead>
                      <TableHead className="text-right">Rows</TableHead>
                      <TableHead className="text-right">Base</TableHead>
                      <TableHead className="text-right">VAT</TableHead>
                      <TableHead className="text-right">Gross</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {outputReport.dailySummary.map((row) => (
                      <TableRow key={row.taxDate}>
                        <TableCell>{row.taxDate}</TableCell>
                        <TableCell className="text-right">
                          {row.saleCount}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          <Amount value={row.taxBaseExVat} />
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          <Amount value={row.vatAmount} />
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          <Amount value={row.amountIncludingVat} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle>Input Tax Report</CardTitle>
                <Button
                  variant="outline"
                  size="sm"
                  render={<a href={inputExportHref} />}
                >
                  Download Input CSV
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Input VAT is currently shown at organization scope until VAT
                input sources carry place-of-business IDs. Output and goods
                reports below remain filtered to the selected place of business.
              </p>
              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <p className="text-sm text-muted-foreground">Rows</p>
                  <p className="text-2xl font-semibold">
                    {inputReport.totals.rowCount}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Tax base</p>
                  <p className="text-2xl font-semibold">
                    <Amount value={inputReport.totals.baseAmount} />
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Input VAT</p>
                  <p className="text-2xl font-semibold">
                    <Amount value={inputReport.totals.vatAmount} />
                  </p>
                </div>
              </div>
              {inputReport.rows.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No claimable input VAT for this period.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tax invoice date</TableHead>
                      <TableHead>Supplier</TableHead>
                      <TableHead>Tax invoice</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Base</TableHead>
                      <TableHead className="text-right">VAT</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {inputReport.rows.map((row) => (
                      <TableRow key={row.inputItemId}>
                        <TableCell>{row.taxInvoiceDate}</TableCell>
                        <TableCell>
                          <div>{row.vendorName}</div>
                          <div className="text-xs text-muted-foreground">
                            {row.vendorTaxId}
                          </div>
                        </TableCell>
                        <TableCell>
                          {row.taxInvoiceSubtype} {row.taxInvoiceNo}
                        </TableCell>
                        <TableCell>{row.status}</TableCell>
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

          <Card>
            <CardHeader>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle>Goods and Raw Materials Report</CardTitle>
                <Button
                  variant="outline"
                  size="sm"
                  render={<a href={inventoryExportHref} />}
                >
                  Download Goods CSV
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-5">
                <div>
                  <p className="text-sm text-muted-foreground">Movements</p>
                  <p className="text-2xl font-semibold">
                    {inventoryReport.totals.movementCount}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Opening qty</p>
                  <p className="text-2xl font-semibold">
                    {quantity(inventoryReport.totals.openingQuantity)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Inbound qty</p>
                  <p className="text-2xl font-semibold">
                    {quantity(inventoryReport.totals.inboundQuantity)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Outbound qty</p>
                  <p className="text-2xl font-semibold">
                    {quantity(inventoryReport.totals.outboundQuantity)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Closing qty</p>
                  <p className="text-2xl font-semibold">
                    {quantity(inventoryReport.totals.closingQuantity)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Movement value</p>
                  <p className="text-2xl font-semibold">
                    <Amount value={inventoryReport.totals.movementValue} />
                  </p>
                </div>
              </div>
              {inventoryReport.skuSummary.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No inventory movements for this period.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>SKU</TableHead>
                      <TableHead>Unit</TableHead>
                      <TableHead className="text-right">Opening</TableHead>
                      <TableHead className="text-right">In</TableHead>
                      <TableHead className="text-right">Out</TableHead>
                      <TableHead className="text-right">Net</TableHead>
                      <TableHead className="text-right">Closing</TableHead>
                      <TableHead className="text-right">Value</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {inventoryReport.skuSummary.map((row) => (
                      <TableRow key={row.skuId}>
                        <TableCell>
                          <div>{row.skuCode}</div>
                          <div className="text-xs text-muted-foreground">
                            {row.skuName}
                          </div>
                        </TableCell>
                        <TableCell>{row.unitOfMeasure}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {quantity(row.openingQuantity)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {quantity(row.inboundQuantity)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {quantity(row.outboundQuantity)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {quantity(row.netQuantity)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {quantity(row.closingQuantity)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          <Amount value={row.movementValue} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
              <div className="space-y-2">
                <h3 className="text-sm font-medium">Movement Detail</h3>
                {inventoryReport.rows.length === 0 ? (
                  <p className="py-4 text-sm text-muted-foreground">
                    No movement detail for this period.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>SKU</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Source</TableHead>
                        <TableHead>JE</TableHead>
                        <TableHead className="text-right">In</TableHead>
                        <TableHead className="text-right">Out</TableHead>
                        <TableHead className="text-right">Net</TableHead>
                        <TableHead className="text-right">Value</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {inventoryReport.rows.slice(0, 50).map((row) => (
                        <TableRow key={row.movementId}>
                          <TableCell>{row.movementDate}</TableCell>
                          <TableCell>
                            <div>{row.skuCode}</div>
                            <div className="text-xs text-muted-foreground">
                              {row.skuName}
                            </div>
                          </TableCell>
                          <TableCell>{row.movementType}</TableCell>
                          <TableCell>
                            <SourceCell
                              sourceEntityType={row.sourceEntityType}
                              sourceEntityId={row.sourceEntityId}
                            />
                          </TableCell>
                          <TableCell className="font-mono text-xs text-muted-foreground">
                            {shortId(row.journalEntryId)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {quantity(row.inboundQuantity)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {quantity(row.outboundQuantity)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {quantity(row.netQuantity)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            <Amount value={row.totalCost} />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
