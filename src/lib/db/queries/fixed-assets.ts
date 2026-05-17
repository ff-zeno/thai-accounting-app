import { and, desc, eq, inArray, isNotNull, isNull, lte, or, sql } from "drizzle-orm";
import { db, type DbConnection } from "../index";
import {
  auditLog,
  depreciationSchedule,
  establishments,
  fixedAssetDepreciationPeriods,
  fixedAssets,
  glAccounts,
  journalEntries,
  journalLines,
  organizations,
  postingOutbox,
  taxMinLifeByCategory,
} from "../schema";
import { orgScope, orgScopeAlive } from "../helpers/org-scope";
import { ensureHeadOfficeEstablishment } from "./pos-sales-ledger";
import {
  createJournalEntryWithConnection,
  getGlAccounts,
  seedStandardGlAccounts,
  type JournalEntryLineInput,
} from "./general-ledger";
import { isPeriodLocked } from "./period-locks";

const DEFAULT_BOOK_LIFE_MONTHS: Record<string, number> = {
  building: 240,
  temporary_building: 12,
  equipment: 60,
  vehicle: 60,
  furniture_fixtures: 60,
  computer_hardware: 36,
  computer_software: 36,
  leasehold_improvement: 120,
  intangible_other: 120,
  natural_resource_right: 240,
  land: 0,
};

function toCents(value: string | number | null | undefined) {
  return Math.round(Number(value ?? 0) * 100);
}

function money(cents: number) {
  return (cents / 100).toFixed(2);
}

function addMonths(dateString: string, months: number) {
  const date = new Date(`${dateString}T00:00:00.000Z`);
  date.setUTCMonth(date.getUTCMonth() + months);
  return date.toISOString().slice(0, 10);
}

function periodFromDate(dateString: string) {
  const date = new Date(`${dateString}T00:00:00.000Z`);
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
  };
}

function periodEndDate(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

function monthLabel(month: number) {
  return String(month).padStart(2, "0");
}

export function previousBangkokMonth(referenceDate = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(referenceDate);
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);

  if (!Number.isInteger(year) || !Number.isInteger(month)) {
    throw new Error("Could not determine Bangkok depreciation period");
  }

  return month === 1
    ? { periodYear: year - 1, periodMonth: 12 }
    : { periodYear: year, periodMonth: month - 1 };
}

const DEPRECIATION_ACCOUNT_BY_CATEGORY: Record<
  string,
  { expense: string; accumulated: string }
> = {
  building: { expense: "6820", accumulated: "1321" },
  temporary_building: { expense: "6820", accumulated: "1321" },
  equipment: { expense: "6821", accumulated: "1331" },
  leasehold_improvement: { expense: "6821", accumulated: "1331" },
  vehicle: { expense: "6822", accumulated: "1341" },
  computer_hardware: { expense: "6823", accumulated: "1351" },
  computer_software: { expense: "6823", accumulated: "1351" },
  furniture_fixtures: { expense: "6824", accumulated: "1361" },
  intangible_other: { expense: "6825", accumulated: "1421" },
  natural_resource_right: { expense: "6826", accumulated: "1431" },
};

const DISPOSAL_ACCOUNT_BY_CATEGORY: Record<
  string,
  { asset: string; accumulated?: string }
> = {
  land: { asset: "1310" },
  building: { asset: "1320", accumulated: "1321" },
  temporary_building: { asset: "1320", accumulated: "1321" },
  equipment: { asset: "1330", accumulated: "1331" },
  leasehold_improvement: { asset: "1330", accumulated: "1331" },
  vehicle: { asset: "1340", accumulated: "1341" },
  computer_hardware: { asset: "1350", accumulated: "1351" },
  computer_software: { asset: "1420", accumulated: "1351" },
  intangible_other: { asset: "1420", accumulated: "1421" },
  natural_resource_right: { asset: "1430", accumulated: "1431" },
  furniture_fixtures: { asset: "1360", accumulated: "1361" },
};

const FIXED_ASSET_CSV_REQUIRED_HEADERS = [
  "name_en",
  "category",
  "acquisition_date",
  "original_cost",
] as const;

function parseCsvLine(line: string) {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === "\"" && inQuotes && next === "\"") {
      current += "\"";
      index += 1;
    } else if (char === "\"") {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      cells.push(current);
      current = "";
    } else {
      current += char;
    }
  }

  cells.push(current);
  return cells.map((cell) => cell.trim());
}

function parseFixedAssetCsvRows(csvText: string) {
  const lines = csvText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 2) {
    throw new Error("Fixed asset CSV must include a header row and at least one asset row");
  }

  const headers = parseCsvLine(lines[0]).map((header) => header.trim().toLowerCase());
  for (const header of FIXED_ASSET_CSV_REQUIRED_HEADERS) {
    if (!headers.includes(header)) {
      throw new Error(`Fixed asset CSV missing required header: ${header}`);
    }
  }

  return lines.slice(1).map((line, index) => {
    const rowNumber = index + 2;
    const cells = parseCsvLine(line);
    if (cells.length !== headers.length) {
      throw new Error(
        `Fixed asset CSV row ${rowNumber}: expected ${headers.length} columns but found ${cells.length}`
      );
    }
    return {
      rowNumber,
      get(header: string) {
        const cellIndex = headers.indexOf(header);
        return cellIndex >= 0 ? cells[cellIndex] ?? "" : "";
      },
    };
  });
}

function csvDate(value: string, label: string, rowNumber: number) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`Fixed asset CSV row ${rowNumber}: ${label} must be YYYY-MM-DD`);
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error(`Fixed asset CSV row ${rowNumber}: ${label} is not a valid date`);
  }
  return value;
}

function csvMoney(value: string, label: string, rowNumber: number, required = true) {
  if (!value && !required) return undefined;
  if (!/^\d+(\.\d{1,2})?$/.test(value)) {
    throw new Error(
      `Fixed asset CSV row ${rowNumber}: ${label} must be a non-negative amount with up to 2 decimals`
    );
  }
  return Number(value).toFixed(2);
}

function csvOptionalInteger(value: string, label: string, rowNumber: number) {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 0 || String(parsed) !== value) {
    throw new Error(`Fixed asset CSV row ${rowNumber}: ${label} must be a non-negative integer`);
  }
  return parsed;
}

async function nextAssetCode(
  orgId: string,
  acquisitionDate: string,
  tx: DbConnection = db
) {
  const year = Number(acquisitionDate.slice(0, 4));
  const prefix = `FA-${year}-`;
  const [row] = await tx
    .select({
      maxSuffix: sql<number>`COALESCE(MAX(NULLIF(regexp_replace(${fixedAssets.assetCode}, ${`^${prefix}`}, ''), '')::int), 0)::int`,
    })
    .from(fixedAssets)
    .where(
      and(
        eq(fixedAssets.orgId, orgId),
        sql`${fixedAssets.assetCode} ~ ${`^${prefix}[0-9]+$`}`
      )
    );

  return `${prefix}${String((row?.maxSuffix ?? 0) + 1).padStart(4, "0")}`;
}

