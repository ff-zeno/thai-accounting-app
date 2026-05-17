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
let buildAgingSnapshot: typeof import("./aging").buildAgingSnapshot;
let computeCashForecast: typeof import("./kpi-engine").computeCashForecast;
let computeCounterpartyConcentration: typeof import("./kpi-engine").computeCounterpartyConcentration;
let computeDso: typeof import("./kpi-engine").computeDso;
let computeGrossMarginByCategory: typeof import("./kpi-engine").computeGrossMarginByCategory;

beforeAll(async () => {
  await resetTestDb(pool);
  await migrateTestDb(pool);
  vi.doMock("@/lib/db/index", () => ({ db: testDb }));
  ({ buildAgingSnapshot } = await import("./aging"));
  ({
    computeCashForecast,
    computeCounterpartyConcentration,
    computeDso,
    computeGrossMarginByCategory,
  } = await import("./kpi-engine"));
});

afterAll(async () => {
  await resetTestDb(pool);
  await pool.end();
});

beforeEach(async () => {
  await testDb.execute(sql`
    TRUNCATE TABLE
      bank_accounts,
      inventory_movements,
      skus,
      establishments,
      payments,
      documents,
      vendors,
      organizations
    CASCADE
  `);
});

describe("aging snapshots", () => {
  it("buckets open AR by days past due", async () => {
    const org = await createTestOrg(testDb);
    const [customer] = await testDb
      .insert(schema.vendors)
      .values({
        orgId: org.id,
        name: "Credit Customer",
        entityType: "company",
      })
      .returning();

    await testDb.insert(schema.documents).values({
      orgId: org.id,
      vendorId: customer.id,
      type: "invoice",
      direction: "income",
      documentNumber: "AR-1",
      issueDate: "2026-03-01",
      dueDate: "2026-03-31",
      totalAmount: "500000.00",
      totalAmountThb: "500000.00",
      status: "confirmed",
    });

    const rows = await buildAgingSnapshot(org.id, "2026-05-15", "ar");
    expect(rows).toHaveLength(1);
    expect(rows[0].days31To60).toBe("500000.00");
    expect(rows[0].total).toBe("500000.00");
  });

  it("keeps AP and AR directions separate", async () => {
    const org = await createTestOrg(testDb);
    await testDb.insert(schema.documents).values([
      {
        orgId: org.id,
        type: "invoice",
        direction: "expense",
        documentNumber: "AP-1",
        issueDate: "2026-04-01",
        dueDate: "2026-04-30",
        totalAmount: "1000.00",
        totalAmountThb: "1000.00",
        status: "confirmed",
      },
      {
        orgId: org.id,
        type: "invoice",
        direction: "income",
        documentNumber: "AR-1",
        issueDate: "2026-04-01",
        dueDate: "2026-04-30",
        totalAmount: "2000.00",
        totalAmountThb: "2000.00",
        status: "confirmed",
      },
    ]);

    const ap = await buildAgingSnapshot(org.id, "2026-05-15", "ap");
    const ar = await buildAgingSnapshot(org.id, "2026-05-15", "ar");
    expect(ap[0].total).toBe("1000.00");
    expect(ar[0].total).toBe("2000.00");
  });

  it("ages partially paid documents by open balance net of payments", async () => {
    const org = await createTestOrg(testDb);
    const [doc] = await testDb
      .insert(schema.documents)
      .values({
        orgId: org.id,
        type: "invoice",
        direction: "income",
        documentNumber: "AR-PARTIAL",
        issueDate: "2026-03-01",
        dueDate: "2026-03-31",
        totalAmount: "100000.00",
        totalAmountThb: "100000.00",
        status: "partially_paid",
      })
      .returning();

    await testDb.insert(schema.payments).values({
      orgId: org.id,
      documentId: doc.id,
      paymentDate: "2026-04-15",
      grossAmount: "40000.00",
      netAmountPaid: "40000.00",
    });

    const rows = await buildAgingSnapshot(org.id, "2026-05-15", "ar");
    expect(rows).toHaveLength(1);
    expect(rows[0].days31To60).toBe("60000.00");
    expect(rows[0].total).toBe("60000.00");
  });

  it("excludes fully paid documents from aging snapshots", async () => {
    const org = await createTestOrg(testDb);
    const [doc] = await testDb
      .insert(schema.documents)
      .values({
        orgId: org.id,
        type: "invoice",
        direction: "expense",
        documentNumber: "AP-SETTLED",
        issueDate: "2026-03-01",
        dueDate: "2026-03-31",
        totalAmount: "100000.00",
        totalAmountThb: "100000.00",
        status: "partially_paid",
      })
      .returning();

    await testDb.insert(schema.payments).values({
      orgId: org.id,
      documentId: doc.id,
      paymentDate: "2026-04-15",
      grossAmount: "100000.00",
      netAmountPaid: "100000.00",
    });

    const rows = await buildAgingSnapshot(org.id, "2026-05-15", "ap");
    expect(rows).toEqual([]);
  });

  it("uses the organization's fiscal year for concentration handoff windows", async () => {
    const org = await createTestOrg(testDb);
    await testDb
      .update(schema.organizations)
      .set({ fiscalYearEndMonth: 6, fiscalYearEndDay: 30 })
      .where(sql`${schema.organizations.id} = ${org.id}`);
    const [customer] = await testDb
      .insert(schema.vendors)
      .values({
        orgId: org.id,
        name: "Fiscal Customer",
        entityType: "company",
      })
      .returning();

    await testDb.insert(schema.documents).values([
      {
        orgId: org.id,
        vendorId: customer.id,
        type: "invoice",
        direction: "income",
        documentNumber: "FY-IN",
        issueDate: "2025-07-01",
        totalAmount: "1000.00",
        totalAmountThb: "1000.00",
        status: "confirmed",
      },
      {
        orgId: org.id,
        vendorId: customer.id,
        type: "invoice",
        direction: "income",
        documentNumber: "FY-OUT",
        issueDate: "2026-07-01",
        totalAmount: "999999.00",
        totalAmountThb: "999999.00",
        status: "confirmed",
      },
    ]);

    const { getConcentrationAnalysis } = await import("./audit-pack-exports");
    const analysis = await getConcentrationAnalysis(org.id, 2026);
    expect(analysis.periodStart).toBe("2025-07-01");
    expect(analysis.periodEnd).toBe("2026-06-30");
    expect(analysis.customers[0].amount).toBe("1000.00");
  });

  it("computes cash forecast and counterparty concentration from bank and document ledgers", async () => {
    const org = await createTestOrg(testDb);
    const [customer] = await testDb
      .insert(schema.vendors)
      .values({
        orgId: org.id,
        name: "Top Customer",
        entityType: "company",
      })
      .returning();
    const [vendor] = await testDb
      .insert(schema.vendors)
      .values({
        orgId: org.id,
        name: "Top Vendor",
        entityType: "company",
      })
      .returning();

    await testDb.insert(schema.bankAccounts).values({
      orgId: org.id,
      bankCode: "KBANK",
      accountNumber: "123",
      accountName: "Main",
      currency: "THB",
      currentBalance: "2000000.00",
    });

    await testDb.insert(schema.documents).values([
      {
        orgId: org.id,
        vendorId: customer.id,
        type: "invoice",
        direction: "income",
        documentNumber: "AR-30",
        issueDate: "2026-05-01",
        dueDate: "2026-05-20",
        totalAmount: "500000.00",
        totalAmountThb: "500000.00",
        status: "confirmed",
      },
      {
        orgId: org.id,
        vendorId: vendor.id,
        type: "invoice",
        direction: "expense",
        documentNumber: "AP-30",
        issueDate: "2026-05-01",
        dueDate: "2026-05-20",
        totalAmount: "200000.00",
        totalAmountThb: "200000.00",
        status: "confirmed",
      },
      {
        orgId: org.id,
        vendorId: vendor.id,
        type: "invoice",
        direction: "expense",
        documentNumber: "AP-BURN",
        issueDate: "2026-04-01",
        dueDate: "2026-04-30",
        totalAmount: "100000.00",
        totalAmountThb: "100000.00",
        status: "confirmed",
      },
    ]);
    const [establishment] = await testDb
      .insert(schema.establishments)
      .values({
        orgId: org.id,
        branchNumber: "00000",
        nameEn: "Head Office",
        isHeadOffice: true,
      })
      .returning();
    const [employee] = await testDb
      .insert(schema.employees)
      .values({
        orgId: org.id,
        establishmentId: establishment.id,
        fullNameEn: "Payroll Forecast Employee",
        startDate: "2026-01-01",
      })
      .returning();
    const [payRun] = await testDb
      .insert(schema.payRuns)
      .values({
        orgId: org.id,
        establishmentId: establishment.id,
        periodStart: "2026-05-01",
        periodEnd: "2026-05-31",
        payDate: "2026-05-31",
        status: "approved",
      })
      .returning();
    await testDb.insert(schema.paySlips).values({
      orgId: org.id,
      establishmentId: establishment.id,
      payRunId: payRun.id,
      employeeId: employee.id,
      grossSalary: "80000.00",
      pitWht: "5000.00",
      ssoEmployee: "750.00",
      ssoEmployer: "750.00",
      netPay: "74250.00",
    });
    const [asset] = await testDb
      .insert(schema.fixedAssets)
      .values({
        orgId: org.id,
        establishmentId: establishment.id,
        assetCode: "FA-2026-0001",
        nameEn: "Forecast Asset",
        category: "equipment",
        acquisitionDate: "2026-01-01",
        originalCost: "120000.00",
        usefulLifeMonths: 60,
        taxUsefulLifeMonthsMinimum: 60,
        depreciationStartDate: "2026-01-01",
      })
      .returning();
    await testDb.insert(schema.depreciationSchedule).values({
      orgId: org.id,
      fixedAssetId: asset.id,
      periodYear: 2026,
      periodMonth: 5,
      depreciationAmount: "2000.00",
      taxDepreciationCappedAmount: "2000.00",
      bookTaxDifference: "0.00",
      accumulatedDepreciationAfter: "10000.00",
      bookValueAfter: "110000.00",
    });

    const forecast = await computeCashForecast({
      orgId: org.id,
      asOfDate: "2026-05-15",
    });
    expect(forecast.cashBalance).toBe("2000000.00");
    expect(forecast.expected30DayInflows).toBe("500000.00");
    expect(forecast.expected30DayOutflows).toBe("374250.00");
    expect(forecast.scheduledPayrollOutflows).toBe("74250.00");
    expect(forecast.scheduledDepreciationExpense).toBe("2000.00");
    expect(forecast.projected30DayCash).toBe("2125750.00");
    expect(forecast.netMonthlyBurn).toBe("0.00");

    const concentration = await computeCounterpartyConcentration({
      orgId: org.id,
      periodStart: "2026-01-01",
      periodEnd: "2026-05-15",
      direction: "expense",
    });
    expect(concentration[0]).toMatchObject({
      counterpartyName: "Top Vendor",
      amount: "300000.00",
      sharePct: "1.0000",
    });
  });

  it("computes concentration share against period grand total, not just top-N rows", async () => {
    const org = await createTestOrg(testDb);
    const vendorRows = await testDb
      .insert(schema.vendors)
      .values(
        Array.from({ length: 12 }, (_, index) => ({
          orgId: org.id,
          name: `Vendor ${String(index + 1).padStart(2, "0")}`,
          entityType: "company" as const,
        }))
      )
      .returning();

    await testDb.insert(schema.documents).values(
      vendorRows.map((vendor, index) => ({
        orgId: org.id,
        vendorId: vendor.id,
        type: "invoice" as const,
        direction: "expense" as const,
        documentNumber: `EXP-${index + 1}`,
        issueDate: "2026-05-01",
        totalAmount: index === 0 ? "300.00" : "100.00",
        totalAmountThb: index === 0 ? "300.00" : "100.00",
        status: "confirmed" as const,
      }))
    );

    const concentration = await computeCounterpartyConcentration({
      orgId: org.id,
      periodStart: "2026-01-01",
      periodEnd: "2026-12-31",
      direction: "expense",
      limit: 10,
    });

    expect(concentration).toHaveLength(10);
    expect(concentration[0]).toMatchObject({
      counterpartyName: "Vendor 01",
      amount: "300.00",
      sharePct: "0.2143",
    });
    const topTenShare = concentration.reduce(
      (sum, row) => sum + Number(row.sharePct),
      0
    );
    expect(topTenShare).toBeLessThan(1);
  });

  it("computes DSO from income payment events in the lookback window", async () => {
    const org = await createTestOrg(testDb);
    const otherOrg = await createTestOrg(testDb);
    const [paidDoc] = await testDb
      .insert(schema.documents)
      .values({
        orgId: org.id,
        type: "invoice",
        direction: "income",
        documentNumber: "AR-PAID",
        issueDate: "2026-04-01",
        dueDate: "2026-04-30",
        totalAmount: "100000.00",
        totalAmountThb: "100000.00",
        status: "paid",
      })
      .returning();
    const [oldDoc] = await testDb
      .insert(schema.documents)
      .values({
        orgId: org.id,
        type: "invoice",
        direction: "income",
        documentNumber: "AR-OLD",
        issueDate: "2025-01-01",
        totalAmount: "100000.00",
        totalAmountThb: "100000.00",
        status: "paid",
      })
      .returning();
    const [otherDoc] = await testDb
      .insert(schema.documents)
      .values({
        orgId: otherOrg.id,
        type: "invoice",
        direction: "income",
        documentNumber: "AR-OTHER-PAID",
        issueDate: "2026-04-01",
        totalAmount: "999999.00",
        totalAmountThb: "999999.00",
        status: "paid",
      })
      .returning();

    await testDb.insert(schema.payments).values([
      {
        orgId: org.id,
        documentId: paidDoc.id,
        paymentDate: "2026-04-21",
        grossAmount: "100000.00",
        netAmountPaid: "100000.00",
      },
      {
        orgId: org.id,
        documentId: oldDoc.id,
        paymentDate: "2025-02-01",
        grossAmount: "100000.00",
        netAmountPaid: "100000.00",
      },
      {
        orgId: otherOrg.id,
        documentId: otherDoc.id,
        paymentDate: "2026-04-30",
        grossAmount: "999999.00",
        netAmountPaid: "999999.00",
      },
    ]);

    const dso = await computeDso({
      orgId: org.id,
      asOfDate: "2026-05-01",
      lookbackDays: 90,
    });

    expect(dso).toMatchObject({
      asOfDate: "2026-05-01",
      lookbackDays: 90,
      paymentCount: 1,
      paidDocumentCount: 1,
      averageDays: "20.00",
    });
  });

  it("computes gross margin by revenue and SKU category", async () => {
    const org = await createTestOrg(testDb);
    const otherOrg = await createTestOrg(testDb);
    const [establishment] = await testDb
      .insert(schema.establishments)
      .values({
        orgId: org.id,
        branchNumber: "00000",
        nameEn: "Head Office",
        isHeadOffice: true,
      })
      .returning();
    const [sku] = await testDb
      .insert(schema.skus)
      .values({
        orgId: org.id,
        establishmentId: establishment.id,
        skuCode: "SKU-TEA",
        nameEn: "Tea",
        category: "beverages",
        currentQuantity: "10.0000",
        currentAvgCost: "50.0000",
        currentValue: "500.00",
      })
      .returning();

    await testDb.insert(schema.documents).values([
      {
        orgId: org.id,
        type: "invoice",
        direction: "income",
        documentNumber: "REV-BEV",
        issueDate: "2026-05-01",
        category: "beverages",
        totalAmount: "1000.00",
        totalAmountThb: "1000.00",
        status: "confirmed",
      },
      {
        orgId: otherOrg.id,
        type: "invoice",
        direction: "income",
        documentNumber: "REV-OTHER",
        issueDate: "2026-05-01",
        category: "beverages",
        totalAmount: "999999.00",
        totalAmountThb: "999999.00",
        status: "confirmed",
      },
    ]);
    await testDb.insert(schema.inventoryMovements).values({
      orgId: org.id,
      establishmentId: establishment.id,
      skuId: sku.id,
      movementAt: new Date("2026-05-02T05:00:00.000Z"),
      movementType: "sale_out",
      quantity: "-4.0000",
      unitCost: "50.0000",
      totalCost: "200.00",
    });

    const margins = await computeGrossMarginByCategory({
      orgId: org.id,
      periodStart: "2026-05-01",
      periodEnd: "2026-05-31",
    });

    expect(margins).toEqual([
      {
        category: "beverages",
        revenue: "1000.00",
        cogs: "200.00",
        grossMargin: "800.00",
        grossMarginPct: "0.8000",
      },
    ]);
  });
});
