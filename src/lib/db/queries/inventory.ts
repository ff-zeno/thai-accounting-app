import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { db, type DbConnection } from "../index";
import {
  auditLog,
  documents,
  establishments,
  inventoryCountItems,
  inventoryCounts,
  exceptionQueue,
  inventoryMovements,
  journalEntries,
  periodLocks,
  salesTransactions,
  skus,
} from "../schema";
import { orgScope } from "../helpers/org-scope";
import {
  applyWeightedAverageIssue,
  applyWeightedAverageReceipt,
} from "@/lib/inventory/weighted-average";
import { formatBangkokDate } from "@/lib/tax/filing-deadlines";
import {
  createJournalEntryWithConnection,
  getGlAccounts,
  seedStandardGlAccounts,
} from "./general-ledger";
import { enqueuePostingOutbox } from "./posting-outbox";

const IN_MOVEMENTS = new Set([
  "purchase_in",
  "import_in",
  "return_in",
  "adjustment_in",
  "transfer_in",
  "count_variance_in",
]);

const OUT_MOVEMENTS = new Set([
  "sale_out",
  "return_out",
  "adjustment_out",
  "transfer_out",
  "count_variance_out",
  "shrinkage",
]);

function fixed(value: number, digits: number) {
  return value.toFixed(digits);
}

function costBasis(sku: {
  currentAvgCost: string | null;
  lastKnownAvgCost: string | null;
  standardCost: string | null;
}) {
  const currentAvgCost = Number(sku.currentAvgCost ?? "0");
  if (currentAvgCost > 0) return currentAvgCost;

  const lastKnownAvgCost = Number(sku.lastKnownAvgCost ?? "0");
  if (lastKnownAvgCost > 0) return lastKnownAvgCost;

  return Number(sku.standardCost ?? "0");
}

function periodStart(periodYear: number, periodMonth: number) {
  return `${periodYear}-${String(periodMonth).padStart(2, "0")}-01`;
}

function nextPeriodStart(periodYear: number, periodMonth: number) {
  const nextMonth = periodMonth === 12 ? 1 : periodMonth + 1;
  const nextYear = periodMonth === 12 ? periodYear + 1 : periodYear;
  return `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`;
}

function validatePeriod(periodYear: number, periodMonth: number) {
  if (!Number.isInteger(periodYear) || periodYear < 2000 || periodYear > 2200) {
    throw new Error("Inventory report periodYear is invalid");
  }
  if (!Number.isInteger(periodMonth) || periodMonth < 1 || periodMonth > 12) {
    throw new Error("Inventory report periodMonth must be between 1 and 12");
  }
}

async function postInventoryCogsEntry(
  tx: DbConnection,
  data: {
    orgId: string;
    movementId: string;
    movementAt: Date;
    skuCode: string;
    totalCost: string;
  }
) {
  if (Number(data.totalCost) <= 0) return null;

  const [existing] = await tx
    .select({ id: journalEntries.id })
    .from(journalEntries)
    .where(
      and(
        eq(journalEntries.orgId, data.orgId),
        eq(journalEntries.sourceEntityType, "inventory_movement"),
        eq(journalEntries.sourceEntityId, data.movementId),
        eq(journalEntries.postingKind, "inventory_cogs")
      )
    )
    .limit(1);
  if (existing) return existing.id;

  await seedStandardGlAccounts(data.orgId, tx);
  const accounts = await getGlAccounts(data.orgId, tx);
  const accountByCode = new Map(accounts.map((account) => [account.accountCode, account]));
  const cogsAccount = accountByCode.get("5110");
  const inventoryAccount = accountByCode.get("1160");
  if (!cogsAccount || !inventoryAccount) {
    throw new Error("Missing inventory COGS GL accounts");
  }

  const entryDate = formatBangkokDate(data.movementAt);
  const entryPrefix = `COGS-${entryDate.slice(0, 7)}-`;
  const [{ count }] = await tx
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(journalEntries)
    .where(
      and(
        eq(journalEntries.orgId, data.orgId),
        sql`${journalEntries.entryNumber} LIKE ${`${entryPrefix}%`}`
      )
    );

  const entry = await createJournalEntryWithConnection(
    {
      orgId: data.orgId,
      entryNumber: `${entryPrefix}${String((count ?? 0) + 1).padStart(3, "0")}`,
      entryDate,
      entryType: "auto_sales",
      postingKind: "inventory_cogs",
      sourceEntityType: "inventory_movement",
      sourceEntityId: data.movementId,
      description: `Inventory COGS ${data.skuCode} ${entryDate}`,
      lines: [
        {
          accountId: cogsAccount.id,
          description: `COGS ${data.skuCode}`,
          debitAmount: data.totalCost,
          creditAmount: "0.00",
          subledgerEntityType: "inventory_movement",
          subledgerEntityId: data.movementId,
        },
        {
          accountId: inventoryAccount.id,
          description: `Relieve inventory ${data.skuCode}`,
          debitAmount: "0.00",
          creditAmount: data.totalCost,
          subledgerEntityType: "inventory_movement",
          subledgerEntityId: data.movementId,
        },
      ],
    },
    tx
  );

  await tx.insert(auditLog).values({
    orgId: data.orgId,
    entityType: "journal_entry",
    entityId: entry.id,
    action: "create",
    newValue: {
      event: "inventory_cogs_posted",
      movementId: data.movementId,
      skuCode: data.skuCode,
      totalCost: data.totalCost,
    },
  });

  return entry.id;
}

