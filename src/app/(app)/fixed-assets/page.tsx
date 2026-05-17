import Link from "next/link";
import { AlertTriangle, Calculator, Download, Landmark, Plus, Upload } from "lucide-react";
import { getVerifiedOrgId } from "@/lib/utils/org-context";
import { getFixedAssetsDashboard } from "@/lib/db/queries/fixed-assets";
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
import {
  buildAssetDepreciationScheduleAction,
  createFixedAssetAction,
  disposeFixedAssetAction,
  postAssetDepreciationForPeriodAction,
} from "./actions";

async function submitAsset(formData: FormData) {
  "use server";
  await createFixedAssetAction(formData);
}

async function submitSchedule(formData: FormData) {
  "use server";
  await buildAssetDepreciationScheduleAction(formData);
}

async function submitDisposal(formData: FormData) {
  "use server";
  await disposeFixedAssetAction(formData);
}

async function submitDepreciationPosting(formData: FormData) {
  "use server";
  await postAssetDepreciationForPeriodAction(formData);
}

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

export default async function FixedAssetsPage() {
  const orgId = await getVerifiedOrgId();
  const dashboard = orgId ? await getFixedAssetsDashboard(orgId) : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Fixed Asset Register
          </h1>
          <p className="text-sm text-muted-foreground">
            Asset register, tax-life cap, and straight-line depreciation schedule.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" render={<Link href="/fixed-assets/import" />}>
            <Upload className="mr-2 size-4" />
            Import CSV
          </Button>
          <Button render={<Link href="/fixed-assets/new" />}>
            <Plus className="mr-2 size-4" />
            New Asset
          </Button>
        </div>
      </div>

      {!orgId || !dashboard ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-2 py-12 text-center">
            <Landmark className="size-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Select an organization to view fixed assets.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card className="border-amber-200 bg-amber-50 text-amber-950">
            <CardContent className="flex gap-3 py-4 text-sm">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <div>
                <p className="font-medium">Fixed assets are straight-line v1.</p>
                <p className="mt-1 text-amber-900">
                  Register, depreciation schedule, roll-forward, disposal, GL posting, and CSV
                  import are testable. Declining-balance, units-of-production, impairment
                  workflow, and method changes remain deferred/accountant-review cases.
                </p>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Active Assets</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold">
                  {dashboard.summary.activeAssetCount}
                </div>
                <p className="text-xs text-muted-foreground">
                  {dashboard.summary.assetCount} total register rows.
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Original Cost</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold">
                  {amount(dashboard.summary.originalCost)}
                </div>
                <p className="text-xs text-muted-foreground">THB basis.</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Accumulated Depreciation</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold">
                  {amount(dashboard.summary.accumulatedDepreciation)}
                </div>
                <p className="text-xs text-muted-foreground">
                  From schedule rows.
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Book Value</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold">
                  {amount(dashboard.summary.bookValue)}
                </div>
                <p className="text-xs text-muted-foreground">
                  Cost less depreciation.
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Create Asset</CardTitle>
            </CardHeader>
            <CardContent>
              <form action={submitAsset} className="grid gap-4 md:grid-cols-4">
                <div className="space-y-2">
                  <Label htmlFor="assetCode">Asset code</Label>
                  <Input id="assetCode" name="assetCode" placeholder="auto" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="nameEn">Name EN</Label>
                  <Input id="nameEn" name="nameEn" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="nameTh">Name TH</Label>
                  <Input id="nameTh" name="nameTh" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="category">Category</Label>
                  <select
                    id="category"
                    name="category"
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                    defaultValue="equipment"
                  >
                    {dashboard.categoryDefaults.map((category) => (
                      <option key={category.category} value={category.category}>
                        {label(category.category)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="acquisitionDate">Acquisition date</Label>
                  <Input id="acquisitionDate" name="acquisitionDate" type="date" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="originalCost">Original cost</Label>
                  <Input id="originalCost" name="originalCost" inputMode="decimal" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="salvageValue">Salvage value</Label>
                  <Input id="salvageValue" name="salvageValue" inputMode="decimal" defaultValue="0.00" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="usefulLifeMonths">Book life months</Label>
                  <Input id="usefulLifeMonths" name="usefulLifeMonths" inputMode="numeric" defaultValue="60" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="depreciationStartDate">Depreciation start</Label>
                  <Input id="depreciationStartDate" name="depreciationStartDate" type="date" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="serialNumber">Serial</Label>
                  <Input id="serialNumber" name="serialNumber" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="location">Location</Label>
                  <Input id="location" name="location" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="notes">Notes</Label>
                  <Input id="notes" name="notes" />
                </div>
                <div className="md:col-span-4">
                  <Button type="submit">Create Asset</Button>
                </div>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Queue Depreciation</CardTitle>
            </CardHeader>
            <CardContent>
              <form
                action={submitDepreciationPosting}
                className="grid gap-4 md:grid-cols-[160px_140px_auto]"
              >
                <div className="space-y-2">
                  <Label htmlFor="periodYear">Year</Label>
                  <Input
                    id="periodYear"
                    name="periodYear"
                    inputMode="numeric"
                    defaultValue={new Date().getFullYear()}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="periodMonth">Month</Label>
                  <Input
                    id="periodMonth"
                    name="periodMonth"
                    inputMode="numeric"
                    min={1}
                    max={12}
                    defaultValue={new Date().getMonth() + 1}
                    required
                  />
                </div>
                <div className="flex items-end">
                  <Button type="submit" variant="outline">
                    <Calculator className="mr-2 size-4" />
                    Queue Depreciation
                  </Button>
                </div>
              </form>
              <p className="mt-2 text-xs text-muted-foreground">
                Builds missing schedule rows and queues the selected period for GL posting.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Asset Register</CardTitle>
            </CardHeader>
            <CardContent>
              {dashboard.recentAssets.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No fixed assets recorded yet.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Code</TableHead>
                      <TableHead>Asset</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Branch</TableHead>
                      <TableHead>Cost</TableHead>
                      <TableHead>Accum. dep.</TableHead>
                      <TableHead>Book / tax life</TableHead>
                      <TableHead>Schedule</TableHead>
                      <TableHead>Disposal</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dashboard.recentAssets.map((asset) => (
                      <TableRow key={asset.id}>
                        <TableCell>
                          <Link
                            className="font-medium underline-offset-4 hover:underline"
                            href={`/fixed-assets/${asset.id}`}
                          >
                            {asset.assetCode}
                          </Link>
                        </TableCell>
                        <TableCell>{asset.nameEn ?? asset.nameTh}</TableCell>
                        <TableCell>{label(asset.category)}</TableCell>
                        <TableCell>{asset.branchNumber ?? "-"}</TableCell>
                        <TableCell>{amount(asset.originalCost)}</TableCell>
                        <TableCell>{amount(asset.accumulatedDepreciation)}</TableCell>
                        <TableCell>
                          {asset.usefulLifeMonths} / {asset.taxUsefulLifeMonthsMinimum}
                        </TableCell>
                        <TableCell>
                          <form action={submitSchedule}>
                            <input type="hidden" name="assetId" value={asset.id} />
                            <Button type="submit" size="sm" variant="outline">
                              <Calculator className="mr-2 size-4" />
                              Build
                            </Button>
                            <span className="ml-2 text-xs text-muted-foreground">
                              {asset.scheduleRows} rows
                            </span>
                          </form>
                        </TableCell>
                        <TableCell>
                          {asset.disposedAt ? (
                            <span className="text-xs text-muted-foreground">
                              Disposed {asset.disposedAt}
                            </span>
                          ) : (
                            <form action={submitDisposal} className="flex flex-col gap-2">
                              <input type="hidden" name="assetId" value={asset.id} />
                              <Input
                                name="disposedAt"
                                type="date"
                                aria-label={`Disposal date for ${asset.assetCode}`}
                                required
                              />
                              <Input
                                name="disposalProceeds"
                                inputMode="decimal"
                                placeholder="Proceeds"
                                aria-label={`Disposal proceeds for ${asset.assetCode}`}
                                required
                              />
                              <Button type="submit" size="sm" variant="outline">
                                Dispose
                              </Button>
                            </form>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-3">
              <CardTitle>Roll Forward</CardTitle>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  render={<Link href="/fixed-assets/reports/roll-forward" />}
                >
                  Open Report
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  render={<Link href="/api/fixed-assets/roll-forward.csv" />}
                >
                  <Download className="mr-2 size-4" />
                  CSV
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Category</TableHead>
                    <TableHead>Opening cost</TableHead>
                    <TableHead>Additions</TableHead>
                    <TableHead>Disposals</TableHead>
                    <TableHead>Depreciation</TableHead>
                    <TableHead>Closing cost</TableHead>
                    <TableHead>GL variance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dashboard.rollForward.map((row) => (
                    <TableRow key={row.category}>
                      <TableCell>{label(row.category)}</TableCell>
                      <TableCell>{amount(row.openingCost)}</TableCell>
                      <TableCell>{amount(row.additions)}</TableCell>
                      <TableCell>{amount(row.disposals)}</TableCell>
                      <TableCell>{amount(row.depreciationInPeriod)}</TableCell>
                      <TableCell>{amount(row.closingCost)}</TableCell>
                      <TableCell>{amountOrDash(row.glVariance)}</TableCell>
                    </TableRow>
                  ))}
                  {dashboard.rollForward.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-muted-foreground">
                        No roll-forward rows yet.
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Disposal Register</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Disposed</TableHead>
                    <TableHead>Asset</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Book value</TableHead>
                    <TableHead>Proceeds</TableHead>
                    <TableHead>Gain / loss</TableHead>
                    <TableHead>Branch</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dashboard.disposalRegister.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>{row.disposedAt}</TableCell>
                      <TableCell>
                        <Link
                          className="font-medium underline-offset-4 hover:underline"
                          href={`/fixed-assets/${row.id}`}
                        >
                          {row.assetCode}
                        </Link>
                        <div className="text-xs text-muted-foreground">
                          {row.nameEn ?? row.nameTh}
                        </div>
                      </TableCell>
                      <TableCell>{label(row.category)}</TableCell>
                      <TableCell>{amount(row.bookValueAtDisposal)}</TableCell>
                      <TableCell>{amount(row.disposalProceeds)}</TableCell>
                      <TableCell>{amount(row.gainLossOnDisposal)}</TableCell>
                      <TableCell>{row.branchNumber ?? "-"}</TableCell>
                    </TableRow>
                  ))}
                  {dashboard.disposalRegister.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-muted-foreground">
                        No disposals in the current year.
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
