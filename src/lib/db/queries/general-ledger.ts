import { and, asc, desc, eq, gte, isNull, lte, sql } from "drizzle-orm";
import { db, type DbConnection } from "../index";
import {
  allocationRules,
  allocationRuleTargets,
  auditLog,
  citFilings,
  costCenters,
  cashDeposits,
  glAccounts,
  glOpeningBalances,
  importChargeLines,
  importDocuments,
  importPayments,
  journalEntries,
  journalLines,
  periodLocks,
  postingOutbox,
  processorSettlements,
  projects,
  salesTransactions,
  skus,
  taxPaymentEvents,
  transactions,
  vatFilingLines,
  vatFilings,
} from "../schema";
import { orgScopeAlive } from "../helpers/org-scope";
import { STANDARD_THAI_COA } from "@/lib/gl/coa-seed";
import { formatBangkokDate } from "@/lib/tax/filing-deadlines";

export async function seedStandardGlAccounts(
  orgId: string,
  tx: DbConnection = db
) {
  if (STANDARD_THAI_COA.length === 0) return [];

  return tx
    .insert(glAccounts)
    .values(STANDARD_THAI_COA.map((account) => ({ ...account, orgId })))
    .onConflictDoUpdate({
      target: [glAccounts.orgId, glAccounts.accountCode],
      set: {
        nameTh: sql`EXCLUDED.name_th`,
        nameEn: sql`EXCLUDED.name_en`,
        accountType: sql`EXCLUDED.account_type`,
        accountSubtype: sql`EXCLUDED.account_subtype`,
        isSystem: sql`EXCLUDED.is_system`,
        isAutomated: sql`EXCLUDED.is_automated`,
        isControlAccount: sql`EXCLUDED.is_control_account`,
        isClearing: sql`EXCLUDED.is_clearing`,
        taxTreatment: sql`EXCLUDED.tax_treatment`,
        vatRegisterRole: sql`EXCLUDED.vat_register_role`,
        whtRegisterRole: sql`EXCLUDED.wht_register_role`,
      },
      setWhere: sql`${glAccounts.orgId} = EXCLUDED.org_id`,
    })
    .returning();
}

export async function getGlAccounts(orgId: string, tx: DbConnection = db) {
  return tx
    .select()
    .from(glAccounts)
    .where(and(...orgScopeAlive(glAccounts, orgId), eq(glAccounts.isActive, true)))
    .orderBy(asc(glAccounts.accountCode));
}

export type JournalEntryLineInput = {
  accountId: string;
  description?: string;
  debitAmount?: string;
  creditAmount?: string;
  subledgerEntityType?: string;
  subledgerEntityId?: string;
  channelKey?: string;
  processorKey?: string;
  cashDepositKey?: string;
  costCenterId?: string;
  projectId?: string;
  allocationVendorId?: string | null;
  allocationCategory?: string | null;
};

export type PostingKind = NonNullable<
  typeof journalEntries.$inferInsert["postingKind"]
>;

