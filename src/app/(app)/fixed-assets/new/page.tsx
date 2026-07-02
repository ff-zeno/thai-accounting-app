import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, CircleAlert, Landmark } from "lucide-react";
import { getFixedAssetsDashboard } from "@/lib/db/queries/fixed-assets";
import { getVerifiedOrgId } from "@/lib/utils/org-context";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
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
      <PageHeader
        title="New Fixed Asset"
        description="Manual asset intake with statutory tax-life defaults and depreciation start."
      >
        <Button variant="outline" render={<Link href="/fixed-assets" />}>
          <ArrowLeft className="mr-2 size-4" />
          Fixed Assets
        </Button>
      </PageHeader>

      {!orgId || !dashboard ? (
        <Card>
          <CardContent>
            <EmptyState
              icon={<Landmark />}
              title="Select an organization to create fixed assets."
            />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Asset Profile</CardTitle>
          </CardHeader>
          <CardContent>
            {error ? (
              <Alert variant="destructive" className="mb-4">
                <CircleAlert />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
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