async function postInventoryPurchaseEntry(
  tx: DbConnection,
  data: {
    orgId: string;
    movementId: string;
    movementAt: Date;
    skuCode: string;
    totalCost: string;
    vatAmount?: string;
    apAmount?: string;
    sourceEntityId: string;
  }
) {
  if (Number(data.totalCost) <= 0) return null;

  const [existing] = await tx
    .select({ id: journalEntries.id })
    .from(journalEntries)
    .where(
      and(
        eq(journalEntries.orgId, data.orgId),
        eq(journalEntries.sourceEntityType, "inventory_movement"),
        eq(journalEntries.sourceEntityId, data.movementId),
        eq(journalEntries.postingKind, "inventory_purchase")
      )
    )
    .limit(1);
  if (existing) return existing.id;

  await seedStandardGlAccounts(data.orgId, tx);
  const accounts = await getGlAccounts(data.orgId, tx);
  const accountByCode = new Map(accounts.map((account) => [account.accountCode, account]));
  const inventoryAccount = accountByCode.get("1160");
  const inputVatAccount = accountByCode.get("1251");
  const apAccount = accountByCode.get("2110");
  if (!inventoryAccount || !inputVatAccount || !apAccount) {
    throw new Error("Missing inventory purchase GL accounts");
  }
  const [sourceDocument] = await tx
    .select({
      vendorId: documents.vendorId,
      category: documents.category,
      vatAmount: documents.vatAmount,
      totalAmount: documents.totalAmount,
    })
    .from(documents)
    .where(
      and(
        eq(documents.orgId, data.orgId),
        eq(documents.id, data.sourceEntityId),
        isNull(documents.deletedAt)
      )
    )
    .limit(1);
  if (!sourceDocument) {
    throw new Error("Inventory purchase source document not found");
  }
  const vatAmount = Number(data.vatAmount ?? sourceDocument.vatAmount ?? "0").toFixed(2);
  const apAmount = Number(
    data.apAmount ?? sourceDocument.totalAmount ?? Number(data.totalCost) + Number(vatAmount)
  ).toFixed(2);

  const entryDate = formatBangkokDate(data.movementAt);
  const entryPrefix = `INVPUR-${entryDate.slice(0, 7)}-`;
  const [{ count }] = await tx
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(journalEntries)
    .where(
      and(
        eq(journalEntries.orgId, data.orgId),
        sql`${journalEntries.entryNumber} LIKE ${`${entryPrefix}%`}`
      )
    );

  const entry = await createJournalEntryWithConnection(
    {
      orgId: data.orgId,
      entryNumber: `${entryPrefix}${String((count ?? 0) + 1).padStart(3, "0")}`,
      entryDate,
      entryType: "auto_document",
      postingKind: "inventory_purchase",
      sourceEntityType: "inventory_movement",
      sourceEntityId: data.movementId,
      description: `Inventory purchase ${data.skuCode} ${entryDate}`,
      lines: [
        {
          accountId: inventoryAccount.id,
          description: `Receive inventory ${data.skuCode}`,
          debitAmount: data.totalCost,
          creditAmount: "0.00",
          subledgerEntityType: "inventory_movement",
          subledgerEntityId: data.movementId,
          allocationVendorId: sourceDocument?.vendorId,
          allocationCategory: sourceDocument?.category,
        },
        ...(Number(vatAmount) > 0
          ? [
              {
                accountId: inputVatAccount.id,
                description: "Domestic purchase input VAT",
                debitAmount: vatAmount,
                creditAmount: "0.00",
                subledgerEntityType: "documents",
                subledgerEntityId: data.sourceEntityId,
              },
            ]
          : []),
        {
          accountId: apAccount.id,
          description: "Domestic purchase payable",
          debitAmount: "0.00",
          creditAmount: apAmount,
          subledgerEntityType: "documents",
          subledgerEntityId: data.sourceEntityId,
        },
      ],
    },
    tx
  );

  await tx.insert(auditLog).values({
    orgId: data.orgId,
    entityType: "journal_entry",
    entityId: entry.id,
    action: "create",
    newValue: {
      event: "inventory_purchase_posted",
      movementId: data.movementId,
      sourceDocumentId: data.sourceEntityId,
      skuCode: data.skuCode,
      totalCost: data.totalCost,
      vatAmount,
      apAmount,
    },
  });

  return entry.id;
}

async function assertInventorySaleSource(
  tx: DbConnection,
  orgId: string,
  sourceEntityId: string | null | undefined
) {
  if (!sourceEntityId) {
    throw new Error("Sale-out inventory movements require a sales transaction source");
  }

  const [sourceSale] = await tx
    .select({ id: salesTransactions.id })
    .from(salesTransactions)
    .where(
      and(
        eq(salesTransactions.orgId, orgId),
        eq(salesTransactions.id, sourceEntityId),
        isNull(salesTransactions.deletedAt)
      )
    )
    .limit(1);

  if (!sourceSale) {
    throw new Error("Sale-out inventory source transaction not found");
  }
}

async function postInventoryCountVarianceEntry(
  tx: DbConnection,
  data: {
    orgId: string;
    movementId: string;
    movementAt: Date;
    skuCode: string;
    movementType: string;
    totalCost: string;
  }
) {
  if (Number(data.totalCost) <= 0) return null;

  const [existing] = await tx
    .select({ id: journalEntries.id })
    .from(journalEntries)
    .where(
      and(
        eq(journalEntries.orgId, data.orgId),
        eq(journalEntries.sourceEntityType, "inventory_movement"),
        eq(journalEntries.sourceEntityId, data.movementId),
        eq(journalEntries.postingKind, "inventory_count_variance")
      )
    )
    .limit(1);
  if (existing) return existing.id;

  await seedStandardGlAccounts(data.orgId, tx);
  const accounts = await getGlAccounts(data.orgId, tx);
  const accountByCode = new Map(accounts.map((account) => [account.accountCode, account]));
  const adjustmentAccount = accountByCode.get("5120");
  const inventoryAccount = accountByCode.get("1160");
  if (!adjustmentAccount || !inventoryAccount) {
    throw new Error("Missing inventory variance GL accounts");
  }

  const isVarianceIn =
    data.movementType === "count_variance_in" || data.movementType === "adjustment_in";
  const entryDate = formatBangkokDate(data.movementAt);
  const entryPrefix = `INVADJ-${entryDate.slice(0, 7)}-`;
  const [{ count }] = await tx
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(journalEntries)
    .where(
      and(
        eq(journalEntries.orgId, data.orgId),
        sql`${journalEntries.entryNumber} LIKE ${`${entryPrefix}%`}`
      )
    );

  const entry = await createJournalEntryWithConnection(
    {
      orgId: data.orgId,
      entryNumber: `${entryPrefix}${String((count ?? 0) + 1).padStart(3, "0")}`,
      entryDate,
      entryType: "auto_sales",
      postingKind: "inventory_count_variance",
      sourceEntityType: "inventory_movement",
      sourceEntityId: data.movementId,
      description: `Inventory count variance ${data.skuCode} ${entryDate}`,
      lines: isVarianceIn
        ? [
            {
              accountId: inventoryAccount.id,
              description: `Found inventory ${data.skuCode}`,
              debitAmount: data.totalCost,
              creditAmount: "0.00",
              subledgerEntityType: "inventory_movement",
              subledgerEntityId: data.movementId,
            },
            {
              accountId: adjustmentAccount.id,
              description: `Inventory count gain ${data.skuCode}`,
              debitAmount: "0.00",
              creditAmount: data.totalCost,
              subledgerEntityType: "inventory_movement",
              subledgerEntityId: data.movementId,
            },
          ]
        : [
            {
              accountId: adjustmentAccount.id,
              description: `Inventory count loss ${data.skuCode}`,
              debitAmount: data.totalCost,
              creditAmount: "0.00",
              subledgerEntityType: "inventory_movement",
              subledgerEntityId: data.movementId,
            },
            {
              accountId: inventoryAccount.id,
              description: `Write off inventory ${data.skuCode}`,
              debitAmount: "0.00",
              creditAmount: data.totalCost,
              subledgerEntityType: "inventory_movement",
              subledgerEntityId: data.movementId,
            },
          ],
    },
    tx
  );

  await tx.insert(auditLog).values({
    orgId: data.orgId,
    entityType: "journal_entry",
    entityId: entry.id,
    action: "create",
    newValue: {
      event: "inventory_count_variance_posted",
      movementId: data.movementId,
      movementType: data.movementType,
      skuCode: data.skuCode,
      totalCost: data.totalCost,
    },
  });

  return entry.id;
}