async function lockGlPostingPeriodForJournalDate(
  tx: DbConnection,
  orgId: string,
  entryDate: string
) {
  const [periodYear, periodMonth] = entryDate.split("-").map(Number);
  if (!periodYear || !periodMonth) return;
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(hashtext(${`gl-posting-period:${orgId}:${periodYear}:${periodMonth}`}))`
  );
}

async function nextJournalEntryNumber(
  orgId: string,
  entryDate: string,
  tx: DbConnection
) {
  const year = Number(entryDate.slice(0, 4));
  const [{ count }] = await tx
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(journalEntries)
    .where(and(eq(journalEntries.orgId, orgId), eq(journalEntries.periodYear, year)));

  return `JE-${year}-${String(count + 1).padStart(4, "0")}`;
}

async function writeGlAuditLog(
  tx: DbConnection,
  data: {
    orgId: string;
    entryId: string;
    operation: string;
    createdByUserId?: string;
    details?: Record<string, unknown>;
  }
) {
  await tx.insert(auditLog).values({
    orgId: data.orgId,
    entityType: "journal_entry",
    entityId: data.entryId,
    action: "create",
    newValue: {
      operation: data.operation,
      createdByUserId: data.createdByUserId,
      ...(data.details ?? {}),
    },
  });
}

function splitAmountByPercentage(
  amount: string | undefined,
  percentages: string[]
) {
  const totalCents = parseMoneyCents(amount ?? "0", "Allocation amount");
  let allocatedCents = 0;
  return percentages.map((percentage, index) => {
    const cents =
      index === percentages.length - 1
        ? totalCents - allocatedCents
        : Math.round(totalCents * Number(percentage));
    allocatedCents += cents;
    return (cents / 100).toFixed(2);
  });
}

function toCents(value: string | number | null | undefined) {
  return Math.round(Number(value ?? 0) * 100);
}

function moneyFromCents(cents: number) {
  return (Math.abs(cents) / 100).toFixed(2);
}

function parseMoneyCents(value: string | null | undefined, label: string) {
  const raw = String(value ?? "0");
  if (!/^-?\d+(\.\d{1,2})?$/.test(raw)) {
    throw new Error(`${label} must be an amount with up to 2 decimals`);
  }
  const negative = raw.startsWith("-");
  const normalized = negative ? raw.slice(1) : raw;
  const [whole, fraction = ""] = normalized.split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return negative ? -cents : cents;
}

function formatCents(cents: number) {
  return `${Math.trunc(cents / 100)}.${String(Math.abs(cents % 100)).padStart(2, "0")}`;
}

function assertAllocationTargetsTotalOne(
  targets: Array<{ percentage: string }>
) {
  const total = targets.reduce((sum, target) => sum + Number(target.percentage), 0);
  if (Math.abs(total - 1) > 0.0001) {
    throw new Error("Active allocation rule targets must total 1.0000");
  }
}

function normalizeAllocationKey(value: string | null | undefined) {
  const normalized = value?.trim().toLowerCase();
  return normalized || null;
}

async function findMatchingAllocationRule(
  tx: DbConnection,
  data: {
    orgId: string;
    entryDate: string;
    line: JournalEntryLineInput;
  }
) {
  const candidates: Array<{
    sourceType: "vendor" | "category" | "gl_account";
    sourceId?: string;
    sourceKey?: string;
  }> = [];
  if (data.line.allocationVendorId) {
    candidates.push({ sourceType: "vendor", sourceId: data.line.allocationVendorId });
  }
  const categoryKey = normalizeAllocationKey(data.line.allocationCategory);
  if (categoryKey) {
    candidates.push({ sourceType: "category", sourceKey: categoryKey });
  }
  candidates.push({ sourceType: "gl_account", sourceId: data.line.accountId });

  for (const candidate of candidates) {
    const [rule] = await tx
      .select({
        ruleId: allocationRules.id,
        ruleName: allocationRules.ruleName,
      })
      .from(allocationRules)
      .where(
        and(
          eq(allocationRules.orgId, data.orgId),
          eq(allocationRules.isActive, true),
          eq(allocationRules.sourceType, candidate.sourceType),
          candidate.sourceKey
            ? eq(allocationRules.sourceKey, candidate.sourceKey)
            : eq(allocationRules.sourceId, candidate.sourceId ?? data.line.accountId),
          sql`${allocationRules.deletedAt} IS NULL`,
          sql`(${allocationRules.effectiveFrom} IS NULL OR ${allocationRules.effectiveFrom} <= ${data.entryDate}::date)`,
          sql`(${allocationRules.effectiveTo} IS NULL OR ${allocationRules.effectiveTo} >= ${data.entryDate}::date)`
        )
      )
      .orderBy(
        desc(sql`COALESCE(${allocationRules.effectiveFrom}, '0001-01-01'::date)`),
        desc(allocationRules.createdAt)
      )
      .limit(1);
    if (rule) return rule;
  }

  return null;
}

async function applyAllocationRules(
  tx: DbConnection,
  data: {
    orgId: string;
    entryDate: string;
    lines: JournalEntryLineInput[];
  }
) {
  const expanded: JournalEntryLineInput[] = [];

  for (const line of data.lines) {
    if (line.costCenterId || line.projectId) {
      expanded.push(line);
      continue;
    }

    const rule = await findMatchingAllocationRule(tx, {
      orgId: data.orgId,
      entryDate: data.entryDate,
      line,
    });

    if (!rule) {
      expanded.push(line);
      continue;
    }

    const matchingTargets = await tx
      .select({
        percentage: allocationRuleTargets.percentage,
        costCenterId: allocationRuleTargets.costCenterId,
        projectId: allocationRuleTargets.projectId,
      })
      .from(allocationRuleTargets)
      .leftJoin(
        costCenters,
        and(
          eq(costCenters.id, allocationRuleTargets.costCenterId),
          eq(costCenters.orgId, allocationRuleTargets.orgId),
          sql`${costCenters.deletedAt} IS NULL`
        )
      )
      .leftJoin(
        projects,
        and(
          eq(projects.id, allocationRuleTargets.projectId),
          eq(projects.orgId, allocationRuleTargets.orgId),
          sql`${projects.deletedAt} IS NULL`
        )
      )
      .where(
        and(
          eq(allocationRuleTargets.orgId, data.orgId),
          eq(allocationRuleTargets.allocationRuleId, rule.ruleId),
          sql`${allocationRuleTargets.deletedAt} IS NULL`,
          sql`(${allocationRuleTargets.costCenterId} IS NULL OR ${costCenters.id} IS NOT NULL)`,
          sql`(${allocationRuleTargets.projectId} IS NULL OR ${projects.id} IS NOT NULL)`
        )
      )
      .orderBy(asc(allocationRuleTargets.createdAt));
    assertAllocationTargetsTotalOne(matchingTargets);

    const debitSplits = splitAmountByPercentage(
      line.debitAmount,
      matchingTargets.map((target) => target.percentage)
    );
    const creditSplits = splitAmountByPercentage(
      line.creditAmount,
      matchingTargets.map((target) => target.percentage)
    );

    matchingTargets.forEach((target, index) => {
      if (debitSplits[index] === "0.00" && creditSplits[index] === "0.00") {
        return;
      }
      expanded.push({
        ...line,
        debitAmount: debitSplits[index],
        creditAmount: creditSplits[index],
        costCenterId: target.costCenterId ?? undefined,
        projectId: target.projectId ?? undefined,
        description: [
          line.description,
          `Allocated by ${rule.ruleName} (${(Number(target.percentage) * 100).toFixed(2)}%)`,
        ].filter(Boolean).join(" - "),
      });
    });
  }

  return expanded;
}

async function insertJournalEntry(
  tx: DbConnection,
  data: {
    orgId: string;
    entryNumber: string;
    entryDate: string;
    postingDate?: string;
    entryType: typeof journalEntries.$inferInsert["entryType"];
    description: string;
    sourceEntityType?: string;
    sourceEntityId?: string;
    postingKind?: PostingKind;
    createdByUserId?: string;
    isReversal?: boolean;
    reversesEntryId?: string;
    notes?: string;
    lines: JournalEntryLineInput[];
  }
) {
  const shouldSkipAllocation = data.isReversal || data.entryType === "opening_balance";
  const allocatedLines = shouldSkipAllocation
    ? data.lines
    : await applyAllocationRules(tx, {
        orgId: data.orgId,
        entryDate: data.entryDate,
        lines: data.lines,
      });
  const totalDebit = allocatedLines.reduce(
    (sum, line) => sum + Number(line.debitAmount ?? "0"),
    0
  );
  const totalCredit = allocatedLines.reduce(
    (sum, line) => sum + Number(line.creditAmount ?? "0"),
    0
  );
  const [periodYear, periodMonth] = data.entryDate.split("-").map(Number);
  await lockGlPostingPeriodForJournalDate(tx, data.orgId, data.entryDate);
  const [lockedPeriod] = await tx
    .select({ id: periodLocks.id })
    .from(periodLocks)
    .where(
      and(
        ...orgScopeAlive(periodLocks, data.orgId),
        eq(periodLocks.domain, "gl"),
        eq(periodLocks.periodYear, periodYear),
        eq(periodLocks.periodMonth, periodMonth),
        sql`${periodLocks.unlockedAt} IS NULL`
      )
    )
    .limit(1);
  if (lockedPeriod) {
    throw new Error(`GL period is locked: ${periodYear}-${String(periodMonth).padStart(2, "0")}`);
  }

  const [entry] = await tx
    .insert(journalEntries)
    .values({
      orgId: data.orgId,
      entryNumber: data.entryNumber,
      entryDate: data.entryDate,
      postingDate: data.postingDate ?? data.entryDate,
      periodYear,
      periodMonth,
      entryType: data.entryType,
      description: data.description,
      sourceEntityType: data.sourceEntityType,
      sourceEntityId: data.sourceEntityId,
      postingKind: data.postingKind,
      createdByUserId: data.createdByUserId,
      isReversal: data.isReversal,
      reversesEntryId: data.reversesEntryId,
      notes: data.notes,
      totalDebit: totalDebit.toFixed(2),
      totalCredit: totalCredit.toFixed(2),
    })
    .returning();

  await tx.insert(journalLines).values(
    allocatedLines.map((line, index) => ({
      orgId: data.orgId,
      journalEntryId: entry.id,
      lineNumber: index + 1,
      accountId: line.accountId,
      description: line.description,
      debitAmount: line.debitAmount ?? "0",
      creditAmount: line.creditAmount ?? "0",
      subledgerEntityType: line.subledgerEntityType,
      subledgerEntityId: line.subledgerEntityId,
      channelKey: line.channelKey,
      processorKey: line.processorKey,
      cashDepositKey: line.cashDepositKey,
      costCenterId: line.costCenterId,
      projectId: line.projectId,
    }))
  );

  return entry;
}

export async function createJournalEntryWithConnection(
  data: {
    orgId: string;
    entryNumber: string;
    entryDate: string;
    postingDate?: string;
    entryType: typeof journalEntries.$inferInsert["entryType"];
    description: string;
    sourceEntityType?: string;
    sourceEntityId?: string;
    postingKind?: PostingKind;
    createdByUserId?: string;
    isReversal?: boolean;
    reversesEntryId?: string;
    notes?: string;
    lines: JournalEntryLineInput[];
  },
  tx: DbConnection
) {
  if (data.lines.length < 2) {
    throw new Error("Journal entry requires at least two lines");
  }

  const totalDebit = data.lines.reduce(
    (sum, line) => sum + Number(line.debitAmount ?? "0"),
    0
  );
  const totalCredit = data.lines.reduce(
    (sum, line) => sum + Number(line.creditAmount ?? "0"),
    0
  );

  if (totalDebit.toFixed(2) !== totalCredit.toFixed(2)) {
    throw new Error("Journal entry must balance before posting");
  }

  return insertJournalEntry(tx, data);
}

export async function createJournalEntry(data: {
  orgId: string;
  entryNumber: string;
  entryDate: string;
  postingDate?: string;
  entryType: typeof journalEntries.$inferInsert["entryType"];
  description: string;
  sourceEntityType?: string;
  sourceEntityId?: string;
  postingKind?: PostingKind;
  createdByUserId?: string;
  isReversal?: boolean;
  reversesEntryId?: string;
  notes?: string;
  lines: JournalEntryLineInput[];
}) {
  return db.transaction((tx) => createJournalEntryWithConnection(data, tx as DbConnection));
}

export async function postOpeningBalancePair(data: {
  orgId: string;
  asOfDate: string;
  debitAccountId: string;
  creditAccountId: string;
  amount: string;
  enteredByUserId?: string;
  notes?: string;
}) {
  const amount = Number(data.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Opening balance amount must be positive");
  }

  return db.transaction(async (tx) => {
    const [debitAccount] = await tx
      .select()
      .from(glAccounts)
      .where(
        and(
          ...orgScopeAlive(glAccounts, data.orgId),
          eq(glAccounts.id, data.debitAccountId)
        )
      )
      .limit(1);
    const [creditAccount] = await tx
      .select()
      .from(glAccounts)
      .where(
        and(
          ...orgScopeAlive(glAccounts, data.orgId),
          eq(glAccounts.id, data.creditAccountId)
        )
      )
      .limit(1);

    if (!debitAccount || !creditAccount) {
      throw new Error("Opening balance accounts must belong to this organization");
    }

    const [{ existingCount }] = await tx
      .select({ existingCount: sql<number>`COUNT(*)::int` })
      .from(glOpeningBalances)
      .where(sql`
        ${glOpeningBalances.orgId} = ${data.orgId}
        AND ${glOpeningBalances.asOfDate} = ${data.asOfDate}
        AND ${glOpeningBalances.accountId} IN (${data.debitAccountId}, ${data.creditAccountId})
      `);
    if (existingCount > 0) {
      throw new Error("Opening balance already exists for one of these accounts on this date");
    }

    await tx.insert(glOpeningBalances).values([
      {
        orgId: data.orgId,
        asOfDate: data.asOfDate,
        accountId: data.debitAccountId,
        debitAmount: amount.toFixed(2),
        creditAmount: "0.00",
        enteredByUserId: data.enteredByUserId,
        notes: data.notes,
      },
      {
        orgId: data.orgId,
        asOfDate: data.asOfDate,
        accountId: data.creditAccountId,
        debitAmount: "0.00",
        creditAmount: amount.toFixed(2),
        enteredByUserId: data.enteredByUserId,
        notes: data.notes,
      },
    ]);

    const entry = await insertJournalEntry(tx, {
      orgId: data.orgId,
      entryNumber: await nextJournalEntryNumber(data.orgId, data.asOfDate, tx),
      entryDate: data.asOfDate,
      postingDate: data.asOfDate,
      entryType: "opening_balance",
      postingKind: "opening_balance_pair",
      description: "Opening balance pair",
      createdByUserId: data.enteredByUserId,
      notes: data.notes,
      lines: [
        {
          accountId: data.debitAccountId,
          debitAmount: amount.toFixed(2),
          description: "Opening balance debit",
        },
        {
          accountId: data.creditAccountId,
          creditAmount: amount.toFixed(2),
          description: "Opening balance credit",
        },
      ],
    });

    await writeGlAuditLog(tx, {
      orgId: data.orgId,
      entryId: entry.id,
      operation: "post_opening_balance_pair",
      createdByUserId: data.enteredByUserId,
      details: {
        asOfDate: data.asOfDate,
        debitAccountId: data.debitAccountId,
        creditAccountId: data.creditAccountId,
        amount: amount.toFixed(2),
      },
    });

    return entry;
  });
}

export async function createManualJournalPair(data: {
  orgId: string;
  entryDate: string;
  debitAccountId: string;
  creditAccountId: string;
  amount: string;
  description: string;
  createdByUserId?: string;
  notes?: string;
}) {
  const amount = Number(data.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Journal amount must be positive");
  }
  if (data.debitAccountId === data.creditAccountId) {
    throw new Error("Debit and credit accounts must be different");
  }

  return db.transaction(async (tx) => {
    const [debitAccount] = await tx
      .select()
      .from(glAccounts)
      .where(
        and(
          ...orgScopeAlive(glAccounts, data.orgId),
          eq(glAccounts.id, data.debitAccountId)
        )
      )
      .limit(1);
    const [creditAccount] = await tx
      .select()
      .from(glAccounts)
      .where(
        and(
          ...orgScopeAlive(glAccounts, data.orgId),
          eq(glAccounts.id, data.creditAccountId)
        )
      )
      .limit(1);

    if (!debitAccount || !creditAccount) {
      throw new Error("Journal accounts must belong to this organization");
    }

    const entry = await insertJournalEntry(tx, {
      orgId: data.orgId,
      entryNumber: await nextJournalEntryNumber(data.orgId, data.entryDate, tx),
      entryDate: data.entryDate,
      postingDate: data.entryDate,
      entryType: "manual",
      postingKind: "manual_pair",
      description: data.description,
      createdByUserId: data.createdByUserId,
      notes: data.notes,
      lines: [
        {
          accountId: data.debitAccountId,
          debitAmount: amount.toFixed(2),
          description: data.description,
        },
        {
          accountId: data.creditAccountId,
          creditAmount: amount.toFixed(2),
          description: data.description,
        },
      ],
    });
    await writeGlAuditLog(tx, {
      orgId: data.orgId,
      entryId: entry.id,
      operation: "post_manual_journal_pair",
      createdByUserId: data.createdByUserId,
      details: {
        entryDate: data.entryDate,
        debitAccountId: data.debitAccountId,
        creditAccountId: data.creditAccountId,
        amount: amount.toFixed(2),
      },
    });
    return entry;
  });
}

export async function reverseJournalEntryInTx(
  tx: DbConnection,
  data: {
    orgId: string;
    journalEntryId: string;
    reversalDate: string;
    createdByUserId?: string;
    notes?: string;
    clearSubledgerRefs?: boolean;
  }
) {
  const [original] = await tx
    .select()
    .from(journalEntries)
    .where(
      and(
        ...orgScopeAlive(journalEntries, data.orgId),
        eq(journalEntries.id, data.journalEntryId)
      )
    )
    .for("update")
    .limit(1);
  if (!original) {
    throw new Error("Journal entry not found");
  }
  if (original.isReversal) {
    throw new Error("Reversal entries cannot be reversed in this workflow");
  }
  if (original.reversedByEntryId) {
    throw new Error("Journal entry is already reversed");
  }

  const originalLines = await tx
    .select()
    .from(journalLines)
    .where(
      and(
        eq(journalLines.orgId, data.orgId),
        eq(journalLines.journalEntryId, original.id)
      )
    )
    .orderBy(asc(journalLines.lineNumber));
  if (originalLines.length < 2) {
    throw new Error("Journal entry has no reversible lines");
  }

  const reversal = await insertJournalEntry(tx, {
    orgId: data.orgId,
    entryNumber: await nextJournalEntryNumber(data.orgId, data.reversalDate, tx),
    entryDate: data.reversalDate,
    postingDate: data.reversalDate,
    entryType: "manual",
    postingKind: "manual_reversal",
    description: `Reverse ${original.entryNumber}`,
    createdByUserId: data.createdByUserId,
    isReversal: true,
    reversesEntryId: original.id,
    notes: data.notes,
    lines: originalLines.map((line) => ({
      accountId: line.accountId,
      description: `Reverse line ${line.lineNumber}`,
      debitAmount: line.creditAmount === "0.00" ? "0.00" : line.creditAmount,
      creditAmount: line.debitAmount === "0.00" ? "0.00" : line.debitAmount,
      subledgerEntityType: data.clearSubledgerRefs
        ? undefined
        : line.subledgerEntityType ?? undefined,
      subledgerEntityId: data.clearSubledgerRefs
        ? undefined
        : line.subledgerEntityId ?? undefined,
      channelKey: line.channelKey ?? undefined,
      processorKey: line.processorKey ?? undefined,
      cashDepositKey: line.cashDepositKey ?? undefined,
      costCenterId: line.costCenterId ?? undefined,
      projectId: line.projectId ?? undefined,
    })),
  });

  await tx
    .update(journalEntries)
    .set({ reversedByEntryId: reversal.id })
    .where(
      and(
        eq(journalEntries.orgId, data.orgId),
        eq(journalEntries.id, original.id)
      )
    );

  await writeGlAuditLog(tx, {
    orgId: data.orgId,
    entryId: reversal.id,
    operation: "reverse_journal_entry",
    createdByUserId: data.createdByUserId,
    details: {
      reversedEntryId: original.id,
      reversedEntryNumber: original.entryNumber,
      reversalDate: data.reversalDate,
    },
  });

  return reversal;
}

export async function reverseJournalEntry(data: {
  orgId: string;
  journalEntryId: string;
  reversalDate: string;
  createdByUserId?: string;
  notes?: string;
}) {
  return db.transaction((tx) => reverseJournalEntryInTx(tx as DbConnection, data));
}

async function accountByCode(tx: DbConnection, orgId: string, accountCode: string) {
  const [account] = await tx
    .select()
    .from(glAccounts)
    .where(
      and(
        ...orgScopeAlive(glAccounts, orgId),
        eq(glAccounts.accountCode, accountCode)
      )
    )
    .limit(1);
  if (!account) {
    throw new Error(`GL account ${accountCode} is not configured`);
  }
  return account;
}

function periodEndDateString(periodYear: number, periodMonth: number) {
  const lastDay = new Date(Date.UTC(periodYear, periodMonth, 0)).getUTCDate();
  return `${periodYear}-${String(periodMonth).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
}

export async function postPosSaleJournalEntry(data: {
  tx: DbConnection;
  orgId: string;
  posSaleId: string;
  soldDate: string;
  amountIncludingVat: string;
  taxBaseExVat: string;
  vatAmount: string;
  channel: string;
  clearingAccountKey: string;
}) {
  await seedStandardGlAccounts(data.orgId, data.tx);
  const [existing] = await data.tx
    .select()
    .from(journalEntries)
    .where(
      and(
        eq(journalEntries.orgId, data.orgId),
        eq(journalEntries.sourceEntityType, "sales_transactions"),
        eq(journalEntries.sourceEntityId, data.posSaleId),
        eq(journalEntries.postingKind, "pos_primary_sale")
      )
    )
    .limit(1);
  if (existing) return existing;

  const clearing = await accountByCode(data.tx, data.orgId, "1142");
  const revenue = await accountByCode(data.tx, data.orgId, "4110");
  const outputVat = await accountByCode(data.tx, data.orgId, "2150");

  const entry = await insertJournalEntry(data.tx, {
    orgId: data.orgId,
    entryNumber: await nextJournalEntryNumber(data.orgId, data.soldDate, data.tx),
    entryDate: data.soldDate,
    postingDate: data.soldDate,
    entryType: "auto_sales",
    postingKind: "pos_primary_sale",
    sourceEntityType: "sales_transactions",
    sourceEntityId: data.posSaleId,
    description: "POS primary sale",
    lines: [
      {
        accountId: clearing.id,
        debitAmount: data.amountIncludingVat,
        description: "POS gross receivable",
        channelKey: data.channel,
        processorKey: data.clearingAccountKey,
      },
      {
        accountId: revenue.id,
        creditAmount: data.taxBaseExVat,
        description: "POS revenue",
        channelKey: data.channel,
      },
      {
        accountId: outputVat.id,
        creditAmount: data.vatAmount,
        description: "POS output VAT",
        channelKey: data.channel,
      },
    ],
  });

  await writeGlAuditLog(data.tx, {
    orgId: data.orgId,
    entryId: entry.id,
    operation: "post_pos_sale_journal_entry",
    details: {
      posSaleId: data.posSaleId,
      soldDate: data.soldDate,
      amountIncludingVat: data.amountIncludingVat,
      taxBaseExVat: data.taxBaseExVat,
      vatAmount: data.vatAmount,
      channel: data.channel,
    },
  });

  return entry;
}

export async function postPosSaleTransactionJournalEntry(data: {
  tx: DbConnection;
  orgId: string;
  posSaleId: string;
}) {
  const [sale] = await data.tx
    .select()
    .from(salesTransactions)
    .where(
      and(
        eq(salesTransactions.orgId, data.orgId),
        eq(salesTransactions.id, data.posSaleId),
        eq(salesTransactions.eventRole, "pos_primary")
      )
    )
    .limit(1);
  if (!sale) throw new Error("POS sale not found");

  return postPosSaleJournalEntry({
    tx: data.tx,
    orgId: data.orgId,
    posSaleId: sale.id,
    soldDate: formatBangkokDate(sale.soldAt),
    amountIncludingVat: sale.amountIncludingVat,
    taxBaseExVat: sale.taxBaseExVat,
    vatAmount: sale.vatAmount,
    channel: sale.channel,
    clearingAccountKey: sale.clearingAccountKey,
  });
}

export async function postProcessorSettlementJournalEntry(data: {
  tx: DbConnection;
  orgId: string;
  processorSettlementId: string;
}) {
  await seedStandardGlAccounts(data.orgId, data.tx);
  const [existing] = await data.tx
    .select()
    .from(journalEntries)
    .where(
      and(
        eq(journalEntries.orgId, data.orgId),
        eq(journalEntries.sourceEntityType, "processor_settlements"),
        eq(journalEntries.sourceEntityId, data.processorSettlementId),
        eq(journalEntries.postingKind, "processor_settlement")
      )
    )
    .limit(1);
  if (existing) return existing;

  const [settlement] = await data.tx
    .select()
    .from(processorSettlements)
    .where(
      and(
        eq(processorSettlements.orgId, data.orgId),
        eq(processorSettlements.id, data.processorSettlementId)
      )
    )
    .limit(1);
  if (!settlement) throw new Error("Processor settlement not found");

  const grossCents = parseMoneyCents(settlement.grossAmount, "Gross amount");
  const feeCents = parseMoneyCents(settlement.feeAmount, "Fee amount");
  const feeVatCents = parseMoneyCents(settlement.feeVatAmount, "Fee VAT amount");
  const netCents = parseMoneyCents(settlement.netPayout, "Net payout");
  if (grossCents <= 0 || netCents <= 0 || feeCents < 0 || feeVatCents < 0) {
    throw new Error("Processor settlement amounts must be non-negative and gross/net positive");
  }
  if (netCents + feeCents + feeVatCents !== grossCents) {
    throw new Error("Processor settlement gross must equal net payout plus fee and fee VAT");
  }

  const bank = await accountByCode(data.tx, data.orgId, "1111");
  const clearing = await accountByCode(data.tx, data.orgId, "1142");
  const fees = await accountByCode(data.tx, data.orgId, "6411");
  const inputVat = feeVatCents > 0
    ? await accountByCode(data.tx, data.orgId, "1251")
    : null;
  if (!settlement.periodEnd) {
    throw new Error("Processor settlement requires period end before GL posting");
  }
  const entryDate = formatBangkokDate(settlement.periodEnd);
  const lines: JournalEntryLineInput[] = [
    {
      accountId: bank.id,
      debitAmount: settlement.netPayout,
      description: "Processor net payout to bank",
      processorKey: settlement.processor,
    },
  ];
  if (feeCents > 0) {
    lines.push({
      accountId: fees.id,
      debitAmount: settlement.feeAmount,
      description: "Processor fee",
      processorKey: settlement.processor,
    });
  }
  if (inputVat && feeVatCents > 0) {
    lines.push({
      accountId: inputVat.id,
      debitAmount: formatCents(feeVatCents),
      description: "Processor fee input VAT",
      processorKey: settlement.processor,
    });
  }
  lines.push({
    accountId: clearing.id,
    creditAmount: settlement.grossAmount,
    description: "Clear processor settlement receivable",
    processorKey: settlement.processor,
  });

  const entry = await insertJournalEntry(data.tx, {
    orgId: data.orgId,
    entryNumber: await nextJournalEntryNumber(data.orgId, entryDate, data.tx),
    entryDate,
    postingDate: entryDate,
    entryType: "auto_payment",
    postingKind: "processor_settlement",
    sourceEntityType: "processor_settlements",
    sourceEntityId: settlement.id,
    description: `Processor settlement ${settlement.processor} ${settlement.externalId}`,
    lines,
  });

  await writeGlAuditLog(data.tx, {
    orgId: data.orgId,
    entryId: entry.id,
    operation: "post_processor_settlement_journal_entry",
    details: {
      processorSettlementId: settlement.id,
      processor: settlement.processor,
      grossAmount: settlement.grossAmount,
      netPayout: settlement.netPayout,
      feeAmount: settlement.feeAmount,
      feeVatAmount: settlement.feeVatAmount,
    },
  });

  return entry;
}

export async function postCashDepositJournalEntry(data: {
  tx: DbConnection;
  orgId: string;
  cashDepositId: string;
}) {
  await seedStandardGlAccounts(data.orgId, data.tx);
  const [existing] = await data.tx
    .select()
    .from(journalEntries)
    .where(
      and(
        eq(journalEntries.orgId, data.orgId),
        eq(journalEntries.sourceEntityType, "cash_deposits"),
        eq(journalEntries.sourceEntityId, data.cashDepositId),
        eq(journalEntries.postingKind, "cash_deposit")
      )
    )
    .limit(1);
  if (existing) return existing;

  const [deposit] = await data.tx
    .select()
    .from(cashDeposits)
    .where(
      and(
        eq(cashDeposits.orgId, data.orgId),
        eq(cashDeposits.id, data.cashDepositId)
      )
    )
    .limit(1);
  if (!deposit) throw new Error("Cash deposit not found");
  if (parseMoneyCents(deposit.amount, "Cash deposit amount") <= 0) {
    throw new Error("Cash deposit amount must be positive");
  }

  const bank = await accountByCode(data.tx, data.orgId, "1111");
  const clearing = await accountByCode(data.tx, data.orgId, "1142");
  const entry = await insertJournalEntry(data.tx, {
    orgId: data.orgId,
    entryNumber: await nextJournalEntryNumber(data.orgId, deposit.depositedAt, data.tx),
    entryDate: deposit.depositedAt,
    postingDate: deposit.depositedAt,
    entryType: "auto_payment",
    postingKind: "cash_deposit",
    sourceEntityType: "cash_deposits",
    sourceEntityId: deposit.id,
    description: `Cash deposit ${deposit.slipReference ?? deposit.id}`,
    lines: [
      {
        accountId: bank.id,
        debitAmount: deposit.amount,
        description: "Cash deposit to bank",
        cashDepositKey: deposit.slipReference ?? deposit.id,
      },
      {
        accountId: clearing.id,
        creditAmount: deposit.amount,
        description: "Clear POS cash receivable",
        cashDepositKey: deposit.slipReference ?? deposit.id,
      },
    ],
  });

  await writeGlAuditLog(data.tx, {
    orgId: data.orgId,
    entryId: entry.id,
    operation: "post_cash_deposit_journal_entry",
    details: {
      cashDepositId: deposit.id,
      depositedAt: deposit.depositedAt,
      amount: deposit.amount,
      slipReference: deposit.slipReference,
    },
  });

  return entry;
}

async function accountById(tx: DbConnection, orgId: string, accountId: string) {
  const [account] = await tx
    .select()
    .from(glAccounts)
    .where(and(...orgScopeAlive(glAccounts, orgId), eq(glAccounts.id, accountId)))
    .limit(1);
  if (!account) throw new Error("GL account is not configured for this organization");
  return account;
}

export async function postImportBrokerChargeJournalEntries(data: {
  tx: DbConnection;
  orgId: string;
  importId: string;
  entryDate: string;
}) {
  await seedStandardGlAccounts(data.orgId, data.tx);
  const documents = await data.tx
    .select({ sourceDocumentId: importChargeLines.sourceDocumentId })
    .from(importChargeLines)
    .where(
      and(
        eq(importChargeLines.orgId, data.orgId),
        eq(importChargeLines.importId, data.importId)
      )
    )
    .groupBy(importChargeLines.sourceDocumentId)
    .orderBy(asc(importChargeLines.sourceDocumentId));

  const entries: Array<typeof journalEntries.$inferSelect> = [];
  for (const document of documents) {
    const entry = await postImportBrokerChargeDocumentJournalEntry({
      tx: data.tx,
      orgId: data.orgId,
      importId: data.importId,
      sourceDocumentId: document.sourceDocumentId,
      entryDate: data.entryDate,
    });
    if (entry) entries.push(entry);
  }

  return entries;
}

export async function postImportBrokerChargeDocumentJournalEntry(data: {
  tx: DbConnection;
  orgId: string;
  importId: string;
  sourceDocumentId: string;
  entryDate: string;
}) {
  await seedStandardGlAccounts(data.orgId, data.tx);
  const lines = await data.tx
    .select()
    .from(importChargeLines)
    .where(
      and(
        eq(importChargeLines.orgId, data.orgId),
        eq(importChargeLines.importId, data.importId),
        eq(importChargeLines.sourceDocumentId, data.sourceDocumentId)
      )
    )
    .orderBy(
      asc(importChargeLines.createdAt),
      asc(importChargeLines.id)
    );
  if (lines.length === 0) return null;

  const ap = await accountByCode(data.tx, data.orgId, "2110");
  const otherCurrentLiability = await accountByCode(data.tx, data.orgId, "2190");
  const inputVat = await accountByCode(data.tx, data.orgId, "1251");
  const duty = await accountByCode(data.tx, data.orgId, "5150");
  const importOverhead = await accountByCode(data.tx, data.orgId, "5160");
  const [existing] = await data.tx
    .select()
    .from(journalEntries)
    .where(
      and(
        eq(journalEntries.orgId, data.orgId),
        eq(journalEntries.sourceEntityType, "import_charge_documents"),
        eq(journalEntries.sourceEntityId, data.sourceDocumentId),
        eq(journalEntries.postingKind, "import_broker_invoice")
      )
    )
    .limit(1);
  if (existing) return existing;
  const [sourceDocument] = await data.tx
    .select({ documentRole: importDocuments.documentRole })
    .from(importDocuments)
    .where(
      and(
        eq(importDocuments.orgId, data.orgId),
        eq(importDocuments.importId, data.importId),
        eq(importDocuments.documentId, data.sourceDocumentId)
      )
    )
    .limit(1);
  const creditAccount =
    sourceDocument?.documentRole === "customs_declaration"
      ? otherCurrentLiability
      : ap;

  const journalLines: JournalEntryLineInput[] = [];
  let creditCents = 0;
  for (const line of lines) {
    const amountCents = parseMoneyCents(line.amountThb, "Import charge amount");
    const vatCents = parseMoneyCents(line.vatAmountThb, "Import charge VAT");
    if (amountCents < 0 || vatCents < 0) {
      throw new Error("Import charge amounts must be non-negative");
    }
    if (line.vatTreatment === "is_import_vat") {
      if (amountCents > 0) {
        journalLines.push({
          accountId: inputVat.id,
          debitAmount: formatCents(amountCents),
          description: line.lineDescription,
          subledgerEntityType: "import_charge_lines",
          subledgerEntityId: line.id,
        });
      }
      creditCents += amountCents;
      continue;
    }

    const expenseAccount = line.expenseAccountId
      ? await accountById(data.tx, data.orgId, line.expenseAccountId)
      : line.vatTreatment === "is_pass_through" ||
          line.vatTreatment === "excise_pass_through"
        ? duty
        : importOverhead;
    if (amountCents > 0) {
      journalLines.push({
        accountId: expenseAccount.id,
        debitAmount: formatCents(amountCents),
        description: line.lineDescription,
        subledgerEntityType: "import_charge_lines",
        subledgerEntityId: line.id,
      });
    }
    if (line.vatTreatment === "service_with_vat_pct" && vatCents > 0) {
      journalLines.push({
        accountId: inputVat.id,
        debitAmount: formatCents(vatCents),
        description: `${line.lineDescription} input VAT`,
        subledgerEntityType: "import_charge_lines",
        subledgerEntityId: line.id,
      });
      creditCents += vatCents;
    }
    creditCents += amountCents;
  }

  if (creditCents <= 0) return null;
  journalLines.push({
    accountId: creditAccount.id,
    creditAmount: formatCents(creditCents),
    description:
      sourceDocument?.documentRole === "customs_declaration"
        ? "Import customs declaration clearing"
        : "Import broker invoice payable",
    subledgerEntityType: "documents",
    subledgerEntityId: data.sourceDocumentId,
  });

  const entry = await insertJournalEntry(data.tx, {
    orgId: data.orgId,
    entryNumber: await nextJournalEntryNumber(data.orgId, data.entryDate, data.tx),
    entryDate: data.entryDate,
    postingDate: data.entryDate,
    entryType: "auto_document",
    postingKind: "import_broker_invoice",
    sourceEntityType: "import_charge_documents",
    sourceEntityId: data.sourceDocumentId,
    description: `Import broker invoice for import ${data.importId}`,
    lines: journalLines,
  });
  await writeGlAuditLog(data.tx, {
    orgId: data.orgId,
    entryId: entry.id,
    operation: "post_import_broker_charge_journal_entry",
    details: {
      importId: data.importId,
      sourceDocumentId: data.sourceDocumentId,
      lineCount: lines.length,
    },
  });
  return entry;
}

export async function postImportPaymentJournalEntry(data: {
  tx: DbConnection;
  orgId: string;
  paymentId: string;
}) {
  await seedStandardGlAccounts(data.orgId, data.tx);
  const [payment] = await data.tx
    .select({
      id: importPayments.id,
      importId: importPayments.importId,
      bankTransactionId: importPayments.bankTransactionId,
      paymentRole: importPayments.paymentRole,
      amountThb: importPayments.amountThb,
      transactionDate: transactions.date,
      transactionAmount: transactions.amount,
      transactionType: transactions.type,
    })
    .from(importPayments)
    .innerJoin(transactions, eq(transactions.id, importPayments.bankTransactionId))
    .where(
      and(
        eq(importPayments.orgId, data.orgId),
        eq(importPayments.id, data.paymentId),
        eq(transactions.orgId, data.orgId),
        isNull(transactions.deletedAt)
      )
    )
    .limit(1);
  if (!payment) throw new Error("Import payment not found");
  const amountCents = parseMoneyCents(payment.amountThb, "Import payment amount");
  const transactionCents = Math.abs(
    parseMoneyCents(payment.transactionAmount, "Import bank transaction amount")
  );
  if (amountCents <= 0) throw new Error("Import payment amount must be positive");
  if (payment.transactionType !== "debit") {
    throw new Error("Import payment must link to a debit bank transaction");
  }
  if (amountCents !== transactionCents) {
    throw new Error("Import payment amount must match the linked bank transaction");
  }

  let debitAccountCode: string;
  switch (payment.paymentRole) {
    case "broker_settlement":
    case "shipper_settlement":
      debitAccountCode = "2110";
      break;
    case "customs_direct_payment":
      debitAccountCode = "2190";
      break;
    case "foreign_supplier_payment":
      debitAccountCode = "1185";
      break;
    default:
      throw new Error(`Unsupported import payment role: ${payment.paymentRole}`);
  }

  const debitAccount = await accountByCode(data.tx, data.orgId, debitAccountCode);
  const bank = await accountByCode(data.tx, data.orgId, "1111");

  const [existing] = await data.tx
    .select()
    .from(journalEntries)
    .where(
      and(
        eq(journalEntries.orgId, data.orgId),
        eq(journalEntries.sourceEntityType, "import_payments"),
        eq(journalEntries.sourceEntityId, payment.id),
        eq(journalEntries.postingKind, "import_payment_clearing")
      )
    )
    .limit(1);
  if (existing) return existing;

  const entryDate =
    typeof payment.transactionDate === "string"
      ? payment.transactionDate
      : formatBangkokDate(payment.transactionDate);
  const entry = await insertJournalEntry(data.tx, {
    orgId: data.orgId,
    entryNumber: await nextJournalEntryNumber(data.orgId, entryDate, data.tx),
    entryDate,
    postingDate: entryDate,
    entryType: "auto_payment",
    postingKind: "import_payment_clearing",
    sourceEntityType: "import_payments",
    sourceEntityId: payment.id,
    description: `Import payment clearing for import ${payment.importId}`,
    lines: [
      {
        accountId: debitAccount.id,
        debitAmount: formatCents(amountCents),
        description: payment.paymentRole,
        subledgerEntityType: "import_payments",
        subledgerEntityId: payment.id,
      },
      {
        accountId: bank.id,
        creditAmount: formatCents(amountCents),
        description: "Bank payment",
        subledgerEntityType: "transactions",
        subledgerEntityId: payment.bankTransactionId,
      },
    ],
  });

  await writeGlAuditLog(data.tx, {
    orgId: data.orgId,
    entryId: entry.id,
    operation: "post_import_payment_journal_entry",
    details: {
      importId: payment.importId,
      paymentId: payment.id,
      paymentRole: payment.paymentRole,
      amountThb: payment.amountThb,
    },
  });

  return entry;
}

export async function postTaxPaymentEventJournalEntry(data: {
  orgId: string;
  taxPaymentEventId: string;
  bankAccountCode?: string;
  tx?: DbConnection;
}) {
  const post = async (tx: DbConnection) => {
    await seedStandardGlAccounts(data.orgId, tx);

    const [row] = await tx
      .select({
        event: taxPaymentEvents,
        filing: vatFilings,
      })
      .from(taxPaymentEvents)
      .innerJoin(
        vatFilings,
        and(
          eq(vatFilings.id, taxPaymentEvents.filingId),
          eq(vatFilings.orgId, taxPaymentEvents.orgId)
        )
      )
      .where(
        and(
          eq(taxPaymentEvents.id, data.taxPaymentEventId),
          eq(taxPaymentEvents.orgId, data.orgId),
          sql`${vatFilings.deletedAt} IS NULL`
        )
      )
      .limit(1);

    if (!row) {
      throw new Error("Tax payment event not found");
    }
    if (row.event.eventStatus === "voided") {
      throw new Error("Voided tax payment events cannot be posted to GL");
    }
    if (row.event.eventType !== "payment") {
      throw new Error("Only tax payment events are supported by the GL payment poster");
    }
    if (row.filing.status !== "filed") {
      throw new Error("Tax payment events can only post after the VAT filing is filed");
    }

    const amount = Number(row.event.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error("Tax payment event amount must be positive");
    }

    const postingKind =
      row.filing.filingType === "pp36" ? "tax_payment_pp36" : "tax_payment_pp30";
    const [existing] = await tx
      .select()
      .from(journalEntries)
      .where(
        and(
          eq(journalEntries.orgId, data.orgId),
          eq(journalEntries.sourceEntityType, "tax_payment_events"),
          eq(journalEntries.sourceEntityId, row.event.id),
          eq(journalEntries.postingKind, postingKind)
        )
      )
      .limit(1);

    if (existing) {
      await tx
        .update(taxPaymentEvents)
        .set({ eventStatus: "posted_to_gl", postingOutboxStatus: "posted" })
        .where(
          and(
            eq(taxPaymentEvents.orgId, data.orgId),
            eq(taxPaymentEvents.id, row.event.id)
          )
        );
      return existing;
    }

    const liabilityAccountCode =
      row.filing.filingType === "pp36" ? "2152" : "2151";
    const liability = await accountByCode(tx, data.orgId, liabilityAccountCode);
    const bank = await accountByCode(tx, data.orgId, data.bankAccountCode ?? "1111");
    const paidDate = formatBangkokDate(row.event.paidAt);
    const description =
      row.filing.filingType === "pp36"
        ? "PP36 VAT payment"
        : "PP30 VAT payment";

    const entry = await insertJournalEntry(tx, {
      orgId: data.orgId,
      entryNumber: await nextJournalEntryNumber(data.orgId, paidDate, tx),
      entryDate: paidDate,
      postingDate: paidDate,
      entryType:
        row.filing.filingType === "pp30" ? "auto_pp30_settlement" : "auto_payment",
      postingKind,
      sourceEntityType: "tax_payment_events",
      sourceEntityId: row.event.id,
      createdByUserId: row.event.createdByUserId,
      description,
      lines: [
        {
          accountId: liability.id,
          debitAmount: amount.toFixed(2),
          description,
          subledgerEntityType: "tax_period",
          subledgerEntityId: row.filing.id,
        },
        {
          accountId: bank.id,
          creditAmount: amount.toFixed(2),
          description,
          subledgerEntityType: "tax_period",
          subledgerEntityId: row.filing.id,
        },
      ],
    });

    await tx
      .update(taxPaymentEvents)
      .set({ eventStatus: "posted_to_gl", postingOutboxStatus: "posted" })
      .where(
        and(
          eq(taxPaymentEvents.orgId, data.orgId),
          eq(taxPaymentEvents.id, row.event.id)
        )
      );

    await writeGlAuditLog(tx, {
      orgId: data.orgId,
      entryId: entry.id,
      operation: "post_tax_payment_event_journal_entry",
      createdByUserId: row.event.createdByUserId,
      details: {
        taxPaymentEventId: row.event.id,
        filingId: row.filing.id,
        filingType: row.filing.filingType,
        postingKind,
        amount: amount.toFixed(2),
      },
    });

    return entry;
  };

  if (data.tx) {
    return post(data.tx);
  }
  return db.transaction(post);
}

export async function postVatFilingPp36LifecycleJournalEntry(data: {
  orgId: string;
  filingId: string;
  tx?: DbConnection;
}) {
  const post = async (tx: DbConnection) => {
    await seedStandardGlAccounts(data.orgId, tx);

    const [filing] = await tx
      .select()
      .from(vatFilings)
      .where(
        and(
          eq(vatFilings.id, data.filingId),
          eq(vatFilings.orgId, data.orgId),
          sql`${vatFilings.deletedAt} IS NULL`
        )
      )
      .limit(1);

    if (!filing) {
      throw new Error("VAT filing not found");
    }
    if (filing.status !== "filed") {
      throw new Error("VAT filing must be filed before PP36 lifecycle posting");
    }

    const isPp36Assessment = filing.filingType === "pp36";
    const lineType = isPp36Assessment ? "pp36_obligation" : "pp36_reclaim";
    const postingKind = isPp36Assessment
      ? "vat_pp36_self_assessment"
      : "vat_pp36_reclaim_transfer";

    const [existing] = await tx
      .select()
      .from(journalEntries)
      .where(
        and(
          eq(journalEntries.orgId, data.orgId),
          eq(journalEntries.sourceEntityType, "vat_filings"),
          eq(journalEntries.sourceEntityId, filing.id),
          eq(journalEntries.postingKind, postingKind)
        )
      )
      .limit(1);
    if (existing) {
      return existing;
    }

    const [{ vatAmount }] = await tx
      .select({
        vatAmount: sql<string>`COALESCE(SUM(${vatFilingLines.vatAmount}), 0)::numeric(14,2)::text`,
      })
      .from(vatFilingLines)
      .where(
        and(
          eq(vatFilingLines.orgId, data.orgId),
          eq(vatFilingLines.filingId, filing.id),
          eq(vatFilingLines.lineType, lineType)
        )
      );

    const amount = Number(vatAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return null;
    }

    const pendingPp36Vat = await accountByCode(tx, data.orgId, "1253");
    const recoverableInputVat = await accountByCode(tx, data.orgId, "1251");
    const pp36Payable = await accountByCode(tx, data.orgId, "2152");
    const entryDate = periodEndDateString(filing.periodYear, filing.periodMonth);
    const description = isPp36Assessment
      ? "PP36 VAT self-assessment"
      : "PP36 VAT reclaim transfer";

    const entry = await insertJournalEntry(tx, {
      orgId: data.orgId,
      entryNumber: await nextJournalEntryNumber(data.orgId, entryDate, tx),
      entryDate,
      postingDate: entryDate,
      entryType: isPp36Assessment ? "auto_accrual" : "auto_pp30_settlement",
      postingKind,
      sourceEntityType: "vat_filings",
      sourceEntityId: filing.id,
      createdByUserId: filing.filedByUserId ?? undefined,
      description,
      lines: isPp36Assessment
        ? [
            {
              accountId: pendingPp36Vat.id,
              debitAmount: amount.toFixed(2),
              description,
              subledgerEntityType: "tax_period",
              subledgerEntityId: filing.id,
            },
            {
              accountId: pp36Payable.id,
              creditAmount: amount.toFixed(2),
              description,
              subledgerEntityType: "tax_period",
              subledgerEntityId: filing.id,
            },
          ]
        : [
            {
              accountId: recoverableInputVat.id,
              debitAmount: amount.toFixed(2),
              description,
              subledgerEntityType: "tax_period",
              subledgerEntityId: filing.id,
            },
            {
              accountId: pendingPp36Vat.id,
              creditAmount: amount.toFixed(2),
              description,
              subledgerEntityType: "tax_period",
              subledgerEntityId: filing.id,
            },
          ],
    });

    await writeGlAuditLog(tx, {
      orgId: data.orgId,
      entryId: entry.id,
      operation: "post_vat_filing_pp36_lifecycle_journal_entry",
      createdByUserId: filing.filedByUserId ?? undefined,
      details: {
        filingId: filing.id,
        filingType: filing.filingType,
        postingKind,
        amount: amount.toFixed(2),
      },
    });

    return entry;
  };

  if (data.tx) {
    return post(data.tx);
  }
  return db.transaction(post);
}

export async function postCitAccrualJournalEntry(data: {
  orgId: string;
  citFilingId: string;
  createdByUserId?: string;
  enqueueOutbox?: boolean;
  tx?: DbConnection;
}) {
  const post = async (tx: DbConnection) => {
    await seedStandardGlAccounts(data.orgId, tx);

    const [filing] = await tx
      .select()
      .from(citFilings)
      .where(
        and(
          eq(citFilings.id, data.citFilingId),
          eq(citFilings.orgId, data.orgId),
          eq(citFilings.filingType, "pnd50"),
          eq(citFilings.isAmendment, false)
        )
      )
      .for("update")
      .limit(1);

    if (!filing) {
      throw new Error("PND.50 filing not found");
    }
    if (!["draft", "submitted", "accepted"].includes(filing.filingStatus)) {
      throw new Error("CIT accrual requires an active PND.50 filing");
    }

    const citCalculated = Number(filing.citCalculated ?? "0");
    const whtCreditsUsed = Number(filing.whtCreditsUsed ?? "0");
    const prepaymentCreditsUsed = Number(filing.prepaymentCreditsUsed ?? "0");
    const citPayable = Number(filing.citPayable ?? "0");
    if (!Number.isFinite(citCalculated) || citCalculated <= 0) {
      throw new Error("CIT accrual requires positive CIT calculated");
    }
    if (
      !Number.isFinite(whtCreditsUsed) ||
      !Number.isFinite(prepaymentCreditsUsed) ||
      !Number.isFinite(citPayable) ||
      whtCreditsUsed < 0 ||
      prepaymentCreditsUsed < 0 ||
      citPayable < 0
    ) {
      throw new Error("CIT accrual requires non-negative credit and payable amounts");
    }
    const creditTotal = whtCreditsUsed + prepaymentCreditsUsed + citPayable;
    if (Math.abs(citCalculated - creditTotal) > 0.01) {
      throw new Error("CIT accrual amounts do not reconcile");
    }

    const [existing] = await tx
      .select()
      .from(journalEntries)
      .where(
        and(
          eq(journalEntries.orgId, data.orgId),
          eq(journalEntries.sourceEntityType, "cit_filings"),
          eq(journalEntries.sourceEntityId, filing.id),
          eq(journalEntries.postingKind, "cit_accrual"),
          isNull(journalEntries.reversedByEntryId)
        )
      )
      .limit(1);

    if (existing) return existing;

    const expense = await accountByCode(tx, data.orgId, "6810");
    const payable = await accountByCode(tx, data.orgId, "2170");
    const prepaidWht = whtCreditsUsed > 0
      ? await accountByCode(tx, data.orgId, "1180")
      : null;
    const prepaidCit = prepaymentCreditsUsed > 0
      ? await accountByCode(tx, data.orgId, "1186")
      : null;
    const entryDate = filing.periodEnd;
    const description = `PND.50 CIT accrual ${filing.taxYear}`;
    const lines: JournalEntryLineInput[] = [
      {
        accountId: expense.id,
        debitAmount: citCalculated.toFixed(2),
        description,
        subledgerEntityType: "cit_filing",
        subledgerEntityId: filing.id,
      },
    ];
    if (prepaidWht && whtCreditsUsed > 0) {
      lines.push({
        accountId: prepaidWht.id,
        creditAmount: whtCreditsUsed.toFixed(2),
        description: `${description} - WHT credits used`,
        subledgerEntityType: "cit_filing",
        subledgerEntityId: filing.id,
      });
    }
    if (prepaidCit && prepaymentCreditsUsed > 0) {
      lines.push({
        accountId: prepaidCit.id,
        creditAmount: prepaymentCreditsUsed.toFixed(2),
        description: `${description} - PND.51 prepayments used`,
        subledgerEntityType: "cit_filing",
        subledgerEntityId: filing.id,
      });
    }
    if (citPayable > 0) {
      lines.push({
        accountId: payable.id,
        creditAmount: citPayable.toFixed(2),
        description,
        subledgerEntityType: "cit_filing",
        subledgerEntityId: filing.id,
      });
    }

    const entry = await insertJournalEntry(tx, {
      orgId: data.orgId,
      entryNumber: await nextJournalEntryNumber(data.orgId, entryDate, tx),
      entryDate,
      postingDate: entryDate,
      entryType: "auto_accrual",
      postingKind: "cit_accrual",
      sourceEntityType: "cit_filings",
      sourceEntityId: filing.id,
      createdByUserId: data.createdByUserId,
      description,
      lines,
    });

    await writeGlAuditLog(tx, {
      orgId: data.orgId,
      entryId: entry.id,
      operation: "post_cit_accrual_journal_entry",
      createdByUserId: data.createdByUserId,
      details: {
        citFilingId: filing.id,
        taxYear: filing.taxYear,
        citCalculated: citCalculated.toFixed(2),
        whtCreditsUsed: whtCreditsUsed.toFixed(2),
        prepaymentCreditsUsed: prepaymentCreditsUsed.toFixed(2),
        citPayable: citPayable.toFixed(2),
      },
    });

    if (data.enqueueOutbox !== false) {
      const { enqueuePostingOutbox } = await import("./posting-outbox");
      const outbox = await enqueuePostingOutbox({
        orgId: data.orgId,
        sourceEntityType: "cit_filings",
        sourceEntityId: filing.id,
        eventType: "accrual",
        postingDate: entryDate,
        payload: {
          postingDate: entryDate,
          createdByUserId: data.createdByUserId ?? null,
        },
        tx,
      });
      if (outbox.postingStatus === "posted" && outbox.journalEntryId !== entry.id) {
        await tx
          .update(postingOutbox)
          .set({ journalEntryId: entry.id, updatedAt: new Date() })
          .where(eq(postingOutbox.id, outbox.id));
      }
    }

    return entry;
  };

  if (data.tx) {
    return post(data.tx);
  }
  return db.transaction(post);
}

export async function postCitPaymentJournalEntry(data: {
  orgId: string;
  citFilingId: string;
  paidAt: Date;
  bankAccountCode?: string;
  createdByUserId?: string;
  enqueueOutbox?: boolean;
  tx?: DbConnection;
}) {
  const post = async (tx: DbConnection) => {
    await seedStandardGlAccounts(data.orgId, tx);

    const [filing] = await tx
      .select()
      .from(citFilings)
      .where(
        and(
          eq(citFilings.id, data.citFilingId),
          eq(citFilings.orgId, data.orgId),
          eq(citFilings.isAmendment, false)
        )
      )
      .for("update")
      .limit(1);

    if (!filing) {
      throw new Error("CIT filing not found");
    }
    if (!["submitted", "accepted"].includes(filing.filingStatus)) {
      throw new Error("CIT filing must be submitted before payment posting");
    }

    const amount = Number(filing.citPayable ?? "0");
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error("CIT payment requires positive CIT payable");
    }

    const [existing] = await tx
      .select()
      .from(journalEntries)
      .where(
        and(
          eq(journalEntries.orgId, data.orgId),
          eq(journalEntries.sourceEntityType, "cit_filings"),
          eq(journalEntries.sourceEntityId, filing.id),
          eq(journalEntries.postingKind, "cit_payment"),
          isNull(journalEntries.reversedByEntryId)
        )
      )
      .limit(1);

    if (existing) return existing;

    const debitAccount = await accountByCode(
      tx,
      data.orgId,
      filing.filingType === "pnd51" ? "1186" : "2170"
    );
    const bank = await accountByCode(tx, data.orgId, data.bankAccountCode ?? "1111");
    const paidDate = formatBangkokDate(data.paidAt);
    const description = `${filing.filingType.toUpperCase()} CIT payment ${filing.taxYear}`;

    const entry = await insertJournalEntry(tx, {
      orgId: data.orgId,
      entryNumber: await nextJournalEntryNumber(data.orgId, paidDate, tx),
      entryDate: paidDate,
      postingDate: paidDate,
      entryType: "auto_payment",
      postingKind: "cit_payment",
      sourceEntityType: "cit_filings",
      sourceEntityId: filing.id,
      createdByUserId: data.createdByUserId,
      description,
      lines: [
        {
          accountId: debitAccount.id,
          debitAmount: amount.toFixed(2),
          description,
          subledgerEntityType: "cit_filing",
          subledgerEntityId: filing.id,
        },
        {
          accountId: bank.id,
          creditAmount: amount.toFixed(2),
          description,
          subledgerEntityType: "cit_filing",
          subledgerEntityId: filing.id,
        },
      ],
    });

    await tx
      .update(citFilings)
      .set({ paidAt: data.paidAt, updatedAt: new Date() })
      .where(
        and(
          eq(citFilings.orgId, data.orgId),
          eq(citFilings.id, filing.id)
        )
      );

    await writeGlAuditLog(tx, {
      orgId: data.orgId,
      entryId: entry.id,
      operation: "post_cit_payment_journal_entry",
      createdByUserId: data.createdByUserId,
      details: {
        citFilingId: filing.id,
        filingType: filing.filingType,
        taxYear: filing.taxYear,
        amount: amount.toFixed(2),
        bankAccountCode: data.bankAccountCode ?? "1111",
        paidAt: data.paidAt.toISOString(),
      },
    });

    if (data.enqueueOutbox !== false) {
      const { enqueuePostingOutbox } = await import("./posting-outbox");
      const outbox = await enqueuePostingOutbox({
        orgId: data.orgId,
        sourceEntityType: "cit_filings",
        sourceEntityId: filing.id,
        eventType: "payment",
        postingDate: paidDate,
        payload: {
          paidAt: data.paidAt.toISOString(),
          paymentDate: paidDate,
          bankAccountCode: data.bankAccountCode ?? "1111",
          createdByUserId: data.createdByUserId ?? null,
        },
        tx,
      });
      if (outbox.postingStatus === "posted" && outbox.journalEntryId !== entry.id) {
        await tx
          .update(postingOutbox)
          .set({ journalEntryId: entry.id, updatedAt: new Date() })
          .where(eq(postingOutbox.id, outbox.id));
      }
    }

    return entry;
  };

  if (data.tx) {
    return post(data.tx);
  }
  return db.transaction(post);
}

