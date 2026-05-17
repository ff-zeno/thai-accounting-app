import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import * as schema from "@/lib/db/schema";
import {
  createTestDb,
  createTestOrg,
  migrateTestDb,
  resetTestDb,
} from "@/tests/db-test-utils";

const { db: testDb, pool } = createTestDb();
let createSku: typeof import("./inventory").createSku;
let getAgedInventoryReport: typeof import("./inventory").getAgedInventoryReport;
let getInventoryCountDetail: typeof import("./inventory").getInventoryCountDetail;
let getInventoryDashboard: typeof import("./inventory").getInventoryDashboard;
let getInventoryRollForward: typeof import("./inventory").getInventoryRollForward;
let getInventorySkuDetail: typeof import("./inventory").getInventorySkuDetail;
let postInventoryMovementJournalEntry: typeof import("./inventory").postInventoryMovementJournalEntry;
let recordInventoryMovement: typeof import("./inventory").recordInventoryMovement;
let updateSkuProfile: typeof import("./inventory").updateSkuProfile;
let updateSkuReorderPoint: typeof import("./inventory").updateSkuReorderPoint;
let createInventoryCount: typeof import("./inventory").createInventoryCount;
let addInventoryCountItem: typeof import("./inventory").addInventoryCountItem;
let reconcileInventoryCount: typeof import("./inventory").reconcileInventoryCount;
let processPostingOutboxRow: typeof import("./posting-outbox").processPostingOutboxRow;

beforeAll(async () => {
  await resetTestDb(pool);
  await migrateTestDb(pool);
  vi.doMock("../index", () => ({ db: testDb }));
  ({
    addInventoryCountItem,
    createInventoryCount,
    createSku,
    getAgedInventoryReport,
    getInventoryCountDetail,
    getInventoryDashboard,
    getInventoryRollForward,
    getInventorySkuDetail,
    postInventoryMovementJournalEntry,
    reconcileInventoryCount,
    recordInventoryMovement,
    updateSkuProfile,
    updateSkuReorderPoint,
  } = await import("./inventory"));
  ({ processPostingOutboxRow } = await import("./posting-outbox"));
});

afterAll(async () => {
  await resetTestDb(pool);
  await pool.end();
});

beforeEach(async () => {
  await testDb.execute(sql`
    TRUNCATE TABLE
      journal_lines,
      journal_entries,
      posting_exceptions,
      posting_outbox,
      gl_accounts,
      audit_log,
      period_locks,
      inventory_statutory_overhead_components,
      inventory_count_items,
      inventory_counts,
      inventory_movements,
      skus,
      exception_queue,
      import_charge_lines,
      import_goods_lines,
      import_documents,
      imports,
      establishments,
      documents,
      vendors,
      organizations
    CASCADE
  `);
});

async function createHeadOffice(orgId: string) {
  const [establishment] = await testDb
    .insert(schema.establishments)
    .values({
      orgId,
      branchNumber: "00000",
      nameEn: "Head Office",
      isHeadOffice: true,
      vatRegistered: true,
    })
    .returning();
  return establishment;
}

async function createSaleTransaction(orgId: string, establishmentId: string) {
  const [sale] = await testDb
    .insert(schema.salesTransactions)
    .values({
      orgId,
      establishmentId,
      eventRole: "pos_primary",
      source: "test",
      externalId: randomUUID(),
      soldAt: new Date("2026-05-02T12:00:00+07:00"),
      channel: "pos",
      pricingMode: "vat_inclusive",
      taxInvoiceType: "simplified",
      amountIncludingVat: "107.00",
      taxBaseExVat: "100.00",
      vatAmount: "7.00",
      clearingAccountKey: "cash",
    })
    .returning();
  return sale;
}

