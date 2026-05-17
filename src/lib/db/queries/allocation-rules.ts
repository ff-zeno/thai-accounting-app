import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "../index";
import {
  allocationRuleTargets,
  allocationRules,
  costCenters,
  projects,
} from "../schema";

export type AllocationSourceType = "gl_account" | "vendor" | "category";

export interface AllocationTargetInput {
  costCenterId?: string;
  projectId?: string;
  percentage: string;
  notes?: string;
}

function normalizePercent(value: string) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0 || numeric > 1) {
    throw new Error("Allocation target percentage must be between 0 and 1");
  }
  return numeric.toFixed(4);
}

function assertTargetsTotalOne(targets: AllocationTargetInput[]) {
  const total = targets.reduce((sum, target) => sum + Number(target.percentage), 0);
  if (Math.abs(total - 1) > 0.0001) {
    throw new Error("Allocation targets must total 1.0000");
  }
}

export async function getAllocationRules(orgId: string) {
  const rows = await db
    .select({
      ruleId: allocationRules.id,
      ruleName: allocationRules.ruleName,
      sourceType: allocationRules.sourceType,
      sourceId: allocationRules.sourceId,
      sourceKey: allocationRules.sourceKey,
      isActive: allocationRules.isActive,
      effectiveFrom: allocationRules.effectiveFrom,
      effectiveTo: allocationRules.effectiveTo,
      targetId: allocationRuleTargets.id,
      percentage: allocationRuleTargets.percentage,
      notes: allocationRuleTargets.notes,
      costCenterId: allocationRuleTargets.costCenterId,
      costCenterCode: costCenters.code,
      costCenterName: costCenters.nameEn,
      projectId: allocationRuleTargets.projectId,
      projectCode: projects.code,
      projectName: projects.nameEn,
    })
    .from(allocationRules)
    .leftJoin(
      allocationRuleTargets,
      and(
        eq(allocationRuleTargets.allocationRuleId, allocationRules.id),
        eq(allocationRuleTargets.orgId, allocationRules.orgId),
        isNull(allocationRuleTargets.deletedAt)
      )
    )
    .leftJoin(
      costCenters,
      and(
        eq(costCenters.id, allocationRuleTargets.costCenterId),
        eq(costCenters.orgId, allocationRuleTargets.orgId)
      )
    )
    .leftJoin(
      projects,
      and(
        eq(projects.id, allocationRuleTargets.projectId),
        eq(projects.orgId, allocationRuleTargets.orgId)
      )
    )
    .where(and(eq(allocationRules.orgId, orgId), isNull(allocationRules.deletedAt)))
    .orderBy(asc(allocationRules.ruleName), asc(allocationRuleTargets.createdAt));

  const byRule = new Map<
    string,
    {
      id: string;
      ruleName: string;
      sourceType: string;
      sourceId: string | null;
      sourceKey: string | null;
      isActive: boolean;
      effectiveFrom: string | null;
      effectiveTo: string | null;
      targets: Array<{
        id: string;
        percentage: string;
        notes: string | null;
        costCenterId: string | null;
        costCenterCode: string | null;
        costCenterName: string | null;
        projectId: string | null;
        projectCode: string | null;
        projectName: string | null;
      }>;
    }
  >();

  for (const row of rows) {
    let rule = byRule.get(row.ruleId);
    if (!rule) {
      rule = {
        id: row.ruleId,
        ruleName: row.ruleName,
        sourceType: row.sourceType,
        sourceId: row.sourceId,
        sourceKey: row.sourceKey,
        isActive: row.isActive,
        effectiveFrom: row.effectiveFrom,
        effectiveTo: row.effectiveTo,
        targets: [],
      };
      byRule.set(row.ruleId, rule);
    }
    if (row.targetId && row.percentage) {
      rule.targets.push({
        id: row.targetId,
        percentage: row.percentage,
        notes: row.notes,
        costCenterId: row.costCenterId,
        costCenterCode: row.costCenterCode,
        costCenterName: row.costCenterName,
        projectId: row.projectId,
        projectCode: row.projectCode,
        projectName: row.projectName,
      });
    }
  }

  return Array.from(byRule.values());
}

export async function createAllocationRule(data: {
  orgId: string;
  ruleName: string;
  sourceType: AllocationSourceType;
  sourceId?: string;
  sourceKey?: string;
  effectiveFrom?: string;
  effectiveTo?: string;
  targets: AllocationTargetInput[];
}) {
  if (data.targets.length === 0) throw new Error("At least one target is required");
  const targets = data.targets.map((target) => ({
    ...target,
    percentage: normalizePercent(target.percentage),
  }));
  assertTargetsTotalOne(targets);
  const normalizedSourceKey =
    data.sourceType === "category"
      ? (data.sourceKey ?? data.sourceId)?.trim().toLowerCase() || null
      : null;
  if (data.sourceType === "category" && !normalizedSourceKey) {
    throw new Error("Category allocation rules require a source key");
  }
  if (data.sourceType !== "category" && !data.sourceId) {
    throw new Error("Vendor and GL account allocation rules require a source ID");
  }
  if (
    data.effectiveFrom &&
    data.effectiveTo &&
    data.effectiveFrom > data.effectiveTo
  ) {
    throw new Error("Allocation rule effective-to date must be on or after effective-from date");
  }

  return db.transaction(async (tx) => {
    for (const target of targets) {
      if (!target.costCenterId && !target.projectId) {
        throw new Error("Each allocation target requires a cost center or project");
      }
      if (target.costCenterId) {
        const [costCenter] = await tx
          .select({ id: costCenters.id })
          .from(costCenters)
          .where(
            and(
              eq(costCenters.orgId, data.orgId),
              eq(costCenters.id, target.costCenterId),
              isNull(costCenters.deletedAt)
            )
          )
          .limit(1);
        if (!costCenter) {
          throw new Error("Allocation target cost center must belong to this organization");
        }
      }
      if (target.projectId) {
        const [project] = await tx
          .select({ id: projects.id })
          .from(projects)
          .where(
            and(
              eq(projects.orgId, data.orgId),
              eq(projects.id, target.projectId),
              isNull(projects.deletedAt)
            )
          )
          .limit(1);
        if (!project) {
          throw new Error("Allocation target project must belong to this organization");
        }
      }
    }

    const [rule] = await tx
      .insert(allocationRules)
      .values({
        orgId: data.orgId,
        ruleName: data.ruleName.trim(),
        sourceType: data.sourceType,
        sourceId: data.sourceType === "category" ? null : data.sourceId || null,
        sourceKey: normalizedSourceKey,
        effectiveFrom: data.effectiveFrom || null,
        effectiveTo: data.effectiveTo || null,
      })
      .returning();

    await tx.insert(allocationRuleTargets).values(
      targets.map((target) => ({
        orgId: data.orgId,
        allocationRuleId: rule.id,
        costCenterId: target.costCenterId || null,
        projectId: target.projectId || null,
        percentage: target.percentage,
        notes: target.notes?.trim() || null,
      }))
    );

    return rule;
  });
}
