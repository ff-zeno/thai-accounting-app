import { and, asc, eq, sql } from "drizzle-orm";
import { db, type DbConnection } from "@/lib/db";
import { establishments, inventoryMovements, skus } from "@/lib/db/schema";
import { orgScopeAlive } from "@/lib/db/helpers/org-scope";
import { SECTION_87_REPORT_SOURCES } from "./output-tax-report";

export type InventoryMovementReportRow = {
  movementId: string;
  movementDate: string;
  branchNumber: string;
  skuCode: string;
  skuName: string;
  unitOfMeasure: string;
  movementType: string;
  sourceEntityType: string | null;
  sourceEntityId: string | null;
  journalEntryId: string | null;
  inboundQuantity: string;
  outboundQuantity: string;
  netQuantity: string;
  unitCost: string | null;
  totalCost: string;
  runningQuantityAfter: string | null;
};

export type InventoryMovementReportSkuSummary = {
  skuId: string;
  skuCode: string;
  skuName: string;
  unitOfMeasure: string;
  openingQuantity: string;
  movementCount: number;
  inboundQuantity: string;
  outboundQuantity: string;
  netQuantity: string;
  closingQuantity: string;
  movementValue: string;
};

export type InventoryMovementReport = {
  orgId: string;
  establishmentId: string;
  periodYear: number;
  periodMonth: number;
  rows: InventoryMovementReportRow[];
  skuSummary: InventoryMovementReportSkuSummary[];
  totals: {
    movementCount: number;
    openingQuantity: string;
    inboundQuantity: string;
    outboundQuantity: string;
    netQuantity: string;
    closingQuantity: string;
    movementValue: string;
  };
  sourceUrls: typeof SECTION_87_REPORT_SOURCES;
};

function periodStart(periodYear: number, periodMonth: number) {
  return `${periodYear}-${String(periodMonth).padStart(2, "0")}-01`;
}

function nextPeriodStart(periodYear: number, periodMonth: number) {
  const nextMonth = periodMonth === 12 ? 1 : periodMonth + 1;
  const nextYear = periodMonth === 12 ? periodYear + 1 : periodYear;
  return `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`;
}

function movementDateExpr() {
  return sql<string>`(${inventoryMovements.movementAt} AT TIME ZONE 'Asia/Bangkok')::date::text`;
}

function inboundQuantitySql() {
  return sql<string>`CASE WHEN ${inventoryMovements.movementType} IN ('purchase_in', 'import_in', 'return_in', 'adjustment_in', 'transfer_in', 'count_variance_in') THEN ${inventoryMovements.quantity} ELSE 0 END`;
}

function outboundQuantitySql() {
  return sql<string>`CASE WHEN ${inventoryMovements.movementType} IN ('sale_out', 'return_out', 'adjustment_out', 'transfer_out', 'count_variance_out', 'shrinkage') THEN ABS(${inventoryMovements.quantity}) ELSE 0 END`;
}

function movementWhere(data: {
  orgId: string;
  establishmentId: string;
  periodYear: number;
  periodMonth: number;
}) {
  const start = periodStart(data.periodYear, data.periodMonth);
  const end = nextPeriodStart(data.periodYear, data.periodMonth);

  return and(
    eq(inventoryMovements.orgId, data.orgId),
    eq(inventoryMovements.establishmentId, data.establishmentId),
    sql`${inventoryMovements.deletedAt} IS NULL`,
    sql`(${inventoryMovements.movementAt} AT TIME ZONE 'Asia/Bangkok')::date >= ${start}::date`,
    sql`(${inventoryMovements.movementAt} AT TIME ZONE 'Asia/Bangkok')::date < ${end}::date`
  );
}

