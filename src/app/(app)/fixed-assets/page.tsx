import Link from "next/link";
import { AlertTriangle, Calculator, Download, Landmark, Plus, Upload } from "lucide-react";
import { getVerifiedOrgId } from "@/lib/utils/org-context";
import { getFixedAssetsDashboard } from "@/lib/db/queries/fixed-assets";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Amount } from "@/components/ui/amount";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
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

function label(value: string) {
  return value.replaceAll("_", " ");
}

export default async function FixedAssetsPage() {
  const orgId = await getVerifiedOrgId();
  const dashboard = orgId ? await getFixedAssetsDashboard(orgId) : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Fixed Asset Register"
        description="Asset register, tax-life cap, and straight-line depreciation schedule."
      >
        <Button variant="outline" render={<Link href="/fixed-assets/import" />}>
          <Upload className="mr-2 size-4" />
          Import CSV
        </Button>
        <Button render={<Link href="/fixed-assets/new" />}>
          <Plus className="mr-2 size-4" />
          New Asset
        </Button>
      </PageHeader>

      {!orgId || !dashboard ? (
        <Card>
          <CardContent>
            <EmptyState
              icon={<Landmark />}
              title="Select an organization to view fixed assets."
            />
          </CardContent>
        </Card>
      ) : (
        <>
          <Alert variant="warning">
            <AlertTriangle />
            <AlertTitle>Fixed assets are straight-line v1.</AlertTitle>
            <AlertDescription>
              Register, depreciation schedule, roll-forward, disposal, GL posting, and CSV
              import are testable. Declining-balance, units-of-production, impairment
              workflow, and method changes remain deferred/accountant-review cases.
            </AlertDescription>
          </Alert>

          <div className="grid gap-4 md:grid-cols-4">
            <StatCard
              label="Active Assets"
              value={dashboard.summary.activeAssetCount}
              hint={`${dashboard.summary.assetCount} total register rows.`}
            />
            <StatCard
              label="Original Cost"
              value={<Amount value={dashboard.summary.originalCost} />}
              hint="THB basis."
            />
            <StatCard
              label="Accumulated Depreciation"
              value={<Amount value={dashboard.summary.accumulatedDepreciation} />}
              hint="From schedule rows."
            />
            <StatCard
              label="Book Value"
              value={<Amount value={dashboard.summary.bookValue} />}
              hint="Cost less depreciation."
            />
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
                  <NativeSelect
                    id="category"
                    name="category"
                    className="w-full"
                    defaultValue="equipment"
                  >
                    {dashboard.categoryDefaults.map((category) => (
                      <option key={category.category} value={category.category}>
                        {label(category.category)}
                      </option>
                    ))}
                  </NativeSelect>
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
                <EmptyState size="sm" title="No fixed assets recorded yet." />
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
                        <TableCell>
                          <Amount value={asset.originalCost} />
                        </TableCell>
                        <TableCell>
                          <Amount value={asset.accumulatedDepreciation} />
                        </TableCell>
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
                      <TableCell>
                        <Amount value={row.openingCost} />
                      </TableCell>
                      <TableCell>
                        <Amount value={row.additions} />
                      </TableCell>
                      <TableCell>
                        <Amount value={row.disposals} />
                      </TableCell>
                      <TableCell>
                        <Amount value={row.depreciationInPeriod} />
                      </TableCell>
                      <TableCell>
                        <Amount value={row.closingCost} />
                      </TableCell>
                      <TableCell>
                        <Amount value={row.glVariance} nullDash />
                      </TableCell>
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
                      <TableCell>
                        <Amount value={row.bookValueAtDisposal} />
                      </TableCell>
                      <TableCell>
                        <Amount value={row.disposalProceeds} />
                      </TableCell>
                      <TableCell>
                        <Amount value={row.gainLossOnDisposal} />
                      </TableCell>
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
