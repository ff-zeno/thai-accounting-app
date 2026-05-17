import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ClipboardList } from "lucide-react";
import { getInventoryCountDetail } from "@/lib/db/queries/inventory";
import { getActiveOrgId } from "@/lib/utils/org-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type InventoryCountPageProps = {
  params: Promise<{ id: string }>;
};

function amount(value: string | null | undefined, digits = 2) {
  return Number(value ?? 0).toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
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

export default async function InventoryCountPage({ params }: InventoryCountPageProps) {
  const { id } = await params;
  const orgId = await getActiveOrgId();
  const detail = orgId ? await getInventoryCountDetail(orgId, id) : null;

  if (orgId && !detail) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Inventory Count Detail
          </h1>
          <p className="text-sm text-muted-foreground">
            Count items, variance value, reconciliation status, and generated movements.
          </p>
        </div>
        <Button variant="outline" render={<Link href="/inventory" />}>
          <ArrowLeft className="mr-2 size-4" />
          Inventory
        </Button>
      </div>

      {!orgId || !detail ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-2 py-12 text-center">
            <ClipboardList className="size-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Select an organization to view count detail.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Count Date</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold">{detail.count.countDate}</div>
                <p className="text-xs text-muted-foreground">{detail.count.countType}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Status</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold">{detail.count.status}</div>
                <p className="text-xs text-muted-foreground">
                  Reconciled {dateTime(detail.count.reconciledAt)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Variance</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold">
                  {amount(detail.count.totalVarianceValueThb)}
                </div>
                <p className="text-xs text-muted-foreground">{detail.items.length} items</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Branch</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold">
                  {detail.count.branchNumber}
                </div>
                <p className="text-xs text-muted-foreground">
                  {detail.count.establishmentName || "Inventory branch"}
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Count Items</CardTitle>
            </CardHeader>
            <CardContent>
              {detail.items.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No count items recorded yet.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>SKU</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead className="text-right">System</TableHead>
                      <TableHead className="text-right">Counted</TableHead>
                      <TableHead className="text-right">Variance</TableHead>
                      <TableHead className="text-right">Value</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detail.items.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>
                          <Link
                            className="font-medium underline-offset-4 hover:underline"
                            href={`/inventory/skus/${item.skuId}`}
                          >
                            {item.skuCode}
                          </Link>
                          {item.nameEn ? (
                            <div className="text-xs text-muted-foreground">{item.nameEn}</div>
                          ) : null}
                        </TableCell>
                        <TableCell>{item.category ?? "-"}</TableCell>
                        <TableCell>{item.varianceReason ?? "-"}</TableCell>
                        <TableCell className="text-right font-mono">
                          {amount(item.systemQuantity, 4)}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {amount(item.countedQuantity, 4)}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {amount(item.variance, 4)}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {amount(item.varianceValueThb)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Generated Movements</CardTitle>
            </CardHeader>
            <CardContent>
              {detail.movements.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No variance movements generated yet.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>SKU</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>JE</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">Unit cost</TableHead>
                      <TableHead className="text-right">Value</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detail.movements.map((movement) => (
                      <TableRow key={movement.id}>
                        <TableCell>{dateTime(movement.movementAt)}</TableCell>
                        <TableCell>{movement.skuCode}</TableCell>
                        <TableCell>{movement.movementType}</TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {shortId(movement.journalEntryId)}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {amount(movement.quantity, 4)}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {amount(movement.unitCost, 4)}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {amount(movement.totalCost)}
                        </TableCell>
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
