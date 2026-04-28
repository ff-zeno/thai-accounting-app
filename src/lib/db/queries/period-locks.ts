import { and, eq, isNull } from "drizzle-orm";
import { db, type DbConnection } from "../index";
import { periodLocks } from "../schema";
import { orgScopeAlive } from "../helpers/org-scope";
import { auditMutation, isAuditActorId } from "../helpers/audit-log";

export type PeriodLockDomain =
  | "vat"
  | "vat_pp30"
  | "vat_pp36"
  | "wht"
  | "wht_pnd3"
  | "wht_pnd53"
  | "wht_pnd54"
  | "gl"
  | "payroll"
  | "cit"
  | "sso";

export async function isPeriodLocked(
  orgId: string,
  domain: PeriodLockDomain,
  year: number,
  month?: number | null
): Promise<boolean> {
  const conditions = [
    ...orgScopeAlive(periodLocks, orgId),
    eq(periodLocks.domain, domain),
    eq(periodLocks.periodYear, year),
    isNull(periodLocks.unlockedAt),
  ];

  if (month == null) {
    conditions.push(isNull(periodLocks.periodMonth));
  } else {
    conditions.push(eq(periodLocks.periodMonth, month));
  }

  const rows = await db
    .select({ id: periodLocks.id })
    .from(periodLocks)
    .where(and(...conditions))
    .limit(1);

  return rows.length > 0;
}

export async function lockPeriod(data: {
  orgId: string;
  domain: PeriodLockDomain;
  periodYear: number;
  periodMonth?: number | null;
  lockedByUserId: string;
  lockReason: string;
  entityType?: string;
  entityId?: string;
  tx?: DbConnection;
}): Promise<string> {
  const conn = data.tx ?? db;
  const [lock] = await conn
    .insert(periodLocks)
    .values({
      orgId: data.orgId,
      domain: data.domain,
      periodYear: data.periodYear,
      periodMonth: data.periodMonth ?? null,
      lockedByUserId: data.lockedByUserId,
      lockReason: data.lockReason,
    })
    .onConflictDoNothing()
    .returning({ id: periodLocks.id });

  if (!lock) {
    const existing = await conn
      .select({ id: periodLocks.id })
      .from(periodLocks)
      .where(
        and(
          ...orgScopeAlive(periodLocks, data.orgId),
          eq(periodLocks.domain, data.domain),
          eq(periodLocks.periodYear, data.periodYear),
          data.periodMonth == null
            ? isNull(periodLocks.periodMonth)
            : eq(periodLocks.periodMonth, data.periodMonth),
          isNull(periodLocks.unlockedAt)
        )
      )
      .limit(1);

    if (!existing[0]) {
      throw new Error("Period lock already exists but could not be loaded");
    }
    return existing[0].id;
  }

  await auditMutation(
    {
      orgId: data.orgId,
      entityType: data.entityType ?? "period_lock",
      entityId: data.entityId ?? lock.id,
      action: "create",
      actorId: isAuditActorId(data.lockedByUserId)
        ? data.lockedByUserId
        : undefined,
      newValue: {
        lockId: lock.id,
        domain: data.domain,
        periodYear: data.periodYear,
        periodMonth: data.periodMonth ?? null,
        lockReason: data.lockReason,
        auditContext: {
          event: "period_lock_created",
          actorUserId: data.lockedByUserId,
          targetEntityType: data.entityType ?? "period_lock",
          targetEntityId: data.entityId ?? lock.id,
        },
      },
    },
    conn
  );

  return lock.id;
}
