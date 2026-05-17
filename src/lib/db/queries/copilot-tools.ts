import { randomUUID } from "crypto";
import { and, desc, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "../index";
import {
  copilotMessages,
  copilotSessions,
  copilotToolEvents,
  documentLineItems,
  documents,
  exceptionQueue,
  glAccounts,
  periodLocks,
  pp36Obligations,
  taxPaymentEvents,
  vatFilings,
  vatInputItems,
  vatOutputItems,
  vendors,
} from "../schema";
import {
  applyRecodeDocumentsInputSchema,
  emptyInputSchema,
  genericRowsOutputSchema,
  createReviewTaskInputSchema,
  previewRecodeDocumentsInputSchema,
  searchInputSchema,
  summaryOutputSchema,
  registeredCopilotToolSchema,
  taxPositionInputSchema,
  type AccountingTool,
  type RegisteredCopilotTool,
  type RequiredRole,
  type ToolContext,
} from "@/lib/copilot/tool-registry";
import { orgScope, orgScopeAlive } from "../helpers/org-scope";

async function ensureSession(ctx: ToolContext) {
  const [existing] = await db
    .select()
    .from(copilotSessions)
    .where(
      and(
        ...orgScope(copilotSessions, ctx.orgId),
        eq(copilotSessions.userId, ctx.userId),
        eq(copilotSessions.status, "open")
      )
    )
    .limit(1);
  if (existing) return existing;

  const [session] = await db
    .insert(copilotSessions)
    .values({ orgId: ctx.orgId, userId: ctx.userId })
    .returning();
  return session;
}

function roleSatisfies(actual: RequiredRole, required: RequiredRole) {
  const rank: Record<RequiredRole, number> = { staff: 1, accountant: 2, owner: 3 };
  return rank[actual] >= rank[required];
}

const searchDocumentsTool: AccountingTool<
  { query: string; limit: number },
  { rows: Record<string, unknown>[] }
> = {
  name: "search_documents",
  description: "Search org-scoped documents by number, category, or status.",
  inputSchema: searchInputSchema,
  outputSchema: genericRowsOutputSchema,
  requiredRole: "staff",
  risk: "read",
  previewRequired: false,
  async execute(input, ctx) {
    const rows = await db
      .select({
        id: documents.id,
        documentNumber: documents.documentNumber,
        direction: documents.direction,
        status: documents.status,
        issueDate: documents.issueDate,
        dueDate: documents.dueDate,
        totalAmountThb: documents.totalAmountThb,
        category: documents.category,
      })
      .from(documents)
      .where(
        and(
          ...orgScope(documents, ctx.orgId),
          or(
            ilike(documents.documentNumber, `%${input.query}%`),
            ilike(documents.category, `%${input.query}%`),
            sql`${documents.status}::text ILIKE ${`%${input.query}%`}`
          )
        )
      )
      .orderBy(desc(documents.createdAt))
      .limit(input.limit);
    return { rows };
  },
};

const searchVendorsTool: AccountingTool<
  { query: string; limit: number },
  { rows: Record<string, unknown>[] }
> = {
  name: "search_vendors",
  description: "Search org-scoped vendors by name, Thai name, tax ID, or country.",
  inputSchema: searchInputSchema,
  outputSchema: genericRowsOutputSchema,
  requiredRole: "staff",
  risk: "read",
  previewRequired: false,
  async execute(input, ctx) {
    const rows = await db
      .select({
        id: vendors.id,
        name: vendors.name,
        nameTh: vendors.nameTh,
        taxId: vendors.taxId,
        entityType: vendors.entityType,
        country: vendors.country,
        isVatRegistered: vendors.isVatRegistered,
      })
      .from(vendors)
      .where(
        and(
          ...orgScope(vendors, ctx.orgId),
          or(
            ilike(vendors.name, `%${input.query}%`),
            ilike(vendors.nameTh, `%${input.query}%`),
            ilike(vendors.taxId, `%${input.query}%`),
            ilike(vendors.country, `%${input.query}%`)
          )
        )
      )
      .orderBy(desc(vendors.createdAt))
      .limit(input.limit);
    return { rows };
  },
};

const searchAccountsTool: AccountingTool<
  { query: string; limit: number },
  { rows: Record<string, unknown>[] }
> = {
  name: "search_accounts",
  description: "Search chart-of-accounts rows by code or name.",
  inputSchema: searchInputSchema,
  outputSchema: genericRowsOutputSchema,
  requiredRole: "staff",
  risk: "read",
  previewRequired: false,
  async execute(input, ctx) {
    const rows = await db
      .select({
        id: glAccounts.id,
        accountCode: glAccounts.accountCode,
        nameEn: glAccounts.nameEn,
        nameTh: glAccounts.nameTh,
        accountType: glAccounts.accountType,
        taxTreatment: glAccounts.taxTreatment,
      })
      .from(glAccounts)
      .where(
        and(
          ...orgScope(glAccounts, ctx.orgId),
          or(
            ilike(glAccounts.accountCode, `%${input.query}%`),
            ilike(glAccounts.nameEn, `%${input.query}%`),
            ilike(glAccounts.nameTh, `%${input.query}%`)
          )
        )
      )
      .orderBy(glAccounts.accountCode)
      .limit(input.limit);
    return { rows };
  },
};

const listOpenExceptionsTool: AccountingTool<
  Record<string, never>,
  { rows: Record<string, unknown>[] }
> = {
  name: "list_open_exceptions",
  description: "List open org-scoped exception queue items.",
  inputSchema: emptyInputSchema,
  outputSchema: genericRowsOutputSchema,
  requiredRole: "staff",
  risk: "read",
  previewRequired: false,
  async execute(_input, ctx) {
    const rows = await db
      .select({
        id: exceptionQueue.id,
        exceptionType: exceptionQueue.exceptionType,
        severity: exceptionQueue.severity,
        summary: exceptionQueue.summary,
        entityType: exceptionQueue.entityType,
        entityId: exceptionQueue.entityId,
        createdAt: exceptionQueue.createdAt,
      })
      .from(exceptionQueue)
      .where(
        and(
          ...orgScopeAlive(exceptionQueue, ctx.orgId),
          isNull(exceptionQueue.resolvedAt)
        )
      )
      .orderBy(desc(exceptionQueue.createdAt))
      .limit(25);
    return { rows };
  },
};

const getTaxPositionTool: AccountingTool<
  { periodYear: number; periodMonth: number },
  { summary: Record<string, unknown> }
> = {
  name: "get_tax_position",
  description: "Summarize VAT and tax payment position for a period.",
  inputSchema: taxPositionInputSchema,
  outputSchema: summaryOutputSchema,
  requiredRole: "staff",
  risk: "read",
  previewRequired: false,
  async execute(input, ctx) {
    const [vatInput] = await db
      .select({
        claimable: sql<string>`COALESCE(SUM(${vatInputItems.vatAmount}) FILTER (WHERE ${vatInputItems.status} = 'claimable'), 0)::numeric(14,2)`,
        held: sql<string>`COALESCE(SUM(${vatInputItems.vatAmount}) FILTER (WHERE ${vatInputItems.status} = 'held'), 0)::numeric(14,2)`,
      })
      .from(vatInputItems)
      .where(
        and(
          ...orgScopeAlive(vatInputItems, ctx.orgId),
          eq(vatInputItems.claimPeriodYear, input.periodYear),
          eq(vatInputItems.claimPeriodMonth, input.periodMonth)
        )
      );

    const [vatOutput] = await db
      .select({
        reportable: sql<string>`COALESCE(SUM(${vatOutputItems.vatAmount}) FILTER (WHERE ${vatOutputItems.status} = 'reportable'), 0)::numeric(14,2)`,
      })
      .from(vatOutputItems)
      .where(
        and(
          ...orgScopeAlive(vatOutputItems, ctx.orgId),
          eq(vatOutputItems.outputPeriodYear, input.periodYear),
          eq(vatOutputItems.outputPeriodMonth, input.periodMonth)
        )
      );

    const [pp36] = await db
      .select({
        required: sql<string>`COALESCE(SUM(${pp36Obligations.vatAmount}) FILTER (WHERE ${pp36Obligations.status} = 'pp36_required'), 0)::numeric(14,2)`,
        paid: sql<string>`COALESCE(SUM(${pp36Obligations.vatAmount}) FILTER (WHERE ${pp36Obligations.status} = 'pp36_paid'), 0)::numeric(14,2)`,
      })
      .from(pp36Obligations)
      .where(
        and(
          ...orgScopeAlive(pp36Obligations, ctx.orgId),
          eq(pp36Obligations.pp36PeriodYear, input.periodYear),
          eq(pp36Obligations.pp36PeriodMonth, input.periodMonth)
        )
      );

    const filings = await db
      .select({
        id: vatFilings.id,
        filingType: vatFilings.filingType,
        status: vatFilings.status,
        netPayable: vatFilings.netPayable,
        refundAmount: vatFilings.refundAmount,
        carryforwardOut: vatFilings.carryforwardOut,
      })
      .from(vatFilings)
      .where(
        and(
          ...orgScopeAlive(vatFilings, ctx.orgId),
          eq(vatFilings.periodYear, input.periodYear),
          eq(vatFilings.periodMonth, input.periodMonth)
        )
      );

    const [payments] = await db
      .select({
        paid: sql<string>`COALESCE(SUM(${taxPaymentEvents.amount}) FILTER (WHERE ${taxPaymentEvents.eventType} = 'payment'), 0)::numeric(14,2)`,
      })
      .from(taxPaymentEvents)
      .where(and(...orgScopeAlive(taxPaymentEvents, ctx.orgId)));

    return {
      summary: {
        periodYear: input.periodYear,
        periodMonth: input.periodMonth,
        vatInput,
        vatOutput,
        pp36,
        filings,
        payments,
      },
    };
  },
};

const previewRecodeDocumentsTool: AccountingTool<
  { query: string; targetAccountCode: string; limit: number },
  { rows: Record<string, unknown>[] }
> = {
  name: "preview_recode_documents",
  description: "Preview draft document category recoding to a target GL account without mutating records.",
  inputSchema: previewRecodeDocumentsInputSchema,
  outputSchema: genericRowsOutputSchema,
  requiredRole: "accountant",
  risk: "draft",
  previewRequired: true,
  async execute(input, ctx) {
    const [targetAccount] = await db
      .select({
        id: glAccounts.id,
        accountCode: glAccounts.accountCode,
        nameEn: glAccounts.nameEn,
        accountType: glAccounts.accountType,
      })
      .from(glAccounts)
      .where(
        and(
          ...orgScope(glAccounts, ctx.orgId),
          eq(glAccounts.accountCode, input.targetAccountCode),
          isNull(glAccounts.deletedAt)
        )
      )
      .limit(1);

    if (!targetAccount) {
      throw new Error("Target GL account not found");
    }

    const rows = await db
      .select({
        id: documents.id,
        documentNumber: documents.documentNumber,
        status: documents.status,
        direction: documents.direction,
        issueDate: documents.issueDate,
        totalAmountThb: documents.totalAmountThb,
        currentCategory: documents.category,
      })
      .from(documents)
      .where(
        and(
          ...orgScope(documents, ctx.orgId),
          or(
            ilike(documents.documentNumber, `%${input.query}%`),
            ilike(documents.category, `%${input.query}%`),
            sql`${documents.status}::text ILIKE ${`%${input.query}%`}`
          )
        )
      )
      .orderBy(desc(documents.createdAt))
      .limit(input.limit);

    return {
      rows: rows.map((row) => ({
        ...row,
        targetAccountCode: targetAccount.accountCode,
        targetAccountName: targetAccount.nameEn,
        targetAccountType: targetAccount.accountType,
        canApply: row.status === "draft",
        blockedReason:
          row.status === "draft"
            ? null
            : "Only draft documents can be recoded by a future apply tool",
      })),
    };
  },
};

const createAccountantReviewTaskTool: AccountingTool<
  {
    summary: string;
    severity: "info" | "p2" | "p1" | "p0";
    entityType: string;
    notes?: string;
  },
  { summary: Record<string, unknown> }
> = {
  name: "create_accountant_review_task",
  description: "Create an open accountant review task in the exception queue.",
  inputSchema: createReviewTaskInputSchema,
  outputSchema: summaryOutputSchema,
  requiredRole: "accountant",
  risk: "write",
  previewRequired: false,
  async execute(input, ctx) {
    const entityId = randomUUID();
    const [task] = await db
      .insert(exceptionQueue)
      .values({
        orgId: ctx.orgId,
        entityType: input.entityType,
        entityId,
        exceptionType: "copilot_accountant_review_task",
        severity: input.severity,
        summary: input.summary,
        payload: {
          notes: input.notes ?? null,
          createdByUserId: ctx.userId,
          source: "copilot",
        },
      })
      .returning({
        id: exceptionQueue.id,
        entityId: exceptionQueue.entityId,
        severity: exceptionQueue.severity,
        summary: exceptionQueue.summary,
      });

    return { summary: task };
  },
};

const applyRecodeDocumentsTool: AccountingTool<
  {
    query: string;
    targetAccountCode: string;
    confirmationText: string;
    limit: number;
  },
  { summary: Record<string, unknown> }
> = {
  name: "apply_recode_documents",
  description: "Apply a confirmed account-code recode to draft document line items only.",
  inputSchema: applyRecodeDocumentsInputSchema,
  outputSchema: summaryOutputSchema,
  requiredRole: "accountant",
  risk: "bulk_write",
  previewRequired: true,
  async execute(input, ctx) {
    if (input.confirmationText !== "APPLY RECODE") {
      throw new Error("Confirmation text must be APPLY RECODE");
    }

    return db.transaction(async (tx) => {
      const [targetAccount] = await tx
        .select({ accountCode: glAccounts.accountCode })
        .from(glAccounts)
        .where(
          and(
            ...orgScope(glAccounts, ctx.orgId),
            eq(glAccounts.accountCode, input.targetAccountCode),
            isNull(glAccounts.deletedAt)
          )
        )
        .limit(1);

      if (!targetAccount) {
        throw new Error("Target GL account not found");
      }

      const candidates = await tx
        .select({
          id: documents.id,
          documentNumber: documents.documentNumber,
          status: documents.status,
          vatPeriodYear: documents.vatPeriodYear,
          vatPeriodMonth: documents.vatPeriodMonth,
        })
        .from(documents)
        .where(
          and(
            ...orgScope(documents, ctx.orgId),
            or(
              ilike(documents.documentNumber, `%${input.query}%`),
              ilike(documents.category, `%${input.query}%`)
            )
          )
        )
        .orderBy(desc(documents.createdAt))
        .limit(input.limit);

      const periodPairs = candidates
        .filter((row) => row.vatPeriodYear && row.vatPeriodMonth)
        .map((row) => ({
          year: row.vatPeriodYear!,
          month: row.vatPeriodMonth!,
        }));
      const lockedPeriods =
        periodPairs.length === 0
          ? []
          : await tx
              .select({
                periodYear: periodLocks.periodYear,
                periodMonth: periodLocks.periodMonth,
              })
              .from(periodLocks)
              .where(
                and(
                  eq(periodLocks.orgId, ctx.orgId),
                  isNull(periodLocks.unlockedAt),
                  sql`${periodLocks.domain} IN ('gl', 'vat', 'vat_pp30', 'vat_pp36')`,
                  or(
                    ...periodPairs.map(
                      (pair) =>
                        sql`(${periodLocks.periodYear} = ${pair.year} AND ${periodLocks.periodMonth} = ${pair.month})`
                    )
                  )
                )
              );
      const lockedPeriodKeys = new Set(
        lockedPeriods.map((lock) => `${lock.periodYear}-${lock.periodMonth}`)
      );
      const eligibleDrafts = candidates.filter(
        (row) =>
          row.status === "draft" &&
          !(
            row.vatPeriodYear &&
            row.vatPeriodMonth &&
            lockedPeriodKeys.has(`${row.vatPeriodYear}-${row.vatPeriodMonth}`)
          )
      );
      const draftIds = eligibleDrafts
        .filter((row) => row.status === "draft")
        .map((row) => row.id);
      if (draftIds.length === 0) {
        return {
          summary: {
            targetAccountCode: targetAccount.accountCode,
            updatedLineCount: 0,
            updatedDocumentCount: 0,
            skippedNonDraftCount: candidates.filter((row) => row.status !== "draft").length,
            skippedLockedPeriodCount: candidates.filter(
              (row) =>
                row.status === "draft" &&
                row.vatPeriodYear &&
                row.vatPeriodMonth &&
                lockedPeriodKeys.has(`${row.vatPeriodYear}-${row.vatPeriodMonth}`)
            ).length,
            draftsWithNoLinesCount: 0,
          },
        };
      }

      const updatedLines = await tx
        .update(documentLineItems)
        .set({ accountCode: targetAccount.accountCode, updatedAt: new Date() })
        .where(
          and(
            eq(documentLineItems.orgId, ctx.orgId),
            inArray(documentLineItems.documentId, draftIds),
            isNull(documentLineItems.deletedAt)
          )
        )
        .returning({
          id: documentLineItems.id,
          documentId: documentLineItems.documentId,
        });

      const updatedDocumentIds = new Set(
        updatedLines.map((line) => line.documentId)
      );

      return {
        summary: {
          targetAccountCode: targetAccount.accountCode,
          updatedLineCount: updatedLines.length,
          updatedDocumentCount: updatedDocumentIds.size,
          skippedNonDraftCount: candidates.filter((row) => row.status !== "draft").length,
          skippedLockedPeriodCount: candidates.filter(
            (row) =>
              row.status === "draft" &&
              row.vatPeriodYear &&
              row.vatPeriodMonth &&
              lockedPeriodKeys.has(`${row.vatPeriodYear}-${row.vatPeriodMonth}`)
          ).length,
          draftsWithNoLinesCount: draftIds.length - updatedDocumentIds.size,
        },
      };
    });
  },
};

export const copilotTools: Record<
  RegisteredCopilotTool,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  AccountingTool<any, any>
> = {
  search_documents: searchDocumentsTool,
  search_vendors: searchVendorsTool,
  search_accounts: searchAccountsTool,
  list_open_exceptions: listOpenExceptionsTool,
  get_tax_position: getTaxPositionTool,
  preview_recode_documents: previewRecodeDocumentsTool,
  create_accountant_review_task: createAccountantReviewTaskTool,
  apply_recode_documents: applyRecodeDocumentsTool,
};

function currentBangkokTaxPeriod() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());
  return {
    periodYear: Number(parts.find((part) => part.type === "year")?.value),
    periodMonth: Number(parts.find((part) => part.type === "month")?.value),
  };
}

