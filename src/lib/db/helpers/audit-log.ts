import { and, eq, desc } from "drizzle-orm";
import { db } from "../index";
import { auditLog } from "../schema";
import { orgScopeAlive } from "./org-scope";

interface AuditEntry {
  orgId: string;
  entityType: string;
  entityId: string;
  action: "create" | "update" | "delete" | "void";
  oldValue?: Record<string, unknown>;
  newValue?: Record<string, unknown>;
  actorId?: string;
}

/**
 * Write an immutable audit log entry.
 * Call this AFTER the mutation succeeds, not before.
 * Failures are logged but never block the main operation.
 */
export async function auditMutation(entry: AuditEntry): Promise<void> {
  try {
    await db.insert(auditLog).values({
      orgId: entry.orgId,
      entityType: entry.entityType,
      entityId: entry.entityId,
      action: entry.action,
      oldValue: entry.oldValue ?? null,
      newValue: entry.newValue ?? null,
      actorId: entry.actorId ?? null,
    });
  } catch (err) {
    console.error("[audit-log] Failed to write audit entry:", err);
  }
}

/**
 * Convenience: wrap a mutation with automatic audit logging.
 * Captures oldValue before and newValue after the mutation.
 */
export async function withAudit<T>(
  entry: Omit<AuditEntry, "oldValue" | "newValue">,
  getOldValue: () => Promise<Record<string, unknown> | null>,
  mutation: () => Promise<T>,
): Promise<T> {
  const oldValue = await getOldValue();
  const result = await mutation();

  // Capture newValue from the mutation result if it's a plain object
  const newValue =
    result !== null && typeof result === "object" && !Array.isArray(result)
      ? (result as Record<string, unknown>)
      : null;

  await auditMutation({
    ...entry,
    oldValue: oldValue ?? undefined,
    newValue: newValue ?? undefined,
  });

  return result;
}

/**
 * Query audit log for an entity (for UI display).
 */
export async function getAuditHistory(
  orgId: string,
  entityType: string,
  entityId: string,
  limit = 50,
): Promise<Array<typeof auditLog.$inferSelect>> {
  return db
    .select()
    .from(auditLog)
    .where(
      and(
        ...orgScopeAlive(auditLog, orgId),
        eq(auditLog.entityType, entityType),
        eq(auditLog.entityId, entityId),
      ),
    )
    .orderBy(desc(auditLog.createdAt))
    .limit(limit);
}