export async function postYearEndCloseJournalEntries(data: {
  orgId: string;
  taxYear: number;
  createdByUserId?: string;
  tx?: DbConnection;
}) {
  const post = async (tx: DbConnection) => {
    await seedStandardGlAccounts(data.orgId, tx);

    const [filing] = await tx
      .select()
      .from(citFilings)
      .where(
        and(
          eq(citFilings.orgId, data.orgId),
          eq(citFilings.taxYear, data.taxYear),
          eq(citFilings.filingType, "pnd50"),
          eq(citFilings.isAmendment, false)
        )
      )
      .limit(1);

    if (!filing) {
      throw new Error("PND.50 filing not found for year-end close");
    }

    const [citAccrual] = await tx
      .select()
      .from(journalEntries)
      .where(
        and(
          eq(journalEntries.orgId, data.orgId),
          eq(journalEntries.sourceEntityType, "cit_filings"),
          eq(journalEntries.sourceEntityId, filing.id),
          eq(journalEntries.postingKind, "cit_accrual"),
          isNull(journalEntries.reversedByEntryId)
        )
      )
      .limit(1);

    const citCalculatedCents = toCents(filing.citCalculated);
    if (citCalculatedCents > 0 && !citAccrual) {
      throw new Error("Year-end close requires CIT accrual JE");
    }

    const existingCloseEntries = await tx
      .select()
      .from(journalEntries)
      .where(
        and(
          eq(journalEntries.orgId, data.orgId),
          eq(journalEntries.sourceEntityType, "cit_filings"),
          eq(journalEntries.sourceEntityId, filing.id),
          sql`${journalEntries.reversedByEntryId} IS NULL`,
          sql`${journalEntries.postingKind} IN ('year_end_close_revenue_summary', 'year_end_close_to_retained_earnings')`
        )
      )
      .orderBy(asc(journalEntries.postingKind));

    const existingSummary = existingCloseEntries.find(
      (entry) => entry.postingKind === "year_end_close_revenue_summary"
    );
    const existingRetained = existingCloseEntries.find(
      (entry) => entry.postingKind === "year_end_close_to_retained_earnings"
    );
    if (existingSummary && existingRetained) {
      return {
        revenueSummaryEntry: existingSummary,
        retainedEarningsEntry: existingRetained,
      };
    }
    if (existingSummary && !existingRetained && existingSummary.notes?.includes("flat-year close")) {
      return {
        revenueSummaryEntry: existingSummary,
        retainedEarningsEntry: null,
      };
    }
    if (existingSummary || existingRetained) {
      throw new Error("Partial year-end close exists; manual review required");
    }

    const periodStart = filing.periodStart;
    const periodEnd = filing.periodEnd;
    const profitLossBalances = await tx
      .select({
        accountId: glAccounts.id,
        accountCode: glAccounts.accountCode,
        accountType: glAccounts.accountType,
        balance: sql<string>`COALESCE(SUM(${journalLines.debitAmount} - ${journalLines.creditAmount}), 0)::text`,
      })
      .from(journalLines)
      .innerJoin(
        journalEntries,
        and(
          eq(journalEntries.id, journalLines.journalEntryId),
          eq(journalEntries.orgId, data.orgId)
        )
      )
      .innerJoin(
        glAccounts,
        and(
          eq(glAccounts.id, journalLines.accountId),
          eq(glAccounts.orgId, data.orgId)
        )
      )
      .where(
        and(
          eq(journalLines.orgId, data.orgId),
          sql`${journalEntries.entryDate} >= ${periodStart}::date`,
          sql`${journalEntries.entryDate} <= ${periodEnd}::date`,
          eq(journalEntries.isReversal, false),
          isNull(journalEntries.reversedByEntryId),
          sql`${glAccounts.accountType} IN ('revenue', 'cogs', 'expense')`,
          sql`COALESCE(${journalEntries.postingKind}::text, '') NOT IN ('year_end_close_revenue_summary', 'year_end_close_to_retained_earnings')`
        )
      )
      .groupBy(glAccounts.id, glAccounts.accountCode, glAccounts.accountType)
      .orderBy(asc(glAccounts.accountCode));

    const incomeSummary = await accountByCode(tx, data.orgId, "3230");
    const retainedEarnings = await accountByCode(tx, data.orgId, "3220");
    const entryDate = periodEnd;
    const summaryDescription = `Year-end close to income summary ${data.taxYear}`;
    const retainedDescription = `Year-end close to retained earnings ${data.taxYear}`;
    const summaryLines: JournalEntryLineInput[] = [];
    let revenueCents = 0;
    let expenseCents = 0;

    for (const row of profitLossBalances) {
      const balanceCents = toCents(row.balance);
      if (balanceCents === 0) continue;

      const closeCents = Math.abs(balanceCents);
      if (balanceCents < 0) {
        summaryLines.push({
          accountId: row.accountId,
          debitAmount: moneyFromCents(closeCents),
          description: `Close ${row.accountCode} to income summary`,
        });
      } else {
        summaryLines.push({
          accountId: row.accountId,
          creditAmount: moneyFromCents(closeCents),
          description: `Close ${row.accountCode} to income summary`,
        });
      }

      if (row.accountType === "revenue") {
        revenueCents += -balanceCents;
      } else {
        expenseCents += balanceCents;
      }
    }

    const netIncomeCents = revenueCents - expenseCents;
    if (summaryLines.length === 0) {
      throw new Error("Year-end close requires non-zero profit or loss balances");
    }

    if (netIncomeCents !== 0) {
      summaryLines.push({
        accountId: incomeSummary.id,
        debitAmount: netIncomeCents < 0 ? moneyFromCents(netIncomeCents) : undefined,
        creditAmount: netIncomeCents > 0 ? moneyFromCents(netIncomeCents) : undefined,
        description: summaryDescription,
      });
    }

    const revenueSummaryEntry = await insertJournalEntry(tx, {
      orgId: data.orgId,
      entryNumber: await nextJournalEntryNumber(data.orgId, entryDate, tx),
      entryDate,
      postingDate: entryDate,
      entryType: "auto_year_end_close",
      postingKind: "year_end_close_revenue_summary",
      sourceEntityType: "cit_filings",
      sourceEntityId: filing.id,
      createdByUserId: data.createdByUserId,
      description: summaryDescription,
      notes:
        netIncomeCents === 0
          ? `flat-year close; includes PND.50 ${filing.id}`
          : `Includes PND.50 ${filing.id}${citAccrual ? ` and CIT accrual ${citAccrual.id}` : ""}`,
      lines: summaryLines,
    });

    const retainedEarningsEntry =
      netIncomeCents === 0
        ? null
        : await insertJournalEntry(tx, {
            orgId: data.orgId,
            entryNumber: await nextJournalEntryNumber(data.orgId, entryDate, tx),
            entryDate,
            postingDate: entryDate,
            entryType: "auto_year_end_close",
            postingKind: "year_end_close_to_retained_earnings",
            sourceEntityType: "cit_filings",
            sourceEntityId: filing.id,
            createdByUserId: data.createdByUserId,
            description: retainedDescription,
            lines:
              netIncomeCents > 0
                ? [
                    {
                      accountId: incomeSummary.id,
                      debitAmount: moneyFromCents(netIncomeCents),
                      description: retainedDescription,
                    },
                    {
                      accountId: retainedEarnings.id,
                      creditAmount: moneyFromCents(netIncomeCents),
                      description: retainedDescription,
                    },
                  ]
                : [
                    {
                      accountId: retainedEarnings.id,
                      debitAmount: moneyFromCents(netIncomeCents),
                      description: retainedDescription,
                    },
                    {
                      accountId: incomeSummary.id,
                      creditAmount: moneyFromCents(netIncomeCents),
                      description: retainedDescription,
                    },
                  ],
          });

    await writeGlAuditLog(tx, {
      orgId: data.orgId,
      entryId: revenueSummaryEntry.id,
      operation: "post_year_end_close_revenue_summary",
      createdByUserId: data.createdByUserId,
      details: {
        citFilingId: filing.id,
        taxYear: data.taxYear,
        revenue: moneyFromCents(revenueCents),
        expensesAndCogs: moneyFromCents(expenseCents),
        netIncome: (netIncomeCents / 100).toFixed(2),
      },
    });
    if (retainedEarningsEntry) {
      await writeGlAuditLog(tx, {
        orgId: data.orgId,
        entryId: retainedEarningsEntry.id,
        operation: "post_year_end_close_to_retained_earnings",
        createdByUserId: data.createdByUserId,
        details: {
          citFilingId: filing.id,
          taxYear: data.taxYear,
          netIncome: (netIncomeCents / 100).toFixed(2),
        },
      });
    }

    return { revenueSummaryEntry, retainedEarningsEntry };
  };

  if (data.tx) {
    return post(data.tx);
  }
  return db.transaction(post);
}

