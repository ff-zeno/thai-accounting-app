"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getVerifiedOrgId } from "@/lib/utils/org-context";
import { getCurrentUserId } from "@/lib/utils/auth";
import {
  createRule,
  updateRule,
  deleteRule,
  toggleRuleActive,
  getAllRules,
  getRulesByTemplateId,
  swapRulePriorities,
  type RuleCondition,
  type RuleAction,
} from "@/lib/db/queries/reconciliation-rules";
import { getTemplateById } from "@/lib/reconciliation/templates";
import { auditMutation } from "@/lib/db/helpers/audit-log";

// ---------------------------------------------------------------------------
// Apply business template
// ---------------------------------------------------------------------------

export async function applyBusinessTemplateAction(
  templateId: string,
): Promise<{ success: true; rulesCreated: number; rulesSkipped: number } | { error: string }> {
  const orgId = await getVerifiedOrgId();
  if (!orgId) return { error: "No organization selected" };
  const actorId = (await getCurrentUserId()) ?? undefined;

  const template = getTemplateById(templateId);
  if (!template) return { error: "Template not found" };

  // Get existing rules from this template to dedup
  const existing = await getRulesByTemplateId(orgId, templateId);
  const existingNames = new Set(existing.map((r) => r.name));

  let created = 0;
  let skipped = 0;

  for (const rule of template.rules) {
    if (existingNames.has(rule.name)) {
      skipped++;
      continue;
    }

    const ruleId = await createRule({
      orgId,
      name: rule.name,
      description: rule.description,
      priority: rule.priority,
      conditions: rule.conditions,
      actions: rule.actions,
      templateId,
    });

    await auditMutation({
      orgId,
      entityType: "reconciliation_rules",
      entityId: ruleId,
      action: "create",
      newValue: { name: rule.name, templateId },
      actorId,
    });

    created++;
  }

  revalidatePath("/settings/reconciliation-rules");
  return { success: true, rulesCreated: created, rulesSkipped: skipped };
}

// ---------------------------------------------------------------------------
// Create rule
// ---------------------------------------------------------------------------

const conditionSchema = z.object({
  field: z.enum([
    "counterparty", "description", "amount", "channel",
    "bank_account", "type", "reference_no", "day_of_month",
  ]),
  operator: z.enum([
    "contains", "starts_with", "ends_with", "equals",
    "regex", "gt", "lt", "between",
  ]),
  value: z.union([z.string(), z.number(), z.tuple([z.number(), z.number()])]),
});

const actionSchema = z.object({
  type: z.enum([
    "assign_vendor", "assign_category", "auto_match",
    "mark_petty_cash", "skip_reconciliation",
  ]),
  value: z.string(),
});

const ruleFormSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  priority: z.number().int().min(1),
  conditions: z.array(conditionSchema).min(1, "At least one condition required"),
  actions: z.array(actionSchema).min(1, "At least one action required"),
});

export async function createRuleAction(
  input: z.infer<typeof ruleFormSchema>,
): Promise<{ success: true; ruleId: string } | { error: string }> {
  const orgId = await getVerifiedOrgId();
  if (!orgId) return { error: "No organization selected" };
  const actorId = (await getCurrentUserId()) ?? undefined;

  const parsed = ruleFormSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const ruleId = await createRule({
    orgId,
    name: parsed.data.name,
    description: parsed.data.description,
    priority: parsed.data.priority,
    conditions: parsed.data.conditions as RuleCondition[],
    actions: parsed.data.actions as RuleAction[],
  });

  await auditMutation({
    orgId,
    entityType: "reconciliation_rules",
    entityId: ruleId,
    action: "create",
    newValue: { name: parsed.data.name },
    actorId,
  });

  revalidatePath("/settings/reconciliation-rules");
  return { success: true, ruleId };
}

// ---------------------------------------------------------------------------
// Update rule
// ---------------------------------------------------------------------------

export async function updateRuleAction(
  ruleId: string,
  input: z.infer<typeof ruleFormSchema>,
): Promise<{ success: true } | { error: string }> {
  const orgId = await getVerifiedOrgId();
  if (!orgId) return { error: "No organization selected" };
  const actorId = (await getCurrentUserId()) ?? undefined;

  const parsed = ruleFormSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  await updateRule(orgId, ruleId, {
    name: parsed.data.name,
    description: parsed.data.description,
    priority: parsed.data.priority,
    conditions: parsed.data.conditions as RuleCondition[],
    actions: parsed.data.actions as RuleAction[],
  });

  await auditMutation({
    orgId,
    entityType: "reconciliation_rules",
    entityId: ruleId,
    action: "update",
    newValue: { name: parsed.data.name },
    actorId,
  });

  revalidatePath("/settings/reconciliation-rules");
  return { success: true };
}

// ---------------------------------------------------------------------------
// Toggle rule active
// ---------------------------------------------------------------------------

export async function toggleRuleActiveAction(
  ruleId: string,
  isActive: boolean,
): Promise<{ success: true } | { error: string }> {
  const orgId = await getVerifiedOrgId();
  if (!orgId) return { error: "No organization selected" };

  await toggleRuleActive(orgId, ruleId, isActive);
  revalidatePath("/settings/reconciliation-rules");
  return { success: true };
}

// ---------------------------------------------------------------------------
// Delete rule
// ---------------------------------------------------------------------------

export async function deleteRuleAction(
  ruleId: string,
): Promise<{ success: true } | { error: string }> {
  const orgId = await getVerifiedOrgId();
  if (!orgId) return { error: "No organization selected" };
  const actorId = (await getCurrentUserId()) ?? undefined;

  await deleteRule(orgId, ruleId);

  await auditMutation({
    orgId,
    entityType: "reconciliation_rules",
    entityId: ruleId,
    action: "delete",
    actorId,
  });

  revalidatePath("/settings/reconciliation-rules");
  return { success: true };
}

// ---------------------------------------------------------------------------
// Reorder rule (swap with adjacent)
// ---------------------------------------------------------------------------

export async function reorderRuleAction(
  ruleId: string,
  direction: "up" | "down",
): Promise<{ success: true } | { error: string }> {
  const orgId = await getVerifiedOrgId();
  if (!orgId) return { error: "No organization selected" };

  const rules = await getAllRules(orgId);
  const idx = rules.findIndex((r) => r.id === ruleId);
  if (idx === -1) return { error: "Rule not found" };

  const swapIdx = direction === "up" ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= rules.length) return { error: "Cannot move further" };

  await swapRulePriorities(
    orgId,
    rules[idx].id,
    rules[idx].priority,
    rules[swapIdx].id,
    rules[swapIdx].priority,
  );

  revalidatePath("/settings/reconciliation-rules");
  return { success: true };
}
