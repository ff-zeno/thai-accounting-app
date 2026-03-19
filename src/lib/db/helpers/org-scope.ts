/**
 * Org-scoping helpers for Drizzle ORM queries.
 *
 * Every query in this multi-tenant app MUST include `WHERE org_id = ?`.
 * Most tables also require `AND deleted_at IS NULL` for soft-delete filtering.
 * These helpers generate the standard conditions so callers can't forget them.
 *
 * @example Basic usage — table with orgId and deletedAt (most tables):
 * ```ts
 * import { orgScope } from "@/lib/db/helpers/org-scope";
 *
 * // Returns: [eq(vendors.orgId, orgId), isNull(vendors.deletedAt)]
 * const conditions = orgScope(vendors, orgId);
 *
 * const rows = await db
 *   .select()
 *   .from(vendors)
 *   .where(and(...conditions, eq(vendors.taxId, taxId)));
 * ```
 *
 * @example Tables without deletedAt (audit_log, wht_rates, etc.):
 * ```ts
 * import { orgScopeAlive } from "@/lib/db/helpers/org-scope";
 *
 * // Returns: [eq(auditLog.orgId, orgId)]
 * const conditions = orgScopeAlive(auditLog, orgId);
 *
 * const rows = await db
 *   .select()
 *   .from(auditLog)
 *   .where(and(...conditions, eq(auditLog.entityType, "document")));
 * ```
 *
 * @example Spreading into existing condition arrays:
 * ```ts
 * function buildConditions(filters: TransactionFilters): SQL[] {
 *   const conditions: SQL[] = [
 *     ...orgScope(transactions, filters.orgId),
 *   ];
 *   if (filters.bankAccountId) {
 *     conditions.push(eq(transactions.bankAccountId, filters.bankAccountId));
 *   }
 *   return conditions;
 * }
 * ```
 */

import { eq, isNull, type SQL } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";

// A table that has an orgId column (all org-scoped tables)
type TableWithOrgId = PgTable & {
  orgId: PgColumn;
};

// A table that also has a deletedAt column (most tables, but not all)
type TableWithSoftDelete = TableWithOrgId & {
  deletedAt: PgColumn;
};

/**
 * Generate WHERE conditions for org-scoping AND soft-delete filtering.
 * Use this for most tables (vendors, documents, transactions, etc.).
 *
 * Returns `[eq(table.orgId, orgId), isNull(table.deletedAt)]`
 */
export function orgScope<T extends TableWithSoftDelete>(
  table: T,
  orgId: string,
): [SQL, SQL] {
  return [eq(table.orgId, orgId), isNull(table.deletedAt)];
}

/**
 * Generate WHERE conditions for org-scoping only (no soft-delete check).
 * Use this for tables without deletedAt: audit_log, wht_sequence_counters,
 * org_ai_settings, etc.
 *
 * Returns `[eq(table.orgId, orgId)]`
 */
export function orgScopeAlive<T extends TableWithOrgId>(
  table: T,
  orgId: string,
): [SQL] {
  return [eq(table.orgId, orgId)];
}
