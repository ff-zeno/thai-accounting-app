import { AlertTriangle, FileText } from "lucide-react";
import { getActiveOrgId } from "@/lib/utils/org-context";
import { listEstablishments } from "@/lib/db/queries/establishments";
import { buildOutputTaxReport } from "@/lib/tax/output-tax-report";
import { buildInputTaxReport } from "@/lib/tax/input-tax-report";
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

function parseMonth(value: string | undefined, fallback: number) {
  const parsed = value ? Number.parseInt(value, 10) : fallback;
  return parsed >= 1 && parsed <= 12 ? parsed : fallback;
}

function parseYear(value: string | undefined, fallback: number) {
  const parsed = value ? Number.parseInt(value, 10) : fallback;
  return parsed >= 2000 && parsed <= 2100 ? parsed : fallback;
}

export default async function TaxReportsPage({ searchParams }: ReportsPageProps) {
  const params = await searchParams;
  const orgId = await getActiveOrgId();
  const today = formatBangkokDate(new Date());
  const fallbackYear = Number(today.slice(0, 4));
  const fallbackMonth = Number(today.slice(5, 7));
  const selectedYear = parseYear(params.year, fallbackYear);
  const selectedMonth = parseMonth(params.month, fallbackMonth);

  const establishmentList = orgId ? await listEstablishments(orgId) : [];
  const selectedEstablishment =
    params.establishmentId
      ? establishmentList.find((entry) => entry.id === params.establishmentId) ??
        null
      : establishmentList.find((entry) => entry.isHeadOffice) ??
        establishmentList[0] ??
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
  const outputExportHref =
    selectedEstablishment
      ? `/api/tax/output-tax-report.csv?year=${selectedYear}&month=${selectedMonth}&establishmentId=${selectedEstablishment.id}`
      : "#";
  const inputExportHref = `/api/tax/input-tax-report.csv?year=${selectedYear}&month=${selectedMonth}`;

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

      {!orgId || !selectedEstablishment || !outputReport || !inputReport ? (
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
                    {establishmentList.map((establishment) => (
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
        </>
      )}
    </div>
  );
}
