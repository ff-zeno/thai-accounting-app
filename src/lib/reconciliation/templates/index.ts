/**
 * Industry rule template registry.
 *
 * Templates are version-controlled TypeScript constants (not DB).
 * Each template provides 5-15 rules with Thai-specific patterns.
 */

import type { RuleCondition, RuleAction } from "@/lib/db/queries/reconciliation-rules";
import { commonRules } from "./common";
import { restaurantRules } from "./restaurant";
import { consultingRules } from "./consulting";
import { ecommerceRules } from "./ecommerce";

export interface RuleTemplate {
  id: string;
  name: string;
  nameTh: string;
  description: string;
  icon: string;
  rules: TemplateRule[];
}

export interface TemplateRule {
  name: string;
  description: string;
  priority: number;
  conditions: RuleCondition[];
  actions: RuleAction[];
}

export const templateRegistry: RuleTemplate[] = [
  commonRules,
  restaurantRules,
  consultingRules,
  ecommerceRules,
];

export function getTemplateById(id: string): RuleTemplate | undefined {
  return templateRegistry.find((t) => t.id === id);
}