async function inventoryJournalEntryById(
  tx: DbConnection,
  orgId: string,
  entryId: string
) {
  const [entry] = await tx
    .select()
    .from(journalEntries)
    .where(and(eq(journalEntries.orgId, orgId), eq(journalEntries.id, entryId)))
    .limit(1);
  if (!entry) throw new Error("Inventory journal entry not found after posting");
  return entry;
}

export async function postInventoryMovementJournalEntry(
  tx: DbConnection,
  data: {
    orgId: string;
    movementId: string;
  }
) {
  const [movement] = await tx
    .select({
      id: inventoryMovements.id,
      movementAt: inventoryMovements.movementAt,
      movementType: inventoryMovements.movementType,
      totalCost: inventoryMovements.totalCost,
      sourceEntityType: inventoryMovements.sourceEntityType,
      sourceEntityId: inventoryMovements.sourceEntityId,
      establishmentId: inventoryMovements.establishmentId,
      journalEntryId: inventoryMovements.journalEntryId,
      skuCode: skus.skuCode,
    })
    .from(inventoryMovements)
    .innerJoin(
      skus,
      and(eq(skus.id, inventoryMovements.skuId), eq(skus.orgId, inventoryMovements.orgId))
    )
    .where(
      and(
        eq(inventoryMovements.orgId, data.orgId),
        eq(inventoryMovements.id, data.movementId),
        isNull(inventoryMovements.deletedAt)
      )
    )
    .limit(1);
  if (!movement) throw new Error("Inventory movement not found");

  if (movement.journalEntryId) {
    return inventoryJournalEntryById(tx, data.orgId, movement.journalEntryId);
  }

  await assertInventoryMovementPeriodUnlocked(tx, {
    orgId: data.orgId,
    establishmentId: movement.establishmentId,
    movementAt: movement.movementAt,
  });

  let journalEntryId: string | null = null;
  if (movement.movementType === "sale_out") {
    if (movement.sourceEntityType !== "sales_transactions") {
      throw new Error("Sale-out inventory movements must be sourced from sales transactions");
    }
    await assertInventorySaleSource(tx, data.orgId, movement.sourceEntityId);
    journalEntryId = await postInventoryCogsEntry(tx, {
      orgId: data.orgId,
      movementId: movement.id,
      movementAt: movement.movementAt,
      skuCode: movement.skuCode,
      totalCost: movement.totalCost,
    });
  } else if (
    movement.movementType === "purchase_in" &&
    movement.sourceEntityType === "documents" &&
    movement.sourceEntityId
  ) {
    journalEntryId = await postInventoryPurchaseEntry(tx, {
      orgId: data.orgId,
      movementId: movement.id,
      movementAt: movement.movementAt,
      skuCode: movement.skuCode,
      totalCost: movement.totalCost,
      sourceEntityId: movement.sourceEntityId,
    });
  } else if (
    movement.movementType === "count_variance_in" ||
    movement.movementType === "count_variance_out" ||
    movement.movementType === "adjustment_in" ||
    movement.movementType === "adjustment_out" ||
    movement.movementType === "shrinkage"
  ) {
    journalEntryId = await postInventoryCountVarianceEntry(tx, {
      orgId: data.orgId,
      movementId: movement.id,
      movementAt: movement.movementAt,
      skuCode: movement.skuCode,
      movementType: movement.movementType,
      totalCost: movement.totalCost,
    });
  } else {
    throw new Error(`No inventory posting handler for movement type ${movement.movementType}`);
  }

  if (!journalEntryId) {
    throw new Error("Inventory movement did not produce a journal entry");
  }

  await tx
    .update(inventoryMovements)
    .set({ journalEntryId })
    .where(
      and(
        eq(inventoryMovements.orgId, data.orgId),
        eq(inventoryMovements.id, movement.id),
        isNull(inventoryMovements.journalEntryId)
      )
    );

  return inventoryJournalEntryById(tx, data.orgId, journalEntryId);
}

async function assertInventoryMovementPeriodUnlocked(
  tx: DbConnection,
  data: {
    orgId: string;
    establishmentId: string;
    movementAt: Date;
  }
) {
  const movementDate = formatBangkokDate(data.movementAt);
  const periodYear = Number(movementDate.slice(0, 4));
  const periodMonth = Number(movementDate.slice(5, 7));
  const locks = await tx
    .select({ id: periodLocks.id })
    .from(periodLocks)
    .where(
      and(
        eq(periodLocks.orgId, data.orgId),
        eq(periodLocks.domain, "gl"),
        eq(periodLocks.periodYear, periodYear),
        eq(periodLocks.periodMonth, periodMonth),
        isNull(periodLocks.unlockedAt),
        sql`(${periodLocks.establishmentId} IS NULL OR ${periodLocks.establishmentId} = ${data.establishmentId})`
      )
    )
    .limit(1);

  if (locks.length > 0) {
    throw new Error("Inventory movement period is locked for GL");
  }
}

export type InventoryRollForwardRow = {
  skuId: string;
  skuCode: string;
  skuName: string;
  unitOfMeasure: string;
  openingQuantity: string;
  openingValue: string;
  inboundQuantity: string;
  inboundValue: string;
  outboundQuantity: string;
  outboundValue: string;
  adjustmentQuantity: string;
  adjustmentValue: string;
  closingQuantity: string;
  closingValue: string;
  lastMovementAt: Date | null;
};

export type AgedInventoryRow = {
  skuId: string;
  skuCode: string;
  skuName: string;
  unitOfMeasure: string;
  currentQuantity: string;
  currentValue: string;
  currentAvgCost: string;
  lastSaleAt: Date | null;
  lastMovementAt: Date | null;
  daysSinceLastSale: number | null;
  ageBucket: "no_sales" | "0_59" | "60_89" | "90_179" | "180_plus";
};

