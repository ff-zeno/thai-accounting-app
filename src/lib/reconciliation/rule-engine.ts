/**
 * Reconciliation rule evaluation engine.
 *
 * Evaluates user-defined rules against transactions. Rules are JSONB-based
 * with flexible conditions and actions. Evaluation is pure — no DB queries
 * inside the loop (all data pre-loaded).
 */

import type { RuleCondition, RuleAction } from "@/lib/db/queries/reconciliation-rules";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TransactionContext {
  id: string;
  amount: string;
  date: string;
  description: string | null;
  counterparty: string | null;
  referenceNo: string | null;
  channel: string | null;
  type: "debit" | "credit";
  bankAccountId: string;
}

export interface RuleRecord {
  id: string;
  name: string;
  priority: number;
  conditions: RuleCondition[];
  actions: RuleAction[];
}

export interface RuleMatch {
  ruleId: string;
  ruleName: string;
  actions: RuleAction[];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Evaluate active rules against a transaction.
 * Rules are evaluated in priority order (lower = higher priority).
 * First rule where ALL conditions pass → return its actions.
 */
export function evaluateRules(
  rules: RuleRecord[],
  transaction: TransactionContext
): RuleMatch | null {
  for (const rule of rules) {
    const allConditionsMet = rule.conditions.every((condition) =>
      evaluateCondition(condition, transaction)
    );

    if (allConditionsMet) {
      return {
        ruleId: rule.id,
        ruleName: rule.name,
        actions: rule.actions,
      };
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Regex safety
// ---------------------------------------------------------------------------

const MAX_REGEX_LENGTH = 200;
// Detect nested quantifiers like (a+)+, (a*)+, (a+)*, (a{2,})+, etc.
const NESTED_QUANTIFIER_RE = /(\+|\*|\{[^}]*\})\s*\)\s*(\+|\*|\{)/;

/**
 * Reject regex patterns likely to cause catastrophic backtracking (ReDoS).
 * Checks for: excessive length, nested quantifiers, and parse validity.
 */
export function isSafeRegex(pattern: string): boolean {
  if (pattern.length > MAX_REGEX_LENGTH) return false;
  if (NESTED_QUANTIFIER_RE.test(pattern)) return false;
  try {
    new RegExp(pattern);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Condition evaluation (pure functions)
// ---------------------------------------------------------------------------

function evaluateCondition(
  condition: RuleCondition,
  transaction: TransactionContext
): boolean {
  const fieldValue = getFieldValue(condition.field, transaction);
  if (fieldValue === null || fieldValue === undefined) return false;

  switch (condition.operator) {
    case "contains":
      return String(fieldValue)
        .toLowerCase()
        .includes(String(condition.value).toLowerCase());

    case "starts_with":
      return String(fieldValue)
        .toLowerCase()
        .startsWith(String(condition.value).toLowerCase());

    case "ends_with":
      return String(fieldValue)
        .toLowerCase()
        .endsWith(String(condition.value).toLowerCase());

    case "equals":
      return String(fieldValue).toLowerCase() === String(condition.value).toLowerCase();

    case "regex": {
      try {
        const pattern = String(condition.value);
        // Reject patterns likely to cause catastrophic backtracking (ReDoS)
        if (!isSafeRegex(pattern)) return false;
        const regex = new RegExp(pattern, "i");
        return regex.test(String(fieldValue));
      } catch {
        return false;
      }
    }

    case "gt":
      return parseFloat(String(fieldValue)) > Number(condition.value);

    case "lt":
      return parseFloat(String(fieldValue)) < Number(condition.value);

    case "between": {
      const val = parseFloat(String(fieldValue));
      const [min, max] = condition.value as [number, number];
      return val >= min && val <= max;
    }

    default:
      return false;
  }
}

function getFieldValue(
  field: RuleCondition["field"],
  transaction: TransactionContext
): string | number | null {
  switch (field) {
    case "counterparty":
      return transaction.counterparty;
    case "description":
      return transaction.description;
    case "amount":
      return transaction.amount;
    case "channel":
      return transaction.channel;
    case "bank_account":
      return transaction.bankAccountId;
    case "type":
      return transaction.type;
    case "reference_no":
      return transaction.referenceNo;
    case "day_of_month":
      return new Date(transaction.date).getDate();
    default:
      return null;
  }
}
