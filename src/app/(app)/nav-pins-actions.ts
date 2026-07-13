"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/utils/auth";
import { getVerifiedOrgId } from "@/lib/utils/org-context";
import { pinItem, unpinItem } from "@/lib/db/queries/user-nav-pins";
import { auditMutation } from "@/lib/db/helpers/audit-log";
import { isKnownNavHref } from "@/lib/nav/pins";

export async function pinNavItemAction(href: string) {
  const [user, orgId] = await Promise.all([
    getCurrentUser(),
    getVerifiedOrgId(),
  ]);
  if (!user) return { error: "Not authenticated" };
  if (!orgId) return { error: "No active organization" };

  if (typeof href !== "string" || !isKnownNavHref(href)) {
    return { error: "Unknown navigation item" };
  }

  const pin = await pinItem(orgId, user.id, href);
  // null = already pinned (idempotent no-op) — nothing to audit.
  if (pin) {
    await auditMutation({
      orgId,
      entityType: "user_nav_pin",
      entityId: pin.id,
      action: "create",
      newValue: { href: pin.href, position: pin.position, userId: user.id },
      actorId: user.id,
    });
  }

  revalidatePath("/", "layout");
  return { success: true };
}

export async function unpinNavItemAction(href: string) {
  const [user, orgId] = await Promise.all([
    getCurrentUser(),
    getVerifiedOrgId(),
  ]);
  if (!user) return { error: "Not authenticated" };
  if (!orgId) return { error: "No active organization" };

  // No isKnownNavHref check: stale pins to removed routes must stay removable.
  const removed = await unpinItem(orgId, user.id, typeof href === "string" ? href : "");
  if (removed) {
    await auditMutation({
      orgId,
      entityType: "user_nav_pin",
      entityId: removed.id,
      action: "delete",
      oldValue: { href: removed.href, position: removed.position, userId: user.id },
      actorId: user.id,
    });
  }

  revalidatePath("/", "layout");
  return { success: true };
}
