import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Boxes } from "lucide-react";
import { updateSkuProfileAction } from "../../actions";
import { getInventorySkuDetail } from "@/lib/db/queries/inventory";
import { getActiveOrgId } from "@/lib/utils/org-context";
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

type InventorySkuPageProps = {
  params: Promise<{ id: string }>;
};

// 4-decimal inventory figures (quantities, unit costs) — not money amounts.
function quantity(value: string | null | undefined) {
  return Number(value ?? 0).toLocaleString("en-US", {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  });
}

function dateTime(value: Date | null | undefined) {
  return value
    ? new Intl.DateTimeFormat("en-GB", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Asia/Bangkok",
      }).format(value)
    : "-";
}

function shortId(value: string | null | undefined) {
  return value ? value.slice(0, 8) : "-";
}

function sourceLabel(sourceEntityType: string | null | undefined) {
  switch (sourceEntityType) {
    case "documents":
      return "Document";
    case "import_goods_lines":
      return "Import line";
    case "import_packets":
      return "Import";
    case "inventory_counts":
      return "Count";
    case "sales_transactions":
      return "Sale";
    case "manual":
      return "Manual";
    default:
      return sourceEntityType ?? "Manual";
  }
}

function sourceHref(
  sourceEntityType: string | null | undefined,
  sourceEntityId: string | null | undefined
) {
  if (!sourceEntityType || !sourceEntityId) return null;
  switch (sourceEntityType) {
    case "documents":
      return `/documents/${sourceEntityId}/review`;
    case "import_packets":
      return `/imports/${sourceEntityId}`;
    case "inventory_counts":
      return "/inventory";
    case "sales_transactions":
      return "/sales";
    default:
      return null;
  }
}

async function submitReorderPoint(formData: FormData) {
  "use server";
  await updateSkuProfileAction(formData);
}

function SourceCell({
  sourceEntityType,
  sourceEntityId,
}: {
  sourceEntityType: string | null | undefined;
  sourceEntityId: string | null | undefined;
}) {
  const href = sourceHref(sourceEntityType, sourceEntityId);
  const label = sourceLabel(sourceEntityType);
  if (!href) {
    return (
      <div>
        <div>{label}</div>
        <div className="text-xs text-muted-foreground">{shortId(sourceEntityId)}</div>
      </div>
    );
  }

  return (
    <Link className="font-medium underline-offset-4 hover:underline" href={href}>
      <span>{label}</span>
      <span className="block text-xs text-muted-foreground">
        {shortId(sourceEntityId)}
      </span>
    </Link>
  );
}

export default async function InventorySkuPage({ params }: InventorySkuPageProps) {
  const { id } = await params;
  const orgId = await getActiveOrgId();
  const detail = orgId ? await getInventorySkuDetail(orgId, id) : null;

  if (orgId && !detail) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={detail?.sku.skuCode ?? "SKU Detail"}
        description="Movement history, running cost, source evidence, and GL trace."
      >
        <Button variant="outline" render={<Link href="/inventory" />}>
          <ArrowLeft className="mr-2 size-4" />
          Inventory
        </Button>
      </PageHeader>

      {!orgId || !detail ? (
        <Card>
          <CardContent>
            <EmptyState
              icon={<Boxes />}
              title="Select an organization to view SKU detail."
            />
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <StatCard
              label="Quantity"
              value={quantity(detail.sku.currentQuantity)}
              hint={detail.sku.unitOfMeasure}
            />
            <StatCard
              label="Average Cost"
              value={quantity(detail.sku.currentAvgCost)}
              hint={detail.sku.valuationMethod}
            />
            <StatCard
              label="Inventory Value"
              value={<Amount value={detail.sku.currentValue} />}
              hint="Current SKU ledger value."
            />
            <StatCard
              label="Branch"
              value={detail.sku.branchNumber ?? "All"}
              hint={detail.sku.establishmentName || "Org-wide SKU"}
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>SKU Profile</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 text-sm md:grid-cols-4">
              <div>
                <p className="text-muted-foreground">Name</p>
                <p className="font-medium">{detail.sku.nameEn ?? detail.sku.nameTh ?? "-"}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Category</p>
                <p className="font-medium">{detail.sku.category ?? "-"}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Inventoriable</p>
                <p className="font-medium">{detail.sku.isInventoriable ? "Yes" : "No"}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Reorder point</p>
                <p className="font-medium">{quantity(detail.sku.reorderPointQuantity)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Standard cost</p>
                <p className="font-medium">{quantity(detail.sku.standardCost)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Last movement</p>
                <p className="font-medium">{dateTime(detail.sku.lastMovementAt)}</p>
              </div>
              <form action={submitReorderPoint} className="grid gap-3 md:col-span-4 md:grid-cols-6">
                <input type="hidden" name="skuId" value={detail.sku.id} />
                <div className="space-y-2">
                  <Label htmlFor="detailNameEn">Name</Label>
                  <Input
                    id="detailNameEn"
                    name="nameEn"
                    defaultValue={detail.sku.nameEn ?? ""}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="detailCategory">Category</Label>
                  <Input
                    id="detailCategory"
                    name="category"
                    defaultValue={detail.sku.category ?? ""}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="detailUnitOfMeasure">Unit</Label>
                  <Input
                    id="detailUnitOfMeasure"
                    name="unitOfMeasure"
                    defaultValue={detail.sku.unitOfMeasure ?? "pcs"}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="detailStandardCost">Standard cost</Label>
                  <Input
                    id="detailStandardCost"
                    name="standardCost"
                    inputMode="decimal"
                    defaultValue={detail.sku.standardCost ?? "0.0000"}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="detailReorderPointQuantity">Reorder point</Label>
                  <Input
                    id="detailReorderPointQuantity"
                    name="reorderPointQuantity"
                    inputMode="decimal"
                    defaultValue={detail.sku.reorderPointQuantity}
                  />
                </div>
                <div className="self-end">
                  <Button type="submit">Save SKU Profile</Button>
                </div>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Movement History</CardTitle>
            </CardHeader>
            <CardContent>
              {detail.movements.length === 0 ? (
                <EmptyState size="sm" title="No movements recorded for this SKU." />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead>JE</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">Unit cost</TableHead>
                      <TableHead className="text-right">Value</TableHead>
                      <TableHead className="text-right">Running qty</TableHead>
                      <TableHead>Notes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detail.movements.map((movement) => (
                      <TableRow key={movement.id}>
                        <TableCell>{dateTime(movement.movementAt)}</TableCell>
                        <TableCell>{movement.movementType}</TableCell>
                        <TableCell>
                          <SourceCell
                            sourceEntityType={movement.sourceEntityType}
                            sourceEntityId={movement.sourceEntityId}
                          />
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {shortId(movement.journalEntryId)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {quantity(movement.quantity)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {quantity(movement.unitCost)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Amount value={movement.totalCost} />
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {quantity(movement.runningQuantityAfter)}
                        </TableCell>
                        <TableCell>{movement.notes ?? "-"}</TableCell>
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