export async function getInventoryRollForward(data: {
  orgId: string;
  periodYear: number;
  periodMonth: number;
}) {
  validatePeriod(data.periodYear, data.periodMonth);
  const start = periodStart(data.periodYear, data.periodMonth);
  const end = nextPeriodStart(data.periodYear, data.periodMonth);

  return db
    .select({
      skuId: skus.id,
      skuCode: skus.skuCode,
      skuName: sql<string>`COALESCE(${skus.nameTh}, ${skus.nameEn}, '')`,
      unitOfMeasure: skus.unitOfMeasure,
      openingQuantity: sql<string>`COALESCE((
        SELECT opening.running_quantity_after
        FROM inventory_movements opening
        WHERE opening.org_id = ${data.orgId}
          AND opening.sku_id = ${skus.id}
          AND opening.deleted_at IS NULL
          AND (opening.movement_at AT TIME ZONE 'Asia/Bangkok')::date < ${start}::date
        ORDER BY opening.movement_at DESC, opening.created_at DESC, opening.id DESC
        LIMIT 1
      ), 0)::numeric(14,4)::text`,
      openingValue: sql<string>`COALESCE((
        SELECT opening.running_value_after
        FROM inventory_movements opening
        WHERE opening.org_id = ${data.orgId}
          AND opening.sku_id = ${skus.id}
          AND opening.deleted_at IS NULL
          AND (opening.movement_at AT TIME ZONE 'Asia/Bangkok')::date < ${start}::date
        ORDER BY opening.movement_at DESC, opening.created_at DESC, opening.id DESC
        LIMIT 1
      ), 0)::numeric(14,2)::text`,
      inboundQuantity: sql<string>`COALESCE(SUM(CASE WHEN ${inventoryMovements.movementType} IN ('purchase_in', 'import_in', 'return_in') THEN ${inventoryMovements.quantity} ELSE 0 END), 0)::numeric(14,4)::text`,
      inboundValue: sql<string>`COALESCE(SUM(CASE WHEN ${inventoryMovements.movementType} IN ('purchase_in', 'import_in', 'return_in') THEN ${inventoryMovements.totalCost} ELSE 0 END), 0)::numeric(14,2)::text`,
      outboundQuantity: sql<string>`COALESCE(SUM(CASE WHEN ${inventoryMovements.movementType} IN ('sale_out', 'return_out') THEN ABS(${inventoryMovements.quantity}) ELSE 0 END), 0)::numeric(14,4)::text`,
      outboundValue: sql<string>`COALESCE(SUM(CASE WHEN ${inventoryMovements.movementType} IN ('sale_out', 'return_out') THEN ${inventoryMovements.totalCost} ELSE 0 END), 0)::numeric(14,2)::text`,
      adjustmentQuantity: sql<string>`COALESCE(SUM(CASE WHEN ${inventoryMovements.movementType} IN ('adjustment_in', 'transfer_in', 'count_variance_in') THEN ${inventoryMovements.quantity} WHEN ${inventoryMovements.movementType} IN ('adjustment_out', 'transfer_out', 'count_variance_out', 'shrinkage') THEN ${inventoryMovements.quantity} ELSE 0 END), 0)::numeric(14,4)::text`,
      adjustmentValue: sql<string>`COALESCE(SUM(CASE WHEN ${inventoryMovements.movementType} IN ('adjustment_in', 'transfer_in', 'count_variance_in') THEN ${inventoryMovements.totalCost} WHEN ${inventoryMovements.movementType} IN ('adjustment_out', 'transfer_out', 'count_variance_out', 'shrinkage') THEN -${inventoryMovements.totalCost} ELSE 0 END), 0)::numeric(14,2)::text`,
      closingQuantity: sql<string>`COALESCE((
        SELECT closing.running_quantity_after
        FROM inventory_movements closing
        WHERE closing.org_id = ${data.orgId}
          AND closing.sku_id = ${skus.id}
          AND closing.deleted_at IS NULL
          AND (closing.movement_at AT TIME ZONE 'Asia/Bangkok')::date < ${end}::date
        ORDER BY closing.movement_at DESC, closing.created_at DESC, closing.id DESC
        LIMIT 1
      ), 0)::numeric(14,4)::text`,
      closingValue: sql<string>`COALESCE((
        SELECT closing.running_value_after
        FROM inventory_movements closing
        WHERE closing.org_id = ${data.orgId}
          AND closing.sku_id = ${skus.id}
          AND closing.deleted_at IS NULL
          AND (closing.movement_at AT TIME ZONE 'Asia/Bangkok')::date < ${end}::date
        ORDER BY closing.movement_at DESC, closing.created_at DESC, closing.id DESC
        LIMIT 1
      ), 0)::numeric(14,2)::text`,
      lastMovementAt: skus.lastMovementAt,
    })
    .from(skus)
    .leftJoin(
      inventoryMovements,
      and(
        eq(inventoryMovements.orgId, skus.orgId),
        eq(inventoryMovements.skuId, skus.id),
        isNull(inventoryMovements.deletedAt),
        sql`(${inventoryMovements.movementAt} AT TIME ZONE 'Asia/Bangkok')::date >= ${start}::date`,
        sql`(${inventoryMovements.movementAt} AT TIME ZONE 'Asia/Bangkok')::date < ${end}::date`
      )
    )
    .where(and(...orgScope(skus, data.orgId), eq(skus.isInventoriable, true)))
    .groupBy(
      skus.id,
      skus.skuCode,
      skus.nameTh,
      skus.nameEn,
      skus.unitOfMeasure,
      skus.lastMovementAt
    )
    .having(sql`
      COALESCE(SUM(ABS(${inventoryMovements.quantity})), 0) <> 0
      OR COALESCE((
        SELECT closing.running_quantity_after
        FROM inventory_movements closing
        WHERE closing.org_id = ${data.orgId}
          AND closing.sku_id = ${skus.id}
          AND closing.deleted_at IS NULL
          AND (closing.movement_at AT TIME ZONE 'Asia/Bangkok')::date < ${end}::date
        ORDER BY closing.movement_at DESC, closing.created_at DESC, closing.id DESC
        LIMIT 1
      ), 0) <> 0
    `)
    .orderBy(asc(skus.skuCode));
}

export async function getAgedInventoryReport(data: {
  orgId: string;
  asOfDate: string;
}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data.asOfDate)) {
    throw new Error("Aged inventory asOfDate must be a Bangkok calendar date");
  }

  const rows = await db.execute<AgedInventoryRow>(sql`
    WITH last_sales AS (
      SELECT
        sku_id,
        MAX(movement_at) AS last_sale_at
      FROM inventory_movements
      WHERE org_id = ${data.orgId}
        AND deleted_at IS NULL
        AND movement_type = 'sale_out'
        AND (movement_at AT TIME ZONE 'Asia/Bangkok')::date <= ${data.asOfDate}::date
      GROUP BY sku_id
    )
    SELECT
      s.id AS "skuId",
      s.sku_code AS "skuCode",
      COALESCE(s.name_th, s.name_en, '') AS "skuName",
      s.unit_of_measure AS "unitOfMeasure",
      s.current_quantity AS "currentQuantity",
      s.current_value AS "currentValue",
      s.current_avg_cost AS "currentAvgCost",
      last_sales.last_sale_at AS "lastSaleAt",
      s.last_movement_at AS "lastMovementAt",
      CASE
        WHEN last_sales.last_sale_at IS NULL THEN NULL
        ELSE (${data.asOfDate}::date - (last_sales.last_sale_at AT TIME ZONE 'Asia/Bangkok')::date)::int
      END AS "daysSinceLastSale",
      CASE
        WHEN last_sales.last_sale_at IS NULL THEN 'no_sales'
        WHEN (${data.asOfDate}::date - (last_sales.last_sale_at AT TIME ZONE 'Asia/Bangkok')::date)::int >= 180 THEN '180_plus'
        WHEN (${data.asOfDate}::date - (last_sales.last_sale_at AT TIME ZONE 'Asia/Bangkok')::date)::int >= 90 THEN '90_179'
        WHEN (${data.asOfDate}::date - (last_sales.last_sale_at AT TIME ZONE 'Asia/Bangkok')::date)::int >= 60 THEN '60_89'
        ELSE '0_59'
      END AS "ageBucket"
    FROM skus s
    LEFT JOIN last_sales ON last_sales.sku_id = s.id
    WHERE s.org_id = ${data.orgId}
      AND s.deleted_at IS NULL
      AND s.is_inventoriable = true
      AND s.current_quantity > 0
    ORDER BY s.current_value DESC, s.sku_code ASC
    LIMIT 100
  `);

  return rows.rows;
}

