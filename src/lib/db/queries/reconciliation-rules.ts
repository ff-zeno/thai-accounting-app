import { and, eq, asc, sql } from "drizzle-orm";
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
