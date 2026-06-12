import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db, type DbConnection } from "@/lib/db/index";
import {
  auditLog,
  documents,
  fxValuationLayers,
  journalEntries,
  organizations,
  payments,
} from "@/lib/db/schema";
import {
  createJournalEntryWithConnection,
  getGlAccounts,
  seedStandardGlAccounts,
  type JournalEntryLineInput,
} from "@/lib/db/queries/general-ledger";
import { createOpenException } from "@/lib/db/queries/exception-queue";
import { getBotFxRateForValuationDate } from "@/lib/db/queries/fx-rates-bot";
import { isPeriodLocked } from "@/lib/db/queries/period-locks";
import { fromSatang, toSatangOrZero } from "@/lib/utils/money";

type MonetaryItemType = "ar_invoice" | "ap_invoice";

interface RevaluationCandidate {
  itemType: MonetaryItemType;
  itemId: string;
  originalCurrency: string;
  /** Integer satang of the original (foreign) currency. */
  originalAmountSatang: number;
  /** Integer satang THB. */
  priorThbAmountSatang: number;
  controlAccountCode: "1140" | "2110";
  isAsset: boolean;
}

interface RevaluationLayerInput {
  orgId: string;
  monetaryItemType: MonetaryItemType;
  monetaryItemId: string;
  originalAmount: string;
  originalCurrency: string;
  valuationDate: string;
  valuationRate: string;
  valuedThbAmount: string;
  priorValuationId?: string;
  journalEntryId?: string;
}

export function previousBangkokMonthEnd(referenceDate = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(referenceDate);
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);

  if (!Number.isInteger(year) || !Number.isInteger(month)) {
    throw new Error("Could not determine Bangkok FX valuation date");
  }

  return new Date(Date.UTC(year, month - 1, 0)).toISOString().slice(0, 10);
}

function uuidOrUndefined(value?: string) {
  if (!value) return undefined;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value
    : undefined;
}

async function getLatestPriorValuation(data: {
  orgId: string;
  itemType: MonetaryItemType;
  itemId: string;
  valuationDate: string;
}, tx: DbConnection = db) {
  const [row] = await tx
    .select()
    .from(fxValuationLayers)
    .where(
      and(
        eq(fxValuationLayers.orgId, data.orgId),
        eq(fxValuationLayers.monetaryItemType, data.itemType),
        eq(fxValuationLayers.monetaryItemId, data.itemId),
        sql`${fxValuationLayers.valuationDate} < ${data.valuationDate}::date`
      )
    )
    .orderBy(desc(fxValuationLayers.valuationDate), desc(fxValuationLayers.createdAt))
    .limit(1);
  return row ?? null;
}

async function getExistingValuation(data: {
  orgId: string;
  itemType: MonetaryItemType;
  itemId: string;
  valuationDate: string;
}, tx: DbConnection = db) {
  const [row] = await tx
    .select({ id: fxValuationLayers.id })
    .from(fxValuationLayers)
    .where(
      and(
        eq(fxValuationLayers.orgId, data.orgId),
        eq(fxValuationLayers.monetaryItemType, data.itemType),
        eq(fxValuationLayers.monetaryItemId, data.itemId),
        eq(fxValuationLayers.valuationDate, data.valuationDate)
      )
    )
    .limit(1);
  return row ?? null;
}

