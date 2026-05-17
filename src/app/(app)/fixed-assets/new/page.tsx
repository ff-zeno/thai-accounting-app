import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Landmark } from "lucide-react";
import { getFixedAssetsDashboard } from "@/lib/db/queries/fixed-assets";
import { getVerifiedOrgId } from "@/lib/utils/org-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createFixedAssetAction } from "../actions";
import { FixedAssetIntakeFields } from "../fixed-asset-intake-fields";

type FixedAssetNewPageProps = {
  searchParams: Promise<{ error?: string }>;
};

async function submitAsset(formData: FormData) {
  "use server";
  const result = await createFixedAssetAction(formData);
  if (result?.success && result.assetId) {
    redirect(`/fixed-assets/${result.assetId}`);
  }
  if (result?.error) {
    redirect(`/fixed-assets/new?error=${encodeURIComponent(result.error)}`);
  }
}

export default async function FixedAssetNewPage({
  searchParams,
}: FixedAssetNewPageProps) {
  const { error } = await searchParams;
  const orgId = await getVerifiedOrgId();
  const dashboard = orgId ? await getFixedAssetsDashboard(orgId) : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">New Fixed Asset</h1>
          <p className="text-sm text-muted-foreground">
            Manual asset intake with statutory tax-life defaults and depreciation start.
          </p>
        </div>
        <Button variant="outline" render={<Link href="/fixed-assets" />}>
          <ArrowLeft className="mr-2 size-4" />
          Fixed Assets
        </Button>
      </div>

      {!orgId || !dashboard ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-2 py-12 text-center">
            <Landmark className="size-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Select an organization to create fixed assets.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Asset Profile</CardTitle>
          </CardHeader>
          <CardContent>
            {error ? (
              <div className="mb-4 rounded-md border border-destructive/30 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            ) : null}
            <form action={submitAsset} className="grid gap-4 md:grid-cols-4">
              <FixedAssetIntakeFields categoryDefaults={dashboard.categoryDefaults} />
              <div className="md:col-span-4">
                <Button type="submit">Create Asset</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
