import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, CircleAlert, Landmark } from "lucide-react";
import { getFixedAssetDetail } from "@/lib/db/queries/fixed-assets";
import { getVerifiedOrgId } from "@/lib/utils/org-context";
import { StatusBadge } from "@/components/status-badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Amount } from "@/components/ui/amount";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/ui/page-header";
import { disposeFixedAssetAction } from "../../actions";

type FixedAssetDisposePageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
};

async function submitDisposal(formData: FormData) {
  "use server";
  const result = await disposeFixedAssetAction(formData);
  const assetId = String(formData.get("assetId") ?? "");
  if (result?.success && result.assetId) {
    redirect(`/fixed-assets/${result.assetId}`);
  }
  if (result?.error) {
    redirect(`/fixed-assets/${assetId}/dispose?error=${encodeURIComponent(result.error)}`);
  }
}

export default async function FixedAssetDisposePage({
  params,
  searchParams,
}: FixedAssetDisposePageProps) {
  const { id } = await params;
  const { error } = await searchParams;
  const orgId = await getVerifiedOrgId();
  const detail = orgId ? await getFixedAssetDetail(orgId, id) : null;

  if (orgId && !detail) {
    notFound();
  }

  const title = detail?.asset.assetCode ?? "Dispose Fixed Asset";

  return (
    <div className="space-y-6">
      <PageHeader
        title={title}
        description="Record disposal date and proceeds; gain or loss is calculated from posted book value."
      >
        <Button variant="outline" render={<Link href={`/fixed-assets/${id}`} />}>
          <ArrowLeft className="mr-2 size-4" />
          Asset Detail
        </Button>
      </PageHeader>

      {!orgId || !detail ? (
        <Card>
          <CardContent>
            <EmptyState
              icon={<Landmark />}
              title="Select an organization to dispose fixed assets."
            />
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_2fr]">
          <Card>
            <CardHeader>
              <CardTitle>Asset Snapshot</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div>
                <p className="text-muted-foreground">Name</p>
                <p className="font-medium">{detail.asset.nameEn ?? detail.asset.nameTh}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Original cost</p>
                <p className="font-medium">
                  <Amount value={detail.asset.originalCost} />
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Current book value</p>
                <p className="font-medium">
                  <Amount value={detail.summary.bookValue} />
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
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Disposal</CardTitle>
            </CardHeader>
            <CardContent>
              {error ? (
                <Alert variant="destructive" className="mb-4">
                  <CircleAlert />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              ) : null}
              {detail.asset.disposedAt ? (
                <p className="text-sm text-muted-foreground">
                  This asset was disposed for{" "}
                  <Amount value={detail.asset.disposalProceeds} /> with gain/loss{" "}
                  <Amount value={detail.asset.gainLossOnDisposal} />.
                </p>
              ) : (
                <form action={submitDisposal} className="grid gap-4 md:grid-cols-2">
                  <input type="hidden" name="assetId" value={detail.asset.id} />
                  <div className="space-y-2">
                    <Label htmlFor="disposedAt">Disposal date</Label>
                    <Input id="disposedAt" name="disposedAt" type="date" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="disposalProceeds">Proceeds</Label>
                    <Input id="disposalProceeds" name="disposalProceeds" inputMode="decimal" required />
                  </div>
                  <div className="md:col-span-2">
                    <Button type="submit" variant="outline">
                      Dispose Asset
                    </Button>
                  </div>
                </form>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