function compactPromptQuery(prompt: string, max = 120) {
  const quoted = prompt.match(/"([^"]+)"/)?.[1] ?? prompt.match(/'([^']+)'/)?.[1];
  const value = (quoted ?? prompt)
    .replace(/\b(find|search|show|list|vendor|supplier|document|invoice|account|gl|coa|for)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return (value || prompt).slice(0, max);
}

function periodFromPrompt(prompt: string) {
  const match = prompt.match(/\b(20\d{2})[-/](0?[1-9]|1[0-2])\b/);
  if (!match) return currentBangkokTaxPeriod();
  return {
    periodYear: Number(match[1]),
    periodMonth: Number(match[2]),
  };
}

export function interpretCopilotPrompt(prompt: string): {
  toolName: RegisteredCopilotTool;
  rawInput: unknown;
  explanation: string;
} {
  const normalized = prompt.toLowerCase();
  if (/\b(review task|accountant review|create task|exception task)\b/.test(normalized)) {
    return {
      toolName: "create_accountant_review_task",
      rawInput: {
        summary: prompt.slice(0, 240),
        severity: normalized.includes("urgent") ? "p1" : "p2",
      },
      explanation: "Created a safe accountant review task from the prompt.",
    };
  }

  if (/\b(recode|reclass|reclassify|move to account)\b/.test(normalized)) {
    const targetAccountCode = prompt.match(/\b[1-9]\d{3}\b/)?.[0] ?? "";
    return {
      toolName: "preview_recode_documents",
      rawInput: {
        query: compactPromptQuery(prompt),
        targetAccountCode,
        limit: 10,
      },
      explanation:
        "Routed to preview-only document recode. Applying changes still requires the explicit apply tool confirmation.",
    };
  }

  if (/\b(tax position|vat|pp30|pp 30|pp36|pp 36)\b/.test(normalized)) {
    return {
      toolName: "get_tax_position",
      rawInput: periodFromPrompt(prompt),
      explanation: "Routed to period tax-position summary.",
    };
  }

  if (/\b(exception|review queue|open issue|open task)\b/.test(normalized)) {
    return {
      toolName: "list_open_exceptions",
      rawInput: {},
      explanation: "Routed to open exception queue.",
    };
  }

  if (/\b(vendor|supplier|payee)\b/.test(normalized)) {
    return {
      toolName: "search_vendors",
      rawInput: { query: compactPromptQuery(prompt), limit: 10 },
      explanation: "Routed to vendor search.",
    };
  }

  if (/\b(account|coa|gl)\b/.test(normalized)) {
    return {
      toolName: "search_accounts",
      rawInput: { query: compactPromptQuery(prompt), limit: 10 },
      explanation: "Routed to chart-of-accounts search.",
    };
  }

  return {
    toolName: "search_documents",
    rawInput: { query: compactPromptQuery(prompt), limit: 10 },
    explanation: "Routed to document search.",
  };
}