async function lockAssetCodeSequence(
  orgId: string,
  acquisitionDate: string,
  tx: DbConnection
) {
  const year = acquisitionDate.slice(0, 4);
  await tx.execute(sql`
    SELECT pg_advisory_xact_lock(hashtext(${`fixed-assets-code:${orgId}:${year}`}))
  `);
}

export async function getFixedAssetsDashboard(orgId: string) {
  await ensureHeadOfficeEstablishment(orgId);
  const currentYear = new Date().getUTCFullYear();

  const [assetSummary] = await db
    .select({
      assetCount: sql<number>`COUNT(*)::int`,
      activeAssetCount: sql<number>`COUNT(*) FILTER (WHERE ${fixedAssets.disposedAt} IS NULL)::int`,
      originalCost: sql<string>`COALESCE(SUM(${fixedAssets.originalCost}), 0)::numeric(14,2)`,
    })
    .from(fixedAssets)
    .where(and(...orgScope(fixedAssets, orgId)));

  const [depreciationSummary] = await db
    .select({
      accumulatedDepreciation: sql<string>`COALESCE(SUM(latest.accumulated), 0)::numeric(14,2)`,
    })
    .from(
      sql`(
        SELECT MAX(${depreciationSchedule.accumulatedDepreciationAfter}) AS accumulated
        FROM ${depreciationSchedule}
        INNER JOIN ${fixedAssets}
          ON ${fixedAssets.id} = ${depreciationSchedule.fixedAssetId}
          AND ${fixedAssets.orgId} = ${depreciationSchedule.orgId}
        WHERE ${depreciationSchedule.orgId} = ${orgId}
          AND ${fixedAssets.deletedAt} IS NULL
        GROUP BY ${depreciationSchedule.fixedAssetId}
      ) latest`
    );

  const originalCost = Number(assetSummary?.originalCost ?? 0);
  const accumulatedDepreciation = Number(
    depreciationSummary?.accumulatedDepreciation ?? 0
  );
  const summary = {
    assetCount: assetSummary?.assetCount ?? 0,
    activeAssetCount: assetSummary?.activeAssetCount ?? 0,
    originalCost: originalCost.toFixed(2),
    accumulatedDepreciation: accumulatedDepreciation.toFixed(2),
    bookValue: (originalCost - accumulatedDepreciation).toFixed(2),
  };

  const recentAssets = await db
    .select({
      id: fixedAssets.id,
      assetCode: fixedAssets.assetCode,
      nameEn: fixedAssets.nameEn,
      nameTh: fixedAssets.nameTh,
      category: fixedAssets.category,
      acquisitionDate: fixedAssets.acquisitionDate,
      originalCost: fixedAssets.originalCost,
      usefulLifeMonths: fixedAssets.usefulLifeMonths,
      taxUsefulLifeMonthsMinimum: fixedAssets.taxUsefulLifeMonthsMinimum,
      depreciationMethod: fixedAssets.depreciationMethod,
      disposedAt: fixedAssets.disposedAt,
      branchNumber: establishments.branchNumber,
      scheduleRows: sql<number>`COUNT(${depreciationSchedule.id})::int`,
      accumulatedDepreciation: sql<string>`COALESCE(MAX(${depreciationSchedule.accumulatedDepreciationAfter}), 0)::numeric(14,2)`,
    })
    .from(fixedAssets)
    .leftJoin(establishments, eq(establishments.id, fixedAssets.establishmentId))
    .leftJoin(
      depreciationSchedule,
      and(
        eq(depreciationSchedule.fixedAssetId, fixedAssets.id),
        eq(depreciationSchedule.orgId, fixedAssets.orgId)
      )
    )
    .where(and(...orgScope(fixedAssets, orgId)))
    .groupBy(
      fixedAssets.id,
      establishments.branchNumber
    )
    .orderBy(desc(fixedAssets.acquisitionDate), desc(fixedAssets.createdAt))
    .limit(50);

  const categoryDefaults = await db
    .select()
    .from(taxMinLifeByCategory)
    .orderBy(taxMinLifeByCategory.category);

  return {
    summary,
    recentAssets,
    categoryDefaults,
    rollForward: await getFixedAssetRollForward({
      orgId,
      fromDate: `${currentYear}-01-01`,
      toDate: `${currentYear}-12-31`,
    }),
    disposalRegister: await getFixedAssetDisposalRegister({
      orgId,
      fromDate: `${currentYear}-01-01`,
      toDate: `${currentYear}-12-31`,
    }),
  };
}

export async function getFixedAssetsByIds(orgId: string, assetIds: string[]) {
  const uniqueAssetIds = [...new Set(assetIds.filter(Boolean))].slice(0, 100);
  if (uniqueAssetIds.length === 0) return [];

  return db
    .select({
      id: fixedAssets.id,
      assetCode: fixedAssets.assetCode,
      nameEn: fixedAssets.nameEn,
      category: fixedAssets.category,
      acquisitionDate: fixedAssets.acquisitionDate,
      originalCost: fixedAssets.originalCost,
    })
    .from(fixedAssets)
    .where(
      and(
        ...orgScope(fixedAssets, orgId),
        inArray(fixedAssets.id, uniqueAssetIds)
      )
    );
}

export async function getFixedAssetDetail(orgId: string, assetId: string) {
  const [asset] = await db
    .select({
      id: fixedAssets.id,
      assetCode: fixedAssets.assetCode,
      nameTh: fixedAssets.nameTh,
      nameEn: fixedAssets.nameEn,
      category: fixedAssets.category,
      acquisitionDate: fixedAssets.acquisitionDate,
      originalCost: fixedAssets.originalCost,
      salvageValue: fixedAssets.salvageValue,
      usefulLifeMonths: fixedAssets.usefulLifeMonths,
      taxUsefulLifeMonthsMinimum: fixedAssets.taxUsefulLifeMonthsMinimum,
      depreciationMethod: fixedAssets.depreciationMethod,
      depreciationStartDate: fixedAssets.depreciationStartDate,
      disposedAt: fixedAssets.disposedAt,
      disposalProceeds: fixedAssets.disposalProceeds,
      gainLossOnDisposal: fixedAssets.gainLossOnDisposal,
      serialNumber: fixedAssets.serialNumber,
      location: fixedAssets.location,
      notes: fixedAssets.notes,
      branchNumber: establishments.branchNumber,
      establishmentName: sql<string>`COALESCE(${establishments.nameTh}, ${establishments.nameEn}, '')`,
    })
    .from(fixedAssets)
    .leftJoin(establishments, eq(establishments.id, fixedAssets.establishmentId))
    .where(and(eq(fixedAssets.id, assetId), ...orgScope(fixedAssets, orgId)))
    .limit(1);

  if (!asset) return null;

  const schedule = await db
    .select({
      id: depreciationSchedule.id,
      periodYear: depreciationSchedule.periodYear,
      periodMonth: depreciationSchedule.periodMonth,
      depreciationAmount: depreciationSchedule.depreciationAmount,
      taxDepreciationCappedAmount: depreciationSchedule.taxDepreciationCappedAmount,
      bookTaxDifference: depreciationSchedule.bookTaxDifference,
      accumulatedDepreciationAfter: depreciationSchedule.accumulatedDepreciationAfter,
      bookValueAfter: depreciationSchedule.bookValueAfter,
      journalEntryId: depreciationSchedule.journalEntryId,
      postedAt: depreciationSchedule.postedAt,
    })
    .from(depreciationSchedule)
    .where(
      and(
        ...orgScopeAlive(depreciationSchedule, orgId),
        eq(depreciationSchedule.fixedAssetId, assetId)
      )
    )
    .orderBy(depreciationSchedule.periodYear, depreciationSchedule.periodMonth);

  const latestPostedSchedule = schedule.findLast((row) => row.journalEntryId);
  const accumulatedDepreciation =
    latestPostedSchedule?.accumulatedDepreciationAfter ?? "0.00";
  const bookValue =
    latestPostedSchedule?.bookValueAfter ??
    money(toCents(asset.originalCost) - toCents(asset.salvageValue));

  return {
    asset,
    schedule,
    summary: {
      accumulatedDepreciation,
      bookValue,
      scheduleRows: schedule.length,
      postedRows: schedule.filter((row) => row.journalEntryId).length,
      bookTaxDifference: schedule
        .reduce((sum, row) => sum + Number(row.bookTaxDifference ?? "0"), 0)
        .toFixed(2),
    },
  };
}

