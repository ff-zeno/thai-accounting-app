import { getCurrentUser } from "./auth";
import { getVerifiedOrgId } from "./org-context";
import { db } from "@/lib/db";
import { orgMemberships } from "@/lib/db/schema";
import { and, eq, isNull } from "drizzle-orm";

/**
 * Require the current user to be an admin, owner, or accountant of their active org.
 * Throws if not authorized.
 *
 * Returns { orgId, userId } for convenience in server components/actions.
 */
export async function requireOrgAdmin(): Promise<{
  orgId: string;
  userId: string;
}> {
  const [orgId, user] = await Promise.all([
    getVerifiedOrgId(),
    getCurrentUser(),
  ]);

  if (!orgId || !user) {
    throw new Error("Not authenticated");
  }

  const [membership] = await db
    .select({ role: orgMemberships.role })
    .from(orgMemberships)
    .where(
      and(
        eq(orgMemberships.orgId, orgId),
        eq(orgMemberships.userId, user.id),
        isNull(orgMemberships.deletedAt)
      )
    )
    .limit(1);

  if (!membership || !["admin", "owner", "accountant"].includes(membership.role ?? "")) {
    throw new Error("Admin or accountant access required");
  }

  return { orgId, userId: user.id };
}
