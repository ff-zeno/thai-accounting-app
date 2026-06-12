import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db, type DbConnection } from "../index";
import {
  cashDeposits,
  establishments,
  organizations,
  processorSettlements,
  salesTransactions,
  skus,
  voucherSales,
  documents,
} from "../schema";
import { orgScopeAlive } from "../helpers/org-scope";
import { auditMutation } from "../helpers/audit-log";
import { getVatRate } from "./tax-config";
import {
  postCashDepositJournalEntry,
  postPosSaleJournalEntry,
  postProcessorSettlementJournalEntry,
} from "./general-ledger";
import { enqueuePostingOutbox } from "./posting-outbox";
import { recordInventoryMovementInTx } from "./inventory";
import { createVatOutputItem } from "./vat-operations-ledger";
import { formatBangkokDate } from "@/lib/tax/filing-deadlines";

type PosSaleSourceInput = {
  orgId: string;
  establishmentId: string;
  source: string;
  externalId: string;
  soldAt: Date;
  channel: string;
  amountIncludingVat: string;
  taxBaseExVat: string;
  vatAmount: string;
  taxInvoiceType: string;
  taxInvoiceNumber: string;
  terminalId: string;
  clearingAccountKey: string;
  inventoryLine?: {
    skuId?: string;
    skuCode?: string;
    quantity: string;
  };
};

const POS_CSV_REQUIRED_HEADERS = [
  "external_id",
  "sold_at",
  "channel",
  "amount_including_vat",
  "tax_base_ex_vat",
  "vat_amount",
  "tax_invoice_type",
  "tax_invoice_number",
  "terminal_id",
] as const;

function parseCsvLine(line: string) {
  const cells: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
      continue;
    }
    if (char === '"') {
      quoted = !quoted;
      continue;
    }
    if (char === "," && !quoted) {
      cells.push(cell.trim());
      cell = "";
      continue;
    }
    cell += char;
  }
  cells.push(cell.trim());
  return cells;
}

function parsePosCsvRows(csvText: string) {
  const lines = csvText
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 2) {
    throw new Error("POS CSV must include a header row and at least one sale row");
  }

  const headers = parseCsvLine(lines[0]).map((header) => header.trim().toLowerCase());
  for (const header of POS_CSV_REQUIRED_HEADERS) {
    if (!headers.includes(header)) {
      throw new Error(`POS CSV missing required header: ${header}`);
    }
  }

  return lines.slice(1).map((line, rowIndex) => {
    const cells = parseCsvLine(line);
    if (cells.length !== headers.length) {
      throw new Error(
        `POS CSV row ${rowIndex + 2}: expected ${headers.length} columns but found ${cells.length}`
      );
    }
    const row = new Map<string, string>();
    headers.forEach((header, index) => row.set(header, cells[index]?.trim() ?? ""));
    return { rowNumber: rowIndex + 2, row };
  });
}

function moneyToCents(value: string) {
  return Math.round(Number(value) * 100);
}

function assertPosVatTieOut(data: {
  amountIncludingVat: string;
  taxBaseExVat: string;
  vatAmount: string;
}) {
  const grossCents = moneyToCents(data.amountIncludingVat);
  const baseCents = moneyToCents(data.taxBaseExVat);
  const vatCents = moneyToCents(data.vatAmount);
  if (baseCents + vatCents !== grossCents) {
    throw new Error("POS sale gross must equal tax base plus VAT");
  }
}

function csvMoney(value: string, label: string, rowNumber: number) {
  const raw = value.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(raw)) {
    throw new Error(`POS CSV row ${rowNumber}: ${label} must be a positive amount with up to 2 decimals`);
  }
  const [whole, fraction = ""] = raw.split(".");
  return `${whole}.${fraction.padEnd(2, "0")}`;
}

function parsePosQuantity(value: string, label: string) {
  const raw = value.trim();
  if (!/^\d+(\.\d{1,4})?$/.test(raw) || Number(raw) <= 0) {
    throw new Error(
      `${label} must be a positive quantity with up to 4 decimals`
    );
  }
  const [whole, fraction = ""] = raw.split(".");
  return `${whole}.${fraction.padEnd(4, "0")}`;
}

function csvDate(value: string, rowNumber: number) {
  const raw = value.trim();
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(raw);
  const zonedIso = /^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2})$/.test(raw);
  if (!dateOnly && !zonedIso) {
    throw new Error(
      `POS CSV row ${rowNumber}: sold_at must be YYYY-MM-DD or an ISO timestamp with timezone`
    );
  }
  const date = dateOnly ? new Date(`${raw}T12:00:00+07:00`) : new Date(raw);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`POS CSV row ${rowNumber}: sold_at is not a valid date`);
  }
  return date;
}

