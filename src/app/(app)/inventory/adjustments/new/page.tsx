import Link from "next/link";
import { ArrowLeft, Boxes } from "lucide-react";
import { recordInventoryAdjustmentAction } from "../../actions";
import { getInventorySkuOptions } from "@/lib/db/queries/inventory";
import { getActiveOrgId } from "@/lib/utils/org-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

async function submitAdjustment(formData: FormData) {
  "use server";
  await recordInventoryAdjustmentAction(formData);
}

export default async function NewInventoryAdjustmentPage() {
  const orgId = await getActiveOrgId();
  const skus = orgId ? await getInventorySkuOptions(orgId) : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            New Inventory Adjustment
          </h1>
          <p className="text-sm text-muted-foreground">
            Record shrinkage, found stock, or manual stock corrections as immutable inventory movements.
          </p>
        </div>
        <Button variant="outline" render={<Link href="/inventory" />}>
          <ArrowLeft className="mr-2 size-4" />
          Inventory
        </Button>
      </div>

      {!orgId ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-2 py-12 text-center">
            <Boxes className="size-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Select an organization to record inventory adjustments.
            </p>
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
                <select
                  id="skuId"
                  name="skuId"
                  required
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                >
                  <option value="">Select SKU</option>
                  {skus.map((sku) => (
                    <option key={sku.id} value={sku.id}>
                      {sku.skuCode}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="movementType">Type</Label>
                <select
                  id="movementType"
                  name="movementType"
                  required
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                  defaultValue="adjustment_out"
                >
                  <option value="adjustment_in">Found stock</option>
                  <option value="adjustment_out">Adjustment out</option>
                  <option value="shrinkage">Shrinkage</option>
                </select>
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