export async function getFixedAssetRollForward(data: {
  orgId: string;
  fromDate: string;
  toDate: string;
}) {
  const fromPeriod = periodFromDate(data.fromDate);
  const toPeriod = periodFromDate(data.toDate);

  const assetRows = await db
    .select({
      category: fixedAssets.category,
      openingCost: sql<string>`COALESCE(SUM(CASE WHEN ${fixedAssets.acquisitionDate} < ${data.fromDate} AND (${fixedAssets.disposedAt} IS NULL OR ${fixedAssets.disposedAt} >= ${data.fromDate}) THEN ${fixedAssets.originalCost} ELSE 0 END), 0)::numeric(14,2)`,
      additions: sql<string>`COALESCE(SUM(CASE WHEN ${fixedAssets.acquisitionDate} >= ${data.fromDate} AND ${fixedAssets.acquisitionDate} <= ${data.toDate} THEN ${fixedAssets.originalCost} ELSE 0 END), 0)::numeric(14,2)`,
      disposals: sql<string>`COALESCE(SUM(CASE WHEN ${fixedAssets.disposedAt} >= ${data.fromDate} AND ${fixedAssets.disposedAt} <= ${data.toDate} THEN ${fixedAssets.originalCost} ELSE 0 END), 0)::numeric(14,2)`,
      closingCost: sql<string>`(
        COALESCE(SUM(CASE WHEN ${fixedAssets.acquisitionDate} <= ${data.toDate} THEN ${fixedAssets.originalCost} ELSE 0 END), 0)
        - COALESCE(SUM(CASE WHEN ${fixedAssets.disposedAt} <= ${data.toDate} THEN ${fixedAssets.originalCost} ELSE 0 END), 0)
      )::numeric(14,2)`,
    })
    .from(fixedAssets)
    .where(and(...orgScope(fixedAssets, data.orgId)))
    .groupBy(fixedAssets.category)
    .orderBy(fixedAssets.category);

  const depreciationRows = await db
    .select({
      category: fixedAssets.category,
      depreciationInPeriod: sql<string>`COALESCE(SUM(${depreciationSchedule.depreciationAmount}), 0)::numeric(14,2)`,
    })
    .from(depreciationSchedule)
    .innerJoin(
      fixedAssets,
      and(
        eq(fixedAssets.id, depreciationSchedule.fixedAssetId),
        eq(fixedAssets.orgId, depreciationSchedule.orgId)
      )
    )
    .where(
      and(
        ...orgScopeAlive(depreciationSchedule, data.orgId),
        or(
          sql`${depreciationSchedule.periodYear} > ${fromPeriod.year}`,
          and(
            eq(depreciationSchedule.periodYear, fromPeriod.year),
            sql`${depreciationSchedule.periodMonth} >= ${fromPeriod.month}`
          )
        ),
        or(
          sql`${depreciationSchedule.periodYear} < ${toPeriod.year}`,
          and(
            eq(depreciationSchedule.periodYear, toPeriod.year),
            lte(depreciationSchedule.periodMonth, toPeriod.month)
          )
        ),
        sql`(
          ${fixedAssets.disposedAt} IS NULL
          OR make_date(${depreciationSchedule.periodYear}, ${depreciationSchedule.periodMonth}, 1)
            <= date_trunc('month', ${fixedAssets.disposedAt})::date
        )`
      )
    )
    .groupBy(fixedAssets.category);

  const depreciationByCategory = new Map(
    depreciationRows.map((row) => [row.category, row.depreciationInPeriod])
  );

  const assetAccountCodes = Array.from(
    new Set(
      assetRows
        .map((row) => DISPOSAL_ACCOUNT_BY_CATEGORY[row.category]?.asset)
        .filter((code): code is string => Boolean(code))
    )
  );
  const glRows =
    assetAccountCodes.length > 0
      ? await db
          .select({
            accountCode: glAccounts.accountCode,
            closingCost: sql<string>`COALESCE(SUM(${journalLines.debitAmount} - ${journalLines.creditAmount}), 0)::numeric(14,2)`,
          })
          .from(journalLines)
          .innerJoin(
            journalEntries,
            and(
              eq(journalEntries.id, journalLines.journalEntryId),
              eq(journalEntries.orgId, journalLines.orgId)
            )
          )
          .innerJoin(
            glAccounts,
            and(
              eq(glAccounts.id, journalLines.accountId),
              eq(glAccounts.orgId, journalLines.orgId)
            )
          )
          .where(
            and(
              eq(journalLines.orgId, data.orgId),
              inArray(glAccounts.accountCode, assetAccountCodes),
              sql`${journalEntries.entryDate} <= ${data.toDate}::date`
            )
          )
          .groupBy(glAccounts.accountCode)
      : [];
  const glClosingCostByAccount = new Map(
    glRows.map((row) => [row.accountCode, row.closingCost])
  );
  const categoryCountByAccount = new Map<string, number>();
  for (const row of assetRows) {
    const accountCode = DISPOSAL_ACCOUNT_BY_CATEGORY[row.category]?.asset;
    if (!accountCode) continue;
    categoryCountByAccount.set(
      accountCode,
      (categoryCountByAccount.get(accountCode) ?? 0) + 1
    );
  }

  return assetRows.map((row) => {
    const glAssetAccountCode =
      DISPOSAL_ACCOUNT_BY_CATEGORY[row.category]?.asset ?? null;
    const canTieOutCategory =
      glAssetAccountCode &&
      (categoryCountByAccount.get(glAssetAccountCode) ?? 0) === 1;
    const glClosingCost = canTieOutCategory
      ? glClosingCostByAccount.get(glAssetAccountCode) ?? "0.00"
      : null;
    return {
      ...row,
      depreciationInPeriod: depreciationByCategory.get(row.category) ?? "0.00",
      glAssetAccountCode,
      glClosingCost,
      glVariance: glClosingCost
        ? money(toCents(row.closingCost) - toCents(glClosingCost))
        : null,
    };
  });
}