export async function getInventoryDashboard(
  orgId: string,
  options?: { periodYear?: number; periodMonth?: number; asOfDate?: string }
) {
  const today = formatBangkokDate(new Date());
  const periodYear = options?.periodYear ?? Number(today.slice(0, 4));
  const periodMonth = options?.periodMonth ?? Number(today.slice(5, 7));
  const asOfDate = options?.asOfDate ?? today;
  validatePeriod(periodYear, periodMonth);

  const [summary] = await db
    .select({
      skuCount: sql<number>`COUNT(*)::int`,
      inventoriableCount: sql<number>`COUNT(*) FILTER (WHERE ${skus.isInventoriable} = true)::int`,
      totalQuantity: sql<string>`COALESCE(SUM(${skus.currentQuantity}), 0)::numeric(14,4)`,
      totalValue: sql<string>`COALESCE(SUM(${skus.currentValue}), 0)::numeric(14,2)`,
      negativeSkuCount: sql<number>`COUNT(*) FILTER (WHERE ${skus.currentQuantity} < 0)::int`,
      lowStockSkuCount: sql<number>`COUNT(*) FILTER (WHERE ${skus.isInventoriable} = true AND ${skus.reorderPointQuantity} > 0 AND ${skus.currentQuantity} <= ${skus.reorderPointQuantity})::int`,
    })
    .from(skus)
    .where(and(...orgScope(skus, orgId)));

  const recentSkus = await db
    .select({
      id: skus.id,
      skuCode: skus.skuCode,
      nameTh: skus.nameTh,
      nameEn: skus.nameEn,
      category: skus.category,
      valuationMethod: skus.valuationMethod,
      currentQuantity: skus.currentQuantity,
      currentAvgCost: skus.currentAvgCost,
      reorderPointQuantity: skus.reorderPointQuantity,
      currentValue: skus.currentValue,
      lastMovementAt: skus.lastMovementAt,
      isInventoriable: skus.isInventoriable,
      branchNumber: establishments.branchNumber,
    })
    .from(skus)
    .leftJoin(establishments, eq(establishments.id, skus.establishmentId))
    .where(and(...orgScope(skus, orgId)))
    .orderBy(desc(skus.createdAt))
    .limit(50);

  const lowStockSkus = await db
    .select({
      id: skus.id,
      skuCode: skus.skuCode,
      nameEn: skus.nameEn,
      category: skus.category,
      currentQuantity: skus.currentQuantity,
      reorderPointQuantity: skus.reorderPointQuantity,
      lastMovementAt: skus.lastMovementAt,
      branchNumber: establishments.branchNumber,
    })
    .from(skus)
    .leftJoin(establishments, eq(establishments.id, skus.establishmentId))
    .where(
      and(
        ...orgScope(skus, orgId),
        eq(skus.isInventoriable, true),
        sql`${skus.reorderPointQuantity} > 0`,
        sql`${skus.currentQuantity} <= ${skus.reorderPointQuantity}`
      )
    )
    .orderBy(sql`(${skus.currentQuantity} - ${skus.reorderPointQuantity}) ASC`, asc(skus.skuCode))
    .limit(20);

  const recentMovements = await db
    .select({
      id: inventoryMovements.id,
      movementAt: inventoryMovements.movementAt,
      movementType: inventoryMovements.movementType,
      quantity: inventoryMovements.quantity,
      unitCost: inventoryMovements.unitCost,
      totalCost: inventoryMovements.totalCost,
      runningQuantityAfter: inventoryMovements.runningQuantityAfter,
      skuCode: skus.skuCode,
    })
    .from(inventoryMovements)
    .innerJoin(skus, eq(skus.id, inventoryMovements.skuId))
    .where(eq(inventoryMovements.orgId, orgId))
    .orderBy(desc(inventoryMovements.movementAt), desc(inventoryMovements.createdAt))
    .limit(20);

  const recentCounts = await db
    .select({
      id: inventoryCounts.id,
      countDate: inventoryCounts.countDate,
      countType: inventoryCounts.countType,
      status: inventoryCounts.status,
      totalVarianceValueThb: inventoryCounts.totalVarianceValueThb,
      reconciledAt: inventoryCounts.reconciledAt,
      itemCount: sql<number>`COUNT(${inventoryCountItems.id})::int`,
    })
    .from(inventoryCounts)
    .leftJoin(
      inventoryCountItems,
      eq(inventoryCountItems.countId, inventoryCounts.id)
    )
    .where(eq(inventoryCounts.orgId, orgId))
    .groupBy(
      inventoryCounts.id,
      inventoryCounts.countDate,
      inventoryCounts.countType,
      inventoryCounts.status,
      inventoryCounts.totalVarianceValueThb,
      inventoryCounts.reconciledAt,
      inventoryCounts.createdAt
    )
    .orderBy(desc(inventoryCounts.countDate), desc(inventoryCounts.createdAt))
    .limit(10);

  const [rollForward, agedInventory] = await Promise.all([
    getInventoryRollForward({ orgId, periodYear, periodMonth }),
    getAgedInventoryReport({ orgId, asOfDate }),
  ]);

  return {
    summary,
    recentSkus,
    lowStockSkus,
    recentMovements,
    recentCounts,
    rollForward,
    agedInventory,
  };
}

export async function createSku(data: {
  orgId: string;
  skuCode: string;
  nameTh?: string;
  nameEn?: string;
  category?: string;
  unitOfMeasure?: string;
  standardCost?: string;
  reorderPointQuantity?: string;
}) {
  const [row] = await db
    .insert(skus)
    .values({
      orgId: data.orgId,
      skuCode: data.skuCode.trim(),
      nameTh: data.nameTh || null,
      nameEn: data.nameEn || null,
      category: data.category || null,
      unitOfMeasure: data.unitOfMeasure || "pcs",
      standardCost: data.standardCost || null,
      reorderPointQuantity: data.reorderPointQuantity || "0",
    })
    .returning();

  return row;
}

export async function updateSkuReorderPoint(data: {
  orgId: string;
  skuId: string;
  reorderPointQuantity: string;
}) {
  const [row] = await db
    .update(skus)
    .set({
      reorderPointQuantity: data.reorderPointQuantity,
      updatedAt: new Date(),
    })
    .where(and(...orgScope(skus, data.orgId), eq(skus.id, data.skuId)))
    .returning();

  if (!row) throw new Error("SKU not found");
  return row;
}

