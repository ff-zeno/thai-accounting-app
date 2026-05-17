import { getCurrentUser } from "./auth";
import { getVerifiedOrgId } from "./org-context";
import { db } from "@/lib/db";
import { orgMemberships } from "@/lib/db/schema";
import { and, eq, isNull } from "drizzle-orm";

type OrgAdminRole = "owner" | "admin" | "accountant";

/**
 * Require the current user to be an admin, owner, or accountant of their active org.
 * Throws if not authorized.
 *
 * Returns { orgId, userId, role } for convenience in server components/actions.
 */
export async function requireOrgAdmin(): Promise<{
  orgId: string;
  userId: string;
  role: OrgAdminRole;
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

  return { orgId, userId: user.id, role: membership.role as OrgAdminRole };
}

/**
 * Require owner/admin privileges for security-sensitive org configuration.
 */
export async function requireOrgOwnerOrAdmin(): Promise<{
  orgId: string;
  userId: string;
  role: "owner" | "admin";
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

  if (!membership || !["owner", "admin"].includes(membership.role ?? "")) {
    throw new Error("Owner or admin access required");
  }

  return { orgId, userId: user.id, role: membership.role as "owner" | "admin" };
}
