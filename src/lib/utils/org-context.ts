import { cookies } from "next/headers";
import { isUserMemberOfOrg } from "@/lib/db/queries/organizations";
import { getCurrentUser } from "./auth";

const ORG_COOKIE = "active_org_id";

export async function getActiveOrgId(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(ORG_COOKIE)?.value ?? null;
}

export async function setActiveOrgId(orgId: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(ORG_COOKIE, orgId, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365, // 1 year
  });
}

/**
 * Get the active org ID only if the current user is a member.
 * Use this in server actions to enforce org membership.
 * Returns null if no active org, no user, or user lacks access.
 */
export async function getVerifiedOrgId(): Promise<string | null> {
  const [orgId, user] = await Promise.all([
    getActiveOrgId(),
    getCurrentUser(),
  ]);

  if (!orgId || !user) return null;

  const hasAccess = await isUserMemberOfOrg(user.id, orgId);
  return hasAccess ? orgId : null;
}