export async function buildInventoryMovementReport(
  data: {
    orgId: string;
    establishmentId: string;
    periodYear: number;
    periodMonth: number;
  },
  tx: DbConnection = db
): Promise<InventoryMovementReport> {
  if (data.periodMonth < 1 || data.periodMonth > 12) {
    throw new Error("Inventory movement report periodMonth must be between 1 and 12");
  }

  const [establishment] = await tx
    .select({ id: establishments.id })
    .from(establishments)
    .where(
      and(
        ...orgScopeAlive(establishments, data.orgId),
        eq(establishments.id, data.establishmentId)
      )
    )
    .limit(1);
  if (!establishment) {
    throw new Error("Inventory movement report establishment not found");
  }

  const dateExpr = movementDateExpr();
  const baseWhere = movementWhere(data);
  const start = periodStart(data.periodYear, data.periodMonth);
  const end = nextPeriodStart(data.periodYear, data.periodMonth);
  const inboundExpr = inboundQuantitySql();
  const outboundExpr = outboundQuantitySql();

  const rows = await tx
    .select({
      movementId: inventoryMovements.id,
      movementDate: dateExpr,
      branchNumber: establishments.branchNumber,
      skuCode: skus.skuCode,
      skuName: sql<string>`COALESCE(${skus.nameTh}, ${skus.nameEn}, '')`,
      unitOfMeasure: skus.unitOfMeasure,
      movementType: inventoryMovements.movementType,
      sourceEntityType: inventoryMovements.sourceEntityType,
      sourceEntityId: inventoryMovements.sourceEntityId,
      journalEntryId: inventoryMovements.journalEntryId,
      inboundQuantity: sql<string>`(${inboundExpr})::numeric(14,4)::text`,
      outboundQuantity: sql<string>`(${outboundExpr})::numeric(14,4)::text`,
      netQuantity: sql<string>`${inventoryMovements.quantity}::numeric(14,4)::text`,
      unitCost: inventoryMovements.unitCost,
      totalCost: inventoryMovements.totalCost,
      runningQuantityAfter: inventoryMovements.runningQuantityAfter,
    })
    .from(inventoryMovements)
    .innerJoin(
      skus,
      and(eq(skus.id, inventoryMovements.skuId), eq(skus.orgId, inventoryMovements.orgId))
    )
    .innerJoin(
      establishments,
      and(
        eq(establishments.id, inventoryMovements.establishmentId),
        eq(establishments.orgId, inventoryMovements.orgId)
      )
    )
    .where(baseWhere)
    .orderBy(
      asc(sql`(${inventoryMovements.movementAt} AT TIME ZONE 'Asia/Bangkok')::date`),
      asc(skus.skuCode),
      asc(inventoryMovements.id)
    );

  const skuSummary = await tx
    .select({
      skuId: skus.id,
      skuCode: skus.skuCode,
      skuName: sql<string>`COALESCE(${skus.nameTh}, ${skus.nameEn}, '')`,
      unitOfMeasure: skus.unitOfMeasure,
      openingQuantity: sql<string>`COALESCE((
        SELECT opening.running_quantity_after
        FROM inventory_movements opening
        WHERE opening.org_id = ${data.orgId}
          AND opening.establishment_id = ${data.establishmentId}
          AND opening.sku_id = ${skus.id}
          AND opening.deleted_at IS NULL
          AND (opening.movement_at AT TIME ZONE 'Asia/Bangkok')::date < ${start}::date
        ORDER BY opening.movement_at DESC, opening.created_at DESC, opening.id DESC
        LIMIT 1
      ), 0)::numeric(14,4)::text`,
      movementCount: sql<number>`COUNT(*)::int`,
      inboundQuantity: sql<string>`COALESCE(SUM(${inboundQuantitySql()}), 0)::numeric(14,4)::text`,
      outboundQuantity: sql<string>`COALESCE(SUM(${outboundQuantitySql()}), 0)::numeric(14,4)::text`,
      netQuantity: sql<string>`COALESCE(SUM(${inventoryMovements.quantity}), 0)::numeric(14,4)::text`,
      closingQuantity: sql<string>`COALESCE((
        SELECT closing.running_quantity_after
        FROM inventory_movements closing
        WHERE closing.org_id = ${data.orgId}
          AND closing.establishment_id = ${data.establishmentId}
          AND closing.sku_id = ${skus.id}
          AND closing.deleted_at IS NULL
          AND (closing.movement_at AT TIME ZONE 'Asia/Bangkok')::date < ${end}::date
        ORDER BY closing.movement_at DESC, closing.created_at DESC, closing.id DESC
        LIMIT 1
      ), 0)::numeric(14,4)::text`,
      movementValue: sql<string>`COALESCE(SUM(${inventoryMovements.totalCost}), 0)::numeric(14,2)::text`,
    })
    .from(inventoryMovements)
    .innerJoin(
      skus,
      and(eq(skus.id, inventoryMovements.skuId), eq(skus.orgId, inventoryMovements.orgId))
    )
    .where(baseWhere)
    .groupBy(skus.id, skus.skuCode, skus.nameTh, skus.nameEn, skus.unitOfMeasure)
    .orderBy(asc(skus.skuCode));

  const [periodTotals] = await tx
    .select({
      movementCount: sql<number>`COUNT(*)::int`,
      inboundQuantity: sql<string>`COALESCE(SUM(${inboundQuantitySql()}), 0)::numeric(14,4)::text`,
      outboundQuantity: sql<string>`COALESCE(SUM(${outboundQuantitySql()}), 0)::numeric(14,4)::text`,
      netQuantity: sql<string>`COALESCE(SUM(${inventoryMovements.quantity}), 0)::numeric(14,4)::text`,
      movementValue: sql<string>`COALESCE(SUM(${inventoryMovements.totalCost}), 0)::numeric(14,2)::text`,
    })
    .from(inventoryMovements)
    .where(baseWhere);
  const totals = {
    movementCount: periodTotals?.movementCount ?? 0,
    openingQuantity: skuSummary
      .reduce((sum, row) => sum + Number(row.openingQuantity), 0)
      .toFixed(4),
    inboundQuantity: periodTotals?.inboundQuantity ?? "0.0000",
    outboundQuantity: periodTotals?.outboundQuantity ?? "0.0000",
    netQuantity: periodTotals?.netQuantity ?? "0.0000",
    closingQuantity: skuSummary
      .reduce((sum, row) => sum + Number(row.closingQuantity), 0)
      .toFixed(4),
    movementValue: periodTotals?.movementValue ?? "0.00",
  };

  return {
    orgId: data.orgId,
    establishmentId: data.establishmentId,
    periodYear: data.periodYear,
    periodMonth: data.periodMonth,
    rows,
    skuSummary,
    totals,
    sourceUrls: SECTION_87_REPORT_SOURCES,
  };
}
