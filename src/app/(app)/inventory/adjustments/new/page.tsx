import Link from "next/link";
import { ArrowLeft, Boxes } from "lucide-react";
import { recordInventoryAdjustmentAction } from "../../actions";
import { getInventorySkuOptions } from "@/lib/db/queries/inventory";
import { getActiveOrgId } from "@/lib/utils/org-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { PageHeader } from "@/components/ui/page-header";

async function submitAdjustment(formData: FormData) {
  "use server";
  await recordInventoryAdjustmentAction(formData);
}

export default async function NewInventoryAdjustmentPage() {
  const orgId = await getActiveOrgId();
  const skus = orgId ? await getInventorySkuOptions(orgId) : [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="New Inventory Adjustment"
        description="Record shrinkage, found stock, or manual stock corrections as immutable inventory movements."
      >
        <Button variant="outline" render={<Link href="/inventory" />}>
          <ArrowLeft className="mr-2 size-4" />
          Inventory
        </Button>
      </PageHeader>

      {!orgId ? (
        <Card>
          <CardContent>
            <EmptyState
              icon={<Boxes />}
              title="Select an organization to record inventory adjustments."
            />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Adjustment Details</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={submitAdjustment} className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="skuId">SKU</Label>
                <NativeSelect id="skuId" name="skuId" required className="w-full">
                  <option value="">Select SKU</option>
                  {skus.map((sku) => (
                    <option key={sku.id} value={sku.id}>
                      {sku.skuCode}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <div className="space-y-2">
                <Label htmlFor="movementType">Type</Label>
                <NativeSelect
                  id="movementType"
                  name="movementType"
                  required
                  className="w-full"
                  defaultValue="adjustment_out"
                >
                  <option value="adjustment_in">Found stock</option>
                  <option value="adjustment_out">Adjustment out</option>
                  <option value="shrinkage">Shrinkage</option>
                </NativeSelect>
              </div>
              <div className="space-y-2">
                <Label htmlFor="movementDate">Date</Label>
                <Input id="movementDate" name="movementDate" type="date" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="quantity">Quantity</Label>
                <Input
                  id="quantity"
                  name="quantity"
                  inputMode="decimal"
                  placeholder="Positive quantity"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="unitCost">Unit cost</Label>
                <Input id="unitCost" name="unitCost" inputMode="decimal" defaultValue="0.0000" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <Input id="notes" name="notes" />
              </div>
              <div className="md:col-span-2">
                <Button type="submit" disabled={skus.length === 0}>
                  Record Adjustment
                </Button>
              </div>
            </form>
            <p className="mt-3 text-xs text-muted-foreground">
              Quantity is entered as a positive number; the adjustment type controls stock direction.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
