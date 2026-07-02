import Link from "next/link";
import { ArrowLeft, Download, Landmark } from "lucide-react";
import { getFixedAssetRollForward } from "@/lib/db/queries/fixed-assets";
import { getVerifiedOrgId } from "@/lib/utils/org-context";
import { Amount } from "@/components/ui/amount";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
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
      <PageHeader
        title="Fixed Asset Roll Forward"
        description="Opening cost plus additions less disposals, with depreciation by category."
      >
        <Button variant="outline" render={<Link href="/fixed-assets" />}>
          <ArrowLeft className="mr-2 size-4" />
          Fixed Assets
        </Button>
      </PageHeader>

      {!orgId ? (
        <Card>
          <CardContent>
            <EmptyState
              icon={<Landmark />}
              title="Select an organization to view fixed asset reports."
            />
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
            <StatCard
              label="Opening Cost"
              value={<Amount value={totals.openingCost.toFixed(2)} />}
            />
            <StatCard
              label="Additions"
              value={<Amount value={totals.additions.toFixed(2)} />}
            />
            <StatCard
              label="Disposals"
              value={<Amount value={totals.disposals.toFixed(2)} />}
            />
            <StatCard
              label="Closing Cost"
              value={<Amount value={totals.closingCost.toFixed(2)} />}
            />
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
                      <TableCell className="text-right">
                        <Amount value={row.openingCost} />
                      </TableCell>
                      <TableCell className="text-right">
                        <Amount value={row.additions} />
                      </TableCell>
                      <TableCell className="text-right">
                        <Amount value={row.disposals} />
                      </TableCell>
                      <TableCell className="text-right">
                        <Amount value={row.depreciationInPeriod} />
                      </TableCell>
                      <TableCell className="text-right">
                        <Amount value={row.closingCost} />
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {row.glAssetAccountCode ?? "-"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Amount value={row.glClosingCost} nullDash />
                      </TableCell>
                      <TableCell className="text-right">
                        <Amount value={row.glVariance} nullDash />
                      </TableCell>
                    </TableRow>
                  ))}
                  {rows.length > 0 ? (
                    <TableRow>
                      <TableCell className="font-medium">Total</TableCell>
                      <TableCell className="text-right">
                        <Amount value={totals.openingCost.toFixed(2)} />
                      </TableCell>
                      <TableCell className="text-right">
                        <Amount value={totals.additions.toFixed(2)} />
                      </TableCell>
                      <TableCell className="text-right">
                        <Amount value={totals.disposals.toFixed(2)} />
                      </TableCell>
                      <TableCell className="text-right">
                        <Amount value={totals.depreciationInPeriod.toFixed(2)} />
                      </TableCell>
                      <TableCell className="text-right">
                        <Amount value={totals.closingCost.toFixed(2)} />
                      </TableCell>
                      <TableCell />
                      <TableCell className="text-right">
                        <Amount
                          value={
                            totals.hasUntiedGlRows
                              ? null
                              : totals.glClosingCost.toFixed(2)
                          }
                          nullDash
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <Amount
                          value={
                            totals.hasUntiedGlRows
                              ? null
                              : totals.glVariance.toFixed(2)
                          }
                          nullDash
                        />
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