export async function getFixedAssetDisposalRegister(data: {
  orgId: string;
  fromDate: string;
  toDate: string;
}) {
  return db
    .select({
      id: fixedAssets.id,
      assetCode: fixedAssets.assetCode,
      nameEn: fixedAssets.nameEn,
      nameTh: fixedAssets.nameTh,
      category: fixedAssets.category,
      acquisitionDate: fixedAssets.acquisitionDate,
      disposedAt: fixedAssets.disposedAt,
      originalCost: fixedAssets.originalCost,
      disposalProceeds: fixedAssets.disposalProceeds,
      gainLossOnDisposal: fixedAssets.gainLossOnDisposal,
      bookValueAtDisposal: sql<string>`(
        COALESCE(${fixedAssets.disposalProceeds}, 0)
        - COALESCE(${fixedAssets.gainLossOnDisposal}, 0)
      )::numeric(14,2)`,
      branchNumber: establishments.branchNumber,
    })
    .from(fixedAssets)
    .leftJoin(establishments, eq(establishments.id, fixedAssets.establishmentId))
    .where(
      and(
        ...orgScope(fixedAssets, data.orgId),
        sql`${fixedAssets.disposedAt} IS NOT NULL`,
        sql`${fixedAssets.disposedAt} >= ${data.fromDate}::date`,
        sql`${fixedAssets.disposedAt} <= ${data.toDate}::date`
      )
    )
    .orderBy(desc(fixedAssets.disposedAt), desc(fixedAssets.createdAt))
    .limit(100);
}

export async function createFixedAsset(data: {
  orgId: string;
  assetCode?: string;
  nameEn: string;
  nameTh?: string;
  category: string;
  acquisitionDate: string;
  originalCost: string;
  salvageValue?: string;
  usefulLifeMonths?: number;
  depreciationStartDate?: string;
  acquisitionDocumentId?: string;
  serialNumber?: string;
  location?: string;
  notes?: string;
}) {
  return db.transaction(async (tx) => {
    const establishment = await ensureHeadOfficeEstablishment(data.orgId, tx);
    const [taxLife] = await tx
      .select()
      .from(taxMinLifeByCategory)
      .where(eq(taxMinLifeByCategory.category, data.category))
      .limit(1);

    if (!taxLife) {
      throw new Error("Unsupported fixed asset category");
    }

    const method = data.category === "land" ? "not_depreciable" : "straight_line";
    const usefulLifeMonths =
      method === "not_depreciable"
        ? 0
        : data.usefulLifeMonths ??
          DEFAULT_BOOK_LIFE_MONTHS[data.category] ??
          taxLife.taxUsefulLifeMonthsMinimum;

    if (toCents(data.salvageValue) > toCents(data.originalCost)) {
      throw new Error("Salvage value cannot exceed original cost");
    }

    const [asset] = await tx
      .insert(fixedAssets)
      .values({
        orgId: data.orgId,
        establishmentId: establishment.id,
        assetCode:
          data.assetCode ||
          (await (async () => {
            await lockAssetCodeSequence(data.orgId, data.acquisitionDate, tx);
            return nextAssetCode(data.orgId, data.acquisitionDate, tx);
          })()),
        nameEn: data.nameEn,
        nameTh: data.nameTh || null,
        category: data.category,
        acquisitionDate: data.acquisitionDate,
        originalCost: data.originalCost,
        salvageValue: data.salvageValue || "0.00",
        usefulLifeMonths,
        taxUsefulLifeMonthsMinimum: taxLife.taxUsefulLifeMonthsMinimum,
        depreciationMethod: method,
        depreciationStartDate: data.depreciationStartDate || data.acquisitionDate,
        acquisitionDocumentId: data.acquisitionDocumentId || null,
        serialNumber: data.serialNumber || null,
        location: data.location || null,
        notes: data.notes || null,
      })
      .returning();

    return asset;
  });
}

export async function importFixedAssetsCsv(data: {
  orgId: string;
  csvText: string;
}) {
  const parsedRows = parseFixedAssetCsvRows(data.csvText);
  const taxLives = await db.select().from(taxMinLifeByCategory);
  const taxLifeByCategory = new Map(taxLives.map((row) => [row.category, row]));

  const rows = parsedRows.map((row) => {
    const nameEn = row.get("name_en");
    const category = row.get("category");
    if (!nameEn) {
      throw new Error(`Fixed asset CSV row ${row.rowNumber}: name_en is required`);
    }
    const taxLife = taxLifeByCategory.get(category);
    if (!taxLife) {
      throw new Error(`Fixed asset CSV row ${row.rowNumber}: unsupported category ${category}`);
    }

    const originalCost = csvMoney(
      row.get("original_cost"),
      "original_cost",
      row.rowNumber
    )!;
    const salvageValue =
      csvMoney(row.get("salvage_value"), "salvage_value", row.rowNumber, false) ??
      "0.00";
    if (toCents(salvageValue) > toCents(originalCost)) {
      throw new Error(
        `Fixed asset CSV row ${row.rowNumber}: salvage_value cannot exceed original_cost`
      );
    }

    return {
      rowNumber: row.rowNumber,
      assetCode: row.get("asset_code"),
      nameEn,
      nameTh: row.get("name_th"),
      category,
      acquisitionDate: csvDate(
        row.get("acquisition_date"),
        "acquisition_date",
        row.rowNumber
      ),
      originalCost,
      salvageValue,
      usefulLifeMonths: csvOptionalInteger(
        row.get("useful_life_months"),
        "useful_life_months",
        row.rowNumber
      ),
      depreciationStartDate: row.get("depreciation_start_date")
        ? csvDate(
            row.get("depreciation_start_date"),
            "depreciation_start_date",
            row.rowNumber
          )
        : undefined,
      serialNumber: row.get("serial_number"),
      location: row.get("location"),
      notes: row.get("notes"),
      taxLife,
    };
  });

  return db.transaction(async (tx) => {
    const establishment = await ensureHeadOfficeEstablishment(data.orgId, tx);
    const created = [];

    for (const row of rows) {
      const method = row.category === "land" ? "not_depreciable" : "straight_line";
      const usefulLifeMonths =
        method === "not_depreciable"
          ? 0
          : row.usefulLifeMonths ??
            DEFAULT_BOOK_LIFE_MONTHS[row.category] ??
            row.taxLife.taxUsefulLifeMonthsMinimum;

      try {
        const [asset] = await tx
          .insert(fixedAssets)
          .values({
            orgId: data.orgId,
            establishmentId: establishment.id,
            assetCode:
              row.assetCode ||
              (await (async () => {
                await lockAssetCodeSequence(data.orgId, row.acquisitionDate, tx);
                return nextAssetCode(data.orgId, row.acquisitionDate, tx);
              })()),
            nameEn: row.nameEn,
            nameTh: row.nameTh || null,
            category: row.category,
            acquisitionDate: row.acquisitionDate,
            originalCost: row.originalCost,
            salvageValue: row.salvageValue,
            usefulLifeMonths,
            taxUsefulLifeMonthsMinimum: row.taxLife.taxUsefulLifeMonthsMinimum,
            depreciationMethod: method,
            depreciationStartDate: row.depreciationStartDate || row.acquisitionDate,
            serialNumber: row.serialNumber || null,
            location: row.location || null,
            notes: row.notes || null,
          })
          .returning();
        created.push(asset);
      } catch (error) {
        const message = error instanceof Error ? error.message : "insert failed";
        throw new Error(`Fixed asset CSV row ${row.rowNumber}: ${message}`);
      }
    }

    return { createdCount: created.length, assetIds: created.map((asset) => asset.id) };
  });
}