async function getDocumentCandidates(
  orgId: string,
  valuationDate: string,
  tx: DbConnection = db
): Promise<RevaluationCandidate[]> {
  const rows = await tx
    .select({
      id: documents.id,
      direction: documents.direction,
      currency: documents.currency,
      totalAmount: documents.totalAmount,
      totalAmountThb: documents.totalAmountThb,
      paidThb: sql<string>`COALESCE(SUM(${payments.grossAmount}), 0)::numeric(14,2)`,
    })
    .from(documents)
    .leftJoin(
      payments,
      and(
        eq(payments.documentId, documents.id),
        eq(payments.orgId, documents.orgId),
        isNull(payments.deletedAt),
        sql`${payments.paymentDate} <= ${valuationDate}::date`
      )
    )
    .where(
      and(
        eq(documents.orgId, orgId),
        isNull(documents.deletedAt),
        eq(documents.status, "confirmed"),
        sql`COALESCE(${documents.currency}, 'THB') <> 'THB'`,
        sql`${documents.totalAmount} > 0`,
        sql`${documents.totalAmountThb} > 0`
      )
    )
    .groupBy(
      documents.id,
      documents.direction,
      documents.currency,
      documents.totalAmount,
      documents.totalAmountThb
    );

  return rows.flatMap((row) => {
    const originalThbSatang = toSatangOrZero(row.totalAmountThb);
    const paidThbSatang = toSatangOrZero(row.paidThb);
    const openThbSatang = Math.max(originalThbSatang - paidThbSatang, 0);
    if (openThbSatang <= 0 || paidThbSatang > 0) return [];
    // Ratio, not money.
    const proportion = originalThbSatang === 0 ? 0 : openThbSatang / originalThbSatang;
    const originalAmountSatang = Math.round(
      toSatangOrZero(row.totalAmount) * proportion
    );
    if (originalAmountSatang <= 0) return [];
    if (row.direction !== "income" && row.direction !== "expense") return [];
    const isAsset = row.direction === "income";
    return [{
      itemType: isAsset ? "ar_invoice" : "ap_invoice",
      itemId: row.id,
      originalCurrency: (row.currency ?? "THB").toUpperCase(),
      originalAmountSatang,
      priorThbAmountSatang: openThbSatang,
      controlAccountCode: isAsset ? "1140" : "2110",
      isAsset,
    }];
  });
}

