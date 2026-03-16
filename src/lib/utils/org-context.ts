import { cookies } from "next/headers";

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
