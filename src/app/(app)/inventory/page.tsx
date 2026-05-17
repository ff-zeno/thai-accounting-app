import Link from "next/link";
import { Boxes, Download } from "lucide-react";
import { getActiveOrgId } from "@/lib/utils/org-context";
import { getInventoryDashboard } from "@/lib/db/queries/inventory";
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
  addInventoryCountItemAction,
  createInventoryCountAction,
  createSkuAction,
  reconcileInventoryCountAction,
  recordInventoryMovementAction,
} from "./actions";

async function submitSku(formData: FormData) {
  "use server";
  await createSkuAction(formData);
}

async function submitMovement(formData: FormData) {
  "use server";
  await recordInventoryMovementAction(formData);
}

async function submitCount(formData: FormData) {
  "use server";
  await createInventoryCountAction(formData);
}

async function submitCountItem(formData: FormData) {
  "use server";
  await addInventoryCountItemAction(formData);
}

async function submitReconcileCount(formData: FormData) {
  "use server";
  await reconcileInventoryCountAction(formData);
}

function amount(value: string | null | undefined, digits = 2) {
  return Number(value ?? 0).toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function dateOnly(value: Date | string | null | undefined) {
  if (!value) return "No sales";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return value.slice(0, 10);
}

export default async function InventoryPage() {
  const orgId = await getActiveOrgId();
  const dashboard = orgId ? await getInventoryDashboard(orgId) : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Inventory Control Tower
          </h1>
          <p className="text-sm text-muted-foreground">
            SKU stock, weighted-average cost, movement ledger, and negative-inventory exceptions.
          </p>
        </div>
        <Button variant="outline" render={<Link href="/inventory/adjustments/new" />}>
          New Adjustment
        </Button>
      </div>

      <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-800">
        Inventory is weighted-average v1. FIFO, specific-ID costing, statutory
        true-up automation, demand forecasting, and adjustment approval workflow
        remain deferred; use accountant review for those cases before filing.
      </div>

      {!orgId || !dashboard ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-2 py-12 text-center">
            <Boxes className="size-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Select an organization to view inventory controls.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">SKUs</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold">{dashboard.summary.skuCount}</div>
                <p className="text-xs text-muted-foreground">
                  {dashboard.summary.inventoriableCount} inventoriable.
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Inventory Value</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold">
                  {amount(dashboard.summary.totalValue)}
                </div>
                <p className="text-xs text-muted-foreground">
                  Sum of SKU current value.
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Units On Hand</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold">
                  {amount(dashboard.summary.totalQuantity, 4)}
                </div>
                <p className="text-xs text-muted-foreground">
                  Org-wide quantity total.
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Low Stock</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold">
                  {dashboard.summary.lowStockSkuCount}
                </div>
                <p className="text-xs text-muted-foreground">
                  {dashboard.summary.negativeSkuCount} negative.
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Create SKU</CardTitle>
              </CardHeader>
              <CardContent>
                <form action={submitSku} className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="skuCode">SKU code</Label>
                    <Input id="skuCode" name="skuCode" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="nameEn">Name</Label>
                    <Input id="nameEn" name="nameEn" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="category">Category</Label>
                    <Input id="category" name="category" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="unitOfMeasure">Unit</Label>
                    <Input id="unitOfMeasure" name="unitOfMeasure" defaultValue="pcs" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="standardCost">Standard cost</Label>
                    <Input id="standardCost" name="standardCost" inputMode="decimal" defaultValue="0.0000" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="reorderPointQuantity">Reorder point</Label>
                    <Input id="reorderPointQuantity" name="reorderPointQuantity" inputMode="decimal" defaultValue="0.0000" />
                  </div>
                  <div className="self-end">
                    <Button type="submit">Create SKU</Button>
                  </div>
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Manual Movement</CardTitle>
              </CardHeader>
              <CardContent>
                <form action={submitMovement} className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="skuId">SKU</Label>
                    <select
                      id="skuId"
                      name="skuId"
                      required
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                    >
                      <option value="">Select SKU</option>
                      {dashboard.recentSkus.map((sku) => (
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
                      defaultValue="adjustment_in"
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
                    <Input id="quantity" name="quantity" inputMode="decimal" placeholder="10.0000" required />
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
                    <Button type="submit" disabled={dashboard.recentSkus.length === 0}>
                      Record Adjustment
                    </Button>
                  </div>
                </form>
                <p className="mt-3 text-xs text-muted-foreground">
                  Sales, purchases, and imports must be posted through their source workflows so inventory, VAT, and GL stay tied out.
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle>Create Count</CardTitle>
              </CardHeader>
              <CardContent>
                <form action={submitCount} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="countDate">Date</Label>
                    <Input id="countDate" name="countDate" type="date" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="countType">Type</Label>
                    <select
                      id="countType"
                      name="countType"
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                      defaultValue="cycle"
                    >
                      <option value="cycle">Cycle</option>
                      <option value="spot">Spot</option>
                      <option value="full">Full</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="countNotes">Notes</Label>
                    <Input id="countNotes" name="notes" />
                  </div>
                  <Button type="submit">Create Count</Button>
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Add Count Item</CardTitle>
              </CardHeader>
              <CardContent>
                <form action={submitCountItem} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="countId">Count</Label>
                    <select
                      id="countId"
                      name="countId"
                      required
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                    >
                      <option value="">Select count</option>
                      {dashboard.recentCounts
                        .filter((count) => count.status !== "reconciled")
                        .map((count) => (
                          <option key={count.id} value={count.id}>
                            {count.countDate} / {count.countType}
                          </option>
                        ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="countSkuId">SKU</Label>
                    <select
                      id="countSkuId"
                      name="countSkuId"
                      required
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                    >
                      <option value="">Select SKU</option>
                      {dashboard.recentSkus.map((sku) => (
                        <option key={sku.id} value={sku.id}>
                          {sku.skuCode}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="countedQuantity">Counted quantity</Label>
                    <Input id="countedQuantity" name="countedQuantity" inputMode="decimal" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="varianceReason">Reason</Label>
                    <select
                      id="varianceReason"
                      name="varianceReason"
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                      defaultValue="count_error"
                    >
                      <option value="count_error">Count error</option>
                      <option value="shrinkage">Shrinkage</option>
                      <option value="damage">Damage</option>
                      <option value="unrecorded_sale">Unrecorded sale</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  <Button
                    type="submit"
                    disabled={
                      dashboard.recentSkus.length === 0 ||
                      dashboard.recentCounts.every((count) => count.status === "reconciled")
                    }
                  >
                    Save Count Item
                  </Button>
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Reconcile Count</CardTitle>
              </CardHeader>
              <CardContent>
                <form action={submitReconcileCount} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="reconcileCountId">Count</Label>
                    <select
                      id="reconcileCountId"
                      name="countId"
                      required
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                    >
                      <option value="">Select count</option>
                      {dashboard.recentCounts
                        .filter((count) => count.status !== "reconciled")
                        .map((count) => (
                          <option key={count.id} value={count.id}>
                            {count.countDate} / {count.itemCount} items / {amount(count.totalVarianceValueThb)}
                          </option>
                        ))}
                    </select>
                  </div>
                  <Button
                    type="submit"
                    disabled={dashboard.recentCounts.every((count) => count.status === "reconciled")}
                  >
                    Reconcile Count
                  </Button>
                </form>
                <p className="mt-3 text-xs text-muted-foreground">
                  Reconciliation posts count variance movements and locks the count.
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Low Stock Watch</CardTitle>
            </CardHeader>
            <CardContent>
              {dashboard.lowStockSkus.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No SKU is at or below its reorder point.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>SKU</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Branch</TableHead>
                      <TableHead className="text-right">On hand</TableHead>
                      <TableHead className="text-right">Reorder point</TableHead>
                      <TableHead>Last movement</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dashboard.lowStockSkus.map((sku) => (
                      <TableRow key={sku.id}>
                        <TableCell>
                          <Link
                            className="font-medium underline-offset-4 hover:underline"
                            href={`/inventory/skus/${sku.id}`}
                          >
                            {sku.skuCode}
                          </Link>
                          {sku.nameEn ? (
                            <div className="text-xs text-muted-foreground">{sku.nameEn}</div>
                          ) : null}
                        </TableCell>
                        <TableCell>{sku.category ?? "-"}</TableCell>
                        <TableCell>{sku.branchNumber ?? "All"}</TableCell>
                        <TableCell className="text-right font-mono">
                          {amount(sku.currentQuantity, 4)}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {amount(sku.reorderPointQuantity, 4)}
                        </TableCell>
                        <TableCell>{dateOnly(sku.lastMovementAt)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>SKU Inventory</CardTitle>
            </CardHeader>
            <CardContent>
              {dashboard.recentSkus.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No SKUs recorded yet.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>SKU</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">Avg cost</TableHead>
                      <TableHead className="text-right">Value</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dashboard.recentSkus.map((sku) => (
                      <TableRow key={sku.id}>
                        <TableCell className="font-medium">
                          <Link
                            className="underline-offset-4 hover:underline"
                            href={`/inventory/skus/${sku.id}`}
                          >
                            {sku.skuCode}
                          </Link>
                        </TableCell>
                        <TableCell>{sku.nameEn ?? sku.nameTh ?? "-"}</TableCell>
                        <TableCell>{sku.category ?? "-"}</TableCell>
                        <TableCell className="text-right font-mono">{amount(sku.currentQuantity, 4)}</TableCell>
                        <TableCell className="text-right font-mono">{amount(sku.currentAvgCost, 4)}</TableCell>
                        <TableCell className="text-right font-mono">{amount(sku.currentValue)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent Counts</CardTitle>
            </CardHeader>
            <CardContent>
              {dashboard.recentCounts.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No inventory counts recorded yet.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Items</TableHead>
                      <TableHead className="text-right">Variance value</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dashboard.recentCounts.map((count) => (
                      <TableRow key={count.id}>
                        <TableCell>
                          <Link
                            className="font-medium underline-offset-4 hover:underline"
                            href={`/inventory/counts/${count.id}`}
                          >
                            {count.countDate}
                          </Link>
                        </TableCell>
                        <TableCell>{count.countType}</TableCell>
                        <TableCell>{count.status}</TableCell>
                        <TableCell className="text-right font-mono">{count.itemCount}</TableCell>
                        <TableCell className="text-right font-mono">
                          {amount(count.totalVarianceValueThb)}
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
              <CardTitle>Inventory Roll-forward</CardTitle>
              <Button size="sm" variant="outline" render={<Link href="/api/inventory/roll-forward.csv" />}>
                <Download className="mr-2 size-4" />
                CSV
              </Button>
            </CardHeader>
            <CardContent>
              {dashboard.rollForward.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No inventory movement for the current Bangkok month.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>SKU</TableHead>
                      <TableHead className="text-right">Opening qty</TableHead>
                      <TableHead className="text-right">In</TableHead>
                      <TableHead className="text-right">Out</TableHead>
                      <TableHead className="text-right">Adjust</TableHead>
                      <TableHead className="text-right">Closing qty</TableHead>
                      <TableHead className="text-right">Closing value</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dashboard.rollForward.slice(0, 20).map((row) => (
                      <TableRow key={row.skuId}>
                        <TableCell className="font-medium">{row.skuCode}</TableCell>
                        <TableCell className="text-right font-mono">
                          {amount(row.openingQuantity, 4)}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {amount(row.inboundQuantity, 4)}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {amount(row.outboundQuantity, 4)}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {amount(row.adjustmentQuantity, 4)}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {amount(row.closingQuantity, 4)}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {amount(row.closingValue)}
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
              <CardTitle>Aged Inventory</CardTitle>
              <Button size="sm" variant="outline" render={<Link href="/api/inventory/aged.csv" />}>
                <Download className="mr-2 size-4" />
                CSV
              </Button>
            </CardHeader>
            <CardContent>
              {dashboard.agedInventory.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No positive on-hand inventory to age.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>SKU</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">Value</TableHead>
                      <TableHead>Last sale</TableHead>
                      <TableHead className="text-right">Days</TableHead>
                      <TableHead>Bucket</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dashboard.agedInventory.slice(0, 20).map((row) => (
                      <TableRow key={row.skuId}>
                        <TableCell className="font-medium">{row.skuCode}</TableCell>
                        <TableCell className="text-right font-mono">
                          {amount(row.currentQuantity, 4)}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {amount(row.currentValue)}
                        </TableCell>
                        <TableCell>
                          {dateOnly(row.lastSaleAt)}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {row.daysSinceLastSale ?? "-"}
                        </TableCell>
                        <TableCell>{row.ageBucket.replace("_", "-")}</TableCell>
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