export async function ensureHeadOfficeEstablishment(
  orgId: string,
  tx: DbConnection = db
) {
  const [existing] = await tx
    .select()
    .from(establishments)
    .where(
      and(
        ...orgScopeAlive(establishments, orgId),
        eq(establishments.branchNumber, "00000")
      )
    )
    .limit(1);

  if (existing) return existing;

  const [org] = await tx
    .select()
    .from(organizations)
    .where(and(eq(organizations.id, orgId), isNull(organizations.deletedAt)))
    .limit(1);

  if (!org) throw new Error("Organization not found");

  const [created] = await tx
    .insert(establishments)
    .values({
      orgId,
      branchNumber: "00000",
      nameEn: "Head Office",
      nameTh: "สำนักงานใหญ่",
      isHeadOffice: true,
      vatRegistered: org.isVatRegistered ?? true,
      taxId: org.taxId,
    })
    .onConflictDoUpdate({
      target: [establishments.orgId, establishments.branchNumber],
      set: {
        isHeadOffice: true,
        vatRegistered: sql`EXCLUDED.vat_registered`,
        taxId: sql`EXCLUDED.tax_id`,
      },
      setWhere: sql`${establishments.orgId} = EXCLUDED.org_id`,
    })
    .returning();

  return created;
}

export async function getPosSalesWorkflowDashboard(orgId: string) {
  await ensureHeadOfficeEstablishment(orgId);
  const reportablePosScope = and(
    ...orgScopeAlive(salesTransactions, orgId),
    isNull(salesTransactions.deletedAt),
    eq(salesTransactions.eventRole, "pos_primary"),
    isNull(salesTransactions.voidedAt),
    isNull(salesTransactions.supersededById),
    isNull(salesTransactions.creditNoteForId)
  );

  const [salesSummary] = await db
    .select({
      saleCount: sql<number>`COUNT(*)::int`,
      grossSales: sql<string>`COALESCE(SUM(${salesTransactions.amountIncludingVat}), 0)::numeric(14,2)`,
      outputVat: sql<string>`COALESCE(SUM(${salesTransactions.vatAmount}), 0)::numeric(14,2)`,
      unsettledGross: sql<string>`COALESCE(SUM(CASE WHEN ${salesTransactions.settlementStatus} IN ('pending', 'aged_unsettled') THEN ${salesTransactions.amountIncludingVat} ELSE 0 END), 0)::numeric(14,2)`,
    })
    .from(salesTransactions)
    .where(reportablePosScope);

  const [settlementSummary] = await db
    .select({
      settlementCount: sql<number>`COUNT(*)::int`,
      grossAmount: sql<string>`COALESCE(SUM(${processorSettlements.grossAmount}), 0)::numeric(14,2)`,
      netPayout: sql<string>`COALESCE(SUM(${processorSettlements.netPayout}), 0)::numeric(14,2)`,
      feeVatPendingEvidence: sql<string>`COALESCE(SUM(CASE WHEN ${processorSettlements.feeVatAmount} > 0 AND ${processorSettlements.processorTaxInvoiceDocumentId} IS NULL THEN ${processorSettlements.feeVatAmount} ELSE 0 END), 0)::numeric(14,2)`,
    })
    .from(processorSettlements)
    .where(eq(processorSettlements.orgId, orgId));

  const [cashSummary] = await db
    .select({
      depositCount: sql<number>`COUNT(*)::int`,
      depositedAmount: sql<string>`COALESCE(SUM(${cashDeposits.amount}), 0)::numeric(14,2)`,
      openVariance: sql<string>`COALESCE(SUM(CASE WHEN ${cashDeposits.varianceResolutionStatus} = 'open' THEN ${cashDeposits.cashVariance} ELSE 0 END), 0)::numeric(14,2)`,
    })
    .from(cashDeposits)
    .where(eq(cashDeposits.orgId, orgId));

  const [voucherSummary] = await db
    .select({
      voucherCount: sql<number>`COUNT(*)::int`,
      liabilityFaceValue: sql<string>`COALESCE(SUM(CASE WHEN ${voucherSales.redeemedAt} IS NULL THEN ${voucherSales.faceValue} ELSE 0 END), 0)::numeric(14,2)`,
    })
    .from(voucherSales)
    .where(and(...orgScopeAlive(voucherSales, orgId)));

  const recentSales = await db
    .select({
      id: salesTransactions.id,
      soldAt: salesTransactions.soldAt,
      channel: salesTransactions.channel,
      taxInvoiceType: salesTransactions.taxInvoiceType,
      taxInvoiceNumber: salesTransactions.taxInvoiceNumber,
      amountIncludingVat: salesTransactions.amountIncludingVat,
      taxBaseExVat: salesTransactions.taxBaseExVat,
      vatAmount: salesTransactions.vatAmount,
      settlementStatus: salesTransactions.settlementStatus,
      clearingAccountKey: salesTransactions.clearingAccountKey,
      branchNumber: establishments.branchNumber,
    })
    .from(salesTransactions)
    .innerJoin(
      establishments,
      and(
        eq(establishments.id, salesTransactions.establishmentId),
        eq(establishments.orgId, salesTransactions.orgId)
      )
    )
    .where(
      and(
        reportablePosScope
      )
    )
    .orderBy(desc(salesTransactions.soldAt))
    .limit(20);

  const channelBalances = await db
    .select({
      establishmentId: salesTransactions.establishmentId,
      branchNumber: establishments.branchNumber,
      clearingAccountKey: salesTransactions.clearingAccountKey,
      saleCount: sql<number>`COUNT(*)::int`,
      pendingGross: sql<string>`COALESCE(SUM(${salesTransactions.amountIncludingVat}), 0)::numeric(14,2)`,
      // Neon can return timestamp aggregate expressions as strings even when base columns hydrate as Date.
      oldestSoldAt: sql<Date | string>`MIN(${salesTransactions.soldAt})`,
      agedCount: sql<number>`COUNT(*) FILTER (WHERE ${salesTransactions.settlementStatus} = 'aged_unsettled')::int`,
    })
    .from(salesTransactions)
    .innerJoin(
      establishments,
      and(
        eq(establishments.id, salesTransactions.establishmentId),
        eq(establishments.orgId, salesTransactions.orgId)
      )
    )
    .where(
      and(
        reportablePosScope,
        sql`${salesTransactions.settlementStatus} IN ('pending', 'aged_unsettled')`
      )
    )
    .groupBy(
      salesTransactions.establishmentId,
      establishments.branchNumber,
      salesTransactions.clearingAccountKey
    )
    .orderBy(desc(sql`COALESCE(SUM(${salesTransactions.amountIncludingVat}), 0)`));

  const establishmentsList = await db
    .select()
    .from(establishments)
    .where(and(...orgScopeAlive(establishments, orgId)))
    .orderBy(establishments.branchNumber);

  return {
    salesSummary,
    settlementSummary,
    cashSummary,
    voucherSummary,
    channelBalances,
    recentSales,
    establishments: establishmentsList,
  };
}

