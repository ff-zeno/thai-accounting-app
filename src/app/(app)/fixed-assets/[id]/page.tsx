import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Calculator, Landmark } from "lucide-react";
import { getFixedAssetDetail } from "@/lib/db/queries/fixed-assets";
import { getVerifiedOrgId } from "@/lib/utils/org-context";
import { StatusBadge } from "@/components/status-badge";
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
import {
  buildAssetDepreciationScheduleAction,
  disposeFixedAssetAction,
} from "../actions";

type FixedAssetDetailPageProps = {
  params: Promise<{ id: string }>;
};

async function submitSchedule(formData: FormData) {
  "use server";
  await buildAssetDepreciationScheduleAction(formData);
}

async function submitDisposal(formData: FormData) {
  "use server";
  await disposeFixedAssetAction(formData);
}

function label(value: string) {
  return value.replaceAll("_", " ");
}

function periodLabel(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function shortId(value: string | null | undefined) {
  return value ? value.slice(0, 8) : "-";
}

export default async function FixedAssetDetailPage({
  params,
}: FixedAssetDetailPageProps) {
  const { id } = await params;
  const orgId = await getVerifiedOrgId();
  const detail = orgId ? await getFixedAssetDetail(orgId, id) : null;

  if (orgId && !detail) {
    notFound();
  }

  const title = detail?.asset.assetCode ?? "Fixed Asset";

  return (
    <div className="space-y-6">
      <PageHeader
        title={title}
        description="Depreciation schedule, book-tax cap, GL trace, and disposal controls."
      >
        <Button variant="outline" render={<Link href="/fixed-assets" />}>
          <ArrowLeft className="mr-2 size-4" />
          Fixed Assets
        </Button>
      </PageHeader>

      {!orgId || !detail ? (
        <Card>
          <CardContent>
            <EmptyState
              icon={<Landmark />}
              title="Select an organization to view fixed asset detail."
            />
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <StatCard
              label="Original Cost"
              value={<Amount value={detail.asset.originalCost} />}
              hint={
                <>
                  Salvage <Amount value={detail.asset.salvageValue} />.
                </>
              }
            />
            <StatCard
              label="Accumulated Dep."
              value={<Amount value={detail.summary.accumulatedDepreciation} />}
              hint={`${detail.summary.postedRows} posted rows.`}
            />
            <StatCard
              label="Book Value"
              value={<Amount value={detail.summary.bookValue} />}
              hint={`${detail.summary.scheduleRows} schedule rows.`}
            />
            <StatCard
              label="Book-Tax Addback"
              value={<Amount value={detail.summary.bookTaxDifference} />}
              hint="From tax depreciation cap."
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Asset Profile</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 text-sm md:grid-cols-4">
              <div>
                <p className="text-muted-foreground">Name</p>
                <p className="font-medium">{detail.asset.nameEn ?? detail.asset.nameTh}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Category</p>
                <p className="font-medium">{label(detail.asset.category)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Branch</p>
                <p className="font-medium">
                  {detail.asset.branchNumber ?? "-"} {detail.asset.establishmentName}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Status</p>
                <p>
                  <StatusBadge
                    status={detail.asset.disposedAt ? "disposed" : "active"}
                    label={
                      detail.asset.disposedAt
                        ? `Disposed ${detail.asset.disposedAt}`
                        : "Active"
                    }
                  />
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Acquired</p>
                <p className="font-medium">{detail.asset.acquisitionDate}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Depreciation start</p>
                <p className="font-medium">{detail.asset.depreciationStartDate}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Book / tax life</p>
                <p className="font-medium">
                  {detail.asset.usefulLifeMonths} / {detail.asset.taxUsefulLifeMonthsMinimum}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Serial / location</p>
                <p className="font-medium">
                  {detail.asset.serialNumber ?? "-"} / {detail.asset.location ?? "-"}
                </p>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Build Schedule</CardTitle>
              </CardHeader>
              <CardContent>
                <form action={submitSchedule} className="flex flex-wrap items-end gap-3">
                  <input type="hidden" name="assetId" value={detail.asset.id} />
                  <Button
                    type="submit"
                    variant="outline"
                    disabled={Boolean(detail.asset.disposedAt)}
                  >
                    <Calculator className="mr-2 size-4" />
                    Build Missing Rows
                  </Button>
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Dispose Asset</CardTitle>
              </CardHeader>
              <CardContent>
                {detail.asset.disposedAt ? (
                  <div className="text-sm text-muted-foreground">
                    Disposed for <Amount value={detail.asset.disposalProceeds} /> with
                    gain/loss <Amount value={detail.asset.gainLossOnDisposal} />.
                  </div>
                ) : (
                  <div className="space-y-4">
                    <Button
                      variant="outline"
                      render={<Link href={`/fixed-assets/${detail.asset.id}/dispose`} />}
                    >
                      Open Disposal Flow
                    </Button>
                    <form action={submitDisposal} className="grid gap-4 sm:grid-cols-[1fr_1fr_auto]">
                      <input type="hidden" name="assetId" value={detail.asset.id} />
                      <div className="space-y-2">
                        <Label htmlFor="disposedAt">Disposal date</Label>
                        <Input id="disposedAt" name="disposedAt" type="date" required />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="disposalProceeds">Proceeds</Label>
                        <Input id="disposalProceeds" name="disposalProceeds" inputMode="decimal" required />
                      </div>
                      <div className="self-end">
                        <Button type="submit" variant="outline">
                          Dispose
                        </Button>
                      </div>
                    </form>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Depreciation Register</CardTitle>
            </CardHeader>
            <CardContent>
              {detail.schedule.length === 0 ? (
                <EmptyState size="sm" title="No depreciation schedule rows yet." />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Period</TableHead>
                      <TableHead className="text-right">Book dep.</TableHead>
                      <TableHead className="text-right">Tax dep.</TableHead>
                      <TableHead className="text-right">Addback</TableHead>
                      <TableHead className="text-right">Accum. dep.</TableHead>
                      <TableHead className="text-right">Book value</TableHead>
                      <TableHead>JE</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detail.schedule.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell>{periodLabel(row.periodYear, row.periodMonth)}</TableCell>
                        <TableCell className="text-right">
                          <Amount value={row.depreciationAmount} />
                        </TableCell>
                        <TableCell className="text-right">
                          <Amount value={row.taxDepreciationCappedAmount} />
                        </TableCell>
                        <TableCell className="text-right">
                          <Amount value={row.bookTaxDifference} />
                        </TableCell>
                        <TableCell className="text-right">
                          <Amount value={row.accumulatedDepreciationAfter} />
                        </TableCell>
                        <TableCell className="text-right">
                          <Amount value={row.bookValueAfter} />
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {shortId(row.journalEntryId)}
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