export async function buildDepreciationScheduleForAsset(data: {
  orgId: string;
  assetId: string;
}) {
  return db.transaction(async (tx) => {
    const [asset] = await tx
      .select()
      .from(fixedAssets)
      .where(
        and(
          eq(fixedAssets.id, data.assetId),
          ...orgScope(fixedAssets, data.orgId)
        )
      )
      .limit(1);

    if (!asset) throw new Error("Fixed asset not found");
    if (asset.depreciationMethod === "not_depreciable") return [];
    if (asset.disposedAt) throw new Error("Disposed assets cannot accrue new depreciation");

    const existingRows = await tx
      .select({ periodYear: depreciationSchedule.periodYear, periodMonth: depreciationSchedule.periodMonth })
      .from(depreciationSchedule)
      .where(
        and(
          ...orgScopeAlive(depreciationSchedule, data.orgId),
          eq(depreciationSchedule.fixedAssetId, data.assetId)
        )
      );
    const existing = new Set(
      existingRows.map((row) => `${row.periodYear}-${row.periodMonth}`)
    );

    const depreciableCents =
      toCents(asset.originalCost) - toCents(asset.salvageValue);
    const monthlyBookCents = Math.floor(depreciableCents / asset.usefulLifeMonths);
    const monthlyTaxCents =
      asset.taxUsefulLifeMonthsMinimum > 0
        ? Math.floor(depreciableCents / asset.taxUsefulLifeMonthsMinimum)
        : 0;

    let accumulatedCents = 0;
    const rows = [];

    for (let index = 1; index <= asset.usefulLifeMonths; index += 1) {
      const periodDate = addMonths(asset.depreciationStartDate, index);
      const { year, month } = periodFromDate(periodDate);
      const periodKey = `${year}-${month}`;
      const remainingCents = depreciableCents - accumulatedCents;
      const bookCents =
        index === asset.usefulLifeMonths
          ? remainingCents
          : Math.min(monthlyBookCents, remainingCents);
      const taxCents = Math.min(bookCents, monthlyTaxCents || bookCents);
      accumulatedCents += bookCents;

      if (!existing.has(periodKey)) {
        rows.push({
          orgId: data.orgId,
          fixedAssetId: data.assetId,
          periodYear: year,
          periodMonth: month,
          depreciationAmount: money(bookCents),
          taxDepreciationCappedAmount: money(taxCents),
          bookTaxDifference: money(bookCents - taxCents),
          accumulatedDepreciationAfter: money(accumulatedCents),
          bookValueAfter: money(toCents(asset.originalCost) - accumulatedCents),
        });
      }
    }

    if (rows.length === 0) return [];
    return tx.insert(depreciationSchedule).values(rows).returning();
  });
}

export async function getFixedAssetByAcquisitionDocument(
  orgId: string,
  documentId: string
) {
  const [asset] = await db
    .select()
    .from(fixedAssets)
    .where(
      and(
        ...orgScope(fixedAssets, orgId),
        eq(fixedAssets.acquisitionDocumentId, documentId)
      )
    )
    .limit(1);

  return asset ?? null;
}