export async function getGeneralLedgerDashboard(orgId: string) {
  await seedStandardGlAccounts(orgId);
  const accounts = await getGlAccounts(orgId);
  const recentEntries = await db
    .select()
    .from(journalEntries)
    .where(and(...orgScopeAlive(journalEntries, orgId)))
    .orderBy(desc(journalEntries.entryDate), desc(journalEntries.createdAt))
    .limit(10);
  const recentGlLocks = await db
    .select()
    .from(periodLocks)
    .where(
      and(
        ...orgScopeAlive(periodLocks, orgId),
        eq(periodLocks.domain, "gl")
      )
    )
    .orderBy(desc(periodLocks.createdAt))
    .limit(6);

  const [{ entryCount }] = await db
    .select({ entryCount: sql<number>`COUNT(*)::int` })
    .from(journalEntries)
    .where(and(...orgScopeAlive(journalEntries, orgId)));
  const today = new Date().toISOString().slice(0, 10);
  const [statements, inventoryReconciliation] = await Promise.all([
    buildFinancialStatementSummary(orgId, today),
    getInventoryBalanceReconciliation(orgId, today),
  ]);

  return {
    accounts,
    recentEntries,
    recentGlLocks,
    inventoryReconciliation,
    statements,
    summary: {
      accountCount: accounts.length,
      entryCount,
      postableAccountCount: accounts.filter((account) => account.isPostable).length,
    },
  };
}