export async function updateSkuProfile(data: {
  orgId: string;
  skuId: string;
  nameEn?: string;
  category?: string;
  unitOfMeasure?: string;
  standardCost?: string;
  reorderPointQuantity?: string;
}) {
  const [row] = await db
    .update(skus)
    .set({
      nameEn: data.nameEn || null,
      category: data.category || null,
      unitOfMeasure: data.unitOfMeasure || "pcs",
      standardCost: data.standardCost || null,
      reorderPointQuantity: data.reorderPointQuantity || "0",
      updatedAt: new Date(),
    })
    .where(and(...orgScope(skus, data.orgId), eq(skus.id, data.skuId)))
    .returning();

  if (!row) throw new Error("SKU not found");
  return row;
}

export async function getInventorySkuOptions(orgId: string) {
  return db
    .select({
      id: skus.id,
      skuCode: skus.skuCode,
      nameEn: skus.nameEn,
      nameTh: skus.nameTh,
      currentAvgCost: skus.currentAvgCost,
      standardCost: skus.standardCost,
    })
    .from(skus)
    .where(and(...orgScope(skus, orgId), eq(skus.isInventoriable, true)))
    .orderBy(asc(skus.skuCode))
    .limit(200);
}

export async function getInventorySkuDetail(orgId: string, skuId: string) {
  const [sku] = await db
    .select({
      id: skus.id,
      skuCode: skus.skuCode,
      nameTh: skus.nameTh,
      nameEn: skus.nameEn,
      category: skus.category,
      valuationMethod: skus.valuationMethod,
      unitOfMeasure: skus.unitOfMeasure,
      currentQuantity: skus.currentQuantity,
      currentAvgCost: skus.currentAvgCost,
      currentValue: skus.currentValue,
      standardCost: skus.standardCost,
      reorderPointQuantity: skus.reorderPointQuantity,
      lastKnownAvgCost: skus.lastKnownAvgCost,
      lastMovementAt: skus.lastMovementAt,
      isInventoriable: skus.isInventoriable,
      branchNumber: establishments.branchNumber,
      establishmentName: sql<string>`COALESCE(${establishments.nameTh}, ${establishments.nameEn}, '')`,
    })
    .from(skus)
    .leftJoin(establishments, eq(establishments.id, skus.establishmentId))
    .where(and(...orgScope(skus, orgId), eq(skus.id, skuId)))
    .limit(1);

  if (!sku) return null;

  const movements = await db
    .select({
      id: inventoryMovements.id,
      movementAt: inventoryMovements.movementAt,
      movementType: inventoryMovements.movementType,
      quantity: inventoryMovements.quantity,
      unitCost: inventoryMovements.unitCost,
      totalCost: inventoryMovements.totalCost,
      runningQuantityAfter: inventoryMovements.runningQuantityAfter,
      runningAvgCostAfter: inventoryMovements.runningAvgCostAfter,
      runningValueAfter: inventoryMovements.runningValueAfter,
      sourceEntityType: inventoryMovements.sourceEntityType,
      sourceEntityId: inventoryMovements.sourceEntityId,
      journalEntryId: inventoryMovements.journalEntryId,
      notes: inventoryMovements.notes,
      branchNumber: establishments.branchNumber,
    })
    .from(inventoryMovements)
    .innerJoin(
      establishments,
      and(
        eq(establishments.id, inventoryMovements.establishmentId),
        eq(establishments.orgId, inventoryMovements.orgId)
      )
    )
    .where(
      and(
        eq(inventoryMovements.orgId, orgId),
        eq(inventoryMovements.skuId, skuId),
        isNull(inventoryMovements.deletedAt)
      )
    )
    .orderBy(desc(inventoryMovements.movementAt), desc(inventoryMovements.createdAt))
    .limit(100);

  return {
    sku,
    movements,
  };
}

export async function getInventoryCountDetail(orgId: string, countId: string) {
  const [count] = await db
    .select({
      id: inventoryCounts.id,
      countDate: inventoryCounts.countDate,
      countType: inventoryCounts.countType,
      status: inventoryCounts.status,
      totalVarianceValueThb: inventoryCounts.totalVarianceValueThb,
      submittedAt: inventoryCounts.submittedAt,
      reconciledAt: inventoryCounts.reconciledAt,
      reconciledByUserId: inventoryCounts.reconciledByUserId,
      notes: inventoryCounts.notes,
      branchNumber: establishments.branchNumber,
      establishmentName: sql<string>`COALESCE(${establishments.nameTh}, ${establishments.nameEn}, '')`,
    })
    .from(inventoryCounts)
    .innerJoin(
      establishments,
      and(
        eq(establishments.id, inventoryCounts.establishmentId),
        eq(establishments.orgId, inventoryCounts.orgId)
      )
    )
    .where(and(eq(inventoryCounts.orgId, orgId), eq(inventoryCounts.id, countId)))
    .limit(1);

  if (!count) return null;

  const items = await db
    .select({
      id: inventoryCountItems.id,
      skuId: inventoryCountItems.skuId,
      skuCode: skus.skuCode,
      nameEn: skus.nameEn,
      category: skus.category,
      systemQuantity: inventoryCountItems.systemQuantity,
      countedQuantity: inventoryCountItems.countedQuantity,
      variance: inventoryCountItems.variance,
      varianceValueThb: inventoryCountItems.varianceValueThb,
      varianceReason: inventoryCountItems.varianceReason,
    })
    .from(inventoryCountItems)
    .innerJoin(
      skus,
      and(
        eq(skus.id, inventoryCountItems.skuId),
        eq(skus.orgId, inventoryCountItems.orgId)
      )
    )
    .where(and(eq(inventoryCountItems.orgId, orgId), eq(inventoryCountItems.countId, countId)))
    .orderBy(asc(skus.skuCode));

  const movements = await db
    .select({
      id: inventoryMovements.id,
      movementAt: inventoryMovements.movementAt,
      movementType: inventoryMovements.movementType,
      skuCode: skus.skuCode,
      quantity: inventoryMovements.quantity,
      unitCost: inventoryMovements.unitCost,
      totalCost: inventoryMovements.totalCost,
      journalEntryId: inventoryMovements.journalEntryId,
      notes: inventoryMovements.notes,
    })
    .from(inventoryMovements)
    .innerJoin(skus, eq(skus.id, inventoryMovements.skuId))
    .where(
      and(
        eq(inventoryMovements.orgId, orgId),
        eq(inventoryMovements.sourceEntityType, "inventory_counts"),
        eq(inventoryMovements.sourceEntityId, countId),
        isNull(inventoryMovements.deletedAt)
      )
    )
    .orderBy(desc(inventoryMovements.movementAt), asc(skus.skuCode));

  return {
    count,
    items,
    movements,
  };
}