export async function runFxRevaluation(data: {
  orgId: string;
  valuationDate: string;
  createdByUserId?: string;
}) {
  const [year, month] = data.valuationDate.split("-").map(Number);
  if (!year || !month || await isPeriodLocked(data.orgId, "gl", year, month)) {
    throw new Error("GL period is locked for the valuation date");
  }
  await seedStandardGlAccounts(data.orgId);
  return db.transaction(async (tx) => {
    await tx.execute(sql`
      SELECT pg_advisory_xact_lock(hashtext(${`fx-revaluation:${data.orgId}:${data.valuationDate}`}))
    `);
    const [accounts, candidates] = await Promise.all([
      getGlAccounts(data.orgId, tx),
      getDocumentCandidates(data.orgId, data.valuationDate, tx),
    ]);
    const byCode = new Map(accounts.map((account) => [account.accountCode, account]));
    const fxGain = byCode.get("4330");
    const fxLoss = byCode.get("6870");
    if (!fxGain || !fxLoss) throw new Error("FX gain/loss accounts are not seeded");

    const layers: RevaluationLayerInput[] = [];
    const journalLines: JournalEntryLineInput[] = [];
    const skippedExisting: string[] = [];

    for (const candidate of candidates) {
      const existing = await getExistingValuation({
        orgId: data.orgId,
        itemType: candidate.itemType,
        itemId: candidate.itemId,
        valuationDate: data.valuationDate,
      }, tx);
      if (existing) {
        skippedExisting.push(candidate.itemId);
        continue;
      }

      const rate = await getBotFxRateForValuationDate({
        currency: candidate.originalCurrency,
        valuationDate: data.valuationDate,
      });
      if (!rate) {
        throw new Error(`Missing BOT FX rate for ${candidate.originalCurrency} on or before ${data.valuationDate}`);
      }

      const prior = await getLatestPriorValuation({
        orgId: data.orgId,
        itemType: candidate.itemType,
        itemId: candidate.itemId,
        valuationDate: data.valuationDate,
      }, tx);
      const priorThbAmountSatang = prior
        ? toSatangOrZero(prior.valuedThbAmount)
        : candidate.priorThbAmountSatang;
      // FX rate is a plain-number multiplier; round the product back to satang.
      const valuedThbAmountSatang = Math.round(
        candidate.originalAmountSatang * Number(rate.midRate)
      );
      const deltaSatang = valuedThbAmountSatang - priorThbAmountSatang;
      const controlAccount = byCode.get(candidate.controlAccountCode);
      if (!controlAccount) throw new Error(`Missing control account ${candidate.controlAccountCode}`);

      layers.push({
        orgId: data.orgId,
        monetaryItemType: candidate.itemType,
        monetaryItemId: candidate.itemId,
        originalAmount: fromSatang(candidate.originalAmountSatang),
        originalCurrency: candidate.originalCurrency,
        valuationDate: data.valuationDate,
        valuationRate: rate.midRate,
        valuedThbAmount: fromSatang(valuedThbAmountSatang),
        priorValuationId: prior?.id,
      });

      if (deltaSatang === 0) continue;
      const amount = fromSatang(Math.abs(deltaSatang));
      const controlLine = {
        accountId: controlAccount.id,
        description: `FX revaluation ${candidate.itemType} ${candidate.itemId}`,
        subledgerEntityType: candidate.itemType,
        subledgerEntityId: candidate.itemId,
      };
      if (candidate.isAsset) {
        journalLines.push(
          deltaSatang > 0
            ? { ...controlLine, debitAmount: amount }
            : { ...controlLine, creditAmount: amount },
          deltaSatang > 0
            ? { accountId: fxGain.id, creditAmount: amount, description: "Unrealized FX gain" }
            : { accountId: fxLoss.id, debitAmount: amount, description: "Unrealized FX loss" }
        );
      } else {
        journalLines.push(
          deltaSatang > 0
            ? { accountId: fxLoss.id, debitAmount: amount, description: "Unrealized FX loss" }
            : { accountId: fxGain.id, creditAmount: amount, description: "Unrealized FX gain" },
          deltaSatang > 0
            ? { ...controlLine, creditAmount: amount }
            : { ...controlLine, debitAmount: amount }
        );
      }
    }

    const [{ nextSequence }] = await tx
      .select({
        nextSequence: sql<number>`COUNT(*)::int + 1`,
      })
      .from(journalEntries)
      .where(
        and(
          eq(journalEntries.orgId, data.orgId),
          sql`${journalEntries.entryNumber} LIKE ${`FX-${data.valuationDate}-%`}`
        )
      );
    const entry = journalLines.length > 0
      ? await createJournalEntryWithConnection(
          {
            orgId: data.orgId,
            entryNumber: `FX-${data.valuationDate}-${String(nextSequence).padStart(3, "0")}`,
            entryDate: data.valuationDate,
            entryType: "auto_fx_revaluation",
            postingKind: "fx_revaluation",
            description: `FX revaluation ${data.valuationDate}`,
            createdByUserId: data.createdByUserId,
            lines: journalLines,
          },
          tx
        )
      : null;

    if (layers.length > 0) {
      await tx.insert(fxValuationLayers).values(
        layers.map((layer) => ({
          ...layer,
          journalEntryId: entry?.id,
        }))
      );
    }

    await tx.insert(auditLog).values({
      orgId: data.orgId,
      entityType: "fx_revaluation",
      entityId: entry?.id ?? data.orgId,
      action: "create",
      newValue: {
        valuationDate: data.valuationDate,
        candidateCount: candidates.length,
        layerCount: layers.length,
        journalEntryId: entry?.id ?? null,
        skippedExistingCount: skippedExisting.length,
      },
      actorId: uuidOrUndefined(data.createdByUserId),
    });

    return {
      valuationDate: data.valuationDate,
      candidateCount: candidates.length,
      layerCount: layers.length,
      journalEntryId: entry?.id ?? null,
      skippedExistingCount: skippedExisting.length,
    };
  });
}

export async function processMonthEndFxRevaluationForAllOrgs(data: {
  valuationDate?: string;
  createdByUserId?: string;
} = {}) {
  const valuationDate = data.valuationDate ?? previousBangkokMonthEnd();
  const orgs = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(sql`${organizations.deletedAt} IS NULL`)
    .orderBy(organizations.createdAt);

  const results = [];
  for (const org of orgs) {
    try {
      const result = await runFxRevaluation({
        orgId: org.id,
        valuationDate,
        createdByUserId: data.createdByUserId,
      });
      results.push({ orgId: org.id, status: "processed" as const, ...result });
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown error";
      await createOpenException({
        orgId: org.id,
        entityType: "fx_revaluation",
        entityId: org.id,
        exceptionType: "month_end_fx_revaluation_failed",
        severity: "p1",
        summary: `Month-end FX revaluation failed for ${valuationDate}: ${message}`,
        payload: {
          valuationDate,
          error: message,
        },
      });
      results.push({
        orgId: org.id,
        status: "failed" as const,
        error: message,
      });
    }
  }

  return {
    valuationDate,
    orgsProcessed: results.filter((result) => result.status === "processed").length,
    orgsFailed: results.filter((result) => result.status === "failed").length,
    results,
  };
}