export async function executeCopilotTool(data: {
  orgId: string;
  userId: string;
  actorRole?: RequiredRole;
  toolName: RegisteredCopilotTool;
  rawInput: unknown;
}) {
  const toolName = registeredCopilotToolSchema.parse(data.toolName);
  const tool = copilotTools[toolName];
  const actorRole = data.actorRole ?? "staff";
  const session = await ensureSession({
    orgId: data.orgId,
    userId: data.userId,
    role: actorRole,
  });

  await db.insert(copilotMessages).values({
    orgId: data.orgId,
    sessionId: session.id,
    role: "user",
    content: `Run ${tool.name}`,
    toolName: tool.name,
    payload: data.rawInput,
  });

  try {
    if (!roleSatisfies(actorRole, tool.requiredRole)) {
      throw new Error(`Tool requires ${tool.requiredRole} role`);
    }
    const input = tool.inputSchema.parse(data.rawInput);
    const output = await tool.execute(input, {
      orgId: data.orgId,
      userId: data.userId,
      role: actorRole,
    });
    const validatedOutput = tool.outputSchema.parse(output);

    await db.insert(copilotToolEvents).values({
      orgId: data.orgId,
      sessionId: session.id,
      toolName: tool.name,
      risk: tool.risk,
      previewRequired: tool.previewRequired,
      status: "succeeded",
      input,
      output: validatedOutput,
      createdByUserId: data.userId,
    });
    await db.insert(copilotMessages).values({
      orgId: data.orgId,
      sessionId: session.id,
      role: "tool",
      content: `${tool.name} returned successfully`,
      toolName: tool.name,
      payload: validatedOutput,
    });

    return { session, tool, output: validatedOutput };
  } catch (error) {
    await db.insert(copilotToolEvents).values({
      orgId: data.orgId,
      sessionId: session.id,
      toolName: tool.name,
      risk: tool.risk,
      previewRequired: tool.previewRequired,
      status: "failed",
      input: data.rawInput,
      error: error instanceof Error ? error.message : "Tool failed",
      createdByUserId: data.userId,
    });
    throw error;
  }
}

