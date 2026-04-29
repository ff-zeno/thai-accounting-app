import { and, eq, isNull } from "drizzle-orm";
import { db, type DbConnection } from "../index";
import { exceptionQueue } from "../schema";

export type ExceptionSeverity = "info" | "p2" | "p1" | "p0";

export interface CreateOpenExceptionInput {
  orgId: string;
  entityType: string;
  entityId: string;
  exceptionType: string;
  severity: ExceptionSeverity;
  summary: string;
  payload?: unknown;
}

export async function createOpenException(
  input: CreateOpenExceptionInput,
  tx?: DbConnection
): Promise<{ id: string } | null> {
  const conn = tx ?? db;
  const [created] = await conn
    .insert(exceptionQueue)
    .values({
      orgId: input.orgId,
      entityType: input.entityType,
      entityId: input.entityId,
      exceptionType: input.exceptionType,
      severity: input.severity,
      summary: input.summary,
      payload: input.payload ?? null,
    })
    .onConflictDoNothing()
    .returning({ id: exceptionQueue.id });

  return created ?? null;
}

export async function resolveOpenExceptionsForEntity(
  orgId: string,
  entityType: string,
  entityId: string,
  exceptionType: string,
  resolution: string,
  tx?: DbConnection
): Promise<void> {
  const conn = tx ?? db;
  await conn
    .update(exceptionQueue)
    .set({
      resolvedAt: new Date(),
      resolution,
    })
    .where(
      and(
        eq(exceptionQueue.orgId, orgId),
        eq(exceptionQueue.entityType, entityType),
        eq(exceptionQueue.entityId, entityId),
        eq(exceptionQueue.exceptionType, exceptionType),
        isNull(exceptionQueue.resolvedAt)
      )
    );
}