export async function createManualPosSale(data: {
  orgId: string;
  soldAt: Date;
  channel: string;
  amountIncludingVat: string;
  taxBaseExVat: string;
  vatAmount: string;
  taxInvoiceType: string;
  taxInvoiceNumber: string;
  terminalId: string;
  clearingAccountKey?: string;
  inventoryLine?: {
    skuId?: string;
    skuCode?: string;
    quantity: string;
  };
}) {
  return db.transaction(async (tx) => {
    const establishment = await ensureHeadOfficeEstablishment(data.orgId, tx);
    const externalId = [
      "manual",
      data.terminalId.trim() || "terminal",
      data.taxInvoiceNumber.trim(),
      data.soldAt.toISOString(),
    ].join(":");
    const clearingAccountKey =
      data.clearingAccountKey ?? `${data.channel}_${data.terminalId}`;
    const inventoryLine = data.inventoryLine
      ? {
          ...data.inventoryLine,
          quantity: parsePosQuantity(
            data.inventoryLine.quantity,
            "inventoryLine.quantity"
          ),
        }
      : undefined;

    return createPosSaleFromSourceInTx(
      {
        orgId: data.orgId,
        establishmentId: establishment.id,
        source: "manual",
        externalId,
        soldAt: data.soldAt,
        channel: data.channel,
        amountIncludingVat: data.amountIncludingVat,
        taxBaseExVat: data.taxBaseExVat,
        vatAmount: data.vatAmount,
        taxInvoiceType: data.taxInvoiceType,
        taxInvoiceNumber: data.taxInvoiceNumber,
        terminalId: data.terminalId,
        clearingAccountKey,
        inventoryLine,
      },
      tx as DbConnection
    );
  });
}