export async function executeCopilotPrompt(data: {
  orgId: string;
  userId: string;
  actorRole?: RequiredRole;
  prompt: string;
}) {
  const prompt = data.prompt.trim();
  if (!prompt) throw new Error("Copilot prompt is required");
  const session = await ensureSession({
    orgId: data.orgId,
    userId: data.userId,
    role: data.actorRole ?? "staff",
  });
  await db.insert(copilotMessages).values({
    orgId: data.orgId,
    sessionId: session.id,
    role: "user",
    content: prompt,
    payload: { source: "natural_language_prompt" },
  });

  const interpretation = interpretCopilotPrompt(prompt);
  const result = await executeCopilotTool({
    orgId: data.orgId,
    userId: data.userId,
    actorRole: data.actorRole,
    toolName: interpretation.toolName,
    rawInput: interpretation.rawInput,
  });

  await db.insert(copilotMessages).values({
    orgId: data.orgId,
    sessionId: result.session.id,
    role: "assistant",
    content: interpretation.explanation,
    toolName: interpretation.toolName,
    payload: interpretation,
  });

  return {
    ...result,
    interpretation,
  };
}

export async function getCopilotDashboard(orgId: string, userId: string) {
  const session = await ensureSession({ orgId, userId, role: "staff" });
  const recentEvents = await db
    .select()
    .from(copilotToolEvents)
    .where(and(...orgScopeAlive(copilotToolEvents, orgId)))
    .orderBy(desc(copilotToolEvents.createdAt))
    .limit(20);

  return {
    session,
    recentEvents,
    tools: Object.values(copilotTools).map((tool) => ({
      name: tool.name,
      description: tool.description,
      risk: tool.risk,
      previewRequired: tool.previewRequired,
      requiredRole: tool.requiredRole,
    })),
  };
}