export async function getJournalEntryList(orgId: string, limit: number = 50) {
  return db
    .select()
    .from(journalEntries)
    .where(and(...orgScopeAlive(journalEntries, orgId)))
    .orderBy(desc(journalEntries.entryDate), desc(journalEntries.createdAt))
    .limit(Math.min(Math.max(limit, 1), 100));
}

export async function getJournalEntryDetail(orgId: string, journalEntryId: string) {
  const [entry] = await db
    .select()
    .from(journalEntries)
    .where(
      and(
        ...orgScopeAlive(journalEntries, orgId),
        eq(journalEntries.id, journalEntryId)
      )
    )
    .limit(1);

  if (!entry) return null;

  const lines = await db
    .select({
      id: journalLines.id,
      lineNumber: journalLines.lineNumber,
      description: journalLines.description,
      debitAmount: journalLines.debitAmount,
      creditAmount: journalLines.creditAmount,
      subledgerEntityType: journalLines.subledgerEntityType,
      subledgerEntityId: journalLines.subledgerEntityId,
      channelKey: journalLines.channelKey,
      processorKey: journalLines.processorKey,
      cashDepositKey: journalLines.cashDepositKey,
      costCenterId: journalLines.costCenterId,
      projectId: journalLines.projectId,
      boiSegment: journalLines.boiSegment,
      originalCurrency: journalLines.originalCurrency,
      originalAmountDebit: journalLines.originalAmountDebit,
      originalAmountCredit: journalLines.originalAmountCredit,
      fxRateApplied: journalLines.fxRateApplied,
      accountId: glAccounts.id,
      accountCode: glAccounts.accountCode,
      accountNameEn: glAccounts.nameEn,
      accountNameTh: glAccounts.nameTh,
      accountType: glAccounts.accountType,
    })
    .from(journalLines)
    .innerJoin(
      glAccounts,
      and(
        eq(glAccounts.id, journalLines.accountId),
        eq(glAccounts.orgId, orgId)
      )
    )
    .where(
      and(
        eq(journalLines.orgId, orgId),
        eq(journalLines.journalEntryId, entry.id)
      )
    )
    .orderBy(asc(journalLines.lineNumber));

  return { entry, lines };
}

