import Link from "next/link";
import { ArrowLeft, Download, Landmark } from "lucide-react";
import { getFixedAssetRollForward } from "@/lib/db/queries/fixed-assets";
import { getVerifiedOrgId } from "@/lib/utils/org-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type FixedAssetRollForwardPageProps = {
  searchParams: Promise<{ year?: string }>;
};

function amount(value: string | null | undefined) {
  return Number(value ?? 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function amountOrDash(value: string | null | undefined) {
  return value === null || value === undefined ? "-" : amount(value);
}

function label(value: string) {
  return value.replaceAll("_", " ");
}

function parseYear(value: string | undefined) {
  const parsed = value ? Number.parseInt(value, 10) : new Date().getUTCFullYear();
  return Number.isInteger(parsed) && parsed >= 2000 && parsed <= 2200
    ? parsed
    : new Date().getUTCFullYear();
}

export default async function FixedAssetRollForwardPage({
  searchParams,
}: FixedAssetRollForwardPageProps) {
  const { year: yearParam } = await searchParams;
  const year = parseYear(yearParam);
  const orgId = await getVerifiedOrgId();
  const rows = orgId
    ? await getFixedAssetRollForward({
        orgId,
        fromDate: `${year}-01-01`,
        toDate: `${year}-12-31`,
      })
    : [];

  const totals = rows.reduce(
    (sum, row) => ({
      openingCost: sum.openingCost + Number(row.openingCost),
      additions: sum.additions + Number(row.additions),
      disposals: sum.disposals + Number(row.disposals),
      depreciationInPeriod:
        sum.depreciationInPeriod + Number(row.depreciationInPeriod),
      closingCost: sum.closingCost + Number(row.closingCost),
      glClosingCost:
        row.glClosingCost === null
          ? sum.glClosingCost
          : sum.glClosingCost + Number(row.glClosingCost),
      glVariance:
        row.glVariance === null
          ? sum.glVariance
          : sum.glVariance + Number(row.glVariance),
      hasUntiedGlRows:
        sum.hasUntiedGlRows ||
        row.glClosingCost === null ||
        row.glVariance === null,
    }),
    {
      openingCost: 0,
      additions: 0,
      disposals: 0,
      depreciationInPeriod: 0,
      closingCost: 0,
      glClosingCost: 0,
      glVariance: 0,
      hasUntiedGlRows: false,
    }
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Fixed Asset Roll Forward
          </h1>
          <p className="text-sm text-muted-foreground">
            Opening cost plus additions less disposals, with depreciation by category.
          </p>
        </div>
        <Button variant="outline" render={<Link href="/fixed-assets" />}>
          <ArrowLeft className="mr-2 size-4" />
          Fixed Assets
        </Button>
      </div>

      {!orgId ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-2 py-12 text-center">
            <Landmark className="size-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Select an organization to view fixed asset reports.
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
              <form className="flex flex-wrap items-end gap-3">
                <div className="space-y-2">
                  <Label htmlFor="year">Year</Label>
                  <Input
                    id="year"
                    name="year"
                    inputMode="numeric"
                    defaultValue={year}
                    className="w-32"
                    required
                  />
                </div>
                <Button type="submit" variant="outline">
                  Apply
                </Button>
                <Button
                  variant="outline"
                  render={<Link href={`/api/fixed-assets/roll-forward.csv?year=${year}`} />}
                >
                  <Download className="mr-2 size-4" />
                  CSV
                </Button>
              </form>
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Opening Cost</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold">
                  {amount(totals.openingCost.toFixed(2))}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Additions</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold">
                  {amount(totals.additions.toFixed(2))}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Disposals</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold">
                  {amount(totals.disposals.toFixed(2))}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Closing Cost</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold">
                  {amount(totals.closingCost.toFixed(2))}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Roll Forward Detail</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Opening cost</TableHead>
                    <TableHead className="text-right">Additions</TableHead>
                    <TableHead className="text-right">Disposals</TableHead>
                    <TableHead className="text-right">Depreciation</TableHead>
                    <TableHead className="text-right">Closing cost</TableHead>
                    <TableHead className="text-right">GL account</TableHead>
                    <TableHead className="text-right">GL balance</TableHead>
                    <TableHead className="text-right">Variance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.category}>
                      <TableCell>{label(row.category)}</TableCell>
                      <TableCell className="text-right font-mono">
                        {amount(row.openingCost)}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {amount(row.additions)}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {amount(row.disposals)}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {amount(row.depreciationInPeriod)}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {amount(row.closingCost)}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {row.glAssetAccountCode ?? "-"}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {amountOrDash(row.glClosingCost)}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {amountOrDash(row.glVariance)}
                      </TableCell>
                    </TableRow>
                  ))}
                  {rows.length > 0 ? (
                    <TableRow>
                      <TableCell className="font-medium">Total</TableCell>
                      <TableCell className="text-right font-mono">
                        {amount(totals.openingCost.toFixed(2))}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {amount(totals.additions.toFixed(2))}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {amount(totals.disposals.toFixed(2))}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {amount(totals.depreciationInPeriod.toFixed(2))}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {amount(totals.closingCost.toFixed(2))}
                      </TableCell>
                      <TableCell />
                      <TableCell className="text-right font-mono">
                        {totals.hasUntiedGlRows
                          ? "-"
                          : amount(totals.glClosingCost.toFixed(2))}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {totals.hasUntiedGlRows
                          ? "-"
                          : amount(totals.glVariance.toFixed(2))}
                      </TableCell>
                    </TableRow>
                  ) : null}
                  {rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-muted-foreground">
                        No roll-forward rows for {year}.
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
