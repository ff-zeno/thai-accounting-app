import { and, eq, asc, isNull, sql } from "drizzle-orm";
import { db } from "../index";
import { reconciliationRules } from "../schema";
import { orgScope } from "../helpers/org-scope";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RuleCondition {
  field:
    | "counterparty"
    | "description"
    | "amount"
    | "channel"
    | "bank_account"
    | "type"
    | "reference_no"
    | "day_of_month";
  operator:
    | "contains"
    | "starts_with"
    | "ends_with"
    | "equals"
    | "regex"
    | "gt"
    | "lt"
    | "between";
  value: string | number | [number, number];
}

export interface RuleAction {
  type:
    | "assign_vendor"
    | "assign_category"
    | "auto_match"
    | "mark_petty_cash"
    | "skip_reconciliation";
  value: string;
}

// ---------------------------------------------------------------------------
// Get active rules for an org (ordered by priority)
// ---------------------------------------------------------------------------

export async function getActiveRules(orgId: string) {
  return db
    .select()
    .from(reconciliationRules)
    .where(
      and(
        ...orgScope(reconciliationRules, orgId),
        eq(reconciliationRules.isActive, true)
      )
    )
    .orderBy(asc(reconciliationRules.priority));
}

// ---------------------------------------------------------------------------
// Create rule
// ---------------------------------------------------------------------------

export async function createRule(data: {
  orgId: string;
  name: string;
  description?: string;
  priority?: number;
  conditions: RuleCondition[];
  actions: RuleAction[];
  isAutoSuggested?: boolean;
  templateId?: string;
}): Promise<string> {
  const [rule] = await db
    .insert(reconciliationRules)
    .values({
      orgId: data.orgId,
      name: data.name,
      description: data.description,
      priority: data.priority ?? 100,
      conditions: data.conditions,
      actions: data.actions,
      isAutoSuggested: data.isAutoSuggested ?? false,
      templateId: data.templateId,
    })
    .returning({ id: reconciliationRules.id });

  return rule.id;
}

// ---------------------------------------------------------------------------
// Increment rule match counter
// ---------------------------------------------------------------------------

export async function incrementRuleMatchCount(
  orgId: string,
  ruleId: string
) {
  await db
    .update(reconciliationRules)
    .set({
      matchCount: sql`${reconciliationRules.matchCount} + 1`,
      lastMatchedAt: new Date(),
    })
    .where(
      and(
        eq(reconciliationRules.id, ruleId),
        eq(reconciliationRules.orgId, orgId)
      )
    );
}

// ---------------------------------------------------------------------------
// Toggle rule active state
// ---------------------------------------------------------------------------

export async function toggleRuleActive(
  orgId: string,
  ruleId: string,
  isActive: boolean
) {
  await db
    .update(reconciliationRules)
    .set({ isActive })
    .where(
      and(
        eq(reconciliationRules.id, ruleId),
        eq(reconciliationRules.orgId, orgId)
      )
    );
}

// ---------------------------------------------------------------------------
// Soft-delete rule
// ---------------------------------------------------------------------------

export async function deleteRule(orgId: string, ruleId: string) {
  await db
    .update(reconciliationRules)
    .set({ deletedAt: new Date() })
    .where(
      and(
        eq(reconciliationRules.id, ruleId),
        eq(reconciliationRules.orgId, orgId)
      )
    );
}

// ---------------------------------------------------------------------------
// Find similar rule (dedup check for auto-suggested rules).
// Checks both active AND inactive rules — only skips deleted.
// ---------------------------------------------------------------------------

export async function findSimilarRule(
  orgId: string,
  conditions: RuleCondition[],
): Promise<{ id: string; name: string; isActive: boolean } | null> {
  // Get all non-deleted rules for the org and compare conditions in-memory.
  // JSONB equality in Postgres is order-sensitive, so we normalize + compare.
  const allRules = await db
    .select({
      id: reconciliationRules.id,
      name: reconciliationRules.name,
      isActive: reconciliationRules.isActive,
      conditions: reconciliationRules.conditions,
    })
    .from(reconciliationRules)
    .where(
      and(
        eq(reconciliationRules.orgId, orgId),
        isNull(reconciliationRules.deletedAt),
      ),
    );

  const normalize = (c: RuleCondition[]) =>
    JSON.stringify(
      [...c].sort((a, b) =>
        a.field.localeCompare(b.field)
        || a.operator.localeCompare(b.operator)
        || JSON.stringify(a.value).localeCompare(JSON.stringify(b.value)),
      ),
    );

  const target = normalize(conditions);

  for (const rule of allRules) {
    const existing = normalize(rule.conditions as RuleCondition[]);
    if (existing === target) {
      return { id: rule.id, name: rule.name, isActive: rule.isActive };
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Get all rules for an org (including inactive, for management UI)
// ---------------------------------------------------------------------------

export async function getAllRules(orgId: string) {
  return db
    .select()
    .from(reconciliationRules)
    .where(
      and(
        eq(reconciliationRules.orgId, orgId),
        isNull(reconciliationRules.deletedAt),
      ),
    )
    .orderBy(asc(reconciliationRules.priority));
}

// ---------------------------------------------------------------------------
// Get rules by template ID (for dedup on template re-apply)
// ---------------------------------------------------------------------------

export async function getRulesByTemplateId(
  orgId: string,
  templateId: string,
) {
  return db
    .select({ name: reconciliationRules.name })
    .from(reconciliationRules)
    .where(
      and(
        eq(reconciliationRules.orgId, orgId),
        eq(reconciliationRules.templateId, templateId),
        isNull(reconciliationRules.deletedAt),
      ),
    );
}

// ---------------------------------------------------------------------------
// Update rule fields
// ---------------------------------------------------------------------------

export async function updateRule(
  orgId: string,
  ruleId: string,
  data: {
    name?: string;
    description?: string;
    priority?: number;
    conditions?: RuleCondition[];
    actions?: RuleAction[];
  },
) {
  await db
    .update(reconciliationRules)
    .set(data)
    .where(
      and(
        eq(reconciliationRules.id, ruleId),
        eq(reconciliationRules.orgId, orgId),
        isNull(reconciliationRules.deletedAt),
      ),
    );
}

// ---------------------------------------------------------------------------
// Swap priorities between two rules (for reorder)
// ---------------------------------------------------------------------------

export async function swapRulePriorities(
  orgId: string,
  ruleIdA: string,
  priorityA: number,
  ruleIdB: string,
  priorityB: number,
) {
  // Swap: A gets B's priority, B gets A's priority
  await db
    .update(reconciliationRules)
    .set({ priority: priorityB })
    .where(
      and(
        eq(reconciliationRules.id, ruleIdA),
        eq(reconciliationRules.orgId, orgId),
      ),
    );
  await db
    .update(reconciliationRules)
    .set({ priority: priorityA })
    .where(
      and(
        eq(reconciliationRules.id, ruleIdB),
        eq(reconciliationRules.orgId, orgId),
      ),
    );
}