export async function postDepreciationForPeriod(data: {
  orgId: string;
  periodYear: number;
  periodMonth: number;
  createdByUserId?: string;
  sourceEntityId?: string;
  tx?: DbConnection;
}) {
  if (data.periodMonth < 1 || data.periodMonth > 12) {
    throw new Error("Depreciation period month must be between 1 and 12");
  }

  if (await isPeriodLocked(data.orgId, "gl", data.periodYear, data.periodMonth)) {
    throw new Error("GL period is locked");
  }

  const postInTransaction = async (tx: DbConnection) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${`fixed-asset-depreciation:${data.orgId}:${data.periodYear}:${data.periodMonth}`}))`
    );

    await seedStandardGlAccounts(data.orgId, tx);

    const rows = await tx
      .select({
        scheduleId: depreciationSchedule.id,
        fixedAssetId: depreciationSchedule.fixedAssetId,
        depreciationAmount: depreciationSchedule.depreciationAmount,
        assetCode: fixedAssets.assetCode,
        assetName: fixedAssets.nameEn,
        category: fixedAssets.category,
      })
      .from(depreciationSchedule)
      .innerJoin(
        fixedAssets,
        and(
          eq(fixedAssets.id, depreciationSchedule.fixedAssetId),
          eq(fixedAssets.orgId, depreciationSchedule.orgId)
        )
      )
      .where(
        and(
          ...orgScopeAlive(depreciationSchedule, data.orgId),
          ...orgScope(fixedAssets, data.orgId),
          isNull(fixedAssets.disposedAt),
          eq(depreciationSchedule.periodYear, data.periodYear),
          eq(depreciationSchedule.periodMonth, data.periodMonth),
          isNull(depreciationSchedule.journalEntryId)
        )
      )
      .orderBy(fixedAssets.assetCode);

    if (rows.length === 0) {
      return {
        postedRows: 0,
        journalEntryId: null as string | null,
        totalAmount: "0.00",
      };
    }

    const accounts = await getGlAccounts(data.orgId, tx);
    const accountByCode = new Map(accounts.map((account) => [account.accountCode, account]));
    const lines: JournalEntryLineInput[] = [];
    let totalCents = 0;

    for (const row of rows) {
      const mapping = DEPRECIATION_ACCOUNT_BY_CATEGORY[row.category];
      if (!mapping) {
        throw new Error(`Unsupported depreciation posting category: ${row.category}`);
      }

      const expenseAccount = accountByCode.get(mapping.expense);
      const accumulatedAccount = accountByCode.get(mapping.accumulated);
      if (!expenseAccount || !accumulatedAccount) {
        throw new Error(
          `Missing depreciation GL accounts for category ${row.category}`
        );
      }

      const amount = money(toCents(row.depreciationAmount));
      totalCents += toCents(row.depreciationAmount);
      const description = `Depreciation ${row.assetCode} ${data.periodYear}-${monthLabel(data.periodMonth)}`;

      lines.push(
        {
          accountId: expenseAccount.id,
          description,
          debitAmount: amount,
          creditAmount: "0.00",
          subledgerEntityType: "fixed_asset",
          subledgerEntityId: row.fixedAssetId,
          allocationCategory: `fixed_asset:${row.category}`,
        },
        {
          accountId: accumulatedAccount.id,
          description,
          debitAmount: "0.00",
          creditAmount: amount,
          subledgerEntityType: "fixed_asset",
          subledgerEntityId: row.fixedAssetId,
        }
      );
    }

    const periodCode = `${data.periodYear}-${monthLabel(data.periodMonth)}`;
    const entryPrefix = `DEP-${periodCode}-`;
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
        entryDate: periodEndDate(data.periodYear, data.periodMonth),
        entryType: "auto_depreciation",
        postingKind: "depreciation",
        sourceEntityType: "fixed_asset_depreciation",
        sourceEntityId: data.sourceEntityId,
        description: `Fixed asset depreciation ${periodCode}`,
        createdByUserId: data.createdByUserId,
        lines,
      },
      tx
    );

    await tx
      .update(depreciationSchedule)
      .set({
        journalEntryId: entry.id,
        postedAt: new Date(),
      })
      .where(
        and(
          eq(depreciationSchedule.orgId, data.orgId),
          inArray(
            depreciationSchedule.id,
            rows.map((row) => row.scheduleId)
          ),
          isNull(depreciationSchedule.journalEntryId)
        )
      );

    await tx.insert(auditLog).values({
      orgId: data.orgId,
      entityType: "journal_entry",
      entityId: entry.id,
      action: "create",
      newValue: {
        event: "fixed_asset_depreciation_posted",
        periodYear: data.periodYear,
        periodMonth: data.periodMonth,
        postedRows: rows.length,
        totalAmount: money(totalCents),
      },
    });

    return {
      postedRows: rows.length,
      journalEntryId: entry.id,
      totalAmount: money(totalCents),
    };
  };

  if (data.tx) return postInTransaction(data.tx);
  return db.transaction(postInTransaction);
}

export async function processDepreciationForPeriod(data: {
  orgId: string;
  periodYear: number;
  periodMonth: number;
  createdByUserId?: string;
}) {
  if (data.periodMonth < 1 || data.periodMonth > 12) {
    throw new Error("Depreciation period month must be between 1 and 12");
  }
  if (await isPeriodLocked(data.orgId, "gl", data.periodYear, data.periodMonth)) {
    throw new Error("GL period is locked");
  }

  const periodEnd = periodEndDate(data.periodYear, data.periodMonth);
  const assets = await db
    .select({
      id: fixedAssets.id,
    })
    .from(fixedAssets)
    .where(
      and(
        ...orgScope(fixedAssets, data.orgId),
        sql`${fixedAssets.depreciationMethod} <> 'not_depreciable'`,
        isNull(fixedAssets.disposedAt),
        sql`${fixedAssets.depreciationStartDate} <= ${periodEnd}`
      )
    )
    .orderBy(fixedAssets.assetCode);

  let scheduleRowsCreated = 0;
  for (const asset of assets) {
    const rows = await buildDepreciationScheduleForAsset({
      orgId: data.orgId,
      assetId: asset.id,
    });
    scheduleRowsCreated += rows.length;
  }

  const posting = await postDepreciationForPeriod(data);

  return {
    assetsConsidered: assets.length,
    scheduleRowsCreated,
    ...posting,
  };
}

export async function enqueueDepreciationPostingForPeriod(data: {
  orgId: string;
  periodYear: number;
  periodMonth: number;
  createdByUserId?: string;
}) {
  if (data.periodMonth < 1 || data.periodMonth > 12) {
    throw new Error("Depreciation period month must be between 1 and 12");
  }
  if (await isPeriodLocked(data.orgId, "gl", data.periodYear, data.periodMonth)) {
    throw new Error("GL period is locked");
  }

  const periodEnd = periodEndDate(data.periodYear, data.periodMonth);
  const assets = await db
    .select({
      id: fixedAssets.id,
    })
    .from(fixedAssets)
    .where(
      and(
        ...orgScope(fixedAssets, data.orgId),
        sql`${fixedAssets.depreciationMethod} <> 'not_depreciable'`,
        isNull(fixedAssets.disposedAt),
        sql`${fixedAssets.depreciationStartDate} <= ${periodEnd}`
      )
    )
    .orderBy(fixedAssets.assetCode);

  let scheduleRowsCreated = 0;
  for (const asset of assets) {
    const rows = await buildDepreciationScheduleForAsset({
      orgId: data.orgId,
      assetId: asset.id,
    });
    scheduleRowsCreated += rows.length;
  }

  const [unposted] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(depreciationSchedule)
    .innerJoin(
      fixedAssets,
      and(
        eq(fixedAssets.id, depreciationSchedule.fixedAssetId),
        eq(fixedAssets.orgId, depreciationSchedule.orgId)
      )
    )
    .where(
      and(
        ...orgScopeAlive(depreciationSchedule, data.orgId),
        ...orgScope(fixedAssets, data.orgId),
        isNull(fixedAssets.disposedAt),
        eq(depreciationSchedule.periodYear, data.periodYear),
        eq(depreciationSchedule.periodMonth, data.periodMonth),
        isNull(depreciationSchedule.journalEntryId)
      )
    );

  if ((unposted?.count ?? 0) === 0) {
    return {
      assetsConsidered: assets.length,
      scheduleRowsCreated,
      postingOutboxId: null as string | null,
      periodId: null as string | null,
      journalEntryId: null as string | null,
      postedRows: 0,
      totalAmount: "0.00",
    };
  }

  const periodCode = `${data.periodYear}-${monthLabel(data.periodMonth)}`;
  const { enqueuePostingOutbox } = await import("./posting-outbox");

  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${`fixed-asset-depreciation-enqueue:${data.orgId}:${data.periodYear}:${data.periodMonth}`}))`
    );
    const [existingOpenPeriod] = await tx
      .select({
        periodId: fixedAssetDepreciationPeriods.id,
        postingOutboxId: fixedAssetDepreciationPeriods.postingOutboxId,
      })
      .from(fixedAssetDepreciationPeriods)
      .innerJoin(
        postingOutbox,
        and(
          eq(postingOutbox.id, fixedAssetDepreciationPeriods.postingOutboxId),
          eq(postingOutbox.orgId, fixedAssetDepreciationPeriods.orgId)
        )
      )
      .where(
        and(
          eq(fixedAssetDepreciationPeriods.orgId, data.orgId),
          eq(fixedAssetDepreciationPeriods.periodYear, data.periodYear),
          eq(fixedAssetDepreciationPeriods.periodMonth, data.periodMonth),
          sql`${postingOutbox.postingStatus} IN ('pending', 'retrying', 'failed')`
        )
      )
      .limit(1);
    if (existingOpenPeriod?.postingOutboxId) {
      return {
        assetsConsidered: assets.length,
        scheduleRowsCreated,
        postingOutboxId: existingOpenPeriod.postingOutboxId,
        periodId: existingOpenPeriod.periodId,
        journalEntryId: null as string | null,
        postedRows: 0,
        totalAmount: "0.00",
      };
    }

    const [lockedUnposted] = await tx
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(depreciationSchedule)
      .innerJoin(
        fixedAssets,
        and(
          eq(fixedAssets.id, depreciationSchedule.fixedAssetId),
          eq(fixedAssets.orgId, depreciationSchedule.orgId)
        )
      )
      .where(
        and(
          ...orgScopeAlive(depreciationSchedule, data.orgId),
          ...orgScope(fixedAssets, data.orgId),
          isNull(fixedAssets.disposedAt),
          eq(depreciationSchedule.periodYear, data.periodYear),
          eq(depreciationSchedule.periodMonth, data.periodMonth),
          isNull(depreciationSchedule.journalEntryId)
        )
      );
    if ((lockedUnposted?.count ?? 0) === 0) {
      return {
        assetsConsidered: assets.length,
        scheduleRowsCreated,
        postingOutboxId: null as string | null,
        periodId: null as string | null,
        journalEntryId: null as string | null,
        postedRows: 0,
        totalAmount: "0.00",
      };
    }

    const [period] = await tx
      .insert(fixedAssetDepreciationPeriods)
      .values({
        orgId: data.orgId,
        periodYear: data.periodYear,
        periodMonth: data.periodMonth,
        scheduleRowsCreated,
        createdByUserId: data.createdByUserId,
      })
      .returning();

    const outbox = await enqueuePostingOutbox({
      orgId: data.orgId,
      sourceEntityType: "fixed_asset_depreciation_period",
      sourceEntityId: period.id,
      eventType: "post",
      postingDate: periodEndDate(data.periodYear, data.periodMonth),
      payload: {
        periodYear: data.periodYear,
        periodMonth: data.periodMonth,
        periodCode,
        createdByUserId: data.createdByUserId,
      },
      tx,
    });

    const [updatedPeriod] = await tx
      .update(fixedAssetDepreciationPeriods)
      .set({
        postingOutboxId: outbox.id,
        updatedAt: sql`now()`,
      })
      .where(eq(fixedAssetDepreciationPeriods.id, period.id))
      .returning();

    return {
      assetsConsidered: assets.length,
      scheduleRowsCreated,
      postingOutboxId: outbox.id,
      periodId: updatedPeriod.id,
      journalEntryId: null as string | null,
      postedRows: 0,
      totalAmount: "0.00",
    };
  });
}