export async function recordInventoryMovement(data: {
  orgId: string;
  establishmentId: string;
  skuId: string;
  movementAt: Date;
  movementType: string;
  quantity: string;
  unitCost?: string;
  purchaseVatAmount?: string;
  purchaseApAmount?: string;
  sourceEntityType?: string;
  sourceEntityId?: string;
  notes?: string;
}) {
  return db.transaction(async (tx) =>
    recordInventoryMovementInTx(data, tx as DbConnection)
  );
}

export async function recordInventoryMovementInTx(
  data: {
    orgId: string;
    establishmentId: string;
    skuId: string;
    movementAt: Date;
    movementType: string;
    quantity: string;
    unitCost?: string;
    purchaseVatAmount?: string;
    purchaseApAmount?: string;
    sourceEntityType?: string;
    sourceEntityId?: string;
    notes?: string;
  },
  tx: DbConnection
) {
  const [sku] = await tx
    .select()
    .from(skus)
    .where(
      and(
        eq(skus.orgId, data.orgId),
        isNull(skus.deletedAt),
        eq(skus.id, data.skuId)
      )
    )
    .for("update")
    .limit(1);

  if (!sku) throw new Error("SKU not found");
  if (sku.establishmentId && sku.establishmentId !== data.establishmentId) {
    throw new Error("Inventory movement establishment must match the SKU establishment");
  }
  if (sku.valuationMethod !== "weighted_average") {
    throw new Error("Only weighted-average inventory movements are implemented");
  }

  await assertInventoryMovementPeriodUnlocked(tx, data);

  const [laterMovement] = await tx
    .select({ id: inventoryMovements.id })
    .from(inventoryMovements)
    .where(
      and(
        eq(inventoryMovements.orgId, data.orgId),
        eq(inventoryMovements.skuId, data.skuId),
        isNull(inventoryMovements.deletedAt),
        sql`${inventoryMovements.movementAt} >= ${data.movementAt}`
      )
    )
    .limit(1);
  if (laterMovement) {
    throw new Error("Backdated inventory movements require inventory rebuild before posting");
  }

  if (
    data.sourceEntityType === "manual" &&
    !["adjustment_in", "adjustment_out", "shrinkage"].includes(data.movementType)
  ) {
    throw new Error("Manual inventory movements must use adjustment types");
  }
  if (data.movementType === "sale_out" && data.sourceEntityType !== "sales_transactions") {
    throw new Error("Sale-out inventory movements must be sourced from sales transactions");
  }
  if (data.movementType === "sale_out") {
    await assertInventorySaleSource(tx, data.orgId, data.sourceEntityId);
  }
  if (data.movementType === "purchase_in" && data.sourceEntityType === "documents" && !data.sourceEntityId) {
    throw new Error("Inventory purchase source document is required");
  }
  if (IN_MOVEMENTS.has(data.movementType) && Number(data.quantity) <= 0) {
    throw new Error("Inbound inventory movements require a positive quantity");
  }
  if (OUT_MOVEMENTS.has(data.movementType) && Number(data.quantity) >= 0) {
    throw new Error("Outbound inventory movements require a negative quantity");
  }

  let unitCost =
    data.unitCost ??
    sku.currentAvgCost ??
    sku.lastKnownAvgCost ??
    sku.standardCost ??
    "0.0000";
  if (data.movementType === "adjustment_in" && Number(unitCost) <= 0) {
    throw new Error("Found-stock adjustments require a positive unit cost");
  }

  let running:
    | ReturnType<typeof applyWeightedAverageReceipt>
    | ReturnType<typeof applyWeightedAverageIssue>;

  if (IN_MOVEMENTS.has(data.movementType)) {
    running = applyWeightedAverageReceipt({
      currentQuantity: sku.currentQuantity,
      currentAvgCost: sku.currentAvgCost,
      quantity: data.quantity,
      unitCost,
    });
  } else if (OUT_MOVEMENTS.has(data.movementType)) {
    const fallbackUnitCost =
      Number(sku.currentAvgCost) > 0
        ? sku.currentAvgCost
        : sku.lastKnownAvgCost ?? sku.standardCost ?? unitCost;
    if (
      data.movementType === "count_variance_out" &&
      data.unitCost &&
      Number(data.unitCost).toFixed(4) !== Number(fallbackUnitCost).toFixed(4)
    ) {
      throw new Error("Count variance out cost must match current inventory cost basis");
    }
    unitCost = fallbackUnitCost;
    running = applyWeightedAverageIssue({
      currentQuantity: sku.currentQuantity,
      currentAvgCost: fallbackUnitCost,
      quantity: data.quantity,
      unitCost,
    });

    if (Number(running.runningQuantityAfter) < 0) {
      await tx
        .insert(exceptionQueue)
        .values({
          orgId: data.orgId,
          entityType: "sku",
          entityId: data.skuId,
          exceptionType: "negative_inventory",
          severity: "warning",
          summary: `SKU ${sku.skuCode} went negative after ${data.movementType}`,
          payload: {
            movementType: data.movementType,
            quantity: data.quantity,
            unitCost: fallbackUnitCost,
            runningQuantityAfter: running.runningQuantityAfter,
          },
        })
        .onConflictDoNothing();
    }
  } else {
    throw new Error(`Unsupported inventory movement type: ${data.movementType}`);
  }

  const movementId = randomUUID();
  let journalEntryId: string | null = null;
  if (data.movementType === "sale_out") {
    journalEntryId = await postInventoryCogsEntry(tx, {
      orgId: data.orgId,
      movementId,
      movementAt: data.movementAt,
      skuCode: sku.skuCode,
      totalCost: running.totalCost,
    });
  } else if (
    data.movementType === "purchase_in" &&
    data.sourceEntityType === "documents" &&
    data.sourceEntityId
  ) {
    journalEntryId = await postInventoryPurchaseEntry(tx, {
      orgId: data.orgId,
      movementId,
      movementAt: data.movementAt,
      skuCode: sku.skuCode,
      totalCost: running.totalCost,
      vatAmount: data.purchaseVatAmount,
      apAmount: data.purchaseApAmount,
      sourceEntityId: data.sourceEntityId,
    });
  } else if (
    data.movementType === "count_variance_in" ||
    data.movementType === "count_variance_out" ||
    data.movementType === "adjustment_in" ||
    data.movementType === "adjustment_out" ||
    data.movementType === "shrinkage"
  ) {
    journalEntryId = await postInventoryCountVarianceEntry(tx, {
      orgId: data.orgId,
      movementId,
      movementAt: data.movementAt,
      skuCode: sku.skuCode,
      movementType: data.movementType,
      totalCost: running.totalCost,
    });
  }

  const [movement] = await tx
    .insert(inventoryMovements)
    .values({
      id: movementId,
      orgId: data.orgId,
      establishmentId: data.establishmentId,
      skuId: data.skuId,
      movementAt: data.movementAt,
      movementType: data.movementType,
      quantity: data.quantity,
      unitCost,
      totalCost: running.totalCost,
      runningQuantityAfter: running.runningQuantityAfter,
      runningAvgCostAfter: running.runningAvgCostAfter,
      runningValueAfter: running.runningValueAfter,
      sourceEntityType: data.sourceEntityType || null,
      sourceEntityId: data.sourceEntityId || null,
      journalEntryId,
      notes: data.notes || null,
    })
    .returning();

  await tx
    .update(skus)
    .set({
      currentQuantity: running.runningQuantityAfter,
      currentAvgCost: running.runningAvgCostAfter,
      lastKnownAvgCost:
        Number(running.runningAvgCostAfter) > 0
          ? running.runningAvgCostAfter
          : sku.lastKnownAvgCost,
      currentValue: running.runningValueAfter,
      lastMovementAt: data.movementAt,
      updatedAt: new Date(),
    })
    .where(eq(skus.id, data.skuId));

  if (journalEntryId) {
    await enqueuePostingOutbox({
      orgId: data.orgId,
      sourceEntityType: "inventory_movements",
      sourceEntityId: movement.id,
      eventType: "post_gl",
      postingDate: formatBangkokDate(data.movementAt),
      payload: {
        movementType: data.movementType,
        movementAt: data.movementAt.toISOString(),
        sourceEntityType: data.sourceEntityType ?? null,
        sourceEntityId: data.sourceEntityId ?? null,
      },
      tx,
    });
  }

  return movement;
}