describe("inventory foundation", () => {
  it("creates SKUs and computes weighted-average receipt and issue movements", async () => {
    const org = await createTestOrg(testDb);
    const establishment = await createHeadOffice(org.id);
    const sku = await createSku({
      orgId: org.id,
      skuCode: "SKU-001",
      nameEn: "Imported item",
      standardCost: "10.0000",
    });

    await recordInventoryMovement({
      orgId: org.id,
      establishmentId: establishment.id,
      skuId: sku.id,
      movementAt: new Date("2026-05-01T00:00:00Z"),
      movementType: "purchase_in",
      quantity: "100.0000",
      unitCost: "10.0000",
    });

    await recordInventoryMovement({
      orgId: org.id,
      establishmentId: establishment.id,
      skuId: sku.id,
      movementAt: new Date("2026-05-02T00:00:00Z"),
      movementType: "purchase_in",
      quantity: "100.0000",
      unitCost: "15.0000",
    });

    const sale = await createSaleTransaction(org.id, establishment.id);
    const saleMovement = await recordInventoryMovement({
      orgId: org.id,
      establishmentId: establishment.id,
      skuId: sku.id,
      movementAt: new Date("2026-05-03T00:00:00Z"),
      movementType: "sale_out",
      quantity: "-50.0000",
      sourceEntityType: "sales_transactions",
      sourceEntityId: sale.id,
    });

    const [updatedSku] = await testDb
      .select()
      .from(schema.skus)
      .where(sql`${schema.skus.id} = ${sku.id}`);

    expect(updatedSku.currentQuantity).toBe("150.0000");
    expect(updatedSku.currentAvgCost).toBe("12.5000");
    expect(updatedSku.currentValue).toBe("1875.00");

    const dashboard = await getInventoryDashboard(org.id);
    expect(dashboard.summary.totalValue).toBe("1875.00");
    expect(dashboard.recentMovements).toHaveLength(3);

    expect(saleMovement.journalEntryId).toBeTruthy();
    const journalRows = await testDb.execute(sql`
      SELECT je.entry_type, je.posting_kind, je.total_debit, je.total_credit,
             ga.account_code, jl.debit_amount, jl.credit_amount
      FROM journal_entries je
      INNER JOIN journal_lines jl
        ON jl.journal_entry_id = je.id
        AND jl.org_id = je.org_id
      INNER JOIN gl_accounts ga
        ON ga.id = jl.account_id
        AND ga.org_id = jl.org_id
      WHERE je.id = ${saleMovement.journalEntryId}
      ORDER BY jl.line_number
    `);
    expect(journalRows.rows).toMatchObject([
      {
        entry_type: "auto_sales",
        posting_kind: "inventory_cogs",
        account_code: "5110",
        debit_amount: "625.00",
        credit_amount: "0.00",
      },
      {
        entry_type: "auto_sales",
        posting_kind: "inventory_cogs",
        account_code: "1160",
        debit_amount: "0.00",
        credit_amount: "625.00",
      },
    ]);
    expect(journalRows.rows[0]).toMatchObject({
      total_debit: "625.00",
      total_credit: "625.00",
    });

    const outboxRows = await testDb
      .select()
      .from(schema.postingOutbox)
      .where(sql`${schema.postingOutbox.sourceEntityType} = 'inventory_movements'`);
    expect(outboxRows).toHaveLength(1);
    expect(outboxRows[0]).toMatchObject({
      sourceEntityId: saleMovement.id,
      eventType: "post_gl",
      postingDate: "2026-05-03",
      postingStatus: "pending",
    });
    const posted = await processPostingOutboxRow({
      orgId: org.id,
      postingOutboxId: outboxRows[0].id,
    });
    expect(posted.postingStatus).toBe("posted");
    expect(posted.journalEntryId).toBe(saleMovement.journalEntryId);

    const cogsEntries = await testDb
      .select()
      .from(schema.journalEntries)
      .where(sql`${schema.journalEntries.sourceEntityId} = ${saleMovement.id}`);
    expect(cogsEntries).toHaveLength(1);
  });

  it("surfaces SKUs at or below reorder point on the inventory dashboard", async () => {
    const org = await createTestOrg(testDb);
    await createSku({
      orgId: org.id,
      skuCode: "SKU-LOW",
      nameEn: "Low stock item",
      reorderPointQuantity: "5.0000",
    });
    await createSku({
      orgId: org.id,
      skuCode: "SKU-NORMAL",
      reorderPointQuantity: "0.0000",
    });

    const dashboard = await getInventoryDashboard(org.id);
    expect(dashboard.summary.lowStockSkuCount).toBe(1);
    expect(dashboard.lowStockSkus).toHaveLength(1);
    expect(dashboard.lowStockSkus[0]).toMatchObject({
      skuCode: "SKU-LOW",
      reorderPointQuantity: "5.0000",
    });
  });

  it("updates a SKU reorder point within the current org only", async () => {
    const org = await createTestOrg(testDb);
    const otherOrg = await createTestOrg(testDb);
    const sku = await createSku({
      orgId: org.id,
      skuCode: "SKU-REORDER",
      reorderPointQuantity: "0.0000",
    });
    const otherSku = await createSku({
      orgId: otherOrg.id,
      skuCode: "SKU-REORDER-OTHER",
      reorderPointQuantity: "0.0000",
    });

    const updated = await updateSkuReorderPoint({
      orgId: org.id,
      skuId: sku.id,
      reorderPointQuantity: "7.5000",
    });
    expect(updated.reorderPointQuantity).toBe("7.5000");

    const dashboard = await getInventoryDashboard(org.id);
    expect(dashboard.summary.lowStockSkuCount).toBe(1);
    expect(dashboard.lowStockSkus[0]).toMatchObject({
      skuCode: "SKU-REORDER",
      reorderPointQuantity: "7.5000",
    });

    await expect(
      updateSkuReorderPoint({
        orgId: org.id,
        skuId: otherSku.id,
        reorderPointQuantity: "9.0000",
      })
    ).rejects.toThrow("SKU not found");
  });

  it("updates SKU profile fields without crossing org boundaries", async () => {
    const org = await createTestOrg(testDb);
    const otherOrg = await createTestOrg(testDb);
    const sku = await createSku({
      orgId: org.id,
      skuCode: "SKU-PROFILE",
      nameEn: "Old name",
      category: "Old category",
      unitOfMeasure: "pcs",
      standardCost: "3.0000",
      reorderPointQuantity: "1.0000",
    });
    const otherSku = await createSku({
      orgId: otherOrg.id,
      skuCode: "SKU-PROFILE-OTHER",
    });

    const updated = await updateSkuProfile({
      orgId: org.id,
      skuId: sku.id,
      nameEn: "New name",
      category: "New category",
      unitOfMeasure: "box",
      standardCost: "4.2500",
      reorderPointQuantity: "6.0000",
    });

    expect(updated).toMatchObject({
      nameEn: "New name",
      category: "New category",
      unitOfMeasure: "box",
      standardCost: "4.2500",
      reorderPointQuantity: "6.0000",
    });

    const detail = await getInventorySkuDetail(org.id, sku.id);
    expect(detail?.sku).toMatchObject({
      nameEn: "New name",
      category: "New category",
      unitOfMeasure: "box",
      standardCost: "4.2500",
      reorderPointQuantity: "6.0000",
    });

    await expect(
      updateSkuProfile({
        orgId: org.id,
        skuId: otherSku.id,
        nameEn: "Wrong org edit",
      })
    ).rejects.toThrow("SKU not found");
  });

  it("records a negative-inventory exception instead of zeroing COGS", async () => {
    const org = await createTestOrg(testDb);
    const establishment = await createHeadOffice(org.id);
    const sku = await createSku({
      orgId: org.id,
      skuCode: "SKU-NEG",
      standardCost: "9.0000",
    });

    const sale = await createSaleTransaction(org.id, establishment.id);
    await recordInventoryMovement({
      orgId: org.id,
      establishmentId: establishment.id,
      skuId: sku.id,
      movementAt: new Date("2026-05-03T00:00:00Z"),
      movementType: "sale_out",
      quantity: "-2.0000",
      sourceEntityType: "sales_transactions",
      sourceEntityId: sale.id,
    });

    const [movement] = await testDb.select().from(schema.inventoryMovements);
    expect(movement.unitCost).toBe("9.0000");
    expect(movement.totalCost).toBe("18.00");

    const exceptions = await testDb.select().from(schema.exceptionQueue);
    expect(exceptions).toHaveLength(1);
    expect(exceptions[0].exceptionType).toBe("negative_inventory");
  });

  it("posts confirmed domestic purchase receipts to inventory and AP", async () => {
    const org = await createTestOrg(testDb);
    const establishment = await createHeadOffice(org.id);
    const [doc] = await testDb
      .insert(schema.documents)
      .values({
        orgId: org.id,
        direction: "expense",
        type: "invoice",
        status: "confirmed",
        issueDate: "2026-05-01",
        subtotal: "1200.00",
        vatAmount: "84.00",
        totalAmount: "1284.00",
      })
      .returning();
    const sku = await createSku({
      orgId: org.id,
      skuCode: "SKU-DOM-001",
      nameEn: "Domestic item",
      standardCost: "100.0000",
    });

    const movement = await recordInventoryMovement({
      orgId: org.id,
      establishmentId: establishment.id,
      skuId: sku.id,
      movementAt: new Date("2026-05-01T12:00:00+07:00"),
      movementType: "purchase_in",
      quantity: "10.0000",
      unitCost: "120.0000",
      purchaseVatAmount: "84.00",
      purchaseApAmount: "1284.00",
      sourceEntityType: "documents",
      sourceEntityId: doc.id,
    });

    expect(movement.journalEntryId).toBeTruthy();
    const journalRows = await testDb.execute(sql`
      SELECT je.entry_type, je.posting_kind, je.total_debit, je.total_credit,
             ga.account_code, jl.debit_amount, jl.credit_amount,
             jl.subledger_entity_type, jl.subledger_entity_id
      FROM journal_entries je
      INNER JOIN journal_lines jl
        ON jl.journal_entry_id = je.id
        AND jl.org_id = je.org_id
      INNER JOIN gl_accounts ga
        ON ga.id = jl.account_id
        AND ga.org_id = jl.org_id
      WHERE je.id = ${movement.journalEntryId}
      ORDER BY jl.line_number
    `);

    expect(journalRows.rows).toMatchObject([
      {
        entry_type: "auto_document",
        posting_kind: "inventory_purchase",
        account_code: "1160",
        debit_amount: "1200.00",
        credit_amount: "0.00",
        subledger_entity_type: "inventory_movement",
      },
      {
        entry_type: "auto_document",
        posting_kind: "inventory_purchase",
        account_code: "1251",
        debit_amount: "84.00",
        credit_amount: "0.00",
        subledger_entity_type: "documents",
        subledger_entity_id: doc.id,
      },
      {
        entry_type: "auto_document",
        posting_kind: "inventory_purchase",
        account_code: "2110",
        debit_amount: "0.00",
        credit_amount: "1284.00",
        subledger_entity_type: "documents",
        subledger_entity_id: doc.id,
      },
    ]);
    expect(journalRows.rows[0]).toMatchObject({
      total_debit: "1284.00",
      total_credit: "1284.00",
    });

    const [outbox] = await testDb
      .select()
      .from(schema.postingOutbox)
      .where(sql`${schema.postingOutbox.sourceEntityId} = ${movement.id}`)
      .limit(1);
    expect(outbox).toMatchObject({
      sourceEntityType: "inventory_movements",
      eventType: "post_gl",
      postingDate: "2026-05-01",
      postingStatus: "pending",
    });
    const posted = await processPostingOutboxRow({
      orgId: org.id,
      postingOutboxId: outbox.id,
    });
    expect(posted.postingStatus).toBe("posted");
    expect(posted.journalEntryId).toBe(movement.journalEntryId);

    const purchaseEntries = await testDb
      .select()
      .from(schema.journalEntries)
      .where(sql`${schema.journalEntries.sourceEntityId} = ${movement.id}`);
    expect(purchaseEntries).toHaveLength(1);
  });

  it("allocates domestic inventory purchase cost lines without splitting VAT or AP", async () => {
    const org = await createTestOrg(testDb);
    const establishment = await createHeadOffice(org.id);
    const [vendor] = await testDb
      .insert(schema.vendors)
      .values({ orgId: org.id, name: "Allocation Vendor", entityType: "company" })
      .returning();
    const [ops, admin] = await testDb
      .insert(schema.costCenters)
      .values([
        { orgId: org.id, code: "OPS", nameEn: "Operations" },
        { orgId: org.id, code: "ADM", nameEn: "Admin" },
      ])
      .returning();
    const [rule] = await testDb
      .insert(schema.allocationRules)
      .values({
        orgId: org.id,
        ruleName: "Inventory vendor split",
        sourceType: "vendor",
        sourceId: vendor.id,
      })
      .returning();
    await testDb.insert(schema.allocationRuleTargets).values([
      {
        orgId: org.id,
        allocationRuleId: rule.id,
        costCenterId: ops.id,
        percentage: "0.6000",
      },
      {
        orgId: org.id,
        allocationRuleId: rule.id,
        costCenterId: admin.id,
        percentage: "0.4000",
      },
    ]);
    const [doc] = await testDb
      .insert(schema.documents)
      .values({
        orgId: org.id,
        vendorId: vendor.id,
        category: "inventory",
        direction: "expense",
        type: "invoice",
        status: "confirmed",
        issueDate: "2026-05-01",
        subtotal: "1200.00",
        vatAmount: "84.00",
        totalAmount: "1284.00",
      })
      .returning();
    const sku = await createSku({
      orgId: org.id,
      skuCode: "SKU-ALLOC-001",
      nameEn: "Allocated item",
      standardCost: "100.0000",
    });

    const movement = await recordInventoryMovement({
      orgId: org.id,
      establishmentId: establishment.id,
      skuId: sku.id,
      movementAt: new Date("2026-05-01T12:00:00+07:00"),
      movementType: "purchase_in",
      quantity: "10.0000",
      unitCost: "120.0000",
      purchaseVatAmount: "84.00",
      purchaseApAmount: "1284.00",
      sourceEntityType: "documents",
      sourceEntityId: doc.id,
    });

    const journalRows = await testDb.execute(sql`
      SELECT ga.account_code, jl.debit_amount, jl.credit_amount, jl.cost_center_id
      FROM journal_lines jl
      INNER JOIN gl_accounts ga
        ON ga.id = jl.account_id
        AND ga.org_id = jl.org_id
      WHERE jl.journal_entry_id = ${movement.journalEntryId}
      ORDER BY jl.line_number
    `);

    expect(journalRows.rows).toMatchObject([
      {
        account_code: "1160",
        debit_amount: "720.00",
        credit_amount: "0.00",
        cost_center_id: ops.id,
      },
      {
        account_code: "1160",
        debit_amount: "480.00",
        credit_amount: "0.00",
        cost_center_id: admin.id,
      },
      {
        account_code: "1251",
        debit_amount: "84.00",
        credit_amount: "0.00",
        cost_center_id: null,
      },
      {
        account_code: "2110",
        debit_amount: "0.00",
        credit_amount: "1284.00",
        cost_center_id: null,
      },
    ]);
  });

  it("enforces same-org guardrails on SKUs, movements, counts, and overhead components", async () => {
    const org = await createTestOrg(testDb);
    const otherOrg = await createTestOrg(testDb);
    const otherEstablishment = await createHeadOffice(otherOrg.id);
    const establishment = await createHeadOffice(org.id);
    const sku = await createSku({ orgId: org.id, skuCode: "SKU-GUARD" });

    await expect(
      testDb.insert(schema.skus).values({
        orgId: org.id,
        establishmentId: otherEstablishment.id,
        skuCode: "SKU-X",
      })
    ).rejects.toThrow(/Failed query/);

    await expect(
      testDb.insert(schema.inventoryMovements).values({
        orgId: org.id,
        establishmentId: otherEstablishment.id,
        skuId: sku.id,
        movementAt: new Date("2026-05-01T00:00:00Z"),
        movementType: "purchase_in",
        quantity: "1.0000",
        unitCost: "10.0000",
        totalCost: "10.00",
      })
    ).rejects.toThrow(/Failed query/);

    await expect(
      testDb.insert(schema.inventoryCounts).values({
        orgId: org.id,
        establishmentId: otherEstablishment.id,
        countDate: "2026-05-31",
      })
    ).rejects.toThrow(/Failed query/);

    const [count] = await testDb
      .insert(schema.inventoryCounts)
      .values({
        orgId: org.id,
        establishmentId: establishment.id,
        countDate: "2026-05-31",
      })
      .returning();

    const otherSku = await createSku({ orgId: otherOrg.id, skuCode: "SKU-OTHER" });
    await expect(
      testDb.insert(schema.inventoryCountItems).values({
        orgId: org.id,
        countId: count.id,
        skuId: otherSku.id,
        systemQuantity: "0.0000",
        countedQuantity: "0.0000",
        variance: "0.0000",
        varianceValueThb: "0.00",
      })
    ).rejects.toThrow(/Failed query/);
  });

  it("keeps inventory movements immutable", async () => {
    const org = await createTestOrg(testDb);
    const establishment = await createHeadOffice(org.id);
    const sku = await createSku({ orgId: org.id, skuCode: "SKU-IMM" });
    const movement = await recordInventoryMovement({
      orgId: org.id,
      establishmentId: establishment.id,
      skuId: sku.id,
      movementAt: new Date("2026-05-01T00:00:00Z"),
      movementType: "purchase_in",
      quantity: "1.0000",
      unitCost: "10.0000",
    });

    await expect(
      testDb
        .update(schema.inventoryMovements)
        .set({ notes: "late edit" })
      .where(sql`${schema.inventoryMovements.id} = ${movement.id}`)
    ).rejects.toThrow(/Failed query/);
  });

  it("snapshots inventory count variances and reconciles them into movement ledger rows", async () => {
    const org = await createTestOrg(testDb);
    const establishment = await createHeadOffice(org.id);
    const sku = await createSku({
      orgId: org.id,
      skuCode: "SKU-COUNT",
      standardCost: "10.0000",
    });

    await createSaleTransaction(org.id, establishment.id);
    await recordInventoryMovement({
      orgId: org.id,
      establishmentId: establishment.id,
      skuId: sku.id,
      movementAt: new Date("2026-05-01T00:00:00Z"),
      movementType: "purchase_in",
      quantity: "10.0000",
      unitCost: "10.0000",
    });

    const count = await createInventoryCount({
      orgId: org.id,
      establishmentId: establishment.id,
      countDate: "2026-05-31",
      countType: "cycle",
    });

    const item = await addInventoryCountItem({
      orgId: org.id,
      countId: count.id,
      skuId: sku.id,
      countedQuantity: "8.0000",
      varianceReason: "shrinkage",
    });

    expect(item.systemQuantity).toBe("10.0000");
    expect(item.countedQuantity).toBe("8.0000");
    expect(item.variance).toBe("-2.0000");
    expect(item.varianceValueThb).toBe("20.00");

    const result = await reconcileInventoryCount({
      orgId: org.id,
      countId: count.id,
      userId: "user-count",
    });

    expect(result.count.status).toBe("reconciled");
    expect(result.movements).toHaveLength(1);
    expect(result.movements[0].movementType).toBe("count_variance_out");
    expect(result.movements[0].quantity).toBe("-2.0000");
    expect(result.movements[0].sourceEntityType).toBe("inventory_counts");
    expect(result.movements[0].sourceEntityId).toBe(count.id);
    expect(result.movements[0].journalEntryId).toBeTruthy();

    const detail = await getInventoryCountDetail(org.id, count.id);
    expect(detail?.count).toMatchObject({
      id: count.id,
      countDate: "2026-05-31",
      countType: "cycle",
      status: "reconciled",
      totalVarianceValueThb: "20.00",
    });
    expect(detail?.items).toHaveLength(1);
    expect(detail?.items[0]).toMatchObject({
      skuCode: "SKU-COUNT",
      systemQuantity: "10.0000",
      countedQuantity: "8.0000",
      variance: "-2.0000",
      varianceReason: "shrinkage",
    });
    expect(detail?.movements).toHaveLength(1);
    expect(detail?.movements[0]).toMatchObject({
      skuCode: "SKU-COUNT",
      movementType: "count_variance_out",
      quantity: "-2.0000",
    });

    const varianceOutLines = await testDb.execute(sql`
      SELECT ga.account_code, jl.debit_amount, jl.credit_amount, je.entry_type, je.posting_kind
      FROM ${schema.journalLines} jl
      JOIN ${schema.glAccounts} ga ON ga.id = jl.account_id
      JOIN ${schema.journalEntries} je ON je.id = jl.journal_entry_id
      WHERE je.id = ${result.movements[0].journalEntryId}
      ORDER BY jl.line_number ASC
    `);
    expect(varianceOutLines.rows).toEqual([
      expect.objectContaining({
        account_code: "5120",
        debit_amount: "20.00",
        credit_amount: "0.00",
        entry_type: "auto_sales",
        posting_kind: "inventory_count_variance",
      }),
      expect.objectContaining({
        account_code: "1160",
        debit_amount: "0.00",
        credit_amount: "20.00",
        entry_type: "auto_sales",
        posting_kind: "inventory_count_variance",
      }),
    ]);

    const [outbox] = await testDb
      .select()
      .from(schema.postingOutbox)
      .where(sql`${schema.postingOutbox.sourceEntityId} = ${result.movements[0].id}`)
      .limit(1);
    expect(outbox).toMatchObject({
      sourceEntityType: "inventory_movements",
      eventType: "post_gl",
      postingDate: "2026-05-31",
      postingStatus: "pending",
    });
    const posted = await processPostingOutboxRow({
      orgId: org.id,
      postingOutboxId: outbox.id,
    });
    expect(posted.postingStatus).toBe("posted");
    expect(posted.journalEntryId).toBe(result.movements[0].journalEntryId);

    const auditRows = await testDb.execute(sql`
      SELECT new_value
      FROM ${schema.auditLog}
      WHERE org_id = ${org.id}
        AND entity_type = 'journal_entry'
        AND new_value ->> 'event' = 'inventory_count_variance_posted'
    `);
    expect(auditRows.rows).toHaveLength(1);
    expect(auditRows.rows[0].new_value).toMatchObject({
      movementType: "count_variance_out",
      totalCost: "20.00",
    });

    const [updatedSku] = await testDb
      .select()
      .from(schema.skus)
      .where(sql`${schema.skus.id} = ${sku.id}`);
    expect(updatedSku.currentQuantity).toBe("8.0000");
    expect(updatedSku.currentValue).toBe("80.00");

    await expect(
      reconcileInventoryCount({ orgId: org.id, countId: count.id, userId: "user-count" })
    ).rejects.toThrow(/already reconciled/);

    await expect(
      addInventoryCountItem({
        orgId: org.id,
        countId: count.id,
        skuId: sku.id,
        countedQuantity: "9.0000",
      })
    ).rejects.toThrow(/cannot be edited/);

    const dashboard = await getInventoryDashboard(org.id);
    expect(dashboard.recentCounts[0].status).toBe("reconciled");
    expect(dashboard.recentCounts[0].itemCount).toBe(1);
  });

  it("uses captured count variance cost for found stock on zero-average SKUs", async () => {
    const org = await createTestOrg(testDb);
    const establishment = await createHeadOffice(org.id);
    const sku = await createSku({
      orgId: org.id,
      skuCode: "SKU-FOUND",
      standardCost: "7.5000",
    });
    const count = await createInventoryCount({
      orgId: org.id,
      establishmentId: establishment.id,
      countDate: "2026-05-31",
    });

    const item = await addInventoryCountItem({
      orgId: org.id,
      countId: count.id,
      skuId: sku.id,
      countedQuantity: "3.0000",
      varianceReason: "other",
    });
    expect(item.varianceValueThb).toBe("22.50");

    const result = await reconcileInventoryCount({ orgId: org.id, countId: count.id });
    expect(result.movements[0].movementType).toBe("count_variance_in");
    expect(result.movements[0].unitCost).toBe("7.5000");
    expect(result.movements[0].journalEntryId).toBeTruthy();

    const varianceInLines = await testDb.execute(sql`
      SELECT ga.account_code, jl.debit_amount, jl.credit_amount, je.posting_kind
      FROM ${schema.journalLines} jl
      JOIN ${schema.glAccounts} ga ON ga.id = jl.account_id
      JOIN ${schema.journalEntries} je ON je.id = jl.journal_entry_id
      WHERE je.id = ${result.movements[0].journalEntryId}
      ORDER BY jl.line_number ASC
    `);
    expect(varianceInLines.rows).toEqual([
      expect.objectContaining({
        account_code: "1160",
        debit_amount: "22.50",
        credit_amount: "0.00",
        posting_kind: "inventory_count_variance",
      }),
      expect.objectContaining({
        account_code: "5120",
        debit_amount: "0.00",
        credit_amount: "22.50",
        posting_kind: "inventory_count_variance",
      }),
    ]);

    const [updatedSku] = await testDb
      .select()
      .from(schema.skus)
      .where(sql`${schema.skus.id} = ${sku.id}`);
    expect(updatedSku.currentQuantity).toBe("3.0000");
    expect(updatedSku.currentAvgCost).toBe("7.5000");
    expect(updatedSku.currentValue).toBe("22.50");
  });

  it("rejects count-variance-out cost overrides that would diverge GL from inventory value", async () => {
    const org = await createTestOrg(testDb);
    const establishment = await createHeadOffice(org.id);
    const sku = await createSku({
      orgId: org.id,
      skuCode: "SKU-COUNT-COST",
      standardCost: "10.0000",
    });
    await recordInventoryMovement({
      orgId: org.id,
      establishmentId: establishment.id,
      skuId: sku.id,
      movementAt: new Date("2026-05-01T12:00:00+07:00"),
      movementType: "purchase_in",
      quantity: "10.0000",
      unitCost: "10.0000",
    });

    await expect(
      recordInventoryMovement({
        orgId: org.id,
        establishmentId: establishment.id,
        skuId: sku.id,
        movementAt: new Date("2026-05-02T12:00:00+07:00"),
        movementType: "count_variance_out",
        quantity: "-2.0000",
        unitCost: "7.0000",
        sourceEntityType: "inventory_counts",
      })
    ).rejects.toThrow(/cost must match current inventory cost basis/i);

    const [updatedSku] = await testDb
      .select()
      .from(schema.skus)
      .where(sql`${schema.skus.id} = ${sku.id}`);
    expect(updatedSku.currentQuantity).toBe("10.0000");
    expect(updatedSku.currentAvgCost).toBe("10.0000");
    expect(updatedSku.currentValue).toBe("100.00");
  });

  it("rejects found-stock adjustments without positive cost", async () => {
    const org = await createTestOrg(testDb);
    const establishment = await createHeadOffice(org.id);
    const sku = await createSku({
      orgId: org.id,
      skuCode: "SKU-ADJ-ZERO",
      standardCost: "0.0000",
    });

    await expect(
      recordInventoryMovement({
        orgId: org.id,
        establishmentId: establishment.id,
        skuId: sku.id,
        movementAt: new Date("2026-05-01T12:00:00+07:00"),
        movementType: "adjustment_in",
        quantity: "1.0000",
        unitCost: "0.0000",
        sourceEntityType: "manual",
      })
    ).rejects.toThrow(/positive unit cost/i);
  });

  it("reconciles zero-variance counts without movement or GL rows", async () => {
    const org = await createTestOrg(testDb);
    const establishment = await createHeadOffice(org.id);
    const sku = await createSku({
      orgId: org.id,
      skuCode: "SKU-ZERO-COUNT",
      standardCost: "10.0000",
    });

    await recordInventoryMovement({
      orgId: org.id,
      establishmentId: establishment.id,
      skuId: sku.id,
      movementAt: new Date("2026-05-01T12:00:00+07:00"),
      movementType: "purchase_in",
      quantity: "5.0000",
      unitCost: "10.0000",
    });
    const count = await createInventoryCount({
      orgId: org.id,
      establishmentId: establishment.id,
      countDate: "2026-05-31",
    });
    await addInventoryCountItem({
      orgId: org.id,
      countId: count.id,
      skuId: sku.id,
      countedQuantity: "5.0000",
    });

    const result = await reconcileInventoryCount({ orgId: org.id, countId: count.id });
    expect(result.count.status).toBe("reconciled");
    expect(result.movements).toHaveLength(0);

    const rows = await testDb.execute(sql`
      SELECT COUNT(*)::int AS count
      FROM ${schema.journalEntries}
      WHERE org_id = ${org.id}
        AND posting_kind = 'inventory_count_variance'
    `);
    expect(rows.rows[0].count).toBe(0);
  });

  it("blocks count reconciliation in locked GL periods", async () => {
    const org = await createTestOrg(testDb);
    const establishment = await createHeadOffice(org.id);
    const sku = await createSku({
      orgId: org.id,
      skuCode: "SKU-COUNT-LOCK",
      standardCost: "10.0000",
    });
    await recordInventoryMovement({
      orgId: org.id,
      establishmentId: establishment.id,
      skuId: sku.id,
      movementAt: new Date("2026-05-01T12:00:00+07:00"),
      movementType: "purchase_in",
      quantity: "5.0000",
      unitCost: "10.0000",
    });
    const count = await createInventoryCount({
      orgId: org.id,
      establishmentId: establishment.id,
      countDate: "2026-05-31",
    });
    await addInventoryCountItem({
      orgId: org.id,
      countId: count.id,
      skuId: sku.id,
      countedQuantity: "4.0000",
    });
    await testDb.insert(schema.periodLocks).values({
      orgId: org.id,
      establishmentId: establishment.id,
      domain: "gl",
      periodYear: 2026,
      periodMonth: 5,
      lockedByUserId: "user-lock",
      lockReason: "routine_close",
    });

    await expect(
      reconcileInventoryCount({ orgId: org.id, countId: count.id })
    ).rejects.toThrow(/locked for GL/);
  });

  it("blocks count reconciliation when later SKU movements exist", async () => {
    const org = await createTestOrg(testDb);
    const establishment = await createHeadOffice(org.id);
    const sku = await createSku({
      orgId: org.id,
      skuCode: "SKU-COUNT-BACKDATE",
      standardCost: "10.0000",
    });
    await recordInventoryMovement({
      orgId: org.id,
      establishmentId: establishment.id,
      skuId: sku.id,
      movementAt: new Date("2026-05-31T13:00:00+07:00"),
      movementType: "purchase_in",
      quantity: "5.0000",
      unitCost: "10.0000",
    });
    const count = await createInventoryCount({
      orgId: org.id,
      establishmentId: establishment.id,
      countDate: "2026-05-31",
    });
    await addInventoryCountItem({
      orgId: org.id,
      countId: count.id,
      skuId: sku.id,
      countedQuantity: "4.0000",
    });

    await expect(
      reconcileInventoryCount({ orgId: org.id, countId: count.id })
    ).rejects.toThrow(/Backdated inventory movements/);
  });

  it("builds inventory roll-forward rows from immutable movements", async () => {
    const org = await createTestOrg(testDb);
    const establishment = await createHeadOffice(org.id);
    const sku = await createSku({
      orgId: org.id,
      skuCode: "SKU-RF",
      standardCost: "10.0000",
    });

    await recordInventoryMovement({
      orgId: org.id,
      establishmentId: establishment.id,
      skuId: sku.id,
      movementAt: new Date("2026-04-30T12:00:00+07:00"),
      movementType: "purchase_in",
      quantity: "10.0000",
      unitCost: "10.0000",
    });
    await recordInventoryMovement({
      orgId: org.id,
      establishmentId: establishment.id,
      skuId: sku.id,
      movementAt: new Date("2026-05-05T12:00:00+07:00"),
      movementType: "purchase_in",
      quantity: "5.0000",
      unitCost: "12.0000",
    });
    const sale = await createSaleTransaction(org.id, establishment.id);
    await recordInventoryMovement({
      orgId: org.id,
      establishmentId: establishment.id,
      skuId: sku.id,
      movementAt: new Date("2026-05-10T12:00:00+07:00"),
      movementType: "sale_out",
      quantity: "-3.0000",
      sourceEntityType: "sales_transactions",
      sourceEntityId: sale.id,
    });

    const rows = await getInventoryRollForward({
      orgId: org.id,
      periodYear: 2026,
      periodMonth: 5,
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].skuCode).toBe("SKU-RF");
    expect(rows[0].openingQuantity).toBe("10.0000");
    expect(rows[0].openingValue).toBe("100.00");
    expect(rows[0].inboundQuantity).toBe("5.0000");
    expect(rows[0].outboundQuantity).toBe("3.0000");
    expect(rows[0].closingQuantity).toBe("12.0000");
    expect(rows[0].closingValue).toBe("128.00");
  });

  it("loads SKU detail with movement source and journal trace", async () => {
    const org = await createTestOrg(testDb);
    const otherOrg = await createTestOrg(testDb);
    const establishment = await createHeadOffice(org.id);
    await createHeadOffice(otherOrg.id);
    const sku = await createSku({
      orgId: org.id,
      skuCode: "SKU-DETAIL",
      nameEn: "Detail item",
      standardCost: "10.0000",
    });
    const otherSku = await createSku({
      orgId: otherOrg.id,
      skuCode: "SKU-OTHER-DETAIL",
      standardCost: "1.0000",
    });
    const [purchaseDoc] = await testDb
      .insert(schema.documents)
      .values({
        orgId: org.id,
        direction: "expense",
        type: "invoice",
        status: "confirmed",
        issueDate: "2026-05-01",
        subtotal: "100.00",
        vatAmount: "7.00",
        totalAmount: "107.00",
      })
      .returning();

    await recordInventoryMovement({
      orgId: org.id,
      establishmentId: establishment.id,
      skuId: sku.id,
      movementAt: new Date("2026-05-01T12:00:00+07:00"),
      movementType: "purchase_in",
      quantity: "10.0000",
      unitCost: "10.0000",
      sourceEntityType: "documents",
      sourceEntityId: purchaseDoc.id,
      notes: "purchase receipt",
    });
    const sale = await createSaleTransaction(org.id, establishment.id);
    const saleMovement = await recordInventoryMovement({
      orgId: org.id,
      establishmentId: establishment.id,
      skuId: sku.id,
      movementAt: new Date("2026-05-02T12:00:00+07:00"),
      movementType: "sale_out",
      quantity: "-2.0000",
      sourceEntityType: "sales_transactions",
      sourceEntityId: sale.id,
    });

    const detail = await getInventorySkuDetail(org.id, sku.id);

    expect(detail?.sku.skuCode).toBe("SKU-DETAIL");
    expect(detail?.movements).toHaveLength(2);
    expect(detail?.movements[0].id).toBe(saleMovement.id);
    expect(detail?.movements[0].sourceEntityType).toBe("sales_transactions");
    expect(detail?.movements[0].journalEntryId).toBeTruthy();
    expect(detail?.movements[1].sourceEntityType).toBe("documents");
    expect(detail?.movements[1].sourceEntityId).toBe(purchaseDoc.id);
    await expect(getInventorySkuDetail(org.id, otherSku.id)).resolves.toBeNull();
  });

  it("uses signed adjustment value in inventory roll-forward", async () => {
    const org = await createTestOrg(testDb);
    const establishment = await createHeadOffice(org.id);
    const sku = await createSku({
      orgId: org.id,
      skuCode: "SKU-ADJ",
      standardCost: "10.0000",
    });

    await createSaleTransaction(org.id, establishment.id);
    await recordInventoryMovement({
      orgId: org.id,
      establishmentId: establishment.id,
      skuId: sku.id,
      movementAt: new Date("2026-05-01T12:00:00+07:00"),
      movementType: "adjustment_in",
      quantity: "5.0000",
      unitCost: "40.0000",
      sourceEntityType: "manual",
    });
    await recordInventoryMovement({
      orgId: org.id,
      establishmentId: establishment.id,
      skuId: sku.id,
      movementAt: new Date("2026-05-02T12:00:00+07:00"),
      movementType: "adjustment_out",
      quantity: "-3.0000",
      sourceEntityType: "manual",
    });

    const rows = await getInventoryRollForward({
      orgId: org.id,
      periodYear: 2026,
      periodMonth: 5,
    });

    expect(rows[0].adjustmentQuantity).toBe("2.0000");
    expect(rows[0].adjustmentValue).toBe("80.00");
    expect(rows[0].closingValue).toBe("80.00");

    const movementEntries = await testDb
      .select()
      .from(schema.journalEntries)
      .where(sql`${schema.journalEntries.postingKind} = 'inventory_count_variance'`);
    expect(movementEntries).toHaveLength(2);
    const outboxRows = await testDb
      .select()
      .from(schema.postingOutbox)
      .where(sql`${schema.postingOutbox.sourceEntityType} = 'inventory_movements'`);
    expect(outboxRows).toHaveLength(2);
  });

  it("rejects manual non-adjustment inventory movements", async () => {
    const org = await createTestOrg(testDb);
    const establishment = await createHeadOffice(org.id);
    const sku = await createSku({
      orgId: org.id,
      skuCode: "SKU-MANUAL-BLOCK",
      standardCost: "10.0000",
    });

    await expect(
      recordInventoryMovement({
        orgId: org.id,
        establishmentId: establishment.id,
        skuId: sku.id,
        movementAt: new Date("2026-05-01T12:00:00+07:00"),
        movementType: "sale_out",
        quantity: "-1.0000",
        sourceEntityType: "manual",
      })
    ).rejects.toThrow(/manual inventory movements|sales transactions/i);

    await expect(
      recordInventoryMovement({
        orgId: org.id,
        establishmentId: establishment.id,
        skuId: sku.id,
        movementAt: new Date("2026-05-01T12:00:00+07:00"),
        movementType: "purchase_in",
        quantity: "1.0000",
        unitCost: "10.0000",
        sourceEntityType: "manual",
      })
    ).rejects.toThrow(/manual inventory movements/i);
  });

  it("rejects movement quantities whose sign conflicts with the movement type", async () => {
    const org = await createTestOrg(testDb);
    const establishment = await createHeadOffice(org.id);
    const sku = await createSku({
      orgId: org.id,
      skuCode: "SKU-SIGN-GUARD",
      standardCost: "10.0000",
    });

    await expect(
      recordInventoryMovement({
        orgId: org.id,
        establishmentId: establishment.id,
        skuId: sku.id,
        movementAt: new Date("2026-05-01T12:00:00+07:00"),
        movementType: "adjustment_in",
        quantity: "-1.0000",
        unitCost: "10.0000",
        sourceEntityType: "manual",
      })
    ).rejects.toThrow(/positive quantity/i);

    await expect(
      recordInventoryMovement({
        orgId: org.id,
        establishmentId: establishment.id,
        skuId: sku.id,
        movementAt: new Date("2026-05-01T12:00:00+07:00"),
        movementType: "adjustment_out",
        quantity: "1.0000",
        unitCost: "10.0000",
        sourceEntityType: "manual",
      })
    ).rejects.toThrow(/negative quantity/i);
  });

  it("rejects sale-out movements without a live sales transaction source", async () => {
    const org = await createTestOrg(testDb);
    const establishment = await createHeadOffice(org.id);
    const sku = await createSku({
      orgId: org.id,
      skuCode: "SKU-SALE-SOURCE",
      standardCost: "10.0000",
    });
    await recordInventoryMovement({
      orgId: org.id,
      establishmentId: establishment.id,
      skuId: sku.id,
      movementAt: new Date("2026-05-01T12:00:00+07:00"),
      movementType: "purchase_in",
      quantity: "2.0000",
      unitCost: "10.0000",
    });

    await expect(
      recordInventoryMovement({
        orgId: org.id,
        establishmentId: establishment.id,
        skuId: sku.id,
        movementAt: new Date("2026-05-02T12:00:00+07:00"),
        movementType: "sale_out",
        quantity: "-1.0000",
        sourceEntityType: "sales_transactions",
        sourceEntityId: "00000000-0000-4000-8000-000000000102",
      })
    ).rejects.toThrow(/source transaction not found/i);
  });

  it("rejects document purchase receipts for deleted source documents", async () => {
    const org = await createTestOrg(testDb);
    const establishment = await createHeadOffice(org.id);
    const [doc] = await testDb
      .insert(schema.documents)
      .values({
        orgId: org.id,
        direction: "expense",
        type: "invoice",
        status: "confirmed",
        issueDate: "2026-05-01",
        subtotal: "100.00",
        vatAmount: "7.00",
        totalAmount: "107.00",
        deletedAt: new Date(),
      })
      .returning();
    const sku = await createSku({
      orgId: org.id,
      skuCode: "SKU-DELETED-DOC",
      standardCost: "10.0000",
    });

    await expect(
      recordInventoryMovement({
        orgId: org.id,
        establishmentId: establishment.id,
        skuId: sku.id,
        movementAt: new Date("2026-05-01T12:00:00+07:00"),
        movementType: "purchase_in",
        quantity: "1.0000",
        unitCost: "100.0000",
        sourceEntityType: "documents",
        sourceEntityId: doc.id,
      })
    ).rejects.toThrow(/source document not found/i);
  });

  it("rejects document purchase receipts without a source document id", async () => {
    const org = await createTestOrg(testDb);
    const establishment = await createHeadOffice(org.id);
    const sku = await createSku({
      orgId: org.id,
      skuCode: "SKU-MISSING-DOC",
      standardCost: "10.0000",
    });

    await expect(
      recordInventoryMovement({
        orgId: org.id,
        establishmentId: establishment.id,
        skuId: sku.id,
        movementAt: new Date("2026-05-01T12:00:00+07:00"),
        movementType: "purchase_in",
        quantity: "1.0000",
        unitCost: "100.0000",
        sourceEntityType: "documents",
      })
    ).rejects.toThrow(/source document is required/i);
  });

  it("blocks backdated movements that would corrupt running balances", async () => {
    const org = await createTestOrg(testDb);
    const establishment = await createHeadOffice(org.id);
    const sku = await createSku({
      orgId: org.id,
      skuCode: "SKU-BACKDATE",
      standardCost: "10.0000",
    });

    await recordInventoryMovement({
      orgId: org.id,
      establishmentId: establishment.id,
      skuId: sku.id,
      movementAt: new Date("2026-05-10T12:00:00+07:00"),
      movementType: "purchase_in",
      quantity: "1.0000",
      unitCost: "10.0000",
    });

    await expect(
      recordInventoryMovement({
        orgId: org.id,
        establishmentId: establishment.id,
        skuId: sku.id,
        movementAt: new Date("2026-05-05T12:00:00+07:00"),
        movementType: "purchase_in",
        quantity: "1.0000",
        unitCost: "10.0000",
      })
    ).rejects.toThrow(/Backdated inventory movements/);
  });

  it("blocks same-instant movements that would make running balances order-dependent", async () => {
    const org = await createTestOrg(testDb);
    const establishment = await createHeadOffice(org.id);
    const sku = await createSku({
      orgId: org.id,
      skuCode: "SKU-SAME-INSTANT",
      standardCost: "10.0000",
    });

    await recordInventoryMovement({
      orgId: org.id,
      establishmentId: establishment.id,
      skuId: sku.id,
      movementAt: new Date("2026-05-10T12:00:00+07:00"),
      movementType: "purchase_in",
      quantity: "1.0000",
      unitCost: "10.0000",
    });

    await expect(
      recordInventoryMovement({
        orgId: org.id,
        establishmentId: establishment.id,
        skuId: sku.id,
        movementAt: new Date("2026-05-10T12:00:00+07:00"),
        movementType: "purchase_in",
        quantity: "1.0000",
        unitCost: "10.0000",
      })
    ).rejects.toThrow(/Backdated inventory movements/);
  });

  it("blocks inventory movements in locked GL periods", async () => {
    const org = await createTestOrg(testDb);
    const establishment = await createHeadOffice(org.id);
    const sku = await createSku({
      orgId: org.id,
      skuCode: "SKU-LOCK",
      standardCost: "10.0000",
    });

    await testDb.insert(schema.periodLocks).values({
      orgId: org.id,
      establishmentId: establishment.id,
      domain: "gl",
      periodYear: 2026,
      periodMonth: 5,
      lockedByUserId: "user-lock",
      lockReason: "routine_close",
    });

    await expect(
      recordInventoryMovement({
        orgId: org.id,
        establishmentId: establishment.id,
        skuId: sku.id,
        movementAt: new Date("2026-05-05T12:00:00+07:00"),
        movementType: "purchase_in",
        quantity: "1.0000",
        unitCost: "10.0000",
      })
    ).rejects.toThrow(/locked for GL/);
  });

  it("blocks inventory outbox replay into locked GL periods", async () => {
    const org = await createTestOrg(testDb);
    const establishment = await createHeadOffice(org.id);
    const sku = await createSku({
      orgId: org.id,
      skuCode: "SKU-REPLAY-LOCK",
      standardCost: "10.0000",
    });
    const movementId = randomUUID();
    await testDb.insert(schema.inventoryMovements).values({
      id: movementId,
      orgId: org.id,
      establishmentId: establishment.id,
      skuId: sku.id,
      movementAt: new Date("2026-05-05T12:00:00+07:00"),
      movementType: "adjustment_out",
      quantity: "-1.0000",
      unitCost: "10.0000",
      totalCost: "10.00",
      sourceEntityType: "manual",
      runningQuantityAfter: "0.0000",
      runningAvgCostAfter: "0.0000",
      runningValueAfter: "0.00",
    });
    await testDb.insert(schema.periodLocks).values({
      orgId: org.id,
      establishmentId: establishment.id,
      domain: "gl",
      periodYear: 2026,
      periodMonth: 5,
      lockedByUserId: "user-lock",
      lockReason: "routine_close",
    });

    await expect(
      postInventoryMovementJournalEntry(testDb, {
        orgId: org.id,
        movementId,
      })
    ).rejects.toThrow(/locked for GL/);
  });

  it("builds aged inventory buckets from last sale movement", async () => {
    const org = await createTestOrg(testDb);
    const establishment = await createHeadOffice(org.id);
    const sku = await createSku({
      orgId: org.id,
      skuCode: "SKU-AGED",
      standardCost: "10.0000",
    });

    await recordInventoryMovement({
      orgId: org.id,
      establishmentId: establishment.id,
      skuId: sku.id,
      movementAt: new Date("2026-01-01T12:00:00+07:00"),
      movementType: "purchase_in",
      quantity: "10.0000",
      unitCost: "10.0000",
    });
    const sale = await createSaleTransaction(org.id, establishment.id);
    await recordInventoryMovement({
      orgId: org.id,
      establishmentId: establishment.id,
      skuId: sku.id,
      movementAt: new Date("2026-02-01T12:00:00+07:00"),
      movementType: "sale_out",
      quantity: "-1.0000",
      sourceEntityType: "sales_transactions",
      sourceEntityId: sale.id,
    });

    const rows = await getAgedInventoryReport({
      orgId: org.id,
      asOfDate: "2026-05-15",
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].skuCode).toBe("SKU-AGED");
    expect(rows[0].currentQuantity).toBe("9.0000");
    expect(rows[0].daysSinceLastSale).toBe(103);
    expect(rows[0].ageBucket).toBe("90_179");
  });
});
