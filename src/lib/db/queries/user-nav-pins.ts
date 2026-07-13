import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "../index";
import { userNavPins } from "../schema";
import { orgScopeAlive } from "../helpers/org-scope";

export type UserNavPin = typeof userNavPins.$inferSelect;

/** List a user's pins for an org, in pin order (position, then pin time). */
export async function listPins(
  orgId: string,
  userId: string
): Promise<UserNavPin[]> {
  return db
    .select()
    .from(userNavPins)
    .where(
      and(...orgScopeAlive(userNavPins, orgId), eq(userNavPins.userId, userId))
    )
    .orderBy(asc(userNavPins.position), asc(userNavPins.createdAt));
}

/**
 * Pin a nav item for a user. Position appends at the end (max + 1).
 * Idempotent: re-pinning an existing href hits the unique
 * (org_id, user_id, href) index and is a no-op — returns null.
 */
export async function pinItem(
  orgId: string,
  userId: string,
  href: string
): Promise<UserNavPin | null> {
  const [pin] = await db
    .insert(userNavPins)
    .values({
      orgId,
      userId,
      href,
      position: sql`COALESCE((SELECT MAX(${userNavPins.position}) + 1 FROM ${userNavPins} WHERE ${userNavPins.orgId} = ${orgId} AND ${userNavPins.userId} = ${userId}), 0)`,
    })
    .onConflictDoNothing()
    .returning();
  return pin ?? null;
}

/**
 * Remove a user's pin by href. Returns the removed row, or null when the
 * pin did not exist. Pins are UI preferences, not financial records — hard
 * delete is intentional (the table has no deleted_at).
 */
export async function unpinItem(
  orgId: string,
  userId: string,
  href: string
): Promise<UserNavPin | null> {
  const [removed] = await db
    .delete(userNavPins)
    .where(
      and(
        ...orgScopeAlive(userNavPins, orgId),
        eq(userNavPins.userId, userId),
        eq(userNavPins.href, href)
      )
    )
    .returning();
  return removed ?? null;
}