export async function postDepreciationOutboxPeriod(data: {
  tx: DbConnection;
  orgId: string;
  periodId: string;
}) {
  const [period] = await data.tx
    .select()
    .from(fixedAssetDepreciationPeriods)
    .where(
      and(
        eq(fixedAssetDepreciationPeriods.orgId, data.orgId),
        eq(fixedAssetDepreciationPeriods.id, data.periodId)
      )
    )
    .limit(1)
    .for("update");
  if (!period) throw new Error("Fixed asset depreciation period not found");

  const posting = await postDepreciationForPeriod({
    orgId: data.orgId,
    periodYear: period.periodYear,
    periodMonth: period.periodMonth,
    createdByUserId: period.createdByUserId ?? undefined,
    sourceEntityId: period.id,
    tx: data.tx,
  });

  if (!posting.journalEntryId) {
    const [existing] = await data.tx
      .select()
      .from(journalEntries)
      .where(
        and(
          eq(journalEntries.orgId, data.orgId),
          eq(journalEntries.sourceEntityType, "fixed_asset_depreciation"),
          eq(journalEntries.sourceEntityId, period.id),
          eq(journalEntries.postingKind, "depreciation")
        )
      )
      .limit(1);
    if (!existing) throw new Error("No unposted depreciation rows for period");
    return existing;
  }

  const [entry] = await data.tx
    .select()
    .from(journalEntries)
    .where(
      and(
        eq(journalEntries.orgId, data.orgId),
        eq(journalEntries.id, posting.journalEntryId)
      )
    )
    .limit(1);
  if (!entry) throw new Error("Depreciation journal entry not found");

  await data.tx
    .update(fixedAssetDepreciationPeriods)
    .set({
      journalEntryId: entry.id,
      postedAt: new Date(),
      updatedAt: sql`now()`,
    })
    .where(eq(fixedAssetDepreciationPeriods.id, period.id));

  return entry;
}

export async function processMonthlyDepreciationForAllOrgs(data: {
  periodYear?: number;
  periodMonth?: number;
  createdByUserId?: string;
} = {}) {
  const target =
    data.periodYear && data.periodMonth
      ? { periodYear: data.periodYear, periodMonth: data.periodMonth }
      : previousBangkokMonth();

  const orgs = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(sql`${organizations.deletedAt} IS NULL`)
    .orderBy(organizations.createdAt);

  const results = [];
  for (const org of orgs) {
    try {
      const result = await enqueueDepreciationPostingForPeriod({
        orgId: org.id,
        periodYear: target.periodYear,
        periodMonth: target.periodMonth,
        createdByUserId: data.createdByUserId,
      });
      results.push({ orgId: org.id, status: "processed" as const, ...result });
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown error";
      try {
        await db.insert(auditLog).values({
          orgId: org.id,
          entityType: "fixed_asset_depreciation_period",
          entityId: org.id,
          action: "create",
          newValue: {
            event: "fixed_asset_monthly_depreciation_failed",
            periodYear: target.periodYear,
            periodMonth: target.periodMonth,
            error: message,
          },
        });
      } catch {
        // Keep the org batch isolated even if failure visibility cannot be recorded.
      }
      results.push({
        orgId: org.id,
        status: "failed" as const,
        error: message,
      });
    }
  }

  return {
    ...target,
    orgsProcessed: results.filter((result) => result.status === "processed").length,
    orgsFailed: results.filter((result) => result.status === "failed").length,
    results,
  };
}