export async function getGeneralLedgerDetail(
  orgId: string,
  options: { accountId?: string; startDate?: string; endDate?: string; limit?: number } = {}
) {
  const limit = Math.min(Math.max(options.limit ?? 100, 1), 250);
  const filters = [
    eq(journalLines.orgId, orgId),
    eq(journalEntries.orgId, orgId),
    eq(glAccounts.orgId, orgId),
  ];
  if (options.accountId) {
    filters.push(eq(journalLines.accountId, options.accountId));
  }
  if (options.startDate) {
    filters.push(gte(journalEntries.entryDate, options.startDate));
  }
  if (options.endDate) {
    filters.push(lte(journalEntries.entryDate, options.endDate));
  }

  return db
    .select({
      journalEntryId: journalEntries.id,
      entryNumber: journalEntries.entryNumber,
      entryDate: journalEntries.entryDate,
      entryType: journalEntries.entryType,
      postingKind: journalEntries.postingKind,
      sourceEntityType: journalEntries.sourceEntityType,
      sourceEntityId: journalEntries.sourceEntityId,
      lineId: journalLines.id,
      lineNumber: journalLines.lineNumber,
      description: journalLines.description,
      debitAmount: journalLines.debitAmount,
      creditAmount: journalLines.creditAmount,
      subledgerEntityType: journalLines.subledgerEntityType,
      subledgerEntityId: journalLines.subledgerEntityId,
      accountId: glAccounts.id,
      accountCode: glAccounts.accountCode,
      accountNameEn: glAccounts.nameEn,
      accountType: glAccounts.accountType,
    })
    .from(journalLines)
    .innerJoin(
      journalEntries,
      and(
        eq(journalEntries.id, journalLines.journalEntryId),
        eq(journalEntries.orgId, orgId)
      )
    )
    .innerJoin(
      glAccounts,
      and(
        eq(glAccounts.id, journalLines.accountId),
        eq(glAccounts.orgId, orgId)
      )
    )
    .where(and(...filters))
    .orderBy(asc(journalEntries.entryDate), asc(journalEntries.createdAt), asc(journalLines.lineNumber))
    .limit(limit);
}

