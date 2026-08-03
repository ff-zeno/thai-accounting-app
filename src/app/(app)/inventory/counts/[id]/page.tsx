import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ClipboardList } from "lucide-react";
import { getInventoryCountDetail } from "@/lib/db/queries/inventory";
import { getActiveOrgId } from "@/lib/utils/org-context";
import { Amount } from "@/components/ui/amount";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { StatusBadge } from "@/components/ui/status-badge";
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

export default async function InventoryCountPage({ params }: InventoryCountPageProps) {
  const { id } = await params;
  const orgId = await getActiveOrgId();
  const detail = orgId ? await getInventoryCountDetail(orgId, id) : null;

  if (orgId && !detail) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inventory Count Detail"
        description="Count items, variance value, reconciliation status, and generated movements."
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
              icon={<ClipboardList />}
              title="Select an organization to view count detail."
            />
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <StatCard
              label="Count Date"
              value={detail.count.countDate}
              hint={detail.count.countType}
            />
            <StatCard
              label="Status"
              value={<StatusBadge status={detail.count.status} />}
              hint={`Reconciled ${dateTime(detail.count.reconciledAt)}`}
            />
            <StatCard
              label="Variance"
              value={<Amount value={detail.count.totalVarianceValueThb} />}
              hint={`${detail.items.length} items`}
            />
            <StatCard
              label="Branch"
              value={detail.count.branchNumber}
              hint={detail.count.establishmentName || "Inventory branch"}
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Count Items</CardTitle>
            </CardHeader>
            <CardContent>
              {detail.items.length === 0 ? (
                <EmptyState size="sm" title="No count items recorded yet." />
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
                        <TableCell className="text-right tabular-nums">
                          {quantity(item.systemQuantity)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {quantity(item.countedQuantity)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {quantity(item.variance)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Amount value={item.varianceValueThb} />
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
                <EmptyState size="sm" title="No variance movements generated yet." />
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
                        <TableCell className="text-right tabular-nums">
                          {quantity(movement.quantity)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {quantity(movement.unitCost)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Amount value={movement.totalCost} />
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
