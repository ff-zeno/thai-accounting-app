import { and, eq, gte, lte, sql, desc, isNull } from "drizzle-orm";
import { db } from "../index";
import { orgAiSettings, documentFiles } from "../schema";

// ---------------------------------------------------------------------------
// Settings CRUD
// ---------------------------------------------------------------------------

export async function getOrgAiSettings(orgId: string) {
  const [row] = await db
    .select()
    .from(orgAiSettings)
    .where(eq(orgAiSettings.orgId, orgId))
    .limit(1);
  return row ?? null;
}

export async function upsertOrgAiSettings(
  orgId: string,
  data: {
    extractionModel?: string | null;
    classificationModel?: string | null;
    translationModel?: string | null;
    monthlyBudgetUsd?: string | null;
    budgetAlertThreshold?: string | null;
  }
) {
  const [row] = await db
    .insert(orgAiSettings)
    .values({ orgId, ...data })
    .onConflictDoUpdate({
      target: orgAiSettings.orgId,
      set: { ...data },
    })
    .returning();
  return row;
}

// ---------------------------------------------------------------------------
// Analytics (all org-scoped, date-ranged)
// ---------------------------------------------------------------------------

export async function getAiCostSummary(
  orgId: string,
  start: Date,
  end: Date
) {
  const [row] = await db
    .select({
      totalCost: sql<string>`coalesce(sum(${documentFiles.aiCostUsd}), 0)`,
      totalFiles: sql<number>`count(*)::int`,
      totalInputTokens: sql<number>`coalesce(sum(${documentFiles.aiInputTokens}), 0)::int`,
      totalOutputTokens: sql<number>`coalesce(sum(${documentFiles.aiOutputTokens}), 0)::int`,
      avgCost: sql<string>`coalesce(avg(${documentFiles.aiCostUsd}), 0)`,
    })
    .from(documentFiles)
    .where(
      and(
        eq(documentFiles.orgId, orgId),
        gte(documentFiles.createdAt, start),
        lte(documentFiles.createdAt, end),
        isNull(documentFiles.deletedAt),
        sql`${documentFiles.aiCostUsd} is not null`
      )
    );
  return row;
}

export async function getAiCostByDay(
  orgId: string,
  start: Date,
  end: Date
) {
  return db
    .select({
      date: sql<string>`date(${documentFiles.createdAt})`,
      cost: sql<string>`coalesce(sum(${documentFiles.aiCostUsd}), 0)`,
      files: sql<number>`count(*)::int`,
    })
    .from(documentFiles)
    .where(
      and(
        eq(documentFiles.orgId, orgId),
        gte(documentFiles.createdAt, start),
        lte(documentFiles.createdAt, end),
        isNull(documentFiles.deletedAt),
        sql`${documentFiles.aiCostUsd} is not null`
      )
    )
    .groupBy(sql`date(${documentFiles.createdAt})`)
    .orderBy(sql`date(${documentFiles.createdAt})`);
}

export async function getAiCostByModel(
  orgId: string,
  start: Date,
  end: Date
) {
  return db
    .select({
      model: documentFiles.aiModelUsed,
      cost: sql<string>`coalesce(sum(${documentFiles.aiCostUsd}), 0)`,
      files: sql<number>`count(*)::int`,
    })
    .from(documentFiles)
    .where(
      and(
        eq(documentFiles.orgId, orgId),
        gte(documentFiles.createdAt, start),
        lte(documentFiles.createdAt, end),
        isNull(documentFiles.deletedAt),
        sql`${documentFiles.aiCostUsd} is not null`
      )
    )
    .groupBy(documentFiles.aiModelUsed)
    .orderBy(sql`sum(${documentFiles.aiCostUsd}) desc`);
}

export async function getAiCostByPurpose(
  orgId: string,
  start: Date,
  end: Date
) {
  return db
    .select({
      purpose: documentFiles.aiPurpose,
      cost: sql<string>`coalesce(sum(${documentFiles.aiCostUsd}), 0)`,
      files: sql<number>`count(*)::int`,
    })
    .from(documentFiles)
    .where(
      and(
        eq(documentFiles.orgId, orgId),
        gte(documentFiles.createdAt, start),
        lte(documentFiles.createdAt, end),
        isNull(documentFiles.deletedAt),
        sql`${documentFiles.aiCostUsd} is not null`
      )
    )
    .groupBy(documentFiles.aiPurpose)
    .orderBy(sql`sum(${documentFiles.aiCostUsd}) desc`);
}

export async function getRecentAiUsage(orgId: string, limit: number = 20) {
  return db
    .select({
      id: documentFiles.id,
      originalFilename: documentFiles.originalFilename,
      aiModelUsed: documentFiles.aiModelUsed,
      aiPurpose: documentFiles.aiPurpose,
      aiInputTokens: documentFiles.aiInputTokens,
      aiOutputTokens: documentFiles.aiOutputTokens,
      aiCostUsd: documentFiles.aiCostUsd,
      createdAt: documentFiles.createdAt,
    })
    .from(documentFiles)
    .where(
      and(
        eq(documentFiles.orgId, orgId),
        isNull(documentFiles.deletedAt),
        sql`${documentFiles.aiCostUsd} is not null`
      )
    )
    .orderBy(desc(documentFiles.createdAt))
    .limit(limit);
}

export async function getCurrentMonthCost(orgId: string) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
  return getAiCostSummary(orgId, start, end);
}