export async function getInventoryBalanceReconciliation(
  orgId: string,
  asOfDate: string,
  tx: DbConnection = db
) {
  const [inventoryValue] = await tx
    .select({
      skuCurrentValue: sql<string>`COALESCE(SUM(${skus.currentValue}), 0)::numeric(14,2)::text`,
    })
    .from(skus)
    .where(and(eq(skus.orgId, orgId), sql`${skus.deletedAt} IS NULL`));
  const trialBalance = await buildTrialBalance(orgId, asOfDate, tx);
  const inventoryAccount = trialBalance.find((row) => row.accountCode === "1160");
  const glInventoryBalance = money(
    inventoryAccount ? signedBalance(inventoryAccount) : 0
  );
  const skuCurrentValue = inventoryValue?.skuCurrentValue ?? "0.00";

  return {
    asOfDate,
    glAccountCode: "1160",
    glInventoryBalance,
    skuCurrentValue,
    variance: money(Number(glInventoryBalance) - Number(skuCurrentValue)),
  };
}

export async function buildTrialBalance(
  orgId: string,
  asOfDate: string,
  tx: DbConnection = db
) {
  return tx
    .select({
      accountId: glAccounts.id,
      accountCode: glAccounts.accountCode,
      accountNameEn: glAccounts.nameEn,
      accountNameTh: glAccounts.nameTh,
      accountType: glAccounts.accountType,
      debitTotal: sql<string>`COALESCE(SUM(CASE WHEN ${journalEntries.id} IS NULL THEN 0 ELSE ${journalLines.debitAmount} END), 0)::numeric(14,2)`,
      creditTotal: sql<string>`COALESCE(SUM(CASE WHEN ${journalEntries.id} IS NULL THEN 0 ELSE ${journalLines.creditAmount} END), 0)::numeric(14,2)`,
      netBalance: sql<string>`(COALESCE(SUM(CASE WHEN ${journalEntries.id} IS NULL THEN 0 ELSE ${journalLines.debitAmount} END), 0) - COALESCE(SUM(CASE WHEN ${journalEntries.id} IS NULL THEN 0 ELSE ${journalLines.creditAmount} END), 0))::numeric(14,2)`,
    })
    .from(glAccounts)
    .leftJoin(
      journalLines,
      and(eq(journalLines.accountId, glAccounts.id), eq(journalLines.orgId, orgId))
    )
    .leftJoin(
      journalEntries,
      and(
        eq(journalEntries.id, journalLines.journalEntryId),
        eq(journalEntries.orgId, orgId),
        lte(journalEntries.entryDate, asOfDate)
      )
    )
    .where(and(...orgScopeAlive(glAccounts, orgId)))
    .groupBy(
      glAccounts.id,
      glAccounts.accountCode,
      glAccounts.nameEn,
      glAccounts.nameTh,
      glAccounts.accountType
    )
    .orderBy(asc(glAccounts.accountCode));
}