async function resolveInventorySku(
  tx: DbConnection,
  data: {
    orgId: string;
    establishmentId: string;
    skuId?: string;
    skuCode?: string;
  }
) {
  if (data.skuId) {
    const [sku] = await tx
      .select({ id: skus.id, establishmentId: skus.establishmentId })
      .from(skus)
      .where(
        and(
          eq(skus.orgId, data.orgId),
          eq(skus.id, data.skuId),
          isNull(skus.deletedAt)
        )
      )
      .limit(1);
    if (!sku) throw new Error("POS inventory SKU not found");
    if (sku.establishmentId && sku.establishmentId !== data.establishmentId) {
      throw new Error("POS inventory SKU belongs to a different establishment");
    }
    return sku.id;
  }

  const skuCode = data.skuCode?.trim();
  if (!skuCode) throw new Error("POS inventory line requires skuId or skuCode");

  const [sku] = await tx
    .select({ id: skus.id, establishmentId: skus.establishmentId })
    .from(skus)
    .where(
      and(
        eq(skus.orgId, data.orgId),
        eq(skus.skuCode, skuCode),
        isNull(skus.deletedAt)
      )
    )
    .limit(1);
  if (!sku) {
    throw new Error(`POS inventory SKU not found: ${skuCode} (codes are case-sensitive)`);
  }
  if (sku.establishmentId && sku.establishmentId !== data.establishmentId) {
    throw new Error("POS inventory SKU belongs to a different establishment");
  }
  return sku.id;
}

async function createPosSaleFromSourceInTx(
  data: PosSaleSourceInput,
  tx: DbConnection
) {
  assertPosVatTieOut(data);
  const [row] = await tx
    .insert(salesTransactions)
    .values({
      orgId: data.orgId,
      establishmentId: data.establishmentId,
      eventRole: "pos_primary",
      source: data.source,
      externalId: data.externalId,
      soldAt: data.soldAt,
      channel: data.channel,
      pricingMode: "vat_inclusive",
      amountIncludingVat: data.amountIncludingVat,
      taxBaseExVat: data.taxBaseExVat,
      vatAmount: data.vatAmount,
      taxInvoiceType: data.taxInvoiceType,
      taxInvoiceNumber: data.taxInvoiceNumber,
      terminalId: data.terminalId,
      clearingAccountKey: data.clearingAccountKey,
      settlementStatus: "pending",
    })
    .returning();
  await auditMutation(
    {
      orgId: data.orgId,
      entityType: "sales_transactions",
      entityId: row.id,
      action: "create",
      newValue: {
        source: data.source,
        externalId: data.externalId,
        soldAt: data.soldAt.toISOString(),
        channel: data.channel,
        amountIncludingVat: data.amountIncludingVat,
        taxBaseExVat: data.taxBaseExVat,
        vatAmount: data.vatAmount,
        taxInvoiceType: data.taxInvoiceType,
        taxInvoiceNumber: data.taxInvoiceNumber,
        terminalId: data.terminalId,
        clearingAccountKey: data.clearingAccountKey,
      },
    },
    tx
  );

  const soldDate = formatBangkokDate(data.soldAt);
  await createVatOutputItem({
    tx,
    orgId: data.orgId,
    establishmentId: data.establishmentId,
    sourcePosSaleId: row.id,
    taxInvoiceNo: data.taxInvoiceNumber,
    taxInvoiceDate: soldDate,
    documentDate: soldDate,
    taxPointDate: soldDate,
    taxPointBasis: "issue_date",
    baseAmount: data.taxBaseExVat,
    vatAmount: data.vatAmount,
    vatRate: await getVatRate(soldDate, tx),
    status: "reportable",
    sourceSnapshot: {
      source: data.source,
      saleId: row.id,
      soldAt: data.soldAt.toISOString(),
      channel: data.channel,
      taxInvoiceType: data.taxInvoiceType,
      taxInvoiceNumber: data.taxInvoiceNumber,
      amountIncludingVat: data.amountIncludingVat,
      taxBaseExVat: data.taxBaseExVat,
      vatAmount: data.vatAmount,
    },
  });
  await postPosSaleJournalEntry({
    tx,
    orgId: data.orgId,
    posSaleId: row.id,
    soldDate,
    amountIncludingVat: data.amountIncludingVat,
    taxBaseExVat: data.taxBaseExVat,
    vatAmount: data.vatAmount,
    channel: data.channel,
    clearingAccountKey: data.clearingAccountKey,
  });
  await enqueuePostingOutbox({
    orgId: data.orgId,
    sourceEntityType: "sales_transactions",
    sourceEntityId: row.id,
    eventType: "create",
    postingDate: soldDate,
    payload: {
      soldDate,
      source: data.source,
      taxInvoiceNumber: data.taxInvoiceNumber,
    },
    tx,
  });

  if (data.inventoryLine) {
    const skuId = await resolveInventorySku(tx, {
      orgId: data.orgId,
      establishmentId: data.establishmentId,
      skuId: data.inventoryLine.skuId,
      skuCode: data.inventoryLine.skuCode,
    });
    await recordInventoryMovementInTx(
      {
        orgId: data.orgId,
        establishmentId: data.establishmentId,
        skuId,
        movementAt: data.soldAt,
        movementType: "sale_out",
        quantity: `-${data.inventoryLine.quantity}`,
        sourceEntityType: "sales_transactions",
        sourceEntityId: row.id,
        notes: `POS sale ${data.taxInvoiceNumber}`,
      },
      tx
    );
  }

  return row;
}