export async function createInventoryCount(data: {
  orgId: string;
  establishmentId: string;
  countDate: string;
  countType?: "full" | "cycle" | "spot";
  notes?: string;
}) {
  const [row] = await db
    .insert(inventoryCounts)
    .values({
      orgId: data.orgId,
      establishmentId: data.establishmentId,
      countDate: data.countDate,
      countType: data.countType ?? "cycle",
      notes: data.notes || null,
    })
    .returning();

  return row;
}

export async function addInventoryCountItem(data: {
  orgId: string;
  countId: string;
  skuId: string;
  countedQuantity: string;
  varianceReason?: "shrinkage" | "damage" | "count_error" | "unrecorded_sale" | "other";
}) {
  return db.transaction(async (tx) => {
    const [count] = await tx
      .select()
      .from(inventoryCounts)
      .where(and(eq(inventoryCounts.orgId, data.orgId), eq(inventoryCounts.id, data.countId)))
      .for("update")
      .limit(1);

    if (!count) throw new Error("Inventory count not found");
    if (count.status === "reconciled") {
      throw new Error("Reconciled inventory counts cannot be edited");
    }

    const [sku] = await tx
      .select()
      .from(skus)
      .where(and(eq(skus.orgId, data.orgId), isNull(skus.deletedAt), eq(skus.id, data.skuId)))
      .limit(1);

    if (!sku) throw new Error("SKU not found");

    const systemQuantity = Number(sku.currentQuantity);
    const countedQuantity = Number(data.countedQuantity);
    const variance = countedQuantity - systemQuantity;
    const varianceValueThb = Math.abs(variance * costBasis(sku));

    const [item] = await tx
      .insert(inventoryCountItems)
      .values({
        orgId: data.orgId,
        countId: data.countId,
        skuId: data.skuId,
        systemQuantity: fixed(systemQuantity, 4),
        countedQuantity: fixed(countedQuantity, 4),
        variance: fixed(variance, 4),
        varianceValueThb: fixed(varianceValueThb, 2),
        varianceReason: data.varianceReason || null,
      })
      .onConflictDoUpdate({
        target: [inventoryCountItems.countId, inventoryCountItems.skuId],
        set: {
          systemQuantity: fixed(systemQuantity, 4),
          countedQuantity: fixed(countedQuantity, 4),
          variance: fixed(variance, 4),
          varianceValueThb: fixed(varianceValueThb, 2),
          varianceReason: data.varianceReason || null,
          updatedAt: new Date(),
        },
      })
      .returning();

    const [total] = await tx
      .select({
        varianceValueThb: sql<string>`COALESCE(SUM(${inventoryCountItems.varianceValueThb}), 0)::numeric(14,2)`,
      })
      .from(inventoryCountItems)
      .where(eq(inventoryCountItems.countId, data.countId));

    await tx
      .update(inventoryCounts)
      .set({
        totalVarianceValueThb: total?.varianceValueThb ?? "0.00",
        updatedAt: new Date(),
      })
      .where(eq(inventoryCounts.id, data.countId));

    return item;
  });
}

export async function reconcileInventoryCount(data: {
  orgId: string;
  countId: string;
  userId?: string;
}) {
  return db.transaction(async (tx) => {
    const [count] = await tx
      .select()
      .from(inventoryCounts)
      .where(and(eq(inventoryCounts.orgId, data.orgId), eq(inventoryCounts.id, data.countId)))
      .for("update")
      .limit(1);

    if (!count) throw new Error("Inventory count not found");
    if (count.status === "reconciled") {
      throw new Error("Inventory count is already reconciled");
    }

    const existingMovements = await tx
      .select({ id: inventoryMovements.id })
      .from(inventoryMovements)
      .where(
        and(
          eq(inventoryMovements.orgId, data.orgId),
          eq(inventoryMovements.sourceEntityType, "inventory_counts"),
          eq(inventoryMovements.sourceEntityId, data.countId)
        )
      )
      .limit(1);

    if (existingMovements.length > 0) {
      throw new Error("Inventory count already has reconciliation movements");
    }

    const items = await tx
      .select({
        skuId: inventoryCountItems.skuId,
        variance: inventoryCountItems.variance,
        varianceValueThb: inventoryCountItems.varianceValueThb,
        varianceReason: inventoryCountItems.varianceReason,
      })
      .from(inventoryCountItems)
      .where(and(eq(inventoryCountItems.orgId, data.orgId), eq(inventoryCountItems.countId, data.countId)));

    if (items.length === 0) {
      throw new Error("Inventory count has no counted items");
    }

    const movements = [];
    for (const item of items) {
      const variance = Number(item.variance);
      if (variance === 0) continue;

      movements.push(
        await recordInventoryMovementInTx(
          {
            orgId: data.orgId,
            establishmentId: count.establishmentId,
            skuId: item.skuId,
            movementAt: new Date(`${count.countDate}T12:00:00+07:00`),
            movementType: variance > 0 ? "count_variance_in" : "count_variance_out",
            quantity: fixed(variance, 4),
            unitCost: fixed(Math.abs(Number(item.varianceValueThb) / variance), 4),
            sourceEntityType: "inventory_counts",
            sourceEntityId: data.countId,
            notes: item.varianceReason
              ? `Inventory count variance: ${item.varianceReason}`
              : "Inventory count variance",
          },
          tx as DbConnection
        )
      );
    }

    const reconciledAt = new Date();
    const [updatedCount] = await tx
      .update(inventoryCounts)
      .set({
        status: "reconciled",
        submittedAt: count.submittedAt ?? reconciledAt,
        reconciledAt,
        reconciledByUserId: data.userId || null,
        updatedAt: reconciledAt,
      })
      .where(eq(inventoryCounts.id, data.countId))
      .returning();

    return { count: updatedCount, movements };
  });
}
