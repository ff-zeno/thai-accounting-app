import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Upload } from "lucide-react";
import { getVerifiedOrgId } from "@/lib/utils/org-context";
import { getFixedAssetsByIds } from "@/lib/db/queries/fixed-assets";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { importFixedAssetsCsvAction } from "../actions";

type FixedAssetImportPageProps = {
  searchParams: Promise<{ error?: string; status?: string; ids?: string; total?: string }>;
};

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const maxImportedAssetLinks = 50;

function importStatus(count: number) {
  return `Imported ${count} fixed ${count === 1 ? "asset" : "assets"}`;
}

const sampleCsv = [
  "asset_code,name_en,name_th,category,acquisition_date,original_cost,salvage_value,useful_life_months,depreciation_start_date,serial_number,location,notes",
  "FA-2026-ONB-1,Office notebook,,computer_hardware,2026-01-15,45000.00,0.00,36,2026-01-15,SN-001,Bangkok HQ,opening import",
].join("\n");

async function submitImport(formData: FormData) {
  "use server";
  const result = await importFixedAssetsCsvAction(formData);
  if ("success" in result && result.success) {
    const ids = result.assetIds.slice(0, maxImportedAssetLinks).join(",");
    redirect(
      `/fixed-assets/import?status=${encodeURIComponent(
        importStatus(result.createdCount)
      )}&ids=${encodeURIComponent(ids)}&total=${result.createdCount}`
    );
  }
  if ("error" in result && result.error) {
    redirect(`/fixed-assets/import?error=${encodeURIComponent(result.error)}`);
  }
}

export default async function FixedAssetImportPage({
  searchParams,
}: FixedAssetImportPageProps) {
  const orgId = await getVerifiedOrgId();
  const messages = await searchParams;
  const importedAssetIds = (messages.ids?.split(",").map((id) => id.trim()) ?? [])
    .filter((id) => uuidPattern.test(id))
    .slice(0, maxImportedAssetLinks);
  const importedAssetRows =
    orgId && importedAssetIds.length > 0
      ? await getFixedAssetsByIds(orgId, importedAssetIds)
      : [];
  const importedAssetById = new Map(
    importedAssetRows.map((asset) => [asset.id, asset])
  );
  const importedAssets = importedAssetIds
    .map((id) => importedAssetById.get(id))
    .filter((asset): asset is (typeof importedAssetRows)[number] => Boolean(asset));
  const importedAssetTotal = Number(messages.total ?? importedAssets.length);
  const importedAssetOverflow =
    Number.isFinite(importedAssetTotal) && importedAssetTotal > importedAssets.length
      ? importedAssetTotal - importedAssets.length
      : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Fixed Asset CSV Import
          </h1>
          <p className="text-sm text-muted-foreground">
            Onboard prior asset registers into the same fixed-asset ledger used by depreciation.
          </p>
        </div>
        <Button variant="outline" render={<Link href="/fixed-assets" />}>
          <ArrowLeft className="mr-2 size-4" />
          Fixed Assets
        </Button>
      </div>

      {messages.error ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {messages.error}
        </div>
      ) : null}
      {messages.status ? (
        <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700">
          {messages.status}
        </div>
      ) : null}
      {importedAssets.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Imported Assets</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 sm:grid-cols-2">
              {importedAssets.map((asset) => (
                <Link
                  key={asset.id}
                  href={`/fixed-assets/${asset.id}`}
                  className="rounded-md border px-3 py-2 text-sm underline-offset-4 hover:underline"
                >
                  <span className="font-medium">{asset.assetCode}</span>
                  <span className="block text-xs text-muted-foreground">
                    {asset.nameEn} - {asset.acquisitionDate}
                  </span>
                </Link>
              ))}
            </div>
            {importedAssetOverflow > 0 ? (
              <p className="mt-3 text-xs text-muted-foreground">
                {importedAssetOverflow} more imported assets are available in the fixed asset register.
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {!orgId ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-2 py-12 text-center">
            <Upload className="size-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Select an organization to import fixed assets.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
          <Card>
            <CardHeader>
              <CardTitle>Import CSV</CardTitle>
            </CardHeader>
            <CardContent>
              <form action={submitImport} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="csvText">CSV rows</Label>
                  <Textarea
                    id="csvText"
                    name="csvText"
                    className="min-h-64 font-mono text-xs"
                    placeholder={sampleCsv}
                    required
                  />
                </div>
                <Button type="submit">
                  <Upload className="mr-2 size-4" />
                  Import Fixed Assets
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Required Format</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>
                Required headers: name_en, category, acquisition_date, original_cost.
              </p>
              <p>
                Optional headers: asset_code, name_th, salvage_value, useful_life_months,
                depreciation_start_date, serial_number, location, notes.
              </p>
              <p>
                Dates use YYYY-MM-DD. Amounts use non-negative THB values with up to two decimals.
              </p>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