export async function importPosSalesCsv(data: {
  orgId: string;
  csvText: string;
}) {
  const parsedRows = parsePosCsvRows(data.csvText);
  return db.transaction(async (tx) => {
    const establishment = await ensureHeadOfficeEstablishment(data.orgId, tx);
    let created = 0;
    let skipped = 0;

    for (const parsed of parsedRows) {
      const get = (header: string) => parsed.row.get(header)?.trim() ?? "";
      const externalId = get("external_id");
      const terminalId = get("terminal_id") || "csv";
      if (!externalId) {
        throw new Error(`POS CSV row ${parsed.rowNumber}: external_id is required`);
      }
      const skuCode = get("sku_code");
      const quantity = get("quantity");
      if ((skuCode && !quantity) || (!skuCode && quantity)) {
        throw new Error(
          `POS CSV row ${parsed.rowNumber}: sku_code and quantity must be supplied together`
        );
      }

      const [existing] = await tx
        .select({ id: salesTransactions.id })
        .from(salesTransactions)
        .where(
          and(
            eq(salesTransactions.orgId, data.orgId),
            eq(salesTransactions.source, "manual_csv"),
            eq(salesTransactions.externalId, externalId)
          )
        )
        .limit(1);
      if (existing) {
        skipped += 1;
        continue;
      }

      try {
        await createPosSaleFromSourceInTx(
          {
            orgId: data.orgId,
            establishmentId: establishment.id,
            source: "manual_csv",
            externalId,
            soldAt: csvDate(get("sold_at"), parsed.rowNumber),
            channel: get("channel"),
            amountIncludingVat: csvMoney(
              get("amount_including_vat"),
              "amount_including_vat",
              parsed.rowNumber
            ),
            taxBaseExVat: csvMoney(
              get("tax_base_ex_vat"),
              "tax_base_ex_vat",
              parsed.rowNumber
            ),
            vatAmount: csvMoney(get("vat_amount"), "vat_amount", parsed.rowNumber),
            taxInvoiceType: get("tax_invoice_type"),
            taxInvoiceNumber: get("tax_invoice_number"),
            terminalId,
            clearingAccountKey:
              get("clearing_account_key") || `${get("channel")}_${terminalId}`,
            inventoryLine: skuCode
              ? {
                  skuCode,
                  quantity: parsePosQuantity(quantity, "quantity"),
                }
              : undefined,
          },
          tx as DbConnection
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`POS CSV row ${parsed.rowNumber}: ${message}`);
      }
      created += 1;
    }

    return {
      created,
      skipped,
      totalRows: parsedRows.length,
    };
  });
}