export async function disposeFixedAsset(data: {
  orgId: string;
  assetId: string;
  disposedAt: string;
  disposalProceeds: string;
}) {
  const proceedsCents = toCents(data.disposalProceeds);
  if (proceedsCents < 0) {
    throw new Error("Disposal proceeds cannot be negative");
  }

  return db.transaction(async (tx) => {
    const [asset] = await tx
      .select()
      .from(fixedAssets)
      .where(
        and(
          eq(fixedAssets.id, data.assetId),
          ...orgScope(fixedAssets, data.orgId)
        )
      )
      .limit(1);
    if (!asset) throw new Error("Fixed asset not found");
    if (asset.disposedAt) throw new Error("Fixed asset is already disposed");
    if (data.disposedAt < asset.acquisitionDate) {
      throw new Error("Disposal date cannot be before acquisition date");
    }

    const disposalPeriod = periodFromDate(data.disposedAt);
    if (await isPeriodLocked(data.orgId, "gl", disposalPeriod.year, disposalPeriod.month)) {
      throw new Error("GL period is locked");
    }

    const [pendingDepreciationPeriod] = await tx
      .select({ id: fixedAssetDepreciationPeriods.id })
      .from(fixedAssetDepreciationPeriods)
      .innerJoin(
        postingOutbox,
        and(
          eq(postingOutbox.id, fixedAssetDepreciationPeriods.postingOutboxId),
          eq(postingOutbox.orgId, fixedAssetDepreciationPeriods.orgId)
        )
      )
      .where(
        and(
          eq(fixedAssetDepreciationPeriods.orgId, data.orgId),
          eq(fixedAssetDepreciationPeriods.periodYear, disposalPeriod.year),
          eq(fixedAssetDepreciationPeriods.periodMonth, disposalPeriod.month),
          sql`${postingOutbox.postingStatus} IN ('pending', 'retrying')`
        )
      )
      .limit(1);
    if (pendingDepreciationPeriod) {
      throw new Error("Post pending depreciation for the disposal period before disposing asset");
    }

    const [depreciation] = await tx
      .select({
        accumulated: sql<string>`COALESCE(SUM(${depreciationSchedule.depreciationAmount}), 0)::numeric(14,2)`,
      })
      .from(depreciationSchedule)
      .where(
        and(
          ...orgScopeAlive(depreciationSchedule, data.orgId),
          eq(depreciationSchedule.fixedAssetId, data.assetId),
          isNotNull(depreciationSchedule.journalEntryId),
          or(
            lte(depreciationSchedule.periodYear, disposalPeriod.year - 1),
            and(
              eq(depreciationSchedule.periodYear, disposalPeriod.year),
              lte(depreciationSchedule.periodMonth, disposalPeriod.month)
            )
          )
        )
      );

    const bookValueCents =
      toCents(asset.originalCost) - toCents(depreciation?.accumulated);
    const gainLossCents = proceedsCents - bookValueCents;
    const accumulatedCents = toCents(depreciation?.accumulated);

    await tx
      .delete(depreciationSchedule)
      .where(
        and(
          ...orgScopeAlive(depreciationSchedule, data.orgId),
          eq(depreciationSchedule.fixedAssetId, data.assetId),
          isNull(depreciationSchedule.journalEntryId),
          or(
            sql`${depreciationSchedule.periodYear} > ${disposalPeriod.year}`,
            and(
              eq(depreciationSchedule.periodYear, disposalPeriod.year),
              sql`${depreciationSchedule.periodMonth} > ${disposalPeriod.month}`
            )
          )
        )
      );

    await seedStandardGlAccounts(data.orgId, tx);
    const accounts = await getGlAccounts(data.orgId, tx);
    const accountByCode = new Map(accounts.map((account) => [account.accountCode, account]));
    const disposalMapping = DISPOSAL_ACCOUNT_BY_CATEGORY[asset.category];
    if (!disposalMapping) {
      throw new Error(`Unsupported fixed asset disposal category: ${asset.category}`);
    }
    const assetAccount = accountByCode.get(disposalMapping.asset);
    const accumulatedAccount = disposalMapping.accumulated
      ? accountByCode.get(disposalMapping.accumulated)
      : null;
    const bankAccount = accountByCode.get("1111");
    const gainAccount = accountByCode.get("4340");
    const lossAccount = accountByCode.get("6880");
    if (!assetAccount || !bankAccount || !gainAccount || !lossAccount) {
      throw new Error("Missing fixed asset disposal GL accounts");
    }
    if (accumulatedCents > 0 && !accumulatedAccount) {
      throw new Error(`Missing accumulated depreciation account for ${asset.category}`);
    }

    const lines: JournalEntryLineInput[] = [];
    const sourceRef = {
      subledgerEntityType: "fixed_asset",
      subledgerEntityId: data.assetId,
    };
    if (proceedsCents > 0) {
      lines.push({
        accountId: bankAccount.id,
        debitAmount: money(proceedsCents),
        description: `Fixed asset disposal proceeds ${asset.assetCode}`,
        ...sourceRef,
      });
    }
    if (accumulatedCents > 0 && accumulatedAccount) {
      lines.push({
        accountId: accumulatedAccount.id,
        debitAmount: money(accumulatedCents),
        description: `Clear accumulated depreciation ${asset.assetCode}`,
        ...sourceRef,
      });
    }
    if (gainLossCents < 0) {
      lines.push({
        accountId: lossAccount.id,
        debitAmount: money(Math.abs(gainLossCents)),
        description: `Loss on fixed asset disposal ${asset.assetCode}`,
        allocationCategory: `fixed_asset:${asset.category}`,
        ...sourceRef,
      });
    }
    lines.push({
      accountId: assetAccount.id,
      creditAmount: money(toCents(asset.originalCost)),
      description: `Clear fixed asset cost ${asset.assetCode}`,
      ...sourceRef,
    });
    if (gainLossCents > 0) {
      lines.push({
        accountId: gainAccount.id,
        creditAmount: money(gainLossCents),
        description: `Gain on fixed asset disposal ${asset.assetCode}`,
        allocationCategory: `fixed_asset:${asset.category}`,
        ...sourceRef,
      });
    }

    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${`fixed-asset-disposal:${data.orgId}:${data.disposedAt}`}))`
    );

    const [{ nextSequence }] = await tx
      .select({
        nextSequence: sql<number>`COUNT(*)::int + 1`,
      })
      .from(journalEntries)
      .where(
        and(
          eq(journalEntries.orgId, data.orgId),
          sql`${journalEntries.entryNumber} LIKE ${`FA-DISP-${data.disposedAt}-%`}`
        )
      );
    const journalEntry = await createJournalEntryWithConnection(
      {
        orgId: data.orgId,
        entryNumber: `FA-DISP-${data.disposedAt}-${String(nextSequence).padStart(3, "0")}`,
        entryDate: data.disposedAt,
        entryType: "auto_fixed_asset_disposal",
        postingKind: "fixed_asset_disposal",
        sourceEntityType: "fixed_assets",
        sourceEntityId: data.assetId,
        description: `Fixed asset disposal ${asset.assetCode}`,
        lines,
      },
      tx
    );

    const [updated] = await tx
      .update(fixedAssets)
      .set({
        disposedAt: data.disposedAt,
        disposalProceeds: money(proceedsCents),
        gainLossOnDisposal: money(gainLossCents),
      })
      .where(
        and(
          eq(fixedAssets.id, data.assetId),
          ...orgScope(fixedAssets, data.orgId)
        )
      )
      .returning();

    await tx.insert(auditLog).values({
      orgId: data.orgId,
      entityType: "fixed_asset",
      entityId: data.assetId,
      action: "update",
      oldValue: {
        disposedAt: asset.disposedAt,
        disposalProceeds: asset.disposalProceeds,
        gainLossOnDisposal: asset.gainLossOnDisposal,
      },
      newValue: {
        disposedAt: data.disposedAt,
        disposalProceeds: money(proceedsCents),
        accumulatedDepreciation: depreciation?.accumulated ?? "0.00",
        bookValueAtDisposal: money(bookValueCents),
        gainLossOnDisposal: money(gainLossCents),
        journalEntryId: journalEntry.id,
      },
    });

    return updated;
  });
}