function signedBalance(row: {
  accountType: string;
  debitTotal: string;
  creditTotal: string;
}) {
  const debit = Number(row.debitTotal);
  const credit = Number(row.creditTotal);
  if (["liability", "equity", "revenue", "contra_asset"].includes(row.accountType)) {
    return credit - debit;
  }
  return debit - credit;
}

function money(value: number) {
  return value.toFixed(2);
}

export async function buildFinancialStatementSummary(
  orgId: string,
  asOfDate: string,
  tx: DbConnection = db
) {
  const trialBalance = await buildTrialBalance(orgId, asOfDate, tx);
  let assets = 0;
  let liabilities = 0;
  let equity = 0;
  let revenue = 0;
  let cogs = 0;
  let expenses = 0;

  for (const row of trialBalance) {
    const balance = signedBalance(row);
    if (row.accountType === "asset" || row.accountType === "contra_asset") {
      assets += balance;
    } else if (
      row.accountType === "liability" ||
      row.accountType === "contra_liability"
    ) {
      liabilities += balance;
    } else if (row.accountType === "equity") {
      equity += balance;
    } else if (row.accountType === "revenue") {
      revenue += balance;
    } else if (row.accountType === "cogs") {
      cogs += balance;
    } else if (row.accountType === "expense") {
      expenses += balance;
    }
  }

  const grossProfit = revenue - cogs;
  const netIncome = grossProfit - expenses;

  return {
    asOfDate,
    balanceSheet: {
      assets: money(assets),
      liabilities: money(liabilities),
      equity: money(equity),
      retainedEarningsCurrent: money(netIncome),
      check: money(assets - liabilities - equity - netIncome),
    },
    profitAndLoss: {
      revenue: money(revenue),
      cogs: money(cogs),
      grossProfit: money(grossProfit),
      expenses: money(expenses),
      netIncome: money(netIncome),
    },
  };
}