export async function recordCashDeposit(data: {
  orgId: string;
  depositedAt: string;
  amount: string;
  depositedBy?: string;
  slipReference?: string;
  posCashPeriodStart?: string;
  posCashPeriodEnd?: string;
  cashVariance?: string;
}) {
  return db.transaction(async (tx) => {
    const establishment = await ensureHeadOfficeEstablishment(data.orgId, tx);
    const [row] = await tx
      .insert(cashDeposits)
      .values({
        orgId: data.orgId,
        establishmentId: establishment.id,
        depositedAt: data.depositedAt,
        amount: data.amount,
        depositedBy: data.depositedBy || null,
        slipReference: data.slipReference || null,
        posCashPeriodStart: data.posCashPeriodStart || null,
        posCashPeriodEnd: data.posCashPeriodEnd || null,
        cashVariance: data.cashVariance || null,
        varianceResolutionStatus: "open",
      })
      .returning();
    await auditMutation(
      {
        orgId: data.orgId,
        entityType: "cash_deposits",
        entityId: row.id,
        action: "create",
        newValue: {
          depositedAt: data.depositedAt,
          amount: data.amount,
          depositedBy: data.depositedBy || null,
          slipReference: data.slipReference || null,
          posCashPeriodStart: data.posCashPeriodStart || null,
          posCashPeriodEnd: data.posCashPeriodEnd || null,
          cashVariance: data.cashVariance || null,
        },
      },
      tx
    );
    await postCashDepositJournalEntry({
      tx,
      orgId: data.orgId,
      cashDepositId: row.id,
    });
    await enqueuePostingOutbox({
      tx,
      orgId: data.orgId,
      sourceEntityType: "cash_deposits",
      sourceEntityId: row.id,
      eventType: "create",
      postingDate: data.depositedAt,
      payload: {
        depositedAt: data.depositedAt,
        amount: data.amount,
        slipReference: data.slipReference ?? null,
      },
    });

    return row;
  });
}

export async function recordProcessorSettlement(data: {
  orgId: string;
  processor: string;
  externalId: string;
  periodStart?: Date;
  periodEnd: Date;
  grossAmount: string;
  feeAmount: string;
  netPayout: string;
  feeVatAmount?: string;
  processorTaxInvoiceDocumentId?: string;
  processorTiNumber?: string;
  reconciliationDiscrepancy?: string;
}) {
  return db.transaction(async (tx) => {
    const establishment = await ensureHeadOfficeEstablishment(data.orgId, tx);
    if (data.processorTaxInvoiceDocumentId) {
      const [document] = await tx
        .select({ id: documents.id })
        .from(documents)
        .where(
          and(
            ...orgScopeAlive(documents, data.orgId),
            eq(documents.id, data.processorTaxInvoiceDocumentId)
          )
        )
        .limit(1);
      if (!document) throw new Error("Processor tax invoice document not found");
    }
    const hasDiscrepancy =
      data.reconciliationDiscrepancy !== undefined &&
      Number(data.reconciliationDiscrepancy) !== 0;
    const [row] = await tx
      .insert(processorSettlements)
      .values({
        orgId: data.orgId,
        establishmentId: establishment.id,
        processor: data.processor,
        externalId: data.externalId,
        periodStart: data.periodStart,
        periodEnd: data.periodEnd,
        grossAmount: data.grossAmount,
        feeAmount: data.feeAmount,
        netPayout: data.netPayout,
        feeVatAmount: data.feeVatAmount || null,
        processorTaxInvoiceDocumentId: data.processorTaxInvoiceDocumentId || null,
        processorTiNumber: data.processorTiNumber || null,
        reconciliationDiscrepancy: data.reconciliationDiscrepancy || null,
        reconciliationStatus: hasDiscrepancy ? "discrepancy" : "unreconciled",
      })
      .returning();
    await auditMutation(
      {
        orgId: data.orgId,
        entityType: "processor_settlements",
        entityId: row.id,
        action: "create",
        newValue: {
          processor: data.processor,
          externalId: data.externalId,
          periodStart: data.periodStart?.toISOString() ?? null,
          periodEnd: data.periodEnd.toISOString(),
          grossAmount: data.grossAmount,
          feeAmount: data.feeAmount,
          netPayout: data.netPayout,
          feeVatAmount: data.feeVatAmount || null,
          processorTaxInvoiceDocumentId: data.processorTaxInvoiceDocumentId || null,
          processorTiNumber: data.processorTiNumber || null,
          reconciliationDiscrepancy: data.reconciliationDiscrepancy || null,
        },
      },
      tx
    );
    await postProcessorSettlementJournalEntry({
      tx,
      orgId: data.orgId,
      processorSettlementId: row.id,
    });
    const postingDate = formatBangkokDate(data.periodEnd);
    await enqueuePostingOutbox({
      tx,
      orgId: data.orgId,
      sourceEntityType: "processor_settlements",
      sourceEntityId: row.id,
      eventType: "create",
      postingDate,
      payload: {
        processor: data.processor,
        externalId: data.externalId,
        paymentDate: postingDate,
        grossAmount: data.grossAmount,
        netPayout: data.netPayout,
      },
    });

    return row;
  });
}
